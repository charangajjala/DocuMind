"""Models package initialization."""

from .domain import BoundingBox, TextBlock, DocumentOCRResult, OCRRequest, OCRResponse
from .extraction_response import (
    FieldMapping,
    ExtractionResponse,
    EXTRACTION_RESPONSE_SCHEMA
)

__all__ = [
    "BoundingBox",
    "TextBlock", 
    "DocumentOCRResult",
    "OCRRequest",
    "OCRResponse",
    "FieldMapping",
    "ExtractionResponse", 
    "EXTRACTION_RESPONSE_SCHEMA"
]
