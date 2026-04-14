"""
PDF field parser implementation using pypdf.
"""

import os
from typing import Dict, Any, Optional
from pypdf import PdfReader
from ..interfaces.parser import IParser


class PdfFieldParser(IParser):
    """
    Parser for extracting form fields from fillable PDFs.
    
    Uses pypdf to read PDF form field names and values.
    Returns raw field data without any transformation.
    """
    
    def extract_fields(self, pdf_path: str) -> Dict[str, Any]:
        """
        Extract raw field names and values from PDF.
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            Dictionary of PDF field names to values
            Example: {
                "NamedInsured_FullName_A": "ABC Corp",
                "GeneralLiability_EachOccurrence_LimitAmount_A": "1000000",
                "GeneralLiability_OccurrenceIndicator_A": "/Yes"
            }
            
        Raises:
            FileNotFoundError: If PDF file doesn't exist
            ValueError: If PDF is not readable or has no fields
        """
        # Validate file exists
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")
        
        try:
            # Open PDF
            reader = PdfReader(pdf_path)
            
            # Get form fields
            fields = reader.get_fields()
            
            if not fields:
                raise ValueError(f"PDF has no form fields: {pdf_path}")
            
            # Extract field values
            result = {}
            for field_name, field_obj in fields.items():
                value = self._extract_field_value(field_obj)
                if value is not None:
                    result[field_name] = value
            
            return result
            
        except Exception as e:
            if isinstance(e, (FileNotFoundError, ValueError)):
                raise
            raise ValueError(f"Error reading PDF: {str(e)}")

    def extract_field_metadata(self, pdf_path: str) -> Dict[str, Dict[str, Any]]:
        """
        Extract fillable field values plus source coordinates when available.

        Returns:
            {
                "NamedInsured_FullName_A": {
                    "value": "ABC Corp",
                    "page": 1,
                    "bbox": [x0, y0, x1, y1],
                }
            }
        """
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"PDF file not found: {pdf_path}")

        try:
            reader = PdfReader(pdf_path)
            fields = reader.get_fields()
            if not fields:
                raise ValueError(f"PDF has no form fields: {pdf_path}")

            locations = self._extract_widget_locations(reader)
            result: Dict[str, Dict[str, Any]] = {}
            for field_name, field_obj in fields.items():
                value = self._extract_field_value(field_obj)
                if value is None:
                    continue

                metadata: Dict[str, Any] = {"value": value}
                location = self._find_widget_location(field_name, locations)
                if location:
                    metadata.update(location)
                result[field_name] = metadata

            return result
        except Exception as e:
            if isinstance(e, (FileNotFoundError, ValueError)):
                raise
            raise ValueError(f"Error reading PDF metadata: {str(e)}")
    
    def is_fillable(self, pdf_path: str) -> bool:
        """
        Check if PDF has fillable form fields.
        
        Args:
            pdf_path: Path to PDF file
            
        Returns:
            True if PDF has form fields, False otherwise
        """
        if not os.path.exists(pdf_path):
            return False
        
        try:
            reader = PdfReader(pdf_path)
            fields = reader.get_fields()
            return fields is not None and len(fields) > 0
        except Exception:
            return False
    
    def _extract_field_value(self, field_obj: Any) -> Optional[Any]:
        """
        Extract value from field object.
        
        Handles different field types:
        - Text fields: return string value
        - Checkboxes: return checkbox state
        - Buttons: return button value
        
        Args:
            field_obj: pypdf field object
            
        Returns:
            Field value or None if no value
        """
        if field_obj is None:
            return None
        
        # Get field value
        value = field_obj.get('/V')
        
        if value is None:
            return None
        
        # Handle different value types
        if hasattr(value, 'get_object'):
            # Name object (e.g., checkbox)
            value = value.get_object()
        
        # Convert to string if it's a name
        if isinstance(value, str):
            return value
        elif hasattr(value, '__str__'):
            return str(value)
        
        return value

    def _extract_widget_locations(self, reader: PdfReader) -> Dict[str, Dict[str, Any]]:
        locations: Dict[str, Dict[str, Any]] = {}

        for page_index, page in enumerate(reader.pages):
            annotations = page.get("/Annots") or []
            for annotation_ref in annotations:
                try:
                    annotation = annotation_ref.get_object()
                except Exception:
                    continue

                field_name = self._resolve_annotation_field_name(annotation)
                if not field_name:
                    continue

                rect = annotation.get("/Rect")
                bbox = self._normalize_rect(rect)
                if not bbox:
                    continue

                locations[field_name] = {
                    "page": page_index + 1,
                    "bbox": bbox,
                }

        return locations

    def _resolve_annotation_field_name(self, annotation: Any) -> Optional[str]:
        current = annotation
        parts = []
        seen = set()

        while current is not None:
            marker = id(current)
            if marker in seen:
                break
            seen.add(marker)

            name = current.get("/T") if hasattr(current, "get") else None
            if name:
                parts.append(str(name))

            parent = current.get("/Parent") if hasattr(current, "get") else None
            if not parent:
                break
            try:
                current = parent.get_object()
            except Exception:
                break

        if not parts:
            return None
        return ".".join(reversed(parts))

    def _find_widget_location(
        self,
        field_name: str,
        locations: Dict[str, Dict[str, Any]],
    ) -> Optional[Dict[str, Any]]:
        if field_name in locations:
            return locations[field_name]

        candidates = [
            field_name.lstrip("/"),
            field_name.replace("/", ".").strip("."),
        ]
        for candidate in candidates:
            if candidate in locations:
                return locations[candidate]

        normalized_name = self._normalize_field_key(field_name)
        normalized_matches = [
            location
            for key, location in locations.items()
            if self._normalize_field_key(key) == normalized_name
        ]
        if len(normalized_matches) == 1:
            return normalized_matches[0]

        field_tail = field_name.split(".")[-1].lstrip("/")
        tail_matches = [
            location
            for key, location in locations.items()
            if key.split(".")[-1].lstrip("/") == field_tail
        ]
        if len(tail_matches) == 1:
            return tail_matches[0]

        return None

    def _normalize_field_key(self, field_name: str) -> str:
        return "".join(char.lower() for char in field_name.lstrip("/") if char.isalnum())

    def _normalize_rect(self, rect: Any) -> Optional[list[float]]:
        if not rect or len(rect) != 4:
            return None
        try:
            x0, y0, x1, y1 = [float(value) for value in rect]
        except (TypeError, ValueError):
            return None

        left, right = sorted([x0, x1])
        bottom, top = sorted([y0, y1])
        return [left, bottom, right, top]
