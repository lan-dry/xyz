package aegis_test

import (
	"testing"

	"github.com/salanor/salanor-go/aegis"
)

func TestSigningDigestDeterministic(t *testing.T) {
	event := map[string]any{
		"schema_version":  1,
		"event_id":        "evt_test",
		"organization_id": "11111111-1111-4111-8111-111111111111",
		"trace_id":        "trc_test",
		"agent_id":        "agent-dev-01",
		"key_id":          "key-dev-01",
		"emitted_at":      "2026-05-21T00:00:00.000Z",
		"actor_type":      "agent",
		"actor_principal": "test",
		"action_kind":     "tool_call",
		"policy_decision": "allow",
		"payload":         map[string]any{"k": "v"},
	}
	d1, err := aegis.SigningDigest(event, "key-dev-01")
	if err != nil {
		t.Fatal(err)
	}
	d2, err := aegis.SigningDigest(event, "key-dev-01")
	if err != nil {
		t.Fatal(err)
	}
	if string(d1) != string(d2) {
		t.Fatalf("digest not stable")
	}
}

func TestVerifyPublicBundleTamper(t *testing.T) {
	bundle := &aegis.PublicBundle{
		OrganizationID: "org",
		EventID:        "evt",
		EventHash:      "aa",
	}
	bundle.Witness.RootHash = "bb"
	bundle.Witness.MerklePath = nil
	bundle.Transparency.LeafHash = "cc"
	bundle.Transparency.LogRootHash = "dd"
	result := aegis.VerifyPublicBundle(bundle)
	if result.OK {
		t.Fatal("expected tampered bundle to fail")
	}
}
