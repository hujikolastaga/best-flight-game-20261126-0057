// WebGL2 rendering pipeline: sky dome, terrain, ocean, carrier, runway,
// articulated aircraft, lit cockpit interior, sky-rings, clouds, and wingtip contrails.

import {
  buildAircraftPartMeshes,
  pushBox,
} from './aircraft-mesh.js';
import {
  basisFromQuat,
  clamp,
  mat4Compose,
  mat4Identity,
  mat4LookAt,
  mat4Mul,
  mat4Perspective,
  quatFromAxisAngle,
  quatFromHeadingPitchRoll,
  quatIdentity,
  quatMul,
  quatNorm,
  quatRotateVec,
  quatSlerp,
  vec3Add,
  vec3Cross,
  vec3Norm,
  vec3Scale,
} from './math3d.js';
import { SKY_FRAG_SRC, SKY_VERT_SRC } from './shaders-sky.js';
import { SOLID_FRAG_SRC, SOLID_VERT_SRC } from './shaders-aircraft.js';
import { OCEAN_FRAG_SRC, OCEAN_VERT_SRC, TERRAIN_FRAG_SRC, TERRAIN_VERT_SRC } from './shaders-world.js';
import {
  CARRIER_SPEC,
  STONE_ARCH_SPEC,
  buildTerrainGridData,
} from './terrain-gen.js';
import {
  buildCargoBeaconMesh,
  buildCarrierMeshes,
  buildCloudPuffMesh,
  buildOceanMesh,
  buildParachuteCrateMesh,
  buildRunwayMeshes,
  buildSkyRingMesh,
  buildStoneArchMesh,
  generateCloudPlacements,
} from './world-meshes.js';

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const msg = gl.getShaderInfoLog(shader) || 'Shader compile error';
    gl.deleteShader(shader);
    throw new Error(msg);
  }
  return shader;
}

function createProgram(gl, vertSrc, fragSrc) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  const prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error(gl.getProgramInfoLog(prog) || 'Program link error');
  }
  return prog;
}

function createVao(gl, mesh, hasNormals = true, hasColors = true, indexType = null) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const vboPos = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, vboPos);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  if (hasNormals && mesh.normals) {
    const vboNorm = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboNorm);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
  }

  if (hasColors && mesh.colors) {
    const vboCol = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vboCol);
    gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
  }

  let count = mesh.positions.length / 3;
  if (mesh.indices) {
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
    count = mesh.indices.length;
  }

  gl.bindVertexArray(null);
  return { vao, count, indexType };
}

function buildSkyCubeMesh() {
  const p = [], n = [], c = [];
  pushBox(p, n, c, 0, 0, 0, 2, 2, 2, [1, 1, 1]);
  return { positions: new Float32Array(p) };
}

