from extraction.classifiers.filename_classifier import FilenameClassifier
from extraction.classifiers.keyword_classifier import KeywordClassifier
from extraction.classifiers.table_classifier import TableClassifier
from extraction.core.document import Document, DocumentType, TableData


def test_filename_classifier_recognizes_common_financial_statement_names():
    document = Document(
        file_path="/tmp/2025_profit_and_loss.xlsx",
        file_name="2025_profit_and_loss.xlsx",
        file_extension=".xlsx",
    )

    doc_type, confidence = FilenameClassifier().classify(document)

    assert doc_type == DocumentType.FINANCIAL_STATEMENT
    assert confidence == 1.0


def test_keyword_classifier_recognizes_pl_and_cash_flow_statements():
    pl_document = Document(
        file_path="/tmp/pl.pdf",
        file_name="pl.pdf",
        file_extension=".pdf",
        mime_type="application/pdf",
    )
    pl_document.raw_text = "Profit and Loss Statement Revenue Expenses Net Income Fiscal Year 2025"

    cash_flow_document = Document(
        file_path="/tmp/cash_flow.pdf",
        file_name="cash_flow.pdf",
        file_extension=".pdf",
        mime_type="application/pdf",
    )
    cash_flow_document.raw_text = "Cash Flow Statement Operating Activities Investing Activities Financing Activities"

    assert KeywordClassifier().classify(pl_document)[0] == DocumentType.FINANCIAL_STATEMENT
    assert KeywordClassifier().classify(cash_flow_document)[0] == DocumentType.FINANCIAL_STATEMENT


def test_table_classifier_recognizes_financial_year_columns():
    document = Document(
        file_path="/tmp/financials.xlsx",
        file_name="financials.xlsx",
        file_extension=".xlsx",
    )
    document.tables = [
        TableData(
            headers=["Description", "2025", "2024"],
            rows=[
                ["Revenue", "1250000", "1100000"],
                ["Operating Expenses", "800000", "720000"],
                ["Net Income", "450000", "380000"],
            ],
            metadata={"row_count": 3},
        )
    ]

    doc_type, confidence = TableClassifier().classify(document)

    assert doc_type == DocumentType.FINANCIAL_STATEMENT
    assert confidence >= 0.6
