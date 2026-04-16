"""
Loss Run extractor for insurance claim history documents.

Extracts claim data from loss run reports in various formats:
- Table-based loss runs (most common)
- Text-based loss runs
- Multi-page loss runs with claim details
"""

from typing import Dict, Any, List, Optional, Tuple
import csv
import re
import os
from pathlib import Path
import yaml
from datetime import datetime
from ..extractors.extractor_base import BaseExtractor
from ..core.document import Document, DocumentType
from ..core.schema import CanonicalOutput, SourceInfo, Metadata
from ..models.extraction_result import ExtractionResult
from ..utils.semantic_section_builder import SemanticSectionBuilder
from ..parsers import TableParser, OcrFallbackParser
from ..validation.validator import validate

FIELD_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "templates" / "loss_run_fields.yaml"


class LossRunExtractor(BaseExtractor):
    """
    Extractor for Loss Run documents.
    
    Extracts claim history data including:
    - Claim details (date, number, amount, status)
    - Claimant information
    - Policy information
    - Totals and summaries
    
    Supports multiple formats and layouts.
    """
    
    COLUMN_PATTERNS: Dict[str, List[str]] = {}
    
    def __init__(self):
        """Initialize Loss Run extractor."""
        self.table_parser = TableParser(flavor='auto', min_confidence=60.0) if TableParser else None
        self.ocr_parser = OcrFallbackParser() if OcrFallbackParser else None
        if not self.COLUMN_PATTERNS:
            self.COLUMN_PATTERNS = self._load_field_patterns()
    def extract(self, document: Document) -> ExtractionResult:
        """
        Extract loss run data and return canonical output.
        """
        if document.document_type != DocumentType.LOSS_RUN:
            return self._failure_result(
                f"Expected LOSS_RUN document, got {document.document_type.value}"
            )

        extraction: Optional[Tuple[Dict[str, Any], List[str], float]] = None

        if document.tables:
            extraction = self._extract_from_tables(document)

        if not extraction and document.raw_text:
            extraction = self._extract_from_text(document)

        if not extraction:
            return self._failure_result("No extractable loss run data found")

        data, warnings, confidence = extraction
        canonical = self._build_canonical_output(document, data, confidence)
        validated = validate(canonical)
        return self._success_result(
            validated,
            confidence=confidence,
            warnings=warnings,
            metadata={
                "form_type": "LOSS_RUN",
                "line_of_business": "Claims History",
            },
        )
    
    def can_extract(self, document: Document) -> bool:
        """Check if can extract from document."""
        try:
            return (
                document.document_type == DocumentType.LOSS_RUN and
                (bool(document.tables) or bool(document.raw_text))
            )
        except Exception as e: 
            print("error from can_extract ", str(e))
            raise
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get supported document types."""
        return [DocumentType.LOSS_RUN]
    
    def _extract_from_tables(self, document: Document) -> Optional[Tuple[Dict[str, Any], List[str], float]]:
        """Extract claims from table data."""
        claims = []
        warnings = []
        try:
            for table_idx, table in enumerate(document.tables):
                column_map = self._map_columns(table.headers)

                if not column_map:
                    warnings.append(f"Table {table_idx}: Could not map columns to claim fields")
                    continue

                for row_idx, row in enumerate(table.rows):
                    try:
                        claim = self._extract_claim_from_row(row, column_map, table.headers)
                        if claim and self._is_valid_claim(claim):
                            claim['_source'] = {
                                'table_index': table_idx,
                                'row_index': row_idx
                            }
                            claims.append(claim)
                    except Exception as e:
                        warnings.append(f"Table {table_idx}, Row {row_idx}: {str(e)}")

            if not claims:
                summary = self._detect_no_loss_statement(document)
                if summary:
                    warnings.append("Document states that there are no known losses for the policy term.")
                    data = {
                        'document_type': 'loss_run',
                        'extraction_date': datetime.utcnow().isoformat(),
                        'policy_information': self._extract_policy_info(document),
                        'claims': [],
                        'claim_count': 0,
                        'totals': {'paid': 0, 'incurred': 0, 'reserve': 0},
                        'summary': summary,
                    }
                    return data, warnings, 0.85
                return None

            totals = self._calculate_totals(claims)
            policy_info = self._extract_policy_info(document)
            data = {
                'document_type': 'loss_run',
                'extraction_date': datetime.utcnow().isoformat(),
                'policy_information': policy_info,
                'claims': claims,
                'claim_count': len(claims),
                'totals': totals,
            }

            return data, warnings, self._calculate_confidence(claims, warnings)
        except Exception as e:
            print("error from _extract_from_tables", str(e))
            raise e
    
    def _extract_from_text(self, document: Document) -> Optional[Tuple[Dict[str, Any], List[str], float]]:
        """Extract claims from raw text (fallback method)."""
        text = document.raw_text or ""
        lines = [line for line in text.splitlines() if line.strip()]
        if len(lines) < 2:
            return None

        sample = "\n".join(lines[:10])
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",\t|;")
            delimiter = dialect.delimiter
        except csv.Error:
            if '\t' in sample:
                delimiter = '\t'
            elif '|' in sample:
                delimiter = '|'
            elif ',' in sample:
                delimiter = ','
            else:
                return None

        reader = csv.reader(lines, delimiter=delimiter)
        rows = [
            [cell.strip() for cell in row]
            for row in reader
            if any(cell.strip() for cell in row)
        ]

        if len(rows) < 2:
            return None

        headers = rows[0]
        column_map = self._map_columns(headers)
        if not column_map:
            return None

        claims = []
        warnings = ["Parsed data from raw text – accuracy may be reduced"]

        for row_idx, row in enumerate(rows[1:], start=1):
            try:
                claim = self._extract_claim_from_row(row, column_map, headers)
                if claim and self._is_valid_claim(claim):
                    claim['_source'] = {'text_row_index': row_idx}
                    claims.append(claim)
            except Exception as exc:
                warnings.append(f"Text row {row_idx}: {exc}")

        if not claims:
            summary = self._detect_no_loss_statement(document)
            if summary:
                warnings.append("Document states that there are no known losses for the policy term.")
                data = {
                    'document_type': 'loss_run',
                    'extraction_date': datetime.utcnow().isoformat(),
                    'policy_information': self._extract_policy_info(document),
                    'claims': [],
                    'claim_count': 0,
                    'totals': {'paid': 0, 'incurred': 0, 'reserve': 0},
                    'summary': summary,
                }
                return data, warnings, 0.75
            return None

        totals = self._calculate_totals(claims)
        data = {
            'document_type': 'loss_run',
            'extraction_date': datetime.utcnow().isoformat(),
            'policy_information': self._extract_policy_info(document),
            'claims': claims,
            'claim_count': len(claims),
            'totals': totals,
        }
        return data, warnings, self._calculate_confidence(claims, warnings)

    def _detect_no_loss_statement(self, document: Document) -> Optional[str]:
        """Detect statements indicating no reported losses."""
        text = (document.raw_text or "").lower()
        patterns = [
            r'no\s+known\s+losses',
            r'no\s+losses\s+reported',
            r'loss\s+history\s+not\s+available',
            r'no\s+claims\s+reported',
        ]
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                start = max(0, match.start() - 40)
                end = min(len(document.raw_text or ""), match.end() + 40)
                snippet = (document.raw_text or "")[start:end].strip()
                return snippet or "No losses reported"
        return None

    def _load_field_patterns(self) -> Dict[str, List[str]]:
        try:
            with open(FIELD_CONFIG_PATH, 'r', encoding='utf-8') as f:
                data = yaml.safe_load(f) or {}
        except FileNotFoundError:
            return {}
        fields = data.get('fields', {})
        normalized = {}
        for field, meta in fields.items():
            aliases = meta.get('aliases', []) or []
            normalized[field] = [self._normalize_header(alias) for alias in aliases]
        return normalized

    def _normalize_header(self, header: Any) -> str:
        if header is None:
            return ""
        header = str(header).strip()
        if not header:
            return ""
        # Insert spaces between camelCase or number boundaries
        header = re.sub(r'(?<=[a-z])(?=[A-Z0-9])', ' ', header)
        header = header.replace('_', ' ')
        # Remove all non alphanumeric characters and collapse to single token
        header = re.sub(r'[^a-z0-9]+', '', header.lower())
        return header
    
    def _map_columns(self, headers: List[str]) -> Dict[str, int]:
        """Map table columns to claim fields."""
        column_map = {}
        normalized_headers = [self._normalize_header(h) for h in headers]

        for field, aliases in self.COLUMN_PATTERNS.items():
            for col_idx, header in enumerate(normalized_headers):
                if not header:
                    continue
                for alias in aliases:
                    if not alias:
                        continue
                    if alias in header or header in alias:
                        column_map[field] = col_idx
                        break
                if field in column_map:
                    break

        return column_map
    
    def _extract_claim_from_row(
        self,
        row: List[str],
        column_map: Dict[str, int],
        headers: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Extract claim data from table row."""
        claim = {}
        
        # Extract mapped fields
        for field, col_idx in column_map.items():
            if col_idx < len(row):
                value = row[col_idx]
                if value is None:
                    continue
                if isinstance(value, str):
                    cleaned = value.strip()
                else:
                    cleaned = str(value).strip()
                if cleaned != "":
                    claim[field] = cleaned
        
        # Parse dates
        for date_field in ['date_of_loss', 'date_reported']:
            if date_field in claim:
                claim[date_field] = self._parse_date(claim[date_field])
        
        # Parse amounts
        for amount_field in ['claim_amount', 'paid', 'incurred', 'reserve']:
            if amount_field in claim:
                claim[amount_field] = self._parse_amount(claim[amount_field])
        
        return claim if claim else None
    
    def _is_valid_claim(self, claim: Dict[str, Any]) -> bool:
        """Check if claim data is valid."""
        # Must have at least claim number or date of loss
        has_identifier = bool(claim.get('claim_number') or claim.get('date_of_loss'))
        
        # Must have at least one amount field
        has_amount = any(
            claim.get(field) is not None
            for field in ['claim_amount', 'paid', 'incurred', 'reserve']
        )
        
        return has_identifier and has_amount
    
    def _parse_date(self, date_str: str) -> Optional[str]:
        """Parse date string to ISO format."""
        if not date_str:
            return None
        
        # Common date formats
        formats = [
            '%m/%d/%Y',
            '%m-%d-%Y',
            '%Y-%m-%d',
            '%m/%d/%y',
            '%d/%m/%Y',
            '%B %d, %Y',
            '%b %d, %Y',
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str.strip(), fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue
        
        return date_str  # Return original if can't parse
    
    def _parse_amount(self, amount_str: str) -> Optional[float]:
        """Parse amount string to float."""
        if amount_str is None:
            return None
        
        if isinstance(amount_str, (int, float)):
            return float(amount_str)

        if not amount_str:
            return None
        
        # Remove currency symbols and commas
        import re
        cleaned = re.sub(r'[$,\s]', '', amount_str)
        
        # Handle parentheses as negative
        if '(' in cleaned and ')' in cleaned:
            cleaned = '-' + cleaned.replace('(', '').replace(')', '')
        
        try:
            return float(cleaned)
        except ValueError:
            return None
    
    def _calculate_totals(self, claims: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate total amounts from claims."""
        totals = {
            'total_paid': 0.0,
            'total_incurred': 0.0,
            'total_reserve': 0.0,
            'total_claims': len(claims)
        }
        
        for claim in claims:
            if claim.get('paid') is not None:
                totals['total_paid'] += claim['paid']
            if claim.get('incurred') is not None:
                totals['total_incurred'] += claim['incurred']
            if claim.get('reserve') is not None:
                totals['total_reserve'] += claim['reserve']
        
        return totals
    
    def _extract_policy_info(self, document: Document) -> Dict[str, Any]:
        """Extract policy information from document."""
        policy_info = {}
        
        if document.raw_text:
            text = document.raw_text
            
            # Extract policy number
            import re
            policy_match = re.search(
                r'policy.*(?:number|no|#)[:\s]+([A-Z0-9\-]+)',
                text,
                re.IGNORECASE
            )
            if policy_match:
                policy_info['policy_number'] = policy_match.group(1).strip()
            
            # Extract insured name
            insured_match = re.search(
                r'(?:named\s+)?insured[:\s]+([^\n]+)',
                text,
                re.IGNORECASE
            )
            if insured_match:
                policy_info['insured_name'] = insured_match.group(1).strip()
            
            # Extract policy period
            period_match = re.search(
                r'policy\s+period[:\s]+([0-9/\-]+)\s+to\s+([0-9/\-]+)',
                text,
                re.IGNORECASE
            )
            if period_match:
                policy_info['policy_period'] = {
                    'start': self._parse_date(period_match.group(1)),
                    'end': self._parse_date(period_match.group(2))
                }
        
        return policy_info
    
    def _calculate_confidence(
        self,
        claims: List[Dict[str, Any]],
        warnings: List[str]
    ) -> float:
        """Calculate extraction confidence."""
        if not claims:
            return 0.0
        
        # Base confidence
        confidence = 0.7
        
        # Bonus for multiple claims
        if len(claims) >= 3:
            confidence += 0.1
        
        # Bonus for complete data
        complete_claims = sum(
            1 for claim in claims
            if all(claim.get(field) for field in ['claim_number', 'date_of_loss', 'paid'])
        )
        completeness_ratio = complete_claims / len(claims)
        confidence += completeness_ratio * 0.15
        
        # Penalty for warnings
        confidence -= len(warnings) * 0.05
        
        return max(0.0, min(1.0, confidence))

    def _build_canonical_output(
        self,
        document: Document,
        data: Dict[str, Any],
        confidence: float,
    ) -> CanonicalOutput:
        entity_map = self._build_entity_map(data, confidence)
        sections = SemanticSectionBuilder.build(entity_map)
        lob = data.get("policy_information", {}).get("line_of_business") or "General Liability"
        metadata = Metadata(
            form_type_detected=document.document_type.value.upper(),
            line_of_business=lob,
            schema_version="1.0",
        )
        return CanonicalOutput(
            job_id=document.job_id,
            source=SourceInfo(
                file_name=document.file_name,
                file_type=self._infer_file_type(document),
                extraction_method=document.document_type.value,
                extracted_at=datetime.utcnow(),
            ),
            semantic_sections=sections,
            metadata=metadata,
            raw={**data, "confidence": confidence},
        )

    def _build_entity_map(
        self,
        data: Dict[str, Any],
        confidence: float,
    ) -> Dict[str, List[Dict[str, Any]]]:
        entity_map: Dict[str, List[Dict[str, Any]]] = {}
        claims = data.get("claims") or []

        prior_losses: List[Dict[str, Any]] = []
        for claim in claims:
            if not isinstance(claim, dict):
                continue
            loss_value = self._clean_dict(
                {
                    "date_of_loss": claim.get("date_of_loss"),
                    "type": claim.get("status"),
                    "amount_paid": claim.get("paid"),
                    "amount_reserved": claim.get("reserve"),
                    "incurred": claim.get("incurred"),
                    "description": claim.get("description"),
                    "claim_number": claim.get("claim_number"),
                    "policy_number": claim.get("policy_number"),
                }
            )
            if not loss_value:
                continue
            prior_losses.append(
                {
                    "value": loss_value,
                    "confidence": confidence,
                    "tags": ["loss_run", "claim"],
                    "source": claim.get("_source"),
                }
            )
        if prior_losses:
            entity_map["PriorLosses"] = prior_losses

        policy_info = data.get("policy_information") or {}
        policy_number = policy_info.get("policy_number") or self._first_non_empty(claims, "policy_number")
        if policy_number:
            entity_map.setdefault("PolicyNumber", []).append(
                {
                    "value": policy_number,
                    "confidence": confidence,
                    "tags": ["loss_run", "policy"],
                }
            )

        carrier = policy_info.get("carrier")
        if carrier:
            entity_map.setdefault("Carrier", []).append(
                {
                    "value": carrier,
                    "confidence": confidence,
                    "tags": ["loss_run", "policy"],
                }
            )

        lob = policy_info.get("line_of_business")
        if lob:
            entity_map.setdefault("LineOfBusiness", []).append(
                {
                    "value": lob,
                    "confidence": confidence,
                    "tags": ["loss_run", "policy"],
                }
            )

        return entity_map

    @staticmethod
    def _clean_dict(values: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in values.items() if v not in (None, "", [])}

    @staticmethod
    def _first_non_empty(items: List[Dict[str, Any]], key: str) -> Optional[Any]:
        for entry in items:
            if not isinstance(entry, dict):
                continue
            value = entry.get(key)
            if value not in (None, "", []):
                return value
        return None

    @staticmethod
    def _infer_file_type(document: Document) -> str:
        if document.file_extension:
            return document.file_extension.lstrip(".").lower()
        if document.mime_type and "/" in document.mime_type:
            return document.mime_type.split("/")[-1]
        return "pdf"
    
    def __repr__(self) -> str:
        return "LossRunExtractor()"
