"""Azure OpenAI service for structured data extraction."""

import base64
import json
import logging
from typing import Dict, Any, Optional
import asyncio

from openai import AsyncAzureOpenAI

from ..core.interfaces import LLMProvider
from ..core.exceptions import DocumentOCRError
from ..models.domain import DocumentOCRResult, TextBlock
from ..prompts.system_prompts import get_extraction_system_prompt, get_enhanced_system_prompt
from ..prompts.user_prompts import get_base_extraction_prompt
from ..prompts.document_type_prompts import get_document_type_prompt, get_schema_specific_prompt


logger = logging.getLogger(__name__)


class AzureOpenAIError(DocumentOCRError):
    """Custom exception for Azure OpenAI related errors."""
    pass


class AzureOpenAIService(LLMProvider):
    """Azure OpenAI service implementation for structured data extraction."""
    
    def __init__(
        self,
        api_key: str,
        endpoint: str,
        deployment: str,
        api_version: str = "2025-01-01-preview"
    ):
        """Initialize Azure OpenAI service.
        
        Args:
            api_key: Azure OpenAI API key
            endpoint: Azure OpenAI endpoint URL
            deployment: Deployment name for GPT-4o model
            api_version: API version to use
        """
        self.client = AsyncAzureOpenAI(
            api_key=api_key,
            azure_endpoint=endpoint,
            api_version=api_version
        )
        self.deployment = deployment
        self.endpoint = endpoint
        self.api_key = api_key
        self._validate_configuration()
    
    def _validate_configuration(self) -> None:
        """Validate the Azure OpenAI configuration."""
        if not self.api_key:
            raise AzureOpenAIError("Azure OpenAI API key is required")
        
        if not self.endpoint:
            raise AzureOpenAIError("Azure OpenAI endpoint is required")
        
        if not self.deployment:
            raise AzureOpenAIError("Azure OpenAI deployment name is required")
    
    async def extract_structured_data(
        self,
        image_data: bytes,
        ocr_results: DocumentOCRResult,
        json_schema: Dict[str, Any],
        user_prompt: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extract structured data using Azure OpenAI GPT-4o with vision.
        
        Args:
            image_data: Raw image bytes
            ocr_results: OCR results from Google Document AI
            json_schema: Target JSON schema for extraction
            user_prompt: Additional user instructions
            document_type: Optional document type for specialized prompts
            
        Returns:
            Extracted structured data matching the schema
            
        Raises:
            AzureOpenAIError: If extraction fails
        """
        try:
            # Prepare the prompts using modular system
            system_prompt = self._create_system_prompt(json_schema, ocr_results, document_type)
            
            # Prepare user prompt
            final_user_prompt = self._create_user_prompt(user_prompt, json_schema, document_type)
            
            # Encode image to base64
            image_b64 = base64.b64encode(image_data).decode('utf-8')
            
            # Create messages for the API
            messages = [
                {
                    "role": "system",
                    "content": system_prompt
                },
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": final_user_prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/jpeg;base64,{image_b64}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ]
            
            # Make API call
            response = await self.client.chat.completions.create(
                model=self.deployment,
                messages=messages,
                temperature=0.1,  # Low temperature for consistent extraction
                max_tokens=4000,
                response_format={"type": "json_object"}
            )
            
            # Parse the response
            extracted_data = json.loads(response.choices[0].message.content)
            
            logger.info(f"Successfully extracted structured data using Azure OpenAI")
            return extracted_data
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Azure OpenAI response as JSON: {e}")
            raise AzureOpenAIError(f"Invalid JSON response from Azure OpenAI: {e}")
        
        except Exception as e:
            logger.error(f"Azure OpenAI extraction failed: {e}")
            raise AzureOpenAIError(f"Failed to extract structured data: {e}")
    
    def _create_system_prompt(
        self,
        json_schema: Dict[str, Any],
        ocr_results: DocumentOCRResult,
        document_type: Optional[str] = None
    ) -> str:
        """Create system prompt for structured data extraction using modular prompts."""
        
        # Convert OCR results to a structured format for the LLM
        ocr_text_blocks = []
        for i, block in enumerate(ocr_results.text_blocks):
            ocr_text_blocks.append({
                "block_id": i,
                "text": block.text,
                "confidence": block.confidence,
                "element_type": block.element_type,
                "bounding_box": {
                    "x_min": block.bounding_box.x_min,
                    "y_min": block.bounding_box.y_min,
                    "x_max": block.bounding_box.x_max,
                    "y_max": block.bounding_box.y_max
                }
            })
        
        # Prepare document context for enhanced prompts
        document_context = {}
        if document_type:
            document_context['document_type'] = document_type
        if ocr_results.image_quality:
            document_context['quality_score'] = ocr_results.image_quality.quality_score
        
        # Generate enhanced system prompt
        return get_enhanced_system_prompt(
            json_schema=json_schema,
            full_text=ocr_results.full_text,
            ocr_text_blocks=ocr_text_blocks,
            document_context=document_context if document_context else None
        )
    
    def _create_user_prompt(
        self, 
        user_prompt: Optional[str] = None,
        json_schema: Optional[Dict[str, Any]] = None,
        document_type: Optional[str] = None
    ) -> str:
        """Create user prompt for extraction using modular prompts."""
        
        # Start with base extraction prompt
        base_prompt = get_base_extraction_prompt(user_prompt)
        
        # Add document-type specific guidance
        if document_type:
            type_specific_prompt = get_document_type_prompt(document_type)
            if type_specific_prompt:
                base_prompt += f"\n\n{type_specific_prompt}"
        
        # Add schema-specific guidance
        if json_schema and 'properties' in json_schema:
            schema_guidance = get_schema_specific_prompt(json_schema['properties'])
            if schema_guidance:
                base_prompt += f"\n\n{schema_guidance}"
        
        return base_prompt
    
    async def get_model_info(self) -> Dict[str, Any]:
        """Get information about the deployed model."""
        try:
            # This would typically require a different API call
            # For now, return basic info
            return {
                "deployment": self.deployment,
                "model": "gpt-4o",
                "capabilities": ["vision", "json_output", "structured_extraction"],
                "max_tokens": 4000
            }
        except Exception as e:
            logger.error(f"Failed to get model info: {e}")
            return {"error": str(e)}

    async def validate_extraction(
        self, 
        extracted_data: Dict[str, Any], 
        json_schema: Dict[str, Any]
    ) -> bool:
        """Validate extracted data against JSON schema.
        
        Args:
            extracted_data: The extracted data to validate
            json_schema: JSON schema to validate against
            
        Returns:
            bool: True if valid, False otherwise
        """
        try:
            from jsonschema import validate, ValidationError
            validate(extracted_data, json_schema)
            return True
        except ValidationError as e:
            logger.warning(f"Schema validation failed: {e}")
            return False
        except ImportError:
            logger.warning("jsonschema library not available, skipping validation")
            # Perform basic validation without jsonschema
            if 'properties' in json_schema:
                required_fields = json_schema.get('required', [])
                for field in required_fields:
                    if field not in extracted_data:
                        return False
            return True
        except Exception as e:
            logger.error(f"Unexpected error during validation: {e}")
            return False
