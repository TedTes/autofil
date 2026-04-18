from services.submission_merge_coordinator import SubmissionMergeCoordinator


def _coordinator():
    return SubmissionMergeCoordinator(load_input_data=lambda entry: entry.get("data"))


def test_clean_entities_filters_obvious_field_type_mismatches():
    payload = {
        "semantic_sections": [
            {
                "key": "policy",
                "fields": [
                    {"id": "PolicyNumber", "values": [{"value": "Y", "confidence": 0.98}]},
                    {
                        "id": "CoverageOccurrenceIndicator",
                        "values": [{"value": "$1,000,000", "confidence": 0.98}],
                    },
                    {"id": "GeneralAggregateLimit", "values": [{"value": 1, "confidence": 0.98}]},
                    {"id": "InsuredName", "values": [{"value": "(S)", "confidence": 0.78}]},
                    {"id": "CarrierNAIC", "values": [{"value": "NO:", "confidence": 0.78}]},
                    {
                        "id": "NumberOfEmployees",
                        "values": [{"value": 2119932016126201609, "confidence": 0.78}],
                    },
                    {
                        "id": "EachOccurrenceLimit",
                        "values": [{"value": 1000000, "confidence": 0.98}],
                    },
                    {
                        "id": "ProducerEmail",
                        "values": [{"value": "425 Market Street", "confidence": 0.98}],
                    },
                    {
                        "id": "UmbrellaAdditionalInsuredCode",
                        "values": [{"value": "TEST-001", "confidence": 0.98}],
                    },
                    {
                        "id": "UmbrellaInsurerLetter",
                        "values": [{"value": "E", "confidence": 0.98}],
                    },
                ],
            }
        ]
    }

    cleaned = _coordinator().clean_entities(payload)
    remaining = _coordinator().semantic_sections_to_entity_map(cleaned)

    assert "PolicyNumber" not in remaining
    assert "CoverageOccurrenceIndicator" not in remaining
    assert "GeneralAggregateLimit" not in remaining
    assert "InsuredName" not in remaining
    assert "CarrierNAIC" not in remaining
    assert "NumberOfEmployees" not in remaining
    assert "ProducerEmail" not in remaining
    assert "UmbrellaAdditionalInsuredCode" not in remaining
    assert remaining["EachOccurrenceLimit"][0]["value"] == 1000000
    assert remaining["UmbrellaInsurerLetter"][0]["value"] == "E"


def test_clean_entities_keeps_valid_policy_identifiers_and_contact_values():
    payload = {
        "semantic_sections": [
            {
                "key": "policy",
                "fields": [
                    {
                        "id": "PolicyNumber",
                        "values": [{"value": "PKG-TEST-2026-001", "confidence": 0.98}],
                    },
                    {
                        "id": "ProducerEmail",
                        "values": [{"value": "maya.johnson@northstarrisk.test", "confidence": 0.98}],
                    },
                    {
                        "id": "ProducerPhone",
                        "values": [{"value": "416-555-0140", "confidence": 0.98}],
                    },
                    {
                        "id": "CarrierNAIC",
                        "values": [{"value": "19999", "confidence": 0.98}],
                    },
                    {
                        "id": "NumberOfEmployees",
                        "values": [{"value": 18, "confidence": 0.98}],
                    },
                ],
            }
        ]
    }

    cleaned = _coordinator().clean_entities(payload)
    remaining = _coordinator().semantic_sections_to_entity_map(cleaned)

    assert remaining["PolicyNumber"][0]["value"] == "PKG-TEST-2026-001"
    assert remaining["ProducerEmail"][0]["value"] == "maya.johnson@northstarrisk.test"
    assert remaining["ProducerPhone"][0]["value"] == "416-555-0140"
    assert remaining["CarrierNAIC"][0]["value"] == "19999"
    assert remaining["NumberOfEmployees"][0]["value"] == 18


def test_dedupe_prefers_template_values_over_alias_values_at_same_confidence():
    payload = {
        "semantic_sections": [
            {
                "key": "policy",
                "fields": [
                    {
                        "id": "PolicyNumber",
                        "values": [
                            {
                                "value": "PKG-ALIAS-2026",
                                "confidence": 0.98,
                                "source": {"extraction_rule": "pdf_field_alias"},
                                "tags": ["fillable_pdf", "alias"],
                            },
                            {
                                "value": "PKG-TEMPLATE-2026",
                                "confidence": 0.98,
                                "source": {"extraction_rule": "pdf_field_template"},
                                "tags": ["fillable_pdf", "template"],
                            },
                        ],
                    }
                ],
            }
        ]
    }

    deduped = _coordinator().dedupe_entity_values(payload)
    remaining = _coordinator().semantic_sections_to_entity_map(deduped)

    assert remaining["PolicyNumber"][0]["value"] == "PKG-TEMPLATE-2026"


