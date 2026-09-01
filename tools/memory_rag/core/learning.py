"""
Learning engine for MBIE Phase 2 - adaptive navigation optimization and suggestion generation.

Implements machine learning from query patterns to optimize navigation and provide contextual suggestions.

@see memory-bank/features/mbie-intelligence/phase2-design.md#adaptive-navigation-intelligence
@navigation Use startHere.md → "🧠 Memory-Bank Intelligence Engine (MBIE)" path for context
@feature_docs memory-bank/features/mbie-intelligence/README.md
"""

import logging
from datetime import datetime, timedelta
from dataclasses import dataclass
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict
import re
import yaml

from .analytics import AnalyticsCollector, PatternAnalyzer, NavigationPattern, QueryAnalytics, UsageMetrics


logger = logging.getLogger(__name__)


@dataclass
class ContentSuggestion:
    """Contextual content suggestion"""
    
    content_id: str
    title: str
    navigation_path: str
    relevance_score: float  # 0.0-1.0
    confidence: float  # 0.0-1.0
    reason: str  # Why this is suggested
    context_match: str  # Business context that triggered suggestion
    urgency: str  # "high", "medium", "low"


@dataclass
class NavigationOptimization:
    """Navigation optimization recommendation"""
    
    optimization_id: str
    current_path: str
    optimized_path: str
    improvement_type: str  # "reorder", "add", "remove", "modify"
    expected_benefit: str
    confidence: float
    supporting_data: Dict[str, Any]


@dataclass
class BusinessContext:
    """Current business context for intelligent suggestions"""
    
    current_phase: str  # "Q3 2025 Foundation Quarter"
    current_week: str   # "Week 3"
    active_client: str  # "Example Client"
    upcoming_events: List[str]  # ["Sprint Aug 20-22"]
    focus_areas: List[str]  # ["Pre-Sprint Preparation"]
    energy_level: str   # "high", "medium", "low"
    time_context: str   # "morning", "afternoon", "evening"


