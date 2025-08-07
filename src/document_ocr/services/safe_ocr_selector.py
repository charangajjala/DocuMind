"""Safe OCR Selector for non-destructive subset optimization (SSSO)."""

from __future__ import annotations

import copy
from typing import List, Dict, Optional

from ..models.domain import DocumentOCRResult, TextBlock


class SafeOCRSelector:
    """Select a safe subset of OCR blocks without modifying originals.

    - Never mutates the original `DocumentOCRResult`.
    - Copies selected `TextBlock`s and sets their `original_index` to the index
      from the original OCR list, so the LLM can reference stable IDs.
    - Removes obvious redundancy (exact duplicates, fully contained parents) while
      preserving specificity (token > line > paragraph > block).
    """

    SPECIFICITY_SCORE = {
        "token": 4,
        "line": 3,
        "paragraph": 2,
        "block": 1,
    }

    def __init__(self, min_preserve_ratio: float = 0.8):
        self.min_preserve_ratio = min_preserve_ratio

    def select_subset(
        self,
        ocr_results: DocumentOCRResult,
        json_schema: Optional[Dict] = None,
    ) -> DocumentOCRResult:
        blocks = ocr_results.text_blocks or []
        if not blocks:
            # Return an empty subset result that still preserves other fields
            return DocumentOCRResult(
                full_text=ocr_results.full_text,
                text_blocks=[],
                image_width=ocr_results.image_width,
                image_height=ocr_results.image_height,
                processing_time=ocr_results.processing_time,
                image_quality=ocr_results.image_quality,
                original_image_info=ocr_results.original_image_info,
            )

        analysis = self._analyze_blocks(blocks, json_schema)
        selected_indices = self._select_indices(blocks, analysis)

        # Copy selected blocks and assign original_index
        selected_blocks: List[TextBlock] = []
        for idx in selected_indices:
            copied = copy.deepcopy(blocks[idx])
            copied.original_index = idx
            selected_blocks.append(copied)

        # Preserve overall metadata; only the text_blocks are subsetted
        return DocumentOCRResult(
            full_text=ocr_results.full_text,
            text_blocks=selected_blocks,
            image_width=ocr_results.image_width,
            image_height=ocr_results.image_height,
            processing_time=ocr_results.processing_time,
            image_quality=ocr_results.image_quality,
            original_image_info=ocr_results.original_image_info,
        )

    def _analyze_blocks(self, blocks: List[TextBlock], json_schema: Optional[Dict]) -> Dict:
        return {
            "duplicates": self._find_duplicates(blocks),
            "containments": self._find_containments(blocks),
            "scores": self._compute_scores(blocks, json_schema),
        }

    def _find_duplicates(self, blocks: List[TextBlock]) -> List[List[int]]:
        from collections import defaultdict
        groups = defaultdict(list)
        for i, b in enumerate(blocks):
            key = b.text.strip().lower()
            if key:
                groups[key].append(i)
        return [g for g in groups.values() if len(g) > 1]

    def _find_containments(self, blocks: List[TextBlock]) -> Dict[int, List[int]]:
        containments: Dict[int, List[int]] = {}
        for i, small in enumerate(blocks):
            text_small = small.text.strip()
            if not text_small:
                continue
            for j, large in enumerate(blocks):
                if i == j:
                    continue
                text_large = large.text
                if not text_large:
                    continue
                if (
                    text_small in text_large
                    and self.SPECIFICITY_SCORE.get(small.element_type, 0)
                    > self.SPECIFICITY_SCORE.get(large.element_type, 0)
                ):
                    containments.setdefault(j, []).append(i)
        return containments

    def _compute_scores(self, blocks: List[TextBlock], json_schema: Optional[Dict]) -> List[float]:
        scores: List[float] = []
        has_schema = bool(json_schema and isinstance(json_schema, dict))
        for b in blocks:
            specificity = self.SPECIFICITY_SCORE.get(b.element_type, 1)
            quality = max(0.0, min(1.0, b.confidence))
            relevance = 1.0 if has_schema else 0.5
            scores.append((specificity * 0.4) + (quality * 0.3) + (relevance * 0.3))
        return scores

    def _select_indices(self, blocks: List[TextBlock], analysis: Dict) -> List[int]:
        n = len(blocks)
        selected = set(range(n))

        # Remove lower-scoring exact duplicates
        for group in analysis["duplicates"]:
            best = max(group, key=lambda i: analysis["scores"][i])
            for idx in group:
                if idx != best:
                    selected.discard(idx)

        # Prefer specifics: if a larger block is fully covered by selected smaller ones, drop the large
        for large_idx, smalls in analysis["containments"].items():
            if all(s in selected for s in smalls):
                selected.discard(large_idx)

        # Ensure minimum preservation ratio
        min_keep = max(1, int(self.min_preserve_ratio * n))
        if len(selected) < min_keep:
            discarded = sorted(
                set(range(n)) - selected,
                key=lambda i: analysis["scores"][i],
                reverse=True,
            )
            for idx in discarded:
                if len(selected) >= min_keep:
                    break
                selected.add(idx)

        return sorted(selected)


