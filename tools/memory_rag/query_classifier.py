"""
Query type classification and auto-detection

Hybrid keyword + NLP-based classification to automatically detect query types
(temporal, urgent, foundational, status) and apply appropriate filters.
"""

import logging
from typing import Tuple, Dict, List

logger = logging.getLogger(__name__)


class QueryClassifier:
    """Classify queries as temporal, urgent, foundational, or status-based"""

    # Training data for classification
    TRAINING_DATA = {
        "temporal": [
            "What are we working on now?",
            "What's happening today?",
            "What's the current priority?",
            "What are we doing right now?",
            "What's being worked on?",
            "What's in progress?",
            "Tell me about Andrew's recent sprint",
            "What happened in August?",
            "What's the latest update?",
            "What are we currently building?",
            "What's the current focus?",
            "What's active right now?",
            "What's currently happening?",
        ],
        "urgent": [
            "What's urgent?",
            "What's the deadline?",
            "What needs immediate attention?",
            "What's the next deadline?",
            "What's ASAP?",
            "What needs to ship now?",
            "What's critical?",
            "What's blocking progress?",
            "What's on fire?",
            "What's the emergency?",
        ],
        "foundational": [
            "What is Randy's brand?",
            "What are the core frameworks?",
            "What's the origin story?",
            "How does the Business Clarity Engine work?",
            "What's Randy's philosophy?",
            "What does Randy NOT believe in?",
            "What are the anti-rat-race principles?",
            "How did Andrew's transformation work?",
            "What's the strategic vision?",
            "What's the business model?",
            "Explain the 8 Machines framework",
            "What are the core principles?",
        ],
        "status": [
            "What tasks are pending?",
            "What's completed?",
            "What's in progress?",
            "Which items are done?",
            "What's the status?",
            "What's pending?",
            "What's finished?",
            "What needs to be started?",
            "What's the progress?",
            "What's the state?",
        ]
    }

    def __init__(self):
        self.trained = True  # Mark as trained since we use keyword-based approach
        logger.info("QueryClassifier initialized with keyword-based classification")

    def classify(self, query: str) -> Tuple[str, float]:
        """
        Classify a query and return (query_type, confidence)

        Args:
            query: The search query to classify

        Returns:
            tuple: (query_type: str, confidence: float)
                - query_type: 'temporal', 'urgent', 'foundational', or 'status'
                - confidence: float between 0.0 and 1.0
        """
        query_lower = query.lower()

        # Calculate keyword match scores for each type
        scores = {}
        for qtype, examples in self.TRAINING_DATA.items():
            score = self._calculate_keyword_similarity(query_lower, examples)
            scores[qtype] = score

        # Find the highest scoring type
        if not scores:
            return ("foundational", 0.5)

        best_type = max(scores.items(), key=lambda x: x[1])
        query_type, confidence = best_type

        logger.debug(f"Query classification: {query_type} (confidence: {confidence:.2f})")

        return (query_type, confidence)

    def _calculate_keyword_similarity(self, query: str, examples: List[str]) -> float:
        """Calculate similarity between query and example queries"""
        query_words = set(query.split())
        max_similarity = 0.0

        for example in examples:
            example_words = set(example.lower().split())
            # Calculate Jaccard similarity
            intersection = len(query_words & example_words)
            union = len(query_words | example_words)
            if union > 0:
                similarity = intersection / union
                max_similarity = max(max_similarity, similarity)

        return max_similarity


def detect_query_type(query: str) -> Dict[str, bool]:
    """
    Detect query type using hybrid keyword approach

    Args:
        query: The search query to analyze

    Returns:
        dict: Filters to apply (e.g., {'current_only': True})
    """
    classifier = QueryClassifier()

    # Classify the query
    query_type, confidence = classifier.classify(query)

    filters = {}

    # Apply filters only with sufficient confidence (>0.5)
    # This threshold prevents false positives while catching clear temporal/urgent queries
    if confidence > 0.5:
        if query_type == 'temporal':
            filters['current_only'] = True
            logger.debug(f"Auto-detected temporal query (confidence: {confidence:.2f})")
        elif query_type == 'urgent':
            filters['urgent_only'] = True
            logger.debug(f"Auto-detected urgent query (confidence: {confidence:.2f})")
        # foundational and status queries don't trigger auto-filters
    else:
        logger.debug(f"Low confidence classification ({confidence:.2f}), no auto-filter applied")

    return filters


def should_apply_auto_detection(current_only: bool, urgent_only: bool, status: str) -> bool:
    """Check if auto-detection should be applied (no manual filters already set)"""
    return not (current_only or urgent_only or status)
