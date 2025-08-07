"""Prompt management module for structured data extraction."""

from typing import Dict, Any, Optional
from abc import ABC, abstractmethod


class PromptTemplate(ABC):
    """Abstract base class for prompt templates."""
    
    @abstractmethod
    def get_system_prompt(self, **kwargs) -> str:
        """Generate system prompt with provided context."""
        pass
    
    @abstractmethod
    def get_user_prompt(self, **kwargs) -> str:
        """Generate user prompt with provided context."""
        pass


class StructuredExtractionPrompts(PromptTemplate):
    """Prompts for structured data extraction with visual grounding."""
    
    def get_system_prompt(
        self,
        json_schema: Dict[str, Any],
        full_text: str,
        ocr_text_blocks: list
    ) -> str:
        """Generate system prompt for structured data extraction."""
        import json
        
        return f"""You are an expert document data extraction assistant. You help users extract structured information from document images by analyzing both the visual content and OCR text results. You're knowledgeable about various document types and can understand complex layouts and data relationships.

You have access to these resources:
- Target JSON schema: {json.dumps(json_schema, indent=2)}
- Full document text: {full_text}
- OCR text blocks with locations: {json.dumps(ocr_text_blocks, indent=2)}

You're collaborative, precise, and explain your reasoning clearly. When you're uncertain about something, you'll be honest about it rather than guess."""

    def get_user_prompt(self, user_prompt: Optional[str] = None) -> str:
        """Generate user prompt for extraction with enhanced visual capabilities."""
        
        base_prompt = """Please extract structured data from this document image according to the JSON schema provided in your context. Here's what I need you to do:

IMPORTANT: You are NOT limited to extracting only what's in the OCR results! OCR can sometimes miss information due to image quality, formatting, or complex layouts. Use your visual understanding to extract ALL relevant information from the image, even if it's not captured in the OCR text blocks.

However, when you DO find information that matches or confirms what's in the OCR results, you MUST ground it by referencing the corresponding OCR text block IDs. This helps with visual grounding and validation.

Instructions:
1. Extract data that matches the provided JSON schema exactly
2. Use BOTH visual analysis of the image AND OCR results for maximum accuracy
3. Don't limit yourself to OCR-only data - extract visually readable information even if OCR missed it
4. For fields where you can confirm the value exists in OCR text blocks, MANDATORY: reference those block IDs
5. CRITICAL: For each field, find the SINGLE SMALLEST text element that contains the ENTIRE field value:
   - For "John Smith", prefer one line block containing both words over separate token blocks
   - For single words like "John", prefer the token block
   - Always choose the most specific element that contains the complete field content
   - If multiple blocks contain the same complete value, prefer the smallest one
6. For fields extracted purely from visual analysis (not in OCR), indicate "visual_only" in source_block_ids
7. Return data in valid JSON format that matches the schema
8. If a field cannot be found clearly, use null for optional fields
9. Be precise with data types (strings, numbers, dates, etc.)

Please return a JSON object with this structure:
{
    "extracted_data": { /* Data matching the target schema */ },
    "field_mappings": {
        /* For each field, provide the SINGLE smallest text element that contains the complete field value */
        "field_name": {
            "value": "extracted_value",
            "confidence": 0.95,
            "source_block_ids": [12] /* SINGLE block ID - the smallest element containing the entire field value */,
            "reasoning": "Brief explanation of extraction source and confidence"
        }
    },
    "overall_confidence": 0.89
}

Key Guidelines:
- PRIMARY: Extract from visual analysis - don't be limited by OCR gaps
- SECONDARY: When OCR confirms your visual findings, reference those block IDs
- ONE BLOCK PER FIELD: Each field should map to exactly ONE text element that contains the complete value
- SMALLEST CONTAINER: Choose the smallest element that fits the entire field content
- COMPLETE COVERAGE: Ensure the selected block contains the full field value, not just part of it
- HIERARCHY PREFERENCE: Token (for single words) > Line (for phrases) > Paragraph (for sentences) > Block (for large content)
- Use "visual_only" for data you see visually but isn't in OCR results
- Prioritize accuracy over OCR dependency
- Provide confidence scores based on visual clarity and OCR confirmation
- Consider document layout, formatting, and visual context for better understanding"""
        
        if user_prompt:
            return f"{base_prompt}\n\nAdditional instructions: {user_prompt}"
        
        return base_prompt


class PromptManager:
    """Central manager for all prompt templates."""
    
    def __init__(self):
        self.extraction_prompts = StructuredExtractionPrompts()
    
    def get_extraction_prompts(
        self,
        json_schema: Dict[str, Any],
        full_text: str,
        ocr_text_blocks: list,
        user_prompt: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> tuple[str, str]:
        """Get system and user prompts for extraction.
        
        Args:
            json_schema: Target JSON schema
            full_text: Full OCR text
            ocr_text_blocks: OCR text blocks with metadata
            user_prompt: Additional user instructions
            document_type: Optional document type (ignored, kept for compatibility)
            
        Returns:
            Tuple of (system_prompt, user_prompt)
        """
        system_prompt = self.extraction_prompts.get_system_prompt(
            json_schema=json_schema,
            full_text=full_text,
            ocr_text_blocks=ocr_text_blocks
        )
        
        # Get user prompt (document_type is ignored)
        user_prompt_text = self.extraction_prompts.get_user_prompt(user_prompt)
        
        return system_prompt, user_prompt_text
