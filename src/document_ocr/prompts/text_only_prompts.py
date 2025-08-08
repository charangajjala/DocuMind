"""Prompt helpers for OCR-text-only extraction (manual grounding flow)."""

from typing import Optional


def get_text_only_user_override(document_type: Optional[str] = None) -> str:
    """Return the mandatory user prompt override for OCR-only runs.

    Keeps instructions focused on returning extracted_data and a compact reasoning_map,
    with no field_mappings or visual grounding.
    """
    header = "\nTEXT-ONLY MODE (MANDATORY):"
    dt = f"\n• Document Type: {document_type}" if document_type else ""
    body = f"""
• You do NOT have access to bounding boxes or OCR block lists.{dt}
• Do NOT return field_mappings.
• Output MUST include:
  - extracted_data: object per schema/user instructions
  - reasoning_map: object mapping fully-qualified field paths to compact reasoning
    (for arrays, include array-level keys like "tags" and type-level keys like "items[].sku"; avoid per-index reasoning unless exceptional).
  - visual_only_confidence (optional): per-field confidence ONLY when the value is not present in OCR and inferred purely from visual context.
• Reasoning for each field (2–4 short bullets, ≤ ~80 words) must ONLY cover:
  - Why this value belongs to the field (semantic justification)
  - Where it is located visually (section/region/table/nearby label)
  - What visual/textual cues make the association correct (labels, headers, alignment, formatting)
• Do not attempt visual grounding or block selection.
"""
    return header + body


