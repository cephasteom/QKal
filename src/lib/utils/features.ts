import { clamp } from './index';

export interface BlochVector {
    x: number;
    y: number;
    z: number;
    length: number;
}

export interface QuantumFeatures {
    qubitCount: number;
    blochVectors: BlochVector[];
    meanBlochLength: number;
    participationRatio: number;
}

interface Amplitude {
    re: number;
    im: number;
}

const EMPTY_FEATURES: QuantumFeatures = {
    qubitCount: 0,
    blochVectors: [],
    meanBlochLength: 0,
    participationRatio: 0
};

/**
 * Per-qubit structure that probabilities/phases alone don't expose, since
 * both are diagonal-only readouts of the state. Bloch x/y come from the
 * off-diagonal terms of each qubit's reduced density matrix - the
 * interference between basis states that differ only in that qubit's bit.
 * See QKAL_PLAN.md step 3.
 */
export function computeQuantumFeatures(amplitudes: Amplitude[], qubitCount: number): QuantumFeatures {
    const numAmplitudes = amplitudes.length;
    if (numAmplitudes === 0 || qubitCount === 0) return EMPTY_FEATURES;

    const blochVectors: BlochVector[] = [];
    for (let qubit = 0; qubit < qubitCount; qubit++) {
        // wire 0 is the most significant bit of the basis-state index (see
        // stateAsArray's indexBinStr, built left-to-right from wire 0)
        const bit = qubitCount - 1 - qubit;
        let rho00 = 0;
        let rho11 = 0;
        let rho01Re = 0;
        let rho01Im = 0;

        for (let i = 0; i < numAmplitudes; i++) {
            if ((i >> bit) & 1) continue; // visit each |0>/|1> pair once, from the |0> side
            const j = i | (1 << bit);
            const a = amplitudes[i];
            const b = amplitudes[j];

            rho00 += a.re * a.re + a.im * a.im;
            rho11 += b.re * b.re + b.im * b.im;
            // rho01 = sum over the other qubits of amplitude(0) * conj(amplitude(1))
            rho01Re += a.re * b.re + a.im * b.im;
            rho01Im += a.im * b.re - a.re * b.im;
        }

        // rho = 1/2 (I + x.X + y.Y + z.Z) => rho01 = (x - iy) / 2
        const x = 2 * rho01Re;
        const y = -2 * rho01Im;
        const z = rho00 - rho11;
        blochVectors.push({ x, y, z, length: Math.min(1, Math.sqrt(x * x + y * y + z * z)) });
    }

    const meanBlochLength = blochVectors.reduce((sum, v) => sum + v.length, 0) / qubitCount;

    const sumSquaredProbabilities = amplitudes.reduce((sum, { re, im }) => {
        const p = re * re + im * im;
        return sum + p * p;
    }, 0);
    // Inverse participation ratio, normalised from "one basis state carries
    // all the weight" (0) to "weight spread uniformly across all of them" (1).
    const participationRatio = sumSquaredProbabilities > 0
        ? clamp((1 / sumSquaredProbabilities) / numAmplitudes)
        : 0;

    return { qubitCount, blochVectors, meanBlochLength, participationRatio };
}
