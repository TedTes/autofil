from filling.writers.pdf_field_writer import PdfFieldWriter


class _FakeAnnotationRef:
    def __init__(self, annotation):
        self._annotation = annotation

    def get_object(self):
        return self._annotation


class _FakeWriter:
    def __init__(self, pages):
        self.pages = pages


def test_pdf_field_writer_finds_checkbox_on_value_and_updates_checkbox_state():
    annotation = {
        "/T": "commercial_auto",
        "/AP": {
            "/N": {
                "/Off": {},
                "/Yes": {},
            }
        },
    }
    writer = _FakeWriter(
        pages=[
            {
                "/Annots": [_FakeAnnotationRef(annotation)],
            }
        ]
    )

    field_writer = PdfFieldWriter()
    on_value = field_writer.get_checkbox_on_value(writer, "commercial_auto")

    assert on_value == "/Yes"
    assert field_writer.write_field(writer, "commercial_auto", True) is True
    assert str(annotation["/V"]) == "/Yes"
    assert str(annotation["/AS"]) == "/Yes"
