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

export const objects = derived(
    [elementMaxSize, elementShapes, size, speed, strokeOpacity, fillOpacity, probabilities, phases, midiInput, t], 
    ([$elementMaxSize, $elementShapes, $size, $speed, $strokeOpacity, $fillOpacity, $probabilities, $phases, $midiInput]) => {
        return Array.from({ length: $probabilities.length }, (_, i) => ({
            x: 0.25 
                * $size
                + getWalker((i * 10) + 0)($speed),
            y: ($probabilities[i] 
                * $size
                + getWalker((i * 10) + 1)($speed) / 2 + 0.5),
            fill: numberToColor($phases[i], $fillOpacity + (getWalker((i * 10) + 2)($speed) * ($phases[i] * 0.001))),
            stroke: numberToColor($phases[i], ($strokeOpacity + getWalker((i * 10) + 3)($speed) * $probabilities[i])),
            size: (getWalker((i * 10) + 4)($speed)/2 + .5) * $elementMaxSize * (1 + ($midiInput * get(level) * 2)),
            curve: 1,
            rot: (getWalker((i * 10) + 5)($speed) * Math.PI * 2) * ($probabilities[i] + 0.25),
            shape: $elementShapes[i % $elementShapes.length],
            sides: Math.floor((getWalker((i * 10) + 6)($speed) * 4) * $probabilities[i]) + 1,
            sf: {
                m: Math.floor($phases[i] * 8) + 2,
                n1: getWalker((i * 10) + 7)($speed / 2) * 2,
                n2: getWalker((i * 10) + 8)($speed / 2) * 2,
                n3: getWalker((i * 10) + 9)($speed / 2) * 2
            },
        }))
    }
);