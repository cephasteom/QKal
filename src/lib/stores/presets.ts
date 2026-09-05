// Bell state |00> + |11> (up to normalisation) - two qubits perfectly
// correlated by a single H then CNOT. The smallest circuit that still has
// real quantum structure (entanglement) rather than looking like an
// arbitrary superposition, so it's the default first preset.
export function buildBellState(circuit: any, { pairs = 1 }: { pairs?: number } = {}) {
    for (let i = 0; i < pairs; i++) {
        const control = i * 2;
        const target = i * 2 + 1;
        circuit.appendGate('h', control);
        circuit.appendGate('cx', [control, target]);
    }
    return circuit;
}

// Discrete-time quantum walk on a cycle of 2^positionQubits sites - see
// QKAL_MATERIALS_PLAN.md phase 3. A walker spreads as two ballistic
// wavefronts with interference fringes trailing behind, rather than the
// Gaussian blob a classical random walk would produce, so every basis state
// ends up part of one coherent structure instead of an independent draw.
//
// Wire 0 is the coin qubit; wires 1..positionQubits are the position
// register, wire 1 the least significant bit. Each step is:
//   1. h on the coin
//   2. controlled-increment of the position register, controlled on coin = 1
//   3. controlled-decrement of the position register, controlled on coin = 0
//
// The increment is the standard ripple cascade: for bit k (0 = LSB), flip it
// controlled on the coin and all lower bits being set, applied MSB-first so
// each control still holds its untouched value when read. Every gate in that
// cascade is its own inverse, so running the exact same cascade in reverse
// order performs the decrement - no separate decrement circuit is needed.
// "Controlled on coin = 0" is achieved by flipping the coin, running the
// (now coin = 1 controlled) decrement cascade, then flipping the coin back.
export function buildQuantumWalk(
    circuit: any,
    { positionQubits = 3, steps = 4 }: { positionQubits?: number; steps?: number } = {}
) {
    const coin = 0;
    const position = Array.from({ length: positionQubits }, (_, i) => i + 1);

    // One multi-controlled-X gate per cascade rung (coin + 0..k-1 lower
    // position bits as controls), registered once and reused every step.
    const mcxNames = Array.from({ length: positionQubits }, (_, k) => circuit.registerMCXGate(k + 1));

    const cascadeWires = (k: number) => [coin, ...position.slice(0, k), position[k]];

    for (let step = 0; step < steps; step++) {
        circuit.appendGate('h', coin);

        for (let k = positionQubits - 1; k >= 0; k--) {
            circuit.appendGate(mcxNames[k], cascadeWires(k));
        }

        circuit.appendGate('x', coin);
        for (let k = 0; k < positionQubits; k++) {
            circuit.appendGate(mcxNames[k], cascadeWires(k));
        }
        circuit.appendGate('x', coin);
    }

    return circuit;
}

// Multi-controlled Z across every wire in `wires`, built from a multi-
// controlled X the same way registerMCXGate builds one: H on the last wire
// turns "flip the last wire" into "flip the phase of the last wire", and Z is
// diagonal, so it makes no difference that one wire is singled out as the
// "target" - the gate still only touches the phase of the all-ones state.
function appendMCZ(circuit: any, wires: number[]) {
    const target = wires[wires.length - 1];
    const controls = wires.slice(0, -1);
    circuit.appendGate('h', target);
    if (controls.length === 0) {
        circuit.appendGate('z', target);
    } else {
        circuit.appendGate(circuit.registerMCXGate(controls.length), [...controls, target]);
    }
    circuit.appendGate('h', target);
}

