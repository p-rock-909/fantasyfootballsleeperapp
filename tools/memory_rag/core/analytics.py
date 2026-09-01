"""
Analytics and learning system for MBIE Phase 2 - query pattern tracking and usage optimization.

Implements advanced intelligence features from Issue #202: adaptive navigation and usage-based learning.

@see memory-bank/features/mbie-intelligence/phase2-design.md#analytics-data-models
@navigation Use startHere.md → "🧠 Memory-Bank Intelligence Engine (MBIE)" path for context
@feature_docs memory-bank/features/mbie-intelligence/README.md
"""

import sqlite3
import json
import logging
from datetime import datetime, timedelta
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from collections import defaultdict
import re
from hashlib import md5


logger = logging.getLogger(__name__)


@dataclass
class QueryAnalytics:
    """Query pattern and usage analytics"""
    
    query_id: str
    query_text: str
    timestamp: datetime
    user_session: str
    search_results: List[str]  # chunk_ids returned
    user_interaction: Optional['UserInteraction']
    business_context: str  # Current phase/focus when query was made
    response_time_ms: float
    result_count: int
    

@dataclass  
class UserInteraction:
    """User interaction with search results"""
    
    clicked_results: List[str]  # chunk_ids user interacted with
    time_spent: int  # seconds spent on results
    follow_up_queries: List[str]  # related queries in same session
    satisfaction_score: Optional[float]  # inferred satisfaction (0.0-1.0)
    interaction_type: str  # "click", "read", "copy", "follow_up"


@dataclass
class NavigationPattern:
    """Discovered navigation patterns"""
    
    pattern_id: str
    query_pattern: str  # regex pattern for similar queries
    recommended_content: List[str]  # chunk_ids typically relevant
    frequency: int  # how often this pattern occurs
    confidence: float  # 0.0-1.0 confidence in pattern
    business_context: str  # when this pattern is most relevant
    success_rate: float  # how often this pattern leads to good outcomes
    last_updated: datetime


@dataclass
class UsageMetrics:
    """Overall usage metrics for optimization"""
    
    total_queries: int
    unique_sessions: int
    avg_response_time: float
    satisfaction_rate: float
    top_patterns: List[NavigationPattern]
    context_distribution: Dict[str, int]
    time_window: Tuple[datetime, datetime]


