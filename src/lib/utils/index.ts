import Perlin from 'perlin.js';

Perlin.seed(Math.random());

export function noiseWalk(): (speed: number) => number {
    let x = Math.random(), y = Math.random();
    return (speed: number = 0.1) => {
        x += (0.003 * speed);
        y += (0.002 * speed);
        return (Perlin.simplex2(x, y) + 1) / 2;
    };
}

export function numberToColor(value: number, alpha: number = 1) {
    if (value < 0 || value > 1) {
        throw new Error("Input must be between 0 and 1");
    }

    let hue, saturation, lightness;

    if (value < 0.5) {
        //
        // WHITE → COLOUR
        //
        const t = value / 0.5;           // 0 → 1
        hue = t * 360;
        saturation = t;                  // 0 → 1
        lightness = 1 - t * 0.5;         // 1 → 0.5
    } else {
        //
        // COLOUR → BLACK
        //
        const t = (value - 0.5) / 0.5;   // 0 → 1
        hue = (1 - t) * 360;
        saturation = 1 - t * 0.7;        // 1 → 0.3
        lightness = 0.5 * (1 - t);       // 0.5 → 0
    }

    const [r, g, b] = hslToRgb(hue, saturation, lightness);
    return { r: r / 255, g: g / 255, b: b / 255, a: alpha };
}


function hslToRgb(h: number, s: number, l: number) {
    let c = (1 - Math.abs(2 * l - 1)) * s;
    let x = c * (1 - Math.abs((h / 60) % 2 - 1));
    let m = l - c / 2;
    let r, g, b;
    
    if (h < 60) {
        [r, g, b] = [c, x, 0];
    } else if (h < 120) {
        [r, g, b] = [x, c, 0];
    } else if (h < 180) {
        [r, g, b] = [0, c, x];
    } else if (h < 240) {
        [r, g, b] = [0, x, c];
    } else if (h < 300) {
        [r, g, b] = [x, 0, c];
    } else {
        [r, g, b] = [c, 0, x];
    }
    
    // Convert to 0-255 range
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);
    
    return [r, g, b];
}

export function segmentDimensions(segments: number, canvasSize: number) {
    const angle = 360 / segments; // Angle per segment
    const radians = (angle * Math.PI) / 180; // Convert to radians
  
    // Assuming the segment extends from the centre to the edge, we use the canvas height as the radius
    const radius = canvasSize / 2;
  
    // Calculate the base width of the triangle segment using trigonometry
    const width = 2 * radius * Math.tan(radians / 2);
  
    return {
        width,
        height: canvasSize / 2, // Segment height (half the canvas height)
    };
}

export function clamp(n: number, min: number = 0, max: number = 1) {
    return Math.min(Math.max(n, min), max);
}

export function throttle(func: Function, delay: number) {
    let lastCall = 0;
    return (...args: any[]) => {
        const now = new Date().getTime();
        if (now - lastCall < delay) {
            return;
        }
        lastCall = now;
        return func(...args);
    };
}

export function debounce<F extends (...args: any[]) => any>(callback: F, wait: number): (...args: Parameters<F>) => void {
    // @ts-ignore
    let timerId: NodeJS.Timeout | null = null;
  
    return (...args: Parameters<F>): void => {
        timerId && clearTimeout(timerId);
        timerId = setTimeout(() => callback(...args), wait);
    };
}


interface Element {
    x: number;
    y: number;
    width: number;
    height: number;
}
export function areTouching(el1: Element, el2: Element): boolean {
    const x1 = el1.x;
    const y1 = el1.y;
    const width1 = el1.width;
    const height1 = el1.height;

    const x2 = el2.x;
    const y2 = el2.y;
    const width2 = el2.width;
    const height2 = el2.height;

    return (
        x1 < x2 + width2 &&
        x1 + width1 > x2 &&
        y1 < y2 + height2 &&
        y1 + height1 > y2
    );
}
export const arraysAreEqual = (array1: any[], array2: any[]) => 
    array1.length === array2.length && array1.every((value, index) => value === array2[index]);

export function mapToRange(x: number, inMin: number, inMax: number, outMin: number, outMax: number)  {
    return ((x - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;
}