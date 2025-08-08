"""FastAPI application for document OCR REST API."""

import base64
import io
from typing import List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from document_ocr.models.domain import (
    OCRRequest, OCRResponse,
    StructuredExtractionRequest, StructuredExtractionResponse
)
from document_ocr.services.document_processor import DocumentOCRProcessor
from document_ocr.services.azure_openai_service import AzureOpenAIService
from document_ocr.services.structured_extractor import VisuallyGroundedExtractor
from document_ocr.services.schema_validator import JSONSchemaValidator
from document_ocr.utils.config import EnvironmentConfigProvider
from document_ocr.core.exceptions import DocumentOCRError, InvalidImageError


# Initialize dependencies
config = EnvironmentConfigProvider()
processor = DocumentOCRProcessor(config_provider=config)

# Initialize structured extraction components with multi-model support
structured_extractor = None
llm_providers = {}
default_llm_model = 'gpt-5-mini'
try:
    # Discover available model configs
    available = config.list_available_llm_models(['gpt-40', 'gpt-o4-mini', 'gpt-5-mini', 'gpt-5-nano'])
    if not available:
        # Fallback to generic keys
        azure_api_key = config.get_config('AZURE_OPENAI_API_KEY')
        azure_endpoint = config.get_config('AZURE_OPENAI_ENDPOINT')
        azure_deployment = config.get_config('AZURE_OPENAI_DEPLOYMENT_NAME')
        if azure_api_key and azure_endpoint and azure_deployment:
            llm_providers[default_llm_model] = AzureOpenAIService(
                api_key=azure_api_key,
                endpoint=azure_endpoint,
                deployment=azure_deployment,
                api_version=config.get_config('AZURE_OPENAI_API_VERSION', '2025-01-01-preview')
            )
    else:
        for model_key, cfg in available.items():
            try:
                llm_providers[model_key] = AzureOpenAIService(
                    api_key=cfg['api_key'],
                    endpoint=cfg['endpoint'],
                    deployment=cfg['deployment'],
                    api_version=cfg.get('api_version') or '2025-01-01-preview'
                )
            except Exception as e:
                print(f"⚠️ Failed to init provider for {model_key}: {e}")

    if llm_providers:
        # Choose default model
        if default_llm_model not in llm_providers:
            default_llm_model = next(iter(llm_providers.keys()))
        schema_validator = JSONSchemaValidator()
        # Initialize extractor with any provider as default; we'll override per request
        structured_extractor = VisuallyGroundedExtractor(
            document_processor=processor,
            llm_provider=llm_providers[default_llm_model],
            schema_validator=schema_validator
        )
        print(f"✅ Azure OpenAI structured extraction initialized. Models: {list(llm_providers.keys())}, default='{default_llm_model}'")
    else:
        print("⚠️ Azure OpenAI not configured - structured extraction unavailable")
except Exception as e:
    print(f"⚠️ Failed to initialize Azure OpenAI multi-model setup: {e}")
    structured_extractor = None

# Configuration updated to use 2025-01-01-preview API version

