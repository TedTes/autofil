import services.integration_service as integration_service_module
import integrations.adapters as adapters_module
import integrations.providers as providers_module
from integrations.adapters import WebhookAdapter
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
            "provider": "webhook",
            "auth_type": "none",
            "enabled": True,
            "config": {},
            "auth_config": {},
        }

    def select_rows(self, table, **kwargs):
        if table == "integration_destinations":
            return [self.destination]
        return []

    def insert_row(self, table, payload):
        row = {"id": "job-1", **payload}
        self.rows.append((table, row))
        return row


class RetryFakeDb(SendFakeDb):
    def __init__(self):
        super().__init__()
        self.previous_job = {
            "id": "job-old",
            "owner_user_id": "user-1",
            "submission_id": "sub-1",
            "destination_id": "dest-1",
            "request_payload": StubPayloadService().build_payload("sub-1"),
            "target": {"clientId": "ams-client-1"},
            "actions": ["attach_documents"],
        }

    def select_rows(self, table, **kwargs):
        filters = kwargs.get("filters") or {}
        if table == "integration_jobs" and filters.get("id") == "job-old":
            return [self.previous_job]
        return super().select_rows(table, **kwargs)


class DuplicateFakeDb(SendFakeDb):
    def select_rows(self, table, **kwargs):
        filters = kwargs.get("filters") or {}
        if table == "integration_jobs" and filters.get("submission_id") == "sub-1":
            return [
                {
                    "id": "job-existing",
                    "status": "succeeded",
                    "submission_id": "sub-1",
                    "destination_id": "dest-1",
                    "target": {},
                    "actions": ["submit_structured_data"],
                }
            ]
        return super().select_rows(table, **kwargs)


class StubPayloadService:
    def build_payload(self, submission_id):
        return {
            "submission": {
                "submission_id": submission_id,
                "client_name": "Northstar Risk Partners",
            },
            "review_status": {"reviewed": True},
            "insured": {"name": "Redwood Custom Builders LLC"},
            "policy": {"policy_number": "GL-TEST-2026-001"},
            "source_files": [{"name": "accord.pdf"}],
            "confidence": {"field_count": 42},
        }


class StubResponse:
    status_code = 200
    text = '{"ok": true}'

    def json(self):
        return {"ok": True}


class AdapterStubResponse(StubResponse):
    pass


class StubAdapter:
    def validate_connection(self, config):
        return {"ok": True, "message": "ok"}

    def send_submission(self, payload, *, config, target=None, actions=None, idempotency_key=None):
        return {
            "ok": True,
            "status": "succeeded",
            "response_status": 200,
            "response_body": {"ok": True},
            "action_results": [
                {
                    "action": "submit_structured_data",
                    "status": "succeeded",
                    "message": None,
                }
            ],
        }


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


def test_create_connection_alias_uses_destination_normalization():
    db = FakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    connection = service.create_destination(
        {
            "client_id": "client-1",
            "name": "NowCerts",
            "provider": "nowcerts",
            "auth_config": {"username": "agent@example.test"},
        }
    )

    assert connection["type"] == "ams"
    assert connection["provider"] == "nowcerts"
    assert connection["auth_type"] == "api_credentials"
    assert connection["capabilities"]["supportsStructuredDataSubmit"] is True


def test_list_destinations_filters_by_owner_and_client():
    db = FakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    rows = service.list_destinations(client_id="client-1")

    assert rows[0]["filters"] == {
        "owner_user_id": "user-1",
        "client_id": "client-1",
    }


def test_get_job_filters_by_owner_and_job_id():
    db = FakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    job = service.get_job("job-1")

    assert job["table"] == "integration_jobs"
    assert job["filters"] == {"id": "job-1", "owner_user_id": "user-1"}