class NavigationOptimizer:
    """Optimizes navigation based on usage patterns and analytics"""
    
    def __init__(self, config: dict, memory_bank_root: str):
        self.config = config.get('learning', {})
        self.memory_bank_root = Path(memory_bank_root)
        self.start_here_path = self.memory_bank_root / "startHere.md"
        self.adaptation_rate = self.config.get('adaptation_rate', 0.1)
        self.update_threshold = self.config.get('update_threshold', 5)
        
    def analyze_navigation_efficiency(self, 
                                    analytics_data: List[QueryAnalytics],
                                    current_patterns: List[NavigationPattern]) -> List[NavigationOptimization]:
        """Analyze current navigation efficiency and suggest optimizations"""
        
        optimizations = []
        
        # Analyze most-used paths efficiency
        path_optimizations = self._analyze_path_usage(analytics_data)
        optimizations.extend(path_optimizations)
        
        # Analyze pattern-based optimizations
        pattern_optimizations = self._analyze_pattern_efficiency(current_patterns)
        optimizations.extend(pattern_optimizations)
        
        # Analyze context-specific optimizations
        context_optimizations = self._analyze_context_efficiency(analytics_data)
        optimizations.extend(context_optimizations)
        
        return optimizations
        
    def _analyze_path_usage(self, analytics_data: List[QueryAnalytics]) -> List[NavigationOptimization]:
        """Analyze usage patterns to optimize most-used paths"""
        optimizations = []
        
        # Track query success by business context
        context_success = defaultdict(lambda: {'total': 0, 'successful': 0, 'queries': []})
        
        for analytics in analytics_data:
            context = analytics.business_context
            context_success[context]['total'] += 1
            context_success[context]['queries'].append(analytics)
            
            if (analytics.user_interaction and 
                analytics.user_interaction.satisfaction_score and 
                analytics.user_interaction.satisfaction_score > 0.7):
                context_success[context]['successful'] += 1
                
        # Identify contexts with frequent queries but low success rates
        for context, data in context_success.items():
            if data['total'] >= self.update_threshold:
                success_rate = data['successful'] / data['total']
                
                if success_rate < 0.6:  # Low success rate
                    # Analyze common query patterns in this context
                    common_queries = self._find_common_queries(data['queries'])
                    
                    optimization = NavigationOptimization(
                        optimization_id=f"path_opt_{context}_{datetime.now().strftime('%Y%m%d')}",
                        current_path=f"Current navigation for {context}",
                        optimized_path=f"Optimized navigation with direct paths to: {', '.join(common_queries[:3])}",
                        improvement_type="add",
                        expected_benefit=f"Improve success rate from {success_rate:.1%} by adding direct paths",
                        confidence=min(1.0, data['total'] / 20),  # Confidence based on data volume
                        supporting_data={
                            'context': context,
                            'current_success_rate': success_rate,
                            'query_volume': data['total'],
                            'common_queries': common_queries
                        }
                    )
                    optimizations.append(optimization)
                    
        return optimizations
        
    def _analyze_pattern_efficiency(self, patterns: List[NavigationPattern]) -> List[NavigationOptimization]:
        """Analyze pattern efficiency and suggest improvements"""
        optimizations = []
        
        # Group patterns by business context
        context_patterns = defaultdict(list)
        for pattern in patterns:
            context_patterns[pattern.business_context].append(pattern)
            
        # Analyze each context for optimization opportunities
        for context, context_pattern_list in context_patterns.items():
            if len(context_pattern_list) >= 3:  # Enough patterns to analyze
                
                # Find high-frequency, high-success patterns that should be prioritized
                priority_patterns = [
                    p for p in context_pattern_list 
                    if p.frequency >= 5 and p.success_rate >= 0.8
                ]
                
                if priority_patterns:
                    optimization = NavigationOptimization(
                        optimization_id=f"pattern_opt_{context}_{datetime.now().strftime('%Y%m%d')}",
                        current_path=f"Current pattern priority in {context}",
                        optimized_path=f"Prioritize high-success patterns: {len(priority_patterns)} patterns",
                        improvement_type="reorder",
                        expected_benefit=f"Promote {len(priority_patterns)} high-performing patterns",
                        confidence=sum(p.confidence for p in priority_patterns) / len(priority_patterns),
                        supporting_data={
                            'context': context,
                            'priority_patterns': [p.pattern_id for p in priority_patterns],
                            'total_patterns': len(context_pattern_list)
                        }
                    )
                    optimizations.append(optimization)
                    
        return optimizations
        
    def _analyze_context_efficiency(self, analytics_data: List[QueryAnalytics]) -> List[NavigationOptimization]:
        """Analyze context-specific efficiency patterns"""
        optimizations = []
        
        # Analyze time-based patterns
        time_patterns = self._analyze_time_patterns(analytics_data)
        if time_patterns:
            optimizations.extend(time_patterns)
            
        # Analyze query evolution patterns
        evolution_patterns = self._analyze_query_evolution(analytics_data)
        if evolution_patterns:
            optimizations.extend(evolution_patterns)
            
        return optimizations
        
    def _analyze_time_patterns(self, analytics_data: List[QueryAnalytics]) -> List[NavigationOptimization]:
        """Analyze time-based usage patterns"""
        optimizations = []
        
        # Group queries by hour of day
        hourly_patterns = defaultdict(list)
        for analytics in analytics_data:
            hour = analytics.timestamp.hour
            hourly_patterns[hour].append(analytics)
            
        # Find peak usage hours with different query patterns
        peak_hours = []
        for hour, queries in hourly_patterns.items():
            if len(queries) >= 3:  # Minimum data for analysis
                peak_hours.append({
                    'hour': hour,
                    'query_count': len(queries),
                    'common_patterns': self._find_common_queries([q.query_text for q in queries])
                })
                
        if peak_hours:
            # Sort by query count to find true peak hours
            peak_hours.sort(key=lambda x: x['query_count'], reverse=True)
            top_peak = peak_hours[0]
            
            optimization = NavigationOptimization(
                optimization_id=f"time_opt_{top_peak['hour']}h_{datetime.now().strftime('%Y%m%d')}",
                current_path="Time-agnostic navigation",
                optimized_path=f"Time-aware navigation for peak hour {top_peak['hour']}:00",
                improvement_type="modify",
                expected_benefit=f"Optimize for {top_peak['query_count']} queries during peak hour",
                confidence=min(1.0, top_peak['query_count'] / 10),
                supporting_data={
                    'peak_hour': top_peak['hour'],
                    'peak_queries': top_peak['query_count'],
                    'common_patterns': top_peak['common_patterns']
                }
            )
            optimizations.append(optimization)
            
        return optimizations
        
    def _analyze_query_evolution(self, analytics_data: List[QueryAnalytics]) -> List[NavigationOptimization]:
        """Analyze how queries evolve within sessions"""
        optimizations = []
        
        # Group queries by session
        session_queries = defaultdict(list)
        for analytics in analytics_data:
            session_queries[analytics.user_session].append(analytics)
            
        # Analyze query evolution patterns
        evolution_patterns = []
        for session_id, queries in session_queries.items():
            if len(queries) >= 2:  # Need at least 2 queries to see evolution
                sorted_queries = sorted(queries, key=lambda x: x.timestamp)
                
                # Look for refinement patterns
                first_query = sorted_queries[0].query_text.lower()
                last_query = sorted_queries[-1].query_text.lower()
                
                if first_query != last_query:
                    evolution_patterns.append({
                        'initial': first_query,
                        'final': last_query,
                        'refinement_count': len(queries),
                        'success': any(
                            q.user_interaction and 
                            q.user_interaction.satisfaction_score and 
                            q.user_interaction.satisfaction_score > 0.7 
                            for q in queries
                        )
                    })
                    
        # Find common refinement patterns
        if evolution_patterns:
            successful_evolutions = [p for p in evolution_patterns if p['success']]
            
            if len(successful_evolutions) >= 3:
                optimization = NavigationOptimization(
                    optimization_id=f"evolution_opt_{datetime.now().strftime('%Y%m%d')}",
                    current_path="Static query suggestions",
                    optimized_path="Dynamic query refinement suggestions",
                    improvement_type="add",
                    expected_benefit=f"Guide query refinement based on {len(successful_evolutions)} successful patterns",
                    confidence=len(successful_evolutions) / len(evolution_patterns),
                    supporting_data={
                        'successful_evolutions': len(successful_evolutions),
                        'total_evolutions': len(evolution_patterns),
                        'common_refinements': self._extract_refinement_patterns(successful_evolutions)
                    }
                )
                optimizations.append(optimization)
                
        return optimizations
        
    def _find_common_queries(self, queries: List[str]) -> List[str]:
        """Find common query patterns"""
        # Simple frequency analysis (can be enhanced with NLP)
        word_freq = defaultdict(int)
        
        for query in queries:
            words = query.lower().split()
            for word in words:
                if len(word) > 2:  # Skip very short words
                    word_freq[word] += 1
                    
        # Return top common words/concepts
        sorted_words = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, freq in sorted_words[:5] if freq >= 2]
        
    def _extract_refinement_patterns(self, evolutions: List[Dict]) -> List[str]:
        """Extract common refinement patterns from query evolutions"""
        patterns = []
        
        for evolution in evolutions:
            initial_words = set(evolution['initial'].split())
            final_words = set(evolution['final'].split())
            
            # Words added during refinement
            added_words = final_words - initial_words
            if added_words:
                patterns.extend(list(added_words))
                
        # Return most common refinement words
        word_freq = defaultdict(int)
        for word in patterns:
            word_freq[word] += 1
            
        sorted_patterns = sorted(word_freq.items(), key=lambda x: x[1], reverse=True)
        return [word for word, freq in sorted_patterns[:3] if freq >= 2]


