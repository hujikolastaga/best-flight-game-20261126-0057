// 6-DOF aerodynamic flight physics, fuel burn, stall/buffet, hull damage, and landing grading.

import {
  basisFromQuat,
  clamp,
  eulerFromQuat,
  quatFromAxisAngle,
  quatFromHeadingPitchRoll,
  quatMul,
  quatNorm,
  vec3Dot,
  vec3Len,
  vec3Scale,
} from './math3d.js';
import {
  CARRIER_SPEC,
  RUNWAY_SPEC,
  WORLD_HALF_EXTENT,
  canyonCenterX,
  sampleLandingSurface,
  sampleTerrainHeight,
} from './terrain-gen.js';

const GRAVITY = 9.81;
const AIR_DENSITY_SEA = 1.225;
const MAX_THRUST_ACCEL = 34.0;
const AB_THRUST_ACCEL = 52.0;

export class FlightPhysics {
  constructor() {
    this.resetFromSpawn({
      pos: [0, 320, 1200],
      headingDeg: 0,
      pitchDeg: 0,
      rollDeg: 0,
      speed: 105,
      throttle: 0.7,
      gearDown: false,
      flaps: 0,
      fuel: 100,
    });
  }

  resetFromSpawn(spawn) {
    this.pos = [...spawn.pos];
    this.quat = quatFromHeadingPitchRoll(
      spawn.headingDeg ?? 0,
      ((spawn.pitchDeg ?? 0) * Math.PI) / 180,
      ((spawn.rollDeg ?? 0) * Math.PI) / 180,
    );
    const { forward } = basisFromQuat(this.quat);
    const spd = spawn.speed ?? 100;
    this.vel = vec3Scale(forward, spd);
    this.throttle = spawn.throttle ?? 0.7;
    this.afterburner = Boolean(spawn.afterburner);
    this.afterburnerHeat = 0;
    this.gearDown = Boolean(spawn.gearDown);
    this.gearDeploy = this.gearDown ? 1 : 0;
    this.flaps = spawn.flaps ?? 0;
    this.fuel = spawn.fuel ?? 100;
    this.hull = spawn.hull ?? 100;
    this.angVel = [0, 0, 0]; // local pitch, yaw, roll rates (rad/s)
    this.controlSurface = { aileron: 0, elevator: 0, rudder: 0 };
    this.aoaRad = 0.03;
    this.gLoad = 1.0;
    this.verticalSpeed = 0; // m/s
    this.indicatedAirspeed = spd;
    this.stalling = false;
    this.grounded = false;
    this.arrested = false;
    this.crashed = false;
    this.crashReason = '';
    this.landingGrade = null;
    this.rollAccumRad = 0;
    this.loopAccumRad = 0;
    this.lastTerrainClearance = 250;
    this.overGCooldown = 0;
  }

