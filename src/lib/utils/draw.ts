interface SuperformulaParams {
    m: number;
    n1: number;
    n2: number;
    n3: number;
}

interface Color {
    r: number;
    g: number;
    b: number;
    a: number;
}

interface Point {
    x: number;
    y: number;
}

export interface Matrix2D {
    a: number;
    b: number;
    c: number;
    d: number;
}

// -------------------------------
// SUPERFORMULA EQUATION
// -------------------------------
export function superformula(phi: number, m: number, n1: number, n2: number, n3: number) {
    const t1 = Math.abs(Math.cos((m * phi) / 4));
    const t2 = Math.abs(Math.sin((m * phi) / 4));

    const r = Math.pow(
        Math.pow(t1, n2) + Math.pow(t2, n3),
        -1 / n1
    );

    return r;
}

// -------------------------------
// SUPERFORMULA SHAPE OUTLINE (object-local, unrotated)
// -------------------------------
// Every shape samples phi on the same fixed step sequence, so that sequence
// (and its cos/sin) is computed once at module load rather than per shape
// per frame.
const SUPERFORMULA_STEP = 0.05;
const SUPERFORMULA_PHI: number[] = [];
const SUPERFORMULA_COS: number[] = [];
const SUPERFORMULA_SIN: number[] = [];
for (let phi = 0; phi < Math.PI * 2; phi += SUPERFORMULA_STEP) {
    SUPERFORMULA_PHI.push(phi);
    SUPERFORMULA_COS.push(Math.cos(phi));
    SUPERFORMULA_SIN.push(Math.sin(phi));
}
export const SUPERFORMULA_POINT_COUNT = SUPERFORMULA_PHI.length;

// Writes an object's fully-placed base points (its own superformula outline,
// spun by its own rotation, offset into wedge-local space) directly into a
// caller-owned Float32Array of length SUPERFORMULA_POINT_COUNT * 2, as
// [x0, y0, x1, y1, ...]. This is the per-object, per-frame hot path - the
// caller pools one buffer per object and reuses it frame over frame instead
// of allocating a fresh Point[] through superformulaPoints/rotatePoints/
// translatePoints every tick.
export function writeBasePoints(
    out: Float32Array,
    size: number,
    params: SuperformulaParams,
    rotation: number,
    offsetX: number,
    offsetY: number
): void {
    const { m, n1, n2, n3 } = params;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    for (let i = 0; i < SUPERFORMULA_POINT_COUNT; i++) {
        const r = superformula(SUPERFORMULA_PHI[i], m, n1, n2, n3) * size;
        const x = r * SUPERFORMULA_COS[i];
        const y = r * SUPERFORMULA_SIN[i];
        out[i * 2] = (x * cosR - y * sinR) + offsetX;
        out[i * 2 + 1] = (x * sinR + y * cosR) + offsetY;
    }
}

// Converts a pooled flat buffer back to Point[] for the rare boundary-clip
// path below, which still needs to grow/shrink the point list.
export function flatToPoints(points: Float32Array): Point[] {
    const result: Point[] = new Array(points.length / 2);
    for (let i = 0; i < points.length; i += 2) {
        result[i / 2] = { x: points[i], y: points[i + 1] };
    }
    return result;
}

// -------------------------------
// POINT-LIST TRANSFORMS
// -------------------------------
// q5's rotate()/scale() mix pre- and post-multiply matrix composition, which
// makes nesting a per-object rotation inside an already-mirrored wedge
// transform unpredictable. All positioning is instead done as plain point
// math here, with a single self-consistent convention, so q5 only ever
// receives final absolute coordinates.
export function mirrorPointsX(points: Point[]): Point[] {
    return points.map(({ x, y }) => ({ x: -x, y }));
}

// Applies a 2x2 matrix to every point in one pass, for when several of the
// transforms above have been pre-composed (see segmentMatrix below).
export function applyMatrix(points: Point[], m: Matrix2D): Point[] {
    return points.map(({ x, y }) => ({ x: m.a * x + m.c * y, y: m.b * x + m.d * y }));
}

