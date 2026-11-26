// Deterministic archipelago terrain generator: alpine fjords, carved river canyon,
// coastal airstrip island, and offshore carrier anchorage.

import { clamp, lerp, smoothstep } from './math3d.js';

export const WORLD_HALF_EXTENT = 7200;
export const RUNWAY_SPEC = {
  center: [-1400, 18.0, 2650],
  headingDeg: 0, // Runs North-South along Z
  length: 840,
  width: 58,
  elevation: 18.0,
};

export const CARRIER_SPEC = {
  center: [1850, 0, -2950],
  headingDeg: 335, // Angled NNW
  deckHeight: 19.5,
  deckLength: 285,
  deckWidth: 52,
};

export const STONE_ARCH_SPEC = {
  center: [520, 210, -350],
  headingDeg: 28,
  radius: 95,
};

function hash2(ix, iz) {
  const n = Math.sin(ix * 127.1 + iz * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function valueNoise2D(x, z) {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

function fbm(x, z, octaves = 5) {
  let val = 0;
  let amp = 0.5;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise2D(x * freq, z * freq);
    freq *= 2.04;
    amp *= 0.5;
  }
  return val;
}

function ridgedNoise(x, z, octaves = 4) {
  let sum = 0;
  let amp = 0.52;
  let freq = 1.0;
  for (let i = 0; i < octaves; i++) {
    const n = 1.0 - Math.abs(valueNoise2D(x * freq, z * freq) * 2.0 - 1.0);
    sum += n * n * amp;
    freq *= 2.08;
    amp *= 0.5;
  }
  return sum;
}

// Compute signed distance to carved river canyon centerline in northern/eastern alpine massif
export function canyonCenterX(z) {
  return 2150 + Math.sin(z * 0.00145) * 420 + Math.cos(z * 0.00072) * 190;
}

export function sampleTerrainHeight(x, z) {
  // 1. Main Alpine Fjord Massif (center-north-west)
  const dxAlpine = (x + 120) / 2600;
  const dzAlpine = (z + 650) / 2900;
  const alpineMask = Math.exp(-(dxAlpine * dxAlpine + dzAlpine * dzAlpine) * 1.15);

  // 2. Eastern Canyon Highlands (x around +2150)
  const dxCanyon = (x - 2150) / 1850;
  const dzCanyon = (z + 400) / 3000;
  const canyonHighland = Math.exp(-(dxCanyon * dxCanyon + dzCanyon * dzCanyon) * 1.1);

  // 3. Southern Coastal Airfield Island (around [-1400, 2650])
  const dxAirfield = (x - RUNWAY_SPEC.center[0]) / 1200;
  const dzAirfield = (z - RUNWAY_SPEC.center[2]) / 1450;
  const islandMask = Math.exp(-(dxAirfield * dxAirfield + dzAirfield * dzAirfield) * 1.35);

  const macro = fbm(x * 0.00032 + 11.4, z * 0.00032 - 7.1, 4);
  const ridges = ridgedNoise(x * 0.00048 - 3.2, z * 0.00048 + 5.7, 4);
  const detail = fbm(x * 0.0019, z * 0.0019, 3) - 0.5;

  let h = -28;
  h += alpineMask * (240 + ridges * 780 + macro * 210);
  h += canyonHighland * (210 + ridges * 520 + macro * 150);
  h += islandMask * (48 + macro * 65);
  h += (alpineMask + canyonHighland) * detail * 48;

  // Carve dramatic fjord inlet cutting between western & central alpine peaks
  const fjordCurve = -620 + Math.sin(z * 0.0013) * 320;
  const fjordDist = Math.abs(x - fjordCurve);
  if (z > -2600 && z < 2300) {
    const fjordWeight = (1.0 - smoothstep(130, 520, fjordDist)) * smoothstep(-2600, -1800, z) * (1.0 - smoothstep(1400, 2300, z));
    h = lerp(h, -18, fjordWeight * 0.92);
  }

  // Carve eastern river canyon for the Canyon Slalom mission
  const cX = canyonCenterX(z);
  const cDist = Math.abs(x - cX);
  const cZMask = smoothstep(-3200, -2400, z) * (1.0 - smoothstep(2400, 3100, z));
  if (cZMask > 0.001) {
    const gorgeCut = (1.0 - smoothstep(115, 340, cDist)) * cZMask;
    const canyonFloor = 14 + fbm(x * 0.002, z * 0.002, 2) * 8;
    h = lerp(h, canyonFloor, gorgeCut * 0.95);
    // Raise canyon rim walls so flying inside feels dramatic
    const rim = smoothstep(125, 290, cDist) * (1.0 - smoothstep(320, 680, cDist)) * cZMask;
    h += rim * 240;
  }

  // Flatten coastal runway plateau cleanly around RUNWAY_SPEC
  const rx = Math.abs(x - RUNWAY_SPEC.center[0]);
  const rz = Math.abs(z - RUNWAY_SPEC.center[2]);
  const rPadX = smoothstep(95, 340, rx);
  const rPadZ = smoothstep(500, 820, rz);
  const runwayFlat = (1.0 - rPadX) * (1.0 - rPadZ);
  if (runwayFlat > 0.001) {
    h = lerp(h, RUNWAY_SPEC.elevation, runwayFlat);
  }

  // Keep carrier anchorage deep ocean
  const cx = x - CARRIER_SPEC.center[0];
  const cz = z - CARRIER_SPEC.center[2];
  const carrierClear = 1.0 - smoothstep(450, 950, Math.hypot(cx, cz));
  if (carrierClear > 0.001) {
    h = lerp(h, -34, carrierClear);
  }

  // Taper outer ocean edges smoothly below sea level
  const edgeDist = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF_EXTENT;
  if (edgeDist > 0.78) {
    h = lerp(h, -42, smoothstep(0.78, 0.98, edgeDist));
  }

  return h;
}

export function sampleTerrainNormal(x, z) {
  const e = 8.0;
  const hL = sampleTerrainHeight(x - e, z);
  const hR = sampleTerrainHeight(x + e, z);
  const hD = sampleTerrainHeight(x, z - e);
  const hU = sampleTerrainHeight(x, z + e);
  const nx = hL - hR;
  const ny = 2 * e;
  const nz = hD - hU;
  const len = Math.hypot(nx, ny, nz) || 1;
  return [nx / len, ny / len, nz / len];
}

// Check if aircraft coordinates lie over the Island Runway or Carrier Flight Deck
export function sampleLandingSurface(x, z) {
  // Check Island Runway
  const rx = x - RUNWAY_SPEC.center[0];
  const rz = z - RUNWAY_SPEC.center[2];
  if (Math.abs(rx) <= RUNWAY_SPEC.width * 0.5 && Math.abs(rz) <= RUNWAY_SPEC.length * 0.5) {
    return {
      kind: 'runway',
      elevation: RUNWAY_SPEC.elevation,
      centerlineOffset: rx,
      alongRatio: (rz + RUNWAY_SPEC.length * 0.5) / RUNWAY_SPEC.length,
    };
  }

  // Check Aircraft Carrier Deck (rotated by CARRIER_SPEC.headingDeg)
  const rad = (CARRIER_SPEC.headingDeg * Math.PI) / 180;
  const fwdX = Math.sin(rad);
  const fwdZ = -Math.cos(rad);
  const rightX = Math.cos(rad);
  const rightZ = Math.sin(rad);
  const dx = x - CARRIER_SPEC.center[0];
  const dz = z - CARRIER_SPEC.center[2];
  const localAlong = dx * fwdX + dz * fwdZ; // -stern .. +bow
  const localAcross = dx * rightX + dz * rightZ;

  if (
    Math.abs(localAcross) <= CARRIER_SPEC.deckWidth * 0.5 &&
    Math.abs(localAlong) <= CARRIER_SPEC.deckLength * 0.5
  ) {
    return {
      kind: 'carrier',
      elevation: CARRIER_SPEC.deckHeight,
      centerlineOffset: localAcross,
      alongFromStern: localAlong + CARRIER_SPEC.deckLength * 0.5,
      deckLength: CARRIER_SPEC.deckLength,
    };
  }

  return null;
}

export function buildTerrainGridData(gridN = 176) {
  const vertCount = gridN * gridN;
  const positions = new Float32Array(vertCount * 3);
  const normals = new Float32Array(vertCount * 3);
  const step = (WORLD_HALF_EXTENT * 2) / (gridN - 1);

  for (let j = 0; j < gridN; j++) {
    const z = -WORLD_HALF_EXTENT + j * step;
    for (let i = 0; i < gridN; i++) {
      const x = -WORLD_HALF_EXTENT + i * step;
      const y = sampleTerrainHeight(x, z);
      const n = sampleTerrainNormal(x, z);
      const idx = (j * gridN + i) * 3;
      positions[idx] = x;
      positions[idx + 1] = y;
      positions[idx + 2] = z;
      normals[idx] = n[0];
      normals[idx + 1] = n[1];
      normals[idx + 2] = n[2];
    }
  }

  const quadCount = (gridN - 1) * (gridN - 1);
  const indices = new Uint32Array(quadCount * 6);
  let ptr = 0;
  for (let j = 0; j < gridN - 1; j++) {
    for (let i = 0; i < gridN - 1; i++) {
      const a = j * gridN + i;
      const b = a + 1;
      const c = a + gridN;
      const d = c + 1;
      indices[ptr++] = a;
      indices[ptr++] = c;
      indices[ptr++] = b;
      indices[ptr++] = b;
      indices[ptr++] = c;
      indices[ptr++] = d;
    }
  }

  return { positions, normals, indices, gridN };
}
