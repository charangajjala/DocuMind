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
        anchors: Optional[List[str]] = None,
    ) -> List[GroundedDataField]:
        """Return grounded fields mirroring the existing output shape.

        We attempt exact and relaxed matches against OCR blocks and compute per-field confidence
        as the mean of matched OCR block confidences. When not found, mark as visual_only.
        """
        grounded: List[GroundedDataField] = []

        # Build a simple searchable list of (idx, text, norm_text)
        blocks = [(i, tb.text, _normalize_text(tb.text)) for i, tb in enumerate(ocr_results.text_blocks or [])]
        anchor_set = {a.lower() for a in (anchors or []) if isinstance(a, str) and len(a) > 2}

        def _build_number_regex(val: str) -> Optional[re.Pattern]:
            # Accept 1,234.50 or 1 234,50 variations; tolerate spaces/commas
            try:
                _ = float(val.replace(',', ''))
            except Exception:
                return None
            # Escape digits while allowing optional thousands separators and optional decimal part
            # Convert the given number into a flexible pattern
            parts = val.replace(',', '')
            return re.compile(r"\b" + re.sub(r"(\d)(?=\d)", r"\\d[ ,]?", re.escape(parts)) + r"\b")

        def match_value_to_block_ids(value: Any) -> List[int]:
            target = _normalize_text(value)
            if not target:
                return []

            # Tolerant numeric matching
            num_rx = _build_number_regex(str(value)) if isinstance(value, (int, float, str)) else None

            # Prefer line/paragraph text that contains the target as a contiguous substring
            for idx, _raw, norm in blocks:
                if target and target in norm:
                    return [idx]
                if num_rx and num_rx.search(norm):
                    return [idx]

            # Try adjacent concatenations (merge up to next 2 blocks)
            for i in range(len(blocks)):
                merged = blocks[i][2]
                ids = [blocks[i][0]]
                for j in range(1, 3):
                    if i + j < len(blocks):
                        merged = merged + " " + blocks[i + j][2]
                        ids.append(blocks[i + j][0])
                        if target in merged or (num_rx and num_rx.search(merged)):
                            return ids

            # Anchor-based inclusion: if a block has multiple anchor tokens, accept as candidate
            if anchor_set:
                for idx, _raw, norm in blocks:
                    hits = sum(1 for a in anchor_set if a in norm)
                    if hits >= 2:
                        return [idx]

            return []

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


