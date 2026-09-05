import { writable, type Writable } from 'svelte/store';
import { browser } from '$app/environment';

/**
 * A writable store that mirrors its value to localStorage under `key`, so a
 * plain render control (size, zoom, opacity, ...) survives a reload. Not
 * meant for circuitParams' gate angles - those are tied to gate ids that a
 * fresh preset load regenerates every time, so persisting them wouldn't
 * mean anything from one session to the next.
 *
 * Reads/writes are guarded by SvelteKit's `browser` flag since this module
 * gets imported during SSR, where localStorage doesn't exist.
 */
export function persisted<T>(key: string, initial: T): Writable<T> {
    let startValue = initial;

    if (browser) {
        const stored = localStorage.getItem(key);
        if (stored !== null) {
            try {
                startValue = JSON.parse(stored);
            } catch {
                // malformed/stale value - fall back to the given initial
            }
        }
    }

    const store = writable<T>(startValue);

    if (browser) {
        store.subscribe((value) => localStorage.setItem(key, JSON.stringify(value)));
    }

    return store;
}
