import { get } from 'svelte/store';
import { readable, writable, derived } from 'svelte/store';
import { complex, round } from 'mathjs'
import { debounce } from '$lib/utils';
import { computeQuantumFeatures, type QuantumFeatures } from '$lib/utils/features';
// @ts-ignore
import QuantumCircuit from 'quantum-circuit/dist/quantum-circuit.min.js';
import { presets, type Preset } from './presets';
import { WebMidi } from 'webmidi';

export const circuit = new QuantumCircuit();

// A snapshot of the complex amplitude vector (interleaved re/im) after each
// column the simulator processes, not just the final result - see
// QKAL_MATERIALS_PLAN.md phase 5. kaleidoscope.ts continuously interpolates
// through this sequence as the animation runs, so shapes change because a
// gate actually acted on them rather than because of independent noise.
export const moments = writable<Float32Array[]>([]);

function runCircuit() {
    const length = circuit.numAmplitudes();
    const snapshots: Float32Array[] = [];
    circuit.run(null, {
        onColumn: () => {
            const snapshot = new Float32Array(length * 2);
            for (let i = 0; i < length; i++) {
                const amplitude = circuit.state[i];
                if (amplitude) {
                    snapshot[i * 2] = amplitude.re;
                    snapshot[i * 2 + 1] = amplitude.im;
                }
            }
            snapshots.push(snapshot);
        }
    });
    moments.set(snapshots);
}

const symbols: { [key: string]: string } = {
    theta: 'θ',
    phi: 'φ',
    lambda: 'λ',
}
export const circuitParams = writable(extractParams())
const debouncedCircuitRun = debounce(runCircuit, 10)

// Re-run the circuit whenever parameters change, debounced to avoid excessive computations
circuitParams.subscribe(debouncedCircuitRun)

async function mapToMidi() {
    await WebMidi.enable()
    WebMidi.inputs.forEach(input => {
        // @ts-ignore
        input.addListener('controlchange', 'all', (e) => {
            const params = get(circuitParams)
            const index = e.controller.number - 7; // Assuming controllers 7-12 map to params 0-5
            if (index < 0 || index >= params.length) return; // Out of bounds check

            circuitParams.update(currentParams => currentParams.map((param: any, i: number) => {
                if (i === index) {
                    return {
                        ...param,
                        value: e.value * Math.PI * (param.param === 'theta' ? 1 : 2) // Update the value of the specific parameter
                    };
                }
                return param; // Return unchanged for other parameters
            }));
        })
    });
}
mapToMidi();

// Bloch vectors, mean Bloch length, and participation ratio - see
// src/lib/utils/features.ts and QKAL_PLAN.md step 3. Computed from the
// circuit's final state (unlike `moments` above, which tracks every column).
export const features = derived(
    [circuitParams],
    (): QuantumFeatures => {
        const length = circuit.numAmplitudes()
        const amplitudes = Array.from({ length }, (_, i) => {
            const state = round(circuit.state[i] || complex(0, 0), 14) as any
            return { re: state.re as number, im: state.im as number }
        })
        return computeQuantumFeatures(amplitudes, circuit.numQubits)
    }
)

/**
 * Get all gates with parameters from the circuit.
 */
function extractParams() {
    const ps = circuit.gates
        .map((wire: any[], wireI: number) => wire
            .map((gate: any, gateI: number) => {
                if (!gate || !gate.options.params) return null
                const param = Object.keys(gate.options.params)[0]
                return gate && {
                    id: gate.id,
                    name: `q${wireI}:${gate.name}:${symbols[param] || param}`,
                    wire: wireI,
                    gate: gateI,
                    param,
                    value: gate.options.params[param],
                }
            })
        )
        .flat()
        .filter((gate: any) => gate && gate.param)

    return ps
}

circuitParams.subscribe((params: any) => {
    params.forEach((param: any) => {
        const gate = circuit.gates[param.wire][param.gate]
        if(!gate) return
        gate.options.params[param.param] = param.value
    })
})

export function updateParams()
{
    circuitParams.update(oldParams => {
        const newParams = extractParams()
        return newParams.map((newParam: any) => {
            const oldParam = oldParams.find((o: any) => o.id === newParam.id)
            return {
                ...newParam,
                value: oldParam
                    ? oldParam.value // retain old values if they exist
                    : 0 // default to 0 if not
            }
        })
    })
}

// Which of presets.ts's algorithms is currently loaded - see the dropdown in
// Circuit.svelte.
export const activePreset = writable<string>(presets[0].id);

/**
 * Replace the circuit with one of the presets from presets.ts (QKAL_MATERIALS_PLAN.md
 * phase 3). Every gate is freshly built, so unlike updateParams() above there are no
 * existing param ids to preserve values against - circuitParams is set straight from
 * extractParams() rather than merged, or values a preset bakes in (e.g. the Ising
 * model's field/coupling angles) would be reset to 0 before the circuit ever ran.
 */
export function loadPreset(id: string) {
    const preset = presets.find((p: Preset) => p.id === id) || presets[0];
    circuit.clear();
    circuit.numQubits = 1;
    preset.build(circuit);
    activePreset.set(preset.id);
    circuitParams.set(extractParams());
    runCircuit();
}
loadPreset(presets[0].id);

export interface Gate {
    name: string;
    symbol: string;
    qubits: number;
    description: string;
    params: {
        name: string;
        type: string;
        default: any;
    }[]
}

export const gates = readable<Gate[]>([
    {
        name: 'Pauli X',
        symbol: 'x',
        qubits: 1,
        description: 'PI rotation over x-axis. Also known as "NOT" gate.',
        params: []
    },
    {
        name: 'Pauli Y',
        symbol: 'y',
        qubits: 1,
        description: 'PI rotation over y-axis.',
        params: []
    },
    {
        name: 'Pauli Z',
        symbol: 'z',
        qubits: 1,
        description: 'PI rotation over z-axis.',
        params: []
    },
    {
        name: 'RX',
        symbol: 'rx',
        qubits: 1,
        description: 'Controlled rotation around the x-axis by given angle.',
        params: [
            {
                name: 'theta',
                type: 'number',
                default: 0
            }
        ]
    },
    {
        name: 'RY',
        symbol: 'ry',
        qubits: 1,
        description: 'Controlled rotation around the y-axis by given angle.',
        params: [
            {
                name: 'theta',
                type: 'number',
                default: 0
            }
        ]
    },
    {
        name: 'RZ',
        symbol: 'rz',
        qubits: 1,
        description: 'Controlled rotation around the z-axis by given angle.',
        params: [
            {
                name: 'phi',
                type: 'number',
                default: 0
            }
        ]
    },
    {
        name: 'Hadamard',
        symbol: 'h',
        qubits: 1,
        description: 'PI/2 rotation over x-axis.',
        params: []
    },    
    {
        name: 'CNOT',
        symbol: 'cx',
        qubits: 2,
        description: 'Controlled NOT gate. Requires two qubits.',
        params: []
    },
    {
        name: 'CCNOT',
        symbol: 'ccx',
        qubits: 3,
        description: 'Toffoli gate. Requires three qubits.',
        params: []
    }
])