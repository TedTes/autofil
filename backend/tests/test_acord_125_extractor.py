from extraction.extractors.acord_125_extractor import ACORD125Extractor
from utils.versioned_template_loader import TemplateConfig


def test_acord_125_pdf_source_ref_does_not_use_field_name_as_text_index():
    extractor = ACORD125Extractor()
    entities = {}

    extractor._extract_from_pdf_fields(
        raw_fields={"Form_EditionIdentifier_A": "2016/03"},
        entities=entities,
        confidence=0.98,
        template_config=None,
    )

    assert entities["FormEdition"][0].source.text_block_index is None


def test_acord_125_uses_template_as_authority_when_available():
    extractor = ACORD125Extractor()
    entities = {}
    template = TemplateConfig(
        template_id="acord_125_2016",
        version="2016",
        field_map={"ProducerName": "Producer_FullName_A"},
        repeaters={},
        raw={},
    )

    extractor._extract_from_pdf_fields(
        raw_fields={
            "Producer_FullName_A": "Northstar Risk Partners",
            "Form_EditionIdentifier_A": "2016/03",
        },
        entities=entities,
        confidence=0.98,
        template_config=template,
    )

    assert list(entities.keys()) == ["ProducerName"]
    assert entities["ProducerName"][0].source.extraction_rule == "pdf_field_template"
