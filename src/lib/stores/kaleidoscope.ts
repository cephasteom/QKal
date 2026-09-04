import { numberToColor, noiseWalk, clamp } from '$lib/utils';
import { writable, derived, get } from 'svelte/store';
import { probabilities, phases, features } from './circuit';
import { WebMidi } from 'webmidi';
import { level } from './midi';

// TODO: generate as they're needed rather than all at once
const walkers = <Array<(speed: number) => number>>[];

function getWalker(i: number) {
    const walker = walkers[i] || noiseWalk(); 
    walkers[i] = walker;
    return walker;
}

export const t = writable<number>(0);
// Manual/MIDI-set baseline; synced to the circuit's qubit count below
// whenever it changes (QKAL_PLAN.md step 3), then left alone in between.
export const segments = writable<number>(6);
// Manual/MIDI offset added on top of the participation-ratio-driven base -
// see elementSizeAmount below.
export const elementMaxSize = writable<number>(300);
export const elementShapes = writable<string[]>(['arc', 'poly', 'bezier']);
export const strokeOpacity = writable<number>(0.01);
export const fillOpacity = writable<number>(0.01);
export const speed = writable<number>(0.1);
export const size = writable<number>(2000);
// Manual/MIDI offset added on top of the entanglement-driven base - see
// blurAmount below.
export const blur = writable<number>(0);
export const midiInput = writable<number>(0);
export const isPlaying = writable<boolean>(true);
export const webcamOpacity = writable<number>(0);
export const showControls = writable<boolean>(false);
export const showInfo = writable<boolean>(false);
export const showCircuit = writable<boolean>(false);

async function mapToMidi() {
    await WebMidi.enable()
    WebMidi.inputs.forEach(input => {
        // @ts-ignore
        input.addListener('controlchange', 'all', (e) => {
            switch(e.controller.number) {
                // case 0: size.set(Math.floor(e.value * 1300) + 700); break;
                case 1: elementMaxSize.set(Math.floor(e.value * 499 + 1)); break;
                case 2: fillOpacity.set(e.value); break;
                case 3: strokeOpacity.set(e.value); break;
                case 4: blur.set(e.value); break;
                case 5: speed.set(e.value * 0.9 + 0.1); break;
                case 6: midiInput.set(e.value); break;
            }
        })
    });
}
mapToMidi();

// Segments track the qubit count directly - it's rare enough to change
// (only when a gate is added/removed on a new wire) that snapping it
// outright doesn't jar, unlike the continuous blur/size below. Only acts on
// an actual qubit-count change so it doesn't fight manual/MIDI adjustments
// made in between.
let lastQubitCount: number | null = null;
features.subscribe(($features) => {
    if ($features.qubitCount === lastQubitCount) return;
    lastQubitCount = $features.qubitCount;
    segments.set(Math.max(4, $features.qubitCount * 2));
});

export const controlsAreActive = derived(
    [showControls, showInfo, showCircuit],
    ([$showControls, $showInfo, $showCircuit]) => $showControls || $showInfo || $showCircuit
);
// 
export const closeAllControls = () => {
    showControls.set(false);
    showInfo.set(false);
    showCircuit.set(false);
};

export const toggleIsPlaying = () => isPlaying.update((v) => !v);

export const toggleControls = () => {
    showInfo.set(false);
    showCircuit.set(false);
    showControls.update(v => !v)
};

export const toggleInfo = () => {
    showControls.set(false);
    showCircuit.set(false);
    showInfo.update(v => !v)
};

export const toggleCircuit = () => {
    showControls.set(false);
    showInfo.set(false);
    showCircuit.update(v => !v)
};

interface QuantumTrait {
    probability: number;
    phase: number;
    r: number;
    g: number;
    b: number;
    sfM: number;
    shape: string;
}

// Colour, the superformula's `m` parameter, and shape id are pure functions
// of a basis state's probability/phase, so they only need to recompute when
// the circuit re-runs, not on every animation tick like `objects` below.
// This also converts phase -> RGB once per circuit run instead of twice per
// object (fill + stroke) on every frame, since numberToColor's r/g/b only
// depend on phase - the two calls only ever differed in alpha.
export const quantumTraits = derived(
    [probabilities, phases, elementShapes],
    ([$probabilities, $phases, $elementShapes]): QuantumTrait[] => {
        return $probabilities.map((probability, i) => {
            const phase = $phases[i];
            const { r, g, b } = numberToColor(phase);
            return {
                probability,
                phase,
                r, g, b,
                sfM: Math.floor(phase * 8) + 2,
                shape: $elementShapes[i % $elementShapes.length]
            };
        });
    }
);

