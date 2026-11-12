// Command server serves the fleet API and the telemetry stream.
package main

import (
	"context"
	"errors"
	"flag"
	"fmt"
	"io/fs"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"time"

	"fms/internal/api"
	"fms/internal/fleet"
	"fms/internal/sim"
)

func main() {
	addr := flag.String("addr", defaultAddr(), "listen address")
	tick := flag.Duration("tick", time.Second, "telemetry interval")
	outage := flag.String("outage", "", "start with this facility unreachable, e.g. clinic")
	origins := flag.String("origins", "127.0.0.1:5173,localhost:5173",
		"comma-separated hosts allowed to open the stream")
	flag.Parse()

	log := newLogger()
	slog.SetDefault(log)

	if err := run(*addr, *tick, *outage, splitOrigins(*origins), log); err != nil {
		log.Error("server stopped", "err", err)
		os.Exit(1)
	}
}

func run(addr string, tick time.Duration, outage string, origins []string, log *slog.Logger) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	world, err := sim.Load(outage)
	if err != nil {
		return err
	}

	ui, err := embeddedUI()
	if err != nil {
		return fmt.Errorf("read bundled web UI: %w", err)
	}

	store := fleet.NewStore(time.Now, world.Sites, world.Units, world.Alarms)
	go world.Simulator(store, tick).Run(ctx)

	srv := &http.Server{
		Addr:              addr,
		Handler:           api.New(store, log, origins, ui),
		ReadHeaderTimeout: 5 * time.Second,
		// Deliberately no WriteTimeout: it would guillotine the stream mid-flight. Idle
		// HTTP connections are bounded below instead.
		IdleTimeout: 2 * time.Minute,
	}

	go func() {
		<-ctx.Done()
		log.Info("shutting down")
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = srv.Shutdown(shutdown)
	}()

	log.Info("listening", "addr", addr, "units", len(world.Units), "outage", outage,
		"web_ui", bundled(ui))
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// defaultAddr binds loopback for development and every interface when a platform injects a
// port, which is how container hosts say "listen here".
func defaultAddr() string {
	if port := os.Getenv("PORT"); port != "" {
		return ":" + port
	}
	return "127.0.0.1:8080"
}

func splitOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	return out
}

func newLogger() *slog.Logger {
	opts := &slog.HandlerOptions{Level: slog.LevelInfo}
	if os.Getenv("LOG_LEVEL") == "debug" {
		opts.Level = slog.LevelDebug
	}
	if os.Getenv("LOG_FORMAT") == "text" {
		return slog.New(slog.NewTextHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, opts))
}

// bundled says whether this binary carries the built web UI, which is the first thing to
// check when the API answers and the page does not.
func bundled(ui fs.FS) bool {
	_, err := fs.Stat(ui, "index.html")
	return err == nil
}
