from extraction.classifiers.keyword_classifier import KeywordClassifier
from extraction.classifiers.table_classifier import TableClassifier
from extraction.core.document import Document, DocumentType, TableData
from extraction.interfaces.classifier import CompositeClassifier, IClassifier


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
