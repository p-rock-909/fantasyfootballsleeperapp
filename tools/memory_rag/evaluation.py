"""
Evaluation framework for MBIE.

Tests query performance, relevance, and system reliability.
"""

import yaml
import time
import numpy as np
from pathlib import Path
from typing import Dict, List, Optional
import logging

from .core import LocalEmbedder, HybridSearcher


class Evaluator:
    """
    Evaluates MBIE performance against test queries.
    
    Metrics:
    - Top-5 relevance: % of queries with expected result in top 5
    - P95 latency: 95th percentile query latency
    - MRR@10: Mean Reciprocal Rank at 10
    - Coverage: % of expected sections found
    """
    
    def __init__(self, config: dict):
        self.config = config
        self.eval_file = Path(config['storage']['eval_path'])
        self.logger = logging.getLogger(__name__)
        
        # Initialize search components
        self.embedder = LocalEmbedder(config)
        self.searcher = HybridSearcher(config, self.embedder)
        self.searcher.create_or_load_collection()
        
    def load_test_queries(self) -> List[Dict]:
        """Load test queries from eval.yml"""
        if not self.eval_file.exists():
            # Create default eval file if it doesn't exist
            self._create_default_eval_file()
            
        with open(self.eval_file, 'r') as f:
            data = yaml.safe_load(f)
            
        return data.get('test_queries', [])
        
    def _create_default_eval_file(self):
        """Create a default evaluation file with sample queries"""
        default_eval = {
            'test_queries': [
                {
                    'query': 'current business priorities Q3 2025',
                    'expected_sections': [
                        'activeContext.md#current-focus',
                        'projectbrief.md#q3-2025-foundation-quarter'
                    ],
                    'domain': 'business'
                },
                {
                    'query': 'ExampleCorp client engagement status',
                    'expected_sections': [
                        'activeContext.md#week-4-sprint',
                        'progress.md#recent-updates'
                    ],
                    'domain': 'business'
                },
                {
                    'query': 'automation suite components',
                    'expected_sections': [
                        'features/automation-suite/README.md',
                        'systemPatterns.md#automation-patterns'
                    ],
                    'domain': 'automation'
                },
                {
                    'query': 'health optimization protocols',
                    'expected_sections': [
                        'activeContext.md#health-protocol',
                        'user-notes.md#health'
                    ],
                    'domain': 'health'
                },
                {
                    'query': 'anti-rat race philosophy',
                    'expected_sections': [
                        'user-notes.md#anti-rat-race',
                        'projectbrief.md#philosophy'
                    ],
                    'domain': 'philosophy'
                }
            ],
            'success_gates': {
                'p95_latency_ms': 500,
                'top5_relevance': 0.85,
                'mrr_at_10': 0.7,
                'coverage': 1.0
            }
        }
        
        self.eval_file.parent.mkdir(parents=True, exist_ok=True)
        
        with open(self.eval_file, 'w') as f:
            yaml.dump(default_eval, f, default_flow_style=False)
            
        self.logger.info(f"Created default evaluation file: {self.eval_file}")
        
    def run_evaluation(self) -> Dict:
        """
        Run evaluation on test queries.
        
        Returns:
            Dictionary with evaluation metrics
        """
        test_queries = self.load_test_queries()
        
        if not test_queries:
            self.logger.warning("No test queries found")
            return {}
            
        results = {
            'total_queries': len(test_queries),
            'successful_queries': 0,
            'failed_queries': [],
            'latencies': [],
            'relevance_scores': [],
            'mrr_scores': []
        }
        
        for test_case in test_queries:
            query = test_case['query']
            expected_sections = test_case['expected_sections']
            domain = test_case.get('domain')
            
            # Measure query latency
            start_time = time.time()
            search_results = self.searcher.search(query, domain=domain)
            latency = (time.time() - start_time) * 1000  # Convert to ms
            results['latencies'].append(latency)
            
            # Check if expected sections are in results
            found_citations = [r.citation for r in search_results[:10]]
            
            # Calculate relevance (top-5)
            top5_found = False
            for expected in expected_sections:
                # Normalize citation format for comparison
                normalized_expected = self._normalize_citation(expected)
                for citation in found_citations[:5]:
                    if normalized_expected in self._normalize_citation(citation):
                        top5_found = True
                        break
                        
            if top5_found:
                results['relevance_scores'].append(1.0)
                results['successful_queries'] += 1
            else:
                results['relevance_scores'].append(0.0)
                results['failed_queries'].append(query)
                
            # Calculate MRR (Mean Reciprocal Rank)
            mrr = 0.0
            for i, citation in enumerate(found_citations, 1):
                for expected in expected_sections:
                    if self._normalize_citation(expected) in self._normalize_citation(citation):
                        mrr = 1.0 / i
                        break
                if mrr > 0:
                    break
            results['mrr_scores'].append(mrr)
            
        # Calculate aggregate metrics
        final_results = {
            'top5_relevance': np.mean(results['relevance_scores']) if results['relevance_scores'] else 0.0,
            'p95_latency': np.percentile(results['latencies'], 95) if results['latencies'] else 0.0,
            'mrr_at_10': np.mean(results['mrr_scores']) if results['mrr_scores'] else 0.0,
            'coverage': results['successful_queries'] / results['total_queries'] if results['total_queries'] > 0 else 0.0,
            'failed_queries': results['failed_queries'],
            'mean_latency': np.mean(results['latencies']) if results['latencies'] else 0.0,
            'median_latency': np.median(results['latencies']) if results['latencies'] else 0.0
        }
        
        return final_results
        
    def _normalize_citation(self, citation: str) -> str:
        """Normalize citation for comparison"""
        # Remove .md extension if present
        citation = citation.replace('.md', '')
        # Convert to lowercase
        citation = citation.lower()
        # Replace hyphens with spaces in section names
        parts = citation.split('#')
        if len(parts) > 1:
            parts[1] = parts[1].replace('-', ' ')
        return '#'.join(parts)
        
    def run_performance_test(self, num_queries: int = 100) -> Dict:
        """
        Run performance test with synthetic queries.
        
        Args:
            num_queries: Number of test queries to run
            
        Returns:
            Performance metrics
        """
        # Generate synthetic queries
        test_queries = [
            "business strategy consulting",
            "automation python scripts",
            "health biomarkers optimization",
            "anti-rat race philosophy",
            "client engagement andrew",
            "reddit automation system",
            "memory bank navigation",
            "supabase database setup",
            "firebase authentication",
            "cholesterol insights calculator"
        ]
        
        latencies = []
        
        for i in range(num_queries):
            query = test_queries[i % len(test_queries)]
            
            start_time = time.time()
            _ = self.searcher.search(query)
            latency = (time.time() - start_time) * 1000
            
            latencies.append(latency)
            
        return {
            'num_queries': num_queries,
            'mean_latency': np.mean(latencies),
            'median_latency': np.median(latencies),
            'p50_latency': np.percentile(latencies, 50),
            'p95_latency': np.percentile(latencies, 95),
            'p99_latency': np.percentile(latencies, 99),
            'min_latency': np.min(latencies),
            'max_latency': np.max(latencies)
        }