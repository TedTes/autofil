"""
Comparison service - compares and resolves conflicts between data sources.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional


class ComparisonService:
    """
    Keeps conflict comparisons entirely in memory to avoid local file storage.
    """

    def __init__(self) -> None:
        self._resolution_store: Dict[str, List[Dict[str, Any]]] = {}

    def compare_data(
        self,
        source_a: Dict[str, Any],
        source_b: Dict[str, Any],
        source_a_label: str = "Source A",
        source_b_label: str = "Source B",
    ) -> Dict[str, Any]:
        flat_a = self._flatten_dict(source_a)
        flat_b = self._flatten_dict(source_b)

        conflicts, only_in_a, only_in_b, matching = [], [], [], []
        all_keys = set(flat_a.keys()) | set(flat_b.keys())

        for key in sorted(all_keys):
            value_a = flat_a.get(key)
            value_b = flat_b.get(key)

            if key in flat_a and key in flat_b:
                if value_a != value_b:
                    conflicts.append({
                        "field": key,
                        "value_a": value_a,
                        "value_b": value_b,
                        "source_a": source_a_label,
                        "source_b": source_b_label,
                        "conflict_type": "value_mismatch",
                        "severity": self._assess_conflict_severity(key, value_a, value_b),
                    })
                else:
                    matching.append({"field": key, "value": value_a})
            elif key in flat_a:
                only_in_a.append({"field": key, "value": value_a, "source": source_a_label})
            else:
                only_in_b.append({"field": key, "value": value_b, "source": source_b_label})

        return {
            "comparison_id": str(uuid.uuid4()),
            "compared_at": datetime.utcnow().isoformat(),
            "source_a_label": source_a_label,
            "source_b_label": source_b_label,
            "summary": {
                "conflicts": len(conflicts),
                "only_in_a": len(only_in_a),
                "only_in_b": len(only_in_b),
                "matching": len(matching),
                "total_fields": len(all_keys),
            },
            "conflicts": conflicts,
            "only_in_a": only_in_a,
            "only_in_b": only_in_b,
            "matching": matching,
        }

    def suggest_resolution(
        self,
        conflict: Dict[str, Any],
        context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        field = conflict["field"]
        value_a = conflict["value_a"]
        value_b = conflict["value_b"]
        severity = conflict.get("severity", "medium")

        suggestion = {
            "field": field,
            "recommended_action": "manual_review",
            "recommended_value": None,
            "reasoning": "",
            "alternatives": [],
        }

        if context and "confidence_a" in context and "confidence_b" in context:
            conf_a = context["confidence_a"]
            conf_b = context["confidence_b"]
            if conf_a > conf_b + 0.2:
                suggestion["recommended_action"] = "use_a"
                suggestion["recommended_value"] = value_a
                suggestion["reasoning"] = f"Source A has higher confidence ({conf_a:.0%} vs {conf_b:.0%})"
            elif conf_b > conf_a + 0.2:
                suggestion["recommended_action"] = "use_b"
                suggestion["recommended_value"] = value_b
                suggestion["reasoning"] = f"Source B has higher confidence ({conf_b:.0%} vs {conf_a:.0%})"

        if severity == "low" and self._is_numeric(value_a) and self._is_numeric(value_b):
            avg = (float(value_a) + float(value_b)) / 2
            suggestion["alternatives"].append({
                "action": "average",
                "value": avg,
                "reasoning": "Use average of both values",
            })

        suggestion["alternatives"].append({
            "action": "use_a",
            "value": value_a,
            "reasoning": f"Use value from {conflict['source_a']}",
        })
        suggestion["alternatives"].append({
            "action": "use_b",
            "value": value_b,
            "reasoning": f"Use value from {conflict['source_b']}",
        })
        return suggestion

    def resolve_conflict(
        self,
        comparison_id: str,
        field: str,
        resolution: Dict[str, Any],
        user: str = "user",
    ) -> Dict[str, Any]:
        record = {
            "comparison_id": comparison_id,
            "field": field,
            "action": resolution["action"],
            "selected_value": resolution.get("value"),
            "reasoning": resolution.get("reasoning", ""),
            "resolved_by": user,
            "resolved_at": datetime.utcnow().isoformat(),
        }
        self._resolution_store.setdefault(comparison_id, []).append(record)
        return record

    def apply_resolutions(self, base_data: Dict[str, Any], resolutions: List[Dict[str, Any]]) -> Dict[str, Any]:
        result = self._deep_copy(base_data)
        for resolution in resolutions:
            field = resolution["field"]
            value = resolution.get("selected_value")
            action = resolution["action"]

            if action in ["use_a", "use_b", "average", "manual"]:
                self._set_nested_value(result, field, value)
            elif action == "delete":
                self._delete_nested_value(result, field)
        return result

    # ----------------------------------------------------------------- helpers
    def _flatten_dict(self, data: Dict[str, Any], parent_key: str = "", sep: str = ".") -> Dict[str, Any]:
        items = []
        for key, value in data.items():
            new_key = f"{parent_key}{sep}{key}" if parent_key else key
            if isinstance(value, dict):
                items.extend(self._flatten_dict(value, new_key, sep=sep).items())
            else:
                items.append((new_key, value))
        return dict(items)

    def _assess_conflict_severity(self, field: str, value_a: Any, value_b: Any) -> str:
        critical = {"applicant.business_name", "policy_number", "effective_date", "expiration_date"}
        if field in critical:
            return "high"
        if self._is_numeric(value_a) and self._is_numeric(value_b):
            diff = abs(float(value_a) - float(value_b))
            base = max(abs(float(value_a)), abs(float(value_b)), 1.0)
            pct = diff / base
            if pct < 0.1:
                return "low"
            if pct < 0.3:
                return "medium"
            return "high"
        if isinstance(value_a, str) and isinstance(value_b, str):
            if value_a.lower().strip() == value_b.lower().strip():
                return "low"
        return "medium"

    def _is_numeric(self, value: Any) -> bool:
        try:
            float(value)
            return True
        except (TypeError, ValueError):
            return False

    def _set_nested_value(self, data: Dict[str, Any], path: str, value: Any) -> None:
        keys = path.split(".")
        current = data
        for key in keys[:-1]:
            current = current.setdefault(key, {})
        current[keys[-1]] = value

    def _delete_nested_value(self, data: Dict[str, Any], path: str) -> None:
        keys = path.split(".")
        current = data
        for key in keys[:-1]:
            if key not in current:
                return
            current = current[key]
        current.pop(keys[-1], None)

    def _deep_copy(self, data: Dict[str, Any]) -> Dict[str, Any]:
        import copy
        return copy.deepcopy(data)
