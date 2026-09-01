"""
Test suite for MBIE intelligence processing module.

Tests cover core functionality for status parsing, temporal context extraction,
and priority scoring to ensure reliability and maintainability.
"""

import pytest
from unittest.mock import Mock, patch
from core.intelligence import (
    IntelligenceProcessor, SemanticStatusParser, TemporalContextExtractor,
    PriorityScoringEngine, StatusType, TimeContextType, StatusInfo,
    TemporalContext, PriorityMarkers, IntelligenceMetadata
)


class TestSemanticStatusParser:
    """Test suite for status parsing functionality"""
    
    def setup_method(self):
        """Setup test configuration"""
        self.config = {
            'intelligence': {
                'status_parsing': {
                    'checkbox_patterns': {
                        'completed': [r'\[x\]', r'\[X\]'],
                        'pending': [r'\[ \]'],
                        'in_progress': [r'\[-\]', r'\[~\]']
                    },
                    'progress_keywords': {
                        'completed': ['COMPLETED', '✅', 'DONE'],
                        'in_progress': ['IN PROGRESS', '🔄', 'CURRENT'],
                        'pending': ['PENDING', '📋', 'TODO']
                    }
                }
            }
        }
        self.parser = SemanticStatusParser(self.config)
    
    def test_checkbox_parsing_completed(self):
        """Test recognition of completed checkbox patterns"""
        content = "- [x] Task completed\n- [X] Another task done"
        result = self.parser.parse_chunk_status(content)
        
        assert result.status_type == StatusType.COMPLETED
        assert len(result.checkbox_indicators) == 2
        assert all(checkbox.is_completed for checkbox in result.checkbox_indicators)
        assert result.confidence > 0.8
    
    def test_checkbox_parsing_pending(self):
        """Test recognition of pending checkbox patterns"""
        content = "- [ ] Task to do\n- [ ] Another pending task"
        result = self.parser.parse_chunk_status(content)
        
        assert result.status_type == StatusType.PENDING
        assert len(result.checkbox_indicators) == 2
        assert not any(checkbox.is_completed for checkbox in result.checkbox_indicators)
        assert result.confidence > 0.7
    
    def test_mixed_checkbox_patterns(self):
        """Test mixed checkbox patterns favor majority"""
        content = "- [x] Done task\n- [ ] Pending task\n- [ ] Another pending"
        result = self.parser.parse_chunk_status(content)
        
        assert result.status_type == StatusType.PENDING  # 2 pending vs 1 completed
        assert len(result.checkbox_indicators) == 3
    
    def test_progress_keywords(self):
        """Test progress keyword detection"""
        content = "This project is IN PROGRESS and shows current work"
        result = self.parser.parse_chunk_status(content)
        
        assert result.status_type == StatusType.IN_PROGRESS
        assert len(result.progress_markers) >= 1
        assert result.confidence > 0.6


class TestTemporalContextExtractor:
    """Test suite for temporal context extraction"""
    
    def setup_method(self):
        """Setup test configuration"""
        self.config = {
            'intelligence': {
                'temporal_context': {
                    'business_phases': {
                        'current_quarter': 'Q3 2025',
                        'current_week': 'Week 3',
                        'current_phase': 'Pre-Sprint Preparation'
                    },
                    'critical_dates': {
                        'sprint_start': '2025-08-20',
                        'sprint_end': '2025-08-22'
                    },
                    'relevance_decay': {
                        'current': 1.0,
                        'upcoming': 0.8,
                        'recent': 0.6,
                        'historical': 0.3
                    }
                }
            }
        }
        self.extractor = TemporalContextExtractor(self.config)
    
    def test_current_quarter_detection(self):
        """Test detection of current business quarter"""
        content = "Q3 2025 focus on Foundation Quarter goals"
        document_path = "planning/quarterly.md"
        
        result = self.extractor.extract_temporal_context(content, document_path)
        
        assert result.current_relevance > 0.8
        assert len(result.time_markers) >= 1
        assert any('Q3 2025' in marker.text for marker in result.time_markers)
    
    def test_week_detection(self):
        """Test detection of week references"""
        content = "Week 3 objectives and current sprint preparation"
        document_path = "planning/weekly.md"
        
        result = self.extractor.extract_temporal_context(content, document_path)
        
        assert result.current_relevance > 0.7
        assert any('Week 3' in marker.text for marker in result.time_markers)
    
    def test_deadline_awareness(self):
        """Test critical date recognition"""
        content = "Sprint scheduled for Aug 20-22 with deliverables"
        document_path = "planning/sprint.md"
        
        result = self.extractor.extract_temporal_context(content, document_path)
        
        assert result.urgency_score > 0.5
        assert len(result.time_markers) >= 1


