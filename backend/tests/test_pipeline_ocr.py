from extraction.core.document import Document
from extraction.pipeline import ExtractionPipeline


class StubOcrPipeline(ExtractionPipeline):
    def __init__(self):
        super().__init__(use_classification=False, enable_ocr_enrichment=True)

    def _perform_ocr(self, file_path: str):
        return {
            "text": "ACORD 125 commercial insurance named insured",
            "confidence": 88.4,
            "page_count": 1,
            "language": "eng",
            "warnings": [],
        }


def test_pipeline_enriches_document_with_ocr_when_required():
    pipeline = StubOcrPipeline()
    document = Document(file_path="/tmp/scan.pdf", file_name="scan.pdf")
    document.metadata["requires_ocr"] = True
    document.raw_text = ""

    enriched = pipeline._maybe_enrich_with_ocr(document)

    assert enriched.raw_text == "ACORD 125 commercial insurance named insured"
    assert enriched.metadata["ocr_applied"] is True
    assert enriched.metadata["requires_ocr"] is False
    assert enriched.metadata["ocr_confidence"] == 88.4


def test_pipeline_skips_ocr_when_document_already_has_text():
    pipeline = StubOcrPipeline()
    document = Document(file_path="/tmp/text.pdf", file_name="text.pdf")
    document.metadata["requires_ocr"] = True
    document.raw_text = "already enough extracted text to skip OCR"

    enriched = pipeline._maybe_enrich_with_ocr(document)

    assert enriched.raw_text == "already enough extracted text to skip OCR"
    assert "ocr_applied" not in enriched.metadata