class SuggestionEngine:
    """Generates contextual suggestions based on business context and patterns"""
    
    def __init__(self, config: dict, memory_bank_root: str):
        self.config = config.get('learning', {})
        self.memory_bank_root = Path(memory_bank_root)
        self.prediction_window_days = self.config.get('prediction_window_days', 3)
        self.confidence_threshold = self.config.get('confidence_threshold', 0.7)
        
    def generate_contextual_suggestions(self, 
                                      current_context: BusinessContext,
                                      patterns: List[NavigationPattern],
                                      recent_analytics: List[QueryAnalytics]) -> List[ContentSuggestion]:
        """Generate proactive content suggestions based on current context"""
        
        suggestions = []
        
        # Context-based suggestions
        context_suggestions = self._generate_context_suggestions(current_context, patterns)
        suggestions.extend(context_suggestions)
        
        # Time-based suggestions
        time_suggestions = self._generate_time_based_suggestions(current_context)
        suggestions.extend(time_suggestions)
        
        # Pattern-based suggestions
        pattern_suggestions = self._generate_pattern_suggestions(patterns, recent_analytics)
        suggestions.extend(pattern_suggestions)
        
        # Predictive suggestions
        predictive_suggestions = self._generate_predictive_suggestions(current_context)
        suggestions.extend(predictive_suggestions)
        
        # Filter and rank suggestions
        filtered_suggestions = self._filter_and_rank_suggestions(suggestions)
        
        return filtered_suggestions
        
    def _generate_context_suggestions(self, 
                                    context: BusinessContext, 
                                    patterns: List[NavigationPattern]) -> List[ContentSuggestion]:
        """Generate suggestions based on current business context"""
        suggestions = []
        
        # Match patterns to current context
        relevant_patterns = [p for p in patterns if p.business_context == context.current_phase]
        
        for pattern in relevant_patterns:
            if pattern.confidence >= self.confidence_threshold:
                for content_id in pattern.recommended_content[:3]:  # Top 3 recommendations
                    suggestion = ContentSuggestion(
                        content_id=content_id,
                        title=f"Content for {pattern.query_pattern}",
                        navigation_path=f"Pattern-based: {pattern.pattern_id}",
                        relevance_score=pattern.confidence,
                        confidence=pattern.confidence,
                        reason=f"Matches your current context: {context.current_phase}",
                        context_match=context.current_phase,
                        urgency="medium"
                    )
                    suggestions.append(suggestion)
                    
        return suggestions
        
    def _generate_time_based_suggestions(self, context: BusinessContext) -> List[ContentSuggestion]:
        """Generate suggestions based on time context and upcoming events"""
        suggestions = []
        
        # Check for upcoming events that need preparation
        for event in context.upcoming_events:
            if "Sprint" in event and "Aug 20-22" in event:
                # Sprint preparation suggestions
                sprint_suggestions = [
                    ContentSuggestion(
                        content_id="sprint_prep_checklist",
                        title="Sprint Preparation Checklist",
                        navigation_path="activeContext.md → Week 4: On-Site Sprint Execution",
                        relevance_score=0.9,
                        confidence=0.8,
                        reason="Sprint starting in less than 7 days",
                        context_match="Sprint Preparation",
                        urgency="high"
                    ),
                    ContentSuggestion(
                        content_id="andrew_client_context",
                        title="Example Client Context",
                        navigation_path="activeContext.md → Example Client engagement",
                        relevance_score=0.85,
                        confidence=0.8,
                        reason="Active client sprint approaching",
                        context_match="Client Focus",
                        urgency="high"
                    )
                ]
                suggestions.extend(sprint_suggestions)
                
        # Time-of-day suggestions
        if context.time_context == "morning":
            morning_suggestion = ContentSuggestion(
                content_id="daily_planning",
                title="Daily Planning & Focus",
                navigation_path="../docs/dailyData/dailyGoogleDataEnhanced.md",
                relevance_score=0.7,
                confidence=0.6,
                reason="Morning planning time",
                context_match="Daily Operations",
                urgency="medium"
            )
            suggestions.append(morning_suggestion)
            
        return suggestions
        
    def _generate_pattern_suggestions(self, 
                                    patterns: List[NavigationPattern],
                                    recent_analytics: List[QueryAnalytics]) -> List[ContentSuggestion]:
        """Generate suggestions based on successful patterns from recent analytics"""
        suggestions = []
        
        # Find recently successful patterns
        recent_successful_queries = [
            a for a in recent_analytics 
            if (a.user_interaction and 
                a.user_interaction.satisfaction_score and 
                a.user_interaction.satisfaction_score > 0.7)
        ]
        
        # Match with existing patterns
        for analytics in recent_successful_queries[-5:]:  # Last 5 successful queries
            for pattern in patterns:
                if re.search(pattern.query_pattern, analytics.query_text, re.IGNORECASE):
                    for content_id in pattern.recommended_content[:2]:
                        suggestion = ContentSuggestion(
                            content_id=content_id,
                            title=f"Similar to recent successful query",
                            navigation_path=f"Pattern: {pattern.pattern_id}",
                            relevance_score=pattern.success_rate,
                            confidence=pattern.confidence * 0.8,  # Slightly lower confidence for pattern matching
                            reason=f"Similar to your recent query: '{analytics.query_text[:50]}...'",
                            context_match="Recent Success",
                            urgency="low"
                        )
                        suggestions.append(suggestion)
                        
        return suggestions
        
    def _generate_predictive_suggestions(self, context: BusinessContext) -> List[ContentSuggestion]:
        """Generate predictive suggestions based on business cycle patterns"""
        suggestions = []
        
        # Predict needs based on business phase
        if "Week 3" in context.current_week and "Pre-Sprint" in context.focus_areas[0] if context.focus_areas else "":
            # Pre-sprint week - predict sprint preparation needs
            predictive_suggestions = [
                ContentSuggestion(
                    content_id="risk_register",
                    title="Risk Register Review",
                    navigation_path="activeContext.md → Risk Register review",
                    relevance_score=0.8,
                    confidence=0.7,
                    reason="Typically needed during pre-sprint preparation",
                    context_match="Sprint Cycle Prediction",
                    urgency="medium"
                ),
                ContentSuggestion(
                    content_id="transformation_planning",
                    title="Transformation Planning Materials",
                    navigation_path="video-case-study-strategy.md",
                    relevance_score=0.75,
                    confidence=0.65,
                    reason="Sprint execution requires transformation documentation",
                    context_match="Sprint Preparation",
                    urgency="medium"
                )
            ]
            suggestions.extend(predictive_suggestions)
            
        # Client cycle predictions
        if context.active_client and "ExampleCorp" in context.active_client:
            client_suggestion = ContentSuggestion(
                content_id="andrew_engagement_history",
                title="ExampleCorp Engagement History",
                navigation_path="business-messaging-framework.md → Client conversation frameworks",
                relevance_score=0.8,
                confidence=0.7,
                reason="Active client engagement - review history for context",
                context_match="Client Management",
                urgency="medium"
            )
            suggestions.append(client_suggestion)
            
        return suggestions
        
    def _filter_and_rank_suggestions(self, suggestions: List[ContentSuggestion]) -> List[ContentSuggestion]:
        """Filter and rank suggestions by relevance and confidence"""
        
        # Remove duplicates based on content_id
        unique_suggestions = {}
        for suggestion in suggestions:
            if suggestion.content_id not in unique_suggestions:
                unique_suggestions[suggestion.content_id] = suggestion
            else:
                # Keep the one with higher relevance score
                existing = unique_suggestions[suggestion.content_id]
                if suggestion.relevance_score > existing.relevance_score:
                    unique_suggestions[suggestion.content_id] = suggestion
                    
        filtered_suggestions = list(unique_suggestions.values())
        
        # Filter by confidence threshold
        high_confidence_suggestions = [
            s for s in filtered_suggestions 
            if s.confidence >= self.confidence_threshold
        ]
        
        # Rank by combined score (relevance * confidence * urgency_weight)
        urgency_weights = {"high": 1.2, "medium": 1.0, "low": 0.8}
        
        for suggestion in high_confidence_suggestions:
            urgency_weight = urgency_weights.get(suggestion.urgency, 1.0)
            suggestion.combined_score = suggestion.relevance_score * suggestion.confidence * urgency_weight
            
        # Sort by combined score
        ranked_suggestions = sorted(
            high_confidence_suggestions, 
            key=lambda x: x.combined_score, 
            reverse=True
        )
        
        return ranked_suggestions[:10]  # Return top 10 suggestions


