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
