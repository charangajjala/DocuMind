"""Text element optimization service for efficient LLM processing."""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from enum import Enum

from ..models.domain import TextBlock, BoundingBox


logger = logging.getLogger(__name__)


class OptimizationStrategy(Enum):
    """Different strategies for optimizing text elements."""
    HIERARCHICAL = "hierarchical"  # Use only highest level non-overlapping elements
    SEMANTIC = "semantic"         # Prioritize semantic elements (blocks, paragraphs)
    SPATIAL = "spatial"           # Remove spatially redundant elements
    HYBRID = "hybrid"            # Combine multiple strategies


@dataclass
class OptimizationConfig:
    """Configuration for text element optimization."""
    strategy: OptimizationStrategy = OptimizationStrategy.HYBRID
    max_elements: int = 200  # Maximum elements to send to LLM
    prefer_element_types: List[str] = None  # Preferred element types in order
    remove_overlapping: bool = True  # Remove spatially overlapping elements
    merge_adjacent: bool = True  # Merge adjacent elements of same type


class TextElementOptimizer:
    """Optimizes text elements for efficient LLM processing."""
    
    def __init__(self, config: OptimizationConfig = None):
        """Initialize optimizer with configuration."""
        self.config = config or OptimizationConfig()
        if self.config.prefer_element_types is None:
            # Default preference order: semantic first, then spatial granularity
            self.config.prefer_element_types = ["block", "paragraph", "line", "token"]
        
    def optimize_for_llm(
        self, 
        text_blocks: List[TextBlock],
        json_schema: Dict[str, Any] = None,
        user_context: str = None
    ) -> List[TextBlock]:
        """Optimize text blocks for LLM processing.
        
        Args:
            text_blocks: All OCR text blocks
            json_schema: Target extraction schema (unused, kept for compatibility)
            user_context: User-provided context (unused, kept for compatibility)
            
        Returns:
            Optimized list of text blocks
        """
        logger.info(f"Optimizing {len(text_blocks)} text blocks for LLM processing")
        
        if len(text_blocks) <= self.config.max_elements:
            logger.info("Text blocks already within limit, returning as-is")
            return text_blocks
        
        # Apply optimization strategy
        if self.config.strategy == OptimizationStrategy.HIERARCHICAL:
            optimized = self._hierarchical_optimization(text_blocks)
        elif self.config.strategy == OptimizationStrategy.SEMANTIC:
            optimized = self._semantic_optimization(text_blocks)
        elif self.config.strategy == OptimizationStrategy.SPATIAL:
            optimized = self._spatial_optimization(text_blocks)
        else:  # HYBRID
            optimized = self._hybrid_optimization(text_blocks)
        
        logger.info(f"Optimized to {len(optimized)} text blocks ({len(text_blocks) - len(optimized)} removed)")
        return optimized[:self.config.max_elements]  # Final safety limit
    
    def _hierarchical_optimization(self, text_blocks: List[TextBlock]) -> List[TextBlock]:
        """Use hierarchical approach - prefer higher-level elements."""
        # Group by element type
        by_type = self._group_by_element_type(text_blocks)
        
        # Start with preferred types and add non-overlapping elements
        result = []
        used_areas = []
        
        for element_type in self.config.prefer_element_types:
            if element_type not in by_type:
                continue
                
            for block in by_type[element_type]:
                if not self._overlaps_with_any(block.bounding_box, used_areas):
                    result.append(block)
                    used_areas.append(block.bounding_box)
                    
                    if len(result) >= self.config.max_elements:
                        return result
        
        return result
    
    def _semantic_optimization(self, text_blocks: List[TextBlock]) -> List[TextBlock]:
        """Prioritize semantic elements (blocks and paragraphs)."""
        # Filter by semantic importance
        semantic_priority = {"block": 4, "paragraph": 3, "line": 2, "token": 1}
        
        # Score elements by semantic importance
        scored_blocks = [
            (block, semantic_priority.get(block.element_type, 0))
            for block in text_blocks
        ]
        
        # Sort by score (descending)
        scored_blocks.sort(key=lambda x: x[1], reverse=True)
        
        return [block for block, _ in scored_blocks]
    
    def _spatial_optimization(self, text_blocks: List[TextBlock]) -> List[TextBlock]:
        """Remove spatially redundant elements."""
        if not self.config.remove_overlapping:
            return text_blocks
        
        # Sort by area (descending) to prefer larger elements
        sorted_blocks = sorted(
            text_blocks, 
            key=lambda x: self._get_bounding_box_area(x.bounding_box),
            reverse=True
        )
        
        result = []
        for block in sorted_blocks:
            if not any(self._is_significantly_overlapping(block.bounding_box, existing.bounding_box) 
                      for existing in result):
                result.append(block)
        
        return result
    
    def _hybrid_optimization(
        self, 
        text_blocks: List[TextBlock]
    ) -> List[TextBlock]:
        """Combine spatial and semantic optimization strategies."""
        logger.info("Applying hybrid optimization strategy")
        
        # Step 1: Remove highly overlapping elements (prefer larger/higher-level)
        spatial_filtered = self._spatial_optimization(text_blocks)
        logger.info(f"After spatial filtering: {len(spatial_filtered)} blocks")
        
        # Step 2: Prioritize semantic elements
        semantic_scored = self._semantic_optimization(spatial_filtered)
        logger.info(f"After semantic prioritization: {len(semantic_scored)} blocks")
        
        return semantic_scored
    
    def _group_by_element_type(self, text_blocks: List[TextBlock]) -> Dict[str, List[TextBlock]]:
        """Group text blocks by element type."""
        groups = {}
        for block in text_blocks:
            element_type = block.element_type
            if element_type not in groups:
                groups[element_type] = []
            groups[element_type].append(block)
        return groups
    
    def _overlaps_with_any(self, bbox: BoundingBox, existing_bboxes: List[BoundingBox]) -> bool:
        """Check if bounding box overlaps significantly with any existing ones."""
        for existing in existing_bboxes:
            if self._is_significantly_overlapping(bbox, existing):
                return True
        return False
    
    def _is_significantly_overlapping(self, bbox1: BoundingBox, bbox2: BoundingBox) -> bool:
        """Check if two bounding boxes overlap significantly (>50%)."""
        # Calculate intersection
        x_overlap = max(0, min(bbox1.x_max, bbox2.x_max) - max(bbox1.x_min, bbox2.x_min))
        y_overlap = max(0, min(bbox1.y_max, bbox2.y_max) - max(bbox1.y_min, bbox2.y_min))
        
        intersection_area = x_overlap * y_overlap
        
        # Calculate areas
        area1 = (bbox1.x_max - bbox1.x_min) * (bbox1.y_max - bbox1.y_min)
        area2 = (bbox2.x_max - bbox2.x_min) * (bbox2.y_max - bbox2.y_min)
        
        # Check if intersection is >50% of either area
        overlap_ratio1 = intersection_area / area1 if area1 > 0 else 0
        overlap_ratio2 = intersection_area / area2 if area2 > 0 else 0
        
        return max(overlap_ratio1, overlap_ratio2) > 0.5
    
    def _get_bounding_box_area(self, bbox: BoundingBox) -> float:
        """Calculate bounding box area."""
        return (bbox.x_max - bbox.x_min) * (bbox.y_max - bbox.y_min)
    
    def get_optimization_summary(self, original_count: int, optimized_count: int) -> Dict[str, Any]:
        """Get summary of optimization results."""
        reduction_percentage = ((original_count - optimized_count) / original_count) * 100 if original_count > 0 else 0
        
        return {
            "original_count": original_count,
            "optimized_count": optimized_count,
            "elements_removed": original_count - optimized_count,
            "reduction_percentage": round(reduction_percentage, 1),
            "strategy_used": self.config.strategy.value,
            "max_elements_limit": self.config.max_elements
        }
