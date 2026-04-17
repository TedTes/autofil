from extraction.extractors.acord_126_extractor import ACORD126Extractor


def test_acord_126_money_cleaner_skips_malformed_ocr_numbers():
    extractor = ACORD126Extractor()

    assert extractor._clean_value("ProductsCompletedOpsLimit", "2.1.19932016..126201609") is None


def test_acord_126_money_cleaner_keeps_valid_currency_values():
    extractor = ACORD126Extractor()

    assert extractor._clean_value("ProductsCompletedOpsLimit", "$2,000,000") == 2000000.0


def test_acord_126_ocr_safe_fields_excludes_numeric_and_boolean_fields():
    extractor = ACORD126Extractor()

    safe_fields = extractor._ocr_safe_field_ids(
        {
            "GrossSales",
            "NumberOfEmployees",
            "CoverageOccurrenceIndicator",
            "ProducerName",
            "EffectiveDate",
        }
    )

    assert "GrossSales" not in safe_fields
    assert "NumberOfEmployees" not in safe_fields
    assert "CoverageOccurrenceIndicator" not in safe_fields
    assert "ProducerName" in safe_fields
    assert "EffectiveDate" in safe_fields