class AnalyticsDatabase:
    """SQLite database for analytics storage with optional encryption support"""
    
    def __init__(self, db_path: str, config: Optional[dict] = None):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Database security configuration
        self.config = config or {}
        security_config = self.config.get('analytics', {}).get('database_security', {})
        self.encryption_enabled = security_config.get('encryption_enabled', False)
        self.encryption_key_path = security_config.get('encryption_key_path', '~/.config/mbie/db_encryption_key')
        
        if self.encryption_enabled:
            logger.info("Database encryption enabled - requires SQLCipher installation")
            
        self._init_database()
        
    def _init_database(self):
        """Initialize analytics database schema with optional encryption"""
        with sqlite3.connect(self.db_path) as conn:
            # Enable encryption if configured (requires SQLCipher)
            if self.encryption_enabled:
                try:
                    encryption_key_path = Path(self.encryption_key_path).expanduser()
                    if encryption_key_path.exists():
                        with open(encryption_key_path, 'r') as f:
                            encryption_key = f.read().strip()
                        # Note: This requires SQLCipher, will gracefully fail with standard SQLite
                        conn.execute(f"PRAGMA key = '{encryption_key}'")
                        logger.info("Database encryption applied")
                    else:
                        logger.warning(f"Encryption key not found at {encryption_key_path}, proceeding without encryption")
                except Exception as e:
                    logger.warning(f"Failed to apply database encryption (SQLCipher may not be installed): {e}")
                    
            # Standard database initialization
            conn.execute("""
                CREATE TABLE IF NOT EXISTS query_analytics (
                    query_id TEXT PRIMARY KEY,
                    query_text TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    user_session TEXT NOT NULL,
                    search_results TEXT NOT NULL,  -- JSON array
                    business_context TEXT NOT NULL,
                    response_time_ms REAL NOT NULL,
                    result_count INTEGER NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS user_interactions (
                    interaction_id TEXT PRIMARY KEY,
                    query_id TEXT NOT NULL,
                    clicked_results TEXT,  -- JSON array
                    time_spent INTEGER DEFAULT 0,
                    follow_up_queries TEXT,  -- JSON array
                    satisfaction_score REAL,
                    interaction_type TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (query_id) REFERENCES query_analytics (query_id)
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS navigation_patterns (
                    pattern_id TEXT PRIMARY KEY,
                    query_pattern TEXT NOT NULL,
                    recommended_content TEXT NOT NULL,  -- JSON array
                    frequency INTEGER NOT NULL,
                    confidence REAL NOT NULL,
                    business_context TEXT NOT NULL,
                    success_rate REAL NOT NULL,
                    last_updated TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            conn.execute("""
                CREATE TABLE IF NOT EXISTS usage_sessions (
                    session_id TEXT PRIMARY KEY,
                    start_time TEXT NOT NULL,
                    end_time TEXT,
                    query_count INTEGER DEFAULT 0,
                    business_context TEXT,
                    user_agent TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                )
            """)
            
            # Create indexes for performance
            conn.execute("CREATE INDEX IF NOT EXISTS idx_query_timestamp ON query_analytics (timestamp)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_query_session ON query_analytics (user_session)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_query_context ON query_analytics (business_context)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_pattern_context ON navigation_patterns (business_context)")
            
            conn.commit()
            
    def store_query_analytics(self, analytics: QueryAnalytics):
        """Store query analytics data"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO query_analytics 
                (query_id, query_text, timestamp, user_session, search_results, 
                 business_context, response_time_ms, result_count)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                analytics.query_id,
                analytics.query_text,
                analytics.timestamp.isoformat(),
                analytics.user_session,
                json.dumps(analytics.search_results),
                analytics.business_context,
                analytics.response_time_ms,
                analytics.result_count
            ))
            
            # Store interaction data if available
            if analytics.user_interaction:
                interaction_id = f"{analytics.query_id}_{analytics.user_interaction.interaction_type}"
                conn.execute("""
                    INSERT OR REPLACE INTO user_interactions
                    (interaction_id, query_id, clicked_results, time_spent, 
                     follow_up_queries, satisfaction_score, interaction_type)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                """, (
                    interaction_id,
                    analytics.query_id,
                    json.dumps(analytics.user_interaction.clicked_results),
                    analytics.user_interaction.time_spent,
                    json.dumps(analytics.user_interaction.follow_up_queries),
                    analytics.user_interaction.satisfaction_score,
                    analytics.user_interaction.interaction_type
                ))
            
            conn.commit()
            
    def store_navigation_pattern(self, pattern: NavigationPattern):
        """Store discovered navigation pattern"""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO navigation_patterns
                (pattern_id, query_pattern, recommended_content, frequency,
                 confidence, business_context, success_rate, last_updated)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                pattern.pattern_id,
                pattern.query_pattern,
                json.dumps(pattern.recommended_content),
                pattern.frequency,
                pattern.confidence,
                pattern.business_context,
                pattern.success_rate,
                pattern.last_updated.isoformat()
            ))
            conn.commit()
            
    def get_query_analytics(self, 
                           days_back: int = 30, 
                           business_context: Optional[str] = None) -> List[QueryAnalytics]:
        """Retrieve query analytics for analysis"""
        since_date = datetime.now() - timedelta(days=days_back)
        
        query = """
            SELECT q.*, i.clicked_results, i.time_spent, i.follow_up_queries, 
                   i.satisfaction_score, i.interaction_type
            FROM query_analytics q
            LEFT JOIN user_interactions i ON q.query_id = i.query_id
            WHERE q.timestamp >= ?
        """
        params = [since_date.isoformat()]
        
        if business_context:
            query += " AND q.business_context = ?"
            params.append(business_context)
            
        query += " ORDER BY q.timestamp DESC"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            
            analytics_list = []
            for row in cursor.fetchall():
                interaction = None
                if row['clicked_results']:
                    interaction = UserInteraction(
                        clicked_results=json.loads(row['clicked_results']),
                        time_spent=row['time_spent'] or 0,
                        follow_up_queries=json.loads(row['follow_up_queries'] or '[]'),
                        satisfaction_score=row['satisfaction_score'],
                        interaction_type=row['interaction_type'] or 'unknown'
                    )
                
                analytics = QueryAnalytics(
                    query_id=row['query_id'],
                    query_text=row['query_text'],
                    timestamp=datetime.fromisoformat(row['timestamp']),
                    user_session=row['user_session'],
                    search_results=json.loads(row['search_results']),
                    user_interaction=interaction,
                    business_context=row['business_context'],
                    response_time_ms=row['response_time_ms'],
                    result_count=row['result_count']
                )
                analytics_list.append(analytics)
                
            return analytics_list
            
    def get_navigation_patterns(self, business_context: Optional[str] = None) -> List[NavigationPattern]:
        """Retrieve stored navigation patterns"""
        query = "SELECT * FROM navigation_patterns"
        params = []
        
        if business_context:
            query += " WHERE business_context = ?"
            params.append(business_context)
            
        query += " ORDER BY confidence DESC, frequency DESC"
        
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(query, params)
            
            patterns = []
            for row in cursor.fetchall():
                pattern = NavigationPattern(
                    pattern_id=row['pattern_id'],
                    query_pattern=row['query_pattern'],
                    recommended_content=json.loads(row['recommended_content']),
                    frequency=row['frequency'],
                    confidence=row['confidence'],
                    business_context=row['business_context'],
                    success_rate=row['success_rate'],
                    last_updated=datetime.fromisoformat(row['last_updated'])
                )
                patterns.append(pattern)
                
            return patterns


