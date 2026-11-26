// Procedural 3D meshes for the Island Runway, CVN-07 Halcyon Aircraft Carrier,
// Stone Arch landmark, glowing Sky-Ring gates, volumetric 3D clouds, and Cargo Parachutes.

import { pushBox } from './aircraft-mesh.js';
import { createRng } from './math3d.js';
import { CARRIER_SPEC, RUNWAY_SPEC, STONE_ARCH_SPEC, WORLD_HALF_EXTENT } from './terrain-gen.js';

export function buildOceanMesh() {
  const s = WORLD_HALF_EXTENT * 1.4;
  const positions = new Float32Array([
    -s, 0, -s,
    -s, 0, s,
    s, 0, s,
    -s, 0, -s,
    s, 0, s,
    s, 0, -s,
  ]);
  return { positions };
}

export function buildRunwayMeshes() {
  const solidP = [], solidN = [], solidC = [];
  const litP = [], litN = [], litC = [];

  const [cx, cy, cz] = RUNWAY_SPEC.center;
  const L = RUNWAY_SPEC.length;
  const W = RUNWAY_SPEC.width;
  const asphalt = [0.16, 0.18, 0.21];
  const shoulder = [0.34, 0.36, 0.32];
  const whitePaint = [0.95, 0.96, 0.98];
  const towerBody = [0.78, 0.81, 0.85];
  const hangarCol = [0.58, 0.44, 0.34];

  // Paved runway deck & shoulders slightly raised above terrain pad
  pushBox(solidP, solidN, solidC, cx, cy + 0.3, cz, W + 14, 1.4, L + 20, shoulder);
  pushBox(solidP, solidN, solidC, cx, cy + 0.5, cz, W, 1.4, L, asphalt);

  // Dashed centerline stripes + threshold bars
  for (let z = -L * 0.42; z <= L * 0.42; z += 44) {
    pushBox(solidP, solidN, solidC, cx, cy + 1.24, cz + z, 1.8, 0.1, 22, whitePaint);
  }
  for (const endZ of [-L * 0.46, L * 0.46]) {
    for (let x = -W * 0.34; x <= W * 0.34; x += 7.5) {
      pushBox(solidP, solidN, solidC, cx + x, cy + 1.24, cz + endZ, 3.2, 0.1, 26, whitePaint);
    }
  }

  // Control Tower & Hangar beside runway
  pushBox(solidP, solidN, solidC, cx + 68, cy + 16, cz - 80, 14, 32, 14, towerBody);
  pushBox(litP, litN, litC, cx + 68, cy + 33, cz - 80, 17, 6, 17, [0.32, 0.88, 1.0]);
  pushBox(solidP, solidN, solidC, cx + 76, cy + 9, cz + 65, 38, 18, 56, hangarCol);

  // Edge runway approach beacons & threshold green/red lights
  for (let z = -L * 0.48; z <= L * 0.48; z += 65) {
    pushBox(litP, litN, litC, cx - W * 0.52, cy + 1.6, cz + z, 1.6, 1.6, 1.6, [0.95, 0.92, 0.55]);
    pushBox(litP, litN, litC, cx + W * 0.52, cy + 1.6, cz + z, 1.6, 1.6, 1.6, [0.95, 0.92, 0.55]);
  }
  for (let x = -W * 0.35; x <= W * 0.35; x += 9) {
    pushBox(litP, litN, litC, cx + x, cy + 1.8, cz + L * 0.5 + 4, 1.8, 1.8, 1.8, [0.22, 1.0, 0.48]);
    pushBox(litP, litN, litC, cx + x, cy + 1.8, cz - L * 0.5 - 4, 1.8, 1.8, 1.8, [1.0, 0.25, 0.25]);
  }

  return {
    solid: { positions: new Float32Array(solidP), normals: new Float32Array(solidN), colors: new Float32Array(solidC) },
    lights: { positions: new Float32Array(litP), normals: new Float32Array(litN), colors: new Float32Array(litC) },
  };
}

