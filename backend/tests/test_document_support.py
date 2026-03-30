from extraction.core.document import DocumentType
from extraction.support import assess_document_support


def test_supported_acord_document_can_extract():
    support = assess_document_support(
        DocumentType.ACORD_140,
        confidence=0.94,
        raw_text="ACORD 140 property section building value contents value",
        file_name="Acord-140.pdf",
    )

    assert support["is_supported"] is True
    assert support["is_insurance_relevant"] is True
    assert support["should_block_extraction"] is False
    assert support["recommended_action"] == "extract"


def test_supported_low_confidence_document_requires_review():
    support = assess_document_support(
        DocumentType.ACORD_126,
        confidence=0.61,
        raw_text="ACORD 126 commercial general liability each occurrence",
        file_name="low-confidence.pdf",
    )

    assert support["is_supported"] is True
    assert support["needs_review"] is True
    assert support["should_block_extraction"] is False
    assert support["recommended_action"] == "review_then_extract"


def test_unknown_but_insurance_related_document_is_blocked_for_manual_review():
    support = assess_document_support(
        DocumentType.UNKNOWN,
        confidence=0.0,
        raw_text="insurance policy coverage premium insured carrier underwriting supplement",
        file_name="XL_CONSTRUCTION_LLC_Supplements.pdf",
    )

    assert support["is_supported"] is False
    assert support["is_insurance_relevant"] is True
    assert support["should_block_extraction"] is True
    assert support["recommended_action"] == "manual_review"


def test_non_insurance_document_is_rejected():
    support = assess_document_support(
        DocumentType.UNKNOWN,
        confidence=0.0,
        raw_text="meeting notes roadmap engineering sprint retrospective",
        file_name="notes.pdf",
    )

    assert support["is_supported"] is False
    assert support["is_insurance_relevant"] is False
    assert support["should_block_extraction"] is True
    assert support["recommended_action"] == "reject"
