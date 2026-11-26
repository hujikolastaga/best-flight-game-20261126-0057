// Sortie lifecycle, mission objectives, ring/supply scoring, landing/crash debriefs, and QA preset hooks.

import { AudioSynth } from './audio-synth.js';
import { FlightPhysics } from './flight-physics.js';
import { HudRenderer } from './hud-renderer.js';
import { InputController } from './input-controller.js';
import { clamp, eulerFromQuat } from './math3d.js';
import { MISSIONS, QA_PRESETS } from './missions-data.js';
import { CARRIER_SPEC, RUNWAY_SPEC, sampleTerrainHeight } from './terrain-gen.js';
import { WebGLRenderer } from './webgl-renderer.js';

export class FlightGameEngine {
  constructor(dom) {
    this.dom = dom;
    this.renderer = new WebGLRenderer(dom.glCanvas);
    this.hud = new HudRenderer(dom.hudCanvas);
    this.input = new InputController(dom.viewport);
    this.audio = new AudioSynth();
    this.physics = new FlightPhysics();

    this.mode = 'title'; // 'title' | 'playing' | 'paused' | 'debrief'
    this.selectedMissionIndex = 0;
    this.mission = MISSIONS[0];
    this.nextRingIndex = 0;
    this.activeDrops = [];
    this.score = 0;
    this.combo = 1;
    this.timeLeftSec = 180;
    this.elapsedSec = 0;
    this.bannerText = '';
    this.bannerTimer = 0;
    this.freezeMode = false;
    this.lastFrameTs = 0;
    this.accumulator = 0;

    this.bindUi();
    this.handleResize();
    window.addEventListener('resize', () => this.handleResize());
  }

  bindUi() {
    this.renderMissionCards();
    this.dom.btnLaunch.addEventListener('click', () => {
      this.audio.ensureStarted();
      this.startMission(this.selectedMissionIndex);
    });
    this.dom.btnMissions.addEventListener('click', () => this.openMissionMenu());
    this.dom.btnCamera.addEventListener('click', () => this.toggleCamera());
    this.dom.btnAudio.addEventListener('click', () => this.toggleAudio());
    this.dom.btnPause.addEventListener('click', () => this.togglePause());
    this.dom.btnResume.addEventListener('click', () => this.resumeFlight());
    this.dom.btnRestart.addEventListener('click', () => this.startMission(this.selectedMissionIndex));
    this.dom.btnToMenu.addEventListener('click', () => this.openMissionMenu());
    this.dom.btnRetrySortie.addEventListener('click', () => this.startMission(this.selectedMissionIndex));
    this.dom.btnNextSortie.addEventListener('click', () => {
      const nextIdx = (this.selectedMissionIndex + 1) % MISSIONS.length;
      this.startMission(nextIdx);
    });
    this.dom.btnDebriefMenu.addEventListener('click', () => this.openMissionMenu());

    this.dom.chkMouseYoke.addEventListener('change', (e) => {
      this.input.mouseYokeEnabled = e.target.checked;
    });
    this.dom.chkInvertPitch.addEventListener('change', (e) => {
      this.input.invertPitch = e.target.checked;
    });
    this.dom.chkReducedShake.addEventListener('change', (e) => {
      this.renderer.reducedShake = e.target.checked;
    });
  }

  renderMissionCards() {
    this.dom.missionList.innerHTML = '';
    MISSIONS.forEach((m, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `mission-card${idx === this.selectedMissionIndex ? ' selected' : ''}`;
      btn.dataset.missionId = m.id;
      btn.innerHTML = `<div class="mission-tag">${m.tag}</div><div class="mission-name">${m.name}</div><div class="mission-desc">${m.description}</div>`;
      btn.addEventListener('click', () => {
        this.selectedMissionIndex = idx;
        this.renderMissionCards();
      });
      this.dom.missionList.appendChild(btn);
    });
  }

