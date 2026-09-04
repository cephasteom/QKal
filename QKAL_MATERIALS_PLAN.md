# QKal: structural visual material

A plan for replacing arbitrary-feeling output with material that carries the structure of
the quantum state. Companion to `QKAL_PLAN.md`, which covers performance.

---

## Diagnosis

Two causes, both structural rather than a matter of tuning.

**Position is driven by Perlin noise.** Position is the strongest visual channel available,
and it is currently random by construction. Quantum data only colours and sizes shapes that
noise has already scattered. No improvement to the colour mapping fixes a random composition.

**`probabilities` and `phases` are per-basis-state scalars.** Each is extracted independently,
so nothing in the representation encodes how state 5 relates to state 7. The shapes cannot look
related because the structure relating them is discarded before the renderer sees it.

The fix is in two directions: materials that carry *relationships*, and quantum data driving
*motion* rather than surface attributes.

---

## Phase 1 — Replace noise layout with the basis-state lattice

The 2ⁿ basis states are the vertices of an n-dimensional hypercube. Two states are adjacent
when their bit strings differ in exactly one position, and single-qubit gates move amplitude
along those edges. This is real adjacency, not a decorative arrangement.

Project to 2D by summing unit vectors, one per set bit:

```ts
// src/lib/utils/layout.ts
export function hypercubeLayout(n: number, radius: number): Float32Array {
  const dim = 1 << n;
  const pos = new Float32Array(dim * 2);
  const ax = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    ax[k * 2] = Math.cos(a);
    ax[k * 2 + 1] = Math.sin(a);
  }
  for (let i = 0; i < dim; i++) {
    let x = 0, y = 0;
    for (let k = 0; k < n; k++) {
      if (i >> k & 1) { x += ax[k * 2]; y += ax[k * 2 + 1]; }
    }
    pos[i * 2] = (x / n) * radius;
    pos[i * 2 + 1] = (y / n) * radius;
  }
  return pos;
}
```

Compute once per qubit-count change, not per frame. Feed these positions into `objects`
in `kaleidoscope.ts` in place of the Perlin walker output.

The layout has n-fold rotational symmetry for free, which suits a kaleidoscope. Note that
distinct states can project to the same point (any two states with the same bit *count* in
symmetric positions); add a small radial offset by index to separate them if that reads badly.

---

## Phase 2 — Draw interference on the edges

Currently each shape draws |aᵢ|², which is one amplitude in isolation. Interference is a
quantity *between* amplitudes, and it is the thing that makes the system quantum rather than
merely probabilistic.

For an edge joining adjacent states i and j, the interference term is `Re(aᵢ* aⱼ)`:

```ts
// positive → constructive, negative → destructive, |value| → strength
const w = a[i].re * a[j].re + a[i].im * a[j].im;
```

There are n·2ⁿ⁻¹ edges, which is small for n ≤ 8. Emit these as a second draw pass in
`draw.ts`: a line or ribbon between the two projected vertex positions, opacity from |w|,
and a two-ended colour ramp with constructive and destructive at opposite hues.

This is the most direct fix for shapes feeling unrelated, because it draws the relationships
themselves rather than the endpoints.

Threshold on |w| to avoid drawing thousands of near-zero edges.

---

## Phase 3 — Give the circuit real dynamics

If the circuit has no structure, no mapping will make the output feel non-arbitrary.
`presets.ts` currently loads a hardcoded state. Replace it with generated algorithms.

### Quantum walk on a cycle (recommended starting point)

A walker spreads over positions, but unlike a classical random walk it does not form a
Gaussian blob. It develops two ballistic wavefronts with interference fringes trailing behind
them. Every shape becomes part of one coherent wavefront — related by construction, and
visually unlike anything a noise function produces.

Structure: one coin qubit plus an n-qubit position register (2ⁿ sites on a ring).
Each step is:

1. `h` on the coin qubit
2. controlled-increment of the position register when coin = 1
3. controlled-decrement when coin = 0

Increment on a 3-qubit register is the descending cascade `ccx(q0,q1,q2)`, `cx(q0,q1)`,
`x(q0)`. Decrement is the same sequence reversed. Adding the coin as an extra control makes
each of these one degree higher — use `mcx` if available in your `quantum-circuit` version,
otherwise decompose with ancilla.

Map position space to angle around the ring, and the walk's spread becomes a travelling,
rippling structure.

### Grover's search

Amplitude concentrates onto a marked state, but the iteration is a rotation by a fixed angle,
so it overshoots and returns. Built-in periodicity and a narrative arc — hunting, converging,
overshooting, returning.

Oracle: phase flip on the marked state (`x` on zero-bits, multi-controlled `z`, `x` back).
Diffuser: `h` on all, `x` on all, multi-controlled `z`, `x` on all, `h` on all.
Optimal iteration count is about (π/4)√(2ⁿ); run past it deliberately to get the cycling.

### Trotterized transverse-field Ising

Continuous, never repeats, and has a genuine physical control parameter.

Each time step: a layer of `rzz(2·J·dt)` on neighbouring pairs (decompose as
`cx`, `rz(2·J·dt)`, `cx`), then `rx(2·h·dt)` on every qubit.

Sweeping the field strength `h` past the critical point changes the entanglement structure
qualitatively, so a MIDI knob on `h` alters the *character* of the image rather than just its
numbers. Good candidate for CC 7.

---

## Phase 4 — Additional materials

### Hamming-weight families

Group basis states by how many 1s they contain, giving n+1 families of binomial size. For many
physical Hamiltonians this is a conserved quantity, so the grouping reflects real structure.

- Family index → concentric ring radius
- Family index → superformula `m` (rotational symmetry order)

Shapes within a family then share a symmetry order and visibly belong together.

### Schmidt decomposition

Split the qubits into two halves and the state decomposes into a small set of paired
components with weights. A product state has exactly one component; entanglement increases
the count.

Reshape the 2ⁿ amplitude vector into a 2^(n/2) × 2^(n/2) matrix and take its singular values.
Draw one motif per component, sized by its weight.

Entanglement then *multiplies* motifs rather than merely fading them: a more entangled state
gives a richer image.

### Husimi Q field

Turns the state into a smooth continuous distribution over the Bloch sphere rather than 2ⁿ
discrete numbers. Project to the disc for a continuous texture — far more natural kaleidoscope
material than scattered polygons, with interference fringes already present. It is a complete
representation, so nothing is discarded.

Heavier than the other options; treat as a later alternative render mode rather than a
replacement for the shape layer.

---

## Phase 5 — Drive motion from circuit evolution

With a real algorithm in place, step through its moments continuously and let that drive
motion. Shapes then move because a gate acted on them.

- Snapshot the state after each column, interpolate between snapshots
- Lerp the **complex amplitudes**, then derive magnitude and phase from the result — never
  lerp phase directly, since it wraps and hues will spin the long way round
- Demote the Perlin walkers to small organic offsets on top, not the primary layout

This inversion is the core of the whole plan. At present noise makes the motion and quantum
makes the colour. Swapping those resolves most of the arbitrariness on its own.

---

## Suggested order

1. **Phase 3, quantum walk** — a source with genuine spatial structure
2. **Phase 1** — lay it out on the ring / lattice
3. **Phase 2** — draw the interference edges between adjacent positions
4. **Phase 5** — let the walk's evolution drive the motion
5. **Phase 4** — additional materials once the base reads well

Steps 1–3 together are the minimum that should visibly fix the problem: a source with real
structure, a layout that preserves it, and a material that renders relationships rather than
isolated points.
