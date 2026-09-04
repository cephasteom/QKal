// Projects the 2^n basis states onto 2D as vertices of the n-dimensional
// hypercube (sum of one unit vector per set bit) - real adjacency, since
// single-qubit gates move amplitude along hypercube edges. See
// QKAL_MATERIALS_PLAN.md phase 1.
export function hypercubeLayout(n: number, radius: number): Float32Array<ArrayBuffer> {
  const dim = 1 << n;
  const pos = new Float32Array(dim * 2);
  const ax = new Float32Array(n * 2);
  for (let k = 0; k < n; k++) {
    const a = (2 * Math.PI * k) / n;
    ax[k * 2] = Math.cos(a);
    ax[k * 2 + 1] = Math.sin(a);
  }
  for (let i = 0; i < dim; i++) {
    let x = 0, y = 0;
    for (let k = 0; k < n; k++) {
      if (i >> k & 1) { x += ax[k * 2]; y += ax[k * 2 + 1]; }
    }
    pos[i * 2] = (x / n) * radius;
    pos[i * 2 + 1] = (y / n) * radius;
  }
  return pos;
}
