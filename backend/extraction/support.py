"""
Support and relevance checks for insurance document processing.

This module keeps product positioning encoded in one place:
- supported insurance documents can be extracted directly
- insurance-adjacent but unsupported documents are flagged for review
- non-insurance uploads are blocked from the extraction workflow
"""

from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Union

from .core.document import Document, DocumentType


SUPPORTED_DOCUMENT_TYPES = {
    DocumentType.ACORD_25,
    DocumentType.ACORD_125,
    DocumentType.ACORD_126,
    DocumentType.ACORD_130,
    DocumentType.ACORD_140,
    DocumentType.LOSS_RUN,
    DocumentType.SOV,
    DocumentType.FINANCIAL_STATEMENT,
    DocumentType.SUPPLEMENTAL,
}

INSURANCE_RELEVANCE_PATTERNS: Iterable[str] = (
    r"\bacord\b",
    r"\bpolicy\b",
    r"\binsured\b",
    r"\binsurance\b",
    r"\bcarrier\b",
    r"\bpremium\b",
    r"\bcoverage\b",
    r"\bliability\b",
    r"\bloss\s+run\b",
    r"\bclaim\s+number\b",
    r"\bcertificate\s+holder\b",
    r"\bworkers?\s+comp(?:ensation)?\b",
    r"\bproperty\s+section\b",
    r"\bunderwriting\b",
    r"\bschedule\s+of\s+values\b",
    r"\bsupplement(?:al)?\b",
)

REVIEW_CONFIDENCE_THRESHOLD = 0.75


def _coerce_document_type(document_type: Union[DocumentType, str, None]) -> DocumentType:
    if isinstance(document_type, DocumentType):
        return document_type
    if isinstance(document_type, str):
        normalized = document_type.strip().lower()
        for candidate in DocumentType:
            if candidate.value == normalized:
                return candidate
    return DocumentType.UNKNOWN


def detect_insurance_relevance(text: str, file_name: str = "") -> Dict[str, Any]:
    """
    Score whether a document appears insurance-related.
    """
    haystack = f"{file_name}\n{text}".lower()
    hits: List[str] = []

    for pattern in INSURANCE_RELEVANCE_PATTERNS:
        if re.search(pattern, haystack, re.IGNORECASE):
            hits.append(pattern)

    return {
        "is_insurance_relevant": len(hits) >= 2 or any("acord" in hit for hit in hits),
        "keyword_hits": hits[:8],
        "keyword_hit_count": len(hits),
    }


def assess_document_support(
    document_or_type: Union[Document, DocumentType, str, None],
    *,
    confidence: float | None = None,
    raw_text: str = "",
    file_name: str = "",
) -> Dict[str, Any]:
    """
    Assess whether a document should continue through extraction.
    """
    if isinstance(document_or_type, Document):
        document_type = document_or_type.document_type
        confidence = document_or_type.confidence if confidence is None else confidence
        raw_text = document_or_type.raw_text or raw_text
        file_name = document_or_type.file_name or file_name
    else:
        document_type = _coerce_document_type(document_or_type)
        confidence = 0.0 if confidence is None else confidence

    relevance = detect_insurance_relevance(raw_text, file_name=file_name)
    is_supported = document_type in SUPPORTED_DOCUMENT_TYPES
    needs_review = False
    review_reasons: List[str] = []

    if is_supported and confidence < REVIEW_CONFIDENCE_THRESHOLD:
        needs_review = True
        review_reasons.append(
            f"Classification confidence is {confidence:.0%}, below the {REVIEW_CONFIDENCE_THRESHOLD:.0%} review threshold."
        )

    if not is_supported:
        needs_review = True
        if relevance["is_insurance_relevant"]:
            review_reasons.append(
                "This document appears insurance-related, but it does not match a supported ACORD or insurance intake document type yet."
            )
        else:
            review_reasons.append(
                "This upload does not appear to be a supported insurance document for this workflow."
            )

    recommended_action = "extract"
    message = "Document is supported for insurance extraction."

    if not is_supported and relevance["is_insurance_relevant"]:
        recommended_action = "manual_review"
        message = "Insurance-related document needs manual review before any custom mapping workflow."
    elif not is_supported:
        recommended_action = "reject"
        message = "Unsupported upload. This workflow is limited to insurance documents and mapped intake forms."
    elif needs_review:
        recommended_action = "review_then_extract"
        message = "Supported document, but classification confidence is low enough that review is recommended."

    return {
        "document_type": document_type.value,
        "is_supported": is_supported,
        "is_insurance_relevant": relevance["is_insurance_relevant"] or is_supported,
        "needs_review": needs_review,
        "should_block_extraction": not is_supported,
        "recommended_action": recommended_action,
        "message": message,
        "review_reasons": review_reasons,
        "keyword_hits": relevance["keyword_hits"],
        "keyword_hit_count": relevance["keyword_hit_count"],
    }
