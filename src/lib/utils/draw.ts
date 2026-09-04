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
export function superformulaPoints(size: number, params: SuperformulaParams): Point[] {
    const { m, n1, n2, n3 } = params;
    const points: Point[] = [];
    const step = 0.05;

    for (let phi = 0; phi < Math.PI * 2; phi += step) {
        const r = superformula(phi, m, n1, n2, n3) * size;
        points.push({ x: r * Math.cos(phi), y: r * Math.sin(phi) });
    }

    return points;
}

// -------------------------------
// POINT-LIST TRANSFORMS
// -------------------------------
// q5's rotate()/scale() mix pre- and post-multiply matrix composition, which
// makes nesting a per-object rotation inside an already-mirrored wedge
// transform unpredictable. All positioning is instead done as plain point
// math here, with a single self-consistent convention, so q5 only ever
// receives final absolute coordinates.
export function rotatePoints(points: Point[], angle: number): Point[] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return points.map(({ x, y }) => ({ x: x * cos - y * sin, y: x * sin + y * cos }));
}

export function translatePoints(points: Point[], dx: number, dy: number): Point[] {
    return points.map(({ x, y }) => ({ x: x + dx, y: y + dy }));
}

export function mirrorPointsX(points: Point[]): Point[] {
    return points.map(({ x, y }) => ({ x: -x, y }));
}

// Applies a 2x2 matrix to every point in one pass, for when several of the
// transforms above have been pre-composed (see segmentMatrix below).
export function applyMatrix(points: Point[], m: Matrix2D): Point[] {
    return points.map(({ x, y }) => ({ x: m.a * x + m.c * y, y: m.b * x + m.d * y }));
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
            // the same trick rotatePoints/mirrorPointsX apply to shape points.
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
