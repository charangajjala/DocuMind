"""Pydantic models for extraction response structures."""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class FieldMapping(BaseModel):
    """Model for field mapping information in extraction response."""
    
    value: Any = Field(..., description="The extracted value for this field")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0 and 1")
    # Single field supporting single id, multiple ids, or "visual_only" marker
    source_block_id: Union[int, str, list[Union[int, str]]] = Field(
        ..., 
        description=(
            "MOST SPECIFIC OCR block reference: either a single integer ID, or a list of integer IDs when the value spans multiple OCR elements; "
            "use 'visual_only' if no single or combined OCR blocks contain the complete value"
        )
    )
    reasoning: Optional[str] = Field(None, description="Comprehensive explanation covering: 1) WHY this value matches the requested field (semantic reasoning), 2) WHERE the value was found (visual/OCR location), 3) WHY this specific OCR block was selected (block selection reasoning), 4) confidence factors. For arrays: provide reasoning at array-level (e.g., 'tags', 'items[].sku') and omit for individual elements to avoid redundancy.")


class ExtractionResponse(BaseModel):
    """Model for structured data extraction response."""
    
    extracted_data: Dict[str, Any] = Field(..., description="Data matching the target schema and/or the user instructions")
    field_mappings: Dict[str, FieldMapping] = Field(
        ...,
        description=(
            "Mapping from fully-qualified field paths to detailed mapping info. "
            "Keys MUST use qualified paths with dot/bracket notation (e.g., 'customer.name', 'items[0].sku'). "
            "For arrays: provide BOTH array-level reasoning entries (e.g., 'lease_gross_acres' with reasoning only) AND individual indexed mappings (e.g., 'lease_gross_acres[0]', 'lease_gross_acres[1]' with value, confidence, source_block_id). "
            "Individual array elements should omit reasoning to avoid redundancy - the array-level reasoning will be inherited. "
            "In each mapping, source_block_id MUST be either a single integer block id, a list of integer block ids when the value truly spans multiple OCR elements, or 'visual_only' when no OCR block contains the value."
        ),
    )


class TextOnlyExtractionResponse(BaseModel):
    """Response model for OCR-text-only LLM extraction (no visual grounding from LLM).

    The LLM must not return field_mappings. Instead, it returns:
      - extracted_data: normal structured data per schema/instructions
      - reasoning_map: compact reasoning for each fully-qualified field path. For arrays,
        include array-level entries (e.g., "tags") and type-level entries (e.g., "items[].sku").
        Avoid per-index reasoning unless an exception applies.
      - visual_only_confidence (optional): per-field confidence ONLY for fields that are not
        OCR-groundable and inferred purely from visual context.
    Visual grounding is computed later by backend manual matching.
    """

    extracted_data: Dict[str, Any] = Field(..., description="Data matching the target schema and/or the user instructions")
    reasoning_map: Dict[str, str] = Field(
        default_factory=dict,
        description=(
            "Compact reasoning per field path or array-level/type-level keys. "
            "Use fully-qualified paths (dot/bracket) for direct fields (e.g., 'customer.name', 'items[0].sku'), "
            "and for arrays include 'tags' and type-level keys like 'items[].sku'."
        ),
    )
    visual_only_confidence: Optional[Dict[str, float]] = Field(
        default=None,
        description=(
            "Optional per-field confidence ONLY for fields inferred purely from visual context "
            "and not expected to be found in OCR text."
        ),
    )

class HybridStage1Response(TextOnlyExtractionResponse):
    """Alias for clarity in the hybrid pipeline (stage 1 = text-only extraction)."""
    pass

class HybridStage2LLMResponse(BaseModel):
    """LLM response for hybrid stage 2 (grounding from filtered OCR blocks, no image).

    The model must return field_mappings keyed by fully-qualified paths, using only the provided
    filtered OCR block ids in source_block_id/source_block_ids. Do NOT return extracted_data again.
    """

    field_mappings: Dict[str, FieldMapping] = Field(
        default_factory=dict,
        description=(
            "Mapping from fully-qualified field paths to mapping info. Keys MUST use dot/bracket notation. "
            "Only use provided filtered OCR block ids for grounding; otherwise 'visual_only'."
        ),
    )

# JSON schema for the model
EXTRACTION_RESPONSE_SCHEMA = ExtractionResponse.model_json_schema()
