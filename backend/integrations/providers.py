"""Provider metadata used to render AMS integration setup dynamically."""

from __future__ import annotations

from typing import Any, Dict, List, Optional

AUTH_FIELD_TEXT = "text"
AUTH_FIELD_PASSWORD = "password"
AUTH_FIELD_URL = "url"


def _field(
    name: str,
    label: str,
    field_type: str = AUTH_FIELD_TEXT,
    *,
    required: bool = True,
    help_text: Optional[str] = None,
) -> Dict[str, Any]:
    field: Dict[str, Any] = {
        "name": name,
        "label": label,
        "type": field_type,
        "required": required,
    }
    if help_text:
        field["helpText"] = help_text
    return field


def _runtime_auth_field(
    name: str,
    label: str,
    field_type: str = AUTH_FIELD_TEXT,
    *,
    required: bool = True,
    storage_target: str = "auth_config",
    secret: bool = False,
    help_text: Optional[str] = None,
) -> Dict[str, Any]:
    field = _field(
        name,
        label,
        field_type,
        required=required,
        help_text=help_text,
    )
    field["storageTarget"] = storage_target
    field["secret"] = secret or field_type == AUTH_FIELD_PASSWORD
    return field


def _runtime_auth_schema(
    auth_strategy: str,
    fields: List[Dict[str, Any]],
) -> Dict[str, Any]:
    return {
        "strategy": auth_strategy,
        "configKey": "auth",
        "fields": fields,
        "supportsConnectionTest": True,
    }


def _runtime_operation(
    operation: str,
    *,
    enabled: bool = True,
    endpoint_ref: Optional[str] = None,
    request_mapping_ref: Optional[str] = None,
    response_mapping_ref: Optional[str] = None,
) -> Dict[str, Any]:
    config: Dict[str, Any] = {
        "operation": operation,
        "enabled": enabled,
    }
    if endpoint_ref:
        config["endpointRef"] = endpoint_ref
    if request_mapping_ref:
        config["requestMappingRef"] = request_mapping_ref
    if response_mapping_ref:
        config["responseMappingRef"] = response_mapping_ref
    return config


def _runtime_endpoint(
    endpoint_id: str,
    *,
    method: str,
    path: str,
    source: str = "base_url",
    required: bool = True,
    timeout_seconds: int = 20,
) -> Dict[str, Any]:
    return {
        "id": endpoint_id,
        "method": method.upper(),
        "path": path,
        "source": source,
        "required": required,
        "timeoutSeconds": timeout_seconds,
    }


def _runtime_config_schema(
    auth_strategy: str,
    auth_fields: List[Dict[str, Any]],
    endpoint_definitions: List[Dict[str, Any]],
    *,
    supports_client_search: bool = False,
    requires_target_client: bool = False,
    supports_submit: bool = False,
    supports_document_attach: bool = False,
    supports_activity_create: bool = False,
) -> Dict[str, Any]:
    operations = [
        _runtime_operation(
            "test_connection",
            endpoint_ref="testConnection",
            response_mapping_ref="testConnection",
        ),
    ]
    if supports_client_search:
        operations.append(
            _runtime_operation(
                "search_clients",
                endpoint_ref="searchClients",
                request_mapping_ref="searchClients",
                response_mapping_ref="searchClients",
            )
        )
    if requires_target_client:
        operations.append(
            _runtime_operation(
                "resolve_target_client",
                endpoint_ref="resolveTargetClient",
                request_mapping_ref="resolveTargetClient",
                response_mapping_ref="resolveTargetClient",
            )
        )
    if supports_submit:
        operations.append(
            _runtime_operation(
                "submit_structured_data",
                endpoint_ref="submitStructuredData",
                request_mapping_ref="submitStructuredData",
                response_mapping_ref="submitStructuredData",
            )
        )
    if supports_document_attach:
        operations.append(
            _runtime_operation(
                "attach_documents",
                endpoint_ref="attachDocuments",
                request_mapping_ref="attachDocuments",
                response_mapping_ref="attachDocuments",
            )
        )
    if supports_activity_create:
        operations.append(
            _runtime_operation(
                "create_activity",
                endpoint_ref="createActivity",
                request_mapping_ref="createActivity",
                response_mapping_ref="createActivity",
            )
        )

    return {
        "version": "1.0",
        "auth": _runtime_auth_schema(auth_strategy, auth_fields),
        "baseUrl": {
            "configKey": "baseUrl",
            "required": auth_strategy != "webhook",
        },
        "endpoints": {
            "configKey": "endpoints",
            "allowOverrides": True,
            "definitions": endpoint_definitions,
        },
        "requestMappings": {
            "configKey": "requestMappings",
            "allowOverrides": True,
        },
        "responseMappings": {
            "configKey": "responseMappings",
            "allowOverrides": True,
        },
        "errorHandling": {
            "configKey": "errorHandling",
            "allowOverrides": True,
        },
        "retryPolicy": {
            "configKey": "retryPolicy",
            "allowOverrides": True,
        },
        "operations": operations,
        "validation": {
            "configKey": "validation",
            "requiresTestTenant": auth_strategy != "webhook",
        },
    }