class TestPriorityScoringEngine:
    """Test suite for priority scoring functionality"""
    
    def setup_method(self):
        """Setup test configuration"""
        self.config = {
            'intelligence': {
                'priority_scoring': {
                    'keyword_multipliers': {
                        'PRIMARY FOCUS': 2.0,
                        'CRITICAL': 1.8,
                        'Example Client': 1.7,
                        'Foundation Quarter': 1.3
                    },
                    'hierarchy_boosts': {
                        'strategic': 1.3,
                        'tactical': 1.1,
                        'operational': 1.0
                    },
                    'client_boosts': {
                        'current_client': 1.5,
                        'prospective_client': 1.2,
                        'general': 1.0
                    }
                }
            }
        }
        self.engine = PriorityScoringEngine(self.config)
    
    def test_priority_keyword_detection(self):
        """Test priority keyword recognition"""
        content = "PRIMARY FOCUS: Example Client engagement strategy"
        document_path = "business/client-andrew.md"
        
        result = self.engine.extract_priority_markers(content, document_path)
        
        assert len(result.priority_keywords) >= 2
        assert result.client_relevance_score > 1.0
        assert result.business_hierarchy_level <= 2  # Strategic/tactical
    
    def test_business_hierarchy_classification(self):
        """Test business hierarchy level detection"""
        strategic_content = "Long-term vision and philosophy for business growth"
        tactical_content = "Quarterly milestones and project deliverables"
        operational_content = "Daily tasks and weekly execution items"
        
        strategic_result = self.engine.extract_priority_markers(strategic_content, "philosophy/vision.md")
        tactical_result = self.engine.extract_priority_markers(tactical_content, "planning/quarterly.md")
        operational_result = self.engine.extract_priority_markers(operational_content, "tasks/weekly.md")
        
        assert strategic_result.business_hierarchy_level == 1  # Strategic
        assert tactical_result.business_hierarchy_level == 2   # Tactical
        assert operational_result.business_hierarchy_level == 3 # Operational
    
    def test_client_relevance_scoring(self):
        """Test client relevance assessment"""
        andrew_content = "Example Client sprint preparation and deliverables"
        general_content = "General business process documentation"
        
        andrew_result = self.engine.extract_priority_markers(andrew_content, "clients/andrew.md")
        general_result = self.engine.extract_priority_markers(general_content, "docs/processes.md")
        
        assert andrew_result.client_relevance_score > general_result.client_relevance_score


