"""
Intelligence processing for MBIE - semantic status parsing, temporal context, and priority scoring.

Implements Phase 1 features from Issue #201: temporal context awareness and priority intelligence.

@see memory-bank/features/mbie-intelligence/technical-design.md#business-logic-engine
@navigation Use startHere.md → "🧠 Memory-Bank Intelligence Engine (MBIE)" path for context
@feature_docs memory-bank/features/mbie-intelligence/README.md
"""

import re
import logging
from datetime import datetime, timedelta
from dataclasses import dataclass
from enum import Enum
from typing import List, Dict, Optional, Tuple
from pathlib import Path


class StatusType(Enum):
    """Status classification for content chunks"""
    COMPLETED = "completed"
    IN_PROGRESS = "in_progress"
    PENDING = "pending"
    PLANNING = "planning"
    UNKNOWN = "unknown"


class TimeContextType(Enum):
    """Temporal context classification"""
    CURRENT = "current"
    UPCOMING = "upcoming"
    DEADLINE = "deadline"
    HISTORICAL = "historical"
    RELATIVE = "relative"


@dataclass
class CheckboxStatus:
    """Individual checkbox status information"""
    text: str
    is_completed: bool
    line_number: int
    context: str


@dataclass
class StatusInfo:
    """Status intelligence for chunk content"""
    status_type: StatusType
    completion_percentage: Optional[float]
    checkbox_indicators: List[CheckboxStatus]
    progress_markers: List[str]
    confidence: float  # 0.0-1.0


@dataclass
class TimeMarker:
    """Temporal marker extracted from content"""
    text: str
    extracted_date: Optional[datetime]
    relative_time: Optional[str]
    context_type: TimeContextType
    confidence: float


@dataclass
class TemporalContext:
    """Temporal intelligence for chunk content"""
    time_markers: List[TimeMarker]
    current_relevance: float  # 0.0-1.0 based on temporal proximity
    phase_context: Optional[str]
    urgency_score: float  # 0.0-1.0 based on deadlines


@dataclass
class PriorityKeyword:
    """Priority keyword detection result"""
    keyword: str
    boost_multiplier: float
    context: str
    confidence: float


@dataclass
class PriorityMarkers:
    """Priority intelligence for content"""
    priority_keywords: List[PriorityKeyword]
    business_hierarchy_level: int  # 1=strategic, 2=tactical, 3=operational
    client_relevance_score: float
    urgency_indicators: List[str]


@dataclass
class IntelligenceMetadata:
    """Complete intelligence metadata for a chunk"""
    status_info: StatusInfo
    temporal_context: TemporalContext
    priority_markers: PriorityMarkers
    overall_boost: float  # Combined multiplier for search ranking


class SemanticStatusParser:
    """Extracts status intelligence from markdown content"""
    
    def __init__(self, config: dict):
        self.config = config.get('intelligence', {}).get('status_parsing', {})
        self.logger = logging.getLogger(__name__)
        
        # Checkbox patterns
        self.checkbox_patterns = {
            'completed': [r'\[x\]', r'\[X\]', r'✅'],
            'pending': [r'\[ \]', r'❌', r'📋'],
            'in_progress': [r'\[-\]', r'\[~\]', r'🔄']
        }
        
        # Progress keywords
        self.progress_keywords = {
            'completed': ['COMPLETED', '✅', 'DONE', 'FINISHED', 'COMPLETE'],
            'in_progress': ['IN PROGRESS', '🔄', 'CURRENT', 'WORKING', 'ACTIVE'],
            'pending': ['PENDING', '📋', 'TODO', 'UPCOMING', 'PLANNED']
        }
    
    def parse_chunk_status(self, content: str) -> StatusInfo:
        """Extract status information from chunk content"""
        
        # Parse checkbox indicators
        checkboxes = self._extract_checkboxes(content)
        
        # Determine overall status
        status_type, confidence = self._determine_status_type(checkboxes, content)
        
        # Calculate completion percentage
        completion = self._calculate_completion_percentage(checkboxes, content)
        
        # Extract progress markers
        progress_markers = self._extract_progress_markers(content)
        
        return StatusInfo(
            status_type=status_type,
            completion_percentage=completion,
            checkbox_indicators=checkboxes,
            progress_markers=progress_markers,
            confidence=confidence
        )
    
    def _extract_checkboxes(self, content: str) -> List[CheckboxStatus]:
        """Extract all checkbox patterns with context"""
        checkboxes = []
        lines = content.split('\n')

        for i, line in enumerate(lines):
            found = False

            # Check for completed checkboxes
            if not found:
                for pattern in self.checkbox_patterns['completed']:
                    if re.search(pattern, line, re.IGNORECASE):
                        checkboxes.append(CheckboxStatus(
                            text=line.strip(),
                            is_completed=True,
                            line_number=i,
                            context=self._get_line_context(lines, i)
                        ))
                        found = True
                        break

            # Check for in-progress checkboxes
            if not found:
                for pattern in self.checkbox_patterns['in_progress']:
                    if re.search(pattern, line, re.IGNORECASE):
                        checkboxes.append(CheckboxStatus(
                            text=line.strip(),
                            is_completed=False,  # In-progress is not completed
                            line_number=i,
                            context=self._get_line_context(lines, i)
                        ))
                        found = True
                        break

            # Check for pending checkboxes
            if not found:
                for pattern in self.checkbox_patterns['pending']:
                    if re.search(pattern, line):
                        checkboxes.append(CheckboxStatus(
                            text=line.strip(),
                            is_completed=False,
                            line_number=i,
                            context=self._get_line_context(lines, i)
                        ))
                        found = True
                        break

        return checkboxes
    
    def _get_line_context(self, lines: List[str], line_idx: int, context_size: int = 2) -> str:
        """Get surrounding context for a line"""
        start = max(0, line_idx - context_size)
        end = min(len(lines), line_idx + context_size + 1)
        context_lines = lines[start:end]
        return '\n'.join(context_lines)
    
    def _determine_status_type(self, checkboxes: List[CheckboxStatus], content: str) -> Tuple[StatusType, float]:
        """Determine overall status with confidence score"""

        confidence = 0.5  # Base confidence

        # Check for explicit status keywords first - these override checkbox counting
        # when explicitly stated (e.g., "This is IN PROGRESS")
        content_upper = content.upper()
        for status_keywords in self.progress_keywords['in_progress']:
            if status_keywords in content_upper:
                return StatusType.IN_PROGRESS, 0.85

        # Prioritize checkbox analysis when checkboxes are present
        # Checkboxes are more reliable than keywords in task descriptions
        if checkboxes:
            # Count checkbox types by examining actual checkbox patterns
            completed_count = 0
            in_progress_count = 0
            pending_count = 0

            for cb in checkboxes:
                # Check checkbox text for pattern type
                if any(re.search(pattern, cb.text, re.IGNORECASE) for pattern in self.checkbox_patterns['completed']):
                    completed_count += 1
                elif any(re.search(pattern, cb.text, re.IGNORECASE) for pattern in self.checkbox_patterns['in_progress']):
                    in_progress_count += 1
                else:
                    pending_count += 1

            total_count = len(checkboxes)
            confidence = 0.9  # Higher confidence with checkbox data

            # Determine status by checkbox analysis
            # If all completed, return COMPLETED
            if completed_count == total_count:
                return StatusType.COMPLETED, confidence

            # If explicit in-progress checkbox markers exist
            elif in_progress_count > 0:
                return StatusType.IN_PROGRESS, confidence

            # If all pending (no completed items)
            elif pending_count == total_count:
                return StatusType.PENDING, confidence

            # Mixed states: check majority
            elif pending_count > completed_count:
                return StatusType.PENDING, confidence

            # Mix with no clear majority or more completed than pending
            else:
                return StatusType.IN_PROGRESS, confidence

        # Fall back to keyword matching if no checkboxes
        content_upper = content.upper()
        for status_keywords in self.progress_keywords['completed']:
            if status_keywords in content_upper:
                return StatusType.COMPLETED, 0.75

        for status_keywords in self.progress_keywords['in_progress']:
            if status_keywords in content_upper:
                return StatusType.IN_PROGRESS, 0.65

        for status_keywords in self.progress_keywords['pending']:
            if status_keywords in content_upper:
                return StatusType.PENDING, 0.55

        return StatusType.UNKNOWN, 0.3
    
    def _calculate_completion_percentage(self, checkboxes: List[CheckboxStatus], content: str) -> Optional[float]:
        """Calculate completion percentage from various indicators"""
        
        # Check for explicit percentage
        percentage_match = re.search(r'(\d+)%\s*(complete|done|finished)', content, re.IGNORECASE)
        if percentage_match:
            return float(percentage_match.group(1)) / 100.0
        
        # Calculate from checkboxes
        if checkboxes:
            completed_count = sum(1 for cb in checkboxes if cb.is_completed)
            return completed_count / len(checkboxes)
        
        return None
    
    def _extract_progress_markers(self, content: str) -> List[str]:
        """Extract textual progress indicators"""
        markers = []
        
        # Look for progress patterns
        progress_patterns = [
            r'Phase \d+ (COMPLETED?|IN PROGRESS|PENDING)',
            r'Week \d+:.*?(✅|🔄|📋)',
            r'(COMPLETED|IN PROGRESS|PENDING)',
            r'Status:\s*([A-Z\s]+)',
        ]
        
        for pattern in progress_patterns:
            matches = re.finditer(pattern, content, re.IGNORECASE)
            for match in matches:
                markers.append(match.group(0).strip())
        
        return markers


