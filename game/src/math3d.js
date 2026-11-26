// Core 3D vector, matrix, quaternion, and deterministic PRNG math utilities.

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function createRng(seed = 20261126) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function vec3(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function vec3Add(a, b, out = [0, 0, 0]) {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  out[2] = a[2] + b[2];
  return out;
}

export function vec3Sub(a, b, out = [0, 0, 0]) {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  out[2] = a[2] - b[2];
  return out;
}

export function vec3Scale(a, s, out = [0, 0, 0]) {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
  out[2] = a[2] * s;
  return out;
}

export function vec3Dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function vec3Cross(a, b, out = [0, 0, 0]) {
  const ax = a[0], ay = a[1], az = a[2];
  const bx = b[0], by = b[1], bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function vec3Len(a) {
  return Math.hypot(a[0], a[1], a[2]);
}

export function vec3Norm(a, out = [0, 0, 0]) {
  const len = Math.hypot(a[0], a[1], a[2]) || 1;
  out[0] = a[0] / len;
  out[1] = a[1] / len;
  out[2] = a[2] / len;
  return out;
}

export function quatIdentity() {
  return [0, 0, 0, 1];
}

export function quatFromAxisAngle(axis, rad, out = [0, 0, 0, 1]) {
  const half = rad * 0.5;
  const s = Math.sin(half);
  const len = Math.hypot(axis[0], axis[1], axis[2]) || 1;
  out[0] = (axis[0] / len) * s;
  out[1] = (axis[1] / len) * s;
  out[2] = (axis[2] / len) * s;
  out[3] = Math.cos(half);
  return out;
}

export function quatMul(a, b, out = [0, 0, 0, 1]) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  out[0] = aw * bx + ax * bw + ay * bz - az * by;
  out[1] = aw * by - ax * bz + ay * bw + az * bx;
  out[2] = aw * bz + ax * by - ay * bx + az * bw;
  out[3] = aw * bw - ax * bx - ay * by - az * bz;
  return out;
}

export function quatNorm(q, out = q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  out[0] = q[0] / len;
  out[1] = q[1] / len;
  out[2] = q[2] / len;
  out[3] = q[3] / len;
  return out;
}

export function quatSlerp(a, b, t, out = [0, 0, 0, 1]) {
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let cosom = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (cosom < 0) {
    cosom = -cosom;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let s0, s1;
  if (1 - cosom > 1e-5) {
    const omega = Math.acos(clamp(cosom, -1, 1));
    const sinom = Math.sin(omega);
    s0 = Math.sin((1 - t) * omega) / sinom;
    s1 = Math.sin(t * omega) / sinom;
  } else {
    s0 = 1 - t;
    s1 = t;
  }
  out[0] = s0 * a[0] + s1 * bx;
  out[1] = s0 * a[1] + s1 * by;
  out[2] = s0 * a[2] + s1 * bz;
  out[3] = s0 * a[3] + s1 * bw;
  return quatNorm(out);
}

export function quatRotateVec(q, v, out = [0, 0, 0]) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const vx = v[0], vy = v[1], vz = v[2];
  const ix = qw * vx + qy * vz - qz * vy;
  const iy = qw * vy + qz * vx - qx * vz;
  const iz = qw * vz + qx * vy - qy * vx;
  const iw = -qx * vx - qy * vy - qz * vz;
  out[0] = ix * qw + iw * -qx + iy * -qz - iz * -qy;
  out[1] = iy * qw + iw * -qy + iz * -qx - ix * -qz;
  out[2] = iz * qw + iw * -qz + ix * -qy - iy * -qx;
  return out;
}

// Heading (0=North/-Z, 90=East/+X), Pitch (rad, +up), Roll (rad, +right-wing-down)
export function quatFromHeadingPitchRoll(headingDeg, pitchRad, rollRad) {
  const yawRad = -(headingDeg * Math.PI) / 180;
  const qY = quatFromAxisAngle([0, 1, 0], yawRad);
  const qP = quatFromAxisAngle([1, 0, 0], pitchRad);
  const qR = quatFromAxisAngle([0, 0, 1], -rollRad);
  return quatNorm(quatMul(quatMul(qY, qP), qR));
}

export function basisFromQuat(q) {
  return {
    right: quatRotateVec(q, [1, 0, 0]),
    up: quatRotateVec(q, [0, 1, 0]),
    forward: quatRotateVec(q, [0, 0, -1]),
  };
}

export function eulerFromQuat(q) {
  const { right, up, forward } = basisFromQuat(q);
  const headingDeg = ((Math.atan2(forward[0], -forward[2]) * 180) / Math.PI + 360) % 360;
  const pitchRad = Math.asin(clamp(forward[1], -1, 1));
  const rollRad = Math.atan2(-right[1], up[1]);
  return { headingDeg, pitchRad, rollRad };
}

export function mat4Identity(out = new Float32Array(16)) {
  out.fill(0);
  out[0] = out[5] = out[10] = out[15] = 1;
  return out;
}

export function mat4Mul(a, b, out = new Float32Array(16)) {
  const r = out === a || out === b ? new Float32Array(16) : out;
  for (let c = 0; c < 4; c++) {
    const b0 = b[c * 4], b1 = b[c * 4 + 1], b2 = b[c * 4 + 2], b3 = b[c * 4 + 3];
    r[c * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    r[c * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    r[c * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    r[c * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  if (r !== out) out.set(r);
  return out;
}

export function mat4Perspective(fovYRad, aspect, near, far, out = new Float32Array(16)) {
  const f = 1 / Math.tan(fovYRad * 0.5);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4LookAt(eye, target, up, out = new Float32Array(16)) {
  const z = vec3Norm(vec3Sub(eye, target));
  const x = vec3Norm(vec3Cross(up, z));
  const y = vec3Cross(z, x);
  out[0] = x[0]; out[4] = x[1]; out[8] = x[2]; out[12] = -vec3Dot(x, eye);
  out[1] = y[0]; out[5] = y[1]; out[9] = y[2]; out[13] = -vec3Dot(y, eye);
  out[2] = z[0]; out[6] = z[1]; out[10] = z[2]; out[14] = -vec3Dot(z, eye);
  out[3] = 0;    out[7] = 0;    out[11] = 0;    out[15] = 1;
  return out;
}

export function mat4Compose(pos, quat, scale = [1, 1, 1], out = new Float32Array(16)) {
  const x = quat[0], y = quat[1], z = quat[2], w = quat[3];
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  const sx = scale[0], sy = scale[1], sz = scale[2];

  out[0] = (1 - (yy + zz)) * sx;
  out[1] = (xy + wz) * sx;
  out[2] = (xz - wy) * sx;
  out[3] = 0;

  out[4] = (xy - wz) * sy;
  out[5] = (1 - (xx + zz)) * sy;
  out[6] = (yz + wx) * sy;
  out[7] = 0;

  out[8] = (xz + wy) * sz;
  out[9] = (yz - wx) * sz;
  out[10] = (1 - (xx + yy)) * sz;
  out[11] = 0;

  out[12] = pos[0];
  out[13] = pos[1];
  out[14] = pos[2];
  out[15] = 1;
  return out;
}

export function projectPoint(worldPos, viewProj) {
  const x = worldPos[0], y = worldPos[1], z = worldPos[2];
  const cx = viewProj[0] * x + viewProj[4] * y + viewProj[8] * z + viewProj[12];
  const cy = viewProj[1] * x + viewProj[5] * y + viewProj[9] * z + viewProj[13];
  const cw = viewProj[3] * x + viewProj[7] * y + viewProj[11] * z + viewProj[15];
  if (cw <= 0.1) return { visible: false, ndcX: cx / (cw || 1), ndcY: cy / (cw || 1), behind: true };
  const ndcX = cx / cw;
  const ndcY = cy / cw;
  return {
    visible: ndcX >= -1.05 && ndcX <= 1.05 && ndcY >= -1.05 && ndcY <= 1.05,
    ndcX,
    ndcY,
    behind: false,
  };
}