def _provider(
    static_metadata: Dict[str, Any],
    runtime_config: Dict[str, Any],
) -> Dict[str, Any]:
    provider = dict(static_metadata)
    provider["runtimeConfig"] = runtime_config
    return provider


def _ams_ready_webhook_provider(
    provider_id: str,
    display_name: str,
    native_provider: str,
    description: str,
) -> Dict[str, Any]:
    return {
        "provider": provider_id,
        "displayName": display_name,
        "category": "ams",
        "status": "available",
        "authType": "webhook",
        "description": description,
        "authConfig": {
            "type": "webhook",
            "fields": [
                _field("url", "Automation Webhook URL", AUTH_FIELD_URL),
                _field("secretRef", "Secret Environment Variable", required=False),
            ],
        },
        "capabilities": {
            "supportsClientSearch": False,
            "supportsClientCreate": False,
            "supportsPolicyCreate": False,
            "supportsDocumentAttach": True,
            "supportsActivities": True,
            "supportsStructuredDataSubmit": True,
            "supportsWebhooks": True,
            "requiresTargetClient": False,
            "requiresPartnerAccess": False,
            "requiresAgencySdkLicense": False,
        },
        "supportedActions": [
            "attach_documents",
            "create_activity",
            "submit_structured_data",
        ],
        "validationMode": "ams_ready_webhook",
        "nativeProvider": native_provider,
    }


