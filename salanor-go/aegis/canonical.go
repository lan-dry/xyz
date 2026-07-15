package aegis

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/gowebpki/jcs"
)

var signatureFields = map[string]struct{}{
	"sig_alg":         {},
	"sig_value_b64":   {},
}

// SigningDigest returns APS-1 §3.2 digest (JCS signing object + domain prefix).
func SigningDigest(event map[string]any, keyID string) ([]byte, error) {
	signing := stripSignatureFields(event)
	raw, err := json.Marshal(signing)
	if err != nil {
		return nil, err
	}
	jcsBytes, err := jcs.Transform(raw)
	if err != nil {
		return nil, err
	}
	prefixed := fmt.Sprintf("APS1\n%s\n%s", keyID, string(jcsBytes))
	sum := sha256.Sum256([]byte(prefixed))
	return sum[:], nil
}

func stripSignatureFields(event map[string]any) map[string]any {
	out := make(map[string]any, len(event))
	for k, v := range event {
		if _, skip := signatureFields[k]; !skip {
			out[k] = v
		}
	}
	return out
}

// SignEvent attaches ed25519 signature fields to the event map.
func SignEvent(event map[string]any, privateKeyB64, keyID string) (map[string]any, error) {
	privRaw, err := base64.StdEncoding.DecodeString(privateKeyB64)
	if err != nil {
		return nil, err
	}
	if len(privRaw) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("ed25519 private key must be 32 bytes")
	}
	priv := ed25519.NewKeyFromSeed(privRaw)
	digest, err := SigningDigest(event, keyID)
	if err != nil {
		return nil, err
	}
	sig := ed25519.Sign(priv, digest)
	signed := make(map[string]any, len(event)+2)
	for k, v := range event {
		signed[k] = v
	}
	signed["sig_alg"] = "ed25519"
	signed["sig_value_b64"] = base64.StdEncoding.EncodeToString(sig)
	return signed, nil
}
