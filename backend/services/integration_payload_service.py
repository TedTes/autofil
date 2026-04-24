"""
Canonical integration payload builder.

This service produces the stable JSON contract that downstream integration
adapters will send to webhooks, AMS APIs, carrier APIs, or storage sinks.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from services.submission_service import SubmissionService


class IntegrationPayloadService:
    """Build a third-party friendly payload from reviewed merged data."""

    FIELD_GROUPS: Dict[str, Dict[str, str]] = {
        "insured": {
            "InsuredName": "name",
            "NamedInsuredName": "name",
            "MailingAddressLine1": "mailing_address_line_1",
            "MailingAddressLine2": "mailing_address_line_2",
            "MailingAddressCity": "mailing_address_city",
            "MailingAddressState": "mailing_address_state",
            "MailingAddressPostalCode": "mailing_address_postal_code",
            "EmployerPrimaryPhone": "phone",
            "ClaimContactEmail": "email",
            "NAICSCode": "naics_code",
            "SICCode": "sic_code",
        },
        "policy": {
            "PolicyNumber": "policy_number",
            "GLPolicyNumber": "gl_policy_number",
            "EffectiveDate": "effective_date",
            "ExpirationDate": "expiration_date",
            "Carrier": "carrier",
            "CarrierNAIC": "carrier_naic",
            "ProducerName": "producer_name",
            "ProducerEmail": "producer_email",
            "ProducerPhone": "producer_phone",
        },
        "coverages": {
            "BuildingLimit": "building_limit",
            "BPPLimit": "bpp_limit",
            "TotalInsuredValue": "total_insured_value",
            "GeneralAggregateLimit": "general_aggregate_limit",
            "EachOccurrenceLimit": "each_occurrence_limit",
            "AutoCombinedSingleLimit": "auto_combined_single_limit",
            "WorkersCompEachAccidentLimit": "workers_comp_each_accident_limit",
            "EmployerLiabilityPolicyLimit": "employer_liability_policy_limit",
            "Deductible": "deductible",
        },
        "operations": {
            "GrossSales": "gross_sales",
            "Payroll": "payroll",
            "NumberOfEmployees": "number_of_employees",
            "YearsInBusiness": "years_in_business",
            "BusinessDescription": "business_description",
            "LineOfBusiness": "line_of_business",
        },
    }

    def __init__(
        self,
        submission_service: Optional[SubmissionService] = None,
    ) -> None:
        self.submission_service = submission_service or SubmissionService()

    def build_payload(self, submission_id: str) -> Dict[str, Any]:
        metadata = self.submission_service.get_submission_metadata(submission_id)
        if not metadata:
            raise ValueError("Submission not found")

        data = self._resolve_canonical_data(metadata.get("data") or {})
        sections = self._normalize_sections(
            data.get("semantic_sections") or data.get("semanticSections") or []
        )
        field_index = self._field_index(sections)
        raw = data.get("raw") if isinstance(data.get("raw"), dict) else {}

        return {
            "schema_version": "1.0",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "submission": self._submission_summary(metadata),
            "review_status": self._review_status(metadata),
            "insured": self._group_values(field_index, "insured"),
            "policy": self._group_values(field_index, "policy"),
            "coverages": self._group_values(field_index, "coverages"),
            "operations": self._group_values(field_index, "operations"),
            "locations": self._locations(field_index, raw),
            "loss_history": self._loss_history(field_index, raw),
            "financials": self._financials(raw),
            "source_files": self._source_files(data, metadata),
            "field_sources": self._field_sources(field_index),
            "confidence": self._confidence(metadata, data, field_index),
            "raw_sections": sections,
        }

    def _resolve_canonical_data(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        if not isinstance(payload, dict):
            return {}
        nested = payload.get("data")
        if isinstance(nested, dict) and (
            "semantic_sections" in nested or "semanticSections" in nested
        ):
            return nested
        return payload

    def _submission_summary(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "submission_id": metadata.get("submission_id"),
            "client_id": metadata.get("client_id"),
            "client_name": metadata.get("client_name"),
            "name": metadata.get("name") or metadata.get("title"),
            "status": metadata.get("status"),
            "workflow_status": metadata.get("workflow_status"),
            "file_count": metadata.get("file_count") or len(metadata.get("inputs") or []),
            "created_at": metadata.get("created_at"),
            "updated_at": metadata.get("updated_at"),
        }

    def _review_status(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "reviewed": bool(metadata.get("reviewed_at")),
            "reviewed_at": metadata.get("reviewed_at"),
            "reviewed_by": metadata.get("reviewed_by"),
            "last_edited_at": metadata.get("last_edited_at"),
            "last_edited_by": metadata.get("last_edited_by"),
        }

    def _normalize_sections(self, sections: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        normalized: List[Dict[str, Any]] = []
        for section in sections or []:
            if not isinstance(section, dict):
                continue
            normalized.append(
                {
                    "key": section.get("key") or section.get("displayName") or section.get("display_name"),
                    "display_name": section.get("display_name") or section.get("displayName"),
                    "description": section.get("description"),
                    "priority": section.get("priority", 0),
                    "fields": [
                        {
                            "id": field.get("id"),
                            "label": field.get("label"),
                            "type": field.get("type"),
                            "values": field.get("values") or [],
                        }
                        for field in section.get("fields") or []
                        if isinstance(field, dict) and field.get("id")
                    ],
                }
            )
        return normalized

    def _field_index(self, sections: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        fields: Dict[str, Dict[str, Any]] = {}
        for section in sections:
            for field in section.get("fields") or []:
                values = field.get("values") or []
                fields[field["id"]] = {
                    **field,
                    "section_key": section.get("key"),
                    "primary": self._primary_value(values),
                }
        return fields

    def _primary_value(self, values: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        valid_values = [value for value in values if isinstance(value, dict)]
        if not valid_values:
            return None
        return max(valid_values, key=lambda value: float(value.get("confidence") or 0))

    def _group_values(self, field_index: Dict[str, Dict[str, Any]], group: str) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        for field_id, output_key in self.FIELD_GROUPS[group].items():
            field = field_index.get(field_id)
            primary = (field or {}).get("primary")
            if primary and primary.get("value") is not None and output_key not in result:
                result[output_key] = primary.get("value")
        return result

    def _locations(self, field_index: Dict[str, Dict[str, Any]], raw: Dict[str, Any]) -> List[Dict[str, Any]]:
        properties = raw.get("properties")
        if isinstance(properties, list) and properties:
            return [item for item in properties if isinstance(item, dict)]

        location_field = field_index.get("Location")
        values = location_field.get("values") if location_field else []
        locations = [
            value.get("value")
            for value in values or []
            if isinstance(value, dict) and isinstance(value.get("value"), dict)
        ]
        return locations

    def _loss_history(self, field_index: Dict[str, Dict[str, Any]], raw: Dict[str, Any]) -> Dict[str, Any]:
        claims = raw.get("claims")
        if isinstance(claims, list):
            return {
                "claim_count": raw.get("claim_count") or len(claims),
                "claims": [claim for claim in claims if isinstance(claim, dict)],
                "totals": {
                    key: value
                    for key, value in (raw.get("totals") or {}).items()
                    if key.startswith("total_claim")
                    or key.startswith("total_paid")
                    or key.startswith("total_reserve")
                    or key.startswith("total_incurred")
                },
            }

        prior_losses = field_index.get("PriorLosses")
        values = prior_losses.get("values") if prior_losses else []
        return {
            "claims": [
                value.get("value")
                for value in values or []
                if isinstance(value, dict) and isinstance(value.get("value"), dict)
            ]
        }

    def _financials(self, raw: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "statement_type": raw.get("statement_type"),
            "totals": raw.get("totals") or {},
            "line_items": raw.get("line_items") or {},
        }

    def _source_files(self, data: Dict[str, Any], metadata: Dict[str, Any]) -> List[Dict[str, Any]]:
        sources = data.get("sources")
        if isinstance(sources, list) and sources:
            return [source for source in sources if isinstance(source, dict)]

        inputs = metadata.get("inputs") or []
        return [
            {
                "input_id": item.get("input_id"),
                "file_name": item.get("filename"),
                "document_type": item.get("document_type"),
                "confidence": item.get("confidence"),
                "included_in_merge": item.get("included_in_merge", True),
                "uploaded_at": item.get("uploaded_at"),
            }
            for item in inputs
            if isinstance(item, dict)
        ]

    def _field_sources(self, field_index: Dict[str, Dict[str, Any]]) -> Dict[str, Any]:
        sources: Dict[str, Any] = {}
        for field_id, field in field_index.items():
            primary = field.get("primary")
            if not primary:
                continue
            sources[field_id] = {
                "label": field.get("label"),
                "section_key": field.get("section_key"),
                "confidence": primary.get("confidence"),
                "source": primary.get("source"),
                "tags": primary.get("tags") or [],
            }
        return sources

    def _confidence(
        self,
        metadata: Dict[str, Any],
        data: Dict[str, Any],
        field_index: Dict[str, Dict[str, Any]],
    ) -> Dict[str, Any]:
        field_confidences = [
            float(field["primary"].get("confidence"))
            for field in field_index.values()
            if field.get("primary") and field["primary"].get("confidence") is not None
        ]
        average = (
            sum(field_confidences) / len(field_confidences)
            if field_confidences
            else metadata.get("confidence") or data.get("confidence")
        )
        return {
            "overall": metadata.get("confidence") or data.get("confidence") or average,
            "field_average": average,
            "field_count": len(field_confidences),
        }