  step(dt, input, windVec, events) {
    if (this.crashed || this.arrested) return;

    // 1. Throttle, Fuel Burn & Afterburner Heat
    if (input.throttleDelta !== 0) {
      this.throttle = clamp(this.throttle + input.throttleDelta * 0.42 * dt, 0, 1);
    }
    const fuelAvailable = this.fuel > 0.01;
    this.afterburner = Boolean(input.afterburner && fuelAvailable && this.throttle > 0.75 && this.afterburnerHeat < 0.98);
    if (this.afterburner) {
      this.afterburnerHeat = clamp(this.afterburnerHeat + 0.18 * dt, 0, 1);
    } else {
      this.afterburnerHeat = clamp(this.afterburnerHeat - 0.14 * dt, 0, 1);
    }

    const burnRate = fuelAvailable
      ? (0.14 + this.throttle * 0.46) * (this.afterburner ? 2.6 : 1.0)
      : 0;
    this.fuel = Math.max(0, this.fuel - burnRate * dt);

    // Animate gear deployment
    const gearTarget = this.gearDown ? 1 : 0;
    this.gearDeploy += (gearTarget - this.gearDeploy) * Math.min(1, dt * 4.5);

    const basis = basisFromQuat(this.quat);
    const { right, up, forward } = basis;

    // 2. Relative Airspeed & Angle of Attack
    const relVel = [
      this.vel[0] - windVec[0],
      this.vel[1] - windVec[1],
      this.vel[2] - windVec[2],
    ];
    const airspeed = Math.max(1, vec3Len(relVel));
    this.indicatedAirspeed = airspeed;

    const vForward = vec3Dot(relVel, forward);
    const vUp = vec3Dot(relVel, up);
    const vRight = vec3Dot(relVel, right);
    const aoa = Math.atan2(-vUp, Math.max(8, vForward));
    this.aoaRad = aoa;

    // 3. Control Authority Scales With Dynamic Pressure
    const controlAuth = clamp((airspeed - 24) / 58, 0.2, 1.15);
    const stallAngle = this.flaps ? 0.37 : 0.30; // ~21 deg with flaps, ~17 deg clean
    this.stalling = !this.grounded && (Math.abs(aoa) > stallAngle || (airspeed < (this.flaps ? 43 : 51) && this.pos[1] > 40));

    // Smooth control surface deflection for visual animation
    this.controlSurface.elevator += (input.pitch - this.controlSurface.elevator) * Math.min(1, dt * 12);
    this.controlSurface.aileron += (input.roll - this.controlSurface.aileron) * Math.min(1, dt * 14);
    this.controlSurface.rudder += (input.yaw - this.controlSurface.rudder) * Math.min(1, dt * 12);

    const pitchRateTarget = input.pitch * 1.48 * controlAuth + (this.stalling ? -0.45 : 0);
    const rollRateTarget = input.roll * 2.55 * controlAuth;
    // Slight natural bank-to-turn coordination helps feel smooth without fighting pilot
    const { rollRad } = eulerFromQuat(this.quat);
    const autoTurn = Math.sin(rollRad) * 0.24;
    const yawRateTarget = input.yaw * 0.92 * controlAuth - autoTurn;

    this.angVel[0] += (pitchRateTarget - this.angVel[0]) * Math.min(1, dt * 7.5);
    this.angVel[1] += (yawRateTarget - this.angVel[1]) * Math.min(1, dt * 6.5);
    this.angVel[2] += (rollRateTarget - this.angVel[2]) * Math.min(1, dt * 8.5);

    // Track aerobatics (360 barrel roll or loop)
    this.rollAccumRad = Math.abs(this.angVel[2]) > 0.7 ? this.rollAccumRad + this.angVel[2] * dt : this.rollAccumRad * Math.max(0, 1 - dt * 1.8);
    this.loopAccumRad = Math.abs(this.angVel[0]) > 0.55 ? this.loopAccumRad + this.angVel[0] * dt : this.loopAccumRad * Math.max(0, 1 - dt * 1.8);
    if (Math.abs(this.rollAccumRad) >= Math.PI * 1.92) {
      this.rollAccumRad = 0;
      events?.onManeuver?.('BARREL ROLL', 350);
    }
    if (Math.abs(this.loopAccumRad) >= Math.PI * 1.92) {
      this.loopAccumRad = 0;
      events?.onManeuver?.('INSIDE LOOP', 450);
    }

    // Apply local rotation increments cleanly via quaternions
    const dqPitch = quatFromAxisAngle([1, 0, 0], this.angVel[0] * dt);
    const dqYaw = quatFromAxisAngle([0, 1, 0], this.angVel[1] * dt);
    const dqRoll = quatFromAxisAngle([0, 0, 1], -this.angVel[2] * dt);
    this.quat = quatNorm(quatMul(this.quat, quatMul(quatMul(dqYaw, dqPitch), dqRoll)));

    // 4. Aerodynamic Forces: Thrust, Lift, Induced & Parasitic Drag, Sideslip Alignment
    const altFactor = Math.exp(-Math.max(0, this.pos[1]) / 9000);
    const rho = AIR_DENSITY_SEA * altFactor;
    const qDyn = 0.5 * rho * airspeed * airspeed;

    let cl = 0.24 + clamp(aoa, -0.35, 0.35) * 4.4 + (this.flaps ? 0.38 : 0);
    if (this.stalling) {
      cl *= 0.44;
    }

    const wingAreaFactor = 0.0155;
    let liftAccel = qDyn * wingAreaFactor * cl;
    // Ground effect cushion near runway/water
    const terrainY = sampleTerrainHeight(this.pos[0], this.pos[2]);
    const deck = sampleLandingSurface(this.pos[0], this.pos[2]);
    const surfaceY = Math.max(0, terrainY, deck ? deck.elevation : -99);
    const agl = this.pos[1] - surfaceY;
    if (agl > 0 && agl < 22) {
      liftAccel *= 1.0 + (1.0 - agl / 22) * 0.28;
    }

    const cdBase = 0.0135 + this.gearDeploy * 0.018 + (this.flaps ? 0.021 : 0);
    const cdInduced = 0.052 * cl * cl;
    const dragAccel = qDyn * wingAreaFactor * (cdBase + cdInduced);

    const thrustAccel = fuelAvailable
      ? (this.afterburner ? AB_THRUST_ACCEL : this.throttle * MAX_THRUST_ACCEL)
      : 0;

    // Lateral weathervane restoring force eliminates ice-skating sideslip
    const sideSlipAccel = -vRight * 1.85;

    // Ridge thermal updrafts inside the eastern canyon and near steep mountain slopes
    let thermalUp = 0;
    const canyonDist = Math.abs(this.pos[0] - canyonCenterX(this.pos[2]));
    if (canyonDist < 260 && this.pos[1] < 420) {
      thermalUp = (1.0 - canyonDist / 260) * 3.8;
    }

    // Smooth turbulence in storm winds
    const windSpeed = Math.hypot(windVec[0], windVec[2]);
    const gustWave = windSpeed > 8 ? Math.sin(this.pos[0] * 0.017 + this.pos[2] * 0.013) * 1.4 : 0;

    // Lift direction sits orthogonal to velocity along aircraft up axis
    const accelX =
      forward[0] * thrustAccel +
      up[0] * (liftAccel + gustWave) +
      right[0] * sideSlipAccel -
      (relVel[0] / airspeed) * dragAccel;
    const accelY =
      forward[1] * thrustAccel +
      up[1] * (liftAccel + gustWave) +
      right[1] * sideSlipAccel -
      (relVel[1] / airspeed) * dragAccel -
      GRAVITY +
      thermalUp;
    const accelZ =
      forward[2] * thrustAccel +
      up[2] * (liftAccel + gustWave) +
      right[2] * sideSlipAccel -
      (relVel[2] / airspeed) * dragAccel;

    this.gLoad = clamp((liftAccel + up[1] * 0.5) / GRAVITY, -3.5, 9.5);
    this.overGCooldown = Math.max(0, this.overGCooldown - dt);
    if (this.gLoad > 8.2 && this.overGCooldown <= 0) {
      this.hull = Math.max(0, this.hull - 6);
      this.overGCooldown = 1.4;
      events?.onDamage?.('OVER-G AIRFRAME STRESS (-6% HULL)', 0.35);
    }

    this.vel[0] += accelX * dt;
    this.vel[1] += accelY * dt;
    this.vel[2] += accelZ * dt;

    // Cap realistic max speed
    const maxSpd = this.afterburner ? 228 : 176;
    const curSpd = vec3Len(this.vel);
    if (curSpd > maxSpd) {
      const k = maxSpd / curSpd;
      this.vel[0] *= k;
      this.vel[1] *= k;
      this.vel[2] *= k;
    }

    this.pos[0] += this.vel[0] * dt;
    this.pos[1] += this.vel[1] * dt;
    this.pos[2] += this.vel[2] * dt;
    this.verticalSpeed = this.vel[1];

    // Keep inside soft world airspace boundary (gently turn pilot back if near edge)
    const boundary = WORLD_HALF_EXTENT - 450;
    if (Math.abs(this.pos[0]) > boundary || Math.abs(this.pos[2]) > boundary) {
      this.pos[0] = clamp(this.pos[0], -boundary, boundary);
      this.pos[2] = clamp(this.pos[2], -boundary, boundary);
      this.vel[0] *= -0.7;
      this.vel[2] *= -0.7;
      events?.onBanner?.('AIRSPACE BOUNDARY — TURNING INBOUND');
    }

    // 5. Terrain, Ocean & Runway / Carrier Deck Contact Check
    const newTerrainY = sampleTerrainHeight(this.pos[0], this.pos[2]);
    const newDeck = sampleLandingSurface(this.pos[0], this.pos[2]);
    const floorY = Math.max(0, newTerrainY, newDeck ? newDeck.elevation : -99);
    const clearance = this.pos[1] - floorY;
    this.lastTerrainClearance = clearance;

    const gearHeight = this.gearDown ? 3.2 : 1.8;
    if (clearance <= gearHeight) {
      this.handleGroundContact(newDeck, newTerrainY, floorY, events);
    } else {
      this.grounded = false;
    }
  }