INTEGRATION_PROVIDER_STATIC: List[Dict[str, Any]] = [
    {
        "provider": "webhook",
        "displayName": "Custom Webhook",
        "category": "generic",
        "status": "available",
        "authType": "webhook",
        "description": "Send the canonical AutoFil payload to a custom HTTPS endpoint.",
        "authConfig": {
            "type": "webhook",
            "fields": [
                _field("url", "Webhook URL", AUTH_FIELD_URL),
                _field("secretRef", "Secret Environment Variable", required=False),
            ],
        },
        "capabilities": {
            "supportsClientSearch": False,
            "supportsClientCreate": False,
            "supportsPolicyCreate": False,
            "supportsDocumentAttach": False,
            "supportsActivities": False,
            "supportsStructuredDataSubmit": True,
            "supportsWebhooks": False,
            "requiresTargetClient": False,
            "requiresPartnerAccess": False,
            "requiresAgencySdkLicense": False,
        },
        "supportedActions": ["submit_structured_data"],
    },
    {
        "provider": "nowcerts",
        "displayName": "NowCerts",
        "category": "ams",
        "status": "planned",
        "authType": "api_credentials",
        "description": "Connect to NowCerts for insured lookup, document upload, activities, and structured data writeback.",
        "authConfig": {
            "type": "api_credentials",
            "fields": [
                _field("baseUrl", "API Base URL", AUTH_FIELD_URL, required=False),
                _field("username", "Username"),
                _field("password", "Password", AUTH_FIELD_PASSWORD),
                _field("agencyId", "Agency ID", required=False),
            ],
        },
        "capabilities": {
            "supportsClientSearch": True,
            "supportsClientCreate": True,
            "supportsPolicyCreate": True,
            "supportsDocumentAttach": True,
            "supportsActivities": True,
            "supportsStructuredDataSubmit": True,
            "supportsWebhooks": True,
            "requiresTargetClient": False,
            "requiresPartnerAccess": False,
            "requiresAgencySdkLicense": False,
        },
        "supportedActions": [
            "search_clients",
            "attach_documents",
            "create_activity",
            "submit_structured_data",
        ],
    },
    {
        "provider": "applied_epic",
        "displayName": "Applied Epic",
        "category": "ams",
        "status": "planned",
        "authType": "sdk_credentials",
        "description": "Connect through Applied Epic SDK/API access for client lookup, attachments, activities, and limited structured writeback.",
        "authConfig": {
            "type": "sdk_credentials",
            "fields": [
                _field("baseUrl", "SDK Service URL", AUTH_FIELD_URL),
                _field("clientId", "Client ID"),
                _field("clientSecret", "Client Secret", AUTH_FIELD_PASSWORD),
                _field("databaseName", "Epic Database"),
            ],
        },
        "capabilities": {
            "supportsClientSearch": True,
            "supportsClientCreate": True,
            "supportsPolicyCreate": "limited",
            "supportsDocumentAttach": True,
            "supportsActivities": True,
            "supportsStructuredDataSubmit": "limited",
            "supportsWebhooks": False,
            "requiresTargetClient": True,
            "requiresPartnerAccess": True,
            "requiresAgencySdkLicense": True,
        },
        "supportedActions": [
            "search_clients",
            "attach_documents",
            "create_activity",
            "submit_structured_data",
        ],
    },
    _ams_ready_webhook_provider(
        "applied_epic_ams_ready",
        "Applied Epic-ready Webhook",
        "applied_epic",
        "Validate Applied Epic demand by sending an AMS-ready package to Zapier, Make, n8n, or another webhook workflow. This is not a native Applied Epic API connection.",
    ),
    {
        "provider": "ams360",
        "displayName": "Vertafore AMS360",
        "category": "ams",
        "status": "planned",
        "authType": "wsapi",
        "description": "Connect through AMS360 Web Service API credentials configured by the agency.",
        "authConfig": {
            "type": "wsapi",
            "fields": [
                _field("baseUrl", "Web Service URL", AUTH_FIELD_URL, required=False),
                _field("agencyNumber", "Agency Number"),
                _field("loginId", "WSAPI Login ID"),
                _field("password", "WSAPI Password", AUTH_FIELD_PASSWORD),
            ],
        },
        "capabilities": {
            "supportsClientSearch": True,
            "supportsClientCreate": True,
            "supportsPolicyCreate": "limited",
            "supportsDocumentAttach": True,
            "supportsActivities": True,
            "supportsStructuredDataSubmit": "limited",
            "supportsWebhooks": False,
            "requiresTargetClient": True,
            "requiresPartnerAccess": True,
            "requiresAgencySdkLicense": False,
        },
        "supportedActions": [
            "search_clients",
            "attach_documents",
            "create_activity",
            "submit_structured_data",
        ],
    },
    _ams_ready_webhook_provider(
        "ams360_ams_ready",
        "AMS360-ready Webhook",
        "ams360",
        "Validate AMS360 demand by sending an AMS-ready package to Zapier, Make, n8n, or another webhook workflow. This is not a native AMS360 API connection.",
    ),
    {
        "provider": "hawksoft",
        "displayName": "HawkSoft",
        "category": "ams",
        "status": "planned",
        "authType": "partner_api",
        "description": "Connect through HawkSoft Partner API after partner onboarding and agency opt-in.",
        "authConfig": {
            "type": "partner_api",
            "fields": [
                _field("baseUrl", "API Base URL", AUTH_FIELD_URL, required=False),
                _field("clientId", "Client ID"),
                _field("clientSecret", "Client Secret", AUTH_FIELD_PASSWORD),
            ],
        },
        "capabilities": {
            "supportsClientSearch": True,
            "supportsClientCreate": False,
            "supportsPolicyCreate": False,
            "supportsDocumentAttach": True,
            "supportsActivities": True,
            "supportsStructuredDataSubmit": "limited",
            "supportsWebhooks": False,
            "requiresTargetClient": True,
            "requiresPartnerAccess": True,
            "requiresAgencySdkLicense": False,
        },
        "supportedActions": [
            "search_clients",
            "attach_documents",
            "create_activity",
            "submit_structured_data",
        ],
    },
    _ams_ready_webhook_provider(
        "hawksoft_ams_ready",
        "HawkSoft-ready Webhook",
        "hawksoft",
        "Validate HawkSoft demand by sending an AMS-ready package to Zapier, Make, n8n, or another webhook workflow. This is not a native HawkSoft API connection.",
    ),
    {
        "provider": "qqcatalyst",
        "displayName": "QQCatalyst",
        "category": "ams",
        "status": "planned",
        "authType": "api_partner",
        "description": "Connect through QQCatalyst API partner credentials and agency authorization.",
        "authConfig": {
            "type": "api_partner",
            "fields": [
                _field("baseUrl", "API Base URL", AUTH_FIELD_URL, required=False),
                _field("username", "Username"),
                _field("password", "Password", AUTH_FIELD_PASSWORD),
                _field("apiKey", "API Key", AUTH_FIELD_PASSWORD),
            ],
        },
        "capabilities": {
            "supportsClientSearch": True,
            "supportsClientCreate": True,
            "supportsPolicyCreate": True,
            "supportsDocumentAttach": True,
            "supportsActivities": True,
            "supportsStructuredDataSubmit": True,
            "supportsWebhooks": False,
            "requiresTargetClient": False,
            "requiresPartnerAccess": True,
            "requiresAgencySdkLicense": False,
        },
        "supportedActions": [
            "search_clients",
            "attach_documents",
            "create_activity",
            "submit_structured_data",
        ],
    },
]

