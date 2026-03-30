from filling.template_loader import RepeaterMapping, TemplateConfig


def test_template_config_exposes_structured_repeater_mappings():
    template = TemplateConfig(
        template_id="acord_126_test",
        field_map={"InsuredName": "insured_name"},
        repeaters={
            "Classification": {
                "row_ids": ["1", "2"],
                "columns": {"class_code": "class_code_{row_id}"},
            }
        },
        raw={"version": "v1"},
        pdf_url="/tmp/template.pdf",
        version="v1",
    )

    repeater = template.get_repeater("Classification")

    assert isinstance(repeater, RepeaterMapping)
    assert repeater.row_ids == ["1", "2"]
    assert repeater.columns == {"class_code": "class_code_{row_id}"}


def test_template_config_helpers_cover_field_and_version_metadata():
    template = TemplateConfig(
        template_id="acord_125_test",
        field_map={"InsuredName": "insured_name"},
        repeaters={},
        raw={},
        pdf_url="/tmp/acord_125.pdf",
        version="2026.03",
    )

    assert template.get_pdf_field("InsuredName") == "insured_name"
    assert template.has_pdf_field("InsuredName") is True
    assert template.has_pdf_field("Missing") is False
    assert template.version_metadata == {
        "template_id": "acord_125_test",
        "version": "2026.03",
        "pdf_url": "/tmp/acord_125.pdf",
    }