// Entangled qubits (mean Bloch length -> 0) smear via background-alpha blur;
// product states (-> 1) stay crisp, so blur tracks 1 - meanBlochLength.
// `blur` is a manual/MIDI offset on top.
export const blurAmount = derived(
    [features, blur],
    ([$features, $blur]) => clamp((1 - $features.meanBlochLength) + $blur)
);

// Spread-out superpositions (participation ratio -> 1) grow; collapsed
// states (-> 0) shrink. `elementMaxSize` is a manual/MIDI offset on top.
export const elementSizeAmount = derived(
    [features, elementMaxSize],
    ([$features, $elementMaxSize]) => clamp($elementMaxSize + $features.participationRatio * 400, 1, 900)
);

export const objects = derived(
    [quantumTraits, elementSizeAmount, size, speed, strokeOpacity, fillOpacity, midiInput, t],
    ([$quantumTraits, $elementSizeAmount, $size, $speed, $strokeOpacity, $fillOpacity, $midiInput]) => {
        return $quantumTraits.map(({ probability, phase, r, g, b, sfM, shape }: QuantumTrait, i) => ({
            x: 0.25
                * $size
                + getWalker((i * 10) + 0)($speed),
            y: (probability
                * $size
                + getWalker((i * 10) + 1)($speed) / 2 + 0.5),
            fill: { r, g, b, a: $fillOpacity + (getWalker((i * 10) + 2)($speed) * (phase * 0.001)) },
            stroke: { r, g, b, a: ($strokeOpacity + getWalker((i * 10) + 3)($speed) * probability) },
            size: (getWalker((i * 10) + 4)($speed)/2 + .5) * $elementSizeAmount * (1 + ($midiInput * get(level) * 2)),
            curve: 1,
            rot: (getWalker((i * 10) + 5)($speed) * Math.PI * 2) * (probability + 0.25),
            shape,
            sides: Math.floor((getWalker((i * 10) + 6)($speed) * 4) * probability) + 1,
            sf: {
                m: sfM,
                n1: getWalker((i * 10) + 7)($speed / 2) * 2,
                n2: getWalker((i * 10) + 8)($speed / 2) * 2,
                n3: getWalker((i * 10) + 9)($speed / 2) * 2
            },
        }))
    }
);

interface QubitTrait {
    length: number;
    r: number;
    g: number;
    b: number;
    sfM: number;
    shape: string;
}

// A qubit's Bloch equatorial angle stands in for phase here, so its colour
// sits in the same hue space as the basis-state shapes above.
export const qubitTraits = derived(
    [features, elementShapes],
    ([$features, $elementShapes]): QubitTrait[] => {
        return $features.blochVectors.map((vector, i) => {
            const angle = (Math.atan2(vector.y, vector.x) + Math.PI) / (Math.PI * 2);
            const { r, g, b } = numberToColor(angle);
            return {
                length: vector.length,
                r, g, b,
                sfM: Math.floor(angle * 8) + 2,
                shape: $elementShapes[i % $elementShapes.length]
            };
        });
    }
);

// Walker indices for the basis-state objects above run up to
// numAmplitudes * 10, which grows with the qubit count - stay well clear.
const QUBIT_WALKER_BASE = 1_000_000;

// One shape per qubit, kept close to the wedge apex so the existing
// per-segment mirroring turns them into a small ring at the kaleidoscope's
// centre. Opacity tracks Bloch length, so a qubit visibly dissolves into the
// collective as it entangles rather than keeping a state of its own.
export const qubitObjects = derived(
    [qubitTraits, elementSizeAmount, size, speed, strokeOpacity, fillOpacity, t],
    ([$qubitTraits, $elementSizeAmount, $size, $speed, $strokeOpacity, $fillOpacity]) => {
        return $qubitTraits.map(({ length, r, g, b, sfM, shape }: QubitTrait, i) => {
            const w = QUBIT_WALKER_BASE + i * 10;
            return {
                x: 0.25 * $size + (getWalker(w + 0)($speed) - 0.5) * $size * 0.08,
                y: getWalker(w + 1)($speed) * $size * 0.06,
                fill: { r, g, b, a: $fillOpacity * length },
                stroke: { r, g, b, a: $strokeOpacity * length },
                size: (getWalker(w + 2)($speed) / 2 + 0.5) * $elementSizeAmount * 0.5,
                curve: 1,
                rot: getWalker(w + 3)($speed) * Math.PI * 2,
                shape,
                sides: Math.floor(getWalker(w + 4)($speed) * 4) + 1,
                sf: {
                    m: sfM,
                    n1: getWalker(w + 5)($speed / 2) * 2,
                    n2: getWalker(w + 6)($speed / 2) * 2,
                    n3: getWalker(w + 7)($speed / 2) * 2
                }
            };
        });
    }
);
