# classifiers/document_classifier.py
from typing import Dict, Tuple, Optional
from extraction.core.document import Document, DocumentType
from extraction.extractors.registry import extractor_registry


class DocumentClassifier:
    """
    Flexible document classification based on form identifiers in text.
    No hardcoded if/else — uses a mapping registry.
    """

    # Map form identifier → (DocumentType, confidence)
    _FORM_PATTERNS: Dict[str, Tuple[DocumentType, float]] = {
        "ACORD 126": (DocumentType.ACORD_126, 0.99),
        "ACORD 125": (DocumentType.ACORD_125, 0.99),
        "ACORD 130": (DocumentType.ACORD_130, 0.99),
        "ACORD 140": (DocumentType.ACORD_140, 0.99),
        "LOSS RUN": (DocumentType.LOSS_RUN, 0.90),
        "SOV": (DocumentType.SOV, 0.95),
        "SCHEDULE OF VALUES": (DocumentType.SOV, 0.95),
        "FINANCIAL STATEMENT": (DocumentType.FINANCIAL_STATEMENT, 0.90),
        "SUPPLEMENTAL": (DocumentType.SUPPLEMENTAL, 0.85),
    }

    @classmethod
    def classify(cls, doc: Document) -> None:
        """
        Classify document by scanning raw_text for known form patterns.
        Sets doc.document_type and confidence.
        """
        text = doc.raw_text.upper()

        for pattern, (doc_type, confidence) in cls._FORM_PATTERNS.items():
            if pattern in text:
                doc.set_document_type(doc_type, confidence)
                return

        # Fallback: if registered extractor exists, use it
        for doc_type in extractor_registry.list_extractors():
            if doc_type != DocumentType.UNKNOWN and doc_type != DocumentType.GENERIC:
                doc.set_document_type(doc_type, confidence=0.60)
                return

        # Final fallback
        doc.set_document_type(DocumentType.GENERIC, confidence=0.50)