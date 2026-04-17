from extraction.classifiers.keyword_classifier import KeywordClassifier
from extraction.classifiers.filename_classifier import FilenameClassifier
from extraction.classifiers.table_classifier import TableClassifier
from extraction.classifiers.registry import classifier_registry
from extraction.core.document import Document, DocumentType, TableData
from extraction.interfaces.classifier import CompositeClassifier, IClassifier
import pytest


@pytest.fixture(autouse=True)
def clear_filename_classifier_cache():
    FilenameClassifier._template_filename_hints.cache_clear()
    yield
    FilenameClassifier._template_filename_hints.cache_clear()


def stub_template_ids(monkeypatch, template_ids):
    monkeypatch.setattr(
        FilenameClassifier,
        "_list_template_ids",
        staticmethod(lambda: list(template_ids)),
    )
    FilenameClassifier._template_filename_hints.cache_clear()


class _LowPriorityClassifier(IClassifier):
    def classify(self, document):
        return DocumentType.SOV, 0.7

    def get_indicators(self, document):
        return []

    def can_classify(self, document):
        return True

    def get_supported_types(self):
        return [DocumentType.SOV]

    def get_priority(self):
        return 50


class _HighPriorityClassifier(IClassifier):
    def classify(self, document):
        return DocumentType.LOSS_RUN, 0.8

    def get_indicators(self, document):
        return []

    def can_classify(self, document):
        return True

    def get_supported_types(self):
        return [DocumentType.LOSS_RUN]

    def get_priority(self):
        return 10


class _FailingClassifier(IClassifier):
    def classify(self, document):
        raise RuntimeError("boom")

    def get_indicators(self, document):
        raise RuntimeError("indicator boom")

    def can_classify(self, document):
        return True

    def get_supported_types(self):
        return [DocumentType.UNKNOWN]

    def get_priority(self):
        return 5


def test_keyword_classifier_requires_all_required_patterns():
    document = Document(file_path="/tmp/doc.pdf", file_name="doc.pdf", file_extension=".pdf")
    document.raw_text = "ACORD 126 application with named insured and each occurrence."

    classifier = KeywordClassifier(min_confidence=0.1)
    doc_type, confidence = classifier.classify(document)

    assert doc_type == DocumentType.UNKNOWN
    assert confidence == 0.0


def test_keyword_classifier_respects_min_confidence():
    document = Document(file_path="/tmp/doc.pdf", file_name="doc.pdf", file_extension=".pdf")
    document.raw_text = (
        "ACORD 140 property section with business income and building value"
    )

    classifier = KeywordClassifier(min_confidence=0.95)
    doc_type, confidence = classifier.classify(document)

    assert doc_type == DocumentType.UNKNOWN
    assert confidence == 0.0


def test_filename_classifier_detects_acord_form_number_when_text_is_ambiguous(monkeypatch):
    stub_template_ids(monkeypatch, ["acord_140_2016_03"])
    document = Document(
        file_path="/tmp/acord_140_test_filled.pdf",
        file_name="acord_140_test_filled.pdf",
        file_extension=".pdf",
        mime_type="application/pdf",
    )
    document.raw_text = "ACORD 101 additional remarks schedule"

    classifier = FilenameClassifier()
    doc_type, confidence = classifier.classify(document)

    assert doc_type == DocumentType.ACORD_140
    assert confidence == 1.0
    assert document.metadata["candidate_template_ids"] == ["acord_140_2016_03"]


def test_filename_classifier_sets_exact_template_hint_for_versioned_name(monkeypatch):
    stub_template_ids(monkeypatch, ["acord_125_2016_03", "acord_125_2019_11"])
    document = Document(
        file_path="/tmp/acord_125_2016_03_test_filled.pdf",
        file_name="acord_125_2016_03_test_filled.pdf",
        file_extension=".pdf",
        mime_type="application/pdf",
    )

    classifier = FilenameClassifier()
    doc_type, confidence = classifier.classify(document)

    assert doc_type == DocumentType.ACORD_125
    assert confidence == 1.0
    assert document.metadata["form_type_hint"] == "ACORD_125"
    assert document.metadata["template_id_hint"] == "acord_125_2016_03"
    assert document.metadata["version_hint"] == "2016_03"


def test_default_classifier_registry_includes_filename_hints(monkeypatch):
    stub_template_ids(monkeypatch, ["acord_28_2016_03"])
    composite = classifier_registry.create_composite(["mime", "filename", "keyword"])
    document = Document(
        file_path="/tmp/acord_28_test_filled.pdf",
        file_name="acord_28_test_filled.pdf",
        file_extension=".pdf",
        mime_type="application/pdf",
    )
    document.raw_text = (
        "ACORD 101 additional remarks schedule applicant agency policy number "
        "effective date page 1 of 1"
    )

    doc_type, confidence = composite.classify(document)

    assert doc_type == DocumentType.ACORD_28
    assert confidence == 1.0


def test_table_classifier_requires_all_required_columns():
    document = Document(file_path="/tmp/sheet.csv", file_name="sheet.csv", file_extension=".csv")
    document.add_table(
        TableData(
            headers=["Location", "Address", "Occupancy"],
            rows=[["1", "123 Main", "Office"]],
            metadata={"row_count": 1},
        )
    )

    classifier = TableClassifier(min_confidence=0.1)
    doc_type, confidence = classifier.classify(document)

    assert doc_type == DocumentType.UNKNOWN
    assert confidence == 0.0


def test_composite_classifier_sorts_by_priority_and_records_failures():
    document = Document(file_path="/tmp/doc.pdf", file_name="doc.pdf", file_extension=".pdf")
    composite = CompositeClassifier(
        [_LowPriorityClassifier(), _HighPriorityClassifier(), _FailingClassifier()]
    )

    doc_type, confidence = composite.classify(document)

    assert composite.classifiers[0].get_priority() == 5
    assert composite.classifiers[1].get_priority() == 10
    assert doc_type == DocumentType.LOSS_RUN
    assert confidence == 0.8
    assert composite.last_errors == [
        {"classifier": "_FailingClassifier", "error": "boom"}
    ]


def test_composite_classifier_exposes_detailed_trace_and_conflicts():
    document = Document(file_path="/tmp/doc.pdf", file_name="doc.pdf", file_extension=".pdf")
    composite = CompositeClassifier(
        [_LowPriorityClassifier(), _HighPriorityClassifier()],
        strategy="voting",
    )

    details = composite.classify_detailed(document)

    assert details["document_type"] in {DocumentType.LOSS_RUN.value, DocumentType.SOV.value}
    assert len(details["classifier_results"]) == 2
    assert len(details["candidate_types"]) == 2
    assert details["conflict_detected"] is True
    assert details["review_required"] is True
