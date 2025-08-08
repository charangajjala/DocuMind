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


# JSON schema for the model
EXTRACTION_RESPONSE_SCHEMA = ExtractionResponse.model_json_schema()