# Create FastAPI app
app = FastAPI(
    title="Document OCR API",
    description="REST API for document text extraction using Google Document AI",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify actual origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "message": "Document OCR API",
        "version": "1.0.0",
        "endpoints": {
            "health": "/health",
            "ocr_base64": "/ocr/base64",
            "ocr_upload": "/ocr/upload",
            "docs": "/docs"
        }
    }


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    try:
        # Basic configuration validation
        config.validate_required_config()
        
        # Check Azure OpenAI configuration
        azure_configured = structured_extractor is not None
        
        return {
            "status": "healthy",
            "service": "document-ocr-api",
            "google_document_ai": "configured",
            "azure_openai": "configured" if azure_configured else "not_configured"
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")


@app.post("/ocr/base64", response_model=OCRResponse)
async def extract_text_from_base64(request: OCRRequest):
    """Extract text from base64 encoded image."""
    try:
        # Decode base64 image
        try:
            image_data = base64.b64decode(request.image_data)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image data")
        
        # Process document
        result = await processor.process_document(
            image_data,
            confidence_threshold=request.confidence_threshold
        )
        
        # Convert to API response format
        text_blocks = [
            {
                "text": block.text,
                "confidence": block.confidence,
                "element_type": getattr(block, 'element_type', 'block'),
                "bounding_box": {
                    "x_min": block.bounding_box.x_min,
                    "y_min": block.bounding_box.y_min,
                    "x_max": block.bounding_box.x_max,
                    "y_max": block.bounding_box.y_max
                }
            }
            for block in result.text_blocks
        ]
        
        # Convert image quality to dict if available
        image_quality_dict = None
        if result.image_quality:
            quality = result.image_quality
            image_quality_dict = {
                "quality_score": quality.quality_score,
                "quality_grade": quality.get_quality_grade(),
                "detected_defects": quality.detected_defects,
                "recommendations": quality.get_recommendations(),
                "width": quality.width,
                "height": quality.height,
                "resolution": quality.resolution,
                "file_size": quality.file_size,
                "format": quality.format
            }
        
        return OCRResponse(
            full_text=result.full_text,
            text_blocks=text_blocks,
            image_dimensions={
                "width": result.image_width,
                "height": result.image_height
            },
            processing_time=result.processing_time,
            success=True,
            image_quality=image_quality_dict,
            original_image_info=result.original_image_info,

        )
        
    except InvalidImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DocumentOCRError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.post("/ocr/upload", response_model=OCRResponse)
async def extract_text_from_upload(
    file: UploadFile = File(...),
    confidence_threshold: float = 0.8
):
    """Extract text from uploaded image file."""
    try:
        # Validate file type
        allowed_types = config.get_config('ALLOWED_IMAGE_TYPES', ['jpg', 'jpeg', 'png', 'pdf', 'tiff'])
        file_extension = file.filename.lower().split('.')[-1] if file.filename else ''
        
        if file_extension not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed types: {', '.join(allowed_types)}"
            )
        
        # Check file size
        max_size = config.get_config('MAX_IMAGE_SIZE', 10485760)  # 10MB default
        content = await file.read()
        
        if len(content) > max_size:
            raise HTTPException(
                status_code=400,
                detail=f"File too large. Maximum size: {max_size} bytes"
            )
        
        # Process document
        result = await processor.process_document(
            content,
            confidence_threshold=confidence_threshold
        )
        
        # Convert to API response format
        text_blocks = [
            {
                "text": block.text,
                "confidence": block.confidence,
                "element_type": getattr(block, 'element_type', 'block'),
                "bounding_box": {
                    "x_min": block.bounding_box.x_min,
                    "y_min": block.bounding_box.y_min,
                    "x_max": block.bounding_box.x_max,
                    "y_max": block.bounding_box.y_max
                }
            }
            for block in result.text_blocks
        ]
        
        # Convert image quality to dict if available
        image_quality_dict = None
        if result.image_quality:
            quality = result.image_quality
            image_quality_dict = {
                "quality_score": quality.quality_score,
                "quality_grade": quality.get_quality_grade(),
                "detected_defects": quality.detected_defects,
                "recommendations": quality.get_recommendations(),
                "width": quality.width,
                "height": quality.height,
                "resolution": quality.resolution,
                "file_size": quality.file_size,
                "format": quality.format
            }
        
        return OCRResponse(
            full_text=result.full_text,
            text_blocks=text_blocks,
            image_dimensions={
                "width": result.image_width,
                "height": result.image_height
            },
            processing_time=result.processing_time,
            success=True,
            image_quality=image_quality_dict,
            original_image_info=result.original_image_info,

        )
        
    except InvalidImageError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except DocumentOCRError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.exception_handler(DocumentOCRError)
async def document_ocr_exception_handler(request, exc: DocumentOCRError):
    """Handle DocumentOCRError exceptions."""
    return JSONResponse(
        status_code=500,
        content={
            "detail": exc.message,
            "error_code": exc.error_code,
            "success": False
        }
    )


# Structured Data Extraction Endpoints

