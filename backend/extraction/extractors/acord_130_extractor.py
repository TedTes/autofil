"""
ACORD 130 extractor for Workers Compensation Application forms.

Extracts workers compensation specific information.
"""

from typing import Dict, Any, Iterable, List, Optional
from datetime import datetime
from ..interfaces.extractor import IExtractor
from ..core.document import Document, DocumentType
from ..core.schema import Metadata
from ..models.extraction_result import ExtractionResult
from ..parsers import PdfFieldParser
from ..utils.canonical_output_builder import (
    SectionPayload,
    build_generic_canonical_output,
)
from utils.versioned_template_loader import (
    VersionedTemplateLoader,
    TemplateRecognizer,
    TemplateConfig,
)


class ACORD130Extractor(IExtractor):
    """
    Extractor for ACORD 130 Workers Compensation Application forms.
    
    Extracts:
    - Employer information
    - Classification codes and payroll
    - Experience modification
    - Prior coverage and losses
    """
    
    def __init__(self):
        """Initialize ACORD 130 extractor."""
        self.pdf_parser = PdfFieldParser()
        self.template_loader = VersionedTemplateLoader()
        self.template_recognizer = TemplateRecognizer(
            base_dir=self.template_loader.base_dir
        )
    
    def extract(self, document: Document) -> ExtractionResult:
        """Extract ACORD 130 data."""
        try:
            if document.document_type != DocumentType.ACORD_130:
                return ExtractionResult(
                    success=False,
                    data={},
                    errors=[f"Expected ACORD_130, got {document.document_type.value}"]
                )
            
            # Extract from fillable fields
            template_config: Optional[TemplateConfig] = None
            raw_fields = {}
            if self.pdf_parser.is_fillable(document.file_path):
                raw_fields = self.pdf_parser.extract_fields(document.file_path)
                if raw_fields:
                    template_config = self._resolve_template_config(
                        document,
                        raw_fields.keys(),
                    )
                result = self._extract_from_fillable(
                    document, raw_fields, template_config
                )
                if result.success:
                    return result
            
            # Extract from reader-populated table data
            if document.tables:
                result = self._extract_from_tables(document)
                return result
            
            return ExtractionResult(
                success=False,
                data={},
                errors=["No extractable data found"]
            )
            
        except Exception as e:
            return ExtractionResult(
                success=False,
                data={},
                errors=[f"ACORD 130 extraction failed: {str(e)}"]
            )
    
    def can_extract(self, document: Document) -> bool:
        """Check if can extract."""
        return document.document_type == DocumentType.ACORD_130
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get supported types."""
        return [DocumentType.ACORD_130]

    def _resolve_template_config(
        self,
        document: Document,
        field_names: Iterable[str],
    ) -> Optional[TemplateConfig]:
        names = tuple(field_names or [])
        template_id_hint = (document.metadata or {}).get("template_id_hint")
        preferred_ids = [str(template_id_hint)] if template_id_hint else []

        detected = self.template_recognizer.detect(names)
        if detected:
            preferred_ids.append(detected)

        return self.template_loader.load_matching(
            form_type="ACORD_130",
            preferred_template_ids=preferred_ids,
            field_names=names,
        )
    
    def _extract_from_fillable(
        self,
        document: Document,
        raw_fields: Dict[str, Any],
        template_config: Optional[TemplateConfig],
    ) -> ExtractionResult:
        """Extract from fillable fields."""
        mapped = self._map_fields(raw_fields, template_config)
        shared_fields = self._build_shared_fields(mapped)
        classification_rows = self._extract_classification_rows(raw_fields, template_config)
        if classification_rows:
            shared_fields["Classification"] = classification_rows
            mapped.setdefault("Classifications", classification_rows)

        canonical = build_generic_canonical_output(
            document,
            section_payloads=[
                SectionPayload(
                    key="workers_compensation",
                    display_name="Workers Compensation",
                    description="Employer & coverage information",
                    priority=1,
                    fields={**mapped, **shared_fields},
                )
            ],
            extraction_method="fillable_pdf",
            metadata=Metadata(
                form_type_detected="ACORD_130",
                line_of_business="Workers Compensation",
            ),
            raw={
                "mapped_fields": mapped,
                "shared_fields": shared_fields,
                "raw_fields": raw_fields,
            },
        )
        return ExtractionResult(success=True, data=canonical.to_dict(), confidence=0.8)
    
    def _extract_from_tables(self, document: Document) -> ExtractionResult:
        """Extract classification codes and payroll from reader-populated tables."""
        classifications = []
        
        for table in document.tables:
            # Look for classification table
            headers_lower = [h.lower() for h in table.headers]
            
            if any('class' in h for h in headers_lower):
                for row in table.rows:
                    if len(row) >= 2:
                        classifications.append({
                            'class_code': row[0],
                            'description': row[1] if len(row) > 1 else '',
                            'payroll': row[2] if len(row) > 2 else '',
                        })
        
        section_payloads = [
            SectionPayload(
                key="workers_compensation",
                display_name="Workers Compensation",
                description="Classification schedule",
                priority=1,
                fields={
                    "Classification": classifications,
                    "Classifications": classifications,
                    "Payroll": self._sum_payroll(classifications),
                    "extractedAt": datetime.utcnow().isoformat(),
                },
            )
        ]

        canonical = build_generic_canonical_output(
            document,
            section_payloads=section_payloads,
            extraction_method="table_parser",
            metadata=Metadata(
                form_type_detected="ACORD_130",
                line_of_business="Workers Compensation",
            ),
            raw={"classifications": classifications},
        )

        return ExtractionResult(success=True, data=canonical.to_dict(), confidence=0.75)
    
    def _map_fields(
        self, raw_fields: Dict[str, Any], template_config: Optional[TemplateConfig]
    ) -> Dict[str, Any]:
        """Map raw fields."""
        mapped: Dict[str, Any] = {}
        if template_config:
            pdf_to_canonical = template_config.pdf_to_canonical
            for pdf_name, canonical in pdf_to_canonical.items():
                if pdf_name in raw_fields:
                    mapped[canonical] = raw_fields[pdf_name]
            return mapped

        # fallback: alias-based mapping
        for standard_field, possible_names in self.FIELD_MAPPINGS.items():
            for possible_name in possible_names:
                if possible_name in raw_fields:
                    mapped[standard_field] = raw_fields[possible_name]
                    break
        return mapped

    def _build_shared_fields(self, mapped: Dict[str, Any]) -> Dict[str, Any]:
        shared: Dict[str, Any] = {}

        insured_name = mapped.get("EmployerName")
        if insured_name:
            shared["InsuredName"] = insured_name

        mailing_address = {
            "street": mapped.get("EmployerAddressLine1"),
            "line2": mapped.get("EmployerAddressLine2"),
            "city": mapped.get("EmployerCity"),
            "state": mapped.get("EmployerState"),
            "zip": mapped.get("EmployerPostalCode"),
        }
        if any(value not in ("", None) for value in mailing_address.values()):
            shared["MailingAddress"] = mailing_address

        if mapped.get("FederalID"):
            shared["FEIN"] = mapped["FederalID"]
        if mapped.get("StateID"):
            shared["StateEmployerIdentifier"] = mapped["StateID"]
        if mapped.get("TotalEstimatedPayroll") not in ("", None):
            shared["Payroll"] = mapped["TotalEstimatedPayroll"]

        return shared

    def _extract_classification_rows(
        self,
        raw_fields: Dict[str, Any],
        template_config: Optional[TemplateConfig],
    ) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        repeater = (template_config.repeaters or {}).get("Classifications") if template_config else None
        if not isinstance(repeater, dict):
            return rows

        row_ids = list(repeater.get("row_ids", []) or [])
        columns = dict(repeater.get("columns", {}) or {})
        if not row_ids or not columns:
            return rows

        for row_id in row_ids:
            row: Dict[str, Any] = {}
            for canonical_col, pattern in columns.items():
                field_name = pattern.format(row_id=row_id)
                value = raw_fields.get(field_name)
                if value in (None, "", "/Off", "Off"):
                    continue
                row[canonical_col] = value
            if any(value not in ("", None) for value in row.values()):
                rows.append(row)

        return rows

    def _sum_payroll(self, classifications: List[Dict[str, Any]]) -> Optional[float]:
        total = 0.0
        seen = False
        for row in classifications:
            raw_value = row.get("payroll")
            if raw_value in (None, ""):
                continue
            try:
                total += float(str(raw_value).replace(",", "").replace("$", ""))
                seen = True
            except (TypeError, ValueError):
                continue
        return total if seen else None
    
    def __repr__(self) -> str:
        return "ACORD130Extractor()"
    FIELD_MAPPINGS = {
        # Employer Information
        "EmployerName": ["Named Insured", "Employer Name"],
        "EmployerAddressLine1": ["Address", "Mailing Address"],
        "EmployerAddressLine2": ["Address Line 2"],
        "EmployerCity": ["City"],
        "EmployerState": ["State"],
        "EmployerPostalCode": ["Zip"],
        "FederalID": ["FEIN", "Federal ID"],
        "StateID": ["State ID", "State Employer ID"],
        # Coverage
        "EffectiveDate": ["Effective Date", "Policy Period From"],
        "ExpirationDate": ["Expiration Date", "Policy Period To"],
        "CoverageStates": ["States", "Coverage States"],
        # Experience Modification
        "ExperienceModFactor": ["Experience Mod", "Experience Modification", "Mod Factor"],
        "ExperienceModEffectiveDate": ["Mod Effective Date"],
        # Prior Coverage
        "PriorCarrierName": ["Prior Carrier", "Current Carrier"],
        "PriorPolicyNumber": ["Prior Policy Number"],
        # Total Payroll
        "TotalEstimatedPayroll": ["Total Estimated Annual Payroll", "Total Payroll"],
    }
