"""Models package initialization."""

from .domain import BoundingBox, TextBlock, DocumentOCRResult, OCRRequest, OCRResponse

__all__ = [
    "BoundingBox",
    "TextBlock", 
    "DocumentOCRResult",
    "OCRRequest",
    "OCRResponse"
]
