import json
from pathlib import Path


def test_fixture_manifest_entries_have_required_fields():
    manifest_path = Path("backend/tests/fixtures/manifest.json")
    entries = json.loads(manifest_path.read_text(encoding="utf-8"))

    assert entries, "fixture manifest should not be empty"

    for entry in entries:
        assert entry["id"]
        assert entry["path"]
        assert entry["document_type"]
        assert entry["expected_outcome"] in {"extract", "review", "reject"}
        assert Path(entry["path"]).exists()
