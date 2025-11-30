"""
Builds merged data view for a submission so the frontend can render a unified
client/package snapshot.
"""
from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from services.submission_service import SubmissionService


class MergedDataService:
    """Transforms canonical submission data into the frontend merged view format."""

    def __init__(self, submission_service: Optional[SubmissionService] = None) -> None:
        self.submission_service = submission_service or SubmissionService()

    # ------------------------------------------------------------------ public API
    def get_merged_data(self, submission_id: str) -> Dict[str, Any]:
        metadata = self.submission_service.get_submission_metadata(submission_id)
        if not metadata:
            raise ValueError("Submission not found")

        canonical = metadata.get("data") or {}
        entities = canonical.get("entities") or {}

        insured = self._build_insured_section(entities)
        locations = self._build_locations_section(entities, canonical)
        exposures = self._build_exposures_section(entities, canonical)
        loss_history = self._build_loss_history_section(entities, canonical)
        coverage = self._build_coverage_section(entities)
        meta_section = self._build_metadata_section(
            metadata, insured, locations, exposures, loss_history, coverage
        )

        return {
            "insured": insured,
            "locations": locations,
            "exposures": exposures,
            "lossHistory": loss_history,
            "coverage": coverage,
            "metadata": meta_section,
        }

    # ------------------------------------------------------------------ builders
    def _build_insured_section(self, entities: Dict[str, Any]) -> Dict[str, Any]:
        address_value = self._first_value(entities, "MailingAddress")
        mailing_address = self._coerce_address(address_value)

        return {
            "businessName": self._first_value(entities, "InsuredName"),
            "dba": self._first_value(entities, "DBA"),
            "entityType": None,
            "federalId": self._first_value(entities, "FEIN"),
            "stateId": None,
            "website": None,
            "yearEstablished": None,
            "businessDescription": self._first_value(entities, "LineOfBusiness"),
            "mailingAddress": mailing_address,
            "primaryContact": {
                "name": "",
                "title": "",
                "phone": "",
                "phoneExt": "",
                "email": "",
                "fax": "",
            },
        }

    def _build_locations_section(
        self, entities: Dict[str, Any], canonical: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        locations: List[Dict[str, Any]] = []
        for value in self._get_values(entities, "Location"):
            if isinstance(value, dict):
                locations.append(self._map_location(value))

        # Include SOV properties if available
        sov_properties = canonical.get("properties") or []
        for prop in sov_properties:
            if isinstance(prop, dict):
                locations.append(self._map_sov_property(prop))

        return locations

    def _build_exposures_section(
        self, entities: Dict[str, Any], canonical: Dict[str, Any]
    ) -> Dict[str, Any]:
        classifications = []
        for item in self._get_values(entities, "Classification"):
            if isinstance(item, dict):
                payroll_amount = self._parse_money(item.get("payroll"))
                classifications.append({
                    "classCode": item.get("class_code"),
                    "classDescription": item.get("description"),
                    "revenue": self._parse_money(item.get("exposure")),
                    "numberOfEmployees": self._to_int(item.get("number_of_employees")),
                    "_payroll": payroll_amount,
                })

        sov_properties = canonical.get("properties") or []
        revenue_by_class = [
            {k: v for k, v in c.items() if not k.startswith("_")}
            for c in classifications
            if c.get("classCode")
        ]
        payroll_by_class = []
        for c in classifications:
            payroll_by_class.append({
                "classCode": c.get("classCode"),
                "classDescription": c.get("classDescription"),
                "payroll": c.get("_payroll"),
                "numberOfEmployees": c.get("numberOfEmployees"),
            })

        if not revenue_by_class and sov_properties:
            for prop in sov_properties:
                revenue_by_class.append({
                    "classCode": prop.get("location_id") or prop.get("location_number"),
                    "classDescription": prop.get("address"),
                    "revenue": self._parse_money(prop.get("building_value")),
                    "numberOfEmployees": None,
                })

        return {
            "annualRevenue": self._parse_money(self._first_value(entities, "GrossSales")),
            "annualPayroll": self._parse_money(self._first_value(entities, "Payroll")),
            "numberOfEmployees": self._to_int(self._first_value(entities, "NumberOfEmployees")),
            "fullTimeEmployees": None,
            "partTimeEmployees": None,
            "seasonalEmployees": None,
            "revenueByClassCode": revenue_by_class,
            "payrollByClassCode": payroll_by_class,
        }

    def _build_loss_history_section(
        self, entities: Dict[str, Any], canonical: Dict[str, Any]
    ) -> Dict[str, Any]:
        losses: List[Dict[str, Any]] = []
        for item in self._get_values(entities, "PriorLosses"):
            record = self._map_loss_record(item)
            if record:
                losses.append(record)

        for claim in canonical.get("claims", []) or []:
            record = self._map_loss_record(claim)
            if record:
                losses.append(record)

        total_paid = sum(self._parse_money(loss.get("paidAmount")) or 0 for loss in losses)
        total_incurred = sum(self._parse_money(loss.get("totalIncurred")) or 0 for loss in losses)
        claims_by_year: Dict[str, int] = {}
        claims_by_type: Dict[str, int] = {}
        years = set()
        for loss in losses:
            date = loss.get("date")
            if date:
                try:
                    year = date.split("-")[0]
                    years.add(year)
                    claims_by_year[year] = claims_by_year.get(year, 0) + 1
                except Exception:
                    pass
            loss_type = loss.get("lossType") or "Other"
            claims_by_type[loss_type] = claims_by_type.get(loss_type, 0) + 1

        average_claim = total_incurred / len(losses) if losses else 0

        return {
            "yearsOfHistory": len(years) if years else 0,
            "losses": losses,
            "summary": {
                "totalClaims": len(losses),
                "totalPaid": total_paid,
                "totalIncurred": total_incurred,
                "claimsByYear": claims_by_year,
                "claimsByType": claims_by_type,
                "averageClaimSize": average_claim,
            },
        }

    def _build_coverage_section(self, entities: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "currentCarrier": self._first_value(entities, "Carrier"),
            "policyNumber": self._first_value(entities, "PolicyNumber"),
            "effectiveDate": self._first_value(entities, "EffectiveDate"),
            "expirationDate": self._first_value(entities, "ExpirationDate"),
            "limits": {
                "generalLiability": {
                    "aggregateLimit": self._parse_money(self._first_value(entities, "GeneralAggregateLimit")),
                    "perOccurrenceLimit": self._parse_money(self._first_value(entities, "EachOccurrenceLimit")),
                    "productsCompletedOps": self._parse_money(self._first_value(entities, "ProductsCompletedOpsLimit")),
                    "personalAdvertisingInjury": self._parse_money(self._first_value(entities, "PersonalAdvertisingInjuryLimit")),
                    "medicalExpense": self._parse_money(self._first_value(entities, "MedicalExpenseLimit")),
                    "fireDamageLimit": self._parse_money(self._first_value(entities, "FireDamageLimit")),
                    "employeeBenefitsLimit": self._parse_money(self._first_value(entities, "EmployeeBenefitsLimit")),
                },
                "property": {
                    "building": self._parse_money(self._first_value(entities, "BuildingLimit")),
                    "businessPersonalProperty": self._parse_money(self._first_value(entities, "BPPLimit")),
                    "businessIncome": None,
                    "extraExpense": None,
                },
                "crime": {
                    "employeeTheft": None,
                    "forgeryAlteration": None,
                },
                "umbrella": {
                    "limit": self._parse_money(self._first_value(entities, "TotalInsuredValue")),
                },
            },
            "deductibles": self._build_deductibles(entities),
            "additionalCoverages": [],
        }

    def _build_metadata_section(
        self,
        metadata: Dict[str, Any],
        insured: Dict[str, Any],
        locations: List[Dict[str, Any]],
        exposures: Dict[str, Any],
        loss_history: Dict[str, Any],
        coverage: Dict[str, Any],
    ) -> Dict[str, Any]:
        inputs = metadata.get("inputs", []) or []
        warnings = metadata.get("warnings") or []
        confidence = metadata.get("confidence")
        confidence_value: Optional[int]
        if confidence is None:
            confidence_value = None
        elif confidence <= 1:
            confidence_value = int(round(confidence * 100))
        else:
            confidence_value = int(round(confidence))

        insured_quality = self._compute_quality(
            insured,
            ["businessName", "mailingAddress.street", "mailingAddress.city", "primaryContact.name"],
        )
        location_quality = self._compute_quality({"count": len(locations)}, ["count"])
        exposure_quality = self._compute_quality(
            exposures,
            ["annualRevenue", "annualPayroll", "numberOfEmployees"],
        )
        coverage_quality = self._compute_quality(
            coverage,
            ["policyNumber", "limits.generalLiability.aggregateLimit", "effectiveDate"],
        )
        loss_quality = self._compute_quality(loss_history, ["losses"])

        section_scores = [
            insured_quality["score"],
            location_quality["score"],
            exposure_quality["score"],
            loss_quality["score"],
            coverage_quality["score"],
        ]
        completeness = int(sum(section_scores) / len(section_scores)) if section_scores else 0

        return {
            "mergedAt": metadata.get("updated_at") or datetime.utcnow().isoformat(),
            "sourceFileCount": metadata.get("file_count") or len(inputs),
            "sourceFiles": [entry.get("filename") for entry in inputs if entry.get("filename")],
            "confidence": confidence_value,
            "completeness": completeness,
            "warnings": warnings,
            "dataQuality": {
                "insured": insured_quality,
                "locations": location_quality,
                "exposures": exposure_quality,
                "lossHistory": loss_quality,
                "coverage": coverage_quality,
            },
        }

    # ------------------------------------------------------------------ helpers
    def _get_values(self, entities: Dict[str, Any], field_id: str) -> List[Any]:
        values: List[Any] = []
        entries = entities.get(field_id) or []
        for entry in entries:
            if isinstance(entry, dict):
                val = entry.get("value")
            else:
                val = entry
            if self._has_value(val):
                values.append(val)
        return values

    def _first_value(self, entities: Dict[str, Any], field_id: str) -> Optional[Any]:
        values = self._get_values(entities, field_id)
        return values[0] if values else None

    def _has_value(self, value: Any) -> bool:
        if value is None:
            return False
        if isinstance(value, str):
            return value.strip() not in ("", "N/A")
        if isinstance(value, list):
            return any(self._has_value(v) for v in value)
        if isinstance(value, dict):
            return any(self._has_value(v) for v in value.values())
        return True

    def _parse_money(self, value: Any) -> Optional[float]:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = re.sub(r"[^0-9.\\-]", "", value)
            if not cleaned:
                return None
            try:
                return float(cleaned)
            except ValueError:
                return None
        return None

    def _to_int(self, value: Any) -> Optional[int]:
        if value is None:
            return None
        if isinstance(value, int):
            return value
        if isinstance(value, float):
            return int(value)
        if isinstance(value, str):
            cleaned = re.sub(r"[^0-9-]", "", value)
            if not cleaned:
                return None
            try:
                return int(cleaned)
            except ValueError:
                return None
        return None

    def _coerce_address(self, value: Any) -> Dict[str, Any]:
        if isinstance(value, dict):
            return {
                "street": value.get("street") or value.get("address") or "",
                "street2": value.get("street2") or "",
                "city": value.get("city") or "",
                "state": value.get("state") or "",
                "zip": value.get("zip") or "",
                "country": value.get("country") or "",
            }
        if isinstance(value, list):
            return {
                "street": value[0] if len(value) > 0 else "",
                "street2": "",
                "city": value[1] if len(value) > 1 else "",
                "state": value[2] if len(value) > 2 else "",
                "zip": value[3] if len(value) > 3 else "",
                "country": value[4] if len(value) > 4 else "",
            }
        if isinstance(value, str):
            return {"street": value, "street2": "", "city": "", "state": "", "zip": "", "country": ""}
        return {"street": "", "street2": "", "city": "", "state": "", "zip": "", "country": ""}

    def _map_location(self, data: Dict[str, Any]) -> Dict[str, Any]:
        address = {
            "street": data.get("address") or "",
            "street2": "",
            "city": data.get("city") or "",
            "state": data.get("state") or "",
            "zip": data.get("zip") or "",
            "county": data.get("county") or "",
            "country": data.get("country") or "",
        }
        return {
            "id": data.get("id") or data.get("location_number") or str(uuid.uuid4()),
            "locationNumber": data.get("location_number"),
            "address": address,
            "buildingValue": self._parse_money(data.get("building_value")),
            "contentValue": self._parse_money(data.get("content_value")),
            "businessIncomeValue": self._parse_money(data.get("business_income_value")),
            "occupancy": data.get("occupancy"),
            "constructionType": data.get("construction"),
            "protectionClass": data.get("protection_class"),
            "yearBuilt": self._to_int(data.get("year_built")),
            "squareFootage": self._to_int(data.get("square_feet")),
            "numberOfStories": self._to_int(data.get("number_of_stories")),
            "sprinklered": data.get("sprinklered"),
            "buildingDetails": {},
        }

    def _map_sov_property(self, data: Dict[str, Any]) -> Dict[str, Any]:
        address = {
            "street": data.get("address") or data.get("street") or "",
            "street2": "",
            "city": data.get("city") or "",
            "state": data.get("state") or "",
            "zip": data.get("zip") or "",
            "county": data.get("county") or "",
            "country": data.get("country") or "",
        }
        return {
            "id": data.get("location_id") or data.get("location_number") or str(uuid.uuid4()),
            "locationNumber": data.get("location_number"),
            "address": address,
            "buildingValue": self._parse_money(data.get("building_value")),
            "contentValue": self._parse_money(data.get("contents_value")),
            "businessIncomeValue": self._parse_money(data.get("business_income") or data.get("business_income_value")),
            "occupancy": data.get("occupancy") or data.get("use"),
            "constructionType": data.get("construction"),
            "protectionClass": data.get("protection_class"),
            "yearBuilt": self._to_int(data.get("year_built")),
            "squareFootage": self._to_int(data.get("square_feet") or data.get("sqft")),
            "numberOfStories": self._to_int(data.get("stories")),
            "sprinklered": data.get("sprinklered"),
            "buildingDetails": {},
        }

    def _map_loss_record(self, data: Any) -> Optional[Dict[str, Any]]:
        if not isinstance(data, dict):
            return None
        date = data.get("date") or data.get("date_of_loss")
        description = data.get("description") or data.get("loss_description")
        loss_type = data.get("loss_type") or data.get("type") or "Loss"
        status = data.get("claim_status") or data.get("status") or "Pending"
        paid = self._parse_money(
            data.get("paid") or data.get("paid_amount") or data.get("amount_paid")
        )
        reserve = self._parse_money(
            data.get("reserve") or data.get("reserve_amount")
        )
        incurred = self._parse_money(
            data.get("total_incurred")
        ) or ((paid or 0) + (reserve or 0))

        return {
            "id": data.get("id") or data.get("claim_number") or str(uuid.uuid4()),
            "date": date,
            "lossType": loss_type,
            "description": description or "",
            "claimStatus": status,
            "paidAmount": paid,
            "reserveAmount": reserve,
            "totalIncurred": incurred,
            "claimNumber": data.get("claim_number"),
            "locationId": data.get("location_id"),
        }

    def _build_deductibles(self, entities: Dict[str, Any]) -> List[Dict[str, Any]]:
        deductibles = []
        for value in self._get_values(entities, "Deductible"):
            if isinstance(value, dict):
                deductibles.append({
                    "name": value.get("type") or value.get("name") or "Deductible",
                    "amount": self._parse_money(value.get("amount")),
                    "included": True,
                })
            else:
                deductibles.append({
                    "name": "Deductible",
                    "amount": self._parse_money(value),
                    "included": True,
                })
        if not deductibles:
            self_amount = self._parse_money(self._first_value(entities, "OtherDeductibleAmount"))
            if self_amount is not None:
                deductibles.append({
                    "name": self._first_value(entities, "OtherDeductibleDescription") or "Other",
                    "amount": self_amount,
                    "included": True,
                })
        return deductibles

    def _compute_quality(self, data: Dict[str, Any], field_paths: List[str]) -> Dict[str, Any]:
        total = len(field_paths)
        filled = 0
        missing: List[str] = []
        for path in field_paths:
            value = self._pluck(data, path)
            if self._has_value(value):
                filled += 1
            else:
                missing.append(path.split(".")[-1])
        score = int((filled / total) * 100) if total else 0
        return {
            "score": score,
            "fieldsPopulated": filled,
            "fieldsTotal": total,
            "missingCriticalFields": missing,
        }

    def _pluck(self, data: Any, path: str) -> Any:
        current = data
        for part in path.split("."):
            if isinstance(current, list):
                current = current[0] if current else None
            if isinstance(current, dict):
                current = current.get(part)
            else:
                return current
        return current