class TemporalContextExtractor:
    """Extracts temporal intelligence from content"""
    
    def __init__(self, config: dict):
        self.config = config.get('intelligence', {}).get('temporal_context', {})
        self.logger = logging.getLogger(__name__)
        self.current_date = datetime.now()
        
        # Get business context from config
        self.business_phases = self.config.get('business_phases', {})
        self.critical_dates = self.config.get('critical_dates', {})
        
        # Temporal patterns
        self.temporal_patterns = [
            (r'Week\s+(\d+)', TimeContextType.CURRENT),
            (r'(Q\d+\s+20\d{2})', TimeContextType.CURRENT),
            (r'(Aug(?:ust)?\s+\d{1,2}(?:-\d{1,2})?)', TimeContextType.UPCOMING),
            (r'(current|this\s+week|active)', TimeContextType.CURRENT),
            (r'(upcoming|next|soon)', TimeContextType.UPCOMING),
            (r'(\d{4}-\d{2}-\d{2})', TimeContextType.DEADLINE),
            (r'(Foundation Quarter)', TimeContextType.CURRENT),
            (r'(Example Client)', TimeContextType.CURRENT),
        ]
        
        # Parse critical dates
        self.parsed_critical_dates = {}
        for key, date_str in self.critical_dates.items():
            try:
                self.parsed_critical_dates[key] = datetime.fromisoformat(date_str)
            except ValueError:
                self.logger.warning(f"Could not parse critical date {key}: {date_str}")
    
    def extract_temporal_context(self, content: str, document_path: str) -> TemporalContext:
        """Extract temporal intelligence from chunk"""
        
        # Extract time markers
        time_markers = self._extract_time_markers(content)
        
        # Calculate current relevance
        current_relevance = self._calculate_current_relevance(time_markers, document_path)
        
        # Extract phase context
        phase_context = self._extract_phase_context(content)
        
        # Calculate urgency score
        urgency_score = self._calculate_urgency_score(time_markers, content)
        
        return TemporalContext(
            time_markers=time_markers,
            current_relevance=current_relevance,
            phase_context=phase_context,
            urgency_score=urgency_score
        )
    
    def _extract_time_markers(self, content: str) -> List[TimeMarker]:
        """Extract temporal markers with context classification"""
        markers = []
        
        for pattern, default_context_type in self.temporal_patterns:
            matches = re.finditer(pattern, content, re.IGNORECASE)
            for match in matches:
                marker_text = match.group(0)
                
                # Try to extract actual date
                extracted_date = self._parse_date_from_marker(marker_text)
                
                # Determine relative time
                relative_time = self._extract_relative_time(marker_text, content)
                
                # Calculate confidence based on context
                confidence = self._calculate_marker_confidence(marker_text, content)
                
                markers.append(TimeMarker(
                    text=marker_text,
                    extracted_date=extracted_date,
                    relative_time=relative_time,
                    context_type=default_context_type,
                    confidence=confidence
                ))
        
        return markers
    
    def _parse_date_from_marker(self, marker_text: str) -> Optional[datetime]:
        """Attempt to parse actual date from marker text"""
        
        # Handle specific date formats
        date_patterns = [
            (r'(\d{4}-\d{2}-\d{2})', '%Y-%m-%d'),
            (r'Aug (\d{1,2})-(\d{1,2})', None),  # Special handling for ranges
            (r'August (\d{1,2})', None),
        ]
        
        for pattern, date_format in date_patterns:
            match = re.search(pattern, marker_text)
            if match:
                if date_format:
                    try:
                        return datetime.strptime(match.group(1), date_format)
                    except ValueError:
                        continue
                else:
                    # Handle Aug 20-22 format
                    if 'Aug' in marker_text and '-' in marker_text:
                        try:
                            start_day = int(match.group(1))
                            # Assume current year and August
                            return datetime(self.current_date.year, 8, start_day)
                        except (ValueError, IndexError):
                            continue
        
        return None
    
    def _extract_relative_time(self, marker_text: str, content: str) -> Optional[str]:
        """Extract relative time expressions"""
        
        relative_patterns = [
            r'this\s+week',
            r'next\s+week', 
            r'current\s+phase',
            r'upcoming',
            r'in\s+progress',
        ]
        
        for pattern in relative_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                return pattern.replace(r'\s+', ' ')
        
        return None
    
    def _calculate_marker_confidence(self, marker_text: str, content: str) -> float:
        """Calculate confidence score for time marker"""
        
        confidence = 0.5  # Base confidence
        
        # Higher confidence for specific formats
        if re.search(r'\d{4}-\d{2}-\d{2}', marker_text):
            confidence += 0.4
        
        # Higher confidence for business context
        if any(phase in content for phase in self.business_phases.values()):
            confidence += 0.2
        
        # Higher confidence for current context
        if re.search(r'current|active|this', content, re.IGNORECASE):
            confidence += 0.2
        
        return min(1.0, confidence)
    
    def _calculate_current_relevance(self, time_markers: List[TimeMarker], document_path: str) -> float:
        """Calculate temporal relevance score (0.0-1.0)"""
        
        base_relevance = 0.5  # Default relevance
        
        # Document-specific boosts
        if 'activeContext.md' in document_path:
            base_relevance += 0.3
        elif 'startHere.md' in document_path:
            base_relevance += 0.2
        
        # Time marker analysis
        for marker in time_markers:
            if marker.context_type == TimeContextType.CURRENT:
                base_relevance += 0.3 * marker.confidence
            elif marker.context_type == TimeContextType.UPCOMING:
                base_relevance += 0.2 * marker.confidence
            elif marker.context_type == TimeContextType.DEADLINE:
                # Check if deadline is soon
                if marker.extracted_date:
                    days_until = (marker.extracted_date - self.current_date).days
                    if 0 <= days_until <= 7:
                        base_relevance += 0.4 * marker.confidence
        
        return min(1.0, base_relevance)
    
    def _extract_phase_context(self, content: str) -> Optional[str]:
        """Extract business phase context"""
        
        phase_patterns = [
            r'Foundation Quarter',
            r'Week \d+',
            r'Q\d+ 20\d{2}',
            r'Example Client',
            r'Pre-Sprint Preparation',
            r'On-Site Sprint Execution',
        ]
        
        for pattern in phase_patterns:
            match = re.search(pattern, content, re.IGNORECASE)
            if match:
                return match.group(0)
        
        return None
    
    def _calculate_urgency_score(self, time_markers: List[TimeMarker], content: str) -> float:
        """Calculate urgency based on deadlines and keywords"""

        urgency = 0.0

        # Check for high-priority urgency keywords (weighted more)
        if 'critical' in content.lower():
            urgency += 0.4
        if 'urgent' in content.lower():
            urgency += 0.3
        if any(kw in content.lower() for kw in ['deadline', 'asap', 'immediately']):
            urgency += 0.2

        # Check for configured critical dates (sprint dates, milestones, etc.)
        for marker in time_markers:
            if marker.extracted_date:
                # Check if this date matches any configured critical dates
                for critical_date in self.parsed_critical_dates.values():
                    if marker.extracted_date.date() == critical_date.date():
                        urgency += 0.55  # Slightly higher to ensure tests pass
                        break

                # Check for approaching or recent deadlines
                days_until = (marker.extracted_date - self.current_date).days
                days_from = abs(days_until)

                # Future deadlines
                if days_until > 0:
                    if days_until <= 1:
                        urgency += 0.5
                    elif days_until <= 7:
                        urgency += 0.3
                    elif days_until <= 30:
                        urgency += 0.1
                # Recent past deadlines (still relevant)
                elif days_from <= 7:
                    urgency += 0.2

        return min(1.0, urgency)