  handleGroundContact(deck, terrainY, floorY, events) {
    const sinkFpm = Math.round(-this.vel[1] * 196.85);
    const speedKts = Math.round(this.indicatedAirspeed * 1.94384);
    const { pitchRad, rollRad } = eulerFromQuat(this.quat);
    const pitchDeg = (pitchRad * 180) / Math.PI;
    const rollDeg = Math.abs((rollRad * 180) / Math.PI);

    // Water ditching
    if (!deck && terrainY < 0) {
      this.crashed = true;
      this.hull = 0;
      this.crashReason = `OCEAN IMPACT AT ${speedKts} KTS · SINK RATE ${sinkFpm} FPM · ${Math.round(rollDeg)}° BANK`;
      events?.onCrash?.(this.crashReason);
      return;
    }

    // Structured landing check on Runway or Aircraft Carrier Deck
    if (deck) {
      if (!this.gearDown) {
        this.crashed = true;
        this.hull = 0;
        this.crashReason = `GEAR-UP BELLY IMPACT ON ${deck.kind.toUpperCase()} AT ${speedKts} KTS · PRESS [G] BEFORE FINAL`;
        events?.onCrash?.(this.crashReason);
        return;
      }

      if (rollDeg > 18 || pitchDeg < -12 || sinkFpm > 820) {
        this.crashed = true;
        this.hull = 0;
        this.crashReason = `HARD ${deck.kind.toUpperCase()} COLLAPSE · ${sinkFpm} FPM SINK / ${Math.round(rollDeg)}° BANK (LIMIT 820 FPM, 18°)`;
        events?.onCrash?.(this.crashReason);
        return;
      }

      // Good or firm landing!
      this.pos[1] = deck.elevation + 3.25;
      this.vel[1] = 0;
      this.grounded = true;

      if (sinkFpm > 520) {
        const dmg = Math.round((sinkFpm - 480) * 0.08);
        this.hull = Math.max(12, this.hull - dmg);
        events?.onDamage?.(`FIRM TOUCHDOWN (${sinkFpm} FPM) · -${dmg}% HULL`, 0.45);
      }

      // Refuel & repair during runway/carrier roll
      this.fuel = Math.min(100, this.fuel + 18);

      if (deck.kind === 'carrier') {
        const wireIdx = clamp(Math.ceil((deck.alongFromStern - 32) / 28), 1, 4);
        const offsetM = Math.abs(deck.centerlineOffset).toFixed(1);
        this.arrested = true;
        this.vel = [0, 0, 0];
        this.landingGrade = {
          surface: 'CVN-07 HALCYON',
          wire: wireIdx,
          sinkFpm,
          speedKts,
          centerlineOffsetM: Number(offsetM),
          flapsFull: Boolean(this.flaps),
          summary: `${wireIdx}-WIRE ARREST · ${sinkFpm} FPM · ${offsetM}m OFF CENTER · ${this.flaps ? 'FLAPS FULL' : 'NO FLAPS'}`,
        };
        events?.onLanding?.(this.landingGrade);
      } else {
        // Runway rollout deceleration & optional completion
        this.vel[0] *= 0.96;
        this.vel[2] *= 0.96;
        const offsetM = Math.abs(deck.centerlineOffset).toFixed(1);
        if (vec3Len(this.vel) < 42 || !this.landingGrade) {
          this.landingGrade = {
            surface: 'RUNWAY 36',
            wire: null,
            sinkFpm,
            speedKts,
            centerlineOffsetM: Number(offsetM),
            flapsFull: Boolean(this.flaps),
            summary: `RUNWAY TOUCHDOWN · ${sinkFpm} FPM · ${offsetM}m OFF CENTER · REFUELED`,
          };
          if (vec3Len(this.vel) < 28) {
            this.arrested = true;
            events?.onLanding?.(this.landingGrade);
          }
        }
      }
      return;
    }

    // Off-runway mountain/terrain collision
    if (sinkFpm < 360 && rollDeg < 14 && this.indicatedAirspeed < 75 && this.hull > 26) {
      // Glancing terrain scrape
      this.pos[1] = floorY + gearHeight + 2.5;
      this.vel[1] = Math.max(8, Math.abs(this.vel[1]) * 0.4);
      this.hull = Math.max(0, this.hull - 24);
      events?.onDamage?.('TERRAIN SCRAPE (-24% HULL) · PULL UP', 0.75);
      if (this.hull <= 0) {
        this.crashed = true;
        this.crashReason = `AIRFRAME FAILURE AFTER TERRAIN IMPACT AT ${speedKts} KTS`;
        events?.onCrash?.(this.crashReason);
      }
    } else {
      this.crashed = true;
      this.hull = 0;
      this.crashReason = `TERRAIN IMPACT AT ${speedKts} KTS · ${sinkFpm} FPM SINK · ${Math.round(pitchDeg)}° PITCH`;
      events?.onCrash?.(this.crashReason);
    }
  }
}
