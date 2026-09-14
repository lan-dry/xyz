from salanor_aegis.events import build_policy_decision_event


def test_build_policy_deny_event() -> None:
    event = build_policy_decision_event(
        organization_id="11111111-1111-4111-8111-111111111111",
        trace_id="trc_test",
        agent_id="agent-1",
        key_id="key-1",
        tool_name="stripe.paymentIntents.create",
        decision="deny",
        actor_principal="bot",
        policy_id="pol_1",
        rule_id="rule_deny_payment",
        reason="payments blocked",
    )
    assert event["action_kind"] == "policy_decision"
    assert event["policy_decision"] == "deny"
    assert event["payload"]["rule_id"] == "rule_deny_payment"
