"""Structured data extraction service with visual grounding."""

import base64
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
from .text_element_optimizer import TextElementOptimizer, OptimizationConfig, OptimizationStrategy


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
        schema_validator: SchemaValidator,
        optimizer_config: OptimizationConfig = None
    ):
        """Initialize the structured extractor.
        
        Args:
            document_processor: OCR processor for document analysis
            llm_provider: LLM service for structured extraction
            schema_validator: JSON schema validator
            optimizer_config: Configuration for text element optimization
        """
        self.document_processor = document_processor
        self.llm_provider = llm_provider
        self.schema_validator = schema_validator
        self.text_optimizer = TextElementOptimizer(optimizer_config)
    
    
    async def extract_with_visual_grounding(
        self,
        image_data: bytes,
        mime_type: str,
        json_schema: Optional[Dict[str, Any]] = None,
        user_prompt: Optional[str] = None,
        document_type: Optional[str] = None
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
            logger.info("Processing document with OCR")
            ocr_results = await self.document_processor.process_document(
                image_data, 
                mime_type=mime_type
            )
            
            # Ensure text_blocks is not None - initialize as empty list if needed
            if not ocr_results.text_blocks:
                errors.append("No text blocks found in document")
                logger.warning("No text blocks found in OCR results")
                ocr_results.text_blocks = []  # Initialize as empty list to prevent None errors
            
            # Step 2.5: Optimize text blocks for LLM efficiency
            logger.info(f"Optimizing {len(ocr_results.text_blocks)} text blocks for LLM")
            optimized_text_blocks = self.text_optimizer.optimize_for_llm(
                ocr_results.text_blocks,
                json_schema=json_schema,
                user_context=user_prompt
            )
            optimization_summary = self.text_optimizer.get_optimization_summary(
                len(ocr_results.text_blocks), len(optimized_text_blocks)
            )
            logger.info(f"Text optimization complete: {optimization_summary}")
            
            # Create optimized OCR results for LLM processing
            optimized_ocr_results = DocumentOCRResult(
                full_text=ocr_results.full_text,
                text_blocks=optimized_text_blocks,
                image_width=ocr_results.image_width,
                image_height=ocr_results.image_height,
                processing_time=ocr_results.processing_time,
                image_quality=ocr_results.image_quality,
                raw_document_ai_response=ocr_results.raw_document_ai_response
            )
            
            # Step 3: Extract structured data using LLM (with optimized text blocks)
            logger.info("Extracting structured data with LLM")
            llm_response = await self.llm_provider.extract_structured_data(
                image_data=image_data,
                ocr_results=optimized_ocr_results,  # Use optimized results
                json_schema=json_schema,
                user_prompt=user_prompt,
                document_type=document_type  # Pass document type to LLM
            )
            
            # Step 4: Process field mappings and create grounded fields
            logger.info("Processing field mappings and visual grounding")
            grounded_fields = self._process_field_mappings(
                llm_response, ocr_results  # Use original OCR results for grounding
            )
            
            # Step 5: Validate extracted data against schema (if schema provided)
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
                raw_llm_response=raw_llm_response
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
            
            # Step 2.5: Optimize text blocks for LLM efficiency
            logger.info(f"Optimizing {len(ocr_results.text_blocks)} text blocks for enhanced LLM processing")
            optimized_text_blocks = self.text_optimizer.optimize_for_llm(
                ocr_results.text_blocks,
                json_schema=json_schema,
                user_context=user_prompt
            )
            optimization_summary = self.text_optimizer.get_optimization_summary(
                len(ocr_results.text_blocks), len(optimized_text_blocks)
            )
            logger.info(f"Enhanced text optimization complete: {optimization_summary}")
            
            # Create optimized OCR results for LLM processing
            optimized_ocr_results = DocumentOCRResult(
                full_text=ocr_results.full_text,
                text_blocks=optimized_text_blocks,
                image_width=ocr_results.image_width,
                image_height=ocr_results.image_height,
                processing_time=ocr_results.processing_time,
                image_quality=ocr_results.image_quality,
                raw_document_ai_response=ocr_results.raw_document_ai_response
            )
            
            # Step 3: Extract structured data using LLM (with optimized text blocks)
            logger.info("Extracting structured data with LLM")
            llm_response = await self.llm_provider.extract_structured_data(
                image_data=image_data,
                ocr_results=optimized_ocr_results,  # Use optimized results
                json_schema=json_schema,
                user_prompt=user_prompt,
                document_type=document_type
            )
            
            # Step 4: Process field mappings and create enhanced grounded fields
            logger.info("Processing enhanced field mappings and visual grounding")
            enhanced_fields = self._process_enhanced_field_mappings(
                llm_response, ocr_results  # Use original OCR results for grounding
            )
            
            # Step 5: Calculate extraction statistics
            total_requested = len(json_schema.get("properties", {})) if json_schema else 0
            extraction_stats = self._calculate_extraction_statistics(enhanced_fields, total_requested)
            
            # Step 6: Validate extracted data against schema (if schema provided)
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

    def _process_field_mappings(
        self,
        llm_response: Dict[str, Any],
        ocr_results: DocumentOCRResult
    ) -> List[GroundedDataField]:
        """Process LLM field mappings into grounded data fields."""
        grounded_fields = []
        field_mappings = llm_response.get("field_mappings", {})
        
        for field_name, field_info in field_mappings.items():
            value = field_info.get("value")
            confidence = field_info.get("confidence", 0.0)
            
            # Handle both source_block_id (singular) and source_block_ids (plural) formats
            source_block_ids = field_info.get("source_block_ids", [])
            if not source_block_ids:
                # Try singular format
                source_block_id = field_info.get("source_block_id")
                if source_block_id is not None:
                    if isinstance(source_block_id, (int, str)):
                        source_block_ids = [source_block_id]
                    else:
                        source_block_ids = []
            
            # Post-process to select only the most specific text block per field
            processed_block_ids = self._select_most_specific_text_blocks(
                source_block_ids, ocr_results.text_blocks
            )
            
            # Get bounding boxes for the processed source text blocks
            bounding_boxes = []
            for block_id in processed_block_ids:
                if isinstance(block_id, int) and 0 <= block_id < len(ocr_results.text_blocks):
                    bounding_boxes.append(ocr_results.text_blocks[block_id].bounding_box)
            
            grounded_field = GroundedDataField(
                field_name=field_name,
                value=value,
                confidence=confidence,
                source_text_blocks=processed_block_ids,
                bounding_boxes=bounding_boxes
            )
            
            grounded_fields.append(grounded_field)
        
        return grounded_fields

    def _select_most_specific_text_blocks(
        self,
        source_block_ids: list,
        text_blocks: list
    ) -> list:
        """Select the single most specific text block that contains the entire field value.
        
        This post-processing step finds the smallest/most specific text element that can
        contain the complete field value, ensuring one precise bounding box per field.
        
        Args:
            source_block_ids: List of block IDs from LLM response
            text_blocks: List of all OCR text blocks
            
        Returns:
            List containing the single most specific block ID that covers the entire field
        """
        # Handle non-numeric IDs (like "visual_only")
        numeric_ids = [
            block_id for block_id in source_block_ids 
            if isinstance(block_id, int) and 0 <= block_id < len(text_blocks)
        ]
        
        # If no valid numeric IDs, return original list
        if not numeric_ids:
            return source_block_ids
            
        # If only one block, return it
        if len(numeric_ids) == 1:
            return numeric_ids
        
        # Find the smallest block that likely contains the entire field value
        # Strategy: prefer the block with smallest area among the provided blocks
        best_block_id = None
        smallest_area = float('inf')
        
        for block_id in numeric_ids:
            text_block = text_blocks[block_id]
            bbox = text_block.bounding_box
            
            # Calculate area of bounding box
            width = abs(bbox.x_max - bbox.x_min)
            height = abs(bbox.y_max - bbox.y_min)
            area = width * height
            
            # Select the smallest area (most specific element that contains the field)
            if area < smallest_area:
                smallest_area = area
                best_block_id = block_id
        
        # Log the selected block for debugging
        if best_block_id is not None and best_block_id < len(text_blocks):
            selected_block = text_blocks[best_block_id]
            logger.debug(f"Selected most specific block {best_block_id} (type: {selected_block.element_type}, area: {smallest_area:.6f}) from candidates: {numeric_ids}")
        
        # Return the single most specific block as a single-item list
        return [best_block_id] if best_block_id is not None else numeric_ids[:1]

    def _process_enhanced_field_mappings(
        self,
        llm_response: Dict[str, Any],
        ocr_results: DocumentOCRResult
    ) -> List[EnhancedGroundedDataField]:
        """Process LLM field mappings into enhanced grounded data fields."""
        enhanced_fields = []
        field_mappings = llm_response.get("field_mappings", {})
        
        for field_name, field_info in field_mappings.items():
            value = field_info.get("value")
            confidence = field_info.get("confidence", 0.0)
            
            # Handle both source_block_id (singular) and source_block_ids (plural) formats
            source_block_ids = field_info.get("source_block_ids", [])
            if not source_block_ids:
                # Try singular format
                source_block_id = field_info.get("source_block_id")
                if source_block_id is not None:
                    if isinstance(source_block_id, (int, str)):
                        source_block_ids = [source_block_id]
                    else:
                        source_block_ids = []
            
            reasoning = field_info.get("reasoning", "No reasoning provided")
            
            # Post-process to select only the most specific text block per field
            processed_block_ids = self._select_most_specific_text_blocks(
                source_block_ids, ocr_results.text_blocks
            )
            
            # Determine extraction source based on processed source_block_ids
            extraction_source = self._determine_extraction_source(processed_block_ids)
            
            # Get bounding boxes and OCR text for OCR-grounded fields
            bounding_boxes = []
            ocr_text_found = None
            
            if extraction_source == ExtractionSource.OCR_GROUNDED:
                ocr_texts = []
                for block_id in processed_block_ids:
                    if isinstance(block_id, int) and 0 <= block_id < len(ocr_results.text_blocks):
                        text_block = ocr_results.text_blocks[block_id]
                        bounding_boxes.append(text_block.bounding_box)
                        ocr_texts.append(text_block.text)
                
                if ocr_texts:
                    ocr_text_found = " ".join(ocr_texts)
            
            # Clean source_text_blocks for enhanced field (only integers)
            source_text_blocks = []
            if extraction_source == ExtractionSource.OCR_GROUNDED:
                source_text_blocks = [bid for bid in processed_block_ids if isinstance(bid, int)]
            
            enhanced_field = EnhancedGroundedDataField(
                field_name=field_name,
                value=value,
                confidence=confidence,
                extraction_source=extraction_source,
                source_text_blocks=source_text_blocks,
                bounding_boxes=bounding_boxes,
                reasoning=reasoning,
                ocr_text_found=ocr_text_found,
                visual_description=None  # Could be enhanced later
            )
            
            enhanced_fields.append(enhanced_field)
        
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