// Same as applyMatrix, but writes into a caller-owned Float32Array instead
// of allocating a new Point[] - the pooled counterpart used on the hot
// "entirely inside the wedge" path.
export function applyMatrixInto(out: Float32Array, points: Float32Array, m: Matrix2D): void {
    for (let i = 0; i < points.length; i += 2) {
        const x = points[i];
        const y = points[i + 1];
        out[i] = m.a * x + m.c * y;
        out[i + 1] = m.b * x + m.d * y;
    }
}

// The per-segment placement is just rotatePoints(angle), optionally preceded
// by mirrorPointsX - both linear maps, so they compose into a single matrix
// that depends only on the segment's angle/parity, not on any object. Reused
// across every object in that segment instead of being rebuilt per object.
export function segmentMatrix(angle: number, mirrored: boolean): Matrix2D {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return mirrored
        ? { a: -cos, b: -sin, c: -sin, d: cos }
        : { a: cos, b: sin, c: -sin, d: cos };
}

export type WedgeStatus = 'in' | 'out' | 'boundary';

// Cheap classification against the wedge cone, reusing the same half-plane
// tests as clipToHalfPlane but without building any new point arrays. Most
// shapes are either entirely inside or entirely outside the wedge, so this
// lets callers skip the real (allocating) clip below for both of those cases
// and only pay for it on genuine boundary-crossers. The cone is symmetric
// about the wedge's centre axis, so this test is valid for both mirrored and
// unmirrored points - the same classification applies either way.
export function wedgeStatus(points: Point[], halfAngle: number): WedgeStatus {
    const sin = Math.sin(halfAngle);
    const cos = Math.cos(halfAngle);
    let insideCount = 0;
    for (const p of points) {
        const rightOk = sin * p.y - cos * p.x >= 0;
        const leftOk = sin * p.y + cos * p.x >= 0;
        if (rightOk && leftOk) insideCount++;
    }
    if (insideCount === points.length) return 'in';
    if (insideCount === 0) return 'out';
    return 'boundary';
}

// Same as wedgeStatus, but reads directly from a pooled flat buffer.
export function wedgeStatusFlat(points: Float32Array, halfAngle: number): WedgeStatus {
    const sin = Math.sin(halfAngle);
    const cos = Math.cos(halfAngle);
    const total = points.length / 2;
    let insideCount = 0;
    for (let i = 0; i < points.length; i += 2) {
        const x = points[i];
        const y = points[i + 1];
        const rightOk = sin * y - cos * x >= 0;
        const leftOk = sin * y + cos * x >= 0;
        if (rightOk && leftOk) insideCount++;
    }
    if (insideCount === total) return 'in';
    if (insideCount === 0) return 'out';
    return 'boundary';
}

// -------------------------------
// CLIP A POLYGON TO A WEDGE
// -------------------------------
// The wedge is a cone from the origin, centred on +y, spanning halfAngle either side.
// q5 has no scissor/clip primitive, so oversized shapes near the wedge apex would
// otherwise bleed into neighbouring segments unless clipped here directly.
function clipToHalfPlane(points: Point[], dir: Point, sign: number): Point[] {
    if (points.length === 0) return points;

    const inside = (p: Point) => (dir.x * p.y - dir.y * p.x) * sign >= 0;
    const intersect = (a: Point, b: Point): Point => {
        const crossDirA = dir.x * a.y - dir.y * a.x;
        const bax = b.x - a.x;
        const bay = b.y - a.y;
        const crossDirBA = dir.x * bay - dir.y * bax;
        const s = -crossDirA / crossDirBA;
        return { x: a.x + s * bax, y: a.y + s * bay };
    };

    const result: Point[] = [];
    const n = points.length;
    for (let i = 0; i < n; i++) {
        const curr = points[i];
        const prev = points[(i - 1 + n) % n];
        const currIn = inside(curr);
        const prevIn = inside(prev);

        if (currIn) {
            if (!prevIn) result.push(intersect(prev, curr));
            result.push(curr);
        } else if (prevIn) {
            result.push(intersect(prev, curr));
        }
    }
    return result;
}

