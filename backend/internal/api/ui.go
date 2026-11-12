package api

import (
	"io/fs"
	"net/http"
	"path"
	"strings"
)

// Serving the built web UI from the same binary as the API.
//
// One artifact is the whole deployment argument (ADR 0001): copy a binary, run it, done.
// It also makes the browser's origin the server's own, which is why the stream's origin
// check needs no extra host in production: same-origin is always allowed.

// unbuiltPage is served when the binary was built without the web UI. It is a real page
// rather than a 404, because the person seeing it is a developer who needs to be told which
// command they skipped.
const unbuiltPage = "unbuilt.html"

// uiHandler serves the single-page web UI out of fsys.
//
// Assets under /assets/ carry a content hash, so they are immutable for a year. The shell
// is never cached, or a release keeps loading the previous bundle. Anything that is not a
// file serves the shell, so a client route added later survives a hard refresh.
func uiHandler(fsys fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			w.Header().Set("Allow", "GET, HEAD")
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		// The bundle's types come from the file extension and must be taken at face value:
		// a sniffed asset is a script the page never asked for.
		w.Header().Set("X-Content-Type-Options", "nosniff")

		name := path.Clean(strings.TrimPrefix(r.URL.Path, "/"))
		if name == "." {
			name = "index.html"
		}

		// A missing asset is a 404, never the shell. Answering a request for a deleted
		// bundle with HTML produces a MIME type error in the browser and sends whoever
		// debugs it looking in the wrong place.
		if strings.HasPrefix(name, "assets/") {
			if !exists(fsys, name) {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
			http.ServeFileFS(w, r, fsys, name)
			return
		}

		// A real file outside /assets, such as a favicon or robots.txt. Short cache: these
		// keep their names across releases, so they have to be revalidated eventually.
		if name != "index.html" && exists(fsys, name) {
			w.Header().Set("Cache-Control", "public, max-age=3600")
			http.ServeFileFS(w, r, fsys, name)
			return
		}

		shell := "index.html"
		if !exists(fsys, shell) {
			shell = unbuiltPage
		}
		w.Header().Set("Cache-Control", "no-cache")
		http.ServeFileFS(w, r, fsys, shell)
	})
}

func exists(fsys fs.FS, name string) bool {
	if !fs.ValidPath(name) {
		return false
	}
	info, err := fs.Stat(fsys, name)
	if err != nil {
		return false
	}
	return !info.IsDir()
}

// apiNotFound answers an unmatched /api/ path.
//
// Without it those requests fall through to the web UI and a mistyped endpoint answers
// `200 text/html`, which a client reports as a JSON parse error rather than as the 404 it is.
func (s *Server) apiNotFound(w http.ResponseWriter, _ *http.Request) {
	s.writeProblem(w, http.StatusNotFound, "No such endpoint",
		"This path is not part of the fleet API.")
}
