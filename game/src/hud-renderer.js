// Crisp 2D Canvas aviation glass HUD overlay: artificial horizon pitch ladder,
// SPD/ALT/HDG tapes, 3D target diamond, ILS glideslope, tactical radar, and fuel/hull gauges.

import { clamp, eulerFromQuat, projectPoint } from './math3d.js';
import { CARRIER_SPEC, RUNWAY_SPEC } from './terrain-gen.js';

export class HudRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
  }

  resize(width, height, dpr = 1) {
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = width;
    this.height = height;
  }

  draw(state) {
    const ctx = this.ctx;
    const W = this.width || 1280;
    const H = this.height || 720;
    ctx.clearRect(0, 0, W, H);

    if (!state.active) return;

    const { plane, mission, targetWorldPos, targetLabel, viewProj, bannerText, camMode, score, combo, timeLeftSec, ringsCleared, ringsTotal, dropsDone, dropsTotal } = state;
    const { headingDeg, pitchRad, rollRad } = eulerFromQuat(plane.quat);
    const speedKts = Math.round(plane.indicatedAirspeed * 1.94384);
    const altFt = Math.max(0, Math.round(plane.pos[1] * 3.28084));
    const vsiFpm = Math.round(plane.verticalSpeed * 196.85);
    const hdgText = String(Math.round(headingDeg) % 360).padStart(3, '0');

    const hudPrimary = '#4af5d8';
    const hudShadow = 'rgba(4, 14, 24, 0.72)';
    const hudWarn = '#fbbf24';
    const hudDanger = '#fb7185';

    // 1. Center Collimated Attitude Ladder & Bank Arc
    const cx = W * 0.5;
    const cy = H * 0.48;
    ctx.save();
    ctx.translate(cx, cy);

    // Subtle backing vignette around reticle in bright skies
    ctx.strokeStyle = hudPrimary;
    ctx.lineWidth = 2;

    // Fixed boresight gull-wing symbol
    ctx.beginPath();
    ctx.moveTo(-22, 0);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-4, 7);
    ctx.moveTo(4, 7);
    ctx.lineTo(8, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();

    // Rotating Pitch Ladder
    ctx.save();
    ctx.beginPath();
    ctx.rect(-155, -135, 310, 270);
    ctx.clip();
    ctx.rotate(-rollRad);

    const pitchDeg = (pitchRad * 180) / Math.PI;
    const pxPerDeg = 4.6;
    for (let deg = -40; deg <= 40; deg += 10) {
      const y = (pitchDeg - deg) * pxPerDeg;
      if (Math.abs(y) > 135) continue;
      ctx.strokeStyle = deg === 0 ? 'rgba(74, 245, 216, 0.9)' : 'rgba(74, 245, 216, 0.55)';
      ctx.lineWidth = deg === 0 ? 2 : 1.5;
      if (deg < 0) ctx.setLineDash([6, 4]);
      else ctx.setLineDash([]);

      const span = deg === 0 ? 115 : 54;
      ctx.beginPath();
      ctx.moveTo(-span, y);
      ctx.lineTo(-22, y);
      ctx.moveTo(22, y);
      ctx.lineTo(span, y);
      ctx.stroke();
      ctx.setLineDash([]);

      if (deg !== 0) {
        ctx.fillStyle = hudPrimary;
        ctx.font = '700 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(String(deg), -span - 5, y + 4);
        ctx.textAlign = 'left';
        ctx.fillText(String(deg), span + 5, y + 4);
      }
    }
    ctx.restore();
    ctx.restore();

    // 2. Top Compass Heading Tape (HDG)
    this.drawHeadingTape(ctx, cx, 36, headingDeg, hdgText, hudPrimary, hudShadow, targetWorldPos, plane.pos);

    // 3. Left Airspeed Tape (SPD KTS) & Right Altitude Tape (ALT FT)
    this.drawVerticalTape(ctx, 132, cy, 'SPD', `${speedKts}`, 'KTS', speedKts, 20, 4.5, hudPrimary, hudShadow, 'left');
    this.drawVerticalTape(ctx, W - 132, cy, 'ALT', `${altFt}`, `FT · ${vsiFpm >= 0 ? '+' : ''}${vsiFpm}`, altFt, 100, 1.35, hudPrimary, hudShadow, 'right');

    // 4. 3D Projected Waypoint / Carrier / Target Diamond
    if (targetWorldPos) {
      const proj = projectPoint(targetWorldPos, viewProj);
      const distM = Math.round(
        Math.hypot(targetWorldPos[0] - plane.pos[0], targetWorldPos[1] - plane.pos[1], targetWorldPos[2] - plane.pos[2]),
      );
      const sx = clamp((proj.ndcX * 0.5 + 0.5) * W, 42, W - 42);
      const sy = clamp((0.5 - proj.ndcY * 0.5) * H, 68, H - 68);
      const drawX = proj.behind ? W - sx : sx;
      const drawY = proj.behind ? H - 72 : sy;

      ctx.save();
      ctx.translate(drawX, drawY);
      ctx.strokeStyle = hudWarn;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(14, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-14, 0);
      ctx.closePath();
      ctx.stroke();

      ctx.font = '700 12px "Segoe UI", sans-serif';
      const tag = `${targetLabel || 'TARGET'} · ${distM}m`;
      const tw = ctx.measureText(tag).width + 12;
      ctx.fillStyle = hudShadow;
      ctx.fillRect(-tw * 0.5, 18, tw, 20);
      ctx.fillStyle = hudWarn;
      ctx.textAlign = 'center';
      ctx.fillText(tag, 0, 32);
      ctx.restore();
    }

    // 5. ILS Localizer & Glideslope Crosshairs when approaching Carrier or Runway
    if (mission.landingTarget === 'carrier' || mission.landingTarget === 'runway') {
      const targetRef = mission.landingTarget === 'carrier' ? CARRIER_SPEC.center : RUNWAY_SPEC.center;
      const dTarget = Math.hypot(plane.pos[0] - targetRef[0], plane.pos[2] - targetRef[2]);
      if (dTarget < 2400) {
        this.drawIlsCrosshairs(ctx, cx, cy, plane, mission.landingTarget, hudWarn);
      }
    }

    // 6. Top-Left Mission Telemetry Pill (Mission, Progress, Score, Timer)
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = hudShadow;
    this.roundRect(ctx, 18, 16, 290, 82, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(94, 234, 212, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.fillStyle = hudWarn;
    ctx.font = '700 11px "Segoe UI", sans-serif';
    ctx.fillText(mission.shortName, 30, 35);

    ctx.fillStyle = '#f1f7fc';
    ctx.font = '700 17px "Segoe UI", sans-serif';
    const progStr = ringsTotal > 0
      ? `GATES ${ringsCleared}/${ringsTotal}`
      : dropsTotal > 0
        ? `DROPS ${dropsDone}/${dropsTotal}`
        : `FREE FLIGHT`;
    ctx.fillText(`${progStr}  ·  ${score} PTS`, 30, 58);

    ctx.fillStyle = '#9bb5cc';
    ctx.font = '600 12px "Segoe UI", sans-serif';
    const timerStr = timeLeftSec > 0 ? `TIME ${Math.ceil(timeLeftSec)}s` : 'UNLIMITED';
    ctx.fillText(`${timerStr}  ·  COMBO x${combo}  ·  ${camMode.toUpperCase()}`, 30, 80);
    ctx.restore();

    // 7. Live-Flown Cockpit MFD Gauges (when in Cockpit View)
    if (camMode === 'cockpit') {
      this.drawCockpitMfdPanel(ctx, W, H, plane, headingDeg, pitchRad, rollRad, speedKts, altFt, hudPrimary, hudWarn);
    }

    // 8. Bottom-Left Tactical Radar Minimap (Terrain / Runway / Carrier / Target / Wind)
    this.drawRadarMinimap(ctx, 104, H - 102, 74, plane, mission, targetWorldPos, hudPrimary, hudWarn, hudShadow);

    // 9. Bottom-Right Aircraft Systems & Fuel/Hull Panel (Critical for Sortie Decisions)
    this.drawSystemsPanel(ctx, W - 332, H - 122, 314, 104, plane, camMode, hudPrimary, hudWarn, hudDanger, hudShadow);

    // 10. Critical Alerts & Action Banner
    const alerts = [];
    if (plane.stalling) alerts.push({ text: 'STALL — LOWER NOSE & ADD THROTTLE', color: hudDanger });
    else if (plane.lastTerrainClearance < 48 && !plane.gearDown && !plane.grounded) alerts.push({ text: 'TERRAIN — PULL UP', color: hudDanger });
    else if (plane.fuel <= 18) alerts.push({ text: `LOW FUEL (${Math.round(plane.fuel)}%) — LAND TO REFUEL`, color: hudWarn });

    if (alerts.length > 0) {
      this.drawBanner(ctx, cx, H * 0.22, alerts[0].text, alerts[0].color);
    } else if (bannerText) {
      this.drawBanner(ctx, cx, H * 0.22, bannerText, hudPrimary);
    }
  }

  drawHeadingTape(ctx, cx, y, headingDeg, hdgText, color, bg, targetPos, planePos) {
    ctx.save();
    ctx.fillStyle = bg;
    this.roundRect(ctx, cx - 150, y - 20, 300, 40, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 245, 216, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.rect(cx - 140, y - 18, 280, 36);
    ctx.clip();

    const pxPerDeg = 4.2;
    for (let offset = -35; offset <= 35; offset += 5) {
      const degRaw = Math.round(headingDeg / 5) * 5 + offset;
      const deg = ((degRaw % 360) + 360) % 360;
      const x = cx + (degRaw - headingDeg) * pxPerDeg;
      ctx.strokeStyle = color;
      ctx.lineWidth = deg % 15 === 0 ? 1.8 : 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 10);
      ctx.lineTo(x, y + (deg % 15 === 0 ? 18 : 14));
      ctx.stroke();

      if (deg % 15 === 0) {
        ctx.fillStyle = color;
        ctx.font = '700 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        const label = deg === 0 ? 'N' : deg === 90 ? 'E' : deg === 180 ? 'S' : deg === 270 ? 'W' : String(deg).padStart(3, '0');
        ctx.fillText(label, x, y + 6);
      }
    }

    if (targetPos) {
      const brg = ((Math.atan2(targetPos[0] - planePos[0], -(targetPos[2] - planePos[2])) * 180) / Math.PI + 360) % 360;
      let diff = ((brg - headingDeg + 540) % 360) - 180;
      diff = clamp(diff, -32, 32);
      const bx = cx + diff * pxPerDeg;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.moveTo(bx, y + 18);
      ctx.lineTo(bx - 5, y + 10);
      ctx.lineTo(bx + 5, y + 10);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // Center HDG readout box
    ctx.save();
    ctx.fillStyle = '#071423';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    this.roundRect(ctx, cx - 42, y + 20, 84, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 14px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`HDG ${hdgText}°`, cx, y + 37);
    ctx.restore();
  }

  drawVerticalTape(ctx, x, cy, title, valueStr, subStr, numericVal, step, pxPerUnit, color, bg, side) {
    const w = 114;
    const h = 232;
    const left = x - w * 0.5;
    const top = cy - h * 0.5;

    ctx.save();
    ctx.fillStyle = bg;
    this.roundRect(ctx, left, top, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 245, 216, 0.34)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Header title
    ctx.fillStyle = color;
    ctx.font = '700 11px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, x, top + 16);

    // Scrolling ticks
    ctx.save();
    ctx.beginPath();
    ctx.rect(left + 4, top + 24, w - 8, h - 52);
    ctx.clip();
    const base = Math.floor(numericVal / step) * step;
    for (let i = -5; i <= 5; i++) {
      const v = base + i * step;
      if (v < 0) continue;
      const py = cy - (v - numericVal) * pxPerUnit;
      ctx.strokeStyle = 'rgba(74, 245, 216, 0.55)';
      ctx.lineWidth = 1.4;
      const tx = side === 'left' ? left + w - 18 : left + 18;
      ctx.beginPath();
      ctx.moveTo(tx, py);
      ctx.lineTo(side === 'left' ? left + w - 6 : left + 6, py);
      ctx.stroke();

      ctx.fillStyle = 'rgba(226, 242, 252, 0.8)';
      ctx.font = '600 11px "Segoe UI", sans-serif';
      ctx.textAlign = side === 'left' ? 'right' : 'left';
      ctx.fillText(String(v), side === 'left' ? tx - 5 : tx + 5, py + 4);
    }
    ctx.restore();

    // Center big bold digital box
    ctx.fillStyle = '#071423';
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    this.roundRect(ctx, left + 6, cy - 17, w - 12, 34, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 18px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(valueStr, x, cy + 6);

    // Bottom unit/sub label
    ctx.fillStyle = '#9bb5cc';
    ctx.font = '700 11px "Segoe UI", sans-serif';
    ctx.fillText(subStr, x, top + h - 10);
    ctx.restore();
  }

  drawIlsCrosshairs(ctx, cx, cy, plane, kind, color) {
    const spec = kind === 'carrier' ? CARRIER_SPEC : RUNWAY_SPEC;
    const rad = (spec.headingDeg * Math.PI) / 180;
    const fwdX = Math.sin(rad), fwdZ = -Math.cos(rad);
    const rightX = Math.cos(rad), rightZ = Math.sin(rad);
    const dx = plane.pos[0] - spec.center[0];
    const dz = plane.pos[2] - spec.center[2];
    const distBehind = -(dx * fwdX + dz * fwdZ);
    const lateralErr = dx * rightX + dz * rightZ;
    const idealAlt = (spec.deckHeight || spec.elevation) + Math.max(0, distBehind) * 0.088;
    const gsErr = plane.pos[1] - idealAlt;

    const locPx = clamp(-lateralErr * 0.65, -75, 75);
    const gsPx = clamp(gsErr * 1.1, -60, 60);

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx + locPx, cy - 75);
    ctx.lineTo(cx + locPx, cy + 75);
    ctx.moveTo(cx - 75, cy + gsPx);
    ctx.lineTo(cx + 75, cy + gsPx);
    ctx.stroke();
    ctx.restore();
  }

  drawRadarMinimap(ctx, rx, ry, r, plane, mission, targetPos, hudColor, warnColor, bg) {
    ctx.save();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(rx, ry, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 245, 216, 0.42)';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(rx, ry, r - 2, 0, Math.PI * 2);
    ctx.clip();

    // Range circles
    ctx.strokeStyle = 'rgba(74, 245, 216, 0.16)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(rx, ry, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    const { headingDeg } = eulerFromQuat(plane.quat);
    const hdgRad = (headingDeg * Math.PI) / 180;
    const scale = r / 3800;

    const toRadar = (wx, wz) => {
      const dx = wx - plane.pos[0];
      const dz = wz - plane.pos[2];
      const rxLocal = dx * Math.cos(hdgRad) + dz * Math.sin(hdgRad);
      const ryLocal = -dx * Math.sin(hdgRad) + dz * Math.cos(hdgRad);
      return [rx + rxLocal * scale, ry + ryLocal * scale];
    };

    // Plot Runway 36 & Carrier CVN-07 icons
    const [rwX, rwY] = toRadar(RUNWAY_SPEC.center[0], RUNWAY_SPEC.center[2]);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(rwX - 3, rwY - 6, 6, 12);

    const [cvX, cvY] = toRadar(CARRIER_SPEC.center[0], CARRIER_SPEC.center[2]);
    ctx.fillStyle = '#fb7185';
    ctx.fillRect(cvX - 4, cvY - 4, 8, 8);

    // Plot remaining rings / beacons
    ctx.fillStyle = 'rgba(74, 245, 216, 0.7)';
    for (const ring of mission.rings || []) {
      const [px, py] = toRadar(ring.pos[0], ring.pos[2]);
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (targetPos) {
      const [tx, ty] = toRadar(targetPos[0], targetPos[2]);
      const dist = Math.hypot(tx - rx, ty - ry);
      const clampedX = dist > r - 8 ? rx + ((tx - rx) / dist) * (r - 8) : tx;
      const clampedY = dist > r - 8 ? ry + ((ty - ry) / dist) * (r - 8) : ty;
      ctx.fillStyle = warnColor;
      ctx.beginPath();
      ctx.arc(clampedX, clampedY, 4.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Center player chevron
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(rx, ry - 7);
    ctx.lineTo(rx - 5, ry + 5);
    ctx.lineTo(rx + 5, ry + 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.fillStyle = hudColor;
    ctx.font = '700 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('RADAR · WIND', rx, ry + r + 14);
    ctx.restore();
  }

  drawCockpitMfdPanel(ctx, W, H, plane, headingDeg, pitchRad, rollRad, speedKts, altFt, hudColor, warnColor) {
    // 3 lit glass MFDs centered on cockpit coaming so instruments read as flown rather than drawn
    const mfdY = H - 124;
    const mfdW = 148;
    const mfdH = 108;
    const positions = [W * 0.5 - 245, W * 0.5 - 74, W * 0.5 + 97];

    const drawBezel = (x, title) => {
      ctx.save();
      ctx.fillStyle = 'rgba(6, 15, 26, 0.92)';
      this.roundRect(ctx, x, mfdY, mfdW, mfdH, 8);
      ctx.fill();
      ctx.strokeStyle = 'rgba(74, 245, 216, 0.58)';
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.fillStyle = warnColor;
      ctx.font = '700 9px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(title, x + 8, mfdY + 13);
      ctx.restore();
    };

    // Left MFD: Live Attitude Ball (Sky/Ground Artificial Horizon)
    drawBezel(positions[0], 'ADI · ATTITUDE');
    ctx.save();
    const acx = positions[0] + mfdW * 0.5;
    const acy = mfdY + 61;
    const ar = 35;
    ctx.beginPath();
    ctx.arc(acx, acy, ar, 0, Math.PI * 2);
    ctx.clip();
    ctx.translate(acx, acy);
    ctx.rotate(-rollRad);
    const pitchShift = clamp((pitchRad * 180) / Math.PI, -40, 40) * 1.1;
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(-50, -60 + pitchShift, 100, 60);
    ctx.fillStyle = '#7c4a26';
    ctx.fillRect(-50, pitchShift, 100, 60);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(-45, pitchShift);
    ctx.lineTo(45, pitchShift);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = warnColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(acx - 16, acy);
    ctx.lineTo(acx - 4, acy);
    ctx.lineTo(acx, acy + 4);
    ctx.lineTo(acx + 4, acy);
    ctx.lineTo(acx + 16, acy);
    ctx.stroke();
    ctx.restore();

    // Center MFD: Engine / Fuel / AoA Circular Analog-Digital Gauges
    drawBezel(positions[1], 'ENG · FUEL · AOA');
    const drawDial = (dx, dy, valPct, label, col) => {
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(dx, dy, 19, Math.PI * 0.75, Math.PI * 2.25);
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(dx, dy, 19, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * clamp(valPct / 100, 0, 1)));
      ctx.stroke();
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(valPct)}%`, dx, dy + 4);
      ctx.fillStyle = '#9bb5cc';
      ctx.font = '700 8px "Segoe UI", sans-serif';
      ctx.fillText(label, dx, dy + 22);
      ctx.restore();
    };
    drawDial(positions[1] + 42, mfdY + 56, plane.throttle * 100, 'RPM', hudColor);
    drawDial(positions[1] + 106, mfdY + 56, plane.fuel, 'FUEL', warnColor);
    ctx.save();
    ctx.fillStyle = hudColor;
    ctx.font = '700 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`AOA ${((plane.aoaRad * 180) / Math.PI).toFixed(1)}°  ·  ${speedKts} KT`, positions[1] + mfdW * 0.5, mfdY + 98);
    ctx.restore();

    // Right MFD: HSI Compass Rose & Flight Readout
    drawBezel(positions[2], 'HSI · NAV');
    ctx.save();
    const hcx = positions[2] + mfdW * 0.5;
    const hcy = mfdY + 58;
    ctx.strokeStyle = hudColor;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(hcx, hcy, 30, 0, Math.PI * 2);
    ctx.stroke();
    const hRad = (-headingDeg * Math.PI) / 180;
    for (let i = 0; i < 8; i++) {
      const a = hRad + (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(hcx + Math.sin(a) * 24, hcy - Math.cos(a) * 24);
      ctx.lineTo(hcx + Math.sin(a) * 30, hcy - Math.cos(a) * 30);
      ctx.stroke();
    }
    ctx.fillStyle = warnColor;
    ctx.beginPath();
    ctx.moveTo(hcx, hcy - 14);
    ctx.lineTo(hcx - 5, hcy + 8);
    ctx.lineTo(hcx + 5, hcy + 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 10px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${String(Math.round(headingDeg)).padStart(3, '0')}°  ·  ${altFt} FT`, hcx, mfdY + 100);
    ctx.restore();
  }

  drawSystemsPanel(ctx, x, y, w, h, plane, camMode, hudColor, warnColor, dangerColor, bg) {
    ctx.save();
    ctx.textAlign = 'left';
    ctx.fillStyle = bg;
    this.roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(74, 245, 216, 0.35)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const thrPct = Math.round(plane.throttle * 100);
    const fuelPct = Math.round(plane.fuel);
    const hullPct = Math.round(plane.hull);

    // Bars for Throttle, Fuel, Hull
    const drawBar = (bx, by, bw, label, pct, barColor) => {
      ctx.fillStyle = '#9bb5cc';
      ctx.font = '700 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label, bx, by);
      ctx.fillStyle = '#f8fafc';
      ctx.textAlign = 'right';
      ctx.fillText(`${pct}%`, bx + bw, by);
      ctx.textAlign = 'left';

      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      this.roundRect(ctx, bx, by + 5, bw, 7, 3);
      ctx.fill();
      ctx.fillStyle = barColor;
      this.roundRect(ctx, bx, by + 5, (bw * clamp(pct, 0, 100)) / 100, 7, 3);
      ctx.fill();
    };

    drawBar(x + 14, y + 22, 86, plane.afterburner ? 'AB ON' : 'THR', thrPct, plane.afterburner ? warnColor : hudColor);
    drawBar(x + 114, y + 22, 86, 'FUEL', fuelPct, fuelPct <= 20 ? dangerColor : fuelPct <= 40 ? warnColor : '#38bdf8');
    drawBar(x + 214, y + 22, 86, 'HULL', hullPct, hullPct <= 35 ? dangerColor : hullPct <= 65 ? warnColor : '#4ade80');

    // Bottom badge pills: GEAR, FLAPS, G-LOAD, VIEW
    const pills = [
      { label: plane.gearDown ? 'GEAR DOWN' : 'GEAR UP', active: plane.gearDown, col: warnColor },
      { label: plane.flaps ? 'FLAPS FULL' : 'FLAPS UP', active: Boolean(plane.flaps), col: hudColor },
      { label: `${plane.gLoad.toFixed(1)}G`, active: plane.gLoad > 6, col: plane.gLoad > 7.5 ? dangerColor : '#9bb5cc' },
      { label: camMode === 'cockpit' ? 'COCKPIT [V]' : 'CHASE [V]', active: true, col: '#38bdf8' },
    ];

    let px = x + 14;
    for (const p of pills) {
      const pw = 68;
      ctx.fillStyle = p.active ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.06)';
      this.roundRect(ctx, px, y + 60, pw, 26, 6);
      ctx.fill();
      ctx.strokeStyle = p.active ? p.col : 'rgba(148, 197, 232, 0.25)';
      ctx.lineWidth = 1.1;
      ctx.stroke();

      ctx.fillStyle = p.active ? p.col : '#9bb5cc';
      ctx.font = '700 10px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, px + pw * 0.5, y + 77);
      px += pw + 5;
    }
    ctx.restore();
  }

  drawBanner(ctx, cx, y, text, color) {
    ctx.save();
    ctx.font = '800 14px "Segoe UI", sans-serif';
    const w = Math.max(240, ctx.measureText(text).width + 36);
    ctx.fillStyle = 'rgba(6, 15, 26, 0.84)';
    this.roundRect(ctx, cx - w * 0.5, y - 16, w, 32, 8);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.fillText(text, cx, y + 5);
    ctx.restore();
  }

  roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
