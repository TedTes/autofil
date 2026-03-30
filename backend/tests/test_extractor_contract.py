from extraction.core.document import Document
from extraction.core.schema import (
    CanonicalOutput,
    EntityValue,
    Metadata,
    SemanticField,
    SemanticSection,
    SourceInfo,
)
from extraction.extractors.factory import ExtractorFactory


def test_normalize_result_populates_field_confidence_and_provenance():
    canonical = CanonicalOutput(
        job_id="job-123",
        source=SourceInfo(
            file_name="sample.pdf",
            file_type="pdf",
            extraction_method="fillable_pdf",
        ),
        semantic_sections=[
            SemanticSection(
                key="applicant",
                fields=[
                    SemanticField(
                        id="InsuredName",
                        values=[
                            EntityValue(
                                value="Acme LLC",
                                confidence=0.91,
                                source={"page": 1, "extraction_rule": "pdf_field"},
                                tags=["fillable_pdf"],
                            )
                        ],
                    )
                ],
            )
        ],
        metadata=Metadata(form_type_detected="ACORD_125"),
        raw={},
    )

    document = Document(file_path="/tmp/sample.pdf", file_name="sample.pdf")
    result = ExtractorFactory._normalize_result(canonical, document)

    assert result.success is True
    assert result.field_confidence["InsuredName"] == 0.91
    assert result.metadata["field_provenance"]["InsuredName"][0]["page"] == 1
