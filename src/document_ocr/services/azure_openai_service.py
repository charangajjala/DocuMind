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
from ..prompts.document_type_prompts import get_schema_specific_prompt
from ..prompts.text_only_prompts import (
    get_text_only_user_override,
    get_text_only_system_prompt,
    get_text_only_user_prompt,
)
from ..prompts.schema_generation_prompts import (
    get_schema_generation_system_prompt,
    build_schema_generation_user_text,
)


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
    def _normalize_field_mappings(self, field_mappings: Dict[str, Any], extracted_data: Dict[str, Any]) -> Dict[str, Any]:
        """Ensure arrays in field_mappings are expanded into per-index entries.

        Accepts array-level reasoning (e.g., "items[].sku" or "tags") but forbids array values under a single key.
        """
        normalized: Dict[str, Any] = {}

        for key, mapping in field_mappings.items():
            # Pass-through non-dicts
            if not isinstance(mapping, dict):
                normalized[key] = mapping
                continue

            # If mapping has an array value, expand to per-index entries
            if "value" in mapping and isinstance(mapping["value"], list):
                values = mapping["value"]
                confidence = mapping.get("confidence", 0.0)
                source_blocks = mapping.get("source_block_id", [])
                if not isinstance(source_blocks, list):
                    source_blocks = [source_blocks] if source_blocks is not None else []

                # Keep array-level reasoning only
                if mapping.get("reasoning"):
                    normalized[key] = {"reasoning": mapping["reasoning"]}

                # Emit per-index entries
                for i, v in enumerate(values):
                    indexed_key = f"{key}[{i}]"
                    sbid = source_blocks[i] if i < len(source_blocks) else "visual_only"
                    normalized[indexed_key] = {
                        "value": v,
                        "confidence": confidence,
                        "source_block_id": sbid,
                    }
                continue

            # Otherwise keep as-is
            normalized[key] = mapping

        return normalized
        
        if not self.endpoint:
            raise AzureOpenAIError("Azure OpenAI endpoint is required")
        
        if not self.deployment:
            raise AzureOpenAIError("Azure OpenAI deployment name is required")
    
    async def extract_structured_data(
        self,
        image_data: bytes,
        ocr_results: DocumentOCRResult,
        json_schema: Optional[Dict[str, Any]] = None,
        user_prompt: Optional[str] = None,
        document_type: Optional[str] = None
    ) -> Dict[str, Any]:
        """Extract structured data using Azure OpenAI GPT-4o with vision.
        
        Args:
            image_data: Raw image bytes
            ocr_results: OCR results from Google Document AI
            json_schema: Target JSON schema for extraction (optional)
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
            
            # Prepare user prompt (document_type parameter is ignored)
            final_user_prompt = self._create_user_prompt(user_prompt, json_schema)
            
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
            
            # Approximate token estimates
            def _approx_text_tokens(text: str) -> int:
                # Rough heuristic: 1 token ≈ 4 chars
                return max(0, (len(text) // 4))

            system_tokens = _approx_text_tokens(system_prompt)
            user_tokens = _approx_text_tokens(final_user_prompt)
            # Approximate image tokens using megapixels * factor with a floor
            image_tokens = 0
            try:
                if hasattr(ocr_results, "image_width") and hasattr(ocr_results, "image_height"):
                    megapixels = (ocr_results.image_width * ocr_results.image_height) / 1_000_000.0
                    image_tokens = max(100, int(megapixels * 300))
            except Exception:
                image_tokens = 100
            total_estimated_input_tokens = system_tokens + user_tokens + image_tokens

            # Make API call
            response = await self.client.chat.completions.create(
                model=self.deployment,
                messages=messages,
                response_format={"type": "json_object"}
            )
            
            # Capture the raw LLM response before any processing
            raw_llm_response = response.choices[0].message.content
            
            # Log the raw response for debugging
            logger.info(f"Raw LLM response: {raw_llm_response}")
            
            # Parse the response - LLM returns ExtractionResponse format
            llm_full_response = json.loads(raw_llm_response)

            # Normalize field_mappings to ensure per-index entries for arrays
            try:
                llm_full_response["field_mappings"] = self._normalize_field_mappings(
                    llm_full_response.get("field_mappings", {}),
                    llm_full_response.get("extracted_data", {})
                )
            except Exception:
                # Do not fail extraction if normalization encounters unexpected structure
                pass
            
            # Add the prompts used and raw response to the LLM response
            llm_full_response["prompts_used"] = {
                "system_prompt": system_prompt,
                "user_prompt": final_user_prompt,
                "token_estimates": {
                    "system_prompt_tokens": system_tokens,
                    "user_prompt_tokens": user_tokens,
                    "image_input_tokens": image_tokens,
                    "total_estimated_input_tokens": total_estimated_input_tokens,
                },
                "subset_block_count": len(ocr_results.text_blocks or []),
            }
            llm_full_response["raw_llm_response"] = raw_llm_response
            llm_full_response["llm_model_used"] = self.deployment
            
            logger.info(f"Successfully extracted structured data using Azure OpenAI")
            return llm_full_response
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Azure OpenAI response as JSON: {e}")
            raise AzureOpenAIError(f"Invalid JSON response from Azure OpenAI: {e}")
        
        except Exception as e:
            logger.error(f"Azure OpenAI extraction failed: {e}")
            raise AzureOpenAIError(f"Failed to extract structured data: {e}")

    async def extract_structured_data_from_text(
        self,
        full_text: str,
        json_schema: Optional[Dict[str, Any]] = None,
        user_prompt: Optional[str] = None,
        document_type: Optional[str] = None,
        image_data: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        """Extract structured data using text-only (no image, no OCR blocks/bboxes).

        The LLM returns extracted_data and reasoning, but no visual grounding. We normalize array mappings
        the same way as in the vision flow.
        """
        try:
            # Build a lean system prompt that includes only full OCR text and (optional) schema
            # Clean manual-mode prompts (no field-mapping/block rules)
            system_prompt = get_text_only_system_prompt(json_schema, full_text, document_type)
            final_user_prompt = get_text_only_user_prompt(user_prompt)

            messages = [{"role": "system", "content": system_prompt}]
            if image_data is not None:
                image_b64 = base64.b64encode(image_data).decode('utf-8')
                messages.append(
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": final_user_prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:image/jpeg;base64,{image_b64}",
                                    "detail": "high",
                                },
                            },
                        ],
                    }
                )
            else:
                messages.append({"role": "user", "content": final_user_prompt})

            # Token estimates (rough)
            def _approx(text: str) -> int:
                return max(0, (len(text) // 4))
            system_tokens = _approx(system_prompt)
            user_tokens = _approx(final_user_prompt)

            response = await self.client.chat.completions.create(
                model=self.deployment,
                messages=messages,
                response_format={"type": "json_object"}
            )

            raw_llm_response = response.choices[0].message.content
            logger.info(f"Raw LLM response (text-only): {raw_llm_response}")
            llm_full_response = json.loads(raw_llm_response)

            # Remove any field_mappings if the model returned them; we will compute grounding locally
            if "field_mappings" in llm_full_response:
                try:
                    del llm_full_response["field_mappings"]
                except Exception:
                    pass

            llm_full_response["prompts_used"] = {
                "system_prompt": system_prompt,
                "user_prompt": final_user_prompt,
                "token_estimates": {
                    "system_prompt_tokens": system_tokens,
                    "user_prompt_tokens": user_tokens,
                    "image_input_tokens": 0,
                    "total_estimated_input_tokens": system_tokens + user_tokens,
                },
                "subset_block_count": 0,
            }
            llm_full_response["raw_llm_response"] = raw_llm_response
            return llm_full_response
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse Azure OpenAI response as JSON: {e}")
            raise AzureOpenAIError(f"Invalid JSON response from Azure OpenAI: {e}")
        except Exception as e:
            logger.error(f"Azure OpenAI extraction (text-only) failed: {e}")
            raise AzureOpenAIError(f"Failed to extract structured data (text-only): {e}")

    async def generate_json_schema(
        self,
        image_data: Optional[bytes],
        full_text: str,
        instruction: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a JSON Schema (draft) for the document using OCR full text and optional image.

        Returns a dict with keys: schema, prompts_used, raw_llm_response, llm_model_used
        """
        try:
            system_prompt = get_schema_generation_system_prompt()
            user_text = build_schema_generation_user_text(full_text, instruction)

            messages = [{"role": "system", "content": system_prompt}]
            if image_data is not None:
                image_b64 = base64.b64encode(image_data).decode('utf-8')
                messages.append({
                    "role": "user",
                    "content": [
                        {"type": "text", "text": user_text},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/jpeg;base64,{image_b64}", "detail": "high"}
                        }
                    ],
                })
            else:
                messages.append({"role": "user", "content": user_text})

            response = await self.client.chat.completions.create(
                model=self.deployment,
                messages=messages,
                response_format={"type": "json_object"}
            )
            raw = response.choices[0].message.content
            llm_json = json.loads(raw)

            # In case the model returns schema under a top-level key, normalize
            schema = llm_json.get("schema", llm_json)

            def _approx(text: str) -> int:
                return max(0, (len(text) // 4))
            system_tokens = _approx(system_prompt)
            user_tokens = _approx(user_text)

            return {
                "schema": schema,
                "prompts_used": {
                    "system_prompt": system_prompt,
                    "user_prompt": user_text,
                    "token_estimates": {
                        "system_prompt_tokens": system_tokens,
                        "user_prompt_tokens": user_tokens,
                    },
                },
                "raw_llm_response": raw,
                "llm_model_used": self.deployment,
            }
        except json.JSONDecodeError as e:
            raise AzureOpenAIError(f"Invalid JSON response while generating schema: {e}")
        except Exception as e:
            raise AzureOpenAIError(f"Failed to generate schema: {e}")
    
    def _create_system_prompt(
        self,
        json_schema: Optional[Dict[str, Any]],
        ocr_results: DocumentOCRResult,
        document_type: Optional[str] = None
    ) -> str:
        """Create system prompt for structured data extraction using modular prompts."""
        
        # Convert OCR results to a structured format for the LLM.
        # Use stable original indices when provided to preserve ID consistency.
        ocr_text_blocks = []
        for i, block in enumerate(ocr_results.text_blocks):
            stable_id = block.original_index if getattr(block, "original_index", None) is not None else i
            ocr_text_blocks.append({
                "block_id": stable_id,
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
        json_schema: Optional[Dict[str, Any]] = None
    ) -> str:
        """Create user prompt for extraction using modular prompts."""
        # Start with base extraction prompt (now aware of whether schema exists)
        base_prompt = get_base_extraction_prompt(user_prompt, json_schema)

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