INTEGRATION_PROVIDER_RUNTIME_CONFIGS: Dict[str, Dict[str, Any]] = {
    "webhook": _runtime_config_schema(
        "webhook",
        [
            _runtime_auth_field("url", "Webhook URL", AUTH_FIELD_URL, storage_target="url"),
            _runtime_auth_field(
                "secretRef",
                "Secret Environment Variable",
                required=False,
                storage_target="secret_ref",
            ),
        ],
        [
            _runtime_endpoint("testConnection", method="HEAD", path="", source="url"),
            _runtime_endpoint("submitStructuredData", method="POST", path="", source="url"),
        ],
        supports_submit=True,
    ),
    "nowcerts": _runtime_config_schema(
        "basic_auth",
        [
            _runtime_auth_field("baseUrl", "API Base URL", AUTH_FIELD_URL, required=False),
            _runtime_auth_field("username", "Username"),
            _runtime_auth_field("password", "Password", AUTH_FIELD_PASSWORD, secret=True),
            _runtime_auth_field("agencyId", "Agency ID", required=False),
        ],
        [
            _runtime_endpoint("testConnection", method="GET", path="/api/health"),
            _runtime_endpoint("searchClients", method="GET", path="/api/insureds/search"),
            _runtime_endpoint("submitStructuredData", method="POST", path="/api/submissions"),
            _runtime_endpoint("attachDocuments", method="POST", path="/api/documents"),
            _runtime_endpoint("createActivity", method="POST", path="/api/activities"),
        ],
        supports_client_search=True,
        supports_submit=True,
        supports_document_attach=True,
        supports_activity_create=True,
    ),
    "applied_epic": _runtime_config_schema(
        "oauth2_client_credentials",
        [
            _runtime_auth_field("baseUrl", "SDK Service URL", AUTH_FIELD_URL),
            _runtime_auth_field("clientId", "Client ID"),
            _runtime_auth_field("clientSecret", "Client Secret", AUTH_FIELD_PASSWORD, secret=True),
            _runtime_auth_field("databaseName", "Epic Database"),
        ],
        [
            _runtime_endpoint("testConnection", method="GET", path="/api/health"),
            _runtime_endpoint("searchClients", method="POST", path="/api/clients/search"),
            _runtime_endpoint("resolveTargetClient", method="GET", path="/api/clients/{clientId}"),
            _runtime_endpoint("submitStructuredData", method="POST", path="/api/submissions"),
            _runtime_endpoint("attachDocuments", method="POST", path="/api/documents"),
            _runtime_endpoint("createActivity", method="POST", path="/api/activities"),
        ],
        supports_client_search=True,
        requires_target_client=True,
        supports_submit=True,
        supports_document_attach=True,
        supports_activity_create=True,
    ),
    "ams360": _runtime_config_schema(
        "basic_auth",
        [
            _runtime_auth_field("baseUrl", "Web Service URL", AUTH_FIELD_URL, required=False),
            _runtime_auth_field("agencyNumber", "Agency Number"),
            _runtime_auth_field("loginId", "WSAPI Login ID"),
            _runtime_auth_field("password", "WSAPI Password", AUTH_FIELD_PASSWORD, secret=True),
        ],
        [
            _runtime_endpoint("testConnection", method="GET", path="/api/health"),
            _runtime_endpoint("searchClients", method="POST", path="/api/clients/search"),
            _runtime_endpoint("resolveTargetClient", method="GET", path="/api/clients/{clientId}"),
            _runtime_endpoint("submitStructuredData", method="POST", path="/api/policies"),
            _runtime_endpoint("attachDocuments", method="POST", path="/api/documents"),
            _runtime_endpoint("createActivity", method="POST", path="/api/activities"),
        ],
        supports_client_search=True,
        requires_target_client=True,
        supports_submit=True,
        supports_document_attach=True,
        supports_activity_create=True,
    ),
    "hawksoft": _runtime_config_schema(
        "oauth2_client_credentials",
        [
            _runtime_auth_field("baseUrl", "API Base URL", AUTH_FIELD_URL, required=False),
            _runtime_auth_field("clientId", "Client ID"),
            _runtime_auth_field("clientSecret", "Client Secret", AUTH_FIELD_PASSWORD, secret=True),
        ],
        [
            _runtime_endpoint("testConnection", method="GET", path="/api/health"),
            _runtime_endpoint("searchClients", method="GET", path="/api/clients/search"),
            _runtime_endpoint("resolveTargetClient", method="GET", path="/api/clients/{clientId}"),
            _runtime_endpoint("submitStructuredData", method="POST", path="/api/submissions"),
            _runtime_endpoint("attachDocuments", method="POST", path="/api/documents"),
            _runtime_endpoint("createActivity", method="POST", path="/api/activities"),
        ],
        supports_client_search=True,
        requires_target_client=True,
        supports_submit=True,
        supports_document_attach=True,
        supports_activity_create=True,
    ),
    "qqcatalyst": _runtime_config_schema(
        "api_key",
        [
            _runtime_auth_field("baseUrl", "API Base URL", AUTH_FIELD_URL, required=False),
            _runtime_auth_field("username", "Username"),
            _runtime_auth_field("password", "Password", AUTH_FIELD_PASSWORD, secret=True),
            _runtime_auth_field("apiKey", "API Key", AUTH_FIELD_PASSWORD, secret=True),
        ],
        [
            _runtime_endpoint("testConnection", method="GET", path="/api/health"),
            _runtime_endpoint("searchClients", method="GET", path="/api/clients/search"),
            _runtime_endpoint("submitStructuredData", method="POST", path="/api/submissions"),
            _runtime_endpoint("attachDocuments", method="POST", path="/api/documents"),
            _runtime_endpoint("createActivity", method="POST", path="/api/activities"),
        ],
        supports_client_search=True,
        supports_submit=True,
        supports_document_attach=True,
        supports_activity_create=True,
    ),
}

