from extraction.core.document import Document, DocumentType
from extraction.extractors.acord_140_extractor import ACORD140Extractor


def test_acord_140_fillable_fields_preserve_pdf_source_metadata():
    document = Document(
        file_path="/tmp/acord_140_test_filled.pdf",
        file_name="acord_140_test_filled.pdf",
        file_extension=".pdf",
    )
    document.set_document_type(DocumentType.ACORD_140)
    extractor = ACORD140Extractor()

    result = extractor._extract_from_fillable(
        document,
        raw_fields={"Named Insured": "Redwood Custom Builders LLC"},
        field_metadata={
            "Named Insured": {
                "value": "Redwood Custom Builders LLC",
                "page": 1,
                "bbox": [72.0, 612.0, 300.0, 624.0],
            }
        },
        template_config=None,
        locations=[],
    )

    assert result.success is True
    field_values = result.data["semantic_sections"][0]["fields"][0]["values"]
    assert field_values[0]["value"] == "Redwood Custom Builders LLC"
    assert field_values[0]["source"]["page"] == 1
    assert field_values[0]["source"]["bbox"] == [72.0, 612.0, 300.0, 624.0]
    assert field_values[0]["source"]["extraction_rule"] == "pdf_field_alias"
    assert field_values[0]["tags"] == ["fillable_pdf", "alias"]
