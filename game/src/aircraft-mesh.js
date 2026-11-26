// Procedural 3D sculpted twin-tail aircraft mesh, lit cockpit coaming/MFDs,
// articulated control surfaces, retractable gear, afterburner cones, and wingtip contrails.

export function pushBox(outPos, outNorm, outCol, cx, cy, cz, sx, sy, sz, color, rotX = 0, rotY = 0, rotZ = 0) {
  const hx = sx * 0.5;
  const hy = sy * 0.5;
  const hz = sz * 0.5;

  const faces = [
    { n: [0, 0, 1], v: [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]] },
    { n: [0, 0, -1], v: [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]] },
    { n: [1, 0, 0], v: [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]] },
    { n: [-1, 0, 0], v: [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]] },
    { n: [0, 1, 0], v: [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]] },
    { n: [0, -1, 0], v: [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]] },
  ];

  const cxR = Math.cos(rotX), sxR = Math.sin(rotX);
  const cyR = Math.cos(rotY), syR = Math.sin(rotY);
  const czR = Math.cos(rotZ), szR = Math.sin(rotZ);

  const xf = (p) => {
    let x = p[0], y = p[1], z = p[2];
    if (rotZ) { const nx = x * czR - y * szR, ny = x * szR + y * czR; x = nx; y = ny; }
    if (rotX) { const ny = y * cxR - z * sxR, nz = y * sxR + z * cxR; y = ny; z = nz; }
    if (rotY) { const nx = x * cyR + z * syR, nz = -x * syR + z * cyR; x = nx; z = nz; }
    return [x, y, z];
  };

  for (const f of faces) {
    const rn = xf(f.n);
    const p0 = xf(f.v[0]);
    const p1 = xf(f.v[1]);
    const p2 = xf(f.v[2]);
    const p3 = xf(f.v[3]);
    const tris = [p0, p1, p2, p0, p2, p3];
    for (const p of tris) {
      outPos.push(p[0] + cx, p[1] + cy, p[2] + cz);
      outNorm.push(rn[0], rn[1], rn[2]);
      outCol.push(color[0], color[1], color[2]);
    }
  }
}

export function pushPrismWing(outPos, outNorm, outCol, pointsTop, pointsBot, thickness, color) {
  // pointsTop: [rootLE, rootTE, tipTE, tipLE] in (x, y, z)
  const addTri = (a, b, c, nOverride = null) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    if (nOverride) { nx = nOverride[0]; ny = nOverride[1]; nz = nOverride[2]; }
    outPos.push(...a, ...b, ...c);
    outNorm.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    outCol.push(...color, ...color, ...color);
  };

  const t = pointsTop;
  const b = pointsBot || t.map((p) => [p[0], p[1] - thickness, p[2]]);
  // Top face & bottom face
  addTri(t[0], t[1], t[2]);
  addTri(t[0], t[2], t[3]);
  addTri(b[0], b[2], b[1]);
  addTri(b[0], b[3], b[2]);
  // Perimeter walls
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    addTri(t[i], b[i], b[j]);
    addTri(t[i], b[j], t[j]);
  }
}