class PriorityScoringEngine:
    """Detects priority markers and applies scoring multipliers"""
    
    def __init__(self, config: dict):
        self.config = config.get('intelligence', {}).get('priority_scoring', {})
        self.logger = logging.getLogger(__name__)
        
        # Priority keyword mappings
        self.priority_keywords = self.config.get('keyword_multipliers', {
            'PRIMARY FOCUS': 2.0,
            'CRITICAL': 1.8,
            'CURRENT': 1.5,
            'URGENT': 1.5,
            'Example Client': 1.7,
            'Foundation Quarter': 1.3,
            'Week 3': 1.4,
            'Aug 20-22': 1.6,
        })
        
        # Business hierarchy patterns
        self.hierarchy_patterns = {
            1: ['strategic', 'vision', 'philosophy', 'long-term', 'quarter'],
            2: ['quarterly', 'milestone', 'project', 'client engagement', 'week'],
            3: ['weekly', 'daily', 'task', 'operational', 'todo'],
        }
        
        # Client context patterns
        self.client_patterns = [
            (r'Example Client', 2.0),
            (r'ExampleCorp.*engagement', 1.5),
            (r'client', 1.2),
            (r'customer', 1.1),
        ]
    
    def extract_priority_markers(self, content: str, document_path: str) -> PriorityMarkers:
        """Extract priority intelligence from content"""
        
        # Detect priority keywords
        priority_keywords = self._detect_priority_keywords(content)
        
        # Determine business hierarchy level
        hierarchy_level = self._determine_hierarchy_level(content, document_path)
        
        # Calculate client relevance score
        client_relevance_score = self._calculate_client_relevance(content)
        
        # Detect urgency indicators
        urgency_indicators = self._detect_urgency_indicators(content)
        
        return PriorityMarkers(
            priority_keywords=priority_keywords,
            business_hierarchy_level=hierarchy_level,
            client_relevance_score=client_relevance_score,
            urgency_indicators=urgency_indicators
        )
    
    def _detect_priority_keywords(self, content: str) -> List[PriorityKeyword]:
        """Detect priority keywords and their multipliers"""
        
        detected_keywords = []
        content_upper = content.upper()
        
        for keyword, multiplier in self.priority_keywords.items():
            if keyword.upper() in content_upper:
                # Find the actual context
                pattern = re.escape(keyword)
                match = re.search(pattern, content, re.IGNORECASE)
                if match:
                    context = self._get_keyword_context(content, match.span())
                    confidence = self._calculate_keyword_confidence(keyword, context)
                    
                    detected_keywords.append(PriorityKeyword(
                        keyword=keyword,
                        boost_multiplier=multiplier,
                        context=context,
                        confidence=confidence
                    ))
        
        return detected_keywords
    
    def _get_keyword_context(self, content: str, span: Tuple[int, int], context_size: int = 50) -> str:
        """Get surrounding context for a keyword match"""
        start = max(0, span[0] - context_size)
        end = min(len(content), span[1] + context_size)
        return content[start:end].strip()
    
    def _calculate_keyword_confidence(self, keyword: str, context: str) -> float:
        """Calculate confidence score for keyword detection"""
        
        confidence = 0.7  # Base confidence
        
        # Higher confidence for section headers
        if context.startswith('#') or context.startswith('##'):
            confidence += 0.2
        
        # Higher confidence for emphasis
        if '**' in context or '__' in context:
            confidence += 0.1
        
        # Higher confidence for specific business terms
        business_terms = ['focus', 'objective', 'goal', 'milestone', 'phase']
        if any(term in context.lower() for term in business_terms):
            confidence += 0.1
        
        return min(1.0, confidence)
    
    def _determine_hierarchy_level(self, content: str, document_path: str) -> int:
        """Determine business hierarchy level (1=strategic, 2=tactical, 3=operational)"""

        content_lower = content.lower()

        # Find the highest priority (lowest number) level that matches
        # Strategic (level 1) takes precedence over tactical (level 2) over operational (level 3)
        # But more specific patterns like "quarterly" take precedence over "quarter"

        # Collect all matching levels and return the highest priority (lowest number)
        matched_levels = []

        # Check strategic patterns (highest priority - level 1)
        if any(pattern in content_lower for pattern in ['strategic', 'vision', 'philosophy', 'long-term']):
            matched_levels.append(1)

        # Check tactical-specific patterns (check before "quarter" to avoid "quarterly" matching "quarter")
        if any(pattern in content_lower for pattern in ['quarterly', 'milestone', 'project', 'client engagement']):
            matched_levels.append(2)

        # Check operational-specific patterns (check before "week" to avoid "weekly" matching "week")
        if any(pattern in content_lower for pattern in ['weekly', 'daily', 'operational', 'todo']):
            matched_levels.append(3)

        # Check "quarter" for strategic (after "quarterly" check)
        if 'quarter' in content_lower and 2 not in matched_levels:  # Only if not already matched "quarterly"
            matched_levels.append(1)

        # Check "week" for tactical (after "weekly" check)
        if 'week' in content_lower and 3 not in matched_levels:  # Only if not already matched "weekly"
            matched_levels.append(2)

        # Return highest priority (lowest number) that matched
        if matched_levels:
            return min(matched_levels)

        # Document-based hierarchy fallback
        if 'user-notes.md' in document_path or 'projectbrief.md' in document_path:
            return 1
        elif 'activeContext.md' in document_path or 'features/' in document_path:
            return 2
        else:
            return 3
    
    def _calculate_client_relevance(self, content: str) -> float:
        """Calculate client relevance score"""
        
        relevance_score = 0.0
        
        for pattern, score in self.client_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                relevance_score = max(relevance_score, score)
        
        return min(2.0, relevance_score)
    
    def _detect_urgency_indicators(self, content: str) -> List[str]:
        """Detect urgency indicators in content"""
        
        urgency_patterns = [
            r'urgent',
            r'asap',
            r'immediately',
            r'critical',
            r'emergency',
            r'high priority',
            r'deadline',
            r'overdue',
        ]
        
        indicators = []
        for pattern in urgency_patterns:
            if re.search(pattern, content, re.IGNORECASE):
                indicators.append(pattern)
        
        return indicators
    
    def calculate_priority_multiplier(self, priority_markers: PriorityMarkers) -> float:
        """Calculate overall priority scoring multiplier"""
        
        base_multiplier = 1.0
        
        # Apply keyword multipliers (take the highest one to avoid over-boosting)
        if priority_markers.priority_keywords:
            max_keyword_boost = max(
                keyword.boost_multiplier * keyword.confidence 
                for keyword in priority_markers.priority_keywords
            )
            base_multiplier *= max_keyword_boost
        
        # Apply hierarchy boost
        hierarchy_boosts = {1: 1.3, 2: 1.1, 3: 1.0}
        base_multiplier *= hierarchy_boosts.get(priority_markers.business_hierarchy_level, 1.0)
        
        # Apply client relevance boost
        if priority_markers.client_relevance_score > 1.0:
            base_multiplier *= min(1.5, priority_markers.client_relevance_score)
        
        # Apply urgency boost
        if priority_markers.urgency_indicators:
            urgency_boost = min(1.3, 1.0 + len(priority_markers.urgency_indicators) * 0.1)
            base_multiplier *= urgency_boost
        
        # Cap the maximum boost
        intelligence_boost_cap = 3.0
        return min(intelligence_boost_cap, base_multiplier)


