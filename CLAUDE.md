# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

qKaleidoscope is a generative art SvelteKit app: the state vector of a simulated quantum circuit
(driven by [`quantum-circuit`](https://www.npmjs.com/package/quantum-circuit)) is mapped into
shapes, colours, and motion drawn on a segmented, mirrored canvas kaleidoscope. Parameters can be
controlled by on-screen sliders or a connected MIDI device via WebMidi.

## Commands

- `yarn dev` — start the Vite dev server
- `yarn build` — production build
- `yarn preview` — preview a production build
- `yarn check` — sync SvelteKit types and run `svelte-check` (the project's only "test"/typecheck step; there is no separate lint or test suite)
- `yarn check:watch` — same, in watch mode

Node version is pinned via `.nvmrc` (v23.6.1); `engine-strict=true` is set in `.npmrc`.

## Architecture

### Data flow: circuit → kaleidoscope → canvas

1. **`src/lib/stores/circuit.ts`** owns a single `QuantumCircuit` instance (from `quantum-circuit`),
   loaded from a hardcoded initial state (`src/lib/stores/presets.ts`). `circuitParams` is a writable
   store of the circuit's tunable gate parameters (extracted via `extractParams()`), and any change to
   it re-runs the circuit (debounced 10ms). From the circuit's resulting state vector, two derived
   stores are exposed: `probabilities` (|amplitude|² per basis state) and `phases` (normalized phase
   angle per basis state). The `Circuit.svelte` component is a drag-and-drop gate editor that renders
   `circuit.exportSVG()` and mutates the circuit directly (`addGate`/`insertGate`/`removeGate`).

2. **`src/lib/stores/kaleidoscope.ts`** consumes `probabilities`/`phases` and combines them with
   user/MIDI-controlled parameters (`elementMaxSize`, `speed`, `strokeOpacity`, `fillOpacity`, etc.)
   plus Perlin noise walkers (one persistent walker per array slot, see `getWalker`/`noiseWalk` in
   `src/lib/utils/index.ts`) into the derived `objects` store — an array of drawable shape descriptors
   (position, fill/stroke colour, size, rotation, superformula params). This store recomputes every
   animation frame via the `t` tick store.

3. **`Kaleidoscope.svelte`** owns one `<canvas>` per segment, each with `transferControlToOffscreen()`
   handed to a single shared Web Worker (`static/offscreen-canvas.js`, loaded as a static asset, not
   a bundled module). The worker receives the `objects` array on every store update and draws each
   shape as a superformula-generated polygon, with a translucent fill-rect trail effect for motion
   blur. The main thread only drives the render loop (`requestAnimationFrame` bumping `t`) and posts
   data to the worker — no drawing happens on the main thread.

4. Visual mirroring/kaleidoscope symmetry is achieved with pure CSS: each segment canvas is a
   `clip-path` triangle wedge, rotated and alternately `scaleX`-flipped (see `segmentDimensions` in
   `src/lib/utils/index.ts` for the wedge geometry math).

### MIDI

`src/lib/stores/midi.ts`, `circuit.ts`, and `kaleidoscope.ts` each independently call `WebMidi.enable()`
and attach their own `controlchange`/`noteon` listeners on mount — there's no central MIDI dispatcher.
CC numbers are hardcoded to specific stores: CC 1–6 map to kaleidoscope params in `kaleidoscope.ts`,
CC 7+ map sequentially to circuit gate params (`circuitParams`) in `circuit.ts` (`index - 7`), and
`midi.ts` separately smooths note-on velocity into `level` (fast attack / slow release ramp) used to
modulate shape size. When adding new MIDI-controlled parameters, follow this existing per-store
listener pattern rather than introducing a shared MIDI bus.

### UI panels

`showControls` / `showInfo` / `showCircuit` booleans in `kaleidoscope.ts` are mutually exclusive
toggles (`toggleControls`/`toggleInfo`/`toggleCircuit` each close the other two) gating the
`Parameters`, `Info`, and `Circuit` components, all rendered through the shared `SidePanel` wrapper.
`Sidebar.svelte` is the toggle button rail; it auto-hides unless the cursor is near the left edge or
a panel is open. Escape closes all panels and Enter toggles play/pause — wired up as `window`
listeners in `src/routes/+page.svelte`.

### Styling

Global styles/resets live in `src/routes/styles.css`; components use `<style lang="scss">` (via
`sass-embedded`) scoped per-component. There's no design system/tokens file beyond ad-hoc CSS vars
used inline (e.g. `--color-grey-dark` in `Parameters.svelte`).
