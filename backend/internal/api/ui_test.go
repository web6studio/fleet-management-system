package api

import (
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"
	"time"

	"fms/internal/fleet"
)

func uiServer(t *testing.T, files fstest.MapFS) http.Handler {
	t.Helper()
	store := fleet.NewStore(time.Now, nil, nil, nil)
	return New(store, slog.New(slog.NewTextHandler(io.Discard, nil)), nil, files)
}

func built() fstest.MapFS {
	return fstest.MapFS{
		"index.html":                {Data: []byte("<!doctype html><title>console</title>")},
		"assets/index-B9oOr3Hh.js":  {Data: []byte("console.log(1)")},
		"assets/index-DzjaOv1I.css": {Data: []byte(".a{}")},
		"favicon.svg":               {Data: []byte("<svg/>")},
		unbuiltPage:                 {Data: []byte("<!doctype html><title>not built</title>")},
	}
}

func get(t *testing.T, h http.Handler, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

// A release is never served out of a stale cache, and the bundle is never
// re-downloaded without reason.
//
// Prevents the two halves of the same mistake. Cache the shell and a deployed release keeps
// loading the previous bundle until somebody force-refreshes — a bug that reaches every
// operator at once and looks like the deploy failed. Fail to cache the hashed assets and
// every page load pulls 300 kB that provably cannot have changed, because the content hash
// is in the file name.
func TestConsoleCachePolicy(t *testing.T) {
	h := uiServer(t, built())

	shell := get(t, h, "/")
	if got := shell.Header().Get("Cache-Control"); got != "no-cache" {
		t.Errorf("shell Cache-Control = %q, want no-cache", got)
	}

	asset := get(t, h, "/assets/index-B9oOr3Hh.js")
	if got := asset.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
		t.Errorf("asset Cache-Control = %q, want a year and immutable", got)
	}
	if got := asset.Header().Get("Content-Type"); got == "text/html; charset=utf-8" {
		t.Errorf("asset served as HTML: %q", got)
	}
}

// Prevents a deleted bundle answering with the shell. A request for a missing `.js` that
// returns HTML surfaces in the browser as a MIME type error, which sends whoever debugs it
// looking at the bundler rather than at the deployment.
func TestMissingAssetIsNotTheShell(t *testing.T) {
	rec := get(t, uiServer(t, built()), "/assets/gone-abc123.js")
	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
}

// Prevents a hard refresh on a client route 404ing. The web UI is one screen today; the
// moment a second one has a URL, this is the difference between a shareable link and a
// broken one.
func TestUnknownPathServesTheShell(t *testing.T) {
	rec := get(t, uiServer(t, built()), "/units/PUD-101")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if body := rec.Body.String(); body != "<!doctype html><title>console</title>" {
		t.Errorf("served %q, want the shell", body)
	}
}

// A mistyped endpoint answers as an API, not as a web page.
//
// Prevents the console swallowing API 404s. With a catch-all serving the shell, a wrong path
// answers `200 text/html`, the client reports a JSON parse error, and the actual problem —
// a route that does not exist — is invisible in the message.
func TestUnknownAPIPathIsAProblemNotAPage(t *testing.T) {
	rec := get(t, uiServer(t, built()), "/api/v1/nonsense")

	if rec.Code != http.StatusNotFound {
		t.Errorf("status = %d, want 404", rec.Code)
	}
	if got := rec.Header().Get("Content-Type"); got != "application/problem+json" {
		t.Errorf("Content-Type = %q, want problem details", got)
	}
}

// Prevents a binary built without the front end answering with a blank 404. The person who
// sees it is a developer who skipped a build step, and the page says which one.
func TestUnbuiltConsoleExplainsItself(t *testing.T) {
	only := fstest.MapFS{unbuiltPage: {Data: []byte("run pnpm run build")}}
	rec := get(t, uiServer(t, only), "/")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if rec.Body.String() != "run pnpm run build" {
		t.Errorf("served %q, want the unbuilt page", rec.Body.String())
	}
}

// Prevents the API disappearing behind the console. The catch-all is registered last and
// `/api/` is registered as its own pattern; if either slipped, every endpoint would answer
// with HTML.
func TestAPIStillAnswersWithAConsoleMounted(t *testing.T) {
	rec := get(t, uiServer(t, built()), "/api/v1/healthz")
	if rec.Code != http.StatusOK || rec.Body.String() != "ok" {
		t.Errorf("healthz = %d %q, want 200 ok", rec.Code, rec.Body.String())
	}
}
