package api

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"
	"time"

	"fms/internal/fleet"
	"fms/internal/sim"
)

// Lists the contract declares required. Anything here must reach a client as `[]`.
var requiredLists = []string{"units", "alarms", "facilityStops", "unitStops", "trail", "floors", "rects", "paths", "labels"}

// The two fields the contract declares nullable, and the only two.
var nullableFields = []string{"floor", "pose", "task", "taskProgress", "unitId", "acknowledgedBy"}

// No required list is ever served as null.
//
// A nil Go slice marshals to `null`, so a unit that has never moved serves `"trail": null`
// and the map throws on it. Checking one field at a time leaves the next one to be found in
// a browser, by a blank screen, so this walks the whole payload.
func TestRequiredListsAreNeverNull(t *testing.T) {
	world, err := sim.Load("")
	if err != nil {
		t.Fatalf("load fixtures: %v", err)
	}
	clock := time.Date(2026, 11, 11, 14, 23, 12, 0, time.UTC)
	store := fleet.NewStore(func() time.Time { return clock }, world.Sites, world.Units, world.Alarms)
	handler := New(store, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, nil)

	for _, path := range []string{"/api/v1/fleet", "/api/v1/sites"} {
		t.Run(path, func(t *testing.T) {
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
			if rec.Code != http.StatusOK {
				t.Fatalf("status %d", rec.Code)
			}

			var payload any
			if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode: %v", err)
			}
			for _, found := range nullsIn(payload, "") {
				t.Errorf("%s was served as null", found)
			}
		})
	}
}

// nullsIn walks decoded JSON and returns the paths of required lists that came back null.
func nullsIn(value any, path string) []string {
	switch typed := value.(type) {
	case map[string]any:
		var found []string
		for key, child := range typed {
			where := key
			if path != "" {
				where = path + "." + key
			}
			if child == nil {
				if slices.Contains(requiredLists, key) {
					found = append(found, where)
				}
				if !slices.Contains(nullableFields, key) && !slices.Contains(requiredLists, key) {
					found = append(found, where+" (not declared nullable)")
				}
				continue
			}
			found = append(found, nullsIn(child, where)...)
		}
		return found

	case []any:
		var found []string
		for _, child := range typed {
			found = append(found, nullsIn(child, path+"[]")...)
		}
		return found

	default:
		return nil
	}
}
