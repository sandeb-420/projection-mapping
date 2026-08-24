/**
 * Jacobi eigenvalue decomposition for small symmetric matrices.
 * Used to extract the DLT nullspace (smallest eigenvector of AᵀA).
 */
export function jacobiEigenSymmetric(
  matrix: Float64Array,
  size: number,
  maxSweeps = 32,
): { values: Float64Array; vectors: Float64Array } {
  const a = matrix.slice();
  const v = new Float64Array(size * size);
  const values = new Float64Array(size);
  for (let i = 0; i < size; i++) v[i * size + i] = 1;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        off += Math.abs(a[i * size + j]!);
      }
    }
    if (off < 1e-14) break;

    for (let p = 0; p < size; p++) {
      for (let q = p + 1; q < size; q++) {
        const apq = a[p * size + q]!;
        if (Math.abs(apq) < 1e-16) continue;
        const app = a[p * size + p]!;
        const aqq = a[q * size + q]!;
        const tau = (aqq - app) / (2 * apq);
        const t =
          Math.sign(tau) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
        const c = 1 / Math.sqrt(1 + t * t);
        const s = t * c;

        for (let k = 0; k < size; k++) {
          if (k === p || k === q) continue;
          const akp = a[k * size + p]!;
          const akq = a[k * size + q]!;
          a[k * size + p] = a[p * size + k] = c * akp - s * akq;
          a[k * size + q] = a[q * size + k] = s * akp + c * akq;
        }
        a[p * size + p] = app - t * apq;
        a[q * size + q] = aqq + t * apq;
        a[p * size + q] = a[q * size + p] = 0;

        for (let k = 0; k < size; k++) {
          const vkp = v[k * size + p]!;
          const vkq = v[k * size + q]!;
          v[k * size + p] = c * vkp - s * vkq;
          v[k * size + q] = s * vkp + c * vkq;
        }
      }
    }
  }

  for (let i = 0; i < size; i++) values[i] = a[i * size + i]!;
  return { values, vectors: v };
}

/** Smallest-eigenvalue eigenvector of AᵀA, where A is rows×cols. */
export function smallestRightNullspace(
  rows: number,
  cols: number,
  A: Float64Array,
): Float64Array {
  const ata = new Float64Array(cols * cols);
  for (let i = 0; i < cols; i++) {
    for (let j = i; j < cols; j++) {
      let s = 0;
      for (let r = 0; r < rows; r++) {
        s += A[r * cols + i]! * A[r * cols + j]!;
      }
      ata[i * cols + j] = s;
      ata[j * cols + i] = s;
    }
  }
  const { values, vectors } = jacobiEigenSymmetric(ata, cols);
  let minIdx = 0;
  for (let i = 1; i < cols; i++) {
    if (values[i]! < values[minIdx]!) minIdx = i;
  }
  const x = new Float64Array(cols);
  for (let i = 0; i < cols; i++) x[i] = vectors[i * cols + minIdx]!;
  return x;
}
