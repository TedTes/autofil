Regression fixture corpus for extraction and filling tests.

Target categories:
- fillable ACORD 125/126/130/140 PDFs
- scanned ACORD forms with expected OCR-backed outputs
- supplemental insurance documents
- loss runs
- SOV schedules
- unsupported or unrelated uploads that should be blocked

Current committed fixtures are intentionally small. Add only redacted documents.
For each fixture, update `manifest.json` with:
- `id`
- `path`
- `document_type`
- `expected_outcome`
- optional `expected_fields`

The automated regression tests use the manifest as the single source of truth.
