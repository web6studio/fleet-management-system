package main

import (
	"embed"
	"io/fs"
)

// The web UI, compiled into the binary.
//
// `ui/` holds the vite build; everything in it is generated except `unbuilt.html`, which is
// committed so `go:embed` has something to anchor on in a fresh clone and so a binary built
// without the front end serves a page that says which step was skipped.
//
// `all:` keeps dot-prefixed files, which vite does not emit today but might.
//
//go:embed all:ui
var uiFS embed.FS

// embeddedUI returns the bundle rooted at the directory the browser sees.
func embeddedUI() (fs.FS, error) {
	return fs.Sub(uiFS, "ui")
}
