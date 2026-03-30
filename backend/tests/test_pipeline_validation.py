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


def test_pipeline_metadata_includes_low_confidence_and_extraction_observability():
    pipeline = ExtractionPipeline(use_classification=False)
    document = Document(file_path="/tmp/sample.pdf", file_name="sample.pdf")
    document.set_document_type(DocumentType.ACORD_125, 1.0)
    result = ExtractionResult(
        success=True,
        data=_canonical().to_dict(),
        confidence=0.92,
        field_confidence={"InsuredName": 0.65},
        warnings=["validation warning"],
    )

    enriched = pipeline._add_pipeline_metadata(result, document)

    assert enriched.metadata["low_confidence_field_count"] == 1
    assert enriched.metadata["low_confidence_fields"] == [
        {"field_id": "InsuredName", "confidence": 0.65}
    ]
    assert enriched.metadata["validation_warning_count"] == 1
    assert enriched.metadata["extraction_method"] == "fillable_pdf"


def test_pipeline_classification_trace_marks_ambiguous_docs_for_review():
    class _FakeClassifier:
        def can_classify(self, document):
            return True

        def classify_detailed(self, document):
            return {
                "document_type": "loss_run",
                "confidence": 0.62,
                "strategy": "highest_confidence",
                "classifier_results": [
                    {"classifier": "A", "priority": 10, "document_type": "loss_run", "confidence": 0.62},
                    {"classifier": "B", "priority": 20, "document_type": "sov", "confidence": 0.6},
                ],
                "classifier_errors": [],
                "candidate_types": [
                    {"document_type": "loss_run", "votes": 1, "avg_confidence": 0.62, "max_confidence": 0.62, "classifiers": ["A"]},
                    {"document_type": "sov", "votes": 1, "avg_confidence": 0.6, "max_confidence": 0.6, "classifiers": ["B"]},
                ],
                "indicators": [],
                "conflict_detected": True,
                "review_required": True,
            }

    pipeline = ExtractionPipeline(use_classification=False, min_classification_confidence=0.6)
    pipeline.classifier = _FakeClassifier()
    document = Document(file_path="/tmp/sample.pdf", file_name="sample.pdf")

    classified = pipeline._classify_document(document)

    assert classified.document_type == DocumentType.LOSS_RUN
    assert classified.metadata["classification"]["review_required"] is True
    assert classified.metadata["classification"]["conflict_detected"] is True
    assert classified.metadata["classification_training_record"]["status"] == "pending_review"
