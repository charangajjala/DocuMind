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
    reasoning: str = Field(..., description="Comprehensive explanation covering: 1) WHY this value matches the requested field (semantic reasoning), 2) WHERE the value was found (visual/OCR location), 3) WHY this specific OCR block was selected (block selection reasoning), 4) confidence factors")


class ExtractionResponse(BaseModel):
    """Model for structured data extraction response."""
    
    extracted_data: Dict[str, Any] = Field(..., description="Data matching the target schema and/or the user instructions")
    field_mappings: Dict[str, FieldMapping] = Field(
        ..., 
        description="For each extracted field, provide the MOST SPECIFIC OCR block ID that contains the complete value (Token > Line > Paragraph > Block) OR 'visual_only'"
    )
    overall_confidence: float = Field(..., ge=0.0, le=1.0, description="Overall extraction confidence score")


# JSON schema for the model
EXTRACTION_RESPONSE_SCHEMA = ExtractionResponse.model_json_schema()
