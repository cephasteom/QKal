import { numberToColor, noiseWalk } from '$lib/utils';
import { writable, derived, get } from 'svelte/store';
import { probabilities, phases } from './circuit';
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
export const segments = writable<number>(6);
export const elementMaxSize = writable<number>(300);
export const elementShapes = writable<string[]>(['arc', 'poly', 'bezier']);
export const strokeOpacity = writable<number>(0.01);
export const fillOpacity = writable<number>(0.01);
export const speed = writable<number>(0.1);
export const size = writable<number>(2000);
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

export const objects = derived(
    [quantumTraits, elementMaxSize, size, speed, strokeOpacity, fillOpacity, midiInput, t],
    ([$quantumTraits, $elementMaxSize, $size, $speed, $strokeOpacity, $fillOpacity, $midiInput]) => {
        return $quantumTraits.map(({ probability, phase, r, g, b, sfM, shape }: QuantumTrait, i) => ({
            x: 0.25
                * $size
                + getWalker((i * 10) + 0)($speed),
            y: (probability
                * $size
                + getWalker((i * 10) + 1)($speed) / 2 + 0.5),
            fill: { r, g, b, a: $fillOpacity + (getWalker((i * 10) + 2)($speed) * (phase * 0.001)) },
            stroke: { r, g, b, a: ($strokeOpacity + getWalker((i * 10) + 3)($speed) * probability) },
            size: (getWalker((i * 10) + 4)($speed)/2 + .5) * $elementMaxSize * (1 + ($midiInput * get(level) * 2)),
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