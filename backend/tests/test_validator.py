from extraction.core.schema import (
    CanonicalOutput,
    EntityValue,
    Metadata,
    SemanticField,
    SemanticSection,
    SourceInfo,
)
from extraction.validation.validator import ExtractionValidationError, validate


def _build_output(*, form_type: str | None = "ACORD_125", confidence: float = 0.92):
    return CanonicalOutput(
        job_id="job-1",
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
                        values=[EntityValue(value="Acme LLC", confidence=confidence)],
                    )
                ],
            )
        ],
        metadata=Metadata(
            form_type_detected=form_type,
            line_of_business="Property",
        ),
        raw={},
    )


def test_validate_returns_output_and_preserves_data():
    output = _build_output()

    validated = validate(output)

    assert validated is output
    assert validated.semantic_sections[0].fields[0].id == "InsuredName"


def test_validate_attaches_warnings_to_raw():
    output = _build_output(confidence=0.5)

    validated = validate(output)

    warnings = validated.raw.get("validation_warnings", [])
    assert warnings
    assert any("Low confidence" in warning for warning in warnings)


def test_validate_raises_for_missing_form_type():
    output = _build_output(form_type=None)

    try:
        validate(output)
    except ExtractionValidationError as exc:
        assert "metadata.form_type_detected is missing" in str(exc)
    else:
        raise AssertionError("Expected ExtractionValidationError for missing form type")


def test_validate_raises_for_empty_entities():
    output = CanonicalOutput(
        job_id="job-2",
        source=SourceInfo(
            file_name="empty.pdf",
            file_type="pdf",
            extraction_method="fillable_pdf",
        ),
        semantic_sections=[],
        metadata=Metadata(form_type_detected="ACORD_125"),
        raw={},
    )

    try:
        validate(output)
    except ExtractionValidationError as exc:
        assert "No entities extracted" in str(exc)
    else:
        raise AssertionError("Expected ExtractionValidationError for empty entities")
