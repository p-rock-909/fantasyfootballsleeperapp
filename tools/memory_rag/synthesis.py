"""
Result synthesis and organization

Intelligently groups and formats search results for better readability
and multi-document comprehension.
"""

from typing import List, Dict
from pathlib import Path
import logging

logger = logging.getLogger(__name__)


class SearchResult:
    """Simple result representation for synthesis (matches core.SearchResult)"""
    def __init__(self, score: float, chunk, citation: str = ""):
        self.score = score
        self.chunk = chunk
        self.citation = citation


class ResultGrouper:
    """Group search results by source document for clarity"""

    def group_by_document(self, results: List) -> Dict[str, List]:
        """Group results by their source document"""
        grouped = {}

        for result in results:
            # Extract document path from chunk
            if hasattr(result.chunk, 'document_path'):
                doc_path = result.chunk.document_path
            elif hasattr(result.chunk, 'file_path'):
                doc_path = result.chunk.file_path
            else:
                doc_path = "Unknown"

            if doc_path not in grouped:
                grouped[doc_path] = []
            grouped[doc_path].append(result)

        return grouped

    def format_grouped_results(self, results: List, include_scores: bool = True) -> str:
        """Format grouped results for display"""
        if not results:
            return "No results found. Try rephrasing your query."

        grouped = self.group_by_document(results)

        output_lines = []
        output_lines.append("\n" + "="*70)
        output_lines.append(f"SEARCH RESULTS ({len(results)} relevant sections)")
        output_lines.append("="*70 + "\n")

        for i, (doc_path, doc_results) in enumerate(sorted(grouped.items()), 1):
            # Document header with file path
            doc_name = Path(doc_path).name if "/" in doc_path else doc_path
            output_lines.append(f"[{i}] {doc_name}")
            output_lines.append("-" * 70)

            # Sections from this document
            for j, result in enumerate(doc_results, 1):
                section_header = getattr(result.chunk, 'section_header', 'Content')
                content = getattr(result.chunk, 'content', 'No content')

                output_lines.append(f"\n    {j}. {section_header}")

                if include_scores:
                    score_percent = int(result.score * 100)
                    output_lines.append(f"       Relevance: {score_percent}%")

                # Preview first 250 chars of content
                preview = content[:250].replace('\n', ' ')
                if len(content) > 250:
                    preview += "..."
                output_lines.append(f"       {preview}")

                # Citation if available
                if hasattr(result, 'citation') and result.citation:
                    output_lines.append(f"       {result.citation}")

                output_lines.append("")

            output_lines.append("\n")

        output_lines.append("="*70)
        output_lines.append(f"Total: {len(results)} sections from {len(grouped)} documents")
        output_lines.append("="*70 + "\n")

        return "\n".join(output_lines)

    def format_flat_results(self, results: List, include_scores: bool = True) -> str:
        """Format results as a flat list (original format)"""
        if not results:
            return "No results found. Try rephrasing your query."

        output_lines = []
        output_lines.append(f"\nFound {len(results)} relevant sections:\n")

        for i, result in enumerate(results, 1):
            section_header = getattr(result.chunk, 'section_header', 'Content')
            content = getattr(result.chunk, 'content', 'No content')
            doc_path = getattr(result.chunk, 'document_path', 'Unknown')

            output_lines.append(f"{i}. {section_header}")
            if include_scores:
                score_percent = int(result.score * 100)
                output_lines.append(f"   Relevance: {score_percent}%")
            output_lines.append(f"   File: {doc_path}")

            # Preview
            preview = content[:200].replace('\n', ' ')
            if len(content) > 200:
                preview += "..."
            output_lines.append(f"   {preview}")

            if hasattr(result, 'citation') and result.citation:
                output_lines.append(f"   Citation: {result.citation}")

            output_lines.append("")

        return "\n".join(output_lines)

    def get_summary_stats(self, results: List) -> Dict:
        """Get summary statistics about results"""
        if not results:
            return {
                'total_results': 0,
                'documents': 0,
                'avg_relevance': 0.0,
                'max_relevance': 0.0,
                'min_relevance': 0.0,
            }

        grouped = self.group_by_document(results)
        scores = [result.score for result in results]

        return {
            'total_results': len(results),
            'documents': len(grouped),
            'avg_relevance': sum(scores) / len(scores) if scores else 0.0,
            'max_relevance': max(scores) if scores else 0.0,
            'min_relevance': min(scores) if scores else 0.0,
        }


# Global instance
grouper = ResultGrouper()


def format_results(results: List, grouped: bool = True, include_scores: bool = True) -> str:
    """
    Format results with intelligent grouping

    Args:
        results: List of search results
        grouped: If True, group by document; if False, flat list
        include_scores: If True, include relevance scores

    Returns:
        Formatted string for display
    """
    if grouped:
        return grouper.format_grouped_results(results, include_scores=include_scores)
    else:
        return grouper.format_flat_results(results, include_scores=include_scores)