AMS_READY_WEBHOOK_RUNTIME_CONFIG = _runtime_config_schema(
    "webhook",
    [
        _runtime_auth_field("url", "Automation Webhook URL", AUTH_FIELD_URL, storage_target="url"),
        _runtime_auth_field(
            "secretRef",
            "Secret Environment Variable",
            required=False,
            storage_target="secret_ref",
        ),
    ],
    [
        _runtime_endpoint("testConnection", method="HEAD", path="", source="url"),
        _runtime_endpoint("submitStructuredData", method="POST", path="", source="url"),
        _runtime_endpoint("attachDocuments", method="POST", path="", source="url"),
        _runtime_endpoint("createActivity", method="POST", path="", source="url"),
    ],
    supports_submit=True,
    supports_document_attach=True,
    supports_activity_create=True,
)

INTEGRATION_PROVIDER_RUNTIME_CONFIGS.update(
    {
        "applied_epic_ams_ready": AMS_READY_WEBHOOK_RUNTIME_CONFIG,
        "ams360_ams_ready": AMS_READY_WEBHOOK_RUNTIME_CONFIG,
        "hawksoft_ams_ready": AMS_READY_WEBHOOK_RUNTIME_CONFIG,
    }
)


def _hydrate_provider(provider: Dict[str, Any]) -> Dict[str, Any]:
    hydrated = dict(provider)
    hydrated["runtimeConfig"] = dict(
        INTEGRATION_PROVIDER_RUNTIME_CONFIGS.get(str(provider.get("provider") or ""), {})
    )
    return hydrated


INTEGRATION_PROVIDERS: List[Dict[str, Any]] = [
    _provider(
        provider,
        INTEGRATION_PROVIDER_RUNTIME_CONFIGS.get(provider["provider"], {}),
    )
    for provider in INTEGRATION_PROVIDER_STATIC
]


def list_providers() -> List[Dict[str, Any]]:
    """Return a copy of all provider definitions."""
    return [_hydrate_provider(provider) for provider in INTEGRATION_PROVIDER_STATIC]


def get_provider(provider_id: str) -> Optional[Dict[str, Any]]:
    """Return one provider definition by id."""
    normalized = str(provider_id or "").strip().lower()
    for provider in INTEGRATION_PROVIDER_STATIC:
        if provider["provider"] == normalized:
            return _hydrate_provider(provider)
    return None