  handleResize() {
    const w = window.innerWidth || 1280;
    const h = window.innerHeight || 720;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.renderer.resize(w, h, dpr);
    this.hud.resize(w, h, dpr);
  }

  cloneMission(src) {
    return {
      ...src,
      rings: src.rings.map((r) => ({ ...r, pos: [...r.pos] })),
      supplyTargets: src.supplyTargets.map((t) => ({ ...t, pos: [...t.pos], delivered: false })),
    };
  }

  startMission(index = 0) {
    this.selectedMissionIndex = index;
    this.renderMissionCards();
    this.mission = this.cloneMission(MISSIONS[index]);
    this.physics.resetFromSpawn(this.mission.spawn);
    this.renderer.resetCamera(this.physics, 'chase');
    this.nextRingIndex = 0;
    this.activeDrops = [];
    this.score = 0;
    this.combo = 1;
    this.timeLeftSec = this.mission.timeLimitSec || 0;
    this.elapsedSec = 0;
    this.showBanner(this.mission.goalText, 4.5);
    this.setMode('playing');
  }

  applyQaPreset(presetName, freeze = false) {
    const p = QA_PRESETS[presetName];
    if (!p) return false;
    const idx = MISSIONS.findIndex((m) => m.id === p.missionId);
    this.selectedMissionIndex = idx >= 0 ? idx : 0;
    this.mission = this.cloneMission(MISSIONS[this.selectedMissionIndex]);
    this.physics.resetFromSpawn(p);
    this.nextRingIndex = p.nextIdx ?? 0;
    this.score = p.score ?? 1000;
    this.combo = p.combo ?? 1;
    this.timeLeftSec = this.mission.timeLimitSec ? Math.max(45, this.mission.timeLimitSec - 32) : 0;
    this.activeDrops = [];
    if (p.spawnTestDrop && this.mission.supplyTargets[0]) {
      const tPos = this.mission.supplyTargets[0].pos;
      this.activeDrops.push({ pos: [tPos[0] - 42, tPos[1] + 95, tPos[2] + 35], vel: [5, -16, -4], landed: false });
    }
    this.freezeMode = Boolean(freeze);
    this.renderer.resetCamera(this.physics, p.cameraMode || 'chase');
    this.showBanner(p.bannerText || this.mission.goalText, 12);
    this.setMode('playing');
    this.drawOnce();
    return true;
  }

  setMode(mode) {
    this.mode = mode;
    this.dom.titleOverlay.classList.toggle('hidden', mode !== 'title');
    this.dom.pauseOverlay.classList.toggle('hidden', mode !== 'paused');
    this.dom.debriefOverlay.classList.toggle('hidden', mode !== 'debrief');
    this.dom.topActions.classList.toggle('hidden', mode === 'title');
  }

  openMissionMenu() {
    this.setMode('title');
  }

  resumeFlight() {
    if (this.mode === 'paused') this.setMode('playing');
  }

  togglePause() {
    if (this.mode === 'playing') {
      this.dom.pauseSummary.textContent = `${this.mission.name} · ${this.mission.goalText}`;
      this.setMode('paused');
    } else if (this.mode === 'paused') {
      this.setMode('playing');
    }
  }

  toggleCamera() {
    this.renderer.camMode = this.renderer.camMode === 'chase' ? 'cockpit' : 'chase';
    this.dom.btnCamera.textContent = `View: ${this.renderer.camMode === 'cockpit' ? 'Cockpit' : 'Chase'} [V]`;
  }

  toggleAudio() {
    this.audio.ensureStarted();
    const muted = this.audio.toggleMute();
    this.dom.btnAudio.textContent = muted ? 'Audio: Off [M]' : 'Audio: On [M]';
  }

  showBanner(text, sec = 3.0) {
    this.bannerText = text;
    this.bannerTimer = sec;
  }

