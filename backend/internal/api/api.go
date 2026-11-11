// Package api exposes the fleet over HTTP and one WebSocket.
//
// The split is by what the traffic is, not by what the transport can do: anything an
// operator asks for is a request with an answer and goes over HTTP, where status codes,
// idempotency and audit already exist; anything that changes on its own arrives on the
// stream.
package api

import (
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"log/slog"
	"net/http"

	"fms/internal/fleet"
)

// Operator is who acknowledgements are attributed to until sign-in exists.
const Operator = "you"

type Server struct {
	store   *fleet.Store
	log     *slog.Logger
	origins []string
}

// New wires the routes.
//
// allowedOrigins are the hosts permitted to open the stream, over and above the server's
// own: a browser served the web UI from this binary is already same-origin. ui is the
// built bundle; pass nil to run API-only, which is what the tests do.
func New(store *fleet.Store, log *slog.Logger, allowedOrigins []string, ui fs.FS) http.Handler {
	s := &Server{store: store, log: log, origins: allowedOrigins}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/healthz", s.health)
	mux.HandleFunc("GET /api/v1/sites", s.listSites)
	mux.HandleFunc("GET /api/v1/fleet", s.getFleet)
	mux.HandleFunc("POST /api/v1/units/{unitId}/commands", s.sendUnitCommand)
	mux.HandleFunc("PUT /api/v1/sites/{siteId}/emergency-stop", s.setEmergencyStop)
	mux.HandleFunc("POST /api/v1/alarms/acknowledge", s.acknowledgeAlarms)
	mux.HandleFunc("GET /api/v1/stream", s.stream)

	// Registered after the API so an unmatched /api/ path answers as an API would, rather
	// than falling through to the web UI. The router prefers the longer pattern, so the
	// seven routes above are unaffected.
	mux.HandleFunc("/api/", s.apiNotFound)
	if ui != nil {
		mux.Handle("/", uiHandler(ui))
	}
	return mux
}

func (s *Server) health(w http.ResponseWriter, _ *http.Request) {
	_, _ = io.WriteString(w, "ok")
}

func (s *Server) listSites(w http.ResponseWriter, _ *http.Request) {
	// The buildings do not change between deployments, so a client that reconnects should
	// not be made to download them again.
	w.Header().Set("Cache-Control", "public, max-age=300")
	s.writeJSON(w, http.StatusOK, map[string]any{"sites": s.store.Sites()})
}

func (s *Server) getFleet(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Cache-Control", "no-store")
	s.writeJSON(w, http.StatusOK, s.store.Snapshot())
}

func (s *Server) sendUnitCommand(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Command string `json:"command"`
	}
	if !s.decodeJSON(w, r, &body) {
		return
	}

	command, ok := fleet.ParseCommand(body.Command)
	if !ok {
		s.writeProblem(w, http.StatusBadRequest, "Unknown command", body.Command)
		return
	}

	unitID := r.PathValue("unitId")
	if err := s.store.SendCommand(unitID, command); err != nil {
		s.writeRefusal(w, err)
		return
	}

	s.log.Info("command accepted", "unit_id", unitID, "command", command)
	s.writeJSON(w, http.StatusAccepted, map[string]bool{"accepted": true})
}

func (s *Server) setEmergencyStop(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Engaged bool `json:"engaged"`
	}
	if !s.decodeJSON(w, r, &body) {
		return
	}

	siteID := r.PathValue("siteId")
	if err := s.store.SetEmergencyStop(siteID, body.Engaged); err != nil {
		s.writeRefusal(w, err)
		return
	}

	s.log.Warn("emergency stop", "site_id", siteID, "engaged", body.Engaged)
	s.writeJSON(w, http.StatusAccepted, map[string]bool{"accepted": true})
}

func (s *Server) acknowledgeAlarms(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Seqs []int64 `json:"seqs"`
	}
	if !s.decodeJSON(w, r, &body) {
		return
	}
	if len(body.Seqs) == 0 {
		s.writeProblem(w, http.StatusBadRequest, "Nothing to acknowledge", "seqs was empty")
		return
	}

	count := s.store.Acknowledge(body.Seqs, Operator)
	s.log.Info("alarms acknowledged", "requested", len(body.Seqs), "changed", count)
	s.writeJSON(w, http.StatusOK, map[string]int{"acknowledged": count})
}

// decodeJSON reads a small body and reports whether the handler should continue. It writes
// the error response itself, so handlers stay flat.
func (s *Server) decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8<<10))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		s.writeProblem(w, http.StatusBadRequest, "Malformed request body", err.Error())
		return false
	}
	return true
}

func (s *Server) writeRefusal(w http.ResponseWriter, err error) {
	var refusal *fleet.RefusedError
	if errors.As(err, &refusal) {
		title := "Command refused"
		if refusal.Status == http.StatusNotFound {
			title = "Not found"
		}
		s.writeProblem(w, refusal.Status, title, refusal.Detail)
		return
	}
	s.log.Error("command failed", "err", err)
	s.writeProblem(w, http.StatusInternalServerError, "Command failed", "")
}

// writeProblem answers with RFC 9457 problem details. `detail` is shown to an operator, so
// it is phrased for one.
func (s *Server) writeProblem(w http.ResponseWriter, status int, title, detail string) {
	w.Header().Set("Content-Type", "application/problem+json")
	w.WriteHeader(status)
	s.encode(w, map[string]any{"title": title, "status": status, "detail": detail})
}

func (s *Server) writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	s.encode(w, body)
}

func (s *Server) encode(w http.ResponseWriter, body any) {
	if err := json.NewEncoder(w).Encode(body); err != nil {
		// The status line is already on the wire, so there is nothing to tell the client.
		s.log.Error("response encode failed", "err", err)
	}
}
