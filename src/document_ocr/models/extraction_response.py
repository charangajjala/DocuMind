"""Pydantic models for extraction response structures."""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class FieldMapping(BaseModel):
    """Model for field mapping information in extraction response."""
    
    value: Any = Field(..., description="The extracted value for this field")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score between 0 and 1")
    source_block_ids: Union[List[int], List[str]] = Field(
        ..., 
        description="OCR block IDs that support this field OR ['visual_only'] if extracted from visual analysis"
    )
    reasoning: str = Field(..., description="Brief explanation of extraction source and confidence")


class ExtractionResponse(BaseModel):
    """Model for structured data extraction response."""
    
    extracted_data: Dict[str, Any] = Field(..., description="Data matching the target schema")
    field_mappings: Dict[str, FieldMapping] = Field(
        ..., 
        description="For each extracted field, provide the OCR block IDs that support it OR visual_only"
    )
    overall_confidence: float = Field(..., ge=0.0, le=1.0, description="Overall extraction confidence score")


# JSON schema for the model
EXTRACTION_RESPONSE_SCHEMA = ExtractionResponse.model_json_schema()