@app.post("/extract/structured", response_model=StructuredExtractionResponse)
async def extract_structured_data(request: StructuredExtractionRequest):
    """Extract structured data from document image using AI with visual grounding."""
    if not structured_extractor:
        raise HTTPException(
            status_code=503, 
            detail="Azure OpenAI service not configured. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT"
        )
    
    try:
        # Decode base64 image
        try:
            image_data = base64.b64decode(request.image_data)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid base64 image data")
        
        # Select LLM provider based on requested model (if provided)
        requested_model = (request.llm_model or default_llm_model).strip().lower()
        provider = llm_providers.get(requested_model) or llm_providers.get(default_llm_model)
        if provider is None:
            raise HTTPException(status_code=503, detail="No LLM providers are configured on the server")

        # Extract structured data (override the provider per request)
        result = await structured_extractor.extract_with_visual_grounding(
            image_data=image_data,
            mime_type="image/jpeg",
            json_schema=request.json_schema,
            user_prompt=request.user_prompt,
            document_type=request.document_type,
            llm_provider_override=provider
        )
        
        # Convert OCR results to API format
        ocr_response = OCRResponse(
            full_text=result.ocr_results.full_text if result.ocr_results else "",
            text_blocks=[
                {
                    "text": block.text,
                    "confidence": block.confidence,
                    "element_type": getattr(block, 'element_type', 'block'),
                    "bounding_box": {
                        "x_min": block.bounding_box.x_min,
                        "y_min": block.bounding_box.y_min,
                        "x_max": block.bounding_box.x_max,
                        "y_max": block.bounding_box.y_max
                    }
                }
                for block in result.ocr_results.text_blocks
            ] if result.ocr_results else [],
            image_dimensions={
                "width": result.ocr_results.image_width if result.ocr_results else 0,
                "height": result.ocr_results.image_height if result.ocr_results else 0
            },
            processing_time=result.processing_time,
            success=True
        )
        
        # Convert grounded fields to API format
        grounded_fields_api = []
        for field in result.grounded_fields:
            # Try to collect OCR text for the referenced blocks to preserve exact formatting
            ocr_text_found = None
            try:
                if result.ocr_results and getattr(field, 'source_text_blocks', None):
                    texts = []
                    for bid in field.source_text_blocks:
                        if isinstance(bid, int) and 0 <= bid < len(result.ocr_results.text_blocks):
                            texts.append(result.ocr_results.text_blocks[bid].text)
                    if texts:
                        ocr_text_found = " ".join(texts)
            except Exception:
                ocr_text_found = None

            grounded_fields_api.append({
                "field_name": field.field_name,
                "value": field.value,
                "confidence": field.confidence,
                "source_text_blocks": field.source_text_blocks,
                "reasoning": field.reasoning,
                "ocr_text_found": ocr_text_found,
                "bounding_boxes": [
                    {
                        "x_min": bbox.x_min,
                        "y_min": bbox.y_min,
                        "x_max": bbox.x_max,
                        "y_max": bbox.y_max
                    }
                    for bbox in field.bounding_boxes
                ]
            })
        
        return StructuredExtractionResponse(
            success=True,
            extracted_data=result.extracted_data,
            grounded_fields=grounded_fields_api,
            ocr_results=ocr_response,
            processing_time=result.processing_time,
            llm_confidence=result.llm_confidence,
            schema_validation_passed=result.schema_validation_passed,
            prompts_used=result.prompts_used,
            errors=result.errors,
            raw_llm_response=result.raw_llm_response
        )
        
    except Exception as e:
        return StructuredExtractionResponse(
            success=False,
            extracted_data={},
            grounded_fields=[],
            ocr_results=OCRResponse(
                full_text="",
                text_blocks=[],
                image_dimensions={"width": 0, "height": 0},
                processing_time=0.0,
                success=False
            ),
            processing_time=0.0,
            llm_confidence=0.0,
            schema_validation_passed=False,
            errors=[str(e)],
            error_message=str(e)
        )


@app.post("/schema/validate")
async def validate_schema(schema: dict):
    """Validate a JSON schema for structured extraction."""
    try:
        validator = JSONSchemaValidator()
        is_valid = validator.validate_schema(schema)
        
        if is_valid:
            return {
                "valid": True,
                "message": "Schema is valid",
                "example": validator.generate_example(schema)
            }
        else:
            return {
                "valid": False,
                "message": "Schema validation failed",
                "errors": ["Invalid schema structure"]
            }
    except Exception as e:
        return {
            "valid": False,
            "message": "Schema validation error",
            "errors": [str(e)]
        }


if __name__ == "__main__":
    import uvicorn
    
    host = config.get_config('API_HOST', '0.0.0.0')
    port = config.get_config('API_PORT', 8000)
    
    uvicorn.run(
        "src.api.main:app",
        host=host,
        port=port,
        reload=True,
        log_level=config.get_config('LOG_LEVEL', 'info').lower()
    )
