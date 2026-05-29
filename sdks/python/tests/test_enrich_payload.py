from salanor_aegis.enrich_payload import enrich_provenance_payload


def test_enrich_llm_provider() -> None:
    out = enrich_provenance_payload(
        payload={"purpose": "triage"},
        tool_name="google.generativeai.classify",
        action_kind="llm_invocation",
    )
    assert out["provider"] == "google"
    assert out["action"] == "triage"


def test_enrich_policy_authority() -> None:
    out = enrich_provenance_payload(
        payload={"trigger_source": "webhook"},
        tool_name="stripe.paymentIntents.create",
        action_kind="tool_call",
        policy_id="pol_abc",
    )
    assert out["authority"] == "policy:pol_abc"
