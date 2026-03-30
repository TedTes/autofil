from extraction.core.document import Document, DocumentType
from extraction.core.schema import (
    CanonicalOutput,
    EntityValue,
    Metadata,
    SemanticField,
    SemanticSection,
    SourceInfo,
)
from extraction.models.extraction_result import ExtractionResult
from extraction.pipeline import ExtractionPipeline
def _canonical(*, include_fields: bool = True) -> CanonicalOutput:
    sections = []
    if include_fields:
        sections = [
            SemanticSection(
                key="applicant",
                fields=[
                    SemanticField(
                        id="InsuredName",
                        values=[EntityValue(value="Acme LLC", confidence=0.92)],
                    )
                ],
            )
        ]

    return CanonicalOutput(
        job_id="job-1",
        source=SourceInfo(
            file_name="sample.pdf",
            file_type="pdf",
            extraction_method="fillable_pdf",
        ),
        semantic_sections=sections,
        metadata=Metadata(form_type_detected="ACORD_125"),
        raw={},
    )


def test_pipeline_validate_result_marks_canonical_as_validated():
    pipeline = ExtractionPipeline(use_classification=False)
    document = Document(file_path="/tmp/sample.pdf", file_name="sample.pdf")
    document.set_document_type(DocumentType.ACORD_125, 1.0)
    result = ExtractionResult(success=True, data=_canonical().to_dict(), confidence=0.92)

    validated = pipeline._validate_result(result, document)

    assert validated.success is True
    assert validated.metadata["canonical_validated"] is True
    assert validated.metadata["validation_stage"] == "pipeline"


def test_pipeline_validate_result_converts_validation_failure_to_error_result():
    pipeline = ExtractionPipeline(use_classification=False)
    document = Document(file_path="/tmp/sample.pdf", file_name="sample.pdf")
    document.set_document_type(DocumentType.ACORD_125, 1.0)
    result = ExtractionResult(success=True, data=_canonical(include_fields=False).to_dict(), confidence=0.2)

    validated = pipeline._validate_result(result, document)

    assert validated.success is False
    assert validated.metadata["canonical_validated"] is False
    assert any("Validation failed:" in error for error in validated.errors)
