"""Services package initialization."""

# Import only when explicitly requested to avoid dependency issues
# from .google_document_ai import GoogleDocumentAIOCRService
# from .document_processor import DocumentOCRProcessor
# from .azure_openai_service import AzureOpenAIService
# from .schema_validator import JSONSchemaValidator, CommonSchemaTemplates
# from .structured_extractor import VisuallyGroundedExtractor

__all__ = [
    "GoogleDocumentAIOCRService",
    "DocumentOCRProcessor",
    "AzureOpenAIService", 
    "JSONSchemaValidator",
    "CommonSchemaTemplates",
    "VisuallyGroundedExtractor"
]
