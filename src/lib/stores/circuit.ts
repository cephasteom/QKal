import { get } from 'svelte/store';
import { readable, writable, derived } from 'svelte/store';
import { complex, round, pow, abs } from 'mathjs'
import { mapToRange, debounce } from '$lib/utils';
// @ts-ignore
import QuantumCircuit from 'quantum-circuit/dist/quantum-circuit.min.js';
import { loadingState } from './presets';
import { WebMidi } from 'webmidi';

export const circuit = new QuantumCircuit();
circuit.load(loadingState)
circuit.run()

const symbols: { [key: string]: string } = {
    theta: 'θ',
    phi: 'φ',
    lambda: 'λ',
}
export const circuitParams = writable(extractParams())
const debouncedCircuitRun = debounce(() => circuit.run(), 10)

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

export const probabilities = derived(
    [circuitParams],
    () => {
        const length = circuit.numAmplitudes()
        return Array.from({length}, (_, i) => {
            const state = round(circuit.state[i] || complex(0, 0), 14);
            // @ts-ignore
            const result = +pow(abs(state), 2)
            return parseFloat(result.toFixed(5))
        })
    }
)

export const phases = derived(
    [circuitParams],
    () => {
        const states = circuit.stateAsArray()
        return states.map((state: any) => Math.abs(mapToRange(state.phase, -Math.PI, Math.PI, 0, 1)))
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