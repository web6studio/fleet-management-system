package api

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"fms/internal/fleet"
)

func testHandler() http.Handler {
	clock := time.Date(2026, 11, 11, 14, 23, 12, 0, time.UTC)
	sites := []fleet.Site{{ID: "hotel", Name: "Hotel", Floors: []string{"F1"}}}
	units := []fleet.Unit{{ID: "PUD-101", SiteID: "hotel", State: fleet.StateActive, Battery: 80}}
	alarms := []fleet.Alarm{{Seq: 1, SiteID: "hotel", Severity: fleet.Sev1}}

	store := fleet.NewStore(func() time.Time { return clock }, sites, units, alarms)
	return New(store, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)
}

func send(t *testing.T, method, path, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	testHandler().ServeHTTP(rec, req)
	return rec
}

// A command answers 202, never 200.
//
// Prevents the API promising more than it can deliver. The instruction is queued; the unit's
// next telemetry frame is what confirms it happened. A 200 would invite a client to render
// the result immediately and show an operator a unit they believe they stopped still moving.
func TestCommandIsAcceptedNotApplied(t *testing.T) {
	rec := send(t, http.MethodPost, "/api/v1/units/PUD-101/commands", `{"command":"stop"}`)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("status %d, want 202: %s", rec.Code, rec.Body)
	}
}

// Prevents a typo being carried out. `DisallowUnknownFields` means a client that misspells a
// field hears about it rather than having the default silently applied.
func TestMalformedRequestsAreRejected(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
		status int
	}{
		{"unknown unit", http.MethodPost, "/api/v1/units/NOPE/commands", `{"command":"stop"}`, 404},
		{"unknown command", http.MethodPost, "/api/v1/units/PUD-101/commands", `{"command":"fly"}`, 400},
		{"unknown field", http.MethodPost, "/api/v1/units/PUD-101/commands", `{"cmd":"stop"}`, 400},
		{"not json", http.MethodPost, "/api/v1/units/PUD-101/commands", `nope`, 400},
		{"unknown facility", http.MethodPut, "/api/v1/sites/nowhere/emergency-stop", `{"engaged":true}`, 404},
		{"nothing to acknowledge", http.MethodPost, "/api/v1/alarms/acknowledge", `{"seqs":[]}`, 400},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := send(t, tc.method, tc.path, tc.body)
			if rec.Code != tc.status {
				t.Fatalf("status %d, want %d: %s", rec.Code, tc.status, rec.Body)
			}
			if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
				t.Errorf("content type %q, want problem details", got)
			}
			var problem struct {
				Detail string `json:"detail"`
			}
			if err := json.Unmarshal(rec.Body.Bytes(), &problem); err != nil {
				t.Fatalf("decode problem: %v", err)
			}
			if problem.Detail == "" {
				t.Error("refused without saying why")
			}
		})
	}
}

// Prevents a reconnecting client being made to download the buildings again. They do not
// change between deployments, and at eleven storeys of geometry they are the largest thing
// the API serves.
func TestSitesAreCacheable(t *testing.T) {
	rec := send(t, http.MethodGet, "/api/v1/sites", "")
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d, want 200", rec.Code)
	}
	if rec.Header().Get("Cache-Control") == "" {
		t.Error("sites served without a caching policy")
	}
}

// Prevents a stale fleet being served from a proxy. Everything here changes every second.
func TestFleetIsNotCacheable(t *testing.T) {
	rec := send(t, http.MethodGet, "/api/v1/fleet", "")
	if got := rec.Header().Get("Cache-Control"); got != "no-store" {
		t.Errorf("cache-control %q, want no-store", got)
	}

	var snapshot fleet.Snapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &snapshot); err != nil {
		t.Fatalf("decode snapshot: %v", err)
	}
	if len(snapshot.Units) != 1 {
		t.Errorf("units %d, want 1", len(snapshot.Units))
	}
	// Empty lists must stay lists: `null` for "nothing is stopped" forces every client to
	// special-case it.
	if snapshot.FacilityStops == nil || snapshot.UnitStops == nil {
		t.Error("empty lists serialised as null")
	}
}