  releaseSupplyCrate() {
    if (this.mission.supplyTargets.length === 0) return;
    this.audio.playCargoDrop();
    this.activeDrops.push({
      pos: [this.physics.pos[0], this.physics.pos[1] - 3.0, this.physics.pos[2]],
      vel: [this.physics.vel[0] * 0.45, -18, this.physics.vel[2] * 0.45],
      landed: false,
    });
    this.showBanner('CARGO CRATE RELEASED · TRACKING DROP ZONE', 2.4);
  }

  checkObjectives(dt) {
    // 1. Check active sky-ring gate
    const rings = this.mission.rings;
    if (this.nextRingIndex < rings.length) {
      const gate = rings[this.nextRingIndex];
      const dist = Math.hypot(
        this.physics.pos[0] - gate.pos[0],
        this.physics.pos[1] - gate.pos[1],
        this.physics.pos[2] - gate.pos[2],
      );
      if (dist <= gate.radius + 6) {
        this.nextRingIndex++;
        const pts = 450 * this.combo;
        this.score += pts;
        this.combo = Math.min(5, this.combo + 1);
        this.audio.playRingClear(this.combo);
        this.renderer.addTrauma(0.18);
        if (this.nextRingIndex >= rings.length) {
          if (this.mission.landingTarget) {
            this.showBanner(`ALL GATES CLEARED (+${pts}) · PROCEED TO ${this.mission.landingTarget.toUpperCase()} LANDING`, 4.5);
          } else {
            this.finishSortie(true, 'ALL CANYON GATES CLEARED!', `Completed ${rings.length}/${rings.length} gates cleanly with ${Math.round(this.physics.fuel)}% fuel remaining.`);
          }
        } else {
          this.showBanner(`${gate.label} CLEARED · +${pts} PTS`, 2.6);
        }
      }
    }

    // 2. Step & evaluate parachute supply drops
    for (const drop of this.activeDrops) {
      if (drop.landed) continue;
      drop.vel[0] += (this.mission.wind[0] * 0.35 - drop.vel[0]) * dt * 1.2;
      drop.vel[2] += (this.mission.wind[2] * 0.35 - drop.vel[2]) * dt * 1.2;
      drop.vel[1] += (-16 - drop.vel[1]) * dt * 2.0;
      drop.pos[0] += drop.vel[0] * dt;
      drop.pos[1] += drop.vel[1] * dt;
      drop.pos[2] += drop.vel[2] * dt;

      const groundY = Math.max(0, sampleTerrainHeight(drop.pos[0], drop.pos[2]));
      if (drop.pos[1] <= groundY + 2.5) {
        drop.pos[1] = groundY + 2.5;
        drop.landed = true;
        for (const site of this.mission.supplyTargets) {
          if (site.delivered) continue;
          const d = Math.hypot(drop.pos[0] - site.pos[0], drop.pos[2] - site.pos[2]);
          if (d <= site.radius) {
            site.delivered = true;
            const bonus = Math.round((site.radius - d) * 12) + 800;
            this.score += bonus;
            this.audio.playRingClear(4);
            this.showBanner(`${site.label} SUPPLIED (${Math.round(d)}m) · +${bonus} PTS`, 3.2);
            break;
          }
        }
        if (this.mission.supplyTargets.length > 0 && this.mission.supplyTargets.every((s) => s.delivered)) {
          this.finishSortie(true, 'ALL SUPPLY DROPS DELIVERED!', `Supplied all ${this.mission.supplyTargets.length} storm ridge beacons under ${Math.round(this.elapsedSec)}s.`);
        }
      }
    }
  }

