from extraction.extractors.acord_template_extractor import ACORD27Extractor


def test_template_extractor_skips_fillable_fields_without_matching_template():
    extractor = ACORD27Extractor()
    entities = {}

    extractor._extract_from_pdf_fields(
        raw_fields={
            "Producer Name": "Wrongly mapped producer",
            "Policy Number": "POL-1",
            "Named Insured": "Acme LLC",
        },
        entities=entities,
        template=None,
        field_metadata={},
    )

    assert entities == {}
