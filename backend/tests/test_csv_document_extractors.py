from extraction.core.document import Document, DocumentType
from extraction.extractors.financial_statement_extractor import FinancialStatementExtractor
from extraction.extractors.sov_extractor import SovExtractor


def test_sov_extractor_reads_csv_without_excel_parser(tmp_path):
    csv_path = tmp_path / "statement_of_values.csv"
    csv_path.write_text(
        "\n".join(
            [
                "Location,Address,City,State,Zip,Building Value,Contents Value,Total Insured Value",
                "1,100 Market Street,San Francisco,CA,94105,1850000,450000,2300000",
            ]
        ),
        encoding="utf-8",
    )
    document = Document(str(csv_path), csv_path.name, file_extension=".csv")
    document.document_type = DocumentType.SOV

    result = SovExtractor().extract(document)

    assert result.success
    assert result.data["raw"]["property_count"] == 1
    assert result.data["raw"]["totals"]["total_insured_value"] == 2300000.0


def test_financial_statement_extractor_reads_csv_without_excel_parser(tmp_path):
    csv_path = tmp_path / "2025_profit_and_loss.csv"
    csv_path.write_text(
        "\n".join(
            [
                "Description,2025,2024",
                "Revenue,1250000,1100000",
                "Operating Expenses,800000,720000",
                "Net Income,450000,380000",
            ]
        ),
        encoding="utf-8",
    )
    document = Document(str(csv_path), csv_path.name, file_extension=".csv")
    document.document_type = DocumentType.FINANCIAL_STATEMENT

    result = FinancialStatementExtractor().extract(document)

    assert result.success
    assert result.data["raw"]["statement_type"] == "income_statement"
    assert result.data["raw"]["totals"]["revenue_total"] == 1250000.0
    assert result.data["raw"]["totals"]["net_income"] == 450000.0
