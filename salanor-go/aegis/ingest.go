package aegis

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

type IngestOptions struct {
	APIBaseURL     string
	IngestAPIKey   string
	IdempotencyKey string
}

type IngestResult struct {
	EventID      string `json:"event_id"`
	Status       string `json:"status"`
	SequenceNum  *int64 `json:"sequence_num,omitempty"`
	EventHash    string `json:"event_hash,omitempty"`
	Error        string `json:"error,omitempty"`
}

// IngestSigned posts a signed APS-1 event to the Aegis API.
func IngestSigned(event map[string]any, opts IngestOptions) (*IngestResult, error) {
	body, err := json.Marshal(event)
	if err != nil {
		return nil, err
	}
	url := opts.APIBaseURL + "/v1/aegis/events"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+opts.IngestAPIKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Salanor-Version", "2026-05-18")
	if opts.IdempotencyKey != "" {
		req.Header.Set("Idempotency-Key", opts.IdempotencyKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	raw, _ := io.ReadAll(resp.Body)
	var result IngestResult
	if err := json.Unmarshal(raw, &result); err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return &result, fmt.Errorf("ingest failed (%d): %s", resp.StatusCode, result.Error)
	}
	return &result, nil
}

// SignAndIngest signs the event with Ed25519 and posts it to ingest.
func SignAndIngest(
	event map[string]any,
	privateKeyB64, keyID string,
	opts IngestOptions,
) (*IngestResult, error) {
	signed, err := SignEvent(event, privateKeyB64, keyID)
	if err != nil {
		return nil, err
	}
	return IngestSigned(signed, opts)
}