class AdaptiveLearningEngine:
    """Main learning engine that coordinates optimization and suggestion generation"""
    
    def __init__(self, config: dict, memory_bank_root: str):
        self.config = config
        self.memory_bank_root = memory_bank_root
        self.navigator = NavigationOptimizer(config, memory_bank_root)
        self.suggester = SuggestionEngine(config, memory_bank_root)
        self.learning_enabled = config.get('learning', {}).get('enabled', True)
        
    def run_learning_cycle(self, 
                          analytics_collector: AnalyticsCollector,
                          pattern_analyzer: PatternAnalyzer,
                          current_context: BusinessContext) -> Dict[str, Any]:
        """Run complete learning cycle - analysis, optimization, and suggestions"""
        
        if not self.learning_enabled:
            return {"status": "learning_disabled"}
            
        results = {}
        
        try:
            # Get recent analytics data
            recent_analytics = analytics_collector.db.get_query_analytics(days_back=14)
            
            # Analyze patterns
            discovered_patterns = pattern_analyzer.analyze_query_patterns(recent_analytics)
            
            # Store new patterns
            for pattern in discovered_patterns:
                analytics_collector.db.store_navigation_pattern(pattern)
                
            # Get all current patterns
            all_patterns = analytics_collector.db.get_navigation_patterns()
            
            # Generate navigation optimizations
            optimizations = self.navigator.analyze_navigation_efficiency(recent_analytics, all_patterns)
            
            # Generate contextual suggestions
            suggestions = self.suggester.generate_contextual_suggestions(
                current_context, all_patterns, recent_analytics
            )
            
            # Get usage metrics
            metrics = analytics_collector.get_usage_metrics(days_back=14)
            
            results = {
                "status": "success",
                "learning_cycle_timestamp": datetime.now().isoformat(),
                "analytics_summary": {
                    "total_queries": len(recent_analytics),
                    "discovered_patterns": len(discovered_patterns),
                    "total_patterns": len(all_patterns),
                    "avg_response_time": metrics.avg_response_time,
                    "satisfaction_rate": metrics.satisfaction_rate
                },
                "optimizations": [
                    {
                        "id": opt.optimization_id,
                        "type": opt.improvement_type,
                        "benefit": opt.expected_benefit,
                        "confidence": opt.confidence
                    } for opt in optimizations
                ],
                "suggestions": [
                    {
                        "title": sug.title,
                        "path": sug.navigation_path,
                        "reason": sug.reason,
                        "urgency": sug.urgency,
                        "confidence": sug.confidence
                    } for sug in suggestions
                ],
                "patterns_discovered": [
                    {
                        "pattern": pattern.query_pattern,
                        "frequency": pattern.frequency,
                        "success_rate": pattern.success_rate,
                        "context": pattern.business_context
                    } for pattern in discovered_patterns
                ]
            }
            
            logger.info(f"Learning cycle completed: {len(discovered_patterns)} patterns, "
                       f"{len(optimizations)} optimizations, {len(suggestions)} suggestions")
                       
        except Exception as e:
            logger.error(f"Learning cycle failed: {e}")
            results = {"status": "error", "error": str(e)}
            
        return results
        
    def get_current_business_context(self) -> BusinessContext:
        """Extract current business context from memory-bank files"""
        
        try:
            # Read activeContext.md for current state
            active_context_path = Path(self.memory_bank_root) / "activeContext.md"
            if active_context_path.exists():
                with open(active_context_path) as f:
                    content = f.read()
                    
                # Extract context information (simplified parsing)
                current_phase = "Q3 2025 Foundation Quarter"  # Default
                current_week = "Week 3"  # Default
                active_client = "Example Client"  # Default
                
                # Look for specific patterns
                if "Week 4" in content:
                    current_week = "Week 4"
                elif "Week 2" in content:
                    current_week = "Week 2"
                elif "Week 1" in content:
                    current_week = "Week 1"
                    
                upcoming_events = []
                if "Aug 20-22" in content:
                    upcoming_events.append("Sprint Aug 20-22")
                    
                focus_areas = []
                if "Pre-Sprint Preparation" in content:
                    focus_areas.append("Pre-Sprint Preparation")
                elif "Sprint Execution" in content:
                    focus_areas.append("Sprint Execution")
                    
                return BusinessContext(
                    current_phase=current_phase,
                    current_week=current_week,
                    active_client=active_client,
                    upcoming_events=upcoming_events,
                    focus_areas=focus_areas,
                    energy_level="medium",  # Default
                    time_context=self._get_time_context()
                )
                
        except Exception as e:
            logger.warning(f"Failed to extract business context: {e}")
            
        # Return default context
        return BusinessContext(
            current_phase="Q3 2025 Foundation Quarter",
            current_week="Week 3",
            active_client="Example Client",
            upcoming_events=["Sprint Aug 20-22"],
            focus_areas=["Pre-Sprint Preparation"],
            energy_level="medium",
            time_context=self._get_time_context()
        )
        
    def _get_time_context(self) -> str:
        """Get current time context"""
        hour = datetime.now().hour
        if 6 <= hour < 12:
            return "morning"
        elif 12 <= hour < 18:
            return "afternoon"
        else:
            return "evening"