export function clipPolygonToWedge(points: Point[], halfAngle: number): Point[] {
    const rightDir = { x: Math.sin(halfAngle), y: Math.cos(halfAngle) };
    const leftDir = { x: -Math.sin(halfAngle), y: Math.cos(halfAngle) };

    const clippedRight = clipToHalfPlane(points, rightDir, 1);
    return clipToHalfPlane(clippedRight, leftDir, -1);
}

// -------------------------------
// COMPOSITE WEBCAM VIDEO INTO MIRRORED WEDGES
// -------------------------------
// q5's WebGPU renderer has no clip/scissor primitive (see clipPolygonToWedge
// above), so image() can't be wedge-clipped directly. This draws the wedge
// composite on a real 2D context instead - ctx.clip() is a plain browser
// primitive - and the caller uploads the result as a single q5 texture.
export function compositeWebcamWedges(
    ctx: CanvasRenderingContext2D,
    video: CanvasImageSource,
    segments: number,
    size: number,
    wedgeWidth: number,
    opacity: number = 1
) {
    const halfWedgeAngle = Math.PI / segments;
    ctx.clearRect(0, 0, size, size);
    ctx.globalAlpha = opacity;

    for (let i = 0; i < segments; i++) {
        const mirrored = i % 2 !== 0;
        const wedgeAngle = halfWedgeAngle + i * ((Math.PI * 2) / segments);

        // save/restore is wrapped in try/finally so a mid-wedge failure (e.g.
        // drawImage on a not-yet-ready video frame) can never leave the clip
        // and transform applied to every wedge drawn after it, this frame or
        // the next - without it a single bad frame corrupts the whole buffer.
        ctx.save();
        try {
            ctx.translate(size / 2, size / 2);
            ctx.rotate(wedgeAngle);
            if (mirrored) ctx.scale(-1, 1);

            // same wedge cone as clipPolygonToWedge: apex at origin, ±halfWedgeAngle
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.lineTo(-wedgeWidth / 2, size / 2);
            ctx.lineTo(wedgeWidth / 2, size / 2);
            ctx.closePath();
            ctx.clip();

            // drawing the same source crop into every wedge's rotated/mirrored
            // local frame is what produces the mirrored kaleidoscope symmetry -
            // the same trick segmentMatrix/mirrorPointsX apply to shape points.
            ctx.drawImage(video, -size / 2, -size / 2, size, size);
        } finally {
            ctx.restore();
        }
    }
}

// -------------------------------
// EMIT A (POSSIBLY CLIPPED) POLYGON
// -------------------------------
export function drawPolygon(q: any, points: Point[], fillColor: Color, strokeColor: Color) {
    if (points.length < 3) return;

    // q5's WebGPU renderer only parses #hex/named-color strings, not rgba()/hsl() syntax,
    // so colors are passed as explicit numeric components instead of CSS strings.
    q.fill(fillColor.r, fillColor.g, fillColor.b, fillColor.a);
    q.stroke(strokeColor.r, strokeColor.g, strokeColor.b, strokeColor.a);

    q.beginShape();
    for (const p of points) q.vertex(p.x, p.y);
    q.endShape(true);
}

// Same as drawPolygon, but reads directly from a pooled flat buffer - the
// counterpart used on the hot "entirely inside the wedge" path.
export function drawPolygonFlat(q: any, points: Float32Array, fillColor: Color, strokeColor: Color) {
    if (points.length < 6) return;

    q.fill(fillColor.r, fillColor.g, fillColor.b, fillColor.a);
    q.stroke(strokeColor.r, strokeColor.g, strokeColor.b, strokeColor.a);

    q.beginShape();
    for (let i = 0; i < points.length; i += 2) q.vertex(points[i], points[i + 1]);
    q.endShape(true);
}