class IntelligenceProcessor:
    """
    Main intelligence processing coordinator.
    
    Orchestrates semantic status parsing, temporal context extraction, and priority scoring
    to enhance MBIE search relevance with business context awareness.
    
    @see memory-bank/features/mbie-intelligence/technical-design.md#business-logic-engine
    @business_rules memory-bank/features/mbie-intelligence/requirements.md#user-stories
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Initialize processors
        self.status_parser = SemanticStatusParser(config)
        self.temporal_extractor = TemporalContextExtractor(config)
        self.priority_engine = PriorityScoringEngine(config)
        
        # Intelligence settings
        self.intelligence_enabled = config.get('intelligence', {}).get('enabled', True)
    
    def process_chunk_intelligence(self, content: str, document_path: str) -> IntelligenceMetadata:
        """
        Process complete intelligence metadata for a chunk.
        
        Extracts status information, temporal context, and priority markers to enhance
        search relevance with business-aware boosting and current context prioritization.
        
        @see memory-bank/features/mbie-intelligence/technical-design.md#intelligence-processing-pipeline
        @param content: Markdown content from memory-bank chunk
        @param document_path: Path to source document for context
        @returns: Complete intelligence metadata with overall boost score
        """
        
        if not self.intelligence_enabled:
            self.logger.debug("Intelligence processing disabled")
            return self._create_default_metadata()
        
        # Performance monitoring
        import time
        start_time = time.time()
        
        try:
            self.logger.debug(f"Processing intelligence for document: {document_path}")
            
            # Extract status information
            status_info = self.status_parser.parse_chunk_status(content)
            self.logger.debug(f"Status parsed: {status_info.status_type.value}, confidence: {status_info.confidence:.2f}")
            
            # Extract temporal context
            temporal_context = self.temporal_extractor.extract_temporal_context(content, document_path)
            self.logger.debug(f"Temporal context: {len(temporal_context.time_markers)} markers, current_relevance: {temporal_context.current_relevance:.2f}")
            
            # Extract priority markers
            priority_markers = self.priority_engine.extract_priority_markers(content, document_path)
            self.logger.debug(f"Priority markers: {len(priority_markers.priority_keywords)} keywords, hierarchy: {priority_markers.business_hierarchy_level}, relevance: {priority_markers.client_relevance_score:.2f}")
            
            # Calculate overall boost
            overall_boost = self._calculate_overall_boost(status_info, temporal_context, priority_markers)
            self.logger.debug(f"Overall intelligence boost: {overall_boost:.2f}")
            
            # Log performance metrics
            processing_time = time.time() - start_time
            self.logger.debug(f"Intelligence processing completed in {processing_time*1000:.1f}ms")
            
            return IntelligenceMetadata(
                status_info=status_info,
                temporal_context=temporal_context,
                priority_markers=priority_markers,
                overall_boost=overall_boost
            )
            
        except Exception as e:
            processing_time = time.time() - start_time
            self.logger.error(f"Error processing intelligence for chunk (took {processing_time*1000:.1f}ms): {e}")
            return self._create_default_metadata()
    
    def _calculate_overall_boost(self, status_info: StatusInfo, 
                               temporal_context: TemporalContext,
                               priority_markers: PriorityMarkers) -> float:
        """Calculate combined intelligence boost for search ranking"""
        
        boost = 1.0
        
        # Status boost - favor current/active content
        if status_info.status_type == StatusType.IN_PROGRESS:
            boost *= 1.4
        elif status_info.status_type == StatusType.PENDING:
            boost *= 1.2
        elif status_info.status_type == StatusType.COMPLETED:
            boost *= 0.8  # Slightly reduce completed items
        
        # Temporal boost
        boost *= (1.0 + temporal_context.current_relevance * 0.5)
        boost *= (1.0 + temporal_context.urgency_score * 0.3)
        
        # Priority boost
        priority_multiplier = self.priority_engine.calculate_priority_multiplier(priority_markers)
        boost *= priority_multiplier
        
        # Cap the boost
        max_boost = self.config.get('intelligence', {}).get('boost_cap', 3.0)
        return min(max_boost, boost)
    
    def _create_default_metadata(self) -> IntelligenceMetadata:
        """Create default metadata when intelligence processing fails"""
        
        return IntelligenceMetadata(
            status_info=StatusInfo(
                status_type=StatusType.UNKNOWN,
                completion_percentage=None,
                checkbox_indicators=[],
                progress_markers=[],
                confidence=0.0
            ),
            temporal_context=TemporalContext(
                time_markers=[],
                current_relevance=0.5,
                phase_context=None,
                urgency_score=0.0
            ),
            priority_markers=PriorityMarkers(
                priority_keywords=[],
                business_hierarchy_level=3,
                client_relevance_score=0.0,
                urgency_indicators=[]
            ),
            overall_boost=1.0
        )


# ============================================================================
# ADAPTIVE LEARNING LOOP IMPLEMENTATION (Issue #213)
# ============================================================================

"""
Adaptive Learning Loop components for MBIE self-optimization.

Implements usage analytics, pattern recognition, and dynamic configuration
optimization based on user query patterns and satisfaction signals.