def test_list_send_history_filters_audit_rows():
    db = FakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    rows = service.list_send_history(
        submission_id="sub-1",
        connection_id="dest-1",
        provider="applied_epic",
        limit=250,
    )

    assert rows[0]["table"] == "integration_jobs"
    assert rows[0]["filters"] == {
        "owner_user_id": "user-1",
        "submission_id": "sub-1",
        "destination_id": "dest-1",
        "provider": "applied_epic",
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
    assert applied_epic["runtimeConfig"]["auth"]["strategy"] == "oauth2_client_credentials"
    assert applied_epic["runtimeConfig"]["auth"]["supportsConnectionTest"] is True
    assert applied_epic["runtimeConfig"]["baseUrl"]["configKey"] == "baseUrl"
    assert applied_epic["runtimeConfig"]["validation"]["requiresTestTenant"] is True
    assert applied_epic["runtimeConfig"]["auth"]["fields"] == [
        {
            "name": "baseUrl",
            "label": "SDK Service URL",
            "type": "url",
            "required": True,
            "storageTarget": "auth_config",
            "secret": False,
        },
        {
            "name": "clientId",
            "label": "Client ID",
            "type": "text",
            "required": True,
            "storageTarget": "auth_config",
            "secret": False,
        },
        {
            "name": "clientSecret",
            "label": "Client Secret",
            "type": "password",
            "required": True,
            "storageTarget": "auth_config",
            "secret": True,
        },
        {
            "name": "databaseName",
            "label": "Epic Database",
            "type": "text",
            "required": True,
            "storageTarget": "auth_config",
            "secret": False,
        },
    ]
    assert {
        operation["operation"] for operation in applied_epic["runtimeConfig"]["operations"]
    } == {
        "test_connection",
        "search_clients",
        "resolve_target_client",
        "submit_structured_data",
        "attach_documents",
        "create_activity",
    }


def test_provider_static_metadata_is_separate_from_runtime_config():
    applied_epic_static = next(
        provider
        for provider in providers_module.INTEGRATION_PROVIDER_STATIC
        if provider["provider"] == "applied_epic"
    )

    assert "runtimeConfig" not in applied_epic_static
    assert (
        providers_module.INTEGRATION_PROVIDER_RUNTIME_CONFIGS["applied_epic"]["auth"]["strategy"]
        == "oauth2_client_credentials"
    )


def test_webhook_adapter_validates_and_sends_payload():
    posted = {}

    def fake_post(url, data, headers, timeout):
        posted.update(
            {
                "url": url,
                "data": data,
                "headers": headers,
                "timeout": timeout,
            }
        )
        return AdapterStubResponse()

    original_post = adapters_module.requests.post
    adapters_module.requests.post = fake_post

    try:
        adapter = WebhookAdapter()
        validation = adapter.validate_connection({"url": "https://example.test/hook"})
        result = adapter.send_submission(
            {"submission": {"submission_id": "sub-1"}},
            config={"url": "https://example.test/hook", "auth_type": "none"},
            idempotency_key="idem-1",
        )
    finally:
        adapters_module.requests.post = original_post

    assert validation["ok"] is True
    assert result["ok"] is True
    assert result["response_status"] == 200
    assert posted["url"] == "https://example.test/hook"
    assert posted["headers"]["X-Autofil-Idempotency-Key"] == "idem-1"


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


def test_test_webhook_connection_marks_valid():
    db = SendFakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    result = service.test_connection("dest-1")

    assert result["ok"] is True
    assert result["status"] == "valid"
    assert result["provider"] == "webhook"
    assert result["connection"]["connection_status"] == "valid"
    table, payload, filters = db.updated[0]
    assert table == "integration_destinations"
    assert payload["last_error"] is None
    assert filters == {"id": "dest-1", "owner_user_id": "user-1"}


def test_test_planned_ams_connection_marks_invalid_until_adapter_exists():
    db = SendFakeDb()
    db.destination = {
        **db.destination,
        "type": "ams",
        "provider": "applied_epic",
        "url": None,
        "auth_config": {"baseUrl": "https://epic.example.test"},
    }
    service = IntegrationService(db=db, current_user_id="user-1")

    result = service.test_connection("dest-1")

    assert result["ok"] is False
    assert result["status"] == "invalid"
    assert result["provider"] == "applied_epic"
    assert "not implemented yet" in result["message"]
    assert result["connection"]["connection_status"] == "invalid"


def test_search_clients_requires_query():
    db = SendFakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    try:
        service.search_clients("dest-1", "r")
    except ValueError as exc:
        assert "at least 2 characters" in str(exc)
    else:
        raise AssertionError("Expected short query to fail")


def test_search_clients_respects_provider_capability():
    db = SendFakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    result = service.search_clients("dest-1", "Redwood")

    assert result["ok"] is False
    assert result["provider"] == "webhook"
    assert result["results"] == []
    assert "does not support client search" in result["message"]


def test_search_clients_returns_stable_not_implemented_response():
    db = SendFakeDb()
    db.destination = {
        **db.destination,
        "type": "ams",
        "provider": "applied_epic",
        "url": None,
        "auth_config": {"baseUrl": "https://epic.example.test"},
    }
    service = IntegrationService(db=db, current_user_id="user-1")

    result = service.search_clients("dest-1", "Redwood", limit=50)

    assert result["ok"] is False
    assert result["provider"] == "applied_epic"
    assert result["query"] == "Redwood"
    assert result["results"] == []
    assert "not implemented yet" in result["message"]


def test_preview_send_builds_payload_summary_and_action_support():
    db = SendFakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    preview = service.preview_send(
        "sub-1",
        "dest-1",
        actions=["submit_structured_data", "attach_documents"],
        payload_service=StubPayloadService(),
    )

    assert preview["ok"] is False
    assert preview["provider"] == "webhook"
    assert preview["payload_summary"]["insured_name"] == "Redwood Custom Builders LLC"
    assert preview["payload_summary"]["field_count"] == 42
    assert preview["actions"][0]["supported"] is True
    assert preview["actions"][1]["supported"] is False
    assert "Unsupported actions: Attach documents." in preview["warnings"]


def test_preview_send_warns_when_provider_requires_target_client():
    db = SendFakeDb()
    db.destination = {
        **db.destination,
        "type": "ams",
        "provider": "applied_epic",
        "url": None,
        "capabilities": {
            "supportsDocumentAttach": True,
            "supportsActivities": True,
            "supportsStructuredDataSubmit": "limited",
            "requiresTargetClient": True,
        },
    }
    service = IntegrationService(db=db, current_user_id="user-1")

    preview = service.preview_send(
        "sub-1",
        "dest-1",
        payload_service=StubPayloadService(),
    )

    assert preview["ok"] is True
    assert preview["requires_target_client"] is True
    assert [action["action"] for action in preview["actions"]] == [
        "attach_documents",
        "create_activity",
        "submit_structured_data",
    ]
    assert "requires a selected target client" in preview["warnings"][0]


def test_adapter_payload_maps_canonical_data_for_ams():
    service = IntegrationService(db=FakeDb(), current_user_id="user-1")

    adapter_payload = service._adapter_payload(
        provider_id="applied_epic",
        canonical_payload=StubPayloadService().build_payload("sub-1"),
        target={"clientId": "epic-client-1"},
        actions=["attach_documents", "create_activity"],
    )

    assert adapter_payload["schema_version"] == "autofil.ams_adapter_input.v1"
    assert adapter_payload["provider"] == "applied_epic"
    assert adapter_payload["canonical"]["submission"]["submission_id"] == "sub-1"
    assert adapter_payload["mapped"]["client"]["name"] == "Redwood Custom Builders LLC"
    assert adapter_payload["mapped"]["policy"]["policy_number"] == "GL-TEST-2026-001"
    assert adapter_payload["mapped"]["documents"][0]["name"] == "accord.pdf"
    assert adapter_payload["mapped"]["documents"][0]["attachment_kind"] == "source_document"
    assert adapter_payload["action_payloads"]["attach_documents"]["documents"][0]["name"] == "accord.pdf"
    assert "Redwood Custom Builders LLC" in adapter_payload["action_payloads"]["create_activity"]["subject"]
    assert "Mapped fields: 42" in adapter_payload["action_payloads"]["create_activity"]["body"]


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


def test_send_creates_provider_job_for_webhook_connection():
    db = SendFakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")
    original_get_adapter = integration_service_module.get_adapter
    integration_service_module.get_adapter = lambda provider_id: StubAdapter()

    try:
        job = service.send(
            "sub-1",
            "dest-1",
            payload_service=StubPayloadService(),
        )
    finally:
        integration_service_module.get_adapter = original_get_adapter

    inserted_table, inserted_job = db.rows[0]
    assert inserted_table == "integration_jobs"
    assert inserted_job["destination_id"] == "dest-1"
    assert inserted_job["actions"] == ["submit_structured_data"]
    assert inserted_job["request_payload"]["insured"]["name"] == "Redwood Custom Builders LLC"
    assert job["status"] == "succeeded"
    assert job["action_results"][0]["status"] == "succeeded"


def test_send_blocks_duplicate_successful_job():
    db = DuplicateFakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")

    try:
        service.send(
            "sub-1",
            "dest-1",
            payload_service=StubPayloadService(),
        )
    except ValueError as exc:
        assert "Duplicate integration send blocked" in str(exc)
    else:
        raise AssertionError("Expected duplicate send to be blocked")


def test_send_requires_target_for_targeted_ams_provider():
    db = SendFakeDb()
    db.destination = {
        **db.destination,
        "type": "ams",
        "provider": "applied_epic",
        "url": None,
        "capabilities": {
            "supportsDocumentAttach": True,
            "requiresTargetClient": True,
        },
    }
    service = IntegrationService(db=db, current_user_id="user-1")

    try:
        service.send(
            "sub-1",
            "dest-1",
            actions=["attach_documents"],
            payload_service=StubPayloadService(),
        )
    except ValueError as exc:
        assert "Target client is required" in str(exc)
    else:
        raise AssertionError("Expected missing target client to fail")


def test_send_records_not_implemented_adapter_failure():
    db = SendFakeDb()
    db.destination = {
        **db.destination,
        "type": "ams",
        "provider": "applied_epic",
        "url": None,
        "capabilities": {
            "supportsDocumentAttach": True,
            "requiresTargetClient": True,
        },
    }
    service = IntegrationService(db=db, current_user_id="user-1")

    job = service.send(
        "sub-1",
        "dest-1",
        target={"clientId": "epic-client-1"},
        actions=["attach_documents"],
        payload_service=StubPayloadService(),
    )

    inserted_table, inserted_job = db.rows[0]
    assert inserted_table == "integration_jobs"
    assert inserted_job["target"] == {"clientId": "epic-client-1"}
    assert inserted_job["provider"] == "applied_epic"
    assert job["status"] == "failed"
    assert job["action_results"][0]["action"] == "attach_documents"
    assert "not implemented yet" in job["error_message"]


def test_status_from_action_results_detects_partial_failure():
    service = IntegrationService(db=FakeDb(), current_user_id="user-1")

    status = service._status_from_action_results(
        [
            {"action": "attach_documents", "status": "succeeded"},
            {"action": "create_activity", "status": "failed"},
        ],
        fallback_ok=False,
    )

    assert status == "partially_succeeded"


def test_retry_job_creates_new_send_attempt():
    db = RetryFakeDb()
    service = IntegrationService(db=db, current_user_id="user-1")
    original_get_adapter = integration_service_module.get_adapter
    integration_service_module.get_adapter = lambda provider_id: StubAdapter()

    try:
        job = service.retry_job("job-old")
    finally:
        integration_service_module.get_adapter = original_get_adapter

    inserted_table, inserted_job = db.rows[0]
    assert inserted_table == "integration_jobs"
    assert inserted_job["submission_id"] == "sub-1"
    assert inserted_job["actions"] == ["attach_documents"]
    assert inserted_job["target"] == {"clientId": "ams-client-1"}
    assert ":retry:" in inserted_job["idempotency_key"]
    assert job["status"] == "succeeded"
