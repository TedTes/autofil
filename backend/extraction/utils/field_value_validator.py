from __future__ import annotations

import re
from typing import Any, Optional

from extraction.extractors.mfc import MFC


class FieldValueValidator:
    """Reject obvious field/value mismatches before data reaches review/merge."""

    FALSEY_MARKERS = {"/off", "off", "unchecked", "false", "no", "n"}
    TRUE_MARKERS = {"/yes", "yes", "checked", "true", "on", "x", "y"}
    SINGLE_CODE_VALUES = {"a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "x", "y", "n"}

    @classmethod
    def is_valid(cls, field_id: str, value: Any) -> bool:
        if value is None:
            return False

        field_meta = MFC.field(field_id) or {}
        field_type = str(field_meta.get("type") or "").lower()

        if cls._is_unchecked_marker(value):
            return False

        if field_id == "FEIN":
            return cls._looks_like_identifier(value, min_length=4)

        if field_id == "CarrierNAIC":
            return isinstance(value, str) and bool(re.fullmatch(r"\s*\d{4,6}\s*", value))

        if field_id == "InsuredName":
            return cls._looks_like_business_name(value)

        if field_id.endswith("PolicyNumber") or field_id == "PolicyNumber":
            return cls._looks_like_identifier(value, min_length=4)

        if "Email" in field_id:
            return isinstance(value, str) and "@" in value and "." in value.split("@")[-1]

        if "Phone" in field_id or "Fax" in field_id:
            return len(re.sub(r"\D", "", str(value))) >= 7

        if field_id.endswith("InsurerLetter"):
            return isinstance(value, str) and value.strip().lower() in cls.SINGLE_CODE_VALUES

        if field_id.endswith("AdditionalInsuredCode") or field_id.endswith("SubrogationWaivedCode"):
            return cls._looks_like_indicator_code(value)

        if "State" in field_id and field_id.endswith("Name"):
            return cls._looks_like_state_name(value)

        if cls._looks_like_state_code_field(field_id):
            return cls._looks_like_state_code(value)

        if field_type == "boolean":
            return cls._looks_like_boolean(value)

        if field_type == "money":
            return cls._looks_like_money(field_id, value)

        if field_type == "integer":
            return cls._looks_like_integer(field_id, value)

        if field_type == "date":
            return cls._looks_like_date(value)

        if field_type == "string":
            return not cls._is_bad_string_value(field_id, value)

        return True

    @classmethod
    def _is_unchecked_marker(cls, value: Any) -> bool:
        return isinstance(value, str) and value.strip().lower() in cls.FALSEY_MARKERS

    @classmethod
    def _looks_like_boolean(cls, value: Any) -> bool:
        if isinstance(value, bool):
            return True
        if not isinstance(value, str):
            return False
        normalized = value.strip().lower()
        if normalized in cls.TRUE_MARKERS or normalized in cls.FALSEY_MARKERS:
            return True
        return False

    @classmethod
    def _looks_like_indicator_code(cls, value: Any) -> bool:
        if not isinstance(value, str):
            return False
        normalized = value.strip().lower()
        return normalized in cls.TRUE_MARKERS or normalized in cls.FALSEY_MARKERS or normalized in cls.SINGLE_CODE_VALUES

    @staticmethod
    def _looks_like_state_name(value: Any) -> bool:
        if not isinstance(value, str):
            return False
        normalized = value.strip()
        if len(normalized) < 2:
            return False
        if re.fullmatch(r"[-+]?\d+(\.\d+)?", normalized):
            return False
        return bool(re.search(r"[a-z]{2,}", normalized, re.IGNORECASE))

    @staticmethod
    def _looks_like_state_code_field(field_id: str) -> bool:
        return (
            field_id.endswith("State")
            or field_id.endswith("StateCode")
            or field_id.endswith("StateOrProvinceCode")
            or field_id.endswith("CoverageState")
            or re.fullmatch(r"(OtherState|CoverageState)[A-Z]?", field_id or "") is not None
        )

    @staticmethod
    def _looks_like_state_code(value: Any) -> bool:
        if not isinstance(value, str):
            return False
        normalized = value.strip().upper()
        return bool(re.fullmatch(r"[A-Z]{2}", normalized))

    @classmethod
    def _looks_like_money(cls, field_id: str, value: Any) -> bool:
        parsed = cls._parse_number(value)
        if parsed is None:
            return False

        # Dollar-limit fields mapped to 1 usually mean a checkbox/row number was
        # mistaken for a coverage limit. Keep legitimate zeroes, but drop tiny
        # positive limits on canonical limit/amount/value/premium fields.
        name = field_id.lower()
        is_limit_like = any(token in name for token in ("limit", "amount", "value", "premium"))
        if is_limit_like and 0 < parsed <= 1:
            return False
        return True

    @staticmethod
    def _looks_like_integer(field_id: str, value: Any) -> bool:
        if isinstance(value, bool):
            return False
        if isinstance(value, int):
            parsed = value
        elif isinstance(value, str) and re.fullmatch(r"\s*\d+\s*", value):
            parsed = int(value.strip())
        else:
            return False

        if parsed < 0:
            return False
        if "employee" in field_id.lower() and parsed > 100000:
            return False
        return parsed <= 100000000

    @staticmethod
    def _looks_like_date(value: Any) -> bool:
        if not isinstance(value, str):
            return False
        return bool(
            re.search(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", value)
            or re.search(r"\b\d{4}-\d{1,2}-\d{1,2}\b", value)
        )

    @classmethod
    def _looks_like_identifier(cls, value: Any, *, min_length: int) -> bool:
        if not isinstance(value, str):
            value = str(value)
        normalized = value.strip()
        if len(normalized) < min_length:
            return False
        if normalized.lower() in cls.SINGLE_CODE_VALUES:
            return False
        return bool(re.search(r"[a-z0-9]", normalized, re.IGNORECASE))

    @staticmethod
    def _looks_like_business_name(value: Any) -> bool:
        if not isinstance(value, str):
            return False
        normalized = re.sub(r"\s+", " ", value.strip())
        if len(normalized) < 3:
            return False
        if re.fullmatch(r"[\W_]+", normalized):
            return False
        if re.fullmatch(r"\(?[a-z]\)?", normalized, re.IGNORECASE):
            return False
        return bool(re.search(r"[a-z]{2,}", normalized, re.IGNORECASE))

    @classmethod
    def _is_bad_string_value(cls, field_id: str, value: Any) -> bool:
        if not isinstance(value, str):
            return False
        normalized = value.strip()
        if not normalized:
            return True
        if normalized.lower() in cls.FALSEY_MARKERS:
            return True
        if field_id not in {
            "GeneralLiabilityInsurerLetter",
            "UmbrellaInsurerLetter",
        } and normalized.lower() in cls.SINGLE_CODE_VALUES:
            return True
        return False

    @staticmethod
    def _parse_number(value: Any) -> Optional[float]:
        if isinstance(value, bool):
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if not isinstance(value, str) or not re.search(r"\d", value):
            return None
        cleaned = re.sub(r"[^\d.\-]", "", value)
        if cleaned in {"", ".", "-", "-."}:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
