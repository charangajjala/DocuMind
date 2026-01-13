"""Prompts for AI-powered schema generation (separate from extraction prompts)."""

from typing import Optional


def get_schema_generation_system_prompt() -> str:
    """System prompt for generating a concise JSON Schema from a document.

    The LLM should return ONLY a valid JSON object representing the schema.
    """
    return (
        "You are an expert in designing concise JSON Schemas for document extraction. "
        "Given the OCR full text (and optionally a document image), propose a practical draft JSON Schema suitable for extracting key fields.\n\n"
        "OUTPUT CONTRACT (STRICT): Return ONLY a JSON object (no markdown, no prose).\n"
        "- Root MUST be: { 'type': 'object', 'properties': { ... }, 'required': [ ... ] }\n"
        "- Allowed types: 'string', 'number', 'integer', 'boolean', 'array', 'object'\n"
        "- Each property MUST include: 'type' and a short 'description' (<= 1 sentence).\n"
        "- Arrays MUST include 'items'. Examples:\n"
        "  • Array of strings: { 'type': 'array', 'items': { 'type': 'string' } }\n"
        "  • Array of numbers: { 'type': 'array', 'items': { 'type': 'number' } }\n"
        "  • Array of objects: { 'type': 'array', 'items': { 'type': 'object', 'properties': { ... }, 'required': [ ... ] } }\n"
        "- Numbers with decimals (amounts, measurements) → 'number'; whole counts → 'integer'.\n"
        "- If a field is a date, keep type 'string' and (optionally) include 'format': 'date' if very clear.\n"
        "- Prefer concise field names in snake_case.\n"
        "- 'required' SHOULD include only the most critical fields. If unsure, keep it minimal.\n"
        "- Omit '$schema', '$id', 'additionalProperties', and any vendor-specific keywords unless obviously required.\n"
        "- Keep the schema compact and realistic; avoid over-modeling.\n"
        "- If an image is provided: USE visual context (layout/sections, tables, headers, key-value alignment, stamps/signatures) to inform field choices and nested structures. Reconcile image cues with OCR text before deciding the final schema.\n\n"
        "Your result must be valid JSON and must match the structure above."
    )


def build_schema_generation_user_text(full_text: str, instruction: Optional[str] = None) -> str:
    """Compose the user message content for schema generation.

    """
    user_instruction = instruction or "Propose a sensible schema for this document."
    return (
        "Instruction:\n" + user_instruction + "\n\n" +
        "OCR Full Text:\n" + full_text
    )


