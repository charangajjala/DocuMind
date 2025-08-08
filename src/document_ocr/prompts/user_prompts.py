"""User prompts for structured data extraction."""

from typing import Optional, Dict, Any
from ..models.extraction_response import ExtractionResponse


def get_extraction_response_schema() -> Dict[str, Any]:
    """Get the JSON schema for ExtractionResponse.
    
    Returns:
        JSON schema dictionary
    """
    return ExtractionResponse.model_json_schema()


def validate_extraction_response(response_data: Dict[str, Any]) -> ExtractionResponse:
    """Validate and parse extraction response data.
    
    Args:
        response_data: Raw response data to validate
        
    Returns:
        Validated ExtractionResponse model
        
    Raises:
        ValidationError: If data doesn't match schema
    """
    return ExtractionResponse.model_validate(response_data)


def get_base_extraction_prompt(
    user_prompt: Optional[str] = None,
    json_schema: Optional[Dict[str, Any]] = None,
) -> str:
    """Generate base user prompt for extraction with visual-first approach.

    Args:
        user_prompt: Additional user instructions
        json_schema: If provided, indicates schema-guided extraction; otherwise prompt-only

    Returns:
        User prompt string
    """
    # Get the JSON schema for the response format
    response_schema = ExtractionResponse.model_json_schema()

    # Header describing context depending on schema availability
    if json_schema:
      context_header = (
        "CRITICAL: You are working with TWO DIFFERENT SCHEMAS:\n\n"
        "1. DATA EXTRACTION SCHEMA → Defines WHAT data to extract (provided in your system context)\n"
        "2. RESPONSE FORMAT SCHEMA → Defines HOW to structure your JSON response (shown below)\n"
      )
      extraction_requirement = (
        "• Extract data according to the DATA EXTRACTION SCHEMA (from system context)\n"
      )
    else:
      context_header = (
        "CRITICAL: You are working with ONE SCHEMA here:\n\n"
        "1. RESPONSE FORMAT SCHEMA → Defines HOW to structure your JSON response (shown below)\n\n"
        "No DATA EXTRACTION SCHEMA is provided. Infer WHAT to extract purely from the user instructions and the document itself."
      )
      extraction_requirement = (
        "• No DATA EXTRACTION SCHEMA provided. Use the user instructions and document content to decide WHAT to extract.\n"
      )

    base_prompt = f"""Extract structured data from this document image using the following approach:

{context_header}

EXTRACTION STRATEGY:
• Use BOTH visual analysis AND OCR results for maximum accuracy
• You are NOT limited to OCR-only data - extract visually readable information even if OCR missed it
• When information matches OCR text blocks, reference that block ID for grounding
• For purely visual extractions, use "visual_only" in source_block_id

RESPONSE REQUIREMENTS:
{extraction_requirement}• Format response using this RESPONSE FORMAT SCHEMA:

{response_schema}

FIELD MAPPING RULES:
• Map each field to the MOST SPECIFIC OCR text block(s) that contain the complete value.
  - If one block contains the complete value → use a single integer block id in source_block_id
  - If multiple smallest blocks together contain the value (e.g., multi-line) → use a list of integer block ids in source_block_id
  - If no OCR block(s) contain the full value → use "visual_only"
• Always prefer the smallest block level(s) that fully contain the value (Token/Line/Paragraph/Block)
• Visual only: Use "visual_only"
• Missing/unclear: Use null for optional fields
• Maintain precise data types (strings, numbers, dates)
• For confidence: provide per-field confidence only.

BLOCK SELECTION PRIORITY (Most Specific First):
The OCR blocks follow a hierarchy from smallest to largest:
1. Token (word) - Individual word or punctuation (MOST SPECIFIC)
2. Line - Visual line containing multiple tokens  
3. Paragraph - Multiple lines forming coherent text blocks
4. Block - Largest region containing multiple paragraphs (LEAST SPECIFIC)

• Always select the SMALLEST block level that contains the COMPLETE field value. If no blocks contains then value, use "visual_only"
• Single word → Token block
• Multiple words on same line → Line block  
• Multiple lines → Paragraph block
• Multiple paragraphs → Block level
• This ensures the most precise bounding boxes for visual grounding

CONFIDENCE SCORING:
• Base confidence on visual clarity + OCR confirmation
• Higher confidence when both visual and OCR agree
• Lower confidence for visual-only or unclear extractions

REASONING REQUIREMENTS:
For each field extraction, provide comprehensive reasoning that explains:

1. SEMANTIC MATCHING: Why does this extracted value logically match the requested field?
   - What makes this value appropriate for this field type?
   - How does the context around the value support this interpretation?
   - Any semantic validation performed (format, data type, expected patterns)

2. LOCATION IDENTIFICATION: Where was this value found in the document?
   - Visual location description (e.g., "top-right corner", "header section", "table cell 2")
   - OCR text block reference if applicable
   - Surrounding context or labels that helped identify it

3. BLOCK SELECTION LOGIC: Why was this specific OCR block chosen?
   - Which block level was selected (Token/Line/Paragraph/Block) and why
   - Why this block contains the complete value without extra text
   - How it compares to other potential blocks (more/less specific)

4. CONFIDENCE FACTORS: What affects the confidence score?
   - Visual clarity of the text/value
   - OCR recognition quality
   - Ambiguity or alternative interpretations
   - Supporting context or visual/OCR clues
"""

    # Add strict mapping key format requirements for nested fields (ALWAYS include these rules)
    mapping_naming_rules = """

FIELD NAMING FOR MAPPINGS (STRICT):
• Keys in field_mappings MUST use fully-qualified paths:
  - Nested objects: parent.child.grandchild (dot notation)
  - Arrays: Each element MUST be mapped individually using zero-based indices. Never map an entire array to a single mapping entry.
    Example: items[0], items[1], and for objects inside arrays: items[0].name, items[1].price
• Use exact same paths for extracted_data keys where possible, so each mapping key corresponds 1:1 to an extracted value
• Example:
  extracted_data.customer.name → field_mappings["customer.name"]
  extracted_data.items[0].amount → field_mappings["items[0].amount"]
• If a top-level field is a scalar, use just the field name (e.g., "invoice_number")

ARRAY MAPPING REQUIREMENTS (MANDATORY):
• Treat every individual array element as its own field for mapping purposes.
• For primitive arrays (e.g., list of strings/numbers):
  - Provide a separate mapping entry for each index (e.g., tags[0], tags[1]) with its own value, confidence, source_block_id.
  - Provide ONE comprehensive reasoning for the entire array (using the array name like "tags") that explains the overall extraction logic, and omit reasoning for individual array elements to avoid redundancy.
• For arrays of objects with similar structure:
  - Provide mappings for each field in each object using indexed qualified paths (e.g., items[0].sku, items[0].qty, items[1].sku).
  - Provide ONE comprehensive reasoning per array field type (e.g., "items[].sku", "items[].qty") explaining the extraction logic for that field across all array elements, and omit reasoning for individual indexed fields.
• For arrays of objects with different structures:
  - Provide individual reasoning for each unique field pattern.
• Do NOT aggregate multiple array values into a single mapping value or share a single source_block_id across multiple indices.
• ALWAYS provide individual field mappings with qualified paths (e.g., "lease_gross_acres[0]", "lease_gross_acres[1]") for each array element.
• Only include indices that are present in extracted_data.

CONFIDENCE SOURCING (MANDATORY):
• For OCR-grounded fields, set the field confidence to the OCR engine's confidence (or an aggregate of the referenced block confidences) and explain in reasoning if needed.
• For visual_only fields, provide an LLM confidence justified by visual clarity/layout cues.
• Do NOT compute an overall confidence score; only per-field confidences are required.


    """

    # General example and deeper reasoning guidance
    example_and_reasoning = """

EXAMPLE RESPONSE SHAPE (COMPACT):
```json
{
  "extracted_data": {
    "invoice_number": "INV-1042",
    "vendor.name": "Acme Corp",
    "tags": ["overdue", "priority"],
    "items": [
      {"sku": "A1", "qty": 2, "price": 19.99},
      {"sku": "B2", "qty": 1, "price": 49.5}
    ]
  },
  "field_mappings": {
    "invoice_number": { "value": "INV-1042", "confidence": 0.97, "source_block_id": 42 },
    "vendor.name":   { "value": "Acme Corp", "confidence": 0.95, "source_block_id": 37 },

    "tags":    { "reasoning": "Tags read from header badges adjacent to title; icon + bold style indicate label." },
    "tags[0]": { "value": "overdue",  "confidence": 0.93, "source_block_id": 18 },
    "tags[1]": { "value": "priority", "confidence": 0.92, "source_block_id": 21 },

    "items[].sku":   { "reasoning": "Leftmost table column under 'SKU'; uppercase alphanumerics; row-aligned." },
    "items[].qty":   { "reasoning": "Middle column labeled 'QTY'; integers right-aligned; row headers match." },
    "items[].price": { "reasoning": "Rightmost column labeled 'PRICE'; currency format with decimals." },

    "items[0].sku":   { "value": "A1",  "confidence": 0.98, "source_block_id": 61 },
    "items[0].qty":   { "value": 2,     "confidence": 0.97, "source_block_id": 63 },
    "items[0].price": { "value": 19.99, "confidence": 0.96, "source_block_id": 65 },

    "items[1].sku":   { "value": "B2",  "confidence": 0.98, "source_block_id": 71 },
    "items[1].qty":   { "value": 1,     "confidence": 0.97, "source_block_id": 73 },
    "items[1].price": { "value": 49.5,  "confidence": 0.96, "source_block_id": 75 }
  }
}
```

REQUEST FOR DEEPER REASONING (MANDATORY):
• Provide ONE array-level reasoning per primitive array (e.g., "tags") and per array field type (e.g., "items[].sku", "items[].qty", "items[].price").
• For each reasoning, expand on:
  - Semantic matching: why the content matches the field definition/pattern
  - Location: page region/table/section + quote nearby OCR text that anchored the decision
  - Block selection: why the chosen Token/Line/Paragraph/Block contains the complete value
  - Confidence factors: visual clarity, OCR agreement, consistent formatting, label alignment
• If reasoning is brief, expand with 1–2 concrete visual/OCR cues (labels, headers, alignment, formatting).
• Do NOT repeat identical reasoning per array index; keep it once at array/group level. Use per-index reasoning only for exceptions.
"""

    # Data integrity rules (strict)
    data_integrity_rules = """

DATA INTEGRITY (STRICT):
• Do NOT round, truncate, or reformat numeric values (no decimal trimming, no thousand separators) unless the USER explicitly instructs.
• Do NOT convert units (e.g., acres to hectares) unless explicitly requested. Preserve the source unit.
• Do NOT pad or strip zeros, prefixes, or suffixes (e.g., keep 224.421 as 224.421, keep 05 if present as an ID).
• For currency/numbers, output the exact parsed numeric value without rounding; if ambiguity exists, prefer OCR-grounded exactness.
• For dates/IDs/codes, preserve the original formatting unless the schema/USER explicitly requires normalization.
• If conflicting cues exist, include the exact OCR text in reasoning and prefer the visually grounded value.
"""

    # Visual intelligence emphasis
    visual_intelligence = """

VISUAL INTELLIGENCE (MANDATORY):
• Do NOT blindly rely on OCR text. Use your visual understanding of the image (layout, tables, columns, headers, badges, icons, alignment) to drive extraction decisions.
• When OCR text conflicts with what is visually present, reconcile using context (labels, column headers, alignment, grouping, typography, spatial proximity) and explain the decision in reasoning.
• Infer structure from the image: tables → rows/columns, key-value blocks → labels and values, headers/footers/sections → field context.
• Use OCR block IDs for grounding only when the visual content truly corresponds; otherwise use "visual_only" with a visual description in reasoning.
"""

    # Build final prompt body with mapping rules, data integrity, visual intelligence, and example/guidance
    prompt_body = f"{base_prompt}{mapping_naming_rules}\n{data_integrity_rules}\n{visual_intelligence}\n{example_and_reasoning}"

    # Optionally append user-specific instructions
    if user_prompt:
        prompt_body = f"""{prompt_body}

IMPORTANT USER INSTRUCTIONS:
{user_prompt}

Follow these user instructions carefully as they provide critical guidance for this specific document extraction task."""

    return prompt_body