export class WebGLRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      throw new Error('WebGL2 is required for Tailwind: Archipelago Flight');
    }
    this.gl = gl;
    this.info = {
      renderer: gl.getParameter(gl.RENDERER),
      version: gl.getParameter(gl.VERSION),
    };

    // Compile shader programs
    this.progSky = createProgram(gl, SKY_VERT_SRC, SKY_FRAG_SRC);
    this.progTerrain = createProgram(gl, TERRAIN_VERT_SRC, TERRAIN_FRAG_SRC);
    this.progOcean = createProgram(gl, OCEAN_VERT_SRC, OCEAN_FRAG_SRC);
    this.progSolid = createProgram(gl, SOLID_VERT_SRC, SOLID_FRAG_SRC);

    // Static world geometry VAOs
    this.vaoSky = createVao(gl, buildSkyCubeMesh(), false, false);
    const terrainData = buildTerrainGridData(208);
    this.vaoTerrain = createVao(gl, terrainData, true, false, gl.UNSIGNED_INT);
    this.vaoOcean = createVao(gl, buildOceanMesh(), false, false);

    const runway = buildRunwayMeshes();
    this.vaoRunwaySolid = createVao(gl, runway.solid);
    this.vaoRunwayLit = createVao(gl, runway.lights);

    const carrier = buildCarrierMeshes();
    this.vaoCarrierSolid = createVao(gl, carrier.solid);
    this.vaoCarrierLit = createVao(gl, carrier.lights);
    this.carrierModel = mat4Compose(
      CARRIER_SPEC.center,
      quatFromHeadingPitchRoll(CARRIER_SPEC.headingDeg, 0, 0),
    );

    this.vaoArch = createVao(gl, buildStoneArchMesh());
    this.archModel = mat4Compose(
      STONE_ARCH_SPEC.center,
      quatFromHeadingPitchRoll(STONE_ARCH_SPEC.headingDeg, 0, 0),
    );

    this.vaoRing = createVao(gl, buildSkyRingMesh());
    this.vaoCloud = createVao(gl, buildCloudPuffMesh());
    this.cloudPlacements = generateCloudPlacements();
    this.vaoBeacon = createVao(gl, buildCargoBeaconMesh());
    this.vaoCrate = createVao(gl, buildParachuteCrateMesh());

    // Aircraft part VAOs
    const parts = buildAircraftPartMeshes();
    this.vaoAirframe = createVao(gl, parts.airframe);
    this.vaoAirLights = createVao(gl, parts.lights);
    this.vaoCanopy = createVao(gl, parts.canopy);
    this.vaoSurface = createVao(gl, parts.surface);
    this.vaoAfterburner = createVao(gl, parts.afterburner);
    this.vaoGear = createVao(gl, parts.gear);
    this.vaoCockpitSolid = createVao(gl, parts.cockpitSolid);
    this.vaoCockpitLit = createVao(gl, parts.cockpitLit);

    // Contrail ribbon dynamic VBO
    this.contrailLeft = [];
    this.contrailRight = [];
    this.maxContrailPts = 42;
    this.vaoContrail = gl.createVertexArray();
    this.vboContrailPos = gl.createBuffer();
    this.vboContrailCol = gl.createBuffer();
    this.vboContrailNorm = gl.createBuffer();
    gl.bindVertexArray(this.vaoContrail);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboContrailPos);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboContrailNorm);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vboContrailCol);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // Smooth camera state
    this.camMode = 'chase'; // 'chase' | 'cockpit'
    this.camPos = [0, 330, 1225];
    this.camQuat = quatIdentity();
    this.trauma = 0;
    this.reducedShake = false;
    this.lastViewProj = mat4Identity();
    this.contrailTimer = 0;
  }

  resetCamera(plane, presetMode = null) {
    if (presetMode) this.camMode = presetMode;
    this.contrailLeft = [];
    this.contrailRight = [];
    const { forward, up, right } = basisFromQuat(plane.quat);
    this.camQuat = [...plane.quat];
    this.camPos = [
      plane.pos[0] - forward[0] * 21.5 + up[0] * 4.8,
      plane.pos[1] - forward[1] * 21.5 + up[1] * 4.8 + 1.4,
      plane.pos[2] - forward[2] * 21.5 + up[2] * 4.8,
    ];
    // Pre-seed graceful contrails when spawning in deterministic QA presets
    for (let i = 14; i >= 0; i--) {
      const dist = i * 3.8;
      const basePos = [
        plane.pos[0] - forward[0] * dist,
        plane.pos[1] - forward[1] * dist,
        plane.pos[2] - forward[2] * dist,
      ];
      this.contrailLeft.push({ pos: vec3Add(basePos, vec3Scale(right, -6.75)), right: [...right] });
      this.contrailRight.push({ pos: vec3Add(basePos, vec3Scale(right, 6.75)), right: [...right] });
    }
  }

  addTrauma(amount) {
    this.trauma = clamp(this.trauma + amount, 0, 1);
  }

  resize(width, height, dpr = 1) {
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, w, h);
  }

  updateContrails(dt, plane) {
    const { right, forward, up } = basisFromQuat(plane.quat);
    this.contrailTimer += dt;
    if (this.contrailTimer >= 0.035) {
      this.contrailTimer = 0;
      const tipBack = vec3Scale(forward, -1.9);
      const wingDrop = vec3Scale(up, -0.15);
      const pL = vec3Add(vec3Add(vec3Add(plane.pos, vec3Scale(right, -6.75)), tipBack), wingDrop);
      const pR = vec3Add(vec3Add(vec3Add(plane.pos, vec3Scale(right, 6.75)), tipBack), wingDrop);
      this.contrailLeft.push({ pos: pL, right: [...right] });
      this.contrailRight.push({ pos: pR, right: [...right] });
      while (this.contrailLeft.length > this.maxContrailPts) this.contrailLeft.shift();
      while (this.contrailRight.length > this.maxContrailPts) this.contrailRight.shift();
    }
  }

  render(dt, timeSec, plane, mission, activeDrops, activeRingIndex, freezeMode = false) {
    const gl = this.gl;
    const atmo = mission.atmosphere;
    const sunDir = vec3Norm(atmo.sunDir);
    const { right, up, forward } = basisFromQuat(plane.quat);

    if (!freezeMode) {
      this.updateContrails(dt, plane);
    }

    // Smooth camera follow (never fights pilot) + trauma shake
    this.trauma = Math.max(0, this.trauma - dt * 1.45);
    const shakeScale = this.reducedShake ? 0.15 : 1.0;
    const shakeAmp = this.trauma * this.trauma * shakeScale;
    const shakeX = Math.sin(timeSec * 37.0) * shakeAmp * 0.85;
    const shakeY = Math.cos(timeSec * 43.0) * shakeAmp * 0.65;

    let eye, target, camUp;
    if (this.camMode === 'cockpit') {
      eye = [
        plane.pos[0] + forward[0] * 2.55 + up[0] * 1.18 + right[0] * shakeX * 0.15,
        plane.pos[1] + forward[1] * 2.55 + up[1] * 1.18 + right[1] * shakeX * 0.15 + up[1] * shakeY * 0.15,
        plane.pos[2] + forward[2] * 2.55 + up[2] * 1.18 + right[2] * shakeX * 0.15,
      ];
      target = [
        eye[0] + forward[0] * 120,
        eye[1] + forward[1] * 120,
        eye[2] + forward[2] * 120,
      ];
      camUp = up;
    } else {
      const desiredEye = [
        plane.pos[0] - forward[0] * 21.5 + up[0] * 4.8,
        plane.pos[1] - forward[1] * 21.5 + up[1] * 4.8 + 1.45,
        plane.pos[2] - forward[2] * 21.5 + up[2] * 4.8,
      ];
      if (freezeMode) {
        this.camPos = desiredEye;
        this.camQuat = [...plane.quat];
      } else {
        const posBlend = 1 - Math.exp(-dt * 9.5);
        this.camPos[0] += (desiredEye[0] - this.camPos[0]) * posBlend;
        this.camPos[1] += (desiredEye[1] - this.camPos[1]) * posBlend;
        this.camPos[2] += (desiredEye[2] - this.camPos[2]) * posBlend;
        quatSlerp(this.camQuat, plane.quat, 1 - Math.exp(-dt * 7.0), this.camQuat);
      }
      eye = [
        this.camPos[0] + right[0] * shakeX,
        this.camPos[1] + shakeY,
        this.camPos[2] + right[2] * shakeX,
      ];
      target = [
        plane.pos[0] + forward[0] * 26 + up[0] * 1.5,
        plane.pos[1] + forward[1] * 26 + up[1] * 1.5,
        plane.pos[2] + forward[2] * 26 + up[2] * 1.5,
      ];
      const camBasis = basisFromQuat(this.camQuat);
      camUp = vec3Norm([
        camBasis.up[0] * 0.68,
        camBasis.up[1] * 0.68 + 0.32,
        camBasis.up[2] * 0.68,
      ]);
    }

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const speedBoostFov = clamp((plane.indicatedAirspeed - 90) / 140, 0, 1) * 0.14;
    const fov = (this.camMode === 'cockpit' ? 1.02 : 0.94) + speedBoostFov;
    const proj = mat4Perspective(fov, aspect, 0.25, 16500);
    const view = mat4LookAt(eye, target, camUp);
    const viewProj = mat4Mul(proj, view);
    this.lastViewProj = viewProj;

    // View matrix without translation for skybox
    const viewNoTrans = new Float32Array(view);
    viewNoTrans[12] = 0;
    viewNoTrans[13] = 0;
    viewNoTrans[14] = 0;
    const viewProjNoTrans = mat4Mul(proj, viewNoTrans);

    gl.clearColor(atmo.horizonColor[0], atmo.horizonColor[1], atmo.horizonColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // 1. Sky dome (drawn at far plane with depthMask false)
    gl.depthMask(false);
    gl.depthFunc(gl.LEQUAL);
    gl.useProgram(this.progSky);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progSky, 'uViewProjNoTrans'), false, viewProjNoTrans);
    gl.uniform3fv(gl.getUniformLocation(this.progSky, 'uSunDir'), sunDir);
    gl.uniform3fv(gl.getUniformLocation(this.progSky, 'uZenithColor'), atmo.zenithColor);
    gl.uniform3fv(gl.getUniformLocation(this.progSky, 'uHorizonColor'), atmo.horizonColor);
    gl.uniform3fv(gl.getUniformLocation(this.progSky, 'uSunGlowColor'), atmo.sunGlowColor);
    gl.uniform3fv(gl.getUniformLocation(this.progSky, 'uCloudTint'), atmo.cloudTint);
    gl.uniform1f(gl.getUniformLocation(this.progSky, 'uTime'), timeSec);
    gl.uniform1f(gl.getUniformLocation(this.progSky, 'uStormFactor'), atmo.stormFactor);
    gl.bindVertexArray(this.vaoSky.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.vaoSky.count);

    gl.depthMask(true);
    gl.depthFunc(gl.LESS);

    // 2. Animated Fresnel ocean
    gl.useProgram(this.progOcean);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progOcean, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.progOcean, 'uCamPos'), eye);
    gl.uniform3fv(gl.getUniformLocation(this.progOcean, 'uSunDir'), sunDir);
    gl.uniform3fv(gl.getUniformLocation(this.progOcean, 'uSunGlowColor'), atmo.sunGlowColor);
    gl.uniform3fv(gl.getUniformLocation(this.progOcean, 'uHorizonColor'), atmo.horizonColor);
    gl.uniform3fv(gl.getUniformLocation(this.progOcean, 'uZenithColor'), atmo.zenithColor);
    gl.uniform3fv(gl.getUniformLocation(this.progOcean, 'uWaterDeep'), atmo.waterDeep);
    gl.uniform3fv(gl.getUniformLocation(this.progOcean, 'uWaterShallow'), atmo.waterShallow);
    gl.uniform1f(gl.getUniformLocation(this.progOcean, 'uFogDensity'), atmo.fogDensity);
    gl.uniform1f(gl.getUniformLocation(this.progOcean, 'uTime'), timeSec);
    gl.bindVertexArray(this.vaoOcean.vao);
    gl.drawArrays(gl.TRIANGLES, 0, this.vaoOcean.count);

    // 3. Fractal Archipelago Terrain
    gl.useProgram(this.progTerrain);
    gl.uniformMatrix4fv(gl.getUniformLocation(this.progTerrain, 'uViewProj'), false, viewProj);
    gl.uniform3fv(gl.getUniformLocation(this.progTerrain, 'uCamPos'), eye);
    gl.uniform3fv(gl.getUniformLocation(this.progTerrain, 'uSunDir'), sunDir);
    gl.uniform3fv(gl.getUniformLocation(this.progTerrain, 'uSunGlowColor'), atmo.sunGlowColor);
    gl.uniform3fv(gl.getUniformLocation(this.progTerrain, 'uHorizonColor'), atmo.horizonColor);
    gl.uniform1f(gl.getUniformLocation(this.progTerrain, 'uFogDensity'), atmo.fogDensity);
    gl.uniform1f(gl.getUniformLocation(this.progTerrain, 'uStormFactor'), atmo.stormFactor);
    gl.bindVertexArray(this.vaoTerrain.vao);
    gl.drawElements(gl.TRIANGLES, this.vaoTerrain.count, gl.UNSIGNED_INT, 0);

    // 4. Solid World Landmarks & Aircraft Setup
    gl.useProgram(this.progSolid);
    const uModel = gl.getUniformLocation(this.progSolid, 'uModel');
    const uViewProj = gl.getUniformLocation(this.progSolid, 'uViewProj');
    const uCamPos = gl.getUniformLocation(this.progSolid, 'uCamPos');
    const uSunDir = gl.getUniformLocation(this.progSolid, 'uSunDir');
    const uSunGlow = gl.getUniformLocation(this.progSolid, 'uSunGlowColor');
    const uHorizon = gl.getUniformLocation(this.progSolid, 'uHorizonColor');
    const uFog = gl.getUniformLocation(this.progSolid, 'uFogDensity');
    const uEmissive = gl.getUniformLocation(this.progSolid, 'uEmissive');
    const uTint = gl.getUniformLocation(this.progSolid, 'uTint');
    const uAlpha = gl.getUniformLocation(this.progSolid, 'uAlpha');

    gl.uniformMatrix4fv(uViewProj, false, viewProj);
    gl.uniform3fv(uCamPos, eye);
    gl.uniform3fv(uSunDir, sunDir);
    gl.uniform3fv(uSunGlow, atmo.sunGlowColor);
    gl.uniform3fv(uHorizon, atmo.horizonColor);
    gl.uniform1f(uFog, atmo.fogDensity);

    const drawSolid = (vaoObj, modelMat, emissive = 0.0, tint = [1, 1, 1], alpha = 1.0) => {
      gl.uniformMatrix4fv(uModel, false, modelMat);
      gl.uniform1f(uEmissive, emissive);
      gl.uniform3fv(uTint, tint);
      gl.uniform1f(uAlpha, alpha);
      gl.bindVertexArray(vaoObj.vao);
      gl.drawArrays(gl.TRIANGLES, 0, vaoObj.count);
    };

    const identity = mat4Identity();
    drawSolid(this.vaoRunwaySolid, identity, 0.0);
    drawSolid(this.vaoRunwayLit, identity, 1.8);
    drawSolid(this.vaoCarrierSolid, this.carrierModel, 0.0);
    drawSolid(this.vaoCarrierLit, this.carrierModel, 2.2);
    drawSolid(this.vaoArch, this.archModel, 0.0);

    // 3D Cloud puffs
    for (const c of this.cloudPlacements) {
      const cMat = mat4Compose(c.pos, quatFromAxisAngle([0, 1, 0], c.yaw), c.scale);
      drawSolid(this.vaoCloud, cMat, 0.18, atmo.cloudTint, 1.0);
    }

    // Supply Drop Beacons & Active Parachute Crates
    for (const targetSite of mission.supplyTargets || []) {
      const bMat = mat4Compose(targetSite.pos, quatIdentity(), [1, 1, 1]);
      drawSolid(this.vaoBeacon, bMat, targetSite.delivered ? 0.3 : 1.7, targetSite.delivered ? [0.25, 0.9, 0.45] : [1, 1, 1]);
    }
    for (const drop of activeDrops || []) {
      const dMat = mat4Compose(drop.pos, quatIdentity(), [1, 1, 1]);
      drawSolid(this.vaoCrate, dMat, 0.25);
    }

    // Glowing Sky-Ring Gates (current target pulses cyan/amber, upcoming faint cyan)
    for (let i = 0; i < (mission.rings || []).length; i++) {
      const ring = mission.rings[i];
      if (i < activeRingIndex) continue;
      const isNext = i === activeRingIndex;
      const qRing = quatFromHeadingPitchRoll(ring.headingDeg, 0, 0);
      const scaleVal = ring.radius * (isNext ? 1.0 + Math.sin(timeSec * 5.0) * 0.04 : 0.96);
      const rMat = mat4Compose(ring.pos, qRing, [scaleVal, scaleVal, scaleVal]);
      const tint = isNext ? [1.0, 0.85, 0.28] : [0.32, 0.88, 1.0];
      drawSolid(this.vaoRing, rMat, isNext ? 2.1 : 1.15, tint, 1.0);
    }

    // 5. Aircraft Render (Chase view: exterior aircraft + gear + contrails; Cockpit view: 3D cockpit canopy & lit MFDs)
    if (this.camMode === 'chase') {
      const planeMat = mat4Compose(plane.pos, plane.quat);
      drawSolid(this.vaoAirframe, planeMat, 0.04);
      drawSolid(this.vaoAirLights, planeMat, 2.4);

      if (plane.gearDeploy > 0.06) {
        const gearMat = mat4Compose(plane.pos, plane.quat, [1, plane.gearDeploy, 1]);
        drawSolid(this.vaoGear, gearMat, 0.0);
      }

      // Articulated left/right ailerons & twin elevators
      const cs = plane.controlSurface;
      const drawControl = (offset, rotXRad, scale = [1, 1, 1]) => {
        const worldOffset = quatRotateVec(plane.quat, offset);
        const worldPos = vec3Add(plane.pos, worldOffset);
        const localQ = quatFromAxisAngle([1, 0, 0], rotXRad);
        const m = mat4Compose(worldPos, quatNorm(quatMul(plane.quat, localQ)), scale);
        drawSolid(this.vaoSurface, m, 0.05);
      };
      drawControl([-4.2, -0.05, 2.6], cs.aileron * 0.45, [1.2, 1, 1]);
      drawControl([4.2, -0.05, 2.6], -cs.aileron * 0.45, [1.2, 1, 1]);
      drawControl([-1.95, 0.0, 3.65], cs.elevator * 0.5, [0.85, 1, 0.9]);
      drawControl([1.95, 0.0, 3.65], cs.elevator * 0.5, [0.85, 1, 0.9]);

      // Transparent Canopy, Afterburner Plasma & Contrail Ribbons
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);

      drawSolid(this.vaoCanopy, planeMat, 0.35, [1, 1, 1], 0.56);

      if (plane.fuel > 0 && (plane.afterburner || plane.throttle > 0.45)) {
        const abLen = plane.afterburner ? 1.45 + Math.sin(timeSec * 36) * 0.18 : 0.4 + plane.throttle * 0.38;
        const abWorldOffset = quatRotateVec(plane.quat, [0, 0, 4.1]);
        const abMat = mat4Compose(vec3Add(plane.pos, abWorldOffset), plane.quat, [1, 1, abLen]);
        const abCol = plane.afterburner ? [1.0, 0.85, 0.48] : [0.42, 0.82, 1.0];
        drawSolid(this.vaoAfterburner, abMat, 2.8, abCol, plane.afterburner ? 0.85 : 0.48);
      }

      if (plane.indicatedAirspeed > 65) {
        this.drawContrails(gl, uModel, uEmissive, uTint, uAlpha, identity);
      }

      gl.depthMask(true);
      gl.disable(gl.BLEND);
    } else {
      // 3D Cockpit Interior anchored to eye/plane orientation
      const cockpitOrigin = [
        plane.pos[0] + forward[0] * 2.55 + up[0] * 1.18,
        plane.pos[1] + forward[1] * 2.55 + up[1] * 1.18,
        plane.pos[2] + forward[2] * 2.55 + up[2] * 1.18,
      ];
      const ckMat = mat4Compose(cockpitOrigin, plane.quat);
      drawSolid(this.vaoCockpitSolid, ckMat, 0.06);
      drawSolid(this.vaoCockpitLit, ckMat, 2.6);
    }
  }

  drawContrails(gl, uModel, uEmissive, uTint, uAlpha, identity) {
    const drawRibbon = (pts) => {
      if (pts.length < 2) return;
      const pos = [], norm = [], col = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i].pos, ar = pts[i].right;
        const b = pts[i + 1].pos, br = pts[i + 1].right;
        const wa = 0.22 * ((i + 1) / pts.length);
        const wb = 0.22 * ((i + 2) / pts.length);
        const fade = ((i + 1) / pts.length) * 0.72;
        const c = [0.9 * fade, 0.96 * fade, 1.0 * fade];
        pos.push(
          a[0] - ar[0] * wa, a[1] - ar[1] * wa, a[2] - ar[2] * wa,
          a[0] + ar[0] * wa, a[1] + ar[1] * wa, a[2] + ar[2] * wa,
          b[0] + br[0] * wb, b[1] + br[1] * wb, b[2] + br[2] * wb,
          a[0] - ar[0] * wa, a[1] - ar[1] * wa, a[2] - ar[2] * wa,
          b[0] + br[0] * wb, b[1] + br[1] * wb, b[2] + br[2] * wb,
          b[0] - br[0] * wb, b[1] - br[1] * wb, b[2] - br[2] * wb,
        );
        for (let k = 0; k < 6; k++) {
          norm.push(0, 1, 0);
          col.push(c[0], c[1], c[2]);
        }
      }
      gl.bindVertexArray(this.vaoContrail);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboContrailPos);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pos), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboContrailNorm);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(norm), gl.DYNAMIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vboContrailCol);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(col), gl.DYNAMIC_DRAW);

      gl.uniformMatrix4fv(uModel, false, identity);
      gl.uniform1f(uEmissive, 1.4);
      gl.uniform3fv(uTint, [1, 1, 1]);
      gl.uniform1f(uAlpha, 0.52);
      gl.drawArrays(gl.TRIANGLES, 0, pos.length / 3);
    };

    drawRibbon(this.contrailLeft);
    drawRibbon(this.contrailRight);
  }
}