  finishSortie(success, title, reason) {
    if (this.mode === 'debrief') return;
    if (success) this.audio.playLanding();
    else this.audio.playCrash();

    const { headingDeg } = eulerFromQuat(this.physics.quat);
    const speedKts = Math.round(this.physics.indicatedAirspeed * 1.94384);
    const altFt = Math.max(0, Math.round(this.physics.pos[1] * 3.28084));

    this.dom.debriefBadge.textContent = success ? 'SORTIE COMPLETE' : 'INCIDENT DEBRIEF';
    this.dom.debriefBadge.classList.toggle('crash', !success);
    this.dom.debriefTitle.textContent = title;
    this.dom.debriefReason.textContent = reason;

    const stats = [
      { label: 'Sortie Score', value: `${this.score} PTS` },
      { label: 'Airframe Hull', value: `${Math.round(this.physics.hull)}%` },
      { label: 'Fuel Remaining', value: `${Math.round(this.physics.fuel)}%` },
      { label: 'Flight Telemetry', value: `${speedKts} KTS · ${altFt} FT · HDG ${String(Math.round(headingDeg)).padStart(3, '0')}°` },
    ];
    if (this.physics.landingGrade) {
      stats.push({ label: 'Landing Grade', value: this.physics.landingGrade.summary });
    }
    this.dom.debriefMetrics.innerHTML = stats
      .map((s) => `<div class="debrief-stat"><div class="debrief-stat-label">${s.label}</div><div class="debrief-stat-value">${s.value}</div></div>`)
      .join('');
    this.setMode('debrief');
  }

  resolveTargetInfo() {
    if (this.nextRingIndex < this.mission.rings.length) {
      const r = this.mission.rings[this.nextRingIndex];
      return { pos: r.pos, label: r.label };
    }
    const nextDrop = this.mission.supplyTargets.find((t) => !t.delivered);
    if (nextDrop) return { pos: nextDrop.pos, label: nextDrop.label };
    if (this.mission.landingTarget === 'carrier') {
      return { pos: [CARRIER_SPEC.center[0], CARRIER_SPEC.deckHeight + 8, CARRIER_SPEC.center[2]], label: 'CVN-07 DECK' };
    }
    if (this.mission.landingTarget === 'runway') {
      return { pos: [RUNWAY_SPEC.center[0], RUNWAY_SPEC.elevation + 8, RUNWAY_SPEC.center[2]], label: 'RUNWAY 36' };
    }
    return { pos: null, label: '' };
  }

  handleHotkeys() {
    if (this.input.consumeAction('KeyV')) this.toggleCamera();
    if (this.input.consumeAction('KeyM')) this.toggleAudio();
    if (this.input.consumeAction('KeyP') || this.input.consumeAction('Escape')) this.togglePause();
    if (this.input.consumeAction('Tab')) this.openMissionMenu();
    if (this.mode !== 'playing') return;

    if (this.input.consumeAction('KeyG')) {
      this.physics.gearDown = !this.physics.gearDown;
      this.audio.playGearToggle();
      this.showBanner(this.physics.gearDown ? 'LANDING GEAR DOWN' : 'LANDING GEAR RETRACTED', 2.0);
    }
    if (this.input.consumeAction('KeyB')) {
      this.physics.flaps = this.physics.flaps ? 0 : 1;
      this.audio.playGearToggle();
      this.showBanner(this.physics.flaps ? 'FLAPS FULL (HIGH LIFT)' : 'FLAPS RETRACTED', 2.0);
    }
    if (this.input.consumeAction('KeyC')) {
      this.releaseSupplyCrate();
    }
    if (this.input.consumeAction('KeyI')) {
      this.input.invertPitch = !this.input.invertPitch;
      this.dom.chkInvertPitch.checked = this.input.invertPitch;
      this.showBanner(`PITCH INVERT: ${this.input.invertPitch ? 'ON' : 'OFF'}`, 2.0);
    }
  }

