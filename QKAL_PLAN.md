# QKal: performance and quantum-mapping plan

A staged plan for reducing per-frame cost in the q5/WebGPU renderer and for driving
more visual parameters from the quantum state.

Steps are ordered by payoff-to-disruption. Each is independently shippable.

---

## 1. Kill the segment × object multiplication

This is the main cost. Every frame the draw loop iterates segments × objects, and for
each pair generates a superformula polygon and pushes it through
`rotatePoints` → `translatePoints` → `mirrorPointsX` → `clipPolygonToWedge` → `rotatePoints`.
That is N×M×P point operations plus a per-shape clip, all on the main thread.

### Cheap version (do this first — contained to `draw.ts`)

- **Hoist `superformulaPoints` out of the segment loop.** A shape's local geometry is
  identical in every wedge; only the placement differs. Generate points once per object
  and reuse across all N segments. Superformula evaluation is `pow`/`sin`/`cos` per point,
  so this alone cuts the most expensive work by a factor of N.

- **Compose the transforms into one matrix.** Rotate, translate, mirror, rotate is a single
  affine transform. Precompute one 2×3 matrix per segment per frame (N matrices; they depend
  only on segment index and count), then apply it in one pass instead of four — one array
  allocation instead of four.

- **Early-out the clip.** Test each shape's angular extent against the wedge cone before
  running `clipPolygonToWedge`. Most shapes are entirely inside or entirely outside; only
  boundary-crossers need the real clip.

### Structural version

Render the wedge content once into a graphics buffer, then composite it N times.

This pattern already exists in the codebase: `compositeWebcamWedges` draws per-wedge crops
onto a `c2d` buffer with `ctx.clip()` and uploads one texture via `q.image()`. Doing the same
for shapes removes the per-segment point math entirely, and removes `clipPolygonToWedge`
along with it (clipping comes free from `ctx.clip()`). Segment count then becomes free to
animate.

**Tradeoff:** one texture upload per frame, and slightly softer edges than vector output.
The wedge buffer only needs to be wedge-sized rather than full-canvas, so it should win
comfortably — but measure against the cheap version before committing, since the move to
WebGPU was presumably deliberate.

---

## 2. Split `objects`, and stop allocating

`objects` recomputes on every tick, but its inputs move at very different rates: Perlin
walkers change per frame, while `probabilities`/`phases` only change when `circuitParams` does.

Split in `kaleidoscope.ts`:

| Store | Derived from | Recomputes |
|---|---|---|
| `quantumTraits` | `probabilities` / `phases` only | on circuit run |
| `objects` | `quantumTraits` + `t` | per frame |

`quantumTraits` holds colour, base size, and superformula params. `objects` holds position
and rotation. This stops hue being recomputed from phase 60 times a second when the phase
has not moved.

Then pool the point buffers. Between the transform chain and the clip, a lot of short-lived
arrays are generated per frame. Preallocating `Float32Array`s and transforming in place
should visibly flatten the GC sawtooth.

---

## 3. Extract the features not currently derived

New file `src/lib/utils/features.ts`, called from `circuit.ts` alongside `probabilities`
and `phases`.

The current derivations are amplitude information only. What is missing is per-qubit
structure, which requires the interference terms between basis states differing in a
single bit.

- **Bloch vectors** — each qubit's own state as a point in a ball. The existing
  probabilities give the z-component implicitly; x and y come from those interference terms.

- **Bloch vector length** — how definite a qubit's individual state is. Length 1 means it
  has a state of its own; length 0 means all of its information lives in correlations with
  other qubits. A free entanglement readout.

- **Participation ratio** — how many basis states carry meaningful weight.

### Wiring into currently user-only stores

| Store | Driven by | Effect |
|---|---|---|
| `blur` | mean Bloch length | Entangled states smear, product states stay crisp |
| `size` / `elementMaxSize` | participation ratio | Spread-out superpositions grow, collapsed states shrink |
| per-qubit shape layers | Bloch direction (opacity ← Bloch length) | Qubits dissolve into the collective as they entangle |
| `segments` | qubit count | Already a runtime store; changes rarely enough not to jar |

`blur` already scales the `q.background()` alpha, so that one is nearly a one-line change.

Keep the MIDI CCs as offsets on top of these rather than replacements, so the circuit can
still be played against.

---

## 4. Move the simulation off the main thread

Everything currently shares one thread: the circuit re-run, the `objects` recompute, and
all the point math. Under a stream of MIDI CC messages, the 10ms debounce means up to 100
circuit runs per second competing directly with `q.draw()`.

Post `circuitParams` to a worker; get a feature `Float32Array` back.

Do this last — steps 1 and 2 may free enough headroom that it stops mattering.

---

## Two small fixes

**Guard phase at near-zero amplitude.** Phase is numerically meaningless as magnitude
approaches zero, so those basis states will strobe randomly through the hue wheel. Gate
saturation by probability so they fall to grey instead.

**Convert phase to RGB once.** Since `drawPolygon` needs numeric r/g/b/a components anyway
(q5's WebGPU renderer doesn't parse CSS colour strings), do the phase→hue→RGB conversion
once in `quantumTraits` rather than building colour strings that get parsed back.

---

## Suggested order

1. Step 1, cheap version — largest single speedup, no architectural change
2. Step 2 — enables everything downstream
3. Step 3 — the new visual material
4. Step 1, structural version — only if profiling still demands it
5. Step 4 — only if the main thread is still contended
