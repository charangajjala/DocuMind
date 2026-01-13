"""Hybrid two-stage pipeline (RAG-style):

Stage 1: Text-only extraction (no blocks/image) → extracted_data + reasoning_map
Stage 2: Filter OCR blocks using semantic + lexical matching against extracted_data and reasoning_map;
         send full_text + filtered blocks + extracted_data to LLM to obtain field_mappings (grounding).
"""

from typing import Any, Dict, List, Tuple
import re

from ..models.domain import DocumentOCRResult, GroundedDataField, BoundingBox
from ..models.extraction_response import HybridStage1Response, HybridStage2LLMResponse
from ..prompts.hybrid_prompts import get_hybrid_stage2_system_prompt, get_hybrid_stage2_user_prompt


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower().strip())


class HybridGroundingService:
    def __init__(self, llm_provider):
        self.llm = llm_provider

    async def stage1_extract(self, full_text: str, json_schema: Dict[str, Any] | None, user_prompt: str | None, document_type: str | None) -> Dict[str, Any]:
        return await self.llm.extract_structured_data_from_text(full_text=full_text, json_schema=json_schema, user_prompt=user_prompt, document_type=document_type)

    def _filter_blocks(self, extracted_data: Dict[str, Any], reasoning_map: Dict[str, str], ocr: DocumentOCRResult) -> List[int]:
        """Return an exhaustive set of likely relevant OCR block ids using lexical + simple semantic cues."""
        candidates: set[int] = set()

        def each_value(node: Any):
            if isinstance(node, dict):
                for v in node.values():
                    yield from each_value(v)
            elif isinstance(node, list):
                for v in node:
                    yield from each_value(v)
            else:
                yield str(node)

        values = list(each_value(extracted_data))
        norm_values = [_normalize(v) for v in values if v is not None]

        # lexical substring match
        for idx, tb in enumerate(ocr.text_blocks):
            nt = _normalize(tb.text)
            for v in norm_values:
                if v and v in nt:
                    candidates.add(idx)
                    break

        # naive semantic cues: use field names and reasoning_map tokens as anchors
        anchor_terms: List[str] = []
        for k in reasoning_map.keys():
            parts = re.split(r"[^a-zA-Z0-9]+", k)
            anchor_terms.extend([p for p in parts if p])
        for v in reasoning_map.values():
            anchor_terms.extend([w for w in re.split(r"\W+", v.lower()) if len(w) > 2])

        anchor_terms = list({a for a in anchor_terms})
        for idx, tb in enumerate(ocr.text_blocks):
            nt = _normalize(tb.text)
            hits = sum(1 for a in anchor_terms if a in nt)
            if hits >= 1:
                candidates.add(idx)

        # lightweight semantic ranking (RAG-style): score blocks by overlap with value n-grams + anchors
        def ngrams(tokens: List[str], n: int) -> List[str]:
            return [" ".join(tokens[i:i+n]) for i in range(0, max(0, len(tokens)-n+1))]

        query_terms = set()
        for v in norm_values:
            toks = [t for t in re.split(r"\W+", v) if t]
            query_terms.update(toks)
            query_terms.update(ngrams(toks, 2))
        query_terms.update(anchor_terms)

        scores: List[Tuple[int, float]] = []
        for idx, tb in enumerate(ocr.text_blocks):
            nt = _normalize(tb.text)
            block_terms = set([t for t in re.split(r"\W+", nt) if t])
            block_terms.update(ngrams(list(block_terms), 2))
            overlap = len([t for t in query_terms if t in nt])
            scores.append((idx, overlap))

        # add top-K by semantic score to ensure recall
        scores.sort(key=lambda x: x[1], reverse=True)
        top_k = [idx for idx, score in scores[:100] if score > 0]
        candidates.update(top_k)

        return sorted(candidates)

    async def stage2_ground(self, extracted_data: Dict[str, Any], ocr: DocumentOCRResult, filtered_ids: List[int]) -> Dict[str, Any]:
        # Build filtered block dict for prompt - only include line-level elements
        filtered = []
        for bid in filtered_ids:
            if 0 <= bid < len(ocr.text_blocks):
                tb = ocr.text_blocks[bid]
                # Only include line-level elements
                element_type = str(getattr(tb, 'element_type', 'block')).lower()
                if element_type != 'line':
                    continue
                filtered.append({
                    "block_id": bid,
                    "text": tb.text,
                    "confidence": tb.confidence,
                    "element_type": getattr(tb, 'element_type', 'block'),
                })

        system_prompt = get_hybrid_stage2_system_prompt(filtered_blocks={"blocks": filtered}, full_text=ocr.full_text)
        user_prompt = get_hybrid_stage2_user_prompt(extracted_data)

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

        response = await self.llm.client.chat.completions.create(
            model=self.llm.deployment,
            messages=messages,
            response_format={"type": "json_object"}
        )

        import json
        raw = response.choices[0].message.content
        llm_json = json.loads(raw)
        # Attach prompts used and simple token estimates for debug UI
        def _approx(text: str) -> int:
            return max(0, (len(text) // 4))
        llm_json["prompts_used"] = {
            "system_prompt": system_prompt,
            "user_prompt": user_prompt,
            "token_estimates": {
                "system_prompt_tokens": _approx(system_prompt),
                "user_prompt_tokens": _approx(user_prompt),
            },
        }
        llm_json["raw_llm_response"] = raw
        return llm_json


