"""
SOV (Schedule of Values) extractor for property schedules.

Extracts property/location data from Schedule of Values documents:
- Property locations and addresses
- Building and contents values
- Construction details
- Occupancy information
- Total insured values
"""

import csv
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime
from ..extractors.extractor_base import BaseExtractor
from ..core.document import Document, DocumentType
from ..core.schema import CanonicalOutput, SourceInfo, Metadata
from ..models.extraction_result import ExtractionResult
from ..utils.semantic_section_builder import SemanticSectionBuilder
from ..parsers import TableParser, ExcelParser
from ..validation.validator import validate


class SovExtractor(BaseExtractor):
    """
    Extractor for Schedule of Values (SOV) documents.
    
    Extracts property schedule data including:
    - Location/address information
    - Building and contents values
    - Construction type and year built
    - Occupancy and usage
    - Total Insured Values (TIV)
    
    Supports PDF tables and Excel formats.
    """
    
    # Column header patterns
    COLUMN_PATTERNS = {
        'location_number': [
            r'location.*(?:number|no|#|id)',
            r'site.*(?:number|no|#)',
            r'loc.*#',
        ],
        'address': [
            r'(?:property\s+)?address',
            r'street.*address',
            r'location.*address',
        ],
        'city': [
            r'city',
        ],
        'state': [
            r'state',
            r'st',
        ],
        'zip': [
            r'zip.*code',
            r'postal.*code',
            r'zip',
        ],
        'building_value': [
            r'building.*value',
            r'structure.*value',
            r'bldg.*value',
        ],
        'contents_value': [
            r'contents.*value',
            r'personal.*property',
            r'pp.*value',
        ],
        'business_income': [
            r'business.*income',
            r'bi.*value',
            r'loss.*income',
        ],
        'total_value': [
            r'total.*(?:insured\s+)?value',
            r'tiv',
            r'total.*coverage',
        ],
        'construction': [
            r'construction.*type',
            r'construction',
            r'const.*type',
        ],
        'occupancy': [
            r'occupancy.*type',
            r'occupancy',
            r'use.*type',
        ],
        'year_built': [
            r'year.*built',
            r'construction.*year',
            r'built.*year',
        ],
        'square_feet': [
            r'(?:square\s+)?(?:feet|ft|footage)',
            r'sq.*ft',
            r'area',
        ],
        'stories': [
            r'(?:number.*of\s+)?stor(?:ies|ys)',
            r'floors',
        ],
        'sprinkler': [
            r'sprinkler.*(?:system|protected)?',
            r'fire.*protection',
        ],
        'roof_type': [
            r'roof.*type',
            r'roofing',
        ],
    }
    
    def __init__(self):
        """Initialize SOV extractor."""
        self.table_parser = TableParser(flavor='auto', min_confidence=60.0) if TableParser else None
        self.excel_parser = ExcelParser() if ExcelParser else None
    
    def extract(self, document: Document) -> ExtractionResult:
        """
        Extract SOV data from document.
        
        Args:
            document: Document object with SOV content
            
        Returns:
            ExtractionResult with extracted property data
        """
        if document.document_type != DocumentType.SOV:
            return self._failure_result(
                f"Expected SOV document, got {document.document_type.value}"
            )

        extraction: Optional[Tuple[Dict[str, Any], List[str], float]] = None

        if document.tables:
            extraction = self._extract_from_tables(document)

        if not extraction and document.file_extension == '.csv':
            extraction = self._extract_from_csv(document)

        if not extraction and document.file_extension in ['.xlsx', '.xls']:
            extraction = self._extract_from_excel(document)

        if not extraction:
            return self._failure_result("No extractable SOV data found")

        data, warnings, confidence = extraction
        canonical = self._build_canonical_output(document, data, confidence)
        validated = validate(canonical)
        return self._success_result(
            validated,
            confidence=confidence,
            warnings=warnings,
            metadata={
                "form_type": "SOV",
                "line_of_business": "Property",
            },
        )
    
    def can_extract(self, document: Document) -> bool:
        """Check if can extract from document."""
        return (
            document.document_type == DocumentType.SOV and
            (bool(document.tables) or document.file_extension in ['.xlsx', '.xls', '.csv'])
        )
    
    def get_supported_types(self) -> List[DocumentType]:
        """Get supported document types."""
        return [DocumentType.SOV]
    
    def _extract_from_tables(self, document: Document) -> Optional[Tuple[Dict[str, Any], List[str], float]]:
        """Extract properties from table data."""
        properties = []
        warnings = []
        
        for table_idx, table in enumerate(document.tables):
            # Map columns to fields
            column_map = self._map_columns(table.headers)
            
            if not column_map:
                warnings.append(f"Table {table_idx}: Could not map columns to property fields")
                continue
            
            # Extract properties from rows
            for row_idx, row in enumerate(table.rows):
                try:
                    property_data = self._extract_property_from_row(row, column_map, table.headers)
                    if property_data and self._is_valid_property(property_data):
                        property_data['_source'] = {
                            'table_index': table_idx,
                            'row_index': row_idx
                        }
                        properties.append(property_data)
                except Exception as e:
                    warnings.append(f"Table {table_idx}, Row {row_idx}: {str(e)}")
        
        if not properties:
            return None
        
        totals = self._calculate_totals(properties)
        schedule_info = self._extract_schedule_info(document)
        
        data = {
            'document_type': 'sov',
            'extraction_date': datetime.utcnow().isoformat(),
            'schedule_information': schedule_info,
            'properties': properties,
            'property_count': len(properties),
            'totals': totals,
        }
        
        return data, warnings, self._calculate_confidence(properties, warnings)
    
    def _extract_from_excel(self, document: Document) -> Optional[Tuple[Dict[str, Any], List[str], float]]:
        """Extract properties from Excel file."""
        if not self.excel_parser:
            return None

        # Parse Excel file
        excel_result = self.excel_parser.extract_fields(document.file_path)
        
        if not excel_result.get('sheets'):
            return None
        
        # Use first sheet (or find sheet with SOV data)
        sheet_data = excel_result['sheets'][0]
        headers = sheet_data.get('headers', [])
        rows = sheet_data.get('rows', [])
        
        if not headers or not rows:
            return None
        
        # Map columns
        column_map = self._map_columns(headers)
        
        if not column_map:
            return None
        
        # Extract properties
        properties = []
        warnings = []
        
        for row_idx, row in enumerate(rows):
            try:
                property_data = self._extract_property_from_row(row, column_map, headers)
                if property_data and self._is_valid_property(property_data):
                    property_data['_source'] = {
                        'sheet_index': 0,
                        'row_index': row_idx
                    }
                    properties.append(property_data)
            except Exception as e:
                warnings.append(f"Row {row_idx}: {str(e)}")
        
        if not properties:
            return None
        
        totals = self._calculate_totals(properties)
        
        data = {
            'document_type': 'sov',
            'extraction_date': datetime.utcnow().isoformat(),
            'schedule_information': {},
            'properties': properties,
            'property_count': len(properties),
            'totals': totals,
        }
        
        return data, warnings, self._calculate_confidence(properties, warnings)

    def _extract_from_csv(self, document: Document) -> Optional[Tuple[Dict[str, Any], List[str], float]]:
        """Extract properties from a CSV file without requiring Excel dependencies."""
        rows = self._read_csv_rows(document)
        if len(rows) < 2:
            return None

        headers = rows[0]
        column_map = self._map_columns(headers)
        if not column_map:
            return None

        properties = []
        warnings = []

        for row_idx, row in enumerate(rows[1:], start=1):
            try:
                property_data = self._extract_property_from_row(row, column_map, headers)
                if property_data and self._is_valid_property(property_data):
                    property_data['_source'] = {
                        'csv_row_index': row_idx
                    }
                    properties.append(property_data)
            except Exception as e:
                warnings.append(f"CSV row {row_idx}: {str(e)}")

        if not properties:
            return None

        totals = self._calculate_totals(properties)
        data = {
            'document_type': 'sov',
            'extraction_date': datetime.utcnow().isoformat(),
            'schedule_information': self._extract_schedule_info(document),
            'properties': properties,
            'property_count': len(properties),
            'totals': totals,
        }

        return data, warnings, self._calculate_confidence(properties, warnings)

    @staticmethod
    def _read_csv_rows(document: Document) -> List[List[str]]:
        text = document.raw_text
        if not text and document.file_path:
            try:
                with open(document.file_path, "r", encoding="utf-8-sig", newline="") as handle:
                    text = handle.read()
            except OSError:
                text = ""

        if not text:
            return []

        reader = csv.reader(text.splitlines())
        return [
            [cell.strip() for cell in row]
            for row in reader
            if any(cell.strip() for cell in row)
        ]
    
    def _map_columns(self, headers: List[str]) -> Dict[str, int]:
        """Map table columns to property fields."""
        column_map = {}
        headers_lower = [h.lower() for h in headers]
        
        for field, patterns in self.COLUMN_PATTERNS.items():
            for col_idx, header in enumerate(headers_lower):
                for pattern in patterns:
                    import re
                    if re.search(pattern, header, re.IGNORECASE):
                        column_map[field] = col_idx
                        break
                if field in column_map:
                    break
        
        return column_map
    
    def _extract_property_from_row(
        self,
        row: List[str],
        column_map: Dict[str, int],
        headers: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Extract property data from table row."""
        property_data = {}
        
        # Extract mapped fields
        for field, col_idx in column_map.items():
            if col_idx < len(row):
                value = str(row[col_idx]).strip() if row[col_idx] else ''
                if value:
                    property_data[field] = value
        
        # Combine address fields if available
        if any(f in property_data for f in ['address', 'city', 'state', 'zip']):
            property_data['full_address'] = self._format_address(property_data)
        
        # Parse numeric values
        for amount_field in ['building_value', 'contents_value', 'business_income', 'total_value']:
            if amount_field in property_data:
                property_data[amount_field] = self._parse_amount(property_data[amount_field])
        
        # Parse year
        if 'year_built' in property_data:
            property_data['year_built'] = self._parse_year(property_data['year_built'])
        
        # Parse square feet
        if 'square_feet' in property_data:
            property_data['square_feet'] = self._parse_amount(property_data['square_feet'])
        
        # Parse stories
        if 'stories' in property_data:
            property_data['stories'] = self._parse_stories(property_data['stories'])
        
        return property_data if property_data else None
    
    def _is_valid_property(self, property_data: Dict[str, Any]) -> bool:
        """Check if property data is valid."""
        # Must have location identifier or address
        has_location = bool(
            property_data.get('location_number') or
            property_data.get('address') or
            property_data.get('full_address')
        )
        
        # Must have at least one value field
        has_value = any(
            property_data.get(field) is not None
            for field in ['building_value', 'contents_value', 'total_value']
        )
        
        return has_location and has_value
    
    def _format_address(self, property_data: Dict[str, Any]) -> str:
        """Format full address from components."""
        parts = []
        
        if property_data.get('address'):
            parts.append(property_data['address'])
        if property_data.get('city'):
            parts.append(property_data['city'])
        
        state_zip = []
        if property_data.get('state'):
            state_zip.append(property_data['state'])
        if property_data.get('zip'):
            state_zip.append(property_data['zip'])
        
        if state_zip:
            parts.append(' '.join(state_zip))
        
        return ', '.join(parts)
    
    def _parse_amount(self, amount_str: str) -> Optional[float]:
        """Parse amount string to float."""
        if not amount_str:
            return None
        
        # Remove currency symbols, commas, and whitespace
        import re
        cleaned = re.sub(r'[$,\s]', '', str(amount_str))
        
        # Handle parentheses as negative
        if '(' in cleaned and ')' in cleaned:
            cleaned = '-' + cleaned.replace('(', '').replace(')', '')
        
        try:
            return float(cleaned)
        except ValueError:
            return None
    
    def _parse_year(self, year_str: str) -> Optional[int]:
        """Parse year string to integer."""
        if not year_str:
            return None
        
        try:
            year = int(str(year_str).strip())
            # Validate reasonable range
            if 1800 <= year <= 2100:
                return year
        except ValueError:
            pass
        
        return None
    
    def _parse_stories(self, stories_str: str) -> Optional[int]:
        """Parse number of stories."""
        if not stories_str:
            return None
        
        import re
        # Extract first number
        match = re.search(r'\d+', str(stories_str))
        if match:
            try:
                return int(match.group())
            except ValueError:
                pass
        
        return None
    
    def _calculate_totals(self, properties: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Calculate total values from properties."""
        totals = {
            'total_building_value': 0.0,
            'total_contents_value': 0.0,
            'total_business_income': 0.0,
            'total_insured_value': 0.0,
            'total_locations': len(properties)
        }
        
        for prop in properties:
            if prop.get('building_value') is not None:
                totals['total_building_value'] += prop['building_value']
            if prop.get('contents_value') is not None:
                totals['total_contents_value'] += prop['contents_value']
            if prop.get('business_income') is not None:
                totals['total_business_income'] += prop['business_income']
            if prop.get('total_value') is not None:
                totals['total_insured_value'] += prop['total_value']
        
        # If no total_value, calculate from components
        if totals['total_insured_value'] == 0.0:
            totals['total_insured_value'] = (
                totals['total_building_value'] +
                totals['total_contents_value'] +
                totals['total_business_income']
            )
        
        return totals

    def _build_canonical_output(
        self,
        document: Document,
        data: Dict[str, Any],
        confidence: float,
    ) -> CanonicalOutput:
        entity_map = self._build_entity_map(data, confidence)
        sections = SemanticSectionBuilder.build(entity_map)
        metadata = Metadata(
            form_type_detected=document.document_type.value.upper(),
            line_of_business="Property",
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
        properties = data.get("properties") or []

        for idx, item in enumerate(properties):
            if not isinstance(item, dict):
                continue
            location_value = self._clean_dict(
                {
                    "location_number": item.get("location_number") or str(idx + 1),
                    "address": item.get("full_address") or item.get("address"),
                    "city": item.get("city"),
                    "state": item.get("state"),
                    "zip": item.get("zip"),
                    "square_feet": item.get("square_feet"),
                    "year_built": item.get("year_built"),
                    "construction": item.get("construction"),
                    "occupancy": item.get("occupancy"),
                    "building_value": item.get("building_value"),
                    "contents_value": item.get("contents_value"),
                    "business_income": item.get("business_income"),
                    "total_value": item.get("total_value"),
                }
            )
            if not location_value:
                continue
            entity_map.setdefault("Location", []).append(
                {
                    "value": location_value,
                    "confidence": confidence,
                    "tags": ["sov", "location"],
                    "source": item.get("_source"),
                }
            )

        totals = data.get("totals") or {}
        totals_map = {
            "total_insured_value": "TotalInsuredValue",
            "total_building_value": "BuildingLimit",
            "total_contents_value": "BPPLimit",
        }
        for raw_key, field_id in totals_map.items():
            value = totals.get(raw_key)
            if value in (None, "", []):
                continue
            entity_map.setdefault(field_id, []).append(
                {
                    "value": value,
                    "confidence": confidence,
                    "tags": ["sov", "totals"],
                }
            )

        return entity_map

    @staticmethod
    def _clean_dict(values: Dict[str, Any]) -> Dict[str, Any]:
        return {k: v for k, v in values.items() if v not in (None, "", [])}

    @staticmethod
    def _infer_file_type(document: Document) -> str:
        if document.file_extension:
            return document.file_extension.lstrip(".").lower()
        if document.mime_type and "/" in document.mime_type:
            return document.mime_type.split("/")[-1]
        return "pdf"
    
    def _extract_schedule_info(self, document: Document) -> Dict[str, Any]:
        """Extract schedule metadata from document."""
        schedule_info = {}
        
        if document.raw_text:
            text = document.raw_text
            
            # Extract insured name
            import re
            insured_match = re.search(
                r'(?:named\s+)?insured[:\s]+([^\n]+)',
                text,
                re.IGNORECASE
            )
            if insured_match:
                schedule_info['insured_name'] = insured_match.group(1).strip()
            
            # Extract policy number
            policy_match = re.search(
                r'policy.*(?:number|no|#)[:\s]+([A-Z0-9\-]+)',
                text,
                re.IGNORECASE
            )
            if policy_match:
                schedule_info['policy_number'] = policy_match.group(1).strip()
            
            # Extract effective date
            date_match = re.search(
                r'effective.*date[:\s]+([0-9/\-]+)',
                text,
                re.IGNORECASE
            )
            if date_match:
                schedule_info['effective_date'] = date_match.group(1).strip()
        
        return schedule_info
    
    def _calculate_confidence(
        self,
        properties: List[Dict[str, Any]],
        warnings: List[str]
    ) -> float:
        """Calculate extraction confidence."""
        if not properties:
            return 0.0
        
        # Base confidence
        confidence = 0.7
        
        # Bonus for multiple properties
        if len(properties) >= 3:
            confidence += 0.1
        
        # Bonus for complete data
        complete_properties = sum(
            1 for prop in properties
            if all(prop.get(field) for field in ['address', 'building_value', 'contents_value'])
        )
        completeness_ratio = complete_properties / len(properties)
        confidence += completeness_ratio * 0.15
        
        # Penalty for warnings
        confidence -= len(warnings) * 0.05
        
        return max(0.0, min(1.0, confidence))
    
    def __repr__(self) -> str:
        return "SovExtractor()"
