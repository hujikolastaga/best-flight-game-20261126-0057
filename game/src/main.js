// Bootstrapper for Tailwind: Archipelago Flight — connects DOM, starts the engine,
// handles ?preset=...&freeze=1 deterministic inspection states, and exposes window.__FLIGHT_QA__.

import { FlightGameEngine } from './game-engine.js';

function collectDom() {
  return {
    viewport: document.getElementById('viewport'),
    glCanvas: document.getElementById('flight-gl'),
    hudCanvas: document.getElementById('flight-hud'),
    topActions: document.getElementById('top-actions'),
    titleOverlay: document.getElementById('title-overlay'),
    pauseOverlay: document.getElementById('pause-overlay'),
    debriefOverlay: document.getElementById('debrief-overlay'),
    missionList: document.getElementById('title-mission-list'),
    btnLaunch: document.getElementById('btn-launch-sortie'),
    btnMissions: document.getElementById('btn-missions'),
    btnCamera: document.getElementById('btn-camera'),
    btnAudio: document.getElementById('btn-audio'),
    btnPause: document.getElementById('btn-pause'),
    btnResume: document.getElementById('btn-resume'),
    btnRestart: document.getElementById('btn-restart'),
    btnToMenu: document.getElementById('btn-to-menu'),
    btnRetrySortie: document.getElementById('btn-retry-sortie'),
    btnNextSortie: document.getElementById('btn-next-sortie'),
    btnDebriefMenu: document.getElementById('btn-debrief-menu'),
    pauseHeading: document.getElementById('pause-heading'),
    pauseSummary: document.getElementById('pause-summary'),
    debriefBadge: document.getElementById('debrief-badge'),
    debriefTitle: document.getElementById('debrief-title'),
    debriefReason: document.getElementById('debrief-reason'),
    debriefMetrics: document.getElementById('debrief-metrics'),
    chkMouseYoke: document.getElementById('chk-mouse-yoke'),
    chkInvertPitch: document.getElementById('chk-invert-pitch'),
    chkReducedShake: document.getElementById('chk-reduced-shake'),
  };
}

const engine = new FlightGameEngine(collectDom());
const params = new URLSearchParams(window.location.search);
const preset = params.get('preset');
const freeze = params.get('freeze') === '1';

if (preset) {
  engine.applyQaPreset(preset, freeze);
} else {
  // Pre-seed scenic backdrop behind the title overlay
  engine.applyQaPreset('cover', false);
  engine.setMode('title');
}

window.__FLIGHT_QA__ = {
  getState: () => engine.getQaState(),
  applyPreset: (name, shouldFreeze = true) => engine.applyQaPreset(name, shouldFreeze),
  startMission: (index) => engine.startMission(index),
  triggerTestDebrief: (success = true) => {
    engine.finishSortie(
      success,
      success ? 'CVN-07 HALCYON LANDING COMPLETE' : 'AIRCRAFT LOST',
      success
        ? '3-WIRE ARREST · 215 FPM · 1.2m OFF CENTER · FLAPS FULL'
        : 'TERRAIN IMPACT AT 248 KTS · -1150 FPM SINK · 19° NOSE DOWN',
    );
  },
};

engine.startLoop();