def create_learning_engine(config: dict, memory_bank_root: str) -> AdaptiveLearningEngine:
    """Factory function to create adaptive learning engine"""
    return AdaptiveLearningEngine(config, memory_bank_root)


if __name__ == "__main__":
    # Example usage
    import yaml
    from .analytics import create_analytics_system
    
    # Load config
    config_path = Path(__file__).parent.parent / "config.yml"
    with open(config_path) as f:
        config = yaml.safe_load(f)
        
    # Create learning engine
    memory_bank_root = "../../memory-bank"
    learning_engine = create_learning_engine(config, memory_bank_root)
    
    # Create analytics system
    collector, analyzer = create_analytics_system(config)
    
    # Get current context
    current_context = learning_engine.get_current_business_context()
    
    # Run learning cycle
    results = learning_engine.run_learning_cycle(collector, analyzer, current_context)
    
    print("Learning Cycle Results:")
    print(f"Status: {results['status']}")
    if results['status'] == 'success':
        print(f"Patterns discovered: {len(results.get('patterns_discovered', []))}")
        print(f"Optimizations found: {len(results.get('optimizations', []))}")
        print(f"Suggestions generated: {len(results.get('suggestions', []))}")
        
        if results.get('suggestions'):
            print("\nTop Suggestions:")
            for i, suggestion in enumerate(results['suggestions'][:3], 1):
                print(f"{i}. {suggestion['title']} ({suggestion['urgency']} urgency)")
                print(f"   Reason: {suggestion['reason']}")
                print(f"   Path: {suggestion['path']}")
                print()