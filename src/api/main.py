"""FastAPI application for document OCR REST API."""

import base64
import io
from typing import List
from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from document_ocr.models.domain import (
    OCRRequest, OCRResponse,
    StructuredExtractionRequest, StructuredExtractionResponse,
    SchemaGenerationRequest, SchemaGenerationResponse
)
from document_ocr.services.document_processor import DocumentOCRProcessor
from document_ocr.services.azure_openai_service import AzureOpenAIService
from document_ocr.services.structured_extractor import VisuallyGroundedExtractor
from document_ocr.services.schema_validator import JSONSchemaValidator
from document_ocr.utils.config import EnvironmentConfigProvider
from document_ocr.core.exceptions import DocumentOCRError, InvalidImageError
from document_ocr.services.manual_grounding import ManualVisualGrounder
from document_ocr.services.hybrid_service import HybridGroundingService


# Initialize dependencies
config = EnvironmentConfigProvider()
processor = DocumentOCRProcessor(config_provider=config)

# Initialize structured extraction components with multi-model support
structured_extractor = None
llm_providers = {}
default_llm_model = 'gpt-5-mini'
manual_grounder = ManualVisualGrounder()
hybrid_service = None
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
        # Initialize hybrid service with default provider (we will select per-request if needed)
        hybrid_service = HybridGroundingService(llm_providers[default_llm_model])
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

        # Reuse OCR from the initial step to avoid reprocessing
        precomputed_ocr = None
        try:
            # Perform OCR once and pass it through; reuse same confidence threshold
            precomputed_ocr = await processor.process_document(image_data, confidence_threshold=request.confidence_threshold)
        except Exception:
            precomputed_ocr = None

        # Extract structured data (override the provider per request)
        result = await structured_extractor.extract_with_visual_grounding(
            image_data=image_data,
            mime_type="image/jpeg",
            json_schema=request.json_schema,
            user_prompt=request.user_prompt,
            document_type=request.document_type,
            llm_provider_override=provider,
            allowed_element_types=request.allowed_element_types,
            precomputed_ocr=precomputed_ocr
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
            raw_llm_response=result.raw_llm_response,
            timers=result.timers,
            llm_model_used=result.llm_model_used
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


@app.post("/extract/structured/ocr-only", response_model=StructuredExtractionResponse)
async def extract_structured_data_ocr_only(request: StructuredExtractionRequest):
    """Text-only LLM extraction followed by backend manual visual grounding.

    Uses full OCR text for the LLM; bounding boxes are computed locally by matching values back to OCR blocks.
    """
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

        # OCR first
        ocr = await processor.process_document(image_data, confidence_threshold=request.confidence_threshold)

        # Select LLM provider
        requested_model = (request.llm_model or default_llm_model).strip().lower()
        provider = llm_providers.get(requested_model) or llm_providers.get(default_llm_model)
        if provider is None:
            raise HTTPException(status_code=503, detail="No LLM providers are configured on the server")

        # LLM extraction from text + image (no OCR blocks passed to LLM)
        llm_response = await provider.extract_structured_data_from_text(
            full_text=ocr.full_text,
            json_schema=request.json_schema,
            user_prompt=request.user_prompt,
            document_type=request.document_type,
            image_data=image_data
        )

        extracted_data = llm_response.get("extracted_data", {})
        # Reasoning can come via reasoning_map; keep for UI tooltips
        reasoning_map = llm_response.get("reasoning_map", {})

        # Manual grounding: map values to OCR blocks
        # Build pseudo field_mappings for grounding purely from extracted_data; reasoning_map is used later for display
        pseudo_mappings = {}
        # Fill per-field structure with only values so the grounder walks every path
        def flatten(prefix: str, node: any):
            if isinstance(node, dict):
                for k, v in node.items():
                    flatten(f"{prefix}.{k}" if prefix else k, v)
            elif isinstance(node, list):
                for i, v in enumerate(node):
                    flatten(f"{prefix}[{i}]", v)
            else:
                pseudo_mappings[prefix] = {"value": node}
        flatten("", extracted_data)
        # Optional anchors from schema property names to improve matching
        try:
            anchors = list((request.json_schema or {}).get('properties', {}).keys()) if request.json_schema else []
        except Exception:
            anchors = []
        grounded_fields = manual_grounder.ground(extracted_data, pseudo_mappings, ocr, anchors=anchors)

        # Build OCR response
        ocr_response = OCRResponse(
            full_text=ocr.full_text,
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
                for block in ocr.text_blocks
            ],
            image_dimensions={"width": ocr.image_width, "height": ocr.image_height},
            processing_time=ocr.processing_time,
            success=True
        )

        # Convert grounded fields to API format
        grounded_fields_api = []
        for field in grounded_fields:
            ocr_text_found = None
            try:
                if getattr(field, 'source_text_blocks', None):
                    texts = []
                    for bid in field.source_text_blocks:
                        if isinstance(bid, int) and 0 <= bid < len(ocr.text_blocks):
                            texts.append(ocr.text_blocks[bid].text)
                    if texts:
                        ocr_text_found = " ".join(texts)
            except Exception:
                ocr_text_found = None

            # Attach compact reasoning from reasoning_map when available (array-level/type-level inheritance happens in UI)
            reasoning = reasoning_map.get(field.field_name)
            # Confidence policy: OCR-grounded → average OCR confidences; visual_only → use LLM visual_only_confidence if provided
            computed_conf = field.confidence
            try:
                if field.source_text_blocks and any(isinstance(bid, int) for bid in field.source_text_blocks):
                    ocr_confs = []
                    for bid in field.source_text_blocks:
                        if isinstance(bid, int) and 0 <= bid < len(ocr.text_blocks):
                            ocr_confs.append(float(ocr.text_blocks[bid].confidence))
                    if ocr_confs:
                        computed_conf = sum(ocr_confs) / len(ocr_confs)
                else:
                    vo = llm_response.get("visual_only_confidence", {}).get(field.field_name)
                    if isinstance(vo, (int, float)):
                        computed_conf = float(vo)
            except Exception:
                pass

            grounded_fields_api.append({
                "field_name": field.field_name,
                "value": field.value,
                "confidence": computed_conf,
                "source_text_blocks": field.source_text_blocks,
                "reasoning": reasoning if reasoning is not None else field.reasoning,
                "ocr_text_found": ocr_text_found,
                "bounding_boxes": [
                    {"x_min": b.x_min, "y_min": b.y_min, "x_max": b.x_max, "y_max": b.y_max}
                    for b in field.bounding_boxes
                ]
            })

        # Average per-field confidence
        field_confidences = [float(f["confidence"]) for f in grounded_fields_api if isinstance(f.get("confidence"), (int, float))]
        llm_confidence = sum(field_confidences) / len(field_confidences) if field_confidences else 0.0

        return StructuredExtractionResponse(
            success=True,
            extracted_data=extracted_data,
            grounded_fields=grounded_fields_api,
            ocr_results=ocr_response,
            processing_time=ocr.processing_time,
            llm_confidence=llm_confidence,
            schema_validation_passed=True if not request.json_schema else JSONSchemaValidator().validate_data(extracted_data, request.json_schema),
            prompts_used={"mode": "manual", **(llm_response.get("prompts_used", {}) or {})},
            errors=[],
            raw_llm_response=llm_response.get("raw_llm_response", None)
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


@app.post("/extract/structured/hybrid", response_model=StructuredExtractionResponse)
async def extract_structured_data_hybrid(request: StructuredExtractionRequest):
    """Hybrid RAG-style pipeline without image input to LLM.

    Stage 1: text-only extraction → extracted_data + reasoning_map
    Stage 2: filter OCR blocks using extracted_data/reasoning_map → LLM grounding from filtered blocks
    """
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

        # OCR
        ocr = await processor.process_document(image_data, confidence_threshold=request.confidence_threshold)

        # Choose provider/model
        requested_model = (request.llm_model or default_llm_model).strip().lower()
        provider = llm_providers.get(requested_model) or llm_providers.get(default_llm_model)
        if provider is None:
            raise HTTPException(status_code=503, detail="No LLM providers are configured on the server")

        # Stage 1: text-only extraction
        stage1 = await provider.extract_structured_data_from_text(
            full_text=ocr.full_text,
            json_schema=request.json_schema,
            user_prompt=request.user_prompt,
            document_type=request.document_type,
            image_data=image_data
        )
        extracted_data = stage1.get("extracted_data", {})
        reasoning_map = stage1.get("reasoning_map", {})

        # Filter OCR blocks
        rag = HybridGroundingService(provider)
        filtered_ids = rag._filter_blocks(extracted_data, reasoning_map, ocr)
        # Ignore allowed_element_types in hybrid mode (filter is AI-only by design)

        # Stage 2: LLM grounding from filtered blocks (no image)
        stage2 = await rag.stage2_ground(extracted_data, ocr, filtered_ids)

        # Process field mappings locally to build grounded fields
        field_mappings = stage2.get("field_mappings", {})
        grounded_fields_api = []
        # Convert to API format using the same logic as other endpoints
        for key, info in field_mappings.items():
            value = extracted_data
            # Resolve value by path if needed (simple split)
            try:
                path = key
                # simplistic resolver
                import re
                def get_by_path(obj, path_str):
                    cur = obj
                    # split on dots and bracket indices
                    tokens = re.findall(r"[^.\[\]]+|\[\d+\]", path_str)
                    for t in tokens:
                        if t.startswith('[') and t.endswith(']'):
                            idx = int(t[1:-1])
                            cur = cur[idx]
                        else:
                            cur = cur.get(t)
                    return cur
                value = get_by_path(extracted_data, path)
            except Exception:
                pass

            sb = info.get("source_block_id")
            sb_list = [] if sb is None else (sb if isinstance(sb, list) else [sb])
            bboxes = []
            ocr_text_found = None
            texts = []
            for bid in sb_list:
                if isinstance(bid, int) and 0 <= bid < len(ocr.text_blocks):
                    tb = ocr.text_blocks[bid]
                    bboxes.append({"x_min": tb.bounding_box.x_min, "y_min": tb.bounding_box.y_min, "x_max": tb.bounding_box.x_max, "y_max": tb.bounding_box.y_max})
                    texts.append(tb.text)
            if texts:
                ocr_text_found = " ".join(texts)

            # Merge reasoning: stage1 semantic/location (reasoning_map) + stage2 block selection
            merged_reasoning = None
            try:
                r1 = reasoning_map.get(key)
                r2 = info.get("reasoning")
                if r1 and r2:
                    merged_reasoning = f"{r1}\n\nBlock selection: {r2}"
                else:
                    merged_reasoning = r1 or r2
            except Exception:
                merged_reasoning = info.get("reasoning") or reasoning_map.get(key)

            grounded_fields_api.append({
                "field_name": key,
                "value": value,
                # Confidence policy: prefer OCR average when grounded, else use stage1 visual_only_confidence if any
                "confidence": (lambda: (
                    (sum(float(ocr.text_blocks[bid].confidence) for bid in sb_list if isinstance(bid, int) and 0 <= bid < len(ocr.text_blocks)) / max(1, sum(1 for bid in sb_list if isinstance(bid, int) and 0 <= bid < len(ocr.text_blocks))))
                    if (sb_list and any(isinstance(bid, int) for bid in sb_list))
                    else (stage1.get("visual_only_confidence", {}) or {}).get(key, info.get("confidence", 0.0))
                ))(),
                "source_text_blocks": [bid for bid in sb_list if isinstance(bid, int)],
                "reasoning": merged_reasoning,
                "ocr_text_found": ocr_text_found,
                "bounding_boxes": bboxes,
            })

        # Average confidence
        confs = [float(f["confidence"]) for f in grounded_fields_api if isinstance(f.get("confidence"), (int, float))]
        llm_confidence = sum(confs) / len(confs) if confs else 0.0

        # OCR response
        ocr_response = OCRResponse(
            full_text=ocr.full_text,
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
                for block in ocr.text_blocks
            ],
            image_dimensions={"width": ocr.image_width, "height": ocr.image_height},
            processing_time=ocr.processing_time,
            success=True
        )

        # Prepare prompts_used with mode and filtered block count
        stage2_prompts = stage2.get("prompts_used", {}) or {}
        stage2_prompts["filtered_block_count"] = len(filtered_ids)

        import json as _json
        return StructuredExtractionResponse(
            success=True,
            extracted_data=extracted_data,
            grounded_fields=grounded_fields_api,
            ocr_results=ocr_response,
            processing_time=ocr.processing_time,
            llm_confidence=llm_confidence,
            schema_validation_passed=True if not request.json_schema else JSONSchemaValidator().validate_data(extracted_data, request.json_schema),
            prompts_used={
                "mode": "hybrid",
                "stage1": stage1.get("prompts_used", {}),
                "stage2": stage2_prompts,
            },
            errors=[],
            raw_llm_response=_json.dumps({
                "stage1": {
                    "raw_llm_response": stage1.get("raw_llm_response"),
                },
                "stage2": {
                    "raw_llm_response": stage2.get("raw_llm_response"),
                }
            }, indent=2)
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


@app.post("/schema/generate", response_model=SchemaGenerationResponse)
async def generate_schema(request: SchemaGenerationRequest):
    """Generate a draft JSON schema from the document using OCR + LLM."""
    if not structured_extractor:
        raise HTTPException(status_code=503, detail="Azure OpenAI service not configured. Please set AZURE_OPENAI_API_KEY and AZURE_OPENAI_ENDPOINT")

    try:
        image_data = None
        if request.image_data:
            try:
                image_data = base64.b64decode(request.image_data)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid base64 image data")

        # Reuse OCR if full_text provided; else run OCR one time
        if request.full_text:
            full_text = request.full_text
        else:
            if image_data is None:
                raise HTTPException(status_code=400, detail="Either full_text or image_data must be provided")
            ocr = await processor.process_document(image_data)
            full_text = ocr.full_text

        # Choose provider/model
        requested_model = (request.llm_model or default_llm_model).strip().lower()
        provider = llm_providers.get(requested_model) or llm_providers.get(default_llm_model)
        if provider is None:
            raise HTTPException(status_code=503, detail="No LLM providers are configured on the server")

        result = await provider.generate_json_schema(image_data=image_data, full_text=full_text, instruction=request.instruction)

        return SchemaGenerationResponse(
            success=True,
            schema=result.get("schema"),
            prompts_used=result.get("prompts_used"),
            raw_llm_response=result.get("raw_llm_response"),
            llm_model_used=result.get("llm_model_used"),
        )
    except Exception as e:
        return SchemaGenerationResponse(success=False, schema=None, prompts_used=None, raw_llm_response=None, error_message=str(e))


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
