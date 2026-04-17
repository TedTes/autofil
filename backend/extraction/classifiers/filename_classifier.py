"""
Filename-based document classifier.

Uses explicit form numbers and common insurance document names as a strong hint
when document text is ambiguous. This is especially useful for filled PDFs where
OCR can pick up unrelated attachment text.
"""

import re
from functools import lru_cache
from typing import Any, Dict, List, Optional, Tuple

from ..core.document import Document, DocumentType
from ..interfaces.classifier import IClassifier


class FilenameClassifier(IClassifier):
    """Classify documents from explicit form/document hints in the file name."""

    CONFIDENCE = 1.0
    ACORD_PREFIX = r"(?:^|[^a-z0-9])acord[\s_-]*"
    NUMBER_SUFFIX = r"(?:[^a-z0-9]|$)"
    GENERIC_FILENAME_PATTERNS = [
        (
            DocumentType.LOSS_RUN,
            [r"\bloss[\s_-]*runs?\b", r"\bclaim[\s_-]*(history|listing|summary)\b"],
        ),
        (DocumentType.SOV, [r"\bsov\b", r"\b(schedule|statement)[\s_-]*of[\s_-]*values\b"]),
        (DocumentType.FINANCIAL_STATEMENT, [r"\bfinancial[\s_-]*statements?\b", r"\bincome[\s_-]*statements?\b"]),
    ]

    def classify(self, document: Document) -> Tuple[DocumentType, float]:
        match = self._match_document(document)
        if not match:
            return DocumentType.UNKNOWN, 0.0
        self._apply_hints(document, match)
        return match["document_type"], self.CONFIDENCE

    def _match_document(self, document: Document) -> Optional[Dict[str, Any]]:
        file_name = (document.file_name or "").lower()
        if not file_name:
            return None

        for hint in self._template_filename_hints():
            if any(re.search(pattern, file_name, re.IGNORECASE) for pattern in hint["patterns"]):
                return hint

        for doc_type, patterns in self.GENERIC_FILENAME_PATTERNS:
            if any(re.search(pattern, file_name, re.IGNORECASE) for pattern in patterns):
                return {
                    "document_type": doc_type,
                    "patterns": patterns,
                    "matched_category": "generic_filename",
                }
        return None

    @classmethod
    @lru_cache(maxsize=1)
    def _template_filename_hints(cls) -> Tuple[Dict[str, Any], ...]:
        hints: List[Dict[str, Any]] = []
        by_form: Dict[str, Dict[str, Any]] = {}

        for template_id in cls._list_template_ids():
            parsed = cls._parse_acord_template_id(template_id)
            if not parsed:
                continue
            form_number, version_hint, document_type = parsed
            version_pattern = cls._version_pattern(version_hint)
            exact_patterns = [cls._template_id_pattern(template_id)]
            if version_pattern:
                exact_patterns.append(
                    rf"(?:^|[^a-z0-9]){re.escape(form_number)}(?:[^a-z0-9]|$).*{version_pattern}"
                )

            hints.append(
                {
                    "document_type": document_type,
                    "patterns": exact_patterns,
                    "template_id_hint": template_id,
                    "form_type_hint": f"ACORD_{form_number}",
                    "version_hint": version_hint,
                    "matched_category": "template_filename_exact",
                }
            )
            by_form.setdefault(
                form_number,
                {
                    "document_type": document_type,
                    "patterns": [
                        cls.ACORD_PREFIX + re.escape(form_number) + cls.NUMBER_SUFFIX,
                        rf"(?:^|[^a-z0-9]){re.escape(form_number)}(?:[^a-z0-9]|$)",
                    ],
                    "form_type_hint": f"ACORD_{form_number}",
                    "candidate_template_ids": [],
                    "matched_category": "template_filename_form",
                },
            )["candidate_template_ids"].append(template_id)

        # Exact/versioned matches must win before base form matches.
        hints.sort(key=lambda hint: len(str(hint.get("template_id_hint") or "")), reverse=True)
        hints.extend(by_form.values())
        return tuple(hints)

    @staticmethod
    def _parse_acord_template_id(template_id: str) -> Optional[Tuple[str, Optional[str], DocumentType]]:
        match = re.fullmatch(r"acord_(\d+)(?:_(.+))?", str(template_id or "").lower())
        if not match:
            return None
        form_number = match.group(1)
        document_type = getattr(DocumentType, f"ACORD_{form_number}", None)
        if not isinstance(document_type, DocumentType):
            return None
        return form_number, match.group(2), document_type

    @staticmethod
    def _template_id_pattern(template_id: str) -> str:
        parts = re.split(r"[_\s-]+", str(template_id or "").lower())
        return r"(?:^|[^a-z0-9])" + r"[\s_-]*".join(re.escape(part) for part in parts if part) + r"(?:[^a-z0-9]|$)"

    @staticmethod
    def _version_pattern(version_hint: Optional[str]) -> Optional[str]:
        if not version_hint:
            return None
        parts = re.split(r"[_\s-]+", version_hint)
        parts = [part for part in parts if part]
        if not parts:
            return None
        return r"[\s_-]*".join(re.escape(part) for part in parts)

    @staticmethod
    def _apply_hints(document: Document, match: Dict[str, Any]) -> None:
        metadata = getattr(document, "metadata", None)
        if not isinstance(metadata, dict):
            return
        for key in ("template_id_hint", "form_type_hint", "version_hint", "candidate_template_ids"):
            value = match.get(key)
            if value:
                metadata[key] = value

    @staticmethod
    def _list_template_ids() -> List[str]:
        try:
            from filling.template_loader import TemplateLoader

            return TemplateLoader.list_template_ids()
        except Exception:
            return []

    def get_indicators(self, document: Document) -> List[Dict[str, Any]]:
        file_name = (document.file_name or "").lower()
        indicators: List[Dict[str, Any]] = []
        all_patterns = [
            (hint["document_type"], hint["patterns"], hint)
            for hint in self._template_filename_hints()
        ]
        all_patterns.extend((doc_type, patterns, {}) for doc_type, patterns in self.GENERIC_FILENAME_PATTERNS)
        for doc_type, patterns, hint in all_patterns:
            for pattern in patterns:
                if re.search(pattern, file_name, re.IGNORECASE):
                    indicators.append(
                        {
                            "type": "filename",
                            "category": "document_hint",
                            "value": pattern,
                            "matches": 1,
                            "confidence": self.CONFIDENCE,
                            "document_type": doc_type.value,
                            "template_id_hint": hint.get("template_id_hint"),
                            "version_hint": hint.get("version_hint"),
                        }
                    )
        return indicators

    def can_classify(self, document: Document) -> bool:
        return bool(document.file_name)

    def get_supported_types(self) -> List[DocumentType]:
        supported = {doc_type for doc_type, _ in self.GENERIC_FILENAME_PATTERNS}
        supported.update(hint["document_type"] for hint in self._template_filename_hints())
        return list(supported)

    def get_priority(self) -> int:
        return 20
