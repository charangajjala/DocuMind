"""Core exceptions for the document OCR system."""


class DocumentOCRError(Exception):
    """Base exception for document OCR errors."""
    
    def __init__(self, message: str, error_code: str = None):
        super().__init__(message)
        self.message = message
        self.error_code = error_code


class InvalidImageError(DocumentOCRError):
    """Raised when the provided image is invalid or corrupted."""
    
    def __init__(self, message: str = "Invalid or corrupted image"):
        super().__init__(message, "INVALID_IMAGE")


class ProcessingError(DocumentOCRError):
    """Raised when document processing fails."""
    
    def __init__(self, message: str = "Document processing failed"):
        super().__init__(message, "PROCESSING_ERROR")


class ConfigurationError(DocumentOCRError):
    """Raised when there's a configuration issue."""
    
    def __init__(self, message: str = "Configuration error"):
        super().__init__(message, "CONFIG_ERROR")


class GoogleDocumentAIError(DocumentOCRError):
    """Raised when Google Document AI service encounters an error."""
    
    def __init__(self, message: str = "Google Document AI error"):
        super().__init__(message, "GOOGLE_DOC_AI_ERROR")


class RateLimitError(DocumentOCRError):
    """Raised when API rate limits are exceeded."""
    
    def __init__(self, message: str = "API rate limit exceeded"):
        super().__init__(message, "RATE_LIMIT_ERROR")