class TestIntelligenceProcessor:
    """Test suite for complete intelligence processing pipeline"""
    
    def setup_method(self):
        """Setup test configuration"""
        self.config = {
            'intelligence': {
                'enabled': True,
                'boost_cap': 3.0,
                'status_parsing': {
                    'checkbox_patterns': {
                        'completed': [r'\[x\]', r'\[X\]'],
                        'pending': [r'\[ \]'],
                        'in_progress': [r'\[-\]']
                    },
                    'progress_keywords': {
                        'completed': ['COMPLETED', 'DONE'],
                        'in_progress': ['IN PROGRESS', 'CURRENT'],
                        'pending': ['PENDING', 'TODO']
                    }
                },
                'temporal_context': {
                    'business_phases': {
                        'current_quarter': 'Q3 2025',
                        'current_week': 'Week 3'
                    },
                    'critical_dates': {
                        'sprint_start': '2025-08-20'
                    }
                },
                'priority_scoring': {
                    'keyword_multipliers': {
                        'PRIMARY FOCUS': 2.0,
                        'Example Client': 1.7
                    },
                    'hierarchy_boosts': {
                        'strategic': 1.3,
                        'tactical': 1.1,
                        'operational': 1.0
                    }
                }
            }
        }
        self.processor = IntelligenceProcessor(self.config)
    
    def test_complete_processing_pipeline(self):
        """Test end-to-end intelligence processing"""
        content = """
        PRIMARY FOCUS: Example Client Q3 2025 Sprint
        
        Week 3 Objectives:
        - [x] Complete initial analysis
        - [ ] Prepare sprint materials
        - [ ] Schedule kick-off meeting
        
        This is IN PROGRESS with current deliverables.
        """
        document_path = "clients/andrew/sprint-prep.md"
        
        result = self.processor.process_chunk_intelligence(content, document_path)
        
        # Validate complete metadata structure
        assert isinstance(result, IntelligenceMetadata)
        assert result.status_info.status_type == StatusType.IN_PROGRESS
        assert result.temporal_context.current_relevance > 0.7
        assert len(result.priority_markers.priority_keywords) >= 2
        assert 1.0 <= result.overall_boost <= 3.0  # Within boost cap
    
    def test_boost_cap_enforcement(self):
        """Test that intelligence boost is capped appropriately"""
        high_priority_content = """
        PRIMARY FOCUS: CRITICAL Example Client Foundation Quarter
        Week 3 current strategic vision COMPLETED
        """
        document_path = "strategic/andrew-critical.md"
        
        result = self.processor.process_chunk_intelligence(high_priority_content, document_path)
        
        assert result.overall_boost <= 3.0  # Boost cap enforced
        assert result.overall_boost > 1.0   # But still boosted
    
    def test_intelligence_disabled(self):
        """Test behavior when intelligence is disabled"""
        config_disabled = self.config.copy()
        config_disabled['intelligence']['enabled'] = False
        
        processor = IntelligenceProcessor(config_disabled)
        result = processor.process_chunk_intelligence("Any content", "any/path.md")
        
        assert result.overall_boost == 1.0  # No boost when disabled
        assert result.status_info.status_type == StatusType.UNKNOWN
    
    def test_error_handling_graceful_degradation(self):
        """Test graceful error handling with invalid content"""
        # Test with None content (should handle gracefully)
        result = self.processor.process_chunk_intelligence(None, "test/path.md")
        assert isinstance(result, IntelligenceMetadata)
        assert result.overall_boost == 1.0
        
        # Test with extremely long content
        massive_content = "x" * 100000
        result = self.processor.process_chunk_intelligence(massive_content, "test/large.md")
        assert isinstance(result, IntelligenceMetadata)


