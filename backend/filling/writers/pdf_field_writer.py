"""Low-level PDF form writing primitives backed by ``pypdf``."""

from __future__ import annotations

from typing import Any, Optional
from pypdf import PdfReader, PdfWriter
from pypdf.generic import (
    NameObject,
    DictionaryObject,
    BooleanObject,
    TextStringObject,
)
from ..interfaces.writer import IPdfWriter


class PdfFieldWriter(IPdfWriter):
    """
    Low-level PDF field writing operations.
    
    Handles:
    - Writing values to PDF form fields
    - Setting up AcroForm structure
    - PDF flattening
    - Viewer compatibility flags
    """
    
    def write_field(self, writer: PdfWriter, field_name: str, value: Any) -> bool:
        """
        Write value to PDF field across all pages.
        
        Args:
            writer: PdfWriter instance
            field_name: PDF field name
            value: Value to write
            
        Returns:
            True if write was successful, False otherwise
        """
        normalized_name = self._normalize_field_name(field_name)

        if isinstance(value, bool):
            return self._write_checkbox_field(writer, normalized_name, value)

        updated = False

        for page in writer.pages:
            try:
                annotations = page.get("/Annots") or []
                page_updated = False
                for annotation_ref in annotations:
                    annotation = annotation_ref.get_object()
                    if self._annotation_name(annotation) != normalized_name:
                        continue

                    writer.update_page_form_field_values(
                        page,
                        {normalized_name: "" if value is None else str(value)},
                    )
                    page_updated = True
                    updated = True

                if page_updated:
                    continue
            except Exception as e:
                print(f"Error updating field {field_name}: {e}")
                break

        return updated

    def has_field(self, writer: PdfWriter, field_name: str) -> bool:
        normalized_name = self._normalize_field_name(field_name)
        return self._find_annotation(writer, normalized_name) is not None

    def setup_acro_form(self, reader: PdfReader, writer: PdfWriter) -> None:
        """
        Set up AcroForm in writer from reader.
        
        Copies form structure and ensures fields are accessible.
        
        Args:
            reader: Source PdfReader
            writer: Target PdfWriter
        """
        try:
            if "/AcroForm" in reader.trailer["/Root"]:
                acro_form = reader.trailer["/Root"]["/AcroForm"]
                writer._root_object[NameObject("/AcroForm")] = acro_form.clone(writer)
                
                # Ensure fields are accessible
                if "/Fields" not in writer._root_object["/AcroForm"]:
                    writer._root_object["/AcroForm"][NameObject("/Fields")] = acro_form.get("/Fields", [])
        except Exception as e:
            print(f"Error setting up /AcroForm: {e}")
            raise

    def set_need_appearances(self, writer: PdfWriter) -> None:
        """
        Set NeedAppearances flag for PDF viewer compatibility.
        
        Asks viewer to regenerate field appearances.
        Helps when not explicitly flattened.
        
        Args:
            writer: PdfWriter instance
        """
        try:
            catalog = writer._root_object
            if "/AcroForm" not in catalog:
                catalog[NameObject("/AcroForm")] = DictionaryObject()
            catalog["/AcroForm"].update({
                NameObject("/NeedAppearances"): BooleanObject(True)
            })
        except Exception as e:
            print(f"Warning: Failed to set NeedAppearances: {e}")

    def flatten_pdf(self, writer: PdfWriter) -> bool:
        """
        Flatten PDF form fields.
        
        Makes fields non-editable and ensures consistent rendering.
        
        Args:
            writer: PdfWriter instance
            
        Returns:
            True if flattening succeeded, False otherwise
        """
        try:
            writer._flatten()
            return True
        except AttributeError:
            print("Warning: Flattening not supported. Output may require viewer regeneration.")
            return False

    def get_checkbox_on_value(self, writer: PdfWriter, field_name: str) -> Optional[str]:
        """
        Get the "on" value for a checkbox field.
        
        Different PDFs use different values for checked state:
        - "/Yes", "/On", "/1", etc.
        
        This method inspects the PDF to find the correct value.
        
        Args:
            writer: PdfWriter instance
            field_name: PDF checkbox field name
            
        Returns:
            Checkbox "on" value (e.g., "/Yes")
        """
        annotation = self._find_annotation(writer, self._normalize_field_name(field_name))
        if not annotation:
            return None

        ap = annotation.get("/AP")
        if not ap:
            return None

        normal_appearance = ap.get("/N")
        if not normal_appearance:
            return None

        keys = [str(key) for key in normal_appearance.keys()]
        for key in keys:
            if key != "/Off":
                return key
        return None

    def _write_checkbox_field(self, writer: PdfWriter, field_name: str, value: bool) -> bool:
        annotation = self._find_annotation(writer, field_name)
        if not annotation:
            return False

        on_value = self.get_checkbox_on_value(writer, field_name) or "/Yes"
        state = NameObject(on_value if value else "/Off")
        annotation[NameObject("/V")] = state
        annotation[NameObject("/AS")] = state
        return True

    def _find_annotation(self, writer: PdfWriter, field_name: str):
        for page in writer.pages:
            annotations = page.get("/Annots") or []
            for annotation_ref in annotations:
                annotation = annotation_ref.get_object()
                if self._annotation_name(annotation) == field_name:
                    return annotation
        return None

    @staticmethod
    def _normalize_field_name(field_name: str) -> str:
        return str(field_name or "").strip().lstrip("/")

    def _annotation_name(self, annotation) -> Optional[str]:
        raw_name = annotation.get("/T")
        if raw_name is None:
            return None
        if isinstance(raw_name, TextStringObject):
            return str(raw_name).strip().lstrip("/")
        return str(raw_name).strip().strip("()").lstrip("/")
