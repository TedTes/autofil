from services.integration_service import IntegrationService


class FakeDb:
    def __init__(self):
        self.rows = []
        self.updated = []

    def insert_row(self, table, payload):
        row = {"id": "dest-1", **payload}
        self.rows.append((table, row))
        return row

    def select_rows(self, table, **kwargs):
        return [{"id": "row-1", "table": table, "filters": kwargs.get("filters") or {}}]

    def update_rows(self, table, payload, *, filters):
        self.updated.append((table, payload, filters))
        if filters.get("id") == "missing":
            return []
        return [{"id": filters["id"], **payload}]


class SendFakeDb(FakeDb):
    def __init__(self):
        super().__init__()
        self.destination = {
            "id": "dest-1",
            "owner_user_id": "user-1",
            "client_id": "client-1",
            "name": "Webhook",
            "type": "webhook",
            "url": "https://example.test/hook",
            "auth_type": "none",
            "enabled": True,
            "config": {},
        }

    def select_rows(self, table, **kwargs):
        if table == "integration_destinations":
            return [self.destination]
        return []

    def insert_row(self, table, payload):
        row = {"id": "job-1", **payload}
        self.rows.append((table, row))
        return row


class StubPayloadService:
    def build_payload(self, submission_id):
        return {"submission": {"submission_id": submission_id}}


class StubResponse:
    status_code = 200
    text = '{"ok": true}'

    def json(self):
        return {"ok": True}


def test_create_destination_normalizes_defaults_and_owner_scope():
    db = FakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    destination = service.create_destination(
        {
            "client_id": "client-1",
            "name": "  Test Webhook  ",
            "url": "https://example.test/hook",
        }
    )

    assert destination["owner_user_id"] == "user-1"
    assert destination["name"] == "Test Webhook"
    assert destination["type"] == "webhook"
    assert destination["provider"] == "webhook"
    assert destination["auth_type"] == "none"
    assert destination["enabled"] is True
    assert destination["config"] == {}
    assert destination["auth_config"] == {}
    assert destination["connection_status"] == "configured"


def test_create_ams_destination_uses_provider_metadata():
    db = FakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    destination = service.create_destination(
        {
            "client_id": "client-1",
            "name": "Applied Epic",
            "provider": "applied_epic",
            "auth_config": {"baseUrl": "https://epic.example.test"},
        }
    )

    assert destination["type"] == "ams"
    assert destination["provider"] == "applied_epic"
    assert "url" not in destination or destination["url"] is None
    assert destination["auth_type"] == "sdk_credentials"
    assert destination["connection_status"] == "not_configured"
    assert destination["capabilities"]["supportsDocumentAttach"] is True
    assert destination["capabilities"]["requiresAgencySdkLicense"] is True


def test_list_destinations_filters_by_owner_and_client():
    db = FakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    rows = service.list_destinations(client_id="client-1")

    assert rows[0]["filters"] == {
        "owner_user_id": "user-1",
        "client_id": "client-1",
    }


def test_list_providers_exposes_ams_capabilities():
    service = IntegrationService(db=FakeDb(), current_user_id="user-1")

    providers = service.list_providers()
    applied_epic = next(
        provider for provider in providers if provider["provider"] == "applied_epic"
    )

    assert applied_epic["category"] == "ams"
    assert applied_epic["authConfig"]["type"] == "sdk_credentials"
    assert applied_epic["capabilities"]["supportsDocumentAttach"] is True
    assert applied_epic["capabilities"]["requiresAgencySdkLicense"] is True


def test_update_destination_rejects_invalid_url():
    service = IntegrationService(db=FakeDb(), current_user_id="user-1")

    try:
        service.update_destination("dest-1", {"url": "not-a-url"})
    except ValueError as exc:
        assert "valid http or https URL" in str(exc)
    else:
        raise AssertionError("Expected invalid URL to fail")


def test_delete_destination_soft_disables_row():
    db = FakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    assert service.delete_destination("dest-1") is True
    table, payload, filters = db.updated[0]

    assert table == "integration_destinations"
    assert payload["enabled"] is False
    assert filters == {"id": "dest-1", "owner_user_id": "user-1"}


def test_send_submission_creates_and_completes_job():
    db = SendFakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")
    service._post_webhook = lambda destination, payload, key: StubResponse()

    job = service.send_submission(
        "sub-1",
        "dest-1",
        payload_service=StubPayloadService(),
    )

    inserted_table, inserted_job = db.rows[0]
    assert inserted_table == "integration_jobs"
    assert inserted_job["status"] == "running"
    assert inserted_job["provider"] == "webhook"
    assert inserted_job["target"] == {}
    assert inserted_job["actions"] == ["submit_structured_data"]
    assert inserted_job["action_results"] == []
    assert inserted_job["request_payload"]["submission"]["submission_id"] == "sub-1"
    assert job["status"] == "succeeded"
    assert job["response_status"] == 200
