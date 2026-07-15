package aegis

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

type MerklePathStep struct {
	Sibling  string `json:"sibling"`
	Position string `json:"position"`
}

type PublicBundle struct {
	OrganizationID   string `json:"organization_id"`
	OrganizationSlug string `json:"organization_slug"`
	EventID          string `json:"event_id"`
	EventHash        string `json:"event_hash"`
	Witness          struct {
		RootID     string           `json:"root_id"`
		RootHash   string           `json:"root_hash"`
		MerklePath []MerklePathStep `json:"merkle_path"`
	} `json:"witness"`
	Transparency struct {
		LogIndex      int              `json:"log_index"`
		LeafHash      string           `json:"leaf_hash"`
		LogRootHash   string           `json:"log_root_hash"`
		LogMerklePath []MerklePathStep `json:"log_merkle_path"`
	} `json:"transparency"`
}

type VerifyResult struct {
	OK              bool     `json:"ok"`
	WitnessOK       bool     `json:"witness_ok"`
	TransparencyOK  bool     `json:"transparency_ok"`
	LeafOK          bool     `json:"leaf_ok"`
	Errors          []string `json:"errors"`
}

func hashPair(left, right string) string {
	h := sha256.New()
	h.Write([]byte(left + right))
	return hex.EncodeToString(h.Sum(nil))
}

func verifyMerkleProof(leafHash, rootHash string, path []MerklePathStep) bool {
	current := leafHash
	for _, step := range path {
		if step.Position == "right" {
			current = hashPair(current, step.Sibling)
		} else {
			current = hashPair(step.Sibling, current)
		}
	}
	return current == rootHash
}

func transparencyLeafHash(orgID string, logIndex int, eventID, eventHash, rootID string) string {
	body := strings.Join([]string{
		"APS-TL1",
		orgID,
		fmt.Sprintf("%d", logIndex),
		eventID,
		eventHash,
		rootID,
	}, "\n")
	sum := sha256.Sum256([]byte(body))
	return hex.EncodeToString(sum[:])
}

// FetchPublicBundle loads the public verification bundle for an event.
func FetchPublicBundle(apiBase, orgSlug, eventID string) (*PublicBundle, error) {
	url := strings.TrimSuffix(apiBase, "/") +
		"/v1/public/orgs/" + orgSlug + "/verify/" + eventID
	resp, err := http.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch bundle (%d): %s", resp.StatusCode, string(raw))
	}
	var bundle PublicBundle
	if err := json.Unmarshal(raw, &bundle); err != nil {
		return nil, err
	}
	return &bundle, nil
}

// VerifyPublicBundle checks witness + transparency inclusion (no Salanor SDK deps).
func VerifyPublicBundle(bundle *PublicBundle) VerifyResult {
	errs := []string{}
	witnessOK := verifyMerkleProof(
		bundle.EventHash,
		bundle.Witness.RootHash,
		bundle.Witness.MerklePath,
	)
	if !witnessOK {
		errs = append(errs, "witness merkle inclusion failed")
	}
	transparencyOK := verifyMerkleProof(
		bundle.Transparency.LeafHash,
		bundle.Transparency.LogRootHash,
		bundle.Transparency.LogMerklePath,
	)
	if !transparencyOK {
		errs = append(errs, "transparency log merkle inclusion failed")
	}
	expectedLeaf := transparencyLeafHash(
		bundle.OrganizationID,
		bundle.Transparency.LogIndex,
		bundle.EventID,
		bundle.EventHash,
		bundle.Witness.RootID,
	)
	leafOK := bundle.Transparency.LeafHash == expectedLeaf
	if !leafOK {
		errs = append(errs, "transparency leaf hash mismatch")
	}
	return VerifyResult{
		OK:             witnessOK && transparencyOK && leafOK,
		WitnessOK:      witnessOK,
		TransparencyOK: transparencyOK,
		LeafOK:         leafOK,
		Errors:         errs,
	}
}