def test_merge_inputs_adds_package_sources_and_field_source_file_provenance():
    coordinator = _coordinator()
    merged = coordinator.merge_inputs(
        [
            {
                "input_id": "input-25",
                "filename": "acord_25_test_filled.pdf",
                "document_type": "acord_25",
                "confidence": 0.98,
                "data": {
                    "source": {
                        "file_name": "acord_25_test_filled.pdf",
                        "file_type": "pdf",
                        "extraction_method": "fillable_pdf",
                        "extracted_at": "2026-04-17T00:00:00",
                    },
                    "metadata": {"form_type_detected": "ACORD_25"},
                    "semantic_sections": [
                        {
                            "key": "insured",
                            "fields": [
                                {
                                    "id": "InsuredName",
                                    "values": [
                                        {
                                            "value": "Redwood Custom Builders LLC",
                                            "confidence": 0.98,
                                            "source": {"extraction_rule": "pdf_field_template"},
                                            "tags": ["fillable_pdf", "template"],
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                },
            },
            {
                "input_id": "input-140",
                "filename": "acord_140_test_filled.pdf",
                "document_type": "acord_140",
                "confidence": 0.98,
                "data": {
                    "source": {
                        "file_name": "acord_140_test_filled.pdf",
                        "file_type": "pdf",
                        "extraction_method": "fillable_pdf",
                        "extracted_at": "2026-04-17T00:00:00",
                    },
                    "metadata": {"form_type_detected": "ACORD_140"},
                    "semantic_sections": [
                        {
                            "key": "locations",
                            "fields": [
                                {
                                    "id": "TotalInsuredValue",
                                    "values": [
                                        {
                                            "value": 2600000,
                                            "confidence": 0.98,
                                            "source": {"extraction_rule": "pdf_field_template"},
                                            "tags": ["fillable_pdf", "template"],
                                        }
                                    ],
                                }
                            ],
                        }
                    ],
                },
            },
        ]
    )

    assert merged["source"]["file_name"] == "merged_submission"
    assert merged["source"]["file_type"] == "package"
    assert merged["raw"]["merged_input_count"] == 2
    assert [source["file_name"] for source in merged["sources"]] == [
        "acord_25_test_filled.pdf",
        "acord_140_test_filled.pdf",
    ]

    entity_map = coordinator.semantic_sections_to_entity_map(merged)
    assert entity_map["InsuredName"][0]["source"]["source_file"] == "acord_25_test_filled.pdf"
    assert entity_map["InsuredName"][0]["source"]["input_id"] == "input-25"
    assert entity_map["TotalInsuredValue"][0]["source"]["source_file"] == "acord_140_test_filled.pdf"
    assert merged["metadata"]["form_type_detected"] == "MULTI_DOCUMENT_PACKAGE"
    assert merged["metadata"]["included_form_types"] == ["ACORD_140", "ACORD_25"]


def test_merge_inputs_keeps_financial_statement_semantic_fields():
    coordinator = _coordinator()
    merged = coordinator.merge_inputs(
        [
            {
                "input_id": "financial-input",
                "filename": "2025_profit_and_loss.xlsx",
                "document_type": "financial_statement",
                "confidence": 0.91,
                "data": {
                    "source": {
                        "file_name": "2025_profit_and_loss.xlsx",
                        "file_type": "xlsx",
                        "extraction_method": "excel_parser",
                        "extracted_at": "2026-04-17T00:00:00",
                    },
                    "metadata": {"form_type_detected": "FINANCIAL_STATEMENT"},
                    "semantic_sections": [
                        {
                            "key": "financial_statement",
                            "fields": [
                                {
                                    "id": "statementType",
                                    "values": [{"value": "income_statement", "confidence": 0.91}],
                                },
                                {
                                    "id": "lineItems",
                                    "values": [
                                        {
                                            "value": {
                                                "revenue": [
                                                    {"account": "Revenue", "current_year": 1250000.0}
                                                ],
                                                "expenses": [
                                                    {"account": "Operating Expenses", "current_year": 800000.0}
                                                ],
                                            },
                                            "confidence": 0.91,
                                        }
                                    ],
                                },
                                {
                                    "id": "totals",
                                    "values": [
                                        {
                                            "value": {
                                                "revenue_total": 1250000.0,
                                                "expenses_total": 800000.0,
                                                "net_income": 450000.0,
                                            },
                                            "confidence": 0.91,
                                        }
                                    ],
                                },
                                {
                                    "id": "itemCount",
                                    "values": [{"value": 2, "confidence": 0.91}],
                                },
                            ],
                        }
                    ],
                },
            }
        ]
    )

    entity_map = coordinator.semantic_sections_to_entity_map(merged)
    assert entity_map["statementType"][0]["value"] == "income_statement"
    assert entity_map["lineItems"][0]["value"]["revenue"][0]["account"] == "Revenue"
    assert entity_map["totals"][0]["value"]["net_income"] == 450000.0
    assert entity_map["itemCount"][0]["value"] == 2
    assert entity_map["totals"][0]["source"]["source_file"] == "2025_profit_and_loss.xlsx"
    assert merged["metadata"]["included_form_types"] == ["FINANCIAL_STATEMENT"]


def test_clean_raw_mapped_fields_filters_obvious_mismatches():
    payload = {
        "raw": {
            "mapped_fields": {
                "EmailAddress": "425 Market Street",
                "ProducerEmail": "maya.johnson@northstarrisk.test",
                "RateStateName": "1.00",
                "OtherStateA": "CA",
                "UmbrellaAdditionalInsuredCode": "TEST-001",
                "UmbrellaInsurerLetter": "E",
            },
            "shared_fields": {
                "InsuredName": "Redwood Custom Builders LLC",
            },
        }
    }

    cleaned = _coordinator().clean_raw_mapped_fields(payload)
    mapped = cleaned["raw"]["mapped_fields"]

    assert "EmailAddress" not in mapped
    assert "RateStateName" not in mapped
    assert "UmbrellaAdditionalInsuredCode" not in mapped
    assert mapped["ProducerEmail"] == "maya.johnson@northstarrisk.test"
    assert mapped["OtherStateA"] == "CA"
    assert mapped["UmbrellaInsurerLetter"] == "E"
