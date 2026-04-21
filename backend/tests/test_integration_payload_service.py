from services.integration_payload_service import IntegrationPayloadService


class StubSubmissionService:
    def __init__(self, metadata):
        self.metadata = metadata

    def get_submission_metadata(self, submission_id):
        if submission_id == self.metadata["submission_id"]:
            return self.metadata
        return None


def test_build_payload_projects_merged_sections_sources_and_totals():
    metadata = {
        "submission_id": "sub-123",
        "client_id": "client-123",
        "client_name": "Redwood Account",
        "name": "Redwood renewal",
        "status": "ready",
        "file_count": 2,
        "created_at": "2026-04-18T12:00:00",
        "updated_at": "2026-04-18T12:30:00",
        "data": {
            "confidence": 0.95,
            "raw": {
                "totals": {
                    "total_paid": 24800.0,
                    "total_claims": 3,
                    "revenue_total": 1250000.0,
                },
                "claims": [
                    {
                        "claim_number": "CLM-1",
                        "paid": 1000.0,
                    }
                ],
                "line_items": {
                    "revenue": [{"account": "Revenue", "current_year": 1250000.0}]
                },
                "statement_type": "income_statement",
            },
            "sources": [
                {
                    "input_id": "input-25",
                    "file_name": "acord_25.pdf",
                    "document_type": "DocumentType.ACORD_25",
                    "included_in_merge": True,
                }
            ],
            "semantic_sections": [
                {
                    "key": "insured",
                    "display_name": "Insured Information",
                    "fields": [
                        {
                            "id": "InsuredName",
                            "label": "Insured Name",
                            "type": "string",
                            "values": [
                                {
                                    "value": "Redwood Custom Builders LLC",
                                    "confidence": 0.98,
                                    "source": {
                                        "source_file": "acord_25.pdf",
                                        "input_id": "input-25",
                                    },
                                    "tags": ["fillable_pdf"],
                                }
                            ],
                        }
                    ],
                },
                {
                    "key": "policy",
                    "fields": [
                        {
                            "id": "PolicyNumber",
                            "label": "Policy Number",
                            "values": [{"value": "PKG-1", "confidence": 0.96}],
                        },
                        {
                            "id": "EffectiveDate",
                            "label": "Effective Date",
                            "values": [{"value": "05/01/2026", "confidence": 0.97}],
                        },
                    ],
                },
                {
                    "key": "locations",
                    "fields": [
                        {
                            "id": "Location",
                            "label": "Location",
                            "values": [
                                {
                                    "value": {
                                        "address": "100 Market Street",
                                        "total_value": 2600000.0,
                                    },
                                    "confidence": 0.95,
                                }
                            ],
                        }
                    ],
                },
            ],
        },
    }

    payload = IntegrationPayloadService(
        submission_service=StubSubmissionService(metadata)
    ).build_payload("sub-123")

    assert payload["schema_version"] == "1.0"
    assert payload["submission"]["submission_id"] == "sub-123"
    assert payload["submission"]["name"] == "Redwood renewal"
    assert payload["insured"]["name"] == "Redwood Custom Builders LLC"
    assert payload["policy"]["policy_number"] == "PKG-1"
    assert payload["policy"]["effective_date"] == "05/01/2026"
    assert payload["locations"][0]["address"] == "100 Market Street"
    assert payload["loss_history"]["claim_count"] == 1
    assert payload["loss_history"]["totals"]["total_paid"] == 24800.0
    assert payload["financials"]["statement_type"] == "income_statement"
    assert payload["source_files"][0]["file_name"] == "acord_25.pdf"
    assert payload["field_sources"]["InsuredName"]["source"]["input_id"] == "input-25"
    assert payload["confidence"]["field_count"] == 4


def test_build_payload_raises_for_missing_submission():
    service = IntegrationPayloadService(
        submission_service=StubSubmissionService({"submission_id": "other"})
    )

    try:
        service.build_payload("missing")
    except ValueError as exc:
        assert str(exc) == "Submission not found"
    else:
        raise AssertionError("Expected missing submission to raise")
