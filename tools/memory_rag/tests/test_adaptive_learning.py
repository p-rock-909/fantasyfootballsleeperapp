"""
Tests for MBIE Adaptive Learning Loop components.

Tests usage analytics, pattern analysis, and dynamic optimization
functionality for Issue #213 implementation.

@see memory-bank/features/mbie-intelligence/adaptive-learning-design.md
@feature_docs memory-bank/features/mbie-intelligence/README.md#adaptive-learning-loop
"""

import pytest
import tempfile
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from unittest.mock import Mock, patch

from core.intelligence import (
    # Learning components
    AdaptiveLearningEngine, UsageAnalyticsEngine, PatternAnalysisEngine, 
    DynamicRelevanceOptimizer,
    
    # Data models
    InteractionSignals, BusinessContext, QueryInteraction, 
    SatisfactionLevel, PatternType, BoostType, UsagePattern,
    
    # Mock search results for testing
    IntelligenceProcessor
)


class TestUsageAnalyticsEngine:
    """Test usage analytics and interaction logging functionality"""
    
    @pytest.fixture
    def analytics_config(self):
        """Test configuration for analytics"""
        with tempfile.TemporaryDirectory() as temp_dir:
            yield {
                'learning': {
                    'usage_tracking': {
                        'enabled': True,
                        'retention_days': 90
                    }
                },
                'storage': {
                    'analytics_path': str(Path(temp_dir) / 'test_analytics.db')
                }
            }
    
    @pytest.fixture
    def analytics_engine(self, analytics_config):
        """Create analytics engine for testing"""
        return UsageAnalyticsEngine(analytics_config)
    
    @pytest.fixture
    def business_context(self):
        """Test business context"""
        return BusinessContext(
            quarter="Q3 2025",
            week="Week 3",
            client_focus="Example Client",
            phase="Pre-Sprint Preparation",
            upcoming_events=["Aug 20-22 ExampleCorp Sprint"]
        )
    
    @pytest.fixture
    def interaction_signals(self):
        """Test interaction signals"""
        return InteractionSignals(
            click_positions=[1, 3],
            dwell_times=[45.0, 20.0],
            refinement_query=None,
            session_duration=65.0,
            query_success=True
        )
    
    def test_analytics_database_initialization(self, analytics_engine):
        """Test that analytics database is properly initialized"""
        # Database file should be created
        assert analytics_engine.analytics_db_path.exists()
        
        # Check tables exist
        with sqlite3.connect(analytics_engine.analytics_db_path) as conn:
            cursor = conn.cursor()
            
            # Check query_interactions table
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='query_interactions'")
            assert cursor.fetchone() is not None
            
            # Check sessions table
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'")
            assert cursor.fetchone() is not None
            
            # Check usage_patterns table
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='usage_patterns'")
            assert cursor.fetchone() is not None
    
    def test_session_management(self, analytics_engine, business_context):
        """Test session creation and tracking"""
        # Start session
        session_id = analytics_engine.start_session(business_context)
        
        assert session_id != "disabled"
        assert analytics_engine.current_session_id == session_id
        assert analytics_engine.session_start_time is not None
        
        # Verify session in database
        with sqlite3.connect(analytics_engine.analytics_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT session_id, business_context FROM sessions WHERE session_id = ?", (session_id,))
            row = cursor.fetchone()
            
            assert row is not None
            assert row[0] == session_id
            assert "Q3 2025" in row[1]
    
    def test_query_interaction_logging(self, analytics_engine, business_context, interaction_signals):
        """Test comprehensive query interaction logging"""
        # Mock search results
        mock_results = [
            Mock(domain="business", score=0.95, chunk_id="chunk1"),
            Mock(domain="automation", score=0.87, chunk_id="chunk2"),
            Mock(domain="health", score=0.72, chunk_id="chunk3")
        ]
        
        # Start session first
        analytics_engine.start_session(business_context)
        
        # Log interaction
        query_id = analytics_engine.log_query_interaction(
            query="current focus andrew client",
            filters={"status": "in_progress", "domain": "business"},
            results=mock_results,
            interaction_signals=interaction_signals,
            business_context=business_context
        )
        
        assert query_id != "disabled"
        
        # Verify interaction in database
        with sqlite3.connect(analytics_engine.analytics_db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT * FROM query_interactions WHERE query_id = ?", (query_id,))
            row = cursor.fetchone()
            
            assert row is not None
            assert row[2] == "current focus andrew client"  # query_text
            assert '"status": "in_progress"' in row[3]  # filters_applied
            assert row[5] == 3  # results_count
            assert "business" in row[6]  # top_result_domains
    
    def test_satisfaction_inference(self, analytics_engine):
        """Test satisfaction level inference from behavioral signals"""
        # Very satisfied: Quick click on top result + long dwell
        very_satisfied_signals = InteractionSignals(
            click_positions=[1], dwell_times=[45.0], refinement_query=None,
            session_duration=45.0, query_success=True
        )
        satisfaction = analytics_engine._infer_satisfaction(very_satisfied_signals)
        assert satisfaction == SatisfactionLevel.VERY_SATISFIED
        
        # Satisfied: Click within top 3
        satisfied_signals = InteractionSignals(
            click_positions=[2], dwell_times=[15.0], refinement_query=None,
            session_duration=15.0, query_success=True
        )
        satisfaction = analytics_engine._infer_satisfaction(satisfied_signals)
        assert satisfaction == SatisfactionLevel.SATISFIED
        
        # Unsatisfied: Query refinement needed
        unsatisfied_signals = InteractionSignals(
            click_positions=[1], dwell_times=[5.0], refinement_query="andrew client status",
            session_duration=30.0, query_success=False
        )
        satisfaction = analytics_engine._infer_satisfaction(unsatisfied_signals)
        assert satisfaction == SatisfactionLevel.UNSATISFIED
        
        # Very unsatisfied: No clicks
        very_unsatisfied_signals = InteractionSignals(
            click_positions=[], dwell_times=[], refinement_query=None,
            session_duration=5.0, query_success=False
        )
        satisfaction = analytics_engine._infer_satisfaction(very_unsatisfied_signals)
        assert satisfaction == SatisfactionLevel.VERY_UNSATISFIED
    
    def test_interactions_retrieval(self, analytics_engine, business_context, interaction_signals):
        """Test retrieving interactions by date range"""
        # Start session and log multiple interactions
        analytics_engine.start_session(business_context)
        
        mock_results = [Mock(domain="business", score=0.9, chunk_id="chunk1")]
        
        # Log interactions with different timestamps
        query_id1 = analytics_engine.log_query_interaction(
            "current focus", {}, mock_results, interaction_signals, business_context
        )
        query_id2 = analytics_engine.log_query_interaction(
            "andrew client", {}, mock_results, interaction_signals, business_context
        )
        
        # Retrieve interactions from last hour
        since_date = datetime.now() - timedelta(hours=1)
        interactions = analytics_engine.get_interactions_since(since_date)
        
        assert len(interactions) == 2
        assert any(i.query_id == query_id1 for i in interactions)
        assert any(i.query_id == query_id2 for i in interactions)
        assert all(i.query_text in ["current focus", "andrew client"] for i in interactions)


class TestPatternAnalysisEngine:
    """Test pattern analysis and optimization recommendation functionality"""
    
    @pytest.fixture
    def pattern_config(self):
        """Test configuration for pattern analysis"""
        return {
            'learning': {
                'pattern_analysis': {
                    'min_frequency_threshold': 2,
                    'min_pattern_confidence': 0.6,
                    'pattern_window_days': 7
                }
            }
        }
    
    @pytest.fixture
    def pattern_analyzer(self, pattern_config):
        """Create pattern analyzer for testing"""
        return PatternAnalysisEngine(pattern_config)
    
    @pytest.fixture
    def mock_interactions(self):
        """Create mock interactions for testing"""
        business_context = BusinessContext(
            quarter="Q3 2025", week="Week 3", client_focus="Example Client",
            phase="Pre-Sprint Preparation", upcoming_events=[]
        )
        
        interactions = []
        
        # Create patterns in the data
        for i in range(5):
            # Frequent "current focus" queries with high satisfaction
            interactions.append(QueryInteraction(
                query_id=f"query_current_{i}",
                timestamp=datetime.now() - timedelta(minutes=i*10),
                query_text="current focus andrew client",
                filters_applied={"status": "in_progress"},
                business_context=business_context,
                results_count=10,
                top_result_domains=["business", "automation"],
                result_scores=[0.9, 0.8, 0.7],
                result_chunks=["chunk1", "chunk2", "chunk3"],
                click_positions=[1],
                dwell_times=[30.0],
                refinement_query=None,
                satisfaction_signal=SatisfactionLevel.VERY_SATISFIED,
                session_context=Mock()
            ))
        
        # Less frequent "completed tasks" queries with medium satisfaction
        for i in range(3):
            interactions.append(QueryInteraction(
                query_id=f"query_completed_{i}",
                timestamp=datetime.now() - timedelta(minutes=i*15),
                query_text="completed tasks week 3",
                filters_applied={"status": "completed"},
                business_context=business_context,
                results_count=8,
                top_result_domains=["automation", "health"],
                result_scores=[0.7, 0.6, 0.5],
                result_chunks=["chunk4", "chunk5", "chunk6"],
                click_positions=[2],
                dwell_times=[15.0],
                refinement_query=None,
                satisfaction_signal=SatisfactionLevel.SATISFIED,
                session_context=Mock()
            ))
        
        return interactions
    
    def test_query_frequency_analysis(self, pattern_analyzer, mock_interactions):
        """Test identification of frequent query patterns"""
        patterns = pattern_analyzer._analyze_query_frequency(mock_interactions)
        
        # Should identify at least one frequent pattern
        assert len(patterns) >= 1
        
        # Check for "current focus" pattern (5 occurrences)
        current_focus_pattern = next(
            (p for p in patterns if "CURRENT" in p.query_patterns[0]), None
        )
        assert current_focus_pattern is not None
        assert current_focus_pattern.frequency >= 5
        assert current_focus_pattern.success_rate == 1.0  # All very satisfied
        assert current_focus_pattern.pattern_type == PatternType.QUERY_FREQUENCY
    
    def test_domain_preference_analysis(self, pattern_analyzer, mock_interactions):
        """Test identification of domain performance patterns"""
        patterns = pattern_analyzer._analyze_domain_preferences(mock_interactions)
        
        # Should identify domain preferences
        domain_patterns = [p for p in patterns if p.pattern_type == PatternType.DOMAIN_PREFERENCE]
        assert len(domain_patterns) >= 1
        
        # Business domain should have high performance (always in top results with high satisfaction)
        business_pattern = next(
            (p for p in domain_patterns if "business" in p.domain_preferences), None
        )
        if business_pattern:
            assert business_pattern.success_rate > 0.6
            assert len(business_pattern.suggested_boosters) > 0
            assert business_pattern.suggested_boosters[0].boost_type == BoostType.DOMAIN
    
    def test_filter_preference_analysis(self, pattern_analyzer, mock_interactions):
        """Test identification of filter usage patterns"""
        patterns = pattern_analyzer._analyze_filter_preferences(mock_interactions)
        
        # Should identify filter preferences
        filter_patterns = [p for p in patterns if p.pattern_type == PatternType.FILTER_PREFERENCE]
        
        # Status filter should be identified as frequently used
        status_pattern = next(
            (p for p in filter_patterns if "status" in p.filter_preferences), None
        )
        if status_pattern:
            assert status_pattern.frequency >= 2  # min_frequency_threshold
            assert any("status" in p.suggested_filter_defaults for p in filter_patterns if p == status_pattern)
    
    def test_status_preference_analysis(self, pattern_analyzer, mock_interactions):
        """Test identification of status-related query patterns"""
        patterns = pattern_analyzer._analyze_status_preferences(mock_interactions)
        
        # Should identify status preferences
        status_patterns = [p for p in patterns if p.pattern_type == PatternType.STATUS_PREFERENCE]
        
        # Should identify "current" status preference
        current_pattern = next(
            (p for p in status_patterns if "current" in p.query_patterns), None
        )
        if current_pattern:
            assert current_pattern.success_rate > 0.5
            assert len(current_pattern.suggested_boosters) > 0
            assert current_pattern.suggested_boosters[0].boost_type == BoostType.STATUS
    
    def test_pattern_confidence_calculation(self, pattern_analyzer, mock_interactions):
        """Test pattern confidence scoring"""
        # High satisfaction interactions should have high confidence
        high_satisfaction_interactions = [
            i for i in mock_interactions 
            if i.satisfaction_signal == SatisfactionLevel.VERY_SATISFIED
        ]
        
        confidence = pattern_analyzer._calculate_pattern_confidence(high_satisfaction_interactions)
        assert confidence > 0.7  # Should be high confidence
        
        # Mixed satisfaction should have lower confidence
        mixed_interactions = mock_interactions[:3] + [
            QueryInteraction(
                query_id="mixed",
                timestamp=datetime.now(),
                query_text="test query",
                filters_applied={},
                business_context=Mock(),
                results_count=5,
                top_result_domains=["test"],
                result_scores=[0.5],
                result_chunks=["chunk"],
                click_positions=[],
                dwell_times=[],
                refinement_query=None,
                satisfaction_signal=SatisfactionLevel.VERY_UNSATISFIED,
                session_context=Mock()
            )
        ]
        
        mixed_confidence = pattern_analyzer._calculate_pattern_confidence(mixed_interactions)
        assert mixed_confidence < confidence


class TestDynamicRelevanceOptimizer:
    """Test dynamic relevance optimization and recommendation generation"""
    
    @pytest.fixture
    def optimizer_config(self):
        """Test configuration for optimizer"""
        return {
            'learning': {
                'auto_optimization': {
                    'enabled': True,
                    'confidence_threshold': 0.7,
                    'max_adjustments_per_week': 3,
                    'learning_rate': 0.2
                }
            }
        }
    
    @pytest.fixture
    def optimizer(self, optimizer_config):
        """Create optimizer for testing"""
        return DynamicRelevanceOptimizer(optimizer_config)
    
    @pytest.fixture
    def mock_patterns(self):
        """Create mock usage patterns for testing"""
        from core.intelligence import BoostSuggestion, UsagePattern
        
        # High confidence keyword pattern
        keyword_pattern = UsagePattern(
            pattern_id="test_keyword_pattern",
            pattern_type=PatternType.QUERY_FREQUENCY,
            frequency=10,
            success_rate=0.9,
            confidence=0.85,
            query_patterns=["current focus"],
            filter_preferences={},
            domain_preferences={},
            temporal_patterns={},
            suggested_boosters=[
                BoostSuggestion(
                    boost_type=BoostType.KEYWORD,
                    target="focus",
                    current_multiplier=1.0,
                    suggested_multiplier=1.5,
                    confidence=0.85,
                    evidence=["Appears in 8/10 successful queries"]
                )
            ],
            suggested_query_expansions=[],
            suggested_filter_defaults={}
        )
        
        # Medium confidence domain pattern
        domain_pattern = UsagePattern(
            pattern_id="test_domain_pattern",
            pattern_type=PatternType.DOMAIN_PREFERENCE,
            frequency=6,
            success_rate=0.75,
            confidence=0.65,
            query_patterns=[],
            filter_preferences={},
            domain_preferences={"business": 0.8},
            temporal_patterns={},
            suggested_boosters=[
                BoostSuggestion(
                    boost_type=BoostType.DOMAIN,
                    target="business",
                    current_multiplier=1.0,
                    suggested_multiplier=1.3,
                    confidence=0.65,
                    evidence=["6 interactions with 0.8 avg score"]
                )
            ],
            suggested_query_expansions=[],
            suggested_filter_defaults={}
        )
        
        return [keyword_pattern, domain_pattern]
    
    def test_recommendation_generation(self, optimizer, mock_patterns):
        """Test generation of optimization recommendations"""
        recommendations = optimizer.generate_optimization_recommendations(mock_patterns)
        
        assert len(recommendations) >= 1
        
        # Check high confidence keyword recommendation
        keyword_rec = next(
            (r for r in recommendations if r.optimization_type == BoostType.KEYWORD), None
        )
        assert keyword_rec is not None
        assert keyword_rec.confidence >= 0.8
        assert keyword_rec.suggested_value > keyword_rec.current_value
        assert keyword_rec.estimated_impact > 0
    
    def test_automatic_optimization_application(self, optimizer, mock_patterns):
        """Test automatic application of high-confidence optimizations"""
        recommendations = optimizer.generate_optimization_recommendations(mock_patterns)
        
        # Apply optimizations
        results = optimizer.apply_automatic_optimizations(recommendations)
        
        assert "applied_changes" in results
        assert "total_recommendations" in results
        assert "auto_applied" in results
        
        # Should apply high-confidence recommendations
        if results["auto_applied"] > 0:
            assert len(results["applied_changes"]) > 0
            
            # Check that learning rate was applied
            for change in results["applied_changes"].values():
                assert "old_value" in change
                assert "new_value" in change
                assert change["new_value"] != change["old_value"]
    
    def test_rate_limiting(self, optimizer, mock_patterns):
        """Test rate limiting for automatic optimizations"""
        # Simulate recent optimizations
        optimizer.optimization_history = [
            {"timestamp": datetime.now() - timedelta(hours=1)} for _ in range(3)
        ]
        
        recommendations = optimizer.generate_optimization_recommendations(mock_patterns)
        results = optimizer.apply_automatic_optimizations(recommendations)
        
        # Should hit rate limit
        assert "Rate limit reached" in results["message"] or results["auto_applied"] == 0
    
    def test_config_path_generation(self, optimizer, mock_patterns):
        """Test configuration path generation for different optimization types"""
        keyword_pattern = mock_patterns[0]  # Has keyword booster
        domain_pattern = mock_patterns[1]   # Has domain booster
        
        # Test keyword config path
        keyword_path = optimizer._get_config_path(BoostType.KEYWORD, keyword_pattern)
        assert keyword_path is not None
        assert "keyword_multipliers" in keyword_path
        assert "focus" in keyword_path
        
        # Test domain config path
        domain_path = optimizer._get_config_path(BoostType.DOMAIN, domain_pattern)
        assert domain_path is not None
        assert "domain_weights" in domain_path
        assert "business" in domain_path


class TestAdaptiveLearningEngine:
    """Test main adaptive learning engine coordination"""
    
    @pytest.fixture
    def learning_config(self):
        """Test configuration for learning engine"""
        with tempfile.TemporaryDirectory() as temp_dir:
            yield {
                'learning': {
                    'enabled': True,
                    'pattern_analysis': {
                        'analysis_frequency': 'weekly',
                        'min_frequency_threshold': 2,
                        'min_pattern_confidence': 0.6
                    },
                    'auto_optimization': {
                        'enabled': False,  # Disabled for testing
                        'confidence_threshold': 0.8
                    }
                },
                'storage': {
                    'analytics_path': str(Path(temp_dir) / 'test_learning.db')
                }
            }
    
    @pytest.fixture
    def learning_engine(self, learning_config):
        """Create learning engine for testing"""
        return AdaptiveLearningEngine(learning_config)
    
    def test_learning_session_management(self, learning_engine):
        """Test learning session initialization"""
        session_id = learning_engine.start_learning_session()
        
        assert session_id != "disabled"
        assert learning_engine.analytics_engine.current_session_id == session_id
    
    def test_search_interaction_logging(self, learning_engine):
        """Test search interaction logging coordination"""
        mock_results = [
            Mock(domain="business", score=0.9, chunk_id="chunk1")
        ]
        
        interaction_signals = InteractionSignals(
            click_positions=[1],
            dwell_times=[30.0],
            refinement_query=None,
            session_duration=30.0,
            query_success=True
        )
        
        # Start session
        learning_engine.start_learning_session()
        
        # Log interaction
        query_id = learning_engine.log_search_interaction(
            query="current focus andrew",
            filters={"status": "in_progress"},
            results=mock_results,
            interaction_signals=interaction_signals
        )
        
        assert query_id != "disabled"
    
    def test_learning_status_reporting(self, learning_engine):
        """Test learning system status reporting"""
        status = learning_engine.get_learning_status()
        
        assert "learning_enabled" in status
        assert "current_business_context" in status
        assert "recent_interactions_count" in status
        assert status["learning_enabled"] is True
        
        # Check business context structure
        context = status["current_business_context"]
        assert "quarter" in context
        assert "week" in context
        assert "client_focus" in context
        assert context["quarter"] == "Q3 2025"
    
    def test_business_context_updates(self, learning_engine):
        """Test business context updates"""
        # Update context
        updated_context = learning_engine.update_business_context(
            week="Week 4",
            phase="On-Site Sprint Execution"
        )
        
        assert updated_context["week"] == "Week 4"
        assert updated_context["phase"] == "On-Site Sprint Execution"
        assert updated_context["quarter"] == "Q3 2025"  # Unchanged
    
    @patch('core.intelligence.PatternAnalysisEngine.analyze_weekly_patterns')
    @patch('core.intelligence.DynamicRelevanceOptimizer.generate_optimization_recommendations')
    @patch('core.intelligence.DynamicRelevanceOptimizer.apply_automatic_optimizations')
    def test_weekly_analysis_coordination(self, mock_apply, mock_generate, mock_analyze, learning_engine):
        """Test weekly analysis coordination"""
        # Mock return values
        mock_patterns = [Mock(confidence=0.8, pattern_id="test")]
        mock_recommendations = [Mock()]
        mock_optimization_results = {"applied_changes": {}, "auto_applied": 0}
        
        mock_analyze.return_value = mock_patterns
        mock_generate.return_value = mock_recommendations
        mock_apply.return_value = mock_optimization_results
        
        # Perform analysis
        report = learning_engine.perform_weekly_analysis()
        
        # Verify coordination
        assert "analysis_date" in report
        assert "patterns_identified" in report
        assert "recommendations_generated" in report
        assert "optimization_results" in report
        
        # Verify method calls
        mock_analyze.assert_called_once()
        mock_generate.assert_called_once_with(mock_patterns)
        mock_apply.assert_called_once_with(mock_recommendations)


class TestLearningIntegration:
    """Integration tests for learning system components"""
    
    @pytest.fixture
    def full_config(self):
        """Full configuration for integration testing"""
        with tempfile.TemporaryDirectory() as temp_dir:
            yield {
                'learning': {
                    'enabled': True,
                    'usage_tracking': {'enabled': True, 'retention_days': 90},
                    'pattern_analysis': {
                        'min_frequency_threshold': 2,
                        'min_pattern_confidence': 0.6,
                        'pattern_window_days': 7
                    },
                    'auto_optimization': {
                        'enabled': True,
                        'confidence_threshold': 0.8,
                        'max_adjustments_per_week': 3,
                        'learning_rate': 0.1
                    }
                },
                'storage': {
                    'analytics_path': str(Path(temp_dir) / 'integration_test.db')
                },
                'intelligence': {
                    'enabled': True,
                    'priority_scoring': {
                        'keyword_multipliers': {
                            'CURRENT': 1.5,
                            'andrew': 1.2
                        }
                    }
                }
            }
    
    def test_end_to_end_learning_flow(self, full_config):
        """Test complete learning flow from interaction to optimization"""
        # Initialize learning engine
        learning_engine = AdaptiveLearningEngine(full_config)
        
        # Start session
        session_id = learning_engine.start_learning_session()
        assert session_id != "disabled"
        
        # Simulate multiple search interactions with patterns
        mock_results = [Mock(domain="business", score=0.9, chunk_id="chunk1")]
        
        # Pattern 1: Frequent "current focus" queries with high satisfaction
        for i in range(5):
            interaction_signals = InteractionSignals(
                click_positions=[1],
                dwell_times=[30.0],
                refinement_query=None,
                session_duration=30.0,
                query_success=True
            )
            
            learning_engine.log_search_interaction(
                query=f"current focus andrew client {i}",
                filters={"status": "in_progress"},
                results=mock_results,
                interaction_signals=interaction_signals
            )
        
        # Get learning status
        status = learning_engine.get_learning_status()
        assert status["recent_interactions_count"] >= 5
        
        # Perform analysis (should find patterns in our simulated data)
        if status["recent_interactions_count"] >= 2:  # min_frequency_threshold
            analysis_report = learning_engine.perform_weekly_analysis()
            
            assert "patterns_identified" in analysis_report
            assert "recommendations_generated" in analysis_report
            
            # Should identify some patterns from our repeated queries
            if analysis_report["patterns_identified"] > 0:
                assert "top_patterns" in analysis_report
                assert len(analysis_report["top_patterns"]) > 0


if __name__ == "__main__":
    pytest.main([__file__])