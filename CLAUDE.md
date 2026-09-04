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

2. **`src/lib/stores/kaleidoscope.ts`** consumes `probabilities`/`phases` and splits the work by how
   often it changes. `quantumTraits` derives colour (phase → RGB, computed once here rather than per
   object per frame), the superformula's `m` parameter, and shape id purely from `probabilities`/
   `phases`/`elementShapes`, so it only recomputes when the circuit re-runs. `objects` derives from
   `quantumTraits` plus user/MIDI-controlled parameters (`elementMaxSize`, `speed`, `strokeOpacity`,
   `fillOpacity`, etc.) and Perlin noise walkers (one persistent walker per array slot, see
   `getWalker`/`noiseWalk` in `src/lib/utils/index.ts`) into the final array of drawable shape
   descriptors (position, fill/stroke colour, size, rotation, superformula params) — this store
   recomputes every animation frame via the `t` tick store, but no longer redoes the colour/shape work
   `quantumTraits` already cached.

3. **`Kaleidoscope.svelte`** owns a single [q5](https://q5js.org/) `Q5.WebGPU` canvas (dynamically
   `import('q5')`'d on mount) and drives its own `q.draw()` loop — there is no Web Worker or
   OffscreenCanvas; all drawing happens on the main thread. Each frame it snapshots the latest
   `objects`/`blur`/`size`/`segments` store values (kept current via manual `.subscribe()` calls,
   not Svelte's `$` syntax, since `q.draw` is a plain callback), builds each object's superformula
   shape once via `writeBasePoints` (`src/lib/utils/draw.ts`) — not once per segment × object pair —
   into a pooled `Float32Array` reused frame over frame, then loops over every segment × object
   applying just that segment's placement. A translucent `q.background()` fill each frame (scaled by
   `blur`) produces the motion-trail effect.

4. Kaleidoscope mirroring/wedge placement is **not** done via canvas transforms or CSS — q5's
   `rotate()`/`scale()` compose unpredictably when nested, so `draw.ts` does it as plain point math
   instead. `writeBasePoints` places each shape in wedge-local space (its own rotation + offset);
   `segmentMatrix` precomputes the per-segment mirror+rotate as a single 2×2 matrix, applied in one
   pass via `applyMatrixInto` for shapes entirely inside the wedge cone (`wedgeStatusFlat` classifies
   this cheaply beforehand — see `segmentDimensions` in `src/lib/utils/index.ts` for the wedge
   angle/width geometry). Boundary-crossing shapes are rare, so they fall back to an allocating
   `Point[]` path (`mirrorPointsX` + `clipPolygonToWedge`, since q5 has no scissor/clip primitive of
   its own). `drawPolygonFlat`/`drawPolygon` then emit the final absolute-coordinate polygon via
   `q.beginShape()`/`q.vertex()`, passing colours as numeric r/g/b/a components since q5's WebGPU
   renderer doesn't parse CSS colour strings.

5. Optional webcam input (`webcamOpacity` store, slider in `Parameters.svelte`) is captured via
   `q.createCapture('video')` and composited *underneath* the shapes each frame. Because q5's WebGPU
   canvas has no clip primitive, the mirrored wedge crop is instead drawn on a real 2D
   `q.createGraphics(..., 'c2d')` buffer using `ctx.clip()` (`compositeWebcamWedges` in `draw.ts`,
   using the same per-wedge rotate/mirror convention as the shape math above), then that buffer is
   uploaded as a single q5 texture via `q.image()`.

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
