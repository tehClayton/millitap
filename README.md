# millitap

Timing drills against a click. Tap the pads on the beat; the display shows how far
ahead or behind the grid each tap landed, in milliseconds, live and in aggregate.

Rushing sits above the centre line in amber, dragging below it in blue. The scrolling
history on the left and the distribution on the right share the same vertical axis, so
the history flows straight into the histogram that accumulates it.

No build step, no dependencies, no backend. Plain client-side JavaScript.

## Deploy

The deployed files — `index.html`, `manifest.webmanifest`, `sw.js` and the three PNGs —
live at the repo root, which is what GitHub Pages serves.

1. Settings → Pages → Source: `main`, folder `/ (root)`.
2. Wait about a minute. Site appears at `https://tehclayton.github.io/millitap/`.

## Install on the iPad

Open the URL in **Safari** (not Chrome — it can't do this), Share → Add to Home Screen.

Launching from the icon drops the address bar and toolbar, which returns roughly 100px
of height to the pads. The service worker caches everything on first load, so after that
it launches instantly and runs with no network at all.

Worth also turning on rotation lock, and Guided Access (Settings → Accessibility) if you
tap near the bottom edge — it disables the home indicator swipe so an enthusiastic hit on
the lower pads doesn't dump you back to the home screen.

## Changing anything

**Bump `VERSION` in `sw.js` every single time you push.** Nothing else busts the cache.
Not a hard refresh, not clearing Safari's history, not waiting. GitHub Pages has its own
CDN cache on top of the service worker cache, and between the two you will be completely
convinced your commit didn't deploy. It did. You forgot the constant.

Rhythms live in the `PATTERNS` array. Each onset is `{p, o, v}`:

- `p` — position in beats
- `o` — microtiming offset as a **fraction of a beat**, so a feel holds up across tempo changes
- `v` — which pad (optional; defaults to alternating across however many pads exist)

Swing is an offset on every second eighth. Laid-back backbeats are a positive offset on
beats 2 and 4. Transcribe a groove off a record by measuring its offsets and writing them
in the same form.

The three PNGs are generated, not hand-drawn — [tools/icon.py](tools/icon.py) draws them
(needs Pillow). Run it from the repo root and it overwrites the icons in place.

## Reading the numbers

**Spread** is the number that matters. Average tells you where you sit; spread tells you
how consistent you are, and it's the one that improves with practice. Skilled players land
around 10–20 ms against a click, less experienced 20–40 ms.

**An average 20–50 ms ahead is normal and you should leave it alone.** Tapping slightly
early against a metronome is a well-documented perceptual effect, not a fault in your
playing and not a calibration error. Dialling it out with the offset slider erases exactly
the thing worth watching.

Use the audio offset only for hardware delay the browser can't see. Bluetooth adds
100–300 ms and reports it unreliably; wired or the built-in speaker gives much cleaner
numbers.

## The diagnostic

Settings → Advanced → *Jam the main thread*. This settles one question, and every figure
the app reports depends on the answer: does your browser stamp a tap when the hardware
delivered it, or when the page got round to handling the event? If it's the latter, the
numbers carry whatever the page was busy with.

The answer varies by engine and by device, so it's worth checking wherever you run this
rather than assuming it from somewhere else. On native iOS `UIEvent.timestamp` is hardware
time; on the web it is not guaranteed.

Turn the toggle on and play a drill. The page is stalled on purpose, and the panel reports
what it finds:

- **Hardware-derived** → a tap arrived tens of milliseconds late and still carried its own
  time. Page stalls can't corrupt your readings, and the web version has no timing ceiling
  worth worrying about.
- **Assigned at handling** → taps under the stall never read as late, so the stamp is
  written by the handler that reads it. Every reading carries whatever jitter the page had
  that frame, and a native port is the fix.

The two verdicts need different amounts of evidence, which is why one appears faster than
the other. A single late-but-accurate tap proves the stamp predates the handler — nothing
else could produce it. The opposite is a negative claim, so it waits for a dozen taps: the
stall burns 45 ms in every 137, meaning a tap misses it about two times in three, and four
low readings are four coincidences rather than a result.

It reports nothing at all with the stall off. A low lag figure then only means the page
wasn't busy, which is no evidence either way.

This replaced an earlier method of running a drill twice and comparing the spread. Errors
add in quadrature, so against a typical 15 ms spread, 5 ms of injected jitter reads as
15.8 ms and is invisible — the lag figure answers directly what the spread could only
hint at.

## Known limits vs. a native app

- **No MIDI.** iOS Safari has no Web MIDI, so no e-kit, no pad controller, no USB. This is
  the one that would eventually force a Swift port.
- **No `outputLatency`.** Safari implements `baseLatency` only, so the true device-to-ear
  figure isn't available and the offset slider stands in for it.
- **No IO buffer control.** Costs constant latency rather than jitter, so it calibrates out.
- **The hardware mute switch silences it.** Native would set `AVAudioSession` to `.playback`
  and ignore the switch. If the click vanishes, check the switch first.

## Contributing

See [CLAUDE.md](CLAUDE.md) for branching and commit conventions. Work goes on a
branch and lands via pull request; `main` takes no direct commits.

## Support

millitap is free and has no accounts, no tracking and no backend — it is a page
that runs on your device. If it has been useful,
[buy me a coffee](https://buymeacoffee.com/ditherstudio) for a one-off tip, or
[Patreon](https://www.patreon.com/DitherStudio) to support ongoing development.

The link is a plain one, here and in the app. Neither loads anything from the
funding platform, which would have meant third-party script in an app whose
first principle is not having any, and a network dependency in one built to run
without a network.