export function buildCarrierMeshes() {
  // Built in carrier local space: stern is +Z, bow is -Z, deck top at y = CARRIER_SPEC.deckHeight
  const solidP = [], solidN = [], solidC = [];
  const litP = [], litN = [], litC = [];
  const H = CARRIER_SPEC.deckHeight;
  const L = CARRIER_SPEC.deckLength;
  const W = CARRIER_SPEC.deckWidth;

  const hullGrey = [0.27, 0.31, 0.36];
  const deckGrey = [0.15, 0.17, 0.2];
  const towerGrey = [0.38, 0.42, 0.47];
  const stripeAmber = [0.96, 0.72, 0.18];
  const stripeWhite = [0.95, 0.96, 0.98];

  // Main armored hull & flight deck
  pushBox(solidP, solidN, solidC, 0, H * 0.46, 0, W * 0.76, H * 0.9, L * 0.92, hullGrey);
  pushBox(solidP, solidN, solidC, 0, H - 1.2, 0, W, 2.4, L, deckGrey);
  // Bow flare
  pushBox(solidP, solidN, solidC, 0, H - 1.2, -L * 0.52, W * 0.65, 2.4, 24, deckGrey);

  // Island superstructure on starboard side (+X)
  pushBox(solidP, solidN, solidC, W * 0.36, H + 11, -18, 11, 22, 42, towerGrey);
  pushBox(litP, litN, litC, W * 0.36, H + 18, -18, 12.2, 4.5, 28, [0.36, 0.9, 1.0]);
  pushBox(solidP, solidN, solidC, W * 0.36, H + 26, -24, 2.4, 12, 2.4, towerGrey);

  // Dashed landing centerline & edge markings
  for (let z = -L * 0.44; z <= L * 0.44; z += 20) {
    pushBox(solidP, solidN, solidC, -2.5, H + 0.08, z, 1.5, 0.12, 10, stripeWhite);
  }
  pushBox(solidP, solidN, solidC, -W * 0.46, H + 0.08, 0, 1.2, 0.12, L * 0.94, stripeAmber);
  pushBox(solidP, solidN, solidC, W * 0.46, H + 0.08, 0, 1.2, 0.12, L * 0.94, stripeAmber);

  // Four raised steel arresting wires near stern (+Z half of deck)
  for (let w = 0; w < 4; w++) {
    const wz = L * 0.34 - w * 22;
    pushBox(solidP, solidN, solidC, -2.5, H + 0.18, wz, W * 0.68, 0.25, 0.45, [0.95, 0.85, 0.35]);
  }

  // Deck edge guide lights + stern lineup lights
  for (let z = -L * 0.45; z <= L * 0.45; z += 26) {
    pushBox(litP, litN, litC, -W * 0.48, H + 0.6, z, 1.4, 1.2, 1.4, [0.25, 0.92, 1.0]);
    pushBox(litP, litN, litC, W * 0.48, H + 0.6, z, 1.4, 1.2, 1.4, [0.98, 0.72, 0.22]);
  }
  // 4-lamp PAPI glideslope bar on port deck edge
  const papiCols = [[1.0, 0.22, 0.2], [1.0, 0.22, 0.2], [0.98, 0.96, 0.92], [0.98, 0.96, 0.92]];
  for (let i = 0; i < 4; i++) {
    pushBox(litP, litN, litC, -W * 0.48 - 3.5 - i * 3.0, H + 2.2, L * 0.18, 2.2, 1.6, 1.6, papiCols[i]);
  }

  return {
    solid: { positions: new Float32Array(solidP), normals: new Float32Array(solidN), colors: new Float32Array(solidC) },
    lights: { positions: new Float32Array(litP), normals: new Float32Array(litN), colors: new Float32Array(litC) },
  };
}

export function buildStoneArchMesh() {
  const p = [], n = [], c = [];
  const segs = 14;
  const radius = STONE_ARCH_SPEC.radius;
  const rockCol = [0.43, 0.39, 0.36];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * (radius * 0.86);
    const rotZ = a - Math.PI * 0.5;
    pushBox(p, n, c, x, y, 0, 26, 28, 34, rockCol, 0, 0, rotZ);
  }
  // Anchor pillars extending down into the fjord
  pushBox(p, n, c, -radius, -140, 0, 34, 280, 42, rockCol);
  pushBox(p, n, c, radius, -140, 0, 34, 280, 42, rockCol);
  return { positions: new Float32Array(p), normals: new Float32Array(n), colors: new Float32Array(c) };
}

export function buildSkyRingMesh() {
  const p = [], n = [], c = [];
  const segs = 24;
  const col = [0.35, 0.96, 0.88];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    const x = Math.cos(a);
    const y = Math.sin(a);
    pushBox(p, n, c, x, y, 0, 0.11, 0.28, 0.14, col, 0, 0, a);
  }
  return { positions: new Float32Array(p), normals: new Float32Array(n), colors: new Float32Array(c) };
}

export function buildCloudPuffMesh() {
  const p = [], n = [], c = [];
  const col = [1.0, 0.98, 0.96];
  pushBox(p, n, c, 0, 0, 0, 160, 44, 115, col);
  pushBox(p, n, c, -55, 12, 12, 95, 36, 82, col);
  pushBox(p, n, c, 60, 14, -14, 98, 38, 86, col);
  pushBox(p, n, c, 5, 22, 0, 88, 32, 74, col);
  return { positions: new Float32Array(p), normals: new Float32Array(n), colors: new Float32Array(c) };
}

export function generateCloudPlacements() {
  const rng = createRng(99217);
  const clouds = [];
  for (let i = 0; i < 42; i++) {
    const x = (rng() - 0.5) * WORLD_HALF_EXTENT * 1.45;
    const z = (rng() - 0.5) * WORLD_HALF_EXTENT * 1.45;
    const y = 960 + rng() * 580;
    const sx = 1.0 + rng() * 1.6;
    const sy = 0.7 + rng() * 0.75;
    const sz = 1.0 + rng() * 1.5;
    clouds.push({ pos: [x, y, z], scale: [sx, sy, sz], yaw: rng() * Math.PI * 2 });
  }
  return clouds;
}

export function buildCargoBeaconMesh() {
  const p = [], n = [], c = [];
  // Ground flare pad + glowing vertical flare smoke column + beacon ring markers
  pushBox(p, n, c, 0, 5, 0, 22, 10, 22, [1.0, 0.45, 0.16]);
  pushBox(p, n, c, 0, 95, 0, 7.5, 190, 7.5, [1.0, 0.78, 0.28]);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    pushBox(p, n, c, Math.cos(a) * 65, 8, Math.sin(a) * 65, 14, 6, 6, [1.0, 0.58, 0.2], 0, -a, 0);
  }
  return { positions: new Float32Array(p), normals: new Float32Array(n), colors: new Float32Array(c) };
}

export function buildParachuteCrateMesh() {
  const p = [], n = [], c = [];
  // Crate
  pushBox(p, n, c, 0, 0, 0, 7, 6, 7, [0.85, 0.62, 0.28]);
  // Canopy dome
  pushBox(p, n, c, 0, 18, 0, 19, 5, 19, [0.96, 0.92, 0.85]);
  pushBox(p, n, c, 0, 21, 0, 13, 3, 13, [0.96, 0.34, 0.22]);
  return { positions: new Float32Array(p), normals: new Float32Array(n), colors: new Float32Array(c) };
}
