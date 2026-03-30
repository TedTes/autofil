from filling.fillers.acord_126_filler import Acord126Filler
from filling.template_loader import TemplateConfig


class _FakeWriterBackend:
    def __init__(self, existing_fields):
        self.existing_fields = set(existing_fields)
        self.writes = []

    def has_field(self, writer, field_name):
        return field_name in self.existing_fields

    def write_field(self, writer, field_name, value):
        if field_name not in self.existing_fields:
            return False
        self.writes.append((field_name, value))
        return True


def _template():
    return TemplateConfig(
        template_id="acord_126_test",
        field_map={
            "InsuredName": "insured_name",
            "PolicyNumber": "policy_number",
        },
        repeaters={
            "Classification": {
                "row_ids": ["1", "2"],
                "columns": {
                    "class_code": "class_code_{row_id}",
                    "premium": "premium_{row_id}",
                },
            }
        },
        raw={},
        pdf_url="/tmp/template.pdf",
        version="latest",
    )


def test_fill_simple_fields_uses_shared_writer_contract():
    filler = Acord126Filler()
    fake_backend = _FakeWriterBackend({"insured_name"})
    filler.pdf_writer = fake_backend
    template = _template()
    warnings = []
    unmapped = []

    filled = filler._fill_simple_fields(
        writer=object(),
        template=template,
        flat_fields={
            "InsuredName": "Acme LLC",
            "PolicyNumber": "POL-123",
            "UnknownField": "ignored",
        },
        warnings=warnings,
        unmapped=unmapped,
    )

    assert filled == 1
    assert fake_backend.writes == [("insured_name", "Acme LLC")]
    assert "policy_number" in unmapped
    assert any("Canonical field has no mapping" in warning for warning in warnings)


def test_fill_repeaters_uses_shared_writer_contract():
    filler = Acord126Filler()
    fake_backend = _FakeWriterBackend({"class_code_1", "premium_1", "class_code_2"})
    filler.pdf_writer = fake_backend
    template = _template()
    warnings = []
    unmapped = []

    filled = filler._fill_repeaters(
        writer=object(),
        template=template,
        flat_fields={
            "Classification": [
                {"class_code": "8810", "premium": "1000"},
                {"class_code": "8742", "premium": "500"},
                {"class_code": "extra", "premium": "999"},
            ]
        },
        warnings=warnings,
        unmapped=unmapped,
    )

    assert filled == 3
    assert ("class_code_1", "8810") in fake_backend.writes
    assert ("premium_1", "1000") in fake_backend.writes
    assert ("class_code_2", "8742") in fake_backend.writes
    assert "premium_2" in unmapped
    assert any("Truncated Classification to 2 rows" in warning for warning in warnings)


def test_calculate_coverage_counts_simple_and_repeater_slots():
    filler = Acord126Filler()
    template = _template()

    coverage = filler._calculate_coverage(
        template=template,
        flat_fields={
            "InsuredName": "Acme LLC",
            "PolicyNumber": "POL-123",
            "Classification": [
                {"class_code": "8810", "premium": "1000"},
                {"class_code": "8742", "premium": "500"},
            ],
        },
        filled_count=5,
    )

    assert coverage == 5 / 6
