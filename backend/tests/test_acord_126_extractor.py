from extraction.core.document import Document, DocumentType
from extraction.extractors.acord_126_extractor import ACORD126Extractor


def test_acord_126_extractor_uses_text_layer_for_scanned_forms():
    extractor = ACORD126Extractor()
    extractor.pdf_parser.is_fillable = lambda _path: False

    document = Document(file_path="/tmp/scan.pdf", file_name="scan.pdf")
    document.set_document_type(DocumentType.ACORD_126, 1.0)
    document.raw_text = (
        "=== Page 2 ===\n"
        "Named Insured: ACME Contracting LLC\n"
        "Each Occurrence: $1000000\n"
        "General Aggregate: $2000000\n"
    )

    result = extractor.extract(document)

    assert result.success is True
    assert result.data["source"]["extraction_method"] == "ocr_text_alias"
    assert "InsuredName" in result.field_confidence
    assert result.metadata["field_provenance"]["InsuredName"][0]["page"] == 2
