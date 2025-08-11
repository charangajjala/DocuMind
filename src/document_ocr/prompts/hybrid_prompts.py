"""Prompts for hybrid two-stage pipeline (text-only extraction then grounding from filtered OCR blocks)."""

from typing import Dict, Any
import json
from ..models.extraction_response import HybridStage2LLMResponse


def get_hybrid_stage2_system_prompt(filtered_blocks: Dict[str, Any], full_text: str) -> str:
    """System prompt for stage 2 grounding (no image)."""
    return (
        "You are a document grounding assistant. You receive extracted_data and a curated subset of OCR blocks.\n"
        "Use ONLY the provided OCR blocks and the OCR full text to assign visual grounding for each field.\n\n"
        f"OCR Full Text (verbatim):\n{full_text}\n\n"
        "Filtered OCR Blocks (use only these ids in source_block_id):\n"
        f"{json.dumps(filtered_blocks, indent=2)}"
    )


def get_hybrid_stage2_user_prompt(extracted_data: Dict[str, Any]) -> str:
    """User prompt for stage 2 grounding.

    Requires returning field_mappings keyed by fully-qualified paths, using only the provided block ids.
    """
    mapping_rules = (
        "\nFIELD NAMING FOR MAPPINGS (STRICT):\n"
        "• Keys in field_mappings MUST use fully-qualified paths:\n"
        "  - Nested objects: parent.child.grandchild (dot notation)\n"
        "  - Arrays: Each element MUST be mapped individually using zero-based indices. Never map an entire array to a single entry.\n"
        "    Example: items[0], items[1], and for objects inside arrays: items[0].name, items[1].price\n"
        "• Use exact same paths for extracted_data keys where possible, so each mapping key corresponds 1:1 to an extracted value.\n"
        "• Examples:\n"
        "  extracted_data.customer.name → field_mappings[\"customer.name\"]\n"
        "  extracted_data.items[0].amount → field_mappings[\"items[0].amount\"]\n"
        "• If a top-level field is a scalar, use just the field name (e.g., \"invoice_number\").\n"

        "\nARRAY MAPPING REQUIREMENTS (MANDATORY):\n"
        "• Treat every individual array element as its own field for mapping purposes.\n"
        "• For primitive arrays (e.g., list of strings/numbers):\n"
        "  - Provide a separate mapping entry for each index (e.g., tags[0], tags[1]) with its own value, confidence, source_block_id.\n"
        "  - Provide ONE comprehensive reasoning for the entire array (using the array name like \"tags\") that explains the overall extraction logic; omit reasoning for individual array elements to avoid redundancy.\n"
        "• For arrays of objects with similar structure:\n"
        "  - Provide mappings for each field in each object using indexed qualified paths (e.g., items[0].sku, items[0].qty, items[1].sku).\n"
        "  - Provide ONE comprehensive reasoning per array field type (e.g., \"items[].sku\", \"items[].qty\") explaining the extraction logic for that field across all array elements; omit per-index reasoning.\n"
        "• For arrays of objects with different structures: provide individual reasoning for each unique field pattern.\n"
        "• Do NOT aggregate multiple array values into a single mapping value or share a single source_block_id across multiple indices.\n"
        "• ALWAYS provide individual field mappings with qualified paths (e.g., \"lease_gross_acres[0]\", \"lease_gross_acres[1]\").\n"
        "• Only include indices that are present in extracted_data.\n"

        "\nSOURCE BLOCK SELECTION (FILTERED SET ONLY):\n"
        "• Choose the MOST SPECIFIC block id(s) from the PROVIDED filtered set that contain the COMPLETE value.\n"
        "  - Single smallest block → single integer id\n"
        "  - True multi-block spans → list of integer ids\n"
        "  - If none of the filtered blocks fully contain the value → 'visual_only'\n"

        "\nCONFIDENCE & INTEGRITY:\n"
        "• Confidence: provide per-field confidence only (no overall).\n"
        "• Data Integrity: do NOT change provided values (no rounding, reformatting, or unit changes).\n"
    )

    reasoning_rules = (
        "\nREASONING (COMPACT - BLOCK SELECTION ONLY):\n"
        "• For the 'reasoning' inside field_mappings, ONLY explain why the chosen filtered block id(s) were selected (block selection logic).\n"
        "• 2–3 short bullets per field: smallest block that fully contains value, proximity to label/anchor, why alternatives were rejected if applicable.\n"
        "• Do NOT repeat semantic/location reasoning here (that comes from stage 1); this section is strictly about block selection.\n"
    )

    hierarchy_and_policy = (
        "\nOCR BLOCK HIERARCHY & SELECTION POLICY:\n"
        "• Block hierarchy (smallest to largest): Token < Line < Paragraph < Block.\n"
        "• Always choose the SMALLEST level that contains the COMPLETE value.\n"
        "• If a value spans multiple lines → use the minimal set of filtered Line ids; if multiple paragraphs → Paragraph ids.\n"
        "• Never reference blocks outside the provided filtered set.\n"
        "\nCONFIDENCE POLICY:\n"
        "• Provide per-field confidence only. Do not compute overall confidence.\n"
        "• Backend will prefer OCR-derived confidence when grounded; you may include a per-field estimate, but values will be normalized server-side.\n"
    )

    # Output schema for stage 2
    stage2_schema = json.dumps(HybridStage2LLMResponse.model_json_schema(), indent=2)

    return (
        "GROUNDING TASK (NO IMAGE):\n"
        "• Return JSON using this RESPONSE FORMAT SCHEMA (do NOT include extracted_data again):\n"
        f"{stage2_schema}\n"
        "• Use the exact extracted_data below only for reference to locate values in filtered blocks (do NOT modify it or echo it back).\n"
        + mapping_rules + hierarchy_and_policy + reasoning_rules + "\n\n"
        + f"EXTRACTED DATA (reference only):\n{json.dumps(extracted_data, indent=2)}"
    )


