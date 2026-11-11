package api

import (
	"context"
	"errors"
	"net/http"
	"time"

	"github.com/coder/websocket"
	"github.com/coder/websocket/wsjson"

	"fms/internal/fleet"
)

const (
	// Long enough to be cheap, short enough to beat the 60 s idle timeout a default nginx
	// ingress applies to an upstream connection.
	heartbeatEvery = 15 * time.Second
	// A write that cannot complete in this long means the client is gone or wedged.
	writeTimeout = 10 * time.Second
)

// meta is on every frame. Version increases by exactly one per published change, which is
// how a client discovers it missed one.
type meta struct {
	Type       string `json:"type"`
	Version    int64  `json:"version"`
	ServerTime int64  `json:"serverTime"`
}

type snapshotFrame struct {
	Type string `json:"type"`
	fleet.Snapshot
}

type unitsFrame struct {
	meta
	Units []unitDelta `json:"units"`
}

// unitDelta is a unit without its trail.
//
// The trail is the bulk of a unit's payload and changes by one point per tick, so sending
// it whole every second re-sends history the client already has. The client appends the
// previous pose instead; the rules are in docs/api/websocket.md.
//
// Trail is declared again here so the shallower field wins over the embedded one, and left
// nil so omitempty drops the key. A `json:"-"` tag would not work: it removes the field from
// consideration entirely, and the embedded Trail would be marshalled instead.
type unitDelta struct {
	fleet.Unit
	Trail []fleet.Point `json:"trail,omitempty"`
}

func withoutTrails(units []fleet.Unit) []unitDelta {
	out := make([]unitDelta, 0, len(units))
	for _, unit := range units {
		out = append(out, unitDelta{Unit: unit})
	}
	return out
}

type alarmsFrame struct {
	meta
	Alarms []fleet.Alarm `json:"alarms"`
}

type commandsFrame struct {
	meta
	FacilityStops []fleet.FacilityStop `json:"facilityStops"`
	UnitStops     []string             `json:"unitStops"`
}

type clientFrame struct {
	Type string `json:"type"`
}

// stream is the live channel: a snapshot on connect, then one frame per change.
func (s *Server) stream(w http.ResponseWriter, r *http.Request) {
	conn, err := websocket.Accept(w, r, &websocket.AcceptOptions{OriginPatterns: s.origins})
	if err != nil {
		s.log.Info("stream rejected", "err", err)
		return
	}
	defer conn.CloseNow()

	// Cancelled when the reader stops, so a client that disappears mid-write is noticed
	// without waiting for the next heartbeat to fail.
	ctx, disconnected := context.WithCancel(r.Context())
	defer disconnected()

	updates, unsubscribe := s.store.Subscribe()
	defer unsubscribe()

	// Subscribe before the snapshot, so a change landing between the two is queued rather
	// than lost: the client applies the snapshot, then a frame it can reconcile against it.
	if err := s.send(ctx, conn, snapshotFrame{Type: "snapshot", Snapshot: s.store.Snapshot()}); err != nil {
		return
	}

	resync := s.readClientFrames(ctx, conn, disconnected)
	heartbeat := time.NewTicker(heartbeatEvery)
	defer heartbeat.Stop()

	for {
		select {
		case <-ctx.Done():
			return

		case <-resync:
			if err := s.send(ctx, conn, snapshotFrame{Type: "snapshot", Snapshot: s.store.Snapshot()}); err != nil {
				return
			}

		case <-heartbeat.C:
			snapshot := s.store.Snapshot()
			frame := meta{Type: "heartbeat", Version: snapshot.Version, ServerTime: snapshot.ServerTime}
			if err := s.send(ctx, conn, frame); err != nil {
				return
			}

		case update, ok := <-updates:
			if !ok {
				return
			}
			if err := s.send(ctx, conn, frameFor(update)); err != nil {
				return
			}
		}
	}
}

// readClientFrames drains the socket and signals when the client asks to resynchronise.
//
// Reading is not optional even though `resync` is the only frame a client sends: an
// unread connection never sees a close or a protocol error, so the server would hold it
// open long after the browser tab is gone.
func (s *Server) readClientFrames(
	ctx context.Context,
	conn *websocket.Conn,
	disconnected context.CancelFunc,
) <-chan struct{} {
	resync := make(chan struct{}, 1)

	go func() {
		// Not closed on the way out: a closed channel is always ready to receive, which
		// would spin the writer sending snapshots to a client that has already gone.
		defer disconnected()
		for {
			var frame clientFrame
			if err := wsjson.Read(ctx, conn, &frame); err != nil {
				return
			}
			if frame.Type != "resync" {
				continue // unknown frames are ignored, so new ones need no client release
			}
			select {
			case resync <- struct{}{}:
			default: // one pending resync answers any number of requests
			}
		}
	}()

	return resync
}

func (s *Server) send(ctx context.Context, conn *websocket.Conn, frame any) error {
	ctx, cancel := context.WithTimeout(ctx, writeTimeout)
	defer cancel()

	err := wsjson.Write(ctx, conn, frame)
	if err != nil && !errors.Is(err, context.Canceled) {
		s.log.Debug("stream write failed", "err", err)
	}
	return err
}

func frameFor(update fleet.Update) any {
	head := meta{Type: string(update.Kind), Version: update.Version, ServerTime: update.ServerTime}

	switch update.Kind {
	case fleet.UpdateUnits:
		return unitsFrame{meta: head, Units: withoutTrails(update.Units)}
	case fleet.UpdateAlarms:
		return alarmsFrame{meta: head, Alarms: update.Alarms}
	default:
		return commandsFrame{
			meta:          head,
			FacilityStops: fleet.NonNil(update.FacilityStops),
			UnitStops:     fleet.NonNil(update.UnitStops),
		}
	}
}
