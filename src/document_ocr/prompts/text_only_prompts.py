"""Prompt helpers for OCR-text-only extraction (manual grounding flow).

Clean, dedicated prompts for manual mode WITHOUT any field-mapping or block selection instructions.
The model should ONLY return extracted_data, reasoning_map, and optional visual_only_confidence.
"""

from typing import Optional, Dict, Any
import json
from ..models.extraction_response import TextOnlyExtractionResponse


def get_text_only_user_override(document_type: Optional[str] = None) -> str:
    """Return the mandatory user prompt override for OCR-only runs.

    Keeps instructions focused on returning extracted_data and a compact reasoning_map
    """

    dt = f"\n• Document Type: {document_type}" if document_type else ""
    body = f"""
{dt}

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
    return body


def get_text_only_system_prompt(
    json_schema: Optional[Dict[str, Any]],
    full_text: str,
    document_type: Optional[str] = None,
) -> str:
    """System prompt for manual (OCR-only) extraction.

    Includes raw OCR full text and optional schema context.
    """
    parts = [
        "You are a precise, multi-modal information extraction assistant.",
        "You will receive the OCR full text and the image.",
        "Your task is to extract structured data with high accuracy, using BOTH visual analysis and OCR text.",
        "\nVISUAL INTELLIGENCE (MANDATORY):",
        "• Use visual layout, tables, columns, headers, badges, icons, and alignment to find and confirm values.",
        "• Reconcile OCR discrepancies with visual context (labels, column headers, grouping, typography, spatial proximity).",
        "• Infer structure from the image: tables → rows/columns, key-value regions → labels and values, headers/sections → field context.",
        "\nDISAMBIGUATION & CONFLICT RESOLUTION:",
        "• When the same value appears multiple times, pick the instance closest to the most relevant label/anchor and consistent with schema expectations.",
        "• If OCR text conflicts with visible text, prefer visually clear content and explain the decision briefly in the reasoning_map.",
        "• If the image shows partial characters or breaks across lines, reconstruct the value using visual continuity (row/column alignment, kerning, baseline).",
        "• When a field is optional and genuinely absent, return null (do not guess).",
        "\nTABLES & ARRAYS (VISUAL UNDERSTANDING):",
        "• Detect header rows by typography/position; assign columns to fields (e.g., SKU, QTY, PRICE).",
        "• Align rows by y‑proximity; bind values across columns within the same row.",
        "• For primitive arrays, read ordered sequences (top→bottom / left→right) respecting table/grid structure.",
        "\nDATA TYPING:",
        "• Parse numbers and dates carefully but DO NOT reformat the final output (data integrity in the user prompt governs formatting).",
        "• If a value mixes units/symbols, keep the raw numeric value and unit as separate fields only if the schema requires it; otherwise preserve the source text form as value.",
    ]
    if document_type:
        parts.append(f"Document Type: {document_type}")
    if json_schema:
        parts.append("Data Extraction Schema (what to extract):\n" + json.dumps(json_schema, indent=2))
    parts.append("OCR Full Text (verbatim):\n" + full_text)
    return "\n\n".join(parts)


def get_text_only_user_prompt(
    user_prompt: Optional[str],
) -> str:
    """User prompt for manual (OCR-only) extraction.

    Explicitly defines the output contract and compact reasoning_map.
    """
    schema_section = json.dumps(TextOnlyExtractionResponse.model_json_schema(), indent=2)

    header = (
        "TEXT-ONLY EXTRACTION (NO VISUAL GROUNDING):\n"
        "• Use this RESPONSE FORMAT SCHEMA for your JSON output:\n" + schema_section + "\n"
        "\nEXTRACTION STRATEGY:\n"
        "• Use BOTH visual analysis AND the OCR full text for maximum accuracy.\n"
        "• You are NOT limited to OCR-only data — extract visually readable information even if OCR missed it.\n"
        "• Maintain precise data types (strings, numbers, dates).\n"
        "\nRESPONSE REQUIREMENTS:\n"
        "• Return JSON with: { extracted_data, reasoning_map, visual_only_confidence? }.\n"
        "  - extracted_data: object per schema/user instructions.\n"
        "  - reasoning_map: compact reasoning per fully-qualified field path. For arrays, include array-level keys (e.g., 'tags') and type-level keys (e.g., 'items[].sku'); avoid per-index reasoning unless exceptional.\n"
        "  - visual_only_confidence (optional): map of field path → confidence ONLY when the value is not in OCR and inferred purely from visual context.\n"
    )

    integrity = (
        "\nDATA INTEGRITY (STRICT):\n"
        "• Do NOT change values (no rounding, reformatting, or unit conversions).\n"
        "• Maintain precise data types (strings, numbers, dates).\n"
        "• Preserve original decimal precision and formatting unless the schema explicitly requires normalization.\n"
    )

    reasoning = (
        "\nREASONING MAP (COMPACT):\n"
        "• Keys MUST be fully-qualified paths that align with extracted_data paths using dot/bracket notation.\n"
        "  - Nested objects: parent.child.grandchild (e.g., customer.name)\n"
        "  - Arrays (primitive): use array-level key for shared reasoning (e.g., tags) and only add per-index keys (tags[0]) for true exceptions.\n"
        "  - Arrays (objects): prefer type-level keys for each field (e.g., items[].sku, items[].qty) and avoid per-index unless an exception applies (then use items[3].sku).\n"
        "• The backend will attach reasoning to values by checking in order: exact path → type-level (e.g., items[].sku) → array-level (e.g., items).\n"
        "• Content (2–4 short bullets per field):\n"
        "  - Semantic: why the value belongs to the field (type/format/patterns).\n"
        "  - Location: where on the page/section/table; mention nearby labels/anchors in brief.\n"
        "  - Cues: labels, headers, alignment, typography/formatting that justify the match.\n"
        "\nExample (illustrative):\n"
        "reasoning_map: {\n"
        "  \"invoice_number\": \"- Semantic: matches invoice pattern; - Location: header top-right; - Cues: 'Invoice No.' label aligned left\",\n"
        "  \"tags\": \"- Semantic: category badges; - Location: title row; - Cues: pill styling + bold label row\",\n"
        "  \"items[].sku\": \"- Semantic: uppercase alphanumerics; - Location: table col 1; - Cues: 'SKU' header, column-aligned\"\n"
        "}\n"
        "\nKeep entries concise; reuse array/type-level keys for repeated structures to avoid redundancy.\n"
    )

    user_extra = (
        "\nIMPORTANT USER INSTRUCTIONS:\n"
        f"{user_prompt}\n\n"
        "Follow these user instructions carefully as they provide critical guidance for this specific document extraction task."
    ) if user_prompt else ""
    return header + integrity + reasoning + user_extra