export function buildAircraftPartMeshes() {
  // 1. Main airframe body (fuselage, swept wings, strakes, intakes, vertical fins, stripe livery)
  const airP = [], airN = [], airC = [];
  const bodySlate = [0.85, 0.88, 0.92];
  const darkTrim = [0.16, 0.21, 0.27];
  const squadronAmber = [0.95, 0.56, 0.14];
  const noseCol = [0.22, 0.27, 0.34];

  // Center fuselage spine & mid body
  pushBox(airP, airN, airC, 0, 0.0, -0.2, 1.45, 1.05, 8.2, bodySlate);
  pushBox(airP, airN, airC, 0, 0.28, -0.7, 1.02, 0.72, 6.4, bodySlate);
  // Forward nose cone tapering cleanly
  pushBox(airP, airN, airC, 0, -0.05, -5.0, 0.95, 0.75, 2.2, noseCol);
  pushBox(airP, airN, airC, 0, -0.09, -6.5, 0.54, 0.45, 1.6, darkTrim);
  pushBox(airP, airN, airC, 0, -0.12, -7.5, 0.22, 0.22, 0.9, squadronAmber);
  // Twin side intakes & nacelles
  pushBox(airP, airN, airC, -1.05, -0.08, 0.65, 0.78, 0.82, 5.4, darkTrim);
  pushBox(airP, airN, airC, 1.05, -0.08, 0.65, 0.78, 0.82, 5.4, darkTrim);
  pushBox(airP, airN, airC, -1.05, 0.36, 0.65, 0.74, 0.14, 5.0, squadronAmber);
  pushBox(airP, airN, airC, 1.05, 0.36, 0.65, 0.74, 0.14, 5.0, squadronAmber);

  // Main swept delta wings (left & right)
  pushPrismWing(airP, airN, airC,
    [[-1.1, 0.05, -2.0], [-1.1, 0.05, 2.4], [-6.6, -0.15, 2.9], [-6.6, -0.15, 1.0]],
    null, 0.22, bodySlate);
  pushPrismWing(airP, airN, airC,
    [[1.1, 0.05, -2.0], [6.6, -0.15, 1.0], [6.6, -0.15, 2.9], [1.1, 0.05, 2.4]],
    null, 0.22, bodySlate);

  // Wingtip missile rails & amber squadron tips
  pushBox(airP, airN, airC, -6.7, -0.18, 1.95, 0.26, 0.26, 2.5, squadronAmber);
  pushBox(airP, airN, airC, 6.7, -0.18, 1.95, 0.26, 0.26, 2.5, squadronAmber);

  // Cantilevered twin vertical stabilizers
  pushBox(airP, airN, airC, -1.35, 1.35, 3.15, 0.16, 2.05, 1.85, bodySlate, 0.18, 0, 0.26);
  pushBox(airP, airN, airC, 1.35, 1.35, 3.15, 0.16, 2.05, 1.85, bodySlate, 0.18, 0, -0.26);
  pushBox(airP, airN, airC, -1.58, 2.25, 3.45, 0.17, 0.42, 1.4, squadronAmber, 0.18, 0, 0.26);
  pushBox(airP, airN, airC, 1.58, 2.25, 3.45, 0.17, 0.42, 1.4, squadronAmber, 0.18, 0, -0.26);

  // Canopy glare shield & cockpit rim
  pushBox(airP, airN, airC, 0, 0.72, -3.1, 0.92, 0.22, 1.2, darkTrim);

  // 2. Lit instruments, canopy glass & nav beacons (emissive aircraft details!)
  const litP = [], litN = [], litC = [];
  // Glowing cockpit MFD console visible inside canopy from chase view too
  pushBox(litP, litN, litC, 0, 0.84, -2.95, 0.72, 0.26, 0.34, [0.2, 0.92, 0.85]);
  // Port red wingtip strobe & Starboard green wingtip strobe
  pushBox(litP, litN, litC, -6.78, -0.16, 1.35, 0.28, 0.28, 0.45, [1.0, 0.18, 0.22]);
  pushBox(litP, litN, litC, 6.78, -0.16, 1.35, 0.28, 0.28, 0.45, [0.18, 1.0, 0.45]);
  // Tail top beacon
  pushBox(litP, litN, litC, -1.62, 2.48, 3.6, 0.2, 0.22, 0.24, [1.0, 0.85, 0.3]);
  pushBox(litP, litN, litC, 1.62, 2.48, 3.6, 0.2, 0.22, 0.24, [1.0, 0.85, 0.3]);
  // Engine turbine glow cores
  pushBox(litP, litN, litC, -0.68, -0.05, 4.15, 0.56, 0.56, 0.35, [0.35, 0.78, 1.0]);
  pushBox(litP, litN, litC, 0.68, -0.05, 4.15, 0.56, 0.56, 0.35, [0.35, 0.78, 1.0]);

  // 3. Tinted bubble canopy glass
  const canP = [], canN = [], canC = [];
  pushBox(canP, canN, canC, 0, 0.86, -2.4, 0.86, 0.66, 2.55, [0.22, 0.54, 0.74]);

  // 4. Articulated control surfaces (sleeker thinner control tabs matching wing chord)
  const surfP = [], surfN = [], surfC = [];
  pushBox(surfP, surfN, surfC, 0, 0, 0, 1.75, 0.08, 0.46, squadronAmber);

  // 5. Tapered multi-tier afterburner plasma plumes (outer golden cone + bright blue-white shock core)
  const abP = [], abN = [], abC = [];
  for (const ex of [-0.68, 0.68]) {
    pushBox(abP, abN, abC, ex, -0.05, 0.75, 0.44, 0.44, 1.5, [1.0, 0.68, 0.24]);
    pushBox(abP, abN, abC, ex, -0.05, 1.7, 0.30, 0.30, 1.4, [1.0, 0.88, 0.56]);
    pushBox(abP, abN, abC, ex, -0.05, 2.45, 0.16, 0.16, 0.9, [0.85, 0.96, 1.0]);
  }

  // 6. Retractable landing gear (nose + two main struts + tires)
  const gearP = [], gearN = [], gearC = [];
  const strutCol = [0.7, 0.75, 0.8];
  const tireCol = [0.1, 0.11, 0.13];
  pushBox(gearP, gearN, gearC, 0, -1.05, -4.4, 0.14, 1.15, 0.14, strutCol);
  pushBox(gearP, gearN, gearC, 0, -1.62, -4.4, 0.24, 0.52, 0.52, tireCol);
  pushBox(gearP, gearN, gearC, -1.35, -1.05, 0.9, 0.16, 1.15, 0.16, strutCol);
  pushBox(gearP, gearN, gearC, -1.35, -1.62, 0.9, 0.3, 0.62, 0.62, tireCol);
  pushBox(gearP, gearN, gearC, 1.35, -1.05, 0.9, 0.16, 1.15, 0.16, strutCol);
  pushBox(gearP, gearN, gearC, 1.35, -1.62, 0.9, 0.3, 0.62, 0.62, tireCol);

  // 7. 3D Cockpit Interior (glare shield, canopy bow struts, nose cowling, recessed dark MFD bezels)
  const ckSolidP = [], ckSolidN = [], ckSolidC = [];
  // Matte charcoal instrument hood & glare shield
  pushBox(ckSolidP, ckSolidN, ckSolidC, 0, -0.58, -1.12, 2.1, 0.42, 0.72, [0.09, 0.12, 0.16]);
  pushBox(ckSolidP, ckSolidN, ckSolidC, 0, -0.34, -1.06, 1.56, 0.08, 0.42, [0.14, 0.18, 0.24]);
  // Angled canopy bow struts framing the forward windshield
  pushBox(ckSolidP, ckSolidN, ckSolidC, -0.92, 0.02, -0.78, 0.09, 1.1, 0.09, [0.14, 0.17, 0.22], 0.35, 0, -0.26);
  pushBox(ckSolidP, ckSolidN, ckSolidC, 0.92, 0.02, -0.78, 0.09, 1.1, 0.09, [0.14, 0.17, 0.22], 0.35, 0, 0.26);
  pushBox(ckSolidP, ckSolidN, ckSolidC, 0, 0.56, -0.58, 1.55, 0.07, 0.09, [0.14, 0.17, 0.22]);
  // Forward nose cowling & pitot stripe visible ahead of windscreen
  pushBox(ckSolidP, ckSolidN, ckSolidC, 0, -0.76, -2.55, 0.88, 0.32, 2.55, [0.24, 0.29, 0.36]);
  pushBox(ckSolidP, ckSolidN, ckSolidC, 0, -0.58, -2.45, 0.14, 0.06, 2.2, squadronAmber);

  // Subtle canopy coaming master-caution LEDs (the 3 main MFDs render via glass HUD above console)
  const ckLitP = [], ckLitN = [], ckLitC = [];
  pushBox(ckLitP, ckLitN, ckLitC, -0.52, -0.56, -0.84, 0.08, 0.025, 0.02, [0.22, 0.96, 0.64]);
  pushBox(ckLitP, ckLitN, ckLitC, 0.52, -0.56, -0.84, 0.08, 0.025, 0.02, [1.0, 0.68, 0.18]);

  return {
    airframe: { positions: new Float32Array(airP), normals: new Float32Array(airN), colors: new Float32Array(airC) },
    lights: { positions: new Float32Array(litP), normals: new Float32Array(litN), colors: new Float32Array(litC) },
    canopy: { positions: new Float32Array(canP), normals: new Float32Array(canN), colors: new Float32Array(canC) },
    surface: { positions: new Float32Array(surfP), normals: new Float32Array(surfN), colors: new Float32Array(surfC) },
    afterburner: { positions: new Float32Array(abP), normals: new Float32Array(abN), colors: new Float32Array(abC) },
    gear: { positions: new Float32Array(gearP), normals: new Float32Array(gearN), colors: new Float32Array(gearC) },
    cockpitSolid: { positions: new Float32Array(ckSolidP), normals: new Float32Array(ckSolidN), colors: new Float32Array(ckSolidC) },
    cockpitLit: { positions: new Float32Array(ckLitP), normals: new Float32Array(ckLitN), colors: new Float32Array(ckLitC) },
  };
}
