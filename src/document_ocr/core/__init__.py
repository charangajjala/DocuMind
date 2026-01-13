"""Core package initialization."""

from .interfaces import DocumentProcessor, ImageProcessor, ConfigurationProvider, OCRService
from .exceptions import (
    DocumentOCRError,
    InvalidImageError,
    ProcessingError,
    ConfigurationError,
    GoogleDocumentAIError,
    RateLimitError
)

__all__ = [
    "DocumentProcessor",
    "ImageProcessor", 
    "ConfigurationProvider",
    "OCRService",
    "DocumentOCRError",
    "InvalidImageError",
    "ProcessingError",
    "ConfigurationError",
    "GoogleDocumentAIError",
    "RateLimitError"
]
