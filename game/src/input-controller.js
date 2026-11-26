// Unified keyboard & optional mouse-yoke flight controls with edge-triggered cockpit/system keys.

import { clamp } from './math3d.js';

export class InputController {
  constructor(targetElement) {
    this.keys = new Set();
    this.mouseYokeEnabled = false;
    this.invertPitch = false;
    this.mousePitch = 0;
    this.mouseRoll = 0;
    this.actions = {};

    window.addEventListener('keydown', (ev) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(ev.code)) {
        ev.preventDefault();
      }
      const isNew = !this.keys.has(ev.code);
      this.keys.add(ev.code);
      if (isNew) {
        this.actions[ev.code] = true;
      }
    });

    window.addEventListener('keyup', (ev) => {
      this.keys.delete(ev.code);
    });

    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mousePitch = 0;
      this.mouseRoll = 0;
    });

    if (targetElement) {
      targetElement.addEventListener('mousemove', (ev) => {
        if (!this.mouseYokeEnabled) {
          this.mousePitch = 0;
          this.mouseRoll = 0;
          return;
        }
        const rect = targetElement.getBoundingClientRect();
        const nx = ((ev.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        const ny = ((ev.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1;
        this.mouseRoll = Math.abs(nx) < 0.08 ? 0 : clamp(nx * 1.15, -1, 1);
        this.mousePitch = Math.abs(ny) < 0.08 ? 0 : clamp(-ny * 1.15, -1, 1);
      });
    }
  }

  consumeAction(code) {
    if (this.actions[code]) {
      this.actions[code] = false;
      return true;
    }
    return false;
  }

  sampleFlightInput() {
    let pitch = 0;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) pitch += 1; // Pull back -> pitch up
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) pitch -= 1; // Push forward -> nose down
    if (this.mouseYokeEnabled && pitch === 0) pitch = this.mousePitch;
    if (this.invertPitch) pitch = -pitch;

    let roll = 0;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) roll += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) roll -= 1;
    if (this.mouseYokeEnabled && roll === 0) roll = this.mouseRoll;

    let yaw = 0;
    if (this.keys.has('KeyQ')) yaw += 1;
    if (this.keys.has('KeyE')) yaw -= 1;

    let throttleDelta = 0;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('KeyR')) throttleDelta += 1;
    if (this.keys.has('ControlLeft') || this.keys.has('ControlRight') || this.keys.has('KeyF')) throttleDelta -= 1;

    return {
      pitch: clamp(pitch, -1, 1),
      roll: clamp(roll, -1, 1),
      yaw: clamp(yaw, -1, 1),
      throttleDelta,
      afterburner: this.keys.has('Space'),
    };
  }
}
