package aegis_test

import (
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/salanor/salanor-go/aegis"
)

type vectorFile struct {
	Cases []struct {
		Name              string         `json:"name"`
		KeyID             string         `json:"key_id"`
		Event             map[string]any `json:"event"`
		DigestHex         string         `json:"digest_hex"`
		PrivateKeySeedB64 string         `json:"private_key_seed_b64"`
		SigValueB64       string         `json:"sig_value_b64"`
	} `json:"cases"`
}

func loadVectors(t *testing.T) vectorFile {
	t.Helper()
	_, thisFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	path := filepath.Join(filepath.Dir(thisFile), "..", "conformance", "vectors", "signing-digest-v1.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var vf vectorFile
	if err := json.Unmarshal(raw, &vf); err != nil {
		t.Fatal(err)
	}
	return vf
}

func TestConformanceSigningVectors(t *testing.T) {
	vf := loadVectors(t)
	for _, c := range vf.Cases {
		t.Run(c.Name, func(t *testing.T) {
			digest, err := aegis.SigningDigest(c.Event, c.KeyID)
			if err != nil {
				t.Fatal(err)
			}
			got := hex.EncodeToString(digest)
			if got != c.DigestHex {
				t.Fatalf("digest mismatch:\n  got:  %s\n  want: %s", got, c.DigestHex)
			}
			if c.PrivateKeySeedB64 != "" && c.SigValueB64 != "" {
				signed, err := aegis.SignEvent(c.Event, c.PrivateKeySeedB64, c.KeyID)
				if err != nil {
					t.Fatal(err)
				}
				sig, _ := signed["sig_value_b64"].(string)
				if sig != c.SigValueB64 {
					t.Fatalf("signature mismatch:\n  got:  %s\n  want: %s", sig, c.SigValueB64)
				}
			}
		})
	}
}
