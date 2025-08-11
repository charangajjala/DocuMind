"""Structured data extraction service with visual grounding."""

import base64
import copy
import logging
import time
from typing import Dict, Any, Optional, List

from ..core.interfaces import StructuredDataExtractor, DocumentProcessor, LLMProvider, SchemaValidator
from ..core.exceptions import DocumentOCRError
from ..models.domain import (
    DocumentOCRResult, 
    StructuredExtractionResult, 
    GroundedDataField,
    BoundingBox,
    EnhancedStructuredExtractionResult,
    EnhancedGroundedDataField,
    ExtractionSource,
    ExtractionStatistics
)

from .safe_ocr_selector import SafeOCRSelector

logger = logging.getLogger(__name__)


class StructuredExtractionError(DocumentOCRError):
    """Custom exception for structured extraction errors."""
    pass


class VisuallyGroundedExtractor(StructuredDataExtractor):
    """Structured data extractor with visual grounding capabilities."""
    
    def __init__(
        self,
        document_processor: DocumentProcessor,
        llm_provider: LLMProvider,
        schema_validator: SchemaValidator
    ):
        """Initialize the structured extractor.
        
        Args:
            document_processor: OCR processor for document analysis
            llm_provider: LLM service for structured extraction
            schema_validator: JSON schema validator
        """
        self.document_processor = document_processor
        self.llm_provider = llm_provider
        self.schema_validator = schema_validator
        self.selector = SafeOCRSelector()

    def _normalize_text(self, text: Any) -> str:
        try:
            s = str(text).lower().strip()
        except Exception:
            return ""
        import re
        return re.sub(r"\s+", " ", s)

    def _enforce_single_block_if_possible(
        self,
        value: Any,
        ids: List[int],
        ocr_results: DocumentOCRResult
    ) -> List[int]:
        """If any single OCR block contains the complete value, prefer that single block.
        Otherwise, keep the provided list (for true multi-block spans).
        """
        if len(ids) <= 1:
            return ids

        value_norm = self._normalize_text(value)
        if not value_norm:
            return ids

        # Specificity ranking
        specificity = {"token": 4, "line": 3, "paragraph": 2, "block": 1}

        best_idx = None
        best_score = -1.0
        for i, block in enumerate(ocr_results.text_blocks):
            block_text_norm = self._normalize_text(block.text)
            if value_norm and block_text_norm and value_norm in block_text_norm:
                score = specificity.get(getattr(block, "element_type", "block"), 1) * 10 + float(getattr(block, 'confidence', 0) or 0)
                if score > best_score:
                    best_score = score
                    best_idx = i

        if best_idx is not None:
            return [best_idx]
        return ids
    
    
    async def extract_with_visual_grounding(
        self,
        image_data: bytes,
        mime_type: str,
        json_schema: Optional[Dict[str, Any]] = None,
        user_prompt: Optional[str] = None,
        document_type: Optional[str] = None,
        llm_provider_override: Optional[LLMProvider] = None,
        allowed_element_types: Optional[List[str]] = None,
        precomputed_ocr: Optional[DocumentOCRResult] = None,
    ) -> StructuredExtractionResult:
        """Extract structured data with visual grounding.
        
        Args:
            image_data: Raw image bytes
            mime_type: MIME type of the image
            json_schema: Target JSON schema for extraction (optional)
            user_prompt: Additional user instructions
            document_type: Optional document type for specialized prompts
            
        Returns:
            StructuredExtractionResult with extracted data and grounding information
            
        Raises:
            StructuredExtractionError: If extraction fails
        """
        start_time = time.time()
        t_ocr_start: float | None = None
        t_ocr_end: float | None = None
        t_llm_start: float | None = None
        t_llm_end: float | None = None
        t_post_start: float | None = None
        errors = []
        
        try:
            # Validate inputs
            if not json_schema and not user_prompt:
                raise StructuredExtractionError("Either json_schema or user_prompt must be provided")
            
            # Step 1: Validate the JSON schema (if provided)
            if json_schema:
                logger.info("Validating JSON schema")
                if not self.schema_validator.validate_schema(json_schema):
                    errors.append("Invalid JSON schema provided")
                    raise StructuredExtractionError("Invalid JSON schema")
            else:
                logger.info("No JSON schema provided, using user prompt only")
            
            # Step 2: Process document with OCR
            if precomputed_ocr is not None:
                logger.info("Using cached OCR results")
                ocr_results = precomputed_ocr
                t_ocr_start = t_ocr_end = None
            else:
                logger.info("Processing document with OCR")
                t_ocr_start = time.time()
                ocr_results = await self.document_processor.process_document(
                    image_data, 
                    mime_type=mime_type
                )
                t_ocr_end = time.time()
            
            # Ensure text_blocks is not None - initialize as empty list if needed
            if not ocr_results.text_blocks:
                errors.append("No text blocks found in document")
                logger.warning("No text blocks found in OCR results")
                ocr_results.text_blocks = []  # Initialize as empty list to prevent None errors
            
            # Step 3: Optionally filter by allowed element types before building safe subset
            filtered_ocr = ocr_results
            try:
                if allowed_element_types:
                    allowed = {str(t).lower() for t in allowed_element_types}
                    filtered_blocks: List = []
                    for idx, b in enumerate(ocr_results.text_blocks or []):
                        if str(getattr(b, 'element_type', 'block')).lower() in allowed:
                            copied = copy.deepcopy(b)
                            # Preserve stable reference to original index so LLM block_id matches original OCR list
                            setattr(copied, 'original_index', idx)
                            filtered_blocks.append(copied)
                    filtered_ocr = DocumentOCRResult(
                        full_text=ocr_results.full_text,
                        text_blocks=filtered_blocks,
                        image_width=ocr_results.image_width,
                        image_height=ocr_results.image_height,
                        processing_time=ocr_results.processing_time,
                        image_quality=ocr_results.image_quality,
                        original_image_info=ocr_results.original_image_info,
                    )
            except Exception:
                filtered_ocr = ocr_results

            # Use filtered OCR directly (no additional optimization/subsetting in AI mode)
            subset_ocr = filtered_ocr

            # Step 4: Extract structured data using LLM (with subset)
            logger.info("Extracting structured data with LLM")
            t_llm_start = time.time()
            provider = llm_provider_override or self.llm_provider
            llm_response = await provider.extract_structured_data(
                image_data=image_data,
                ocr_results=subset_ocr,  # Use safe subset for LLM
                json_schema=json_schema,
                user_prompt=user_prompt,
                document_type=document_type  # Pass document type to LLM
            )
            t_llm_end = time.time()
            
            # Step 5: Process field mappings and create grounded fields using ORIGINAL OCR
            logger.info("Processing field mappings and visual grounding")
            t_post_start = time.time()
            grounded_fields = self._process_field_mappings(
                llm_response, ocr_results  # Use original OCR for bounding boxes
            )
            
            # Step 6: Validate extracted data against schema (if schema provided)
            extracted_data = llm_response.get("extracted_data", {})
            schema_validation_passed = True  # Default to True if no schema provided
            if json_schema:
                schema_validation_passed = self.schema_validator.validate_data(extracted_data, json_schema)
            
            if not schema_validation_passed:
                errors.append("Extracted data does not match the provided JSON schema")
            
            processing_time = time.time() - start_time
            # Compute overall confidence as average of per-field confidences (ignore None/NaN)
            field_confidences: List[float] = [
                float(f.confidence) for f in grounded_fields
                if isinstance(getattr(f, 'confidence', None), (int, float))
            ]
            llm_confidence = sum(field_confidences) / len(field_confidences) if field_confidences else 0.0
            prompts_used = llm_response.get("prompts_used", {})
            raw_llm_response = llm_response.get("raw_llm_response", None)
            llm_model_used = llm_response.get("llm_model_used")
            
            logger.info(f"Structured extraction completed in {processing_time:.2f}s")
            
            return StructuredExtractionResult(
                extracted_data=extracted_data,
                grounded_fields=grounded_fields,
                json_schema=json_schema,
                ocr_results=ocr_results,
                processing_time=processing_time,
                llm_confidence=llm_confidence,
                schema_validation_passed=schema_validation_passed,
                prompts_used=prompts_used,
                errors=errors,
                raw_llm_response=raw_llm_response,
                timers={
                    "ocr_ms": ((t_ocr_end or 0) - (t_ocr_start or 0)) * 1000,
                    "llm_ms": ((t_llm_end or 0) - (t_llm_start or 0)) * 1000,
                    "post_ms": ((time.time()) - (t_post_start or time.time())) * 1000,
                    "total_ms": processing_time * 1000,
                },
                llm_model_used=llm_model_used
            )
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"Structured extraction failed after {processing_time:.2f}s: {e}")
            errors.append(str(e))
            raise StructuredExtractionError(f"Structured extraction failed: {e}")

    async def extract_with_enhanced_grounding(
        self,
        image_data: bytes,
        mime_type: str,
        json_schema: Dict[str, Any],
        user_prompt: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> EnhancedStructuredExtractionResult:
        """Extract structured data with enhanced visual grounding analysis.
        
        Args:
            image_data: Raw image bytes
            mime_type: MIME type of the image
            json_schema: Target JSON schema for extraction
            user_prompt: Additional user instructions
            document_type: Optional document type for specialized prompts
            
        Returns:
            EnhancedStructuredExtractionResult with detailed grounding analysis
            
        Raises:
            StructuredExtractionError: If extraction fails
        """
        start_time = time.time()
        errors = []
        
        try:
            # Step 1: Validate the JSON schema
            logger.info("Validating JSON schema")
            if not self.schema_validator.validate_schema(json_schema):
                errors.append("Invalid JSON schema provided")
                raise StructuredExtractionError("Invalid JSON schema")
            
            # Step 2: Process document with OCR
            logger.info("Processing document with OCR")
            ocr_results = await self.document_processor.process_document(
                image_data, 
                mime_type=mime_type
            )
            
            if not ocr_results.text_blocks:
                errors.append("No text blocks found in document")
                logger.warning("No text blocks found in OCR results")
            
            # Step 3: Build a safe subset for LLM input (non-destructive)
            subset_ocr = self.selector.select_subset(ocr_results, json_schema)

            # Step 4: Extract structured data using LLM
            logger.info("Extracting structured data with LLM")
            llm_response = await self.llm_provider.extract_structured_data(
                image_data=image_data,
                ocr_results=subset_ocr,  # Use safe subset for LLM
                json_schema=json_schema,
                user_prompt=user_prompt,
                document_type=document_type
            )
            
            # Step 5: Process field mappings and create enhanced grounded fields using ORIGINAL OCR
            logger.info("Processing enhanced field mappings and visual grounding")
            enhanced_fields = self._process_enhanced_field_mappings(
                llm_response, ocr_results  # Use original OCR for bounding boxes
            )
            
            # Step 6: Calculate extraction statistics
            total_requested = len(json_schema.get("properties", {})) if json_schema else 0
            extraction_stats = self._calculate_extraction_statistics(enhanced_fields, total_requested)
            
            # Step 7: Validate extracted data against schema (if schema provided)
            extracted_data = llm_response.get("extracted_data", {})
            schema_validation_passed = True  # Default to True if no schema provided
            if json_schema:
                schema_validation_passed = self.schema_validator.validate_data(extracted_data, json_schema)
                if not schema_validation_passed:
                    errors.append("Extracted data does not match the provided JSON schema")
            
            processing_time = time.time() - start_time
            llm_confidence = llm_response.get("overall_confidence", 0.0)
            prompts_used = llm_response.get("prompts_used", {})
            raw_llm_response = llm_response.get("raw_llm_response", None)
            
            logger.info(f"Enhanced structured extraction completed in {processing_time:.2f}s")
            logger.info(f"Extraction statistics: {extraction_stats.success_rate:.2%} success rate, "
                       f"{extraction_stats.visual_enhancement_rate:.2%} visual enhancement rate")
            
            return EnhancedStructuredExtractionResult(
                extracted_data=extracted_data,
                enhanced_grounded_fields=enhanced_fields,
                json_schema=json_schema,
                ocr_results=ocr_results,
                processing_time=processing_time,
                llm_confidence=llm_confidence,
                schema_validation_passed=schema_validation_passed,
                extraction_statistics=extraction_stats,
                prompts_used=prompts_used,
                errors=errors,
                raw_llm_response=raw_llm_response
            )
            
        except Exception as e:
            processing_time = time.time() - start_time
            logger.error(f"Enhanced structured extraction failed after {processing_time:.2f}s: {e}")
            errors.append(str(e))
            
            # Create minimal stats for error case
            error_stats = ExtractionStatistics(
                total_fields_requested=len(json_schema.get("properties", {})) if json_schema else 0,
                ocr_grounded_count=0,
                visual_only_count=0,
                failed_count=0,
                average_confidence=0.0,
                ocr_agreement_rate=0.0
            )
            
            raise StructuredExtractionError(f"Enhanced structured extraction failed: {e}")

    def _expand_array_mappings(
        self,
        field_mappings: Dict[str, Any],
        extracted_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Expand array-level mappings to individual indexed mappings."""
        expanded_mappings = {}
        
        # First, copy all non-array mappings and reasoning-only entries
        for key, mapping in field_mappings.items():
            if isinstance(mapping, dict):
                if "value" in mapping and isinstance(mapping["value"], list):
                    # This is an array-level mapping - expand it
                    array_values = mapping["value"]
                    array_source_blocks = mapping.get("source_block_id", [])
                    array_confidence = mapping.get("confidence", 0.0)
                    array_reasoning = mapping.get("reasoning")
                    
                    # Ensure source_block_ids is a list
                    if not isinstance(array_source_blocks, list):
                        array_source_blocks = [array_source_blocks] if array_source_blocks is not None else []
                    
                    # Add reasoning-only entry for the array
                    if array_reasoning:
                        expanded_mappings[key] = {"reasoning": array_reasoning}
                    
                    # Create individual indexed mappings
                    for i, value in enumerate(array_values):
                        indexed_key = f"{key}[{i}]"
                        source_block_id = array_source_blocks[i] if i < len(array_source_blocks) else "visual_only"
                        
                        expanded_mappings[indexed_key] = {
                            "value": value,
                            "confidence": array_confidence,
                            "source_block_id": source_block_id
                        }
                else:
                    # Regular mapping or reasoning-only entry
                    expanded_mappings[key] = mapping
        
        return expanded_mappings

    def _process_field_mappings(
        self,
        llm_response: Dict[str, Any],
        ocr_results: DocumentOCRResult
    ) -> List[GroundedDataField]:
        """Process LLM field mappings into grounded data fields."""
        grounded_fields: List[GroundedDataField] = []
        field_mappings = llm_response.get("field_mappings", {})
        extracted_data = llm_response.get("extracted_data", {})
        
        # Convert array-level mappings to individual indexed mappings
        logger.info(f"Original field_mappings keys: {list(field_mappings.keys())}")
        field_mappings = self._expand_array_mappings(field_mappings, extracted_data)
        logger.info(f"Expanded field_mappings keys: {list(field_mappings.keys())}")

        def is_leaf_mapping(node: Any) -> bool:
            return isinstance(node, dict) and (
                "value" in node and ("source_block_id" in node or "source_block_ids" in node or "confidence" in node or "reasoning" in node)
            )

        def normalize_ids(field_info: Dict[str, Any]) -> List[int]:
            # Accept single id, list of ids, or "visual_only"
            raw = field_info.get("source_block_id")
            if raw is None:
                return []
            if raw == "visual_only":
                return []
            # Normalize to list
            raw_list = raw if isinstance(raw, list) else [raw]
            ids: List[int] = []
            for bid in raw_list:
                if bid == "visual_only":
                    # Entire field treated as visual only
                    return []
                if isinstance(bid, int):
                    ids.append(bid)
                elif isinstance(bid, str) and bid.isdigit():
                    ids.append(int(bid))
            # Deduplicate while preserving order
            seen = set()
            deduped: List[int] = []
            for i in ids:
                if i not in seen:
                    seen.add(i)
                    deduped.append(i)
            return deduped

        # local helpers removed; using class-level enforcement to avoid linter scope issues

        def walk(prefix: str, node: Any):
            # Include array-level reasoning-only entries as separate fields
            if isinstance(node, dict) and "reasoning" in node and "value" not in node:
                grounded_fields.append(
                    GroundedDataField(
                        field_name=prefix,
                        value=None,
                        confidence=0.0,
                        source_text_blocks=[],
                        bounding_boxes=[],
                        reasoning=node.get("reasoning"),
                    )
                )
                return

            if is_leaf_mapping(node):
                field_name = prefix
                field_info = node
                value = field_info.get("value")
                confidence = field_info.get("confidence", 0.0)
                reasoning = field_info.get("reasoning")
                
                source_block_ids = normalize_ids(field_info)
                source_block_ids = self._enforce_single_block_if_possible(value, source_block_ids, ocr_results)

                # Build bounding boxes from normalized ids
                bounding_boxes: List[BoundingBox] = []
                ocr_confs: List[float] = []
                for block_id in source_block_ids:
                    if isinstance(block_id, int) and 0 <= block_id < len(ocr_results.text_blocks):
                        tb = ocr_results.text_blocks[block_id]
                        bounding_boxes.append(tb.bounding_box)
                        if isinstance(getattr(tb, 'confidence', None), (int, float)):
                            ocr_confs.append(float(tb.confidence))

                # If OCR confidences available, set field confidence to their average
                if ocr_confs:
                    confidence = sum(ocr_confs) / len(ocr_confs)

                grounded_fields.append(
                    GroundedDataField(
                        field_name=field_name,
                        value=value,
                        confidence=confidence,
                        source_text_blocks=source_block_ids,
                        bounding_boxes=bounding_boxes,
                        reasoning=reasoning,
                    )
                )
                return

            if isinstance(node, dict):
                for key, child in node.items():
                    new_prefix = f"{prefix}.{key}" if prefix else str(key)
                    walk(new_prefix, child)
            elif isinstance(node, list):
                # Support list structures within field_mappings by indexing items
                for idx, child in enumerate(node):
                    new_prefix = f"{prefix}[{idx}]" if prefix else f"[{idx}]"
                    walk(new_prefix, child)

        walk("", field_mappings)
        return grounded_fields

    def _process_enhanced_field_mappings(
        self,
        llm_response: Dict[str, Any],
        ocr_results: DocumentOCRResult
    ) -> List[EnhancedGroundedDataField]:
        """Process LLM field mappings into enhanced grounded data fields."""
        enhanced_fields = []
        field_mappings = llm_response.get("field_mappings", {})
        extracted_data = llm_response.get("extracted_data", {})
        
        # Convert array-level mappings to individual indexed mappings
        field_mappings = self._expand_array_mappings(field_mappings, extracted_data)

        def is_leaf_mapping(node: Any) -> bool:
            return isinstance(node, dict) and (
                "value" in node and ("source_block_id" in node or "source_block_ids" in node or "confidence" in node or "reasoning" in node)
            )

        def normalize_ids(field_info: Dict[str, Any]) -> List[int]:
            raw_ids = field_info.get("source_block_ids")
            if raw_ids is None:
                raw_single = field_info.get("source_block_id")
                raw_ids = [raw_single] if raw_single is not None else []
            ids: List[int] = []
            for bid in raw_ids:
                if bid == "visual_only":
                    return []
                if isinstance(bid, int):
                    ids.append(bid)
                elif isinstance(bid, str) and bid.isdigit():
                    ids.append(int(bid))
            return ids

        def find_array_reasoning(field_name: str) -> Optional[str]:
            """Find array-level reasoning for individual array elements.
            Returns None if not found (to avoid duplicating placeholder text).
            """
            if '[' in field_name and ']' in field_name:
                # For items[0].sku, look for items[].sku reasoning
                base_pattern = field_name.replace(field_name[field_name.find('['):field_name.find(']')+1], '[]')
                if base_pattern in field_mappings and isinstance(field_mappings[base_pattern], dict):
                    array_reasoning = field_mappings[base_pattern].get('reasoning')
                    if array_reasoning:
                        return array_reasoning
                # For tags[0], look for tags reasoning  
                array_name = field_name.split('[')[0]
                if array_name in field_mappings and isinstance(field_mappings[array_name], dict):
                    array_reasoning = field_mappings[array_name].get('reasoning')
                    if array_reasoning:
                        return array_reasoning
            return None

        def walk(prefix: str, node: Any):
            if is_leaf_mapping(node):
                field_name = prefix
                field_info = node
                value = field_info.get("value")
                confidence = field_info.get("confidence", 0.0)
                reasoning = field_info.get("reasoning")
                if reasoning is None:
                    reasoning = find_array_reasoning(field_name)
                
                # If no direct reasoning, try to find array-level reasoning
                if not reasoning:
                    reasoning = find_array_reasoning(field_name)
                
                normalized_ids = normalize_ids(field_info)
                normalized_ids = self._enforce_single_block_if_possible(value, normalized_ids, ocr_results)

                # Determine extraction source based on ids
                extraction_source = self._determine_extraction_source(normalized_ids)

                # Build bounding boxes and OCR text
                bounding_boxes: List[BoundingBox] = []
                ocr_text_found = None
                if extraction_source == ExtractionSource.OCR_GROUNDED:
                    ocr_texts: List[str] = []
                    for block_id in normalized_ids:
                        if isinstance(block_id, int) and 0 <= block_id < len(ocr_results.text_blocks):
                            text_block = ocr_results.text_blocks[block_id]
                            bounding_boxes.append(text_block.bounding_box)
                            ocr_texts.append(text_block.text)
                    if ocr_texts:
                        ocr_text_found = " ".join(ocr_texts)

                source_text_blocks: List[int] = []
                if extraction_source == ExtractionSource.OCR_GROUNDED:
                    source_text_blocks = [bid for bid in normalized_ids if isinstance(bid, int)]

                enhanced_fields.append(
                    EnhancedGroundedDataField(
                        field_name=field_name,
                        value=value,
                        confidence=confidence,
                        extraction_source=extraction_source,
                        source_text_blocks=source_text_blocks,
                        bounding_boxes=bounding_boxes,
                        reasoning=reasoning,
                        ocr_text_found=ocr_text_found,
                        visual_description=None,
                    )
                )
                return

            if isinstance(node, dict):
                for key, child in node.items():
                    new_prefix = f"{prefix}.{key}" if prefix else str(key)
                    walk(new_prefix, child)
            elif isinstance(node, list):
                # Support list structures within field_mappings by indexing items
                for idx, child in enumerate(node):
                    new_prefix = f"{prefix}[{idx}]" if prefix else f"[{idx}]"
                    walk(new_prefix, child)

        walk("", field_mappings)
        return enhanced_fields

    def _determine_extraction_source(self, source_block_ids: List) -> ExtractionSource:
        """Determine extraction source based on source_block_ids."""
        if not source_block_ids:
            return ExtractionSource.FAILED
        elif source_block_ids == ["visual_only"] or (len(source_block_ids) == 1 and source_block_ids[0] == "visual_only"):
            return ExtractionSource.VISUAL_ONLY
        elif all(isinstance(bid, int) for bid in source_block_ids):
            return ExtractionSource.OCR_GROUNDED
        else:
            # Mixed or invalid source_block_ids
            return ExtractionSource.FAILED

    def _calculate_extraction_statistics(
        self,
        enhanced_fields: List[EnhancedGroundedDataField],
        total_requested: int
    ) -> ExtractionStatistics:
        """Calculate extraction statistics from enhanced fields."""
        ocr_grounded_count = len([f for f in enhanced_fields if f.extraction_source == ExtractionSource.OCR_GROUNDED])
        visual_only_count = len([f for f in enhanced_fields if f.extraction_source == ExtractionSource.VISUAL_ONLY])
        failed_count = len([f for f in enhanced_fields if f.extraction_source == ExtractionSource.FAILED])
        
        # Calculate average confidence
        if enhanced_fields:
            average_confidence = sum(f.confidence for f in enhanced_fields) / len(enhanced_fields)
        else:
            average_confidence = 0.0
        
        # OCR agreement rate (fields that were successfully grounded in OCR)
        successful_extractions = ocr_grounded_count + visual_only_count
        ocr_agreement_rate = ocr_grounded_count / successful_extractions if successful_extractions > 0 else 0.0
        
        return ExtractionStatistics(
            total_fields_requested=total_requested,
            ocr_grounded_count=ocr_grounded_count,
            visual_only_count=visual_only_count,
            failed_count=failed_count,
            average_confidence=average_confidence,
            ocr_agreement_rate=ocr_agreement_rate
        )