// Grover's search - see QKAL_MATERIALS_PLAN.md phase 3. Amplitude
// concentrates onto the marked state via a fixed-angle rotation each
// iteration, which overshoots and returns rather than settling - run past
// the optimal count on purpose to get that hunting/converging/overshooting
// cycle rather than stopping at the peak.
export function buildGroverSearch(
    circuit: any,
    { qubits = 3, marked = 5, iterations }: { qubits?: number; marked?: number; iterations?: number } = {}
) {
    const wires = Array.from({ length: qubits }, (_, i) => i);
    // Wires that need flipping so the marked state maps to all-ones, since
    // the oracle's MCZ only ever flags the |11...1> state.
    const zeroBits = wires.filter((w) => !((marked >> w) & 1));

    const oracle = () => {
        zeroBits.forEach((w) => circuit.appendGate('x', w));
        appendMCZ(circuit, wires);
        zeroBits.forEach((w) => circuit.appendGate('x', w));
    };

    const diffuser = () => {
        wires.forEach((w) => circuit.appendGate('h', w));
        wires.forEach((w) => circuit.appendGate('x', w));
        appendMCZ(circuit, wires);
        wires.forEach((w) => circuit.appendGate('x', w));
        wires.forEach((w) => circuit.appendGate('h', w));
    };

    wires.forEach((w) => circuit.appendGate('h', w));

    // Optimal count is ~(pi/4) * sqrt(2^n); run a couple more to see it
    // overshoot the marked state and cycle back down.
    const steps = iterations ?? Math.round((Math.PI / 4) * Math.sqrt(2 ** qubits)) + 2;
    for (let i = 0; i < steps; i++) {
        oracle();
        diffuser();
    }

    return circuit;
}

// Trotterized transverse-field Ising model on a ring - see
// QKAL_MATERIALS_PLAN.md phase 3. Continuous and never repeats exactly, and
// `field` is a genuine physical control parameter: sweeping it past the
// critical point (coupling) changes the entanglement structure qualitatively,
// not just the numbers, which is what makes it a good MIDI target (CC 7, the
// first circuit-parameter CC - see circuit.ts).
export function buildTransverseFieldIsing(
    circuit: any,
    {
        qubits = 4,
        steps = 6,
        coupling = 1,
        field = 0.5,
        dt = 0.3
    }: { qubits?: number; steps?: number; coupling?: number; field?: number; dt?: number } = {}
) {
    const wires = Array.from({ length: qubits }, (_, i) => i);
    // Nearest-neighbour bonds around the ring; for 2 qubits the wraparound
    // edge is the same pair twice, so only keep it once.
    const bonds = wires
        .map((w, i) => [w, wires[(i + 1) % qubits]])
        .filter((_, i) => qubits > 2 || i === 0);

    for (let step = 0; step < steps; step++) {
        // rzz(2*J*dt) decomposed as cx, rz(2*J*dt), cx - rzz has no direct
        // gate in this library, and every rzz here is diagonal, so the bonds
        // commute regardless of the order they're applied in.
        bonds.forEach(([a, b]) => {
            circuit.appendGate('cx', [a, b]);
            circuit.appendGate('rz', b, { params: { phi: 2 * coupling * dt } });
            circuit.appendGate('cx', [a, b]);
        });
        wires.forEach((w) => circuit.appendGate('rx', w, { params: { theta: 2 * field * dt } }));
    }

    return circuit;
}

export interface Preset {
    id: string;
    name: string;
    build: (circuit: any) => any;
}

// Bell state plus the three algorithms from QKAL_MATERIALS_PLAN.md phase 3,
// selectable from the circuit dropdown in Circuit.svelte. Bell state is
// first, so it's also the default circuit.ts boots with.
export const presets: Preset[] = [
    { id: 'quantum-walk', name: 'Quantum walk', build: (circuit) => buildQuantumWalk(circuit) },
    { id: 'bell-state', name: 'Bell state', build: (circuit) => buildBellState(circuit) },
    { id: 'grover', name: "Grover's search", build: (circuit) => buildGroverSearch(circuit) },
    {
        id: 'ising',
        name: 'Transverse-field Ising',
        build: (circuit) => buildTransverseFieldIsing(circuit)
    }
];