  stepSimulation(dt) {
    this.elapsedSec += dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer === 0) this.bannerText = '';
    }

    if (this.mission.timeLimitSec > 0) {
      this.timeLeftSec = Math.max(0, this.timeLeftSec - dt);
      if (this.timeLeftSec === 0) {
        this.finishSortie(false, 'SORTIE TIMER EXPIRED', 'Mission clock reached zero before final completion.');
        return;
      }
    }

    const input = this.input.sampleFlightInput();
    this.physics.step(dt, input, this.mission.wind, {
      onManeuver: (name, pts) => {
        this.score += pts;
        this.audio.playRingClear(this.combo);
        this.showBanner(`${name} · +${pts} PTS`, 2.4);
      },
      onDamage: (msg, trauma) => {
        this.renderer.addTrauma(trauma);
        this.showBanner(msg, 3.0);
      },
      onBanner: (msg) => this.showBanner(msg, 2.5),
      onLanding: (grade) => {
        this.score += 1200 + Math.round(this.physics.hull * 5);
        this.finishSortie(true, `${grade.surface} LANDING COMPLETE`, grade.summary);
      },
      onCrash: (reason) => {
        this.renderer.addTrauma(0.95);
        this.finishSortie(false, 'AIRCRAFT LOST', reason);
      },
    });

    this.checkObjectives(dt);
  }

  drawOnce(dt = 0.016) {
    const { pos: targetWorldPos, label: targetLabel } = this.resolveTargetInfo();
    this.renderer.render(
      dt,
      this.elapsedSec,
      this.physics,
      this.mission,
      this.activeDrops,
      this.nextRingIndex,
      this.freezeMode,
    );

    const dropsDone = this.mission.supplyTargets.filter((t) => t.delivered).length;
    this.hud.draw({
      active: this.mode === 'playing',
      plane: this.physics,
      mission: this.mission,
      targetWorldPos,
      targetLabel,
      viewProj: this.renderer.lastViewProj,
      bannerText: this.bannerText,
      camMode: this.renderer.camMode,
      score: this.score,
      combo: this.combo,
      timeLeftSec: this.timeLeftSec,
      ringsCleared: this.nextRingIndex,
      ringsTotal: this.mission.rings.length,
      dropsDone,
      dropsTotal: this.mission.supplyTargets.length,
    });
  }

  getQaState() {
    const { headingDeg, pitchRad, rollRad } = eulerFromQuat(this.physics.quat);
    return {
      mode: this.mode,
      missionId: this.mission.id,
      camMode: this.renderer.camMode,
      webglRenderer: this.renderer.info.renderer,
      pos: this.physics.pos.map((v) => Number(v.toFixed(2))),
      speedKts: Math.round(this.physics.indicatedAirspeed * 1.94384),
      altFt: Math.round(this.physics.pos[1] * 3.28084),
      headingDeg: Math.round(headingDeg),
      pitchDeg: Number(((pitchRad * 180) / Math.PI).toFixed(1)),
      rollDeg: Number(((rollRad * 180) / Math.PI).toFixed(1)),
      throttle: Number(this.physics.throttle.toFixed(2)),
      afterburner: this.physics.afterburner,
      gearDown: this.physics.gearDown,
      flaps: this.physics.flaps,
      fuel: Number(this.physics.fuel.toFixed(1)),
      hull: Number(this.physics.hull.toFixed(1)),
      score: this.score,
    };
  }

  startLoop() {
    const tick = (ts) => {
      const frameDt = this.lastFrameTs ? clamp((ts - this.lastFrameTs) / 1000, 0, 0.05) : 0.016;
      this.lastFrameTs = ts;

      this.handleHotkeys();

      if (this.mode === 'playing' && !this.freezeMode) {
        this.accumulator += frameDt;
        const fixedDt = 1 / 60;
        while (this.accumulator >= fixedDt) {
          this.stepSimulation(fixedDt);
          this.accumulator -= fixedDt;
        }
      } else if (this.mode === 'title' && !this.freezeMode) {
        // Gentle scenic background orbit on title screen
        this.elapsedSec += frameDt * 0.4;
      }

      this.audio.updateFlightAudio(frameDt, this.mode === 'playing' && !this.freezeMode, this.physics);
      this.drawOnce(frameDt);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}
