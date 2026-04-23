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


INTEGRATION_PROVIDERS: List[Dict[str, Any]] = [
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


def list_providers() -> List[Dict[str, Any]]:
    """Return a copy of all provider definitions."""
    return [dict(provider) for provider in INTEGRATION_PROVIDERS]


def get_provider(provider_id: str) -> Optional[Dict[str, Any]]:
    """Return one provider definition by id."""
    normalized = str(provider_id or "").strip().lower()
    for provider in INTEGRATION_PROVIDERS:
        if provider["provider"] == normalized:
            return dict(provider)
    return None
