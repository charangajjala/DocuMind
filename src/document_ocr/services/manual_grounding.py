"""Manual visual grounding: map LLM-extracted values back to OCR blocks and bboxes.

This module builds bounding boxes and source block ids for values returned by the LLM
when the LLM was run in a text-only mode (no image/bboxes provided to it).
"""

from typing import Any, Dict, List, Optional, Tuple
import re

from ..models.domain import DocumentOCRResult, BoundingBox, GroundedDataField


def _normalize_text(value: Any) -> str:
    try:
        s = str(value).lower().strip()
    except Exception:
        return ""
    return re.sub(r"\s+", " ", s)


class ManualVisualGrounder:
    """Compute visual grounding using OCR blocks for LLM-provided extracted_data."""

    def __init__(self) -> None:
        pass

    def ground(
        self,
        extracted_data: Dict[str, Any],
        field_mappings: Dict[str, Any],
        ocr_results: DocumentOCRResult,
    ) -> List[GroundedDataField]:
        """Return grounded fields mirroring the existing output shape.

        We attempt exact and relaxed matches against OCR blocks and compute per-field confidence
        as the mean of matched OCR block confidences. When not found, mark as visual_only.
        """
        grounded: List[GroundedDataField] = []

        # Build a simple searchable list of (idx, text, norm_text)
        blocks = [(i, tb.text, _normalize_text(tb.text)) for i, tb in enumerate(ocr_results.text_blocks or [])]

        def match_value_to_block_ids(value: Any) -> List[int]:
            target = _normalize_text(value)
            if not target:
                return []

            # Prefer line/paragraph text that contains the target as a contiguous substring
            # We rely on the OCR result granularity already provided
            matches: List[int] = []
            for idx, _raw, norm in blocks:
                if target and target in norm:
                    matches.append(idx)
                    break
            return matches

        # Walk field_mappings to produce grounded entries (array-level reasoning nodes are kept by caller)
        def walk(prefix: str, node: Any):
            # Leaf mapping
            if isinstance(node, dict) and "value" in node:
                value = node.get("value")
                reasoning = node.get("reasoning")
                block_ids = match_value_to_block_ids(value)

                bboxes: List[BoundingBox] = []
                ocr_confs: List[float] = []
                for bid in block_ids:
                    if 0 <= bid < len(ocr_results.text_blocks):
                        tb = ocr_results.text_blocks[bid]
                        bboxes.append(tb.bounding_box)
                        if isinstance(getattr(tb, 'confidence', None), (int, float)):
                            ocr_confs.append(float(tb.confidence))

                confidence = (sum(ocr_confs) / len(ocr_confs)) if ocr_confs else float(node.get("confidence", 0.0) or 0.0)

                grounded.append(
                    GroundedDataField(
                        field_name=prefix,
                        value=value,
                        confidence=confidence,
                        source_text_blocks=block_ids if block_ids else (["visual_only"]) ,  # type: ignore
                        bounding_boxes=bboxes,
                        reasoning=reasoning,
                    )
                )
                return

            if isinstance(node, dict):
                for key, child in node.items():
                    new_prefix = f"{prefix}.{key}" if prefix else str(key)
                    walk(new_prefix, child)
            elif isinstance(node, list):
                for idx, child in enumerate(node):
                    new_prefix = f"{prefix}[{idx}]" if prefix else f"[{idx}]"
                    walk(new_prefix, child)

        walk("", field_mappings)
        return grounded