def get_visual_only_prompt(user_prompt: Optional[str] = None) -> str:
    """Generate prompt for visual-only extraction (when OCR is not available).
    
    Args:
        user_prompt: Additional user instructions
        
    Returns:
        Visual-only user prompt string
    """
    # Get the JSON schema for the response format
    response_schema = ExtractionResponse.model_json_schema()
    
    base_prompt = f"""Extract structured data from this document image using VISUAL ANALYSIS ONLY.

CRITICAL: You are working with TWO DIFFERENT SCHEMAS:

1. DATA EXTRACTION SCHEMA → Defines WHAT data to extract (provided in your system context)
2. RESPONSE FORMAT SCHEMA → Defines HOW to structure your JSON response (shown below)

EXTRACTION STRATEGY:
• Rely entirely on visual understanding (no OCR data available)
• Read text, numbers, and structured data from the image
• Pay attention to document layout and visual hierarchy

RESPONSE REQUIREMENTS:
• Extract data according to the DATA EXTRACTION SCHEMA (from system context)
• Format response using this RESPONSE FORMAT SCHEMA:

{response_schema}

FIELD MAPPING RULES:
• Always use "visual_only" in source_block_id
• Use null for fields that cannot be clearly identified
• Maintain precise data types (strings, numbers, dates)

CONFIDENCE SCORING:
• Base confidence solely on visual clarity and readability
• Be conservative - don't guess when information is unclear"""
    
    if user_prompt:
        return f"""{base_prompt}

IMPORTANT USER INSTRUCTIONS:
{user_prompt}

Follow these user instructions carefully as they provide critical guidance for this specific document extraction task."""
    
    return base_prompt
