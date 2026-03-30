from extraction.parsers.table_parser import TableParser


def test_table_parser_skips_missing_optional_dependencies(monkeypatch):
    parser = TableParser()

    monkeypatch.setattr(parser, "_optional_import", lambda module_name: None)

    camelot_result = parser._extract_camelot_lattice("dummy.pdf")
    tabula_result = parser._extract_with_tabula("dummy.pdf")

    assert camelot_result["table_count"] == 0
    assert camelot_result["warnings"] == ["Camelot not installed; skipping lattice extraction"]
    assert tabula_result["table_count"] == 0
    assert tabula_result["warnings"] == ["Tabula not installed; skipping extraction"]
