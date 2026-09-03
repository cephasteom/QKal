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