# Integration test combining all components
class TestIntelligenceIntegration:
    """Integration tests for intelligence features"""
    
    def test_real_world_content_processing(self):
        """Test with realistic memory-bank content"""
        realistic_config = {
            'intelligence': {
                'enabled': True,
                'boost_cap': 3.0,
                'status_parsing': {
                    'checkbox_patterns': {
                        'completed': [r'\[x\]', r'\[X\]'],
                        'pending': [r'\[ \]'],
                        'in_progress': [r'\[-\]', r'\[~\]']
                    },
                    'progress_keywords': {
                        'completed': ['COMPLETED', '✅', 'DONE', 'FINISHED'],
                        'in_progress': ['IN PROGRESS', '🔄', 'CURRENT', 'WORKING'],
                        'pending': ['PENDING', '📋', 'TODO', 'UPCOMING']
                    }
                },
                'temporal_context': {
                    'business_phases': {
                        'current_quarter': 'Q3 2025',
                        'current_week': 'Week 3',
                        'current_phase': 'Pre-Sprint Preparation'
                    },
                    'critical_dates': {
                        'sprint_start': '2025-08-20',
                        'sprint_end': '2025-08-22'
                    }
                },
                'priority_scoring': {
                    'keyword_multipliers': {
                        'PRIMARY FOCUS': 2.0,
                        'CRITICAL': 1.8,
                        'Example Client': 1.7,
                        'Foundation Quarter': 1.3,
                        'Week 3': 1.4
                    },
                    'hierarchy_boosts': {
                        'strategic': 1.3,
                        'tactical': 1.1,
                        'operational': 1.0
                    }
                }
            }
        }
        
        realistic_content = """
        # Example Client - Foundation Quarter Sprint Preparation
        
        ## PRIMARY FOCUS: Week 3 Pre-Sprint Activities
        
        ### Status Overview
        - [x] COMPLETED initial client discovery session
        - [x] COMPLETED technical requirements analysis  
        - [~] IN PROGRESS sprint planning materials
        - [ ] PENDING final stakeholder approval
        - [ ] TODO schedule Aug 20-22 sprint kick-off
        
        ### Current Strategic Objectives
        This is the CRITICAL phase for Q3 2025 Foundation Quarter success.
        All deliverables must align with the anti-rat race philosophy.
        
        ### Timeline
        Sprint dates: Aug 20-22, 2025
        Current week: Week 3 preparation phase
        """
        
        processor = IntelligenceProcessor(realistic_config)
        result = processor.process_chunk_intelligence(realistic_content, "clients/andrew/sprint-planning.md")
        
        # Comprehensive validation
        assert isinstance(result, IntelligenceMetadata)
        
        # Status intelligence validation
        assert result.status_info.status_type == StatusType.IN_PROGRESS
        assert len(result.status_info.checkbox_indicators) == 5
        assert result.status_info.completion_percentage > 0.3  # Some items completed
        assert result.status_info.confidence > 0.8
        
        # Temporal intelligence validation
        assert result.temporal_context.current_relevance > 0.8  # Highly current
        assert result.temporal_context.urgency_score > 0.5     # Sprint deadline approaching
        assert len(result.temporal_context.time_markers) >= 3  # Multiple time references
        
        # Priority intelligence validation
        assert len(result.priority_markers.priority_keywords) >= 3  # Multiple priority keywords
        assert result.priority_markers.business_hierarchy_level == 1  # Strategic level
        assert result.priority_markers.client_relevance_score > 1.5   # ExampleCorp client boost
        
        # Overall boost validation
        assert 2.0 <= result.overall_boost <= 3.0  # Significant but capped boost
        
        print(f"✅ Realistic content processing test passed:")
        print(f"   Status: {result.status_info.status_type.value} ({result.status_info.confidence:.2f})")
        print(f"   Temporal: {result.temporal_context.current_relevance:.2f} relevance")
        print(f"   Priority: {len(result.priority_markers.priority_keywords)} keywords")
        print(f"   Overall boost: {result.overall_boost:.2f}")


if __name__ == "__main__":
    # Run a quick smoke test
    print("Running MBIE Intelligence Test Suite...")
    
    # Basic smoke test
    config = {
        'intelligence': {
            'enabled': True,
            'boost_cap': 3.0,
            'status_parsing': {
                'checkbox_patterns': {
                    'completed': [r'\[x\]'],
                    'pending': [r'\[ \]']
                }
            },
            'temporal_context': {
                'business_phases': {'current_quarter': 'Q3 2025'}
            },
            'priority_scoring': {
                'keyword_multipliers': {'PRIMARY FOCUS': 2.0}
            }
        }
    }
    
    processor = IntelligenceProcessor(config)
    test_content = "PRIMARY FOCUS: [x] Q3 2025 completed task"
    result = processor.process_chunk_intelligence(test_content, "test.md")
    
    print(f"✅ Smoke test passed: boost={result.overall_boost:.2f}")
    print("Run with pytest for comprehensive testing.")