class PatternAnalyzer:
    """Analyzes query patterns to discover navigation optimization opportunities"""
    
    def __init__(self, config: dict):
        self.config = config.get('analytics', {})
        pattern_config = self.config.get('pattern_analysis', {})
        self.min_frequency = pattern_config.get('min_pattern_frequency', 3)
        self.confidence_threshold = pattern_config.get('confidence_threshold', 0.7)
        self.learning_window_days = pattern_config.get('learning_window_days', 14)
        
        # Success thresholds from config (instead of hardcoded values)
        success_thresholds = pattern_config.get('success_thresholds', {})
        self.min_time_spent = success_thresholds.get('min_time_spent', 30)
        self.min_satisfaction_score = success_thresholds.get('min_satisfaction_score', 0.7)
        self.min_success_rate = success_thresholds.get('min_success_rate', 0.6)
        self.min_engagement_time = success_thresholds.get('min_engagement_time', 20)
        self.context_confidence_threshold = pattern_config.get('context_confidence_threshold', 0.6)
        
    def analyze_query_patterns(self, analytics_data: List[QueryAnalytics]) -> List[NavigationPattern]:
        """Analyze query patterns to discover navigation optimization opportunities"""
        
        # Group queries by semantic similarity
        query_clusters = self._cluster_queries_semantically(analytics_data)
        
        # Identify successful interaction patterns
        successful_patterns = self._find_high_engagement_patterns(query_clusters)
        
        # Extract business context correlations
        context_patterns = self._correlate_with_business_context(successful_patterns)
        
        # Generate navigation patterns
        navigation_patterns = self._generate_navigation_patterns(context_patterns)
        
        return navigation_patterns
        
    def _cluster_queries_semantically(self, analytics_data: List[QueryAnalytics]) -> Dict[str, List[QueryAnalytics]]:
        """Group similar queries together using semantic clustering"""
        clusters = defaultdict(list)
        
        for analytics in analytics_data:
            # Simple keyword-based clustering (can be enhanced with embeddings)
            normalized_query = self._normalize_query(analytics.query_text)
            cluster_key = self._generate_cluster_key(normalized_query)
            clusters[cluster_key].append(analytics)
            
        # Filter clusters by minimum frequency
        filtered_clusters = {
            key: queries for key, queries in clusters.items() 
            if len(queries) >= self.min_frequency
        }
        
        return filtered_clusters
        
    def _normalize_query(self, query: str) -> str:
        """Normalize query text for pattern matching"""
        # Convert to lowercase
        normalized = query.lower()
        
        # Remove common stop words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'}
        words = [word for word in normalized.split() if word not in stop_words]
        
        # Sort words for consistent matching
        return ' '.join(sorted(words))
        
    def _generate_cluster_key(self, normalized_query: str) -> str:
        """Generate cluster key for grouping similar queries"""
        # Extract key concepts (this is simplified - could use NLP)
        words = normalized_query.split()
        
        # Group by key business concepts
        business_concepts = ['andrew', 'client', 'sprint', 'current', 'focus', 'week', 'mbie', 'automation']
        key_concepts = [word for word in words if word in business_concepts]
        
        if key_concepts:
            return '_'.join(sorted(key_concepts))
        else:
            # Fallback to first 2 words
            return '_'.join(words[:2]) if len(words) >= 2 else normalized_query
            
    def _find_high_engagement_patterns(self, query_clusters: Dict[str, List[QueryAnalytics]]) -> Dict[str, Dict[str, Any]]:
        """Identify query clusters with high user engagement"""
        successful_patterns = {}
        
        for cluster_key, queries in query_clusters.items():
            # Calculate engagement metrics
            total_interactions = 0
            successful_interactions = 0
            total_time_spent = 0
            result_consistency = defaultdict(int)
            
            for query in queries:
                if query.user_interaction:
                    total_interactions += 1
                    
                    # Successful interaction indicators (using config values)
                    if (query.user_interaction.time_spent > self.min_time_spent or
                        query.user_interaction.satisfaction_score and query.user_interaction.satisfaction_score > self.min_satisfaction_score or
                        len(query.user_interaction.follow_up_queries) > 0):  # led to follow-up queries
                        successful_interactions += 1
                        
                    total_time_spent += query.user_interaction.time_spent
                    
                    # Track result consistency
                    for result in query.user_interaction.clicked_results:
                        result_consistency[result] += 1
                        
            # Calculate success metrics
            if total_interactions > 0:
                success_rate = successful_interactions / total_interactions
                avg_time_spent = total_time_spent / total_interactions
                
                # Pattern is successful if it meets thresholds (using config values)
                if (success_rate >= self.min_success_rate and
                    avg_time_spent >= self.min_engagement_time and
                    len(result_consistency) > 0):  # has consistent results
                    
                    successful_patterns[cluster_key] = {
                        'queries': queries,
                        'success_rate': success_rate,
                        'avg_engagement': avg_time_spent,
                        'consistent_results': dict(result_consistency),
                        'frequency': len(queries)
                    }
                    
        return successful_patterns
        
    def _correlate_with_business_context(self, successful_patterns: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """Correlate successful patterns with business context"""
        context_patterns = {}
        
        for pattern_key, pattern_data in successful_patterns.items():
            # Analyze business context distribution
            context_distribution = defaultdict(int)
            for query in pattern_data['queries']:
                context_distribution[query.business_context] += 1
                
            # Find dominant business context
            dominant_context = max(context_distribution.items(), key=lambda x: x[1])
            context_confidence = dominant_context[1] / len(pattern_data['queries'])
            
            # Only include patterns with strong context correlation
            if context_confidence >= self.context_confidence_threshold:
                context_patterns[pattern_key] = {
                    **pattern_data,
                    'business_context': dominant_context[0],
                    'context_confidence': context_confidence
                }
                
        return context_patterns
        
    def _generate_navigation_patterns(self, context_patterns: Dict[str, Dict[str, Any]]) -> List[NavigationPattern]:
        """Generate NavigationPattern objects from analyzed patterns"""
        navigation_patterns = []
        
        for pattern_key, pattern_data in context_patterns.items():
            # Generate regex pattern for query matching
            query_pattern = self._generate_query_regex(pattern_key, pattern_data['queries'])
            
            # Get recommended content (most consistently clicked results)
            recommended_content = self._get_top_content(pattern_data['consistent_results'])
            
            # Calculate overall confidence
            confidence = min(
                pattern_data['context_confidence'],
                pattern_data['success_rate'],
                min(1.0, pattern_data['frequency'] / 10)  # frequency confidence capped at 10
            )
            
            # Only include high-confidence patterns
            if confidence >= self.confidence_threshold:
                pattern = NavigationPattern(
                    pattern_id=self._generate_pattern_id(pattern_key),
                    query_pattern=query_pattern,
                    recommended_content=recommended_content,
                    frequency=pattern_data['frequency'],
                    confidence=confidence,
                    business_context=pattern_data['business_context'],
                    success_rate=pattern_data['success_rate'],
                    last_updated=datetime.now()
                )
                navigation_patterns.append(pattern)
                
        return navigation_patterns
        
    def _generate_query_regex(self, pattern_key: str, queries: List[QueryAnalytics]) -> str:
        """Generate regex pattern that matches similar queries"""
        # Extract common words from cluster
        all_words = []
        for query in queries:
            words = self._normalize_query(query.query_text).split()
            all_words.extend(words)
            
        # Find most common words
        word_freq = defaultdict(int)
        for word in all_words:
            word_freq[word] += 1
            
        # Create pattern from most frequent words
        min_frequency = max(2, len(queries) // 2)  # Word must appear in at least half the queries
        pattern_words = [word for word, freq in word_freq.items() if freq >= min_frequency]
        
        if pattern_words:
            # Create flexible regex pattern
            pattern = r'.*(?:' + '|'.join(re.escape(word) for word in pattern_words) + r').*'
            return pattern
        else:
            # Fallback to pattern key
            return re.escape(pattern_key)
            
    def _get_top_content(self, consistent_results: Dict[str, int], max_results: int = 5) -> List[str]:
        """Get top recommended content from consistent results"""
        sorted_results = sorted(consistent_results.items(), key=lambda x: x[1], reverse=True)
        return [result_id for result_id, _ in sorted_results[:max_results]]
        
    def _generate_pattern_id(self, pattern_key: str) -> str:
        """Generate unique pattern ID"""
        timestamp = datetime.now().strftime("%Y%m%d")
        hash_input = f"{pattern_key}_{timestamp}"
        return f"pattern_{md5(hash_input.encode(), usedforsecurity=False).hexdigest()[:8]}"


class AnalyticsCollector:
    """Collects and manages analytics data for MBIE queries"""
    
    def __init__(self, db_path: str, config: dict):
        self.db = AnalyticsDatabase(db_path, config)  # Pass config for encryption support
        self.config = config.get('analytics', {})
        query_config = self.config.get('query_tracking', {})
        self.session_timeout = query_config.get('session_timeout', 1800)  # 30 minutes
        self.current_session = None
        
    def start_session(self, user_agent: str = "mbie_cli") -> str:
        """Start a new analytics session"""
        session_id = f"session_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{md5(user_agent.encode(), usedforsecurity=False).hexdigest()[:8]}"
        self.current_session = session_id
        
        with sqlite3.connect(self.db.db_path) as conn:
            conn.execute("""
                INSERT INTO usage_sessions (session_id, start_time, user_agent)
                VALUES (?, ?, ?)
            """, (session_id, datetime.now().isoformat(), user_agent))
            conn.commit()
            
        return session_id
        
    def end_session(self):
        """End current analytics session"""
        if self.current_session:
            with sqlite3.connect(self.db.db_path) as conn:
                conn.execute("""
                    UPDATE usage_sessions 
                    SET end_time = ?
                    WHERE session_id = ?
                """, (datetime.now().isoformat(), self.current_session))
                conn.commit()
                
            self.current_session = None
            
    def record_query(self, 
                    query_text: str, 
                    search_results: List[str],
                    response_time_ms: float,
                    business_context: str = "unknown") -> str:
        """Record a query for analytics"""
        
        if not self.current_session:
            self.start_session()

        query_id = f"query_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{md5(query_text.encode(), usedforsecurity=False).hexdigest()[:8]}"
        
        analytics = QueryAnalytics(
            query_id=query_id,
            query_text=query_text,
            timestamp=datetime.now(),
            user_session=self.current_session,
            search_results=search_results,
            user_interaction=None,  # Will be updated later if interaction occurs
            business_context=business_context,
            response_time_ms=response_time_ms,
            result_count=len(search_results)
        )
        
        self.db.store_query_analytics(analytics)
        return query_id
        
    def record_interaction(self, 
                          query_id: str,
                          interaction_type: str = "click",
                          clicked_results: List[str] = None,
                          time_spent: int = 0,
                          follow_up_queries: List[str] = None,
                          satisfaction_score: Optional[float] = None):
        """Record user interaction with search results"""
        
        interaction = UserInteraction(
            clicked_results=clicked_results or [],
            time_spent=time_spent,
            follow_up_queries=follow_up_queries or [],
            satisfaction_score=satisfaction_score,
            interaction_type=interaction_type
        )
        
        # Update the existing query analytics with interaction data
        with sqlite3.connect(self.db.db_path) as conn:
            interaction_id = f"{query_id}_{interaction_type}"
            conn.execute("""
                INSERT OR REPLACE INTO user_interactions
                (interaction_id, query_id, clicked_results, time_spent, 
                 follow_up_queries, satisfaction_score, interaction_type)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """, (
                interaction_id,
                query_id,
                json.dumps(interaction.clicked_results),
                interaction.time_spent,
                json.dumps(interaction.follow_up_queries),
                interaction.satisfaction_score,
                interaction.interaction_type
            ))
            conn.commit()
            
    def get_usage_metrics(self, days_back: int = 30) -> UsageMetrics:
        """Get comprehensive usage metrics"""
        
        analytics_data = self.db.get_query_analytics(days_back=days_back)
        patterns = self.db.get_navigation_patterns()
        
        # Calculate metrics
        total_queries = len(analytics_data)
        unique_sessions = len(set(a.user_session for a in analytics_data))
        
        response_times = [a.response_time_ms for a in analytics_data if a.response_time_ms > 0]
        avg_response_time = sum(response_times) / len(response_times) if response_times else 0
        
        satisfied_interactions = [
            a for a in analytics_data 
            if (a.user_interaction and 
                a.user_interaction.satisfaction_score and 
                a.user_interaction.satisfaction_score > 0.7)
        ]
        satisfaction_rate = len(satisfied_interactions) / max(1, total_queries)
        
        context_distribution = defaultdict(int)
        for analytics in analytics_data:
            context_distribution[analytics.business_context] += 1
            
        time_window = (
            min(a.timestamp for a in analytics_data) if analytics_data else datetime.now(),
            max(a.timestamp for a in analytics_data) if analytics_data else datetime.now()
        )
        
        return UsageMetrics(
            total_queries=total_queries,
            unique_sessions=unique_sessions,
            avg_response_time=avg_response_time,
            satisfaction_rate=satisfaction_rate,
            top_patterns=patterns[:10],  # Top 10 patterns
            context_distribution=dict(context_distribution),
            time_window=time_window
        )


def create_analytics_system(config: dict) -> Tuple[AnalyticsCollector, PatternAnalyzer]:
    """Factory function to create analytics system components"""
    
    analytics_config = config.get('analytics', {})
    
    # Get database path with fallback handling
    db_path = analytics_config.get('database_path')
    if not db_path:
        # Fallback to storage config if available
        storage_config = config.get('storage', {})
        db_path = storage_config.get('analytics_path', '../../memory-bank/.rag/analytics.db')
    
    collector = AnalyticsCollector(db_path, config)
    analyzer = PatternAnalyzer(config)
    
    return collector, analyzer


if __name__ == "__main__":
    # Example usage
    import yaml
    
    # Load config
    config_path = Path(__file__).parent.parent / "config.yml"
    with open(config_path) as f:
        config = yaml.safe_load(f)
        
    # Create analytics system
    collector, analyzer = create_analytics_system(config)
    
    # Example query recording
    session_id = collector.start_session("test_session")
    query_id = collector.record_query(
        query_text="current focus andrew client", 
        search_results=["chunk1", "chunk2", "chunk3"],
        response_time_ms=150.5,
        business_context="Q3 2025 Foundation Quarter"
    )
    
    # Example interaction recording
    collector.record_interaction(
        query_id=query_id,
        interaction_type="click",
        clicked_results=["chunk1"],
        time_spent=45,
        satisfaction_score=0.8
    )
    
    collector.end_session()
    
    # Get usage metrics
    metrics = collector.get_usage_metrics(days_back=7)
    print(f"Total queries: {metrics.total_queries}")
    print(f"Satisfaction rate: {metrics.satisfaction_rate:.2%}")