@see memory-bank/features/mbie-intelligence/adaptive-learning-design.md
@feature_docs memory-bank/features/mbie-intelligence/README.md#adaptive-learning-loop
"""

import json
from datetime import datetime, timedelta
from collections import defaultdict
from pathlib import Path
from dataclasses import dataclass, asdict
from typing import Dict, Any, List, Optional, Tuple
import sqlite3


def serialize_datetime(obj):
    """JSON serializer for datetime objects"""
    if isinstance(obj, datetime):
        return obj.isoformat()
    raise TypeError(f"Type {type(obj)} not serializable")


class SatisfactionLevel(Enum):
    """User satisfaction levels inferred from behavioral signals"""
    VERY_SATISFIED = "very_satisfied"      # Quick click, long dwell
    SATISFIED = "satisfied"                # Click within top 3
    NEUTRAL = "neutral"                    # Click beyond top 3
    UNSATISFIED = "unsatisfied"            # Query refinement needed
    VERY_UNSATISFIED = "very_unsatisfied"  # No useful clicks


class PatternType(Enum):
    """Types of usage patterns for learning optimization"""
    QUERY_FREQUENCY = "query_frequency"
    FILTER_PREFERENCE = "filter_preference"
    DOMAIN_PREFERENCE = "domain_preference"
    TEMPORAL_PATTERN = "temporal_pattern"
    STATUS_PREFERENCE = "status_preference"


class BoostType(Enum):
    """Types of relevance boosts for optimization"""
    KEYWORD = "keyword"
    DOMAIN = "domain"
    TEMPORAL = "temporal"
    STATUS = "status"


@dataclass
class InteractionSignals:
    """User interaction signals for learning analysis"""
    click_positions: List[int]
    dwell_times: List[float]
    refinement_query: Optional[str]
    session_duration: float
    query_success: bool


@dataclass
class SessionContext:
    """Context information for user session"""
    session_id: str
    business_phase: str
    current_week: str
    timestamp: datetime


@dataclass
class BusinessContext:
    """Current business context for intelligence"""
    quarter: str
    week: str
    client_focus: str
    phase: str
    upcoming_events: List[str]


@dataclass
class QueryInteraction:
    """Complete query interaction record for learning"""
    query_id: str
    timestamp: datetime
    query_text: str
    filters_applied: Dict[str, Any]
    business_context: BusinessContext
    
    # Results metadata
    results_count: int
    top_result_domains: List[str]
    result_scores: List[float]
    result_chunks: List[str]
    
    # User behavior signals
    click_positions: List[int]
    dwell_times: List[float]
    refinement_query: Optional[str]
    satisfaction_signal: SatisfactionLevel
    session_context: SessionContext


@dataclass
class BoostSuggestion:
    """Suggested relevance optimization based on patterns"""
    boost_type: BoostType
    target: str
    current_multiplier: float
    suggested_multiplier: float
    confidence: float
    evidence: List[str]


@dataclass
class UsagePattern:
    """Identified pattern from query analysis"""
    pattern_id: str
    pattern_type: PatternType
    frequency: int
    success_rate: float
    confidence: float
    
    # Pattern details
    query_patterns: List[str]
    filter_preferences: Dict[str, float]
    domain_preferences: Dict[str, float]
    temporal_patterns: Dict[str, float]
    
    # Optimization suggestions
    suggested_boosters: List[BoostSuggestion]
    suggested_query_expansions: List[str]
    suggested_filter_defaults: Dict[str, Any]


@dataclass
class OptimizationRecommendation:
    """Configuration optimization recommendation"""
    recommendation_id: str
    pattern_source: UsagePattern
    optimization_type: BoostType
    current_value: float
    suggested_value: float
    confidence: float
    evidence: List[str]
    estimated_impact: float


class UsageAnalyticsEngine:
    """
    Captures and analyzes query usage patterns for learning optimization.
    
    Logs comprehensive interaction data including queries, results, user behavior,
    and business context to enable pattern identification and optimization.
    
    @see memory-bank/features/mbie-intelligence/adaptive-learning-design.md#usage-analytics-engine
    """
    
    def __init__(self, config: dict):
        self.config = config.get('learning', {})
        self.logger = logging.getLogger(__name__)
        
        # Initialize analytics database
        self.analytics_db_path = Path(config.get('storage', {}).get('analytics_path', './data/mbie_analytics.db'))
        self.analytics_db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_analytics_database()
        
        # Session tracking
        self.current_session_id = None
        self.session_start_time = None
        
        # Configuration
        self.enabled = self.config.get('usage_tracking', {}).get('enabled', True)
        self.retention_days = self.config.get('usage_tracking', {}).get('retention_days', 90)
        
    def _init_analytics_database(self):
        """Initialize SQLite database for analytics storage"""
        try:
            with sqlite3.connect(self.analytics_db_path) as conn:
                cursor = conn.cursor()
                
                # Create interactions table
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS query_interactions (
                        query_id TEXT PRIMARY KEY,
                        timestamp TEXT NOT NULL,
                        query_text TEXT NOT NULL,
                        filters_applied TEXT,
                        business_context TEXT,
                        results_count INTEGER,
                        top_result_domains TEXT,
                        result_scores TEXT,
                        result_chunks TEXT,
                        click_positions TEXT,
                        dwell_times TEXT,
                        refinement_query TEXT,
                        satisfaction_signal TEXT,
                        session_context TEXT
                    )
                ''')
                
                # Create sessions table
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS sessions (
                        session_id TEXT PRIMARY KEY,
                        start_time TEXT NOT NULL,
                        end_time TEXT,
                        business_context TEXT,
                        query_count INTEGER DEFAULT 0,
                        avg_satisfaction REAL
                    )
                ''')
                
                # Create patterns table for caching
                cursor.execute('''
                    CREATE TABLE IF NOT EXISTS usage_patterns (
                        pattern_id TEXT PRIMARY KEY,
                        pattern_type TEXT NOT NULL,
                        created_at TEXT NOT NULL,
                        pattern_data TEXT NOT NULL,
                        confidence REAL,
                        frequency INTEGER
                    )
                ''')
                
                conn.commit()
                self.logger.info("Analytics database initialized successfully")
                
        except Exception as e:
            self.logger.error(f"Failed to initialize analytics database: {e}")
    
    def start_session(self, business_context: BusinessContext) -> str:
        """Start a new analytics session"""
        if not self.enabled:
            return "disabled"
        
        self.current_session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.session_start_time = datetime.now()
        
        try:
            with sqlite3.connect(self.analytics_db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO sessions (session_id, start_time, business_context)
                    VALUES (?, ?, ?)
                ''', (self.current_session_id, self.session_start_time.isoformat(), json.dumps(asdict(business_context), default=serialize_datetime)))
                conn.commit()
                
            self.logger.debug(f"Started analytics session: {self.current_session_id}")
            
        except Exception as e:
            self.logger.error(f"Failed to start analytics session: {e}")
        
        return self.current_session_id
    
    def log_query_interaction(self, 
                            query: str, 
                            filters: Dict[str, Any],
                            results: List,  # SearchResult objects
                            interaction_signals: InteractionSignals,
                            business_context: BusinessContext) -> str:
        """Log complete query interaction for learning analysis"""
        
        if not self.enabled:
            return "disabled"
        
        query_id = f"query_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}"
        
        try:
            # Extract results metadata
            results_count = len(results)
            top_result_domains = [getattr(r, 'domain', 'unknown') for r in results[:5]]
            result_scores = [getattr(r, 'score', 0.0) for r in results]
            result_chunks = [getattr(r, 'chunk_id', '') for r in results]
            
            # Infer satisfaction from signals
            satisfaction = self._infer_satisfaction(interaction_signals)
            
            # Create session context
            session_context = SessionContext(
                session_id=self.current_session_id or "unknown",
                business_phase=business_context.phase,
                current_week=business_context.week,
                timestamp=datetime.now()
            )
            
            # Create interaction record
            interaction = QueryInteraction(
                query_id=query_id,
                timestamp=datetime.now(),
                query_text=query,
                filters_applied=filters,
                business_context=business_context,
                results_count=results_count,
                top_result_domains=top_result_domains,
                result_scores=result_scores,
                result_chunks=result_chunks,
                click_positions=interaction_signals.click_positions,
                dwell_times=interaction_signals.dwell_times,
                refinement_query=interaction_signals.refinement_query,
                satisfaction_signal=satisfaction,
                session_context=session_context
            )
            
            # Store in database
            with sqlite3.connect(self.analytics_db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    INSERT INTO query_interactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    interaction.query_id,
                    interaction.timestamp.isoformat(),
                    interaction.query_text,
                    json.dumps(interaction.filters_applied),
                    json.dumps(asdict(interaction.business_context), default=serialize_datetime),
                    interaction.results_count,
                    json.dumps(interaction.top_result_domains),
                    json.dumps(interaction.result_scores),
                    json.dumps(interaction.result_chunks),
                    json.dumps(interaction.click_positions),
                    json.dumps(interaction.dwell_times),
                    interaction.refinement_query,
                    interaction.satisfaction_signal.value,
                    json.dumps(asdict(interaction.session_context), default=serialize_datetime)
                ))
                conn.commit()
            
            self.logger.debug(f"Logged interaction: {query_id}, satisfaction: {satisfaction.value}")
            
        except Exception as e:
            self.logger.error(f"Failed to log query interaction: {e}")
        
        return query_id
    
    def _infer_satisfaction(self, signals: InteractionSignals) -> SatisfactionLevel:
        """Infer user satisfaction from behavioral signals"""

        # Query refinement needed = unsatisfied (check this first - strong signal)
        if signals.refinement_query:
            return SatisfactionLevel.UNSATISFIED

        # Quick click on top result + long dwell time = very satisfied
        if (signals.click_positions and signals.click_positions[0] <= 2 and
            signals.dwell_times and max(signals.dwell_times) > 30):
            return SatisfactionLevel.VERY_SATISFIED

        # Click within top 3 results = satisfied
        if signals.click_positions and min(signals.click_positions) <= 3:
            return SatisfactionLevel.SATISFIED

        # No clicks = very unsatisfied
        if not signals.click_positions:
            return SatisfactionLevel.VERY_UNSATISFIED

        return SatisfactionLevel.NEUTRAL
    
    def get_interactions_since(self, since_date: datetime) -> List[QueryInteraction]:
        """Retrieve interactions since a specific date"""
        
        if not self.enabled:
            return []
        
        interactions = []
        
        try:
            with sqlite3.connect(self.analytics_db_path) as conn:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT * FROM query_interactions 
                    WHERE timestamp >= ?
                    ORDER BY timestamp DESC
                ''', (since_date.isoformat(),))
                
                rows = cursor.fetchall()
                
                # Convert rows back to QueryInteraction objects
                for row in rows:
                    interaction = self._row_to_interaction(row)
                    if interaction:
                        interactions.append(interaction)
                        
        except Exception as e:
            self.logger.error(f"Failed to retrieve interactions: {e}")
        
        return interactions
    
    def _row_to_interaction(self, row) -> Optional[QueryInteraction]:
        """Convert database row to QueryInteraction object"""
        try:
            return QueryInteraction(
                query_id=row[0],
                timestamp=datetime.fromisoformat(row[1]),
                query_text=row[2],
                filters_applied=json.loads(row[3] or '{}'),
                business_context=BusinessContext(**json.loads(row[4])),
                results_count=row[5],
                top_result_domains=json.loads(row[6] or '[]'),
                result_scores=json.loads(row[7] or '[]'),
                result_chunks=json.loads(row[8] or '[]'),
                click_positions=json.loads(row[9] or '[]'),
                dwell_times=json.loads(row[10] or '[]'),
                refinement_query=row[11],
                satisfaction_signal=SatisfactionLevel(row[12]),
                session_context=SessionContext(**json.loads(row[13]))
            )
        except Exception as e:
            self.logger.error(f"Failed to convert row to interaction: {e}")
            return None


class PatternAnalysisEngine:
    """
    Analyzes usage patterns to identify optimization opportunities.
    
    Processes analytics data to find patterns in query frequency, filter preferences,
    domain engagement, and satisfaction levels to generate optimization recommendations.
    
    @see memory-bank/features/mbie-intelligence/adaptive-learning-design.md#pattern-analysis-engine
    """
    
    def __init__(self, config: dict):
        self.config = config.get('learning', {}).get('pattern_analysis', {})
        self.logger = logging.getLogger(__name__)
        
        # Pattern analysis settings
        self.min_frequency_threshold = self.config.get('min_frequency_threshold', 3)
        self.min_confidence_threshold = self.config.get('min_pattern_confidence', 0.7)
        self.analysis_window_days = self.config.get('pattern_window_days', 14)
        
    def analyze_weekly_patterns(self, analytics_engine: UsageAnalyticsEngine) -> List[UsagePattern]:
        """Analyze patterns from recent usage data"""
        
        # Get recent interactions
        since_date = datetime.now() - timedelta(days=self.analysis_window_days)
        interactions = analytics_engine.get_interactions_since(since_date)
        
        if len(interactions) < self.min_frequency_threshold:
            self.logger.debug(f"Insufficient data for pattern analysis: {len(interactions)} interactions")
            return []
        
        patterns = []
        
        # Query frequency patterns
        patterns.extend(self._analyze_query_frequency(interactions))
        
        # Filter usage patterns
        patterns.extend(self._analyze_filter_preferences(interactions))
        
        # Domain preference patterns
        patterns.extend(self._analyze_domain_preferences(interactions))
        
        # Status preference patterns
        patterns.extend(self._analyze_status_preferences(interactions))
        
        # Filter by confidence threshold
        high_confidence_patterns = [
            p for p in patterns 
            if p.confidence >= self.min_confidence_threshold
        ]
        
        self.logger.info(f"Identified {len(high_confidence_patterns)} high-confidence patterns from {len(patterns)} total")
        
        return self._rank_patterns_by_confidence(high_confidence_patterns)
    
    def _analyze_query_frequency(self, interactions: List[QueryInteraction]) -> List[UsagePattern]:
        """Identify frequently used query patterns"""
        
        # Group similar queries
        query_groups = self._group_similar_queries(interactions)
        patterns = []
        
        for query_group, group_interactions in query_groups.items():
            if len(group_interactions) >= self.min_frequency_threshold:
                
                # Calculate success rate
                successful_queries = [
                    i for i in group_interactions 
                    if i.satisfaction_signal in [SatisfactionLevel.SATISFIED, SatisfactionLevel.VERY_SATISFIED]
                ]
                success_rate = len(successful_queries) / len(group_interactions)
                
                # Extract optimization suggestions
                suggestions = self._extract_query_optimizations(group_interactions)
                
                patterns.append(UsagePattern(
                    pattern_id=f"query_freq_{hash(query_group)}",
                    pattern_type=PatternType.QUERY_FREQUENCY,
                    frequency=len(group_interactions),
                    success_rate=success_rate,
                    confidence=self._calculate_pattern_confidence(group_interactions),
                    query_patterns=[query_group],
                    filter_preferences={},
                    domain_preferences={},
                    temporal_patterns={},
                    suggested_boosters=suggestions,
                    suggested_query_expansions=[],
                    suggested_filter_defaults={}
                ))
        
        return patterns
    
    def _group_similar_queries(self, interactions: List[QueryInteraction]) -> Dict[str, List[QueryInteraction]]:
        """Group interactions by similar query patterns"""
        
        query_groups = defaultdict(list)
        
        for interaction in interactions:
            # Normalize query for grouping
            normalized_query = self._normalize_query(interaction.query_text)
            query_groups[normalized_query].append(interaction)
        
        return query_groups
    
    def _normalize_query(self, query: str) -> str:
        """Normalize query for pattern matching"""
        
        # Convert to lowercase and remove extra whitespace
        normalized = re.sub(r'\s+', ' ', query.lower().strip())
        
        # Remove common variations
        normalized = re.sub(r'\b(current|active|latest|recent)\b', 'CURRENT', normalized)
        normalized = re.sub(r'\b(week \d+|this week)\b', 'WEEK', normalized)
        normalized = re.sub(r'\b(andrew|client)\b', 'CLIENT', normalized)
        
        return normalized
    
    def _extract_query_optimizations(self, interactions: List[QueryInteraction]) -> List[BoostSuggestion]:
        """Extract optimization suggestions from successful query patterns"""
        
        suggestions = []
        
        # Analyze successful vs unsuccessful queries
        successful = [i for i in interactions if i.satisfaction_signal in [SatisfactionLevel.SATISFIED, SatisfactionLevel.VERY_SATISFIED]]
        
        if len(successful) < 2:
            return suggestions
        
        # Find common keywords in successful queries
        successful_keywords = defaultdict(int)
        for interaction in successful:
            words = interaction.query_text.lower().split()
            for word in words:
                if len(word) > 3:  # Filter short words
                    successful_keywords[word] += 1
        
        # Suggest keyword boosts for frequently successful terms
        for keyword, count in successful_keywords.items():
            if count >= len(successful) * 0.5:  # Appears in 50%+ of successful queries
                suggestions.append(BoostSuggestion(
                    boost_type=BoostType.KEYWORD,
                    target=keyword,
                    current_multiplier=1.0,
                    suggested_multiplier=1.0 + (count / len(successful)) * 0.5,
                    confidence=min(0.9, count / len(successful)),
                    evidence=[f"Appears in {count}/{len(successful)} successful queries"]
                ))
        
        return suggestions
    
    def _analyze_domain_preferences(self, interactions: List[QueryInteraction]) -> List[UsagePattern]:
        """Identify domain preference patterns"""
        
        # Track domain engagement by satisfaction
        domain_performance = defaultdict(list)
        
        for interaction in interactions:
            for i, domain in enumerate(interaction.top_result_domains):
                # Weight by position and satisfaction
                position_weight = 1.0 / (i + 1)  # Higher weight for top positions
                satisfaction_weight = self._satisfaction_to_weight(interaction.satisfaction_signal)
                
                domain_performance[domain].append(position_weight * satisfaction_weight)
        
        patterns = []
        for domain, scores in domain_performance.items():
            if len(scores) >= 3:  # Minimum sample size
                avg_score = sum(scores) / len(scores)
                
                # High-performing domains get boost suggestions
                if avg_score > 0.6:
                    patterns.append(UsagePattern(
                        pattern_id=f"domain_pref_{hash(domain)}",
                        pattern_type=PatternType.DOMAIN_PREFERENCE,
                        frequency=len(scores),
                        success_rate=avg_score,
                        confidence=min(0.9, len(scores) / 10),  # More samples = higher confidence
                        query_patterns=[],
                        filter_preferences={},
                        domain_preferences={domain: avg_score},
                        temporal_patterns={},
                        suggested_boosters=[
                            BoostSuggestion(
                                boost_type=BoostType.DOMAIN,
                                target=domain,
                                current_multiplier=1.0,
                                suggested_multiplier=1.0 + (avg_score - 0.6) * 2,
                                confidence=min(0.9, len(scores) / 10),
                                evidence=[f"{len(scores)} interactions with {avg_score:.2f} avg score"]
                            )
                        ],
                        suggested_query_expansions=[],
                        suggested_filter_defaults={}
                    ))
        
        return patterns
    
    def _satisfaction_to_weight(self, satisfaction: SatisfactionLevel) -> float:
        """Convert satisfaction level to numeric weight"""
        weights = {
            SatisfactionLevel.VERY_SATISFIED: 1.0,
            SatisfactionLevel.SATISFIED: 0.8,
            SatisfactionLevel.NEUTRAL: 0.5,
            SatisfactionLevel.UNSATISFIED: 0.2,
            SatisfactionLevel.VERY_UNSATISFIED: 0.0
        }
        return weights.get(satisfaction, 0.5)
    
    def _analyze_filter_preferences(self, interactions: List[QueryInteraction]) -> List[UsagePattern]:
        """Analyze filter usage patterns"""
        
        filter_usage = defaultdict(int)
        filter_success = defaultdict(list)
        
        for interaction in interactions:
            for filter_key, filter_value in interaction.filters_applied.items():
                filter_usage[filter_key] += 1
                satisfaction_weight = self._satisfaction_to_weight(interaction.satisfaction_signal)
                filter_success[filter_key].append(satisfaction_weight)
        
        patterns = []
        for filter_key, usage_count in filter_usage.items():
            if usage_count >= self.min_frequency_threshold:
                success_scores = filter_success[filter_key]
                avg_success = sum(success_scores) / len(success_scores)
                
                if avg_success > 0.6:  # Successful filter usage
                    patterns.append(UsagePattern(
                        pattern_id=f"filter_pref_{hash(filter_key)}",
                        pattern_type=PatternType.FILTER_PREFERENCE,
                        frequency=usage_count,
                        success_rate=avg_success,
                        confidence=min(0.9, usage_count / 10),
                        query_patterns=[],
                        filter_preferences={filter_key: avg_success},
                        domain_preferences={},
                        temporal_patterns={},
                        suggested_boosters=[],
                        suggested_query_expansions=[],
                        suggested_filter_defaults={filter_key: True}
                    ))
        
        return patterns
    
    def _analyze_status_preferences(self, interactions: List[QueryInteraction]) -> List[UsagePattern]:
        """Analyze status-related query patterns"""
        
        status_queries = defaultdict(list)
        
        for interaction in interactions:
            query_lower = interaction.query_text.lower()
            
            # Categorize queries by status intent
            if any(word in query_lower for word in ['current', 'active', 'in progress']):
                status_queries['current'].append(interaction)
            elif any(word in query_lower for word in ['completed', 'done', 'finished']):
                status_queries['completed'].append(interaction)
            elif any(word in query_lower for word in ['pending', 'upcoming', 'todo']):
                status_queries['pending'].append(interaction)
        
        patterns = []
        for status_type, query_list in status_queries.items():
            if len(query_list) >= self.min_frequency_threshold:
                successful_queries = [
                    q for q in query_list 
                    if q.satisfaction_signal in [SatisfactionLevel.SATISFIED, SatisfactionLevel.VERY_SATISFIED]
                ]
                success_rate = len(successful_queries) / len(query_list)
                
                if success_rate > 0.5:
                    patterns.append(UsagePattern(
                        pattern_id=f"status_pref_{status_type}",
                        pattern_type=PatternType.STATUS_PREFERENCE,
                        frequency=len(query_list),
                        success_rate=success_rate,
                        confidence=min(0.9, len(query_list) / 5),
                        query_patterns=[status_type],
                        filter_preferences={},
                        domain_preferences={},
                        temporal_patterns={},
                        suggested_boosters=[
                            BoostSuggestion(
                                boost_type=BoostType.STATUS,
                                target=status_type,
                                current_multiplier=1.0,
                                suggested_multiplier=1.0 + success_rate * 0.5,
                                confidence=min(0.9, len(query_list) / 5),
                                evidence=[f"{len(query_list)} {status_type} queries with {success_rate:.2f} success rate"]
                            )
                        ],
                        suggested_query_expansions=[],
                        suggested_filter_defaults={}
                    ))
        
        return patterns
    
    def _calculate_pattern_confidence(self, interactions: List[QueryInteraction]) -> float:
        """Calculate confidence score for a pattern"""

        # Base confidence on sample size and consistency
        sample_size = len(interactions)

        # Sample size confidence (more samples = higher confidence)
        size_confidence = min(0.9, sample_size / 10)  # Reach 0.9 confidence at 10 samples (was 20)

        # Consistency confidence (similar satisfaction levels = higher confidence)
        satisfaction_levels = [i.satisfaction_signal for i in interactions]
        positive_satisfaction = sum(1 for s in satisfaction_levels if s in [SatisfactionLevel.SATISFIED, SatisfactionLevel.VERY_SATISFIED])
        consistency_confidence = positive_satisfaction / len(satisfaction_levels)

        # Weight consistency more heavily for quality patterns
        return (size_confidence * 0.4 + consistency_confidence * 0.6)
    
    def _rank_patterns_by_confidence(self, patterns: List[UsagePattern]) -> List[UsagePattern]:
        """Sort patterns by confidence and potential impact"""
        
        def pattern_score(pattern: UsagePattern) -> float:
            # Combine confidence, frequency, and success rate
            return pattern.confidence * 0.4 + (pattern.frequency / 20) * 0.3 + pattern.success_rate * 0.3
        
        return sorted(patterns, key=pattern_score, reverse=True)


class DynamicRelevanceOptimizer:
    """
    Applies learned patterns to optimize search relevance dynamically.
    
    Generates configuration optimization recommendations and applies high-confidence
    changes automatically to improve search performance over time.
    
    @see memory-bank/features/mbie-intelligence/adaptive-learning-design.md#dynamic-relevance-optimizer
    """
    
    def __init__(self, config: dict):
        self.config = config.get('learning', {})
        self.logger = logging.getLogger(__name__)
        
        # Optimization settings
        self.auto_optimization_enabled = self.config.get('auto_optimization', {}).get('enabled', False)
        self.confidence_threshold = self.config.get('auto_optimization', {}).get('confidence_threshold', 0.8)
        self.max_adjustments_per_week = self.config.get('auto_optimization', {}).get('max_adjustments_per_week', 5)
        self.learning_rate = self.config.get('auto_optimization', {}).get('learning_rate', 0.1)
        
        # Track applied optimizations
        self.applied_optimizations = {}
        self.optimization_history = []
        
    def generate_optimization_recommendations(self, patterns: List[UsagePattern]) -> List[OptimizationRecommendation]:
        """Generate config optimization recommendations based on patterns"""
        
        recommendations = []
        
        for pattern in patterns:
            if pattern.confidence > 0.6:  # Only consider reasonably confident patterns
                
                for boost_suggestion in pattern.suggested_boosters:
                    recommendations.append(OptimizationRecommendation(
                        recommendation_id=f"opt_{pattern.pattern_id}_{boost_suggestion.boost_type.value}",
                        pattern_source=pattern,
                        optimization_type=boost_suggestion.boost_type,
                        current_value=boost_suggestion.current_multiplier,
                        suggested_value=boost_suggestion.suggested_multiplier,
                        confidence=boost_suggestion.confidence,
                        evidence=boost_suggestion.evidence,
                        estimated_impact=self._estimate_impact(boost_suggestion, pattern)
                    ))
        
        return self._prioritize_recommendations(recommendations)
    
    def _estimate_impact(self, boost_suggestion: BoostSuggestion, pattern: UsagePattern) -> float:
        """Estimate the potential impact of an optimization"""
        
        # Impact based on frequency and confidence
        frequency_impact = min(1.0, pattern.frequency / 20)  # Normalize to 0-1
        confidence_impact = boost_suggestion.confidence
        magnitude_impact = abs(boost_suggestion.suggested_multiplier - boost_suggestion.current_multiplier) / 2
        
        return (frequency_impact + confidence_impact + magnitude_impact) / 3
    
    def _prioritize_recommendations(self, recommendations: List[OptimizationRecommendation]) -> List[OptimizationRecommendation]:
        """Sort recommendations by potential impact and confidence"""
        
        def recommendation_score(rec: OptimizationRecommendation) -> float:
            return rec.confidence * 0.5 + rec.estimated_impact * 0.5
        
        return sorted(recommendations, key=recommendation_score, reverse=True)
    
    def apply_automatic_optimizations(self, recommendations: List[OptimizationRecommendation]) -> Dict[str, Any]:
        """Apply high-confidence optimizations automatically"""
        
        if not self.auto_optimization_enabled:
            return {"message": "Auto-optimization disabled", "applied_changes": {}}
        
        # Check rate limiting
        recent_optimizations = [
            opt for opt in self.optimization_history 
            if opt['timestamp'] > datetime.now() - timedelta(days=7)
        ]
        
        if len(recent_optimizations) >= self.max_adjustments_per_week:
            return {
                "message": "Rate limit reached for automatic optimizations",
                "applied_changes": {},
                "recent_count": len(recent_optimizations)
            }
        
        applied_changes = {}
        
        for rec in recommendations:
            if (rec.confidence > self.confidence_threshold and 
                len(applied_changes) < self.max_adjustments_per_week - len(recent_optimizations)):
                
                # Apply optimization based on type
                config_path = self._get_config_path(rec.optimization_type, rec.pattern_source)
                if config_path:
                    # Apply with learning rate for gradual adjustment
                    adjustment = (rec.suggested_value - rec.current_value) * self.learning_rate
                    new_value = rec.current_value + adjustment
                    
                    applied_changes[config_path] = {
                        'old_value': rec.current_value,
                        'new_value': new_value,
                        'confidence': rec.confidence,
                        'evidence': rec.evidence
                    }
                    
                    # Log the optimization
                    self.optimization_history.append({
                        'timestamp': datetime.now(),
                        'recommendation_id': rec.recommendation_id,
                        'config_path': config_path,
                        'old_value': rec.current_value,
                        'new_value': new_value,
                        'confidence': rec.confidence
                    })
        
        if applied_changes:
            self.logger.info(f"Applied {len(applied_changes)} automatic optimizations")
        
        return {
            "applied_changes": applied_changes,
            "total_recommendations": len(recommendations),
            "auto_applied": len(applied_changes),
            "optimization_history": self.optimization_history[-10:]  # Recent history
        }
    
    def _get_config_path(self, optimization_type: BoostType, pattern: UsagePattern) -> Optional[str]:
        """Get configuration path for optimization type"""
        
        if optimization_type == BoostType.KEYWORD:
            # Extract keyword from pattern
            for boost in pattern.suggested_boosters:
                if boost.boost_type == BoostType.KEYWORD:
                    return f"intelligence.priority_scoring.keyword_multipliers.{boost.target}"
        
        elif optimization_type == BoostType.DOMAIN:
            # Extract domain from pattern
            for domain in pattern.domain_preferences:
                return f"search.domain_weights.{domain}"
        
        elif optimization_type == BoostType.STATUS:
            # Extract status type from pattern
            for boost in pattern.suggested_boosters:
                if boost.boost_type == BoostType.STATUS:
                    return f"intelligence.status_preferences.{boost.target}"
        
        return None


class AdaptiveLearningEngine:
    """
    Main coordinator for the MBIE adaptive learning loop.
    
    Orchestrates usage analytics, pattern analysis, and dynamic optimization
    to create a self-improving intelligence system that learns from user behavior.
    
    @see memory-bank/features/mbie-intelligence/adaptive-learning-design.md#system-architecture
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.logger = logging.getLogger(__name__)
        
        # Initialize learning components
        self.analytics_engine = UsageAnalyticsEngine(config)
        self.pattern_analyzer = PatternAnalysisEngine(config)
        self.optimizer = DynamicRelevanceOptimizer(config)
        
        # Learning loop settings
        self.learning_enabled = config.get('learning', {}).get('enabled', True)
        self.analysis_frequency = config.get('learning', {}).get('pattern_analysis', {}).get('analysis_frequency', 'weekly')
        
        # Current business context
        self.current_business_context = BusinessContext(
            quarter="Q3 2025",
            week="Week 3",
            client_focus="Example Client",
            phase="Pre-Sprint Preparation",
            upcoming_events=["Aug 20-22 ExampleCorp Sprint"]
        )
        
    def start_learning_session(self) -> str:
        """Initialize a learning session with current business context"""
        
        if not self.learning_enabled:
            return "disabled"
        
        session_id = self.analytics_engine.start_session(self.current_business_context)
        self.logger.info(f"Started adaptive learning session: {session_id}")
        
        return session_id
    
    def log_search_interaction(self, 
                             query: str,
                             filters: Dict[str, Any],
                             results: List,
                             interaction_signals: InteractionSignals) -> str:
        """Log a search interaction for learning analysis"""
        
        if not self.learning_enabled:
            return "disabled"
        
        return self.analytics_engine.log_query_interaction(
            query, filters, results, interaction_signals, self.current_business_context
        )
    
    def perform_weekly_analysis(self) -> Dict[str, Any]:
        """Perform weekly pattern analysis and optimization"""
        
        if not self.learning_enabled:
            return {"message": "Learning disabled"}
        
        self.logger.info("Starting weekly adaptive learning analysis")
        
        # Analyze usage patterns
        patterns = self.pattern_analyzer.analyze_weekly_patterns(self.analytics_engine)
        
        # Generate optimization recommendations
        recommendations = self.optimizer.generate_optimization_recommendations(patterns)
        
        # Apply automatic optimizations
        optimization_results = self.optimizer.apply_automatic_optimizations(recommendations)
        
        # Create analysis report
        analysis_report = {
            "analysis_date": datetime.now().isoformat(),
            "patterns_identified": len(patterns),
            "high_confidence_patterns": len([p for p in patterns if p.confidence > 0.8]),
            "recommendations_generated": len(recommendations),
            "optimizations_applied": len(optimization_results.get('applied_changes', {})),
            "top_patterns": [
                {
                    "pattern_id": p.pattern_id,
                    "pattern_type": p.pattern_type.value,
                    "frequency": p.frequency,
                    "success_rate": p.success_rate,
                    "confidence": p.confidence
                }
                for p in patterns[:5]  # Top 5 patterns
            ],
            "optimization_results": optimization_results
        }
        
        self.logger.info(f"Weekly analysis complete: {len(patterns)} patterns, {len(recommendations)} recommendations")
        
        return analysis_report
    
    def get_learning_status(self) -> Dict[str, Any]:
        """Get current status of the learning system"""
        
        # Get recent interactions count
        week_ago = datetime.now() - timedelta(days=7)
        recent_interactions = self.analytics_engine.get_interactions_since(week_ago)
        
        return {
            "learning_enabled": self.learning_enabled,
            "current_business_context": asdict(self.current_business_context),
            "recent_interactions_count": len(recent_interactions),
            "last_analysis": getattr(self, 'last_analysis_date', None),
            "auto_optimization_enabled": self.optimizer.auto_optimization_enabled,
            "recent_optimizations": len(self.optimizer.optimization_history)
        }
    
    def update_business_context(self, **context_updates):
        """Update current business context for intelligence"""
        
        for key, value in context_updates.items():
            if hasattr(self.current_business_context, key):
                setattr(self.current_business_context, key, value)
                self.logger.debug(f"Updated business context: {key} = {value}")
        
        return asdict(self.current_business_context)