/* Sortie explainer: deterministic frame renderer. drawFrame(t) paints the frame at time t (s). */
'use strict';
const W = 1920, H = 1080;
const cv = document.getElementById('c'), X = cv.getContext('2d');
const off = document.createElement('canvas'); off.width = W; off.height = H; const OX = off.getContext('2d');

/* ---------- palette & type ---------- */
const P = {
  bg: '#0B1322', bg2: '#0F1A2E', grid: 'rgba(140,165,200,0.05)',
  water: '#0D1A2E', water2: '#0A1424', land: '#18233A', landEdge: '#22314B',
  road: '#2B3A55', bldDark: '#2F3D55', photo: '#C9CFD8',
  ink: '#F2EFE8', muted: '#8E9AAE', faint: '#5A677D',
  cobalt: '#5D8BFF', amber: '#F2A541', green: '#48C28A', red: '#E5544A', grey: '#9AA6B8',
  jds: ['#8E9BAE', '#E8C35A', '#EE8A2E', '#E0453A', '#5E6878'],
  paper: '#F4F1EA', paperInk: '#1A2233', paperRule: '#D9D3C6'
};
const F = {
  disp: (w, s) => `${w} ${s}px "Archivo"`,
  body: (w, s) => `${w} ${s}px "Public Sans"`,
  mono: (w, s) => `${w} ${s}px "JetBrains Mono"`
};

/* ---------- math ---------- */
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const seg = (t, a, b) => clamp((t - a) / (b - a));
const eIO = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const eOut = t => 1 - Math.pow(1 - t, 3);
const eIn = t => t * t * t;
const eBack = t => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
function rng(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const mixHex = (h1, h2, t) => { const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16); const r = Math.round(lerp(a >> 16 & 255, b >> 16 & 255, t)), g = Math.round(lerp(a >> 8 & 255, b >> 8 & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t)); return `rgb(${r},${g},${bl})`; };

/* ---------- text ---------- */
function txt(c, s, x, y, o = {}) {
  c.save();
  c.font = o.font || F.body(500, 28);
  c.fillStyle = o.color || P.ink;
  c.textAlign = o.align || 'left';
  c.textBaseline = o.base || 'alphabetic';
  c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
  if (o.stretch) c.fontStretch = o.stretch;
  if (o.ls != null) c.letterSpacing = o.ls + 'px';
  c.fillText(s, x, y);
  c.restore();
}
function measure(c, s, font, stretch, ls) { c.save(); c.font = font; if (stretch) c.fontStretch = stretch; if (ls != null) c.letterSpacing = ls + 'px'; const w = c.measureText(s).width; c.restore(); return w; }
/* headline that rises in word by word */
function headline(c, lines, x, y, p, o = {}) {
  const size = o.size || 96, lh = o.lh || size * 1.02, font = F.disp(o.weight || 800, size);
  let k = 0;
  lines.forEach((ln, li) => {
    const words = ln.split(' '); let cx = x;
    if (o.align === 'center') cx = x - measure(c, ln, font, 'condensed', o.ls || 0) / 2;
    words.forEach((w, wi) => {
      const d = (o.stagger || 0.06) * k++, q = eOut(seg(p, d, d + 0.55));
      const ww = measure(c, w + ' ', font, 'condensed', o.ls || 0);
      c.save(); c.beginPath(); c.rect(cx - 10, y + li * lh - size * 1.05, ww + 30, size * 1.32); c.clip();
      txt(c, w, cx, y + li * lh + (1 - q) * size * 0.9, { font, stretch: 'condensed', color: (o.colors && o.colors[li]) || o.color || P.ink, alpha: q, ls: o.ls || 0 });
      c.restore(); cx += ww;
    });
  });
}
function typeOn(s, p) { return s.slice(0, Math.floor(clamp(p) * s.length)); }
function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect(x, y, w, h, r); }

/* ---------- data ---------- */
let ISL = null, TL = null, Bm = [], ROADS = [], BLOCK = [], SLOW = [], STG = null, FACm = null, ROUTE = [], landPath = null, roadPath = null, isoSorted = [];
const MK = 0.42; // map px per metre
function toMap(x, y) { const u = (x + y) / Math.SQRT2, v = (x - y) / Math.SQRT2; return [u * MK, -v * MK]; }
function init(island, timeline) {
  ISL = island; TL = timeline;
  Bm = ISL.buildings.map((b, i) => {
    const [x, y, w, h, ang, jds, ht] = b, a = ang * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(p => toMap(x + p[0] * ca - p[1] * sa, y + p[0] * sa + p[1] * ca));
    const c = toMap(x, y);
    return { pts, c, jds, ht, area: w * h, r: rng(i * 977 + 3)() };
  });
  ROADS = ISL.roads.map(l => l.map(p => toMap(p[0], p[1])));
  BLOCK = ISL.blocked.map(l => l.map(p => toMap(p[0], p[1])));
  SLOW = ISL.slow.map(l => l.map(p => toMap(p[0], p[1])));
  STG = toMap(ISL.staging[0], ISL.staging[1]);
  FACm = toMap(ISL.fac.x, ISL.fac.y);
  ROUTE = ISL.route.map(p => toMap(p[0], p[1]));
  roadPath = new Path2D(); ROADS.forEach(l => { roadPath.moveTo(l[0][0], l[0][1]); l.forEach(p => roadPath.lineTo(p[0], p[1])); });
  landPath = new Path2D(); ROADS.forEach(l => { landPath.moveTo(l[0][0], l[0][1]); l.forEach(p => landPath.lineTo(p[0], p[1])); });
  isoSorted = Bm.map((b, i) => i).sort((a, b) => Bm[a].c[1] - Bm[b].c[1] || Bm[a].c[0] - Bm[b].c[0]);
  // route cumulative lengths
  let L = 0; ROUTE.cum = [0]; for (let i = 1; i < ROUTE.length; i++) { L += Math.hypot(ROUTE[i][0] - ROUTE[i - 1][0], ROUTE[i][1] - ROUTE[i - 1][1]); ROUTE.cum.push(L); } ROUTE.len = L;
  // scenes map
  SC = {}; TL.scenes.forEach(s => SC[s.id] = s);
  prerenderOrtho();
}
let SC = {};
function lineT(scene, i) { const l = TL.lines.filter(x => x.scene === scene)[i]; return l ? l.start - SC[scene].start : 0; }

/* ---------- background ---------- */
function bg(c, a = 1) {
  c.save(); c.globalAlpha = a;
  const g = c.createRadialGradient(W * .5, H * .45, 100, W * .5, H * .5, W * .75);
  g.addColorStop(0, P.bg2); g.addColorStop(1, P.bg);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = P.grid; c.lineWidth = 1;
  for (let x = 0; x <= W; x += 60) { c.beginPath(); c.moveTo(x + .5, 0); c.lineTo(x + .5, H); c.stroke(); }
  for (let y = 0; y <= H; y += 60) { c.beginPath(); c.moveTo(0, y + .5); c.lineTo(W, y + .5); c.stroke(); }
  c.restore();
}

/* ---------- map ---------- */
function camSet(c, cam) { c.setTransform(cam.z, 0, 0, cam.z, W / 2 - cam.x * cam.z, H / 2 - cam.y * cam.z); }
function drawWater(c) {
  const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#0E1C33'); g.addColorStop(1, '#081120');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function drawLand(c, cam, o = {}) {
  c.save(); camSet(c, cam);
  c.lineCap = 'round'; c.lineJoin = 'round';
  c.strokeStyle = P.landEdge; c.lineWidth = 78 * MK; c.stroke(landPath);
  c.strokeStyle = P.land; c.lineWidth = 64 * MK; c.stroke(landPath);
  c.fillStyle = P.land; Bm.forEach(b => { c.beginPath(); c.arc(b.c[0], b.c[1], 30 * MK, 0, 7); c.fill(); });
  c.strokeStyle = o.roadColor || P.road; c.lineWidth = Math.max(7 * MK, 1.2 / cam.z); c.stroke(roadPath);
  c.restore();
}
function polyFill(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill(); }
function drawBuildings(c, cam, colorFn) {
  c.save(); camSet(c, cam);
  for (let i = 0; i < Bm.length; i++) { const col = colorFn(Bm[i], i); if (!col) continue; c.fillStyle = col; polyFill(c, Bm[i].pts); }
  c.restore();
}
function strokeLines(c, cam, lines, color, width, prog = 1) {
  c.save(); camSet(c, cam); c.strokeStyle = color; c.lineWidth = width / cam.z; c.lineCap = 'round';
  const n = Math.floor(lines.length * prog);
  for (let i = 0; i < n; i++) { const l = lines[i]; c.beginPath(); c.moveTo(l[0][0], l[0][1]); l.forEach(p => c.lineTo(p[0], p[1])); c.stroke(); }
  c.restore();
}
function routePoint(d) { for (let i = 1; i < ROUTE.length; i++) if (ROUTE.cum[i] >= d) { const t = (d - ROUTE.cum[i - 1]) / ((ROUTE.cum[i] - ROUTE.cum[i - 1]) || 1); return [lerp(ROUTE[i - 1][0], ROUTE[i][0], t), lerp(ROUTE[i - 1][1], ROUTE[i][1], t)]; } return ROUTE[ROUTE.length - 1]; }
function drawRoute(c, cam, prog, t) {
  const d = ROUTE.len * prog;
  c.save(); camSet(c, cam); c.lineCap = 'round'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(ROUTE[0][0], ROUTE[0][1]);
  for (let i = 1; i < ROUTE.length && ROUTE.cum[i] <= d; i++) c.lineTo(ROUTE[i][0], ROUTE[i][1]);
  const e = routePoint(d); c.lineTo(e[0], e[1]);
  c.strokeStyle = hexA(P.cobalt, .35); c.lineWidth = 16 / cam.z; c.stroke();
  c.strokeStyle = P.cobalt; c.lineWidth = 5 / cam.z; c.stroke();
  if (prog > 0 && prog < 1) { c.fillStyle = '#fff'; c.beginPath(); c.arc(e[0], e[1], 7 / cam.z, 0, 7); c.fill(); }
  c.restore();
}
/* offscreen orthomosaic for photo tiles */
const ortho = document.createElement('canvas'); ortho.width = 1900; ortho.height = 900;
function prerenderOrtho() {
  const c = ortho.getContext('2d'), cam = { x: 0, y: 0, z: 1.0 };
  c.fillStyle = '#122036'; c.fillRect(0, 0, 1900, 900);
  c.save(); c.translate(950 - W / 2, 450 - H / 2);
  c.save(); camSet(c, cam); c.lineCap = 'round'; c.strokeStyle = '#3E4B39'; c.lineWidth = 72 * MK; c.stroke(landPath); c.strokeStyle = '#4A5642'; c.lineWidth = 58 * MK; c.stroke(landPath);
  c.fillStyle = '#4A5642'; Bm.forEach(b => { c.beginPath(); c.arc(b.c[0], b.c[1], 28 * MK, 0, 7); c.fill(); });
  c.strokeStyle = '#8B8E86'; c.lineWidth = 7 * MK; c.stroke(roadPath);
  Bm.forEach(b => { c.fillStyle = mixHex('#B9BEC6', '#E4E1D8', b.r); polyFill(c, b.pts); });
  c.restore(); c.restore();
}

/* ---------- icons ---------- */
function icon(c, name, x, y, s, col, lw = 2.4) {
  c.save(); c.translate(x, y); c.scale(s / 48, s / 48); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = lw * 48 / s * (s / 48) * 1.0; c.lineCap = 'round'; c.lineJoin = 'round';
  c.lineWidth = lw;
  const L = (...p) => { c.beginPath(); c.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) c.lineTo(p[i], p[i + 1]); c.stroke(); };
  const C = (cx, cy, r, f) => { c.beginPath(); c.arc(cx, cy, r, 0, 7); f ? c.fill() : c.stroke(); };
  switch (name) {
    case 'drone': L(-14, -14, 14, 14); L(14, -14, -14, 14); [[-14, -14], [14, -14], [-14, 14], [14, 14]].forEach(p => C(p[0], p[1], 7)); c.beginPath(); c.roundRect(-6, -6, 12, 12, 3); c.fill(); break;
    case 'layers': [10, 0, -10].forEach((o, i) => { c.beginPath(); c.moveTo(-18, o); c.lineTo(0, o - 9); c.lineTo(18, o); c.lineTo(0, o + 9); c.closePath(); i === 2 ? c.fill() : c.stroke(); }); break;
    case 'train': C(0, 0, 16); C(0, 0, 7); L(0, -24, 0, -16); L(0, 16, 0, 24); L(-24, 0, -16, 0); L(16, 0, 24, 0); C(0, 0, 2.5, true); break;
    case 'detect': L(-20, -10, -20, -20, -10, -20); L(10, -20, 20, -20, 20, -10); L(20, 10, 20, 20, 10, 20); L(-10, 20, -20, 20, -20, 10); c.beginPath(); c.rect(-9, -9, 18, 18); c.fill(); break;
    case 'review': C(-4, -10, 8); c.beginPath(); c.moveTo(-18, 16); c.quadraticCurveTo(-4, -2, 10, 16); c.stroke(); L(8, 2, 13, 7, 22, -4); break;
    case 'deliver': c.beginPath(); c.roundRect(-16, -20, 32, 40, 3); c.stroke(); L(-8, -8, 8, -8); L(-8, 0, 8, 0); L(-8, 8, 2, 8); break;
    case 'check': L(-10, 0, -3, 7, 11, -8); break;
    case 'cloud': c.beginPath(); c.arc(-8, 2, 9, Math.PI * .5, Math.PI * 1.5); c.arc(0, -6, 11, Math.PI, 0); c.arc(10, 2, 9, Math.PI * 1.5, Math.PI * .5); c.closePath(); c.stroke(); break;
    case 'cam': c.beginPath(); c.roundRect(-14, -9, 28, 18, 3); c.fill(); c.fillStyle = P.bg; C(0, 0, 5, true); break;
    case 'pin': c.beginPath(); c.arc(0, -8, 10, Math.PI, 0); c.lineTo(0, 16); c.closePath(); c.fill(); c.fillStyle = P.bg; C(0, -8, 4, true); break;
  }
  c.restore();
}

/* ---------- rail ---------- */
const STAGES = [['Capture', 'drone'], ['Process', 'layers'], ['Train', 'train'], ['Detect', 'detect'], ['Review', 'review'], ['Deliver', 'deliver']];
function railCompact(c, active, a = 1, pulseIdx = -1, pulse = 0) {
  if (a <= 0) return;
  c.save(); c.globalAlpha = a;
  const tg = c.createLinearGradient(0, 0, 0, 170); tg.addColorStop(0, 'rgba(8,13,24,0.92)'); tg.addColorStop(1, 'rgba(8,13,24,0)'); c.fillStyle = tg; c.fillRect(0, 0, W, 170);
  const x0 = 96, dx = 148, y = 74;
  c.strokeStyle = hexA(P.muted, .35); c.lineWidth = 2; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + dx * 5, y); c.stroke();
  if (active > 0) { c.strokeStyle = P.cobalt; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + dx * Math.min(active, 5), y); c.stroke(); }
  STAGES.forEach((s, i) => {
    const x = x0 + dx * i, st = i < active ? 'done' : i === active ? 'on' : 'off';
    if (i === pulseIdx && pulse > 0) { c.fillStyle = hexA(P.green, .35 * pulse); c.beginPath(); c.arc(x, y, 9 + 18 * pulse, 0, 7); c.fill(); }
    c.beginPath(); c.arc(x, y, st === 'on' ? 9 : 6, 0, 7);
    if (st === 'off') { c.fillStyle = P.bg; c.fill(); c.strokeStyle = P.faint; c.lineWidth = 2; c.stroke(); }
    else { c.fillStyle = st === 'on' ? P.amber : P.cobalt; c.fill(); }
    if (st === 'on') { c.strokeStyle = hexA(P.amber, .35); c.lineWidth = 6; c.beginPath(); c.arc(x, y, 15, 0, 7); c.stroke(); }
    txt(c, s[0].toUpperCase(), x, y + 34, { font: F.mono(500, 14), align: 'center', color: st === 'on' ? P.ink : st === 'done' ? P.grey : P.faint, ls: 1.5 });
  });
  txt(c, 'SORTIE', W - 96, y + 6, { font: F.disp(800, 22), stretch: 'condensed', align: 'right', color: P.ink, ls: 3 });
  txt(c, 'FLIGHT-TO-FIELD CONCEPT', W - 96, y + 32, { font: F.mono(400, 12), align: 'right', color: P.faint, ls: 1.5 });
  c.restore();
}

/* ---------- captions ---------- */
function captions(c, t) {
  const l = TL.lines.find(x => t >= x.start - 0.05 && t <= x.end + 0.35);
  if (!l) return;
  const a = Math.min(seg(t, l.start - 0.05, l.start + 0.2), 1 - seg(t, l.end + 0.1, l.end + 0.35));
  c.save(); c.font = F.body(500, 30);
  const words = l.text.split(' '), lines = []; let cur = '';
  words.forEach(w => { const tst = cur ? cur + ' ' + w : w; if (c.measureText(tst).width > 1180 && cur) { lines.push(cur); cur = w; } else cur = tst; }); lines.push(cur);
  const lh = 42, h = lines.length * lh + 26, wmax = Math.max(...lines.map(s => c.measureText(s).width)) + 56, y0 = H - 48 - h;
  c.globalAlpha = a;
  c.fillStyle = 'rgba(6,10,18,0.72)'; rr(c, W / 2 - wmax / 2, y0, wmax, h, 12); c.fill();
  lines.forEach((s, i) => txt(c, s, W / 2, y0 + 13 + 31 + i * lh, { font: F.body(500, 30), align: 'center', color: '#F4F1EA' }));
  c.restore();
}

/* ---------- small UI pieces ---------- */
function chip(c, s, x, y, o = {}) {
  const font = o.font || F.mono(500, 16), w = measure(c, s, font, null, o.ls == null ? 1 : o.ls) + 32 + (o.dot ? 18 : 0), h = o.h || 38;
  c.save(); c.globalAlpha *= (o.alpha == null ? 1 : o.alpha);
  c.fillStyle = o.bg || 'rgba(20,30,50,0.85)'; rr(c, x, y, w, h, h / 2); c.fill();
  if (o.border) { c.strokeStyle = o.border; c.lineWidth = 1.5; c.stroke(); }
  if (o.dot) { c.fillStyle = o.dot; c.beginPath(); c.arc(x + 20, y + h / 2, 5, 0, 7); c.fill(); }
  txt(c, s, x + 16 + (o.dot ? 18 : 0), y + h / 2 + 6, { font, color: o.color || P.ink, ls: o.ls == null ? 1 : o.ls });
  c.restore(); return w;
}
function counter(c, val, x, y, label, a, o = {}) {
  c.save(); c.globalAlpha *= a;
  txt(c, val, x, y, { font: F.mono(500, o.size || 64), color: o.color || P.ink, align: o.align || 'left' });
  txt(c, label, x, y + 34, { font: F.body(500, 20), color: P.muted, align: o.align || 'left' });
  c.restore();
}
const fmtN = n => Math.round(n).toLocaleString('en-US');

/* ================= SCENES ================= */
const camIsland = { x: 0, y: 0, z: 1.0 };

/* 1. OPEN */
function sOpen(c, p, d) {
  drawWater(c);
  const cam = { x: lerp(-40, 20, eIO(seg(p, 0, d))), y: lerp(-70, -40, eIO(seg(p, 0, d))), z: lerp(0.9, 1.0, eIO(seg(p, 0, d))) };
  drawLand(c, cam);
  drawBuildings(c, cam, () => '#5B6A82');
  // storm: drifting cloud arms built from soft blobs along log-spirals
  c.save(); const cx = lerp(1500, 2350, seg(p, -2, 10)), cy = lerp(380, 300, seg(p, 0, 9)), a = 1 - seg(p, 4.5, 8.2);
  const sr = rng(77);
  for (let k = 0; k < 520; k++) {
    const arm = k % 4, u = sr(), th = arm * Math.PI / 2 + u * 5.2 - p * 0.32, r = 40 + u * 900;
    const px = cx + Math.cos(th) * r, py = cy + Math.sin(th) * r * 0.66, rad = 30 + sr() * 70 * (0.4 + u);
    const g = c.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, `rgba(205,215,235,${0.05 * a * (1 - u * 0.6)})`); g.addColorStop(1, 'rgba(205,215,235,0)');
    c.fillStyle = g; c.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  c.restore();
  // vignette
  const vg = c.createLinearGradient(0, 0, 0, H); vg.addColorStop(0, 'rgba(8,13,24,.75)'); vg.addColorStop(.45, 'rgba(8,13,24,0)'); vg.addColorStop(1, 'rgba(8,13,24,.6)');
  c.fillStyle = vg; c.fillRect(0, 0, W, H);
  const meta = '28 SEPT 2022  ·  HURRICANE IAN  ·  FORT MYERS BEACH, FLORIDA';
  txt(c, typeOn(meta, seg(p, 0.4, 2.4)), 120, 140, { font: F.mono(500, 18), color: P.amber, ls: 2 });
  headline(c, ['Recovery moves at the', 'speed of documentation.'], 120, 262, seg(p, 1.6, 4.5) * 1.4, { size: 108, colors: [P.ink, P.ink] });
}

/* 2. PROBLEM */
const INSP = (() => { // pick a walk of buildings near map centre-left
  return null;
})();
let walk = null;
function buildWalk() {
  const cands = Bm.map((b, i) => [i, b]).filter(([i, b]) => Math.abs(b.c[0] + 180) < 140 && Math.abs(b.c[1] - 10) < 70);
  cands.sort((a, b) => a[1].c[0] - b[1].c[0]);
  walk = cands.filter((x, i) => i % 2 === 0).slice(0, 9).map(x => x[0]);
}
function sProblem(c, p, d) {
  if (!walk) buildWalk();
  drawWater(c);
  const z = eIO(seg(p, 0, 3.2));
  const wc = walk.reduce((a, i) => [a[0] + Bm[i].c[0] / walk.length, a[1] + Bm[i].c[1] / walk.length], [0, 0]);
  const Z = 3.0, cam = { x: lerp(20, wc[0] - 380 / Z, z), y: lerp(-40, wc[1] - 20 / Z, z), z: lerp(1.0, Z, z) };
  drawLand(c, cam);
  const visitDur = 1.35, start = 2.2;
  const nVisited = Math.max(0, Math.floor((p - start) / visitDur));
  drawBuildings(c, cam, (b, i) => { const k = walk.indexOf(i); return k >= 0 && k < nVisited ? P.ink : k >= 0 ? '#7A89A2' : '#4A5872'; });
  // inspector
  if (p > start - 0.6) {
    const f = (p - start) / visitDur, k = Math.min(Math.floor(f), walk.length - 1), fr = f - Math.floor(f);
    const A = k <= 0 ? [Bm[walk[0]].c[0] - 30, Bm[walk[0]].c[1] + 22] : Bm[walk[k - 1]].c, Bt = Bm[walk[Math.max(0, k)]].c;
    const q = eIO(clamp(fr / 0.6)); const pos = [lerp(A[0], Bt[0], q), lerp(A[1], Bt[1], q) + 14];
    c.save(); camSet(c, cam);
    c.fillStyle = hexA(P.amber, 0.25); c.beginPath(); c.arc(pos[0], pos[1], 12 / cam.z * 2, 0, 7); c.fill();
    c.fillStyle = P.amber; c.beginPath(); c.arc(pos[0], pos[1], 6 / cam.z * 1.6, 0, 7); c.fill();
    c.restore();
    walk.slice(0, nVisited).forEach(i => { const s = toScreen(cam, Bm[i].c); icon(c, 'check', s[0], s[1] - 36, 30, P.green, 3.2); });
  }
  // left darkening
  const lg = c.createLinearGradient(0, 0, W * 0.6, 0); lg.addColorStop(0, 'rgba(8,13,24,.92)'); lg.addColorStop(1, 'rgba(8,13,24,0)');
  c.fillStyle = lg; c.fillRect(0, 0, W, H);
  // counter
  const docd = Math.min(nVisited, walk.length);
  counter(c, `${docd} / 931`, 120, 360, 'sites documented', eOut(seg(p, 1.4, 2.2)), { size: 84 });
  txt(c, 'One inspector. One site at a time.', 120, 470, { font: F.body(500, 30), color: P.muted, alpha: eOut(seg(p, 2.0, 2.8)) });
  // clipboard document
  const t1p = lineT('problem', 1), da = Math.min(eOut(seg(p, 2.6, 3.4)), 1 - eIO(seg(p, t1p - 0.3, t1p + 0.2)));
  if (da > 0) {
    const x = 120, y = 540, w = 520, h = 300;
    c.save(); c.globalAlpha = da; c.fillStyle = P.paper; rr(c, x, y + (1 - da) * 30, w, h, 10); c.fill();
    txt(c, 'DAMAGE RECORD · SITE 3', x + 28, y + 46, { font: F.mono(500, 15), color: '#6A6E78', ls: 1.5 });
    const rows = ['Roof R-02 · covering removed', 'Roof R-02 · decking exposed', 'R-01 eave · drip edge', 'North facade · glazing', 'Interior · water damage'];
    rows.forEach((s, i) => { const q = seg(p, 3.6 + i * 1.5, 4.9 + i * 1.5); if (q <= 0) return; txt(c, typeOn(s, q), x + 28, y + 96 + i * 40, { font: F.body(500, 22), color: P.paperInk }); c.fillStyle = P.paperRule; c.fillRect(x + 28, y + 108 + i * 40, w - 56, 1); });
    c.restore();
  }
  // stamps
  const t1 = lineT('problem', 1);
  ['Slow', 'Costly', 'Where recovery stalls'].forEach((s, i) => {
    const q = seg(p, t1 + 0.15 + i * 0.75, t1 + 0.45 + i * 0.75); if (q <= 0) return;
    const sc = lerp(1.35, 1, eOut(q)); c.save(); c.globalAlpha = q; c.translate(120, 640 + i * 96); c.scale(sc, sc);
    txt(c, s, 0, 0, { font: F.disp(800, 80), stretch: 'condensed', color: i === 2 ? P.amber : P.ink }); c.restore();
  });
}
function toScreen(cam, p) { return [W / 2 + (p[0] - cam.x) * cam.z, H / 2 + (p[1] - cam.y) * cam.z]; }

/* 3. IDEA */
function railBig(c, p, o = {}) {
  const x0 = 270, dx = 276, y = o.y || 560, n = 6;
  const lineP = o.line == null ? 1 : o.line;
  c.save();
  c.strokeStyle = hexA(P.muted, .3); c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y); c.lineTo(x0 + dx * 5 * lineP, y); c.stroke();
  if (o.flow != null) { // light flowing through
    const fx = x0 + dx * 5 * o.flow; const g = c.createLinearGradient(fx - 260, 0, fx, 0); g.addColorStop(0, hexA(P.cobalt, 0)); g.addColorStop(1, P.cobalt);
    c.strokeStyle = g; c.lineWidth = 4; c.beginPath(); c.moveTo(Math.max(x0, fx - 260), y); c.lineTo(Math.min(fx, x0 + dx * 5), y); c.stroke();
  }
  STAGES.forEach((s, i) => {
    const q = eBack(clamp(seg(p, 0.15 * i, 0.15 * i + 0.6))); if (q <= 0) return;
    const x = x0 + dx * i, lit = o.lit ? o.lit(i) : 0;
    c.save(); c.translate(x, y); c.scale(q, q);
    c.fillStyle = lit ? hexA(P.cobalt, 0.18 + 0.2 * lit) : '#14203A'; c.strokeStyle = lit ? P.cobalt : hexA(P.muted, .5); c.lineWidth = 2.5;
    c.beginPath(); c.arc(0, 0, 62, 0, 7); c.fill(); c.stroke();
    icon(c, s[1], 0, 0, 52, lit ? '#DCE6FF' : P.ink, 2.6);
    c.restore();
    txt(c, s[0], x, y + 112, { font: F.disp(700, 34), stretch: 'condensed', align: 'center', alpha: clamp(q), color: P.ink, ls: .5 });
  });
  c.restore();
}
function sIdea(c, p, d) {
  bg(c);
  txt(c, 'FROM FLIGHT  →  TO FIELD  →  TO FUNDING', W / 2, 250, { font: F.mono(500, 20), align: 'center', color: P.amber, ls: 3, alpha: eOut(seg(p, 0.0, 0.6)) });
  headline(c, ['One connected workflow.'], W / 2, 360, seg(p, 0.05, 1.6), { size: 104, align: 'center' });
  railBig(c, seg(p, 0.6, 3.4) * 1.6, { line: eIO(seg(p, 0.6, 3.0)), flow: seg(p, 3.0, 6.0), lit: i => clamp((seg(p, 3.0, 6.0) * 5.6 - i)) });
}

/* 4. CAPTURE */
function sCapture(c, p, d) {
  const tB = lineT('capture', 1) - 0.2;
  if (p < tB) {
    drawWater(c);
    const cam = { x: 0, y: 25, z: 1.0 };
    drawLand(c, cam);
    // lawnmower: 3 lanes across island (map x from -880..880), y lanes
    const lanes = [-70, 15, 100], xs = [-920, 920], dur = Math.max(4.5, tB - 0.8), q = clamp((p - 0.4) / dur) * 3;
    const li = Math.min(2, Math.floor(q)), lf = q - li, dir = li % 2 === 0 ? 1 : -1;
    const dx = dir > 0 ? lerp(xs[0], xs[1], lf) : lerp(xs[1], xs[0], lf), dy = lanes[li];
    const passed = (b) => { for (let k = 0; k < 3; k++) { if (Math.abs(b.c[1] - lanes[k]) > 55) continue; if (k < li) return true; if (k === li) return dir > 0 ? b.c[0] < dx : b.c[0] > dx; } return false; };
    drawBuildings(c, cam, b => passed(b) ? mixHex('#AEB6C2', '#E2DFD6', b.r) : '#3A4860');
    const s = toScreen(cam, [dx, dy]);
    // swath
    c.save(); c.fillStyle = hexA(P.cobalt, 0.12); c.strokeStyle = hexA(P.cobalt, .6); c.lineWidth = 1.5; c.beginPath(); c.rect(s[0] - 60, s[1] - 52, 120, 104); c.fill(); c.stroke(); c.restore();
    c.save(); c.translate(s[0], s[1]); c.rotate(dir > 0 ? 0 : Math.PI); icon(c, 'drone', 0, 0, 44, P.ink, 3); c.restore();
    // labels
    const a = eOut(seg(p, 0.6, 1.4));
    chip(c, 'WIDE-AREA SWEEP', 120, 170, { dot: P.cobalt, alpha: a });
    const pct = Math.round(clamp(q / 3) * 100);
    counter(c, pct + '%', 120, 300, 'community mapped', a, { size: 72 });
  } else {
    const pp = p - tB, a = eOut(seg(pp, 0, 0.8));
    bg(c);
    // isometric facility
    const cx = 960, cy = 600;
    c.save(); c.globalAlpha = a;
    isoFacility(c, cx, cy, 1.15, { defect: 0 });
    // orbit
    const n = 18, ang = pp * 0.9;
    c.strokeStyle = hexA(P.cobalt, .35); c.lineWidth = 2; c.setLineDash([6, 8]); c.beginPath(); c.ellipse(cx, cy - 170, 520, 190, 0, 0, 7); c.stroke(); c.setLineDash([]);
    const shots = Math.floor(pp / 0.28);
    for (let k = 0; k < Math.min(shots, 40); k++) { const th = k * 0.28 * 0.9; const px = cx + Math.cos(th) * 520, py = cy - 170 + Math.sin(th) * 190; c.fillStyle = hexA(P.cobalt, .8); c.beginPath(); c.arc(px, py, 4, 0, 7); c.fill(); c.strokeStyle = hexA(P.cobalt, .18); c.lineWidth = 1; c.beginPath(); c.moveTo(px, py); c.lineTo(cx, cy - 40); c.stroke(); }
    const dxp = cx + Math.cos(ang) * 520, dyp = cy - 170 + Math.sin(ang) * 190;
    icon(c, 'drone', dxp, dyp, 46, P.ink, 3);
    c.restore();
    chip(c, 'DETAIL FLIGHT · PRIORITY FACILITY', 120, 170, { dot: P.amber, alpha: a });
    counter(c, fmtN(Math.min(shots * 5, 186)), 120, 300, 'oblique + nadir photos', a, { size: 72 });
    chip(c, 'RTK · GROUND CONTROL', 120, 400, { alpha: eOut(seg(pp, 2.2, 3.0)), bg: 'rgba(242,165,65,0.14)', color: P.amber });
  }
  railCompact(c, 0, 1);
}
/* isometric facility (hip roof) */
function iso(x, y, z, s) { return [(x - y) * 0.866 * s, (x + y) * 0.5 * s - z * s]; }
function isoFacility(c, cx, cy, s, o = {}) {
  const L = 260, Wd = 160, Hh = 70, R = 60; // half sizes, wall height, roof rise
  const P3 = (x, y, z) => { const q = iso(x, y, z, s); return [cx + q[0], cy + q[1]]; };
  const face = (pts, fill, stroke) => { c.beginPath(); pts.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.2; c.stroke(); } };
  // shadow
  face([P3(-L, -Wd, 0), P3(L, -Wd, 0), P3(L + 40, Wd + 40, 0), P3(-L + 40, Wd + 40, 0)], 'rgba(0,0,0,0.25)');
  // walls (visible: +y side and +x side)
  face([P3(-L, Wd, 0), P3(L, Wd, 0), P3(L, Wd, Hh), P3(-L, Wd, Hh)], '#3B4A63', '#4D5D78');
  face([P3(L, -Wd, 0), P3(L, Wd, 0), P3(L, Wd, Hh), P3(L, -Wd, Hh)], '#2E3B52', '#4D5D78');
  // windows
  for (let k = -3; k <= 3; k++) { const x = k * 66; face([P3(x - 18, Wd + .5, 22), P3(x + 18, Wd + .5, 22), P3(x + 18, Wd + .5, 48), P3(x - 18, Wd + .5, 48)], '#5F7FA8'); }
  // hip roof: ridge along x
  const rL = L - Wd; const e = 12;
  const A = P3(-L - e, -Wd - e, Hh), B = P3(L + e, -Wd - e, Hh), Cc = P3(L + e, Wd + e, Hh), D = P3(-L - e, Wd + e, Hh), r1 = P3(-rL, 0, Hh + R), r2 = P3(rL, 0, Hh + R);
  face([A, B, r2, r1], '#556178', '#6B7891'); // back slope
  face([B, Cc, r2], '#4A5770', '#6B7891');
  face([D, Cc, r2, r1], '#6A7891', '#8794AC'); // front slope (R-02)
  face([A, D, r1], '#5E6C86', '#7A88A2');
  // shingle lines on front slope
  c.save(); c.strokeStyle = 'rgba(20,28,44,0.25)'; c.lineWidth = 1;
  for (let k = 1; k < 9; k++) { const t = k / 9; const p1 = [lerp(D[0], r1[0], t), lerp(D[1], r1[1], t)], p2 = [lerp(Cc[0], r2[0], t), lerp(Cc[1], r2[1], t)]; c.beginPath(); c.moveTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.stroke(); }
  c.restore();
  // defect patch on front slope
  if (o.defect > 0) {
    const fp = (u, v) => { const a = [lerp(D[0], Cc[0], u), lerp(D[1], Cc[1], u)], b = [lerp(r1[0], r2[0], Math.max(0, Math.min(1, (u - 0.0)))), lerp(r1[1], r2[1], u)]; return [lerp(a[0], b[0], v), lerp(a[1], b[1], v)]; };
    const poly = [[0.38, 0.2], [0.58, 0.16], [0.66, 0.42], [0.6, 0.7], [0.44, 0.74], [0.34, 0.48]].map(q => fp(q[0], q[1]));
    c.save(); c.globalAlpha = o.defect;
    face(poly, '#C9A06A');
    c.strokeStyle = P.amber; c.lineWidth = 3; c.beginPath(); poly.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.stroke();
    if (o.pulse) { c.strokeStyle = hexA(P.amber, 0.5 * (1 - o.pulse)); c.lineWidth = 3 + 14 * o.pulse; c.stroke(); }
    c.restore();
    return { poly, center: fp(0.5, 0.45) };
  }
  return { center: [lerp(D[0], r2[0], 0.5), lerp(D[1], r2[1], 0.5)] };
}

/* 5. PROCESS */
function sProcess(c, p, d) {
  bg(c);
  // photo tiles converge into ortho
  const fx = 120, fy = 230, fw = 1180, fh = 559; // frame for ortho (1900x900 scaled)
  const gx = 6, gy = 4, tw = fw / gx, th = fh / gy;
  const conv = eIO(seg(p, 0.3, 3.6)), r = rng(5);
  const ext = seg(p, 5.0, 8.6);
  if (ext <= 0) {
    for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
      const sx0 = fx + i * tw, sy0 = fy + j * th, rx = r(), ry = r(), rr2 = r();
      const ox = lerp(sx0 + (rx - .5) * 900, sx0, conv), oy = lerp(sy0 + (ry - .5) * 700, sy0, conv), rot = lerp((rr2 - .5) * 0.6, 0, conv), sc = lerp(0.82, 1, conv);
      c.save(); c.globalAlpha = eOut(seg(p, 0.1 + (i + j) * 0.05, 0.6 + (i + j) * 0.05)); c.translate(ox + tw / 2, oy + th / 2); c.rotate(rot); c.scale(sc, sc);
      const pad = lerp(6, 0, conv);
      c.drawImage(ortho, i * (1900 / gx), j * (900 / gy), 1900 / gx, 900 / gy, -tw / 2 + pad, -th / 2 + pad, tw - pad * 2, th - pad * 2);
      if (conv < 0.98) { c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2; c.strokeRect(-tw / 2 + pad, -th / 2 + pad, tw - pad * 2, th - pad * 2); }
      c.restore();
    }
    c.strokeStyle = hexA(P.muted, .4 * conv); c.lineWidth = 1.5; c.strokeRect(fx, fy, fw, fh);
    chip(c, 'ORTHOMOSAIC', fx, fy - 56, { dot: P.cobalt, alpha: eOut(seg(p, 3.0, 3.6)) });
  } else {
    // 3D surface: oblique extrusion of the island buildings
    const a = eIO(ext), cam = { x: 0, y: 0, z: 0.66 };
    c.save(); c.translate(fx + fw / 2 - W / 2, fy + fh / 2 - H / 2 + 30);
    const tilt = lerp(1, 0.55, a), hScale = lerp(0, 1.25, a);
    c.save(); c.translate(W / 2, H / 2); c.scale(cam.z, cam.z * tilt);
    c.lineCap = 'round'; c.strokeStyle = '#2E3A4F'; c.lineWidth = 60 * MK; c.stroke(landPath); c.strokeStyle = '#3A475C'; c.lineWidth = 7 * MK; c.stroke(roadPath);
    c.restore();
    const S = (pt, z) => [W / 2 + pt[0] * cam.z, H / 2 + pt[1] * cam.z * tilt - z * hScale * cam.z * 3.0];
    for (const i of isoSorted) {
      const b = Bm[i], hz = b.ht * MK; const base = b.pts.map(q => S(q, 0)), top = b.pts.map(q => S(q, hz));
      for (let k = 0; k < 4; k++) { const k2 = (k + 1) % 4; c.fillStyle = k % 2 ? '#56647C' : '#6E7C95'; c.beginPath(); c.moveTo(base[k][0], base[k][1]); c.lineTo(base[k2][0], base[k2][1]); c.lineTo(top[k2][0], top[k2][1]); c.lineTo(top[k][0], top[k][1]); c.closePath(); c.fill(); }
      c.fillStyle = mixHex('#B9C0CB', '#E6E2D8', b.r); polyFill(c, top);
    }
    c.restore();
    chip(c, '3D SURFACE MODEL', fx, fy - 56, { dot: P.cobalt, alpha: eOut(seg(p, 5.4, 6.0)) });
  }
  // storage card
  const ca = eOut(seg(p, 0.9, 1.7)), x = 1400, y = 300, w = 400;
  c.save(); c.globalAlpha = ca; c.translate((1 - ca) * 40, 0);
  c.fillStyle = 'rgba(20,32,54,0.92)'; rr(c, x, y, w, 360, 16); c.fill(); c.strokeStyle = hexA(P.cobalt, .4); c.lineWidth = 1.5; c.stroke();
  icon(c, 'cloud', x + 50, y + 62, 46, P.cobalt, 2.6);
  txt(c, 'Secure cloud', x + 90, y + 58, { font: F.disp(700, 32), stretch: 'condensed' });
  txt(c, 'CLIENT-CONTROLLED ENVIRONMENT', x + 90, y + 84, { font: F.mono(400, 12), color: P.muted, ls: 1.2 });
  ['Checksums verified', 'Chain of custody', 'Catalogued & searchable'].forEach((s, i) => {
    const q = eOut(seg(p, 1.8 + i * 0.6, 2.3 + i * 0.6));
    c.save(); c.globalAlpha *= q;
    c.fillStyle = hexA(P.green, .16); c.beginPath(); c.arc(x + 50, y + 150 + i * 64, 16, 0, 7); c.fill();
    icon(c, 'check', x + 50, y + 150 + i * 64, 30, P.green, 3);
    txt(c, s, x + 82, y + 158 + i * 64, { font: F.body(500, 24) });
    c.restore();
  });
  c.restore();
  railCompact(c, 1, 1);
}

function facadeTile(c, x, y, w, h) {
  c.save(); c.beginPath(); c.roundRect(x, y, w, h, 8); c.clip();
  c.fillStyle = '#4A5568'; c.fillRect(x, y, w, h);
  c.fillStyle = '#3A4456'; for (let k = 0; k < h; k += 14) c.fillRect(x, y + k, w, 1);
  for (let i = 0; i < 4; i++) { const wx = x + 26 + i * (w - 52) / 4 + 6, wy = y + 70, ww = (w - 52) / 4 - 12, wh = 100;
    c.fillStyle = i === 2 ? '#2A3140' : '#6E8DB3'; c.fillRect(wx, wy, ww, wh); c.strokeStyle = '#C8CED8'; c.lineWidth = 3; c.strokeRect(wx, wy, ww, wh);
    if (i === 2) { c.strokeStyle = '#D9DEE6'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(wx + ww * 0.5, wy + wh * 0.45); [[0.1, 0.1], [0.9, 0.2], [0.2, 0.9], [0.85, 0.85], [0.5, 0.05]].forEach(q => { c.moveTo(wx + ww * 0.5, wy + wh * 0.45); c.lineTo(wx + ww * q[0], wy + wh * q[1]); }); c.stroke(); } }
  c.strokeStyle = P.grey; c.lineWidth = 2.5; c.setLineDash([7, 6]); c.strokeRect(x + 26 + 2 * (w - 52) / 4, y + 62, (w - 52) / 4, 116); c.setLineDash([]);
  c.restore();
}
/* 6. TRAIN */
function roofTile(c, x, y, w, h, seed, maskA, o = {}) {
  const r = rng(seed); c.save(); c.beginPath(); c.roundRect(x, y, w, h, 8); c.clip();
  c.fillStyle = '#3C4656'; c.fillRect(x, y, w, h);
  // roof plane with shingle rows
  const base = 0.55 + r() * 0.25; c.fillStyle = mixHex('#5E6779', '#7F889A', base); c.fillRect(x, y, w, h);
  c.strokeStyle = 'rgba(25,32,45,0.35)'; c.lineWidth = 1; for (let k = 0; k < h; k += 9) { c.beginPath(); c.moveTo(x, y + k); c.lineTo(x + w, y + k); c.stroke(); }
  // ridge
  c.strokeStyle = 'rgba(210,215,225,0.35)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, y + h * (0.25 + r() * 0.1)); c.lineTo(x + w, y + h * (0.3 + r() * 0.1)); c.stroke();
  // damage blob (exposed decking)
  const bx = x + w * (0.3 + r() * 0.3), by = y + h * (0.45 + r() * 0.2), br = Math.min(w, h) * (0.16 + r() * 0.08);
  const blob = []; for (let k = 0; k < 10; k++) { const th = k / 10 * Math.PI * 2, rr3 = br * (0.7 + r() * 0.5); blob.push([bx + Math.cos(th) * rr3 * 1.3, by + Math.sin(th) * rr3]); }
  if (!o.noDamage) { c.fillStyle = '#B58C5C'; c.beginPath(); blob.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); c.fill(); }
  // shadow look-alike for the false positive tile
  if (o.shadow) { c.fillStyle = 'rgba(10,14,22,0.55)'; c.beginPath(); c.ellipse(x + w * 0.7, y + h * 0.7, w * 0.18, h * 0.12, 0.3, 0, 7); c.fill(); }
  if (maskA > 0) {
    c.save(); c.globalAlpha *= maskA;
    c.fillStyle = hexA(o.maskColor || P.amber, 0.45); c.strokeStyle = o.maskColor || P.amber; c.lineWidth = 2.5;
    if (o.shadow) { c.beginPath(); c.ellipse(x + w * 0.7, y + h * 0.7, w * 0.2, h * 0.14, 0.3, 0, 7); }
    else { c.beginPath(); blob.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])); c.closePath(); }
    c.fill(); c.stroke(); c.restore();
  }
  c.restore();
  c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; rr(c, x, y, w, h, 8); c.stroke();
}
function sTrain(c, p, d) {
  bg(c);
  const t1 = lineT('train', 1), t2 = lineT('train', 2), t3 = lineT('train', 3);
  // headline
  const ha = 1 - eIO(seg(p, t1 - 0.4, t1 + 0.2));
  if (ha > 0) { c.save(); c.globalAlpha = ha; headline(c, ['Models learn', 'from experts.'], 120, 360, seg(p, 0.1, 2.0), { size: 112 }); c.restore(); }
  // dataset mosaic
  const dA = Math.min(eOut(seg(p, 0.4, 1.4)), 1 - eIO(seg(p, t2 - 0.3, t2 + 0.3)));
  if (dA > 0) {
    c.save(); c.globalAlpha = dA;
    const fill = eOut(seg(p, 0.4, t1 + 4.2)), cols = 90, rows = 34, cs = 12, ox = 860, oy = 250, r = rng(11);
    const n = Math.floor(cols * rows * fill);
    for (let k = 0; k < cols * rows; k++) { const v = r(), j = v < 0.55 ? 0 : v < 0.8 ? 1 : v < 0.9 ? 2 : v < 0.97 ? 3 : 4; if (k >= n) continue; c.fillStyle = P.jds[j]; c.globalAlpha = dA * (0.55 + 0.45 * r()); c.fillRect(ox + (k % cols) * cs, oy + Math.floor(k / cols) * cs, cs - 3, cs - 3); }
    c.globalAlpha = dA;
    const ca = eOut(seg(p, t1 - 0.2, t1 + 0.4));
    counter(c, fmtN(21716 * eOut(seg(p, t1 + 0.2, t1 + 3.6))), 120, 420, 'labelled buildings from 10 disasters', ca, { size: 110 });
    chip(c, 'OPEN DATASET · CRASAR, TEXAS A&M', 120, 520, { dot: P.green, alpha: ca });
    c.restore();
  }
  // labeling UI
  const uA = Math.min(eOut(seg(p, t2 - 0.2, t2 + 0.5)), 1 - eIO(seg(p, d - 0.5, d)));
  if (uA > 0) {
    c.save(); c.globalAlpha = uA;
    const shrink = eIO(seg(p, t3 + 3.1, t3 + 4.2));
    const gx0 = lerp(120, 120, shrink), gy0 = 290, tw = lerp(250, 168, shrink), thh = lerp(180, 122, shrink), gap = 18;
    // prompt bar
    const bx = 120, by = 180, bw = lerp(1060, 720, shrink);
    c.fillStyle = 'rgba(20,32,54,0.95)'; rr(c, bx, by, bw, 64, 32); c.fill(); c.strokeStyle = hexA(P.cobalt, .5); c.lineWidth = 1.5; c.stroke();
    txt(c, 'ROBOFLOW · AUTO LABEL', bx + 28, by + 40, { font: F.mono(500, 15), color: P.cobalt, ls: 1.5 });
    const prompt = '"missing roof covering"', tp = seg(p, t2 + 0.3, t2 + 1.6);
    txt(c, typeOn(prompt, tp) + ((Math.floor(p * 2) % 2 && tp < 1) ? '|' : ''), bx + 270, by + 42, { font: F.body(500, 26) });
    // tiles
    const maskStart = t2 + 1.8;
    for (let k = 0; k < 8; k++) {
      const i = k % 4, j = Math.floor(k / 4), x = gx0 + i * (tw + gap), y = gy0 + j * (thh + gap);
      const ma = eOut(seg(p, maskStart + k * 0.12, maskStart + 0.5 + k * 0.12));
      const isFP = k === 6; // false positive on a shadow
      const rej = isFP ? seg(p, t3 + 1.0, t3 + 1.6) : 0;
      roofTile(c, x, y, tw, thh, 100 + k, isFP ? ma * (1 - rej) : ma, { shadow: isFP, noDamage: isFP, maskColor: isFP && rej > 0 ? P.red : P.amber });
      if (isFP && p > t3 + 0.2) { // expert cursor
        const q = eIO(seg(p, t3 + 0.2, t3 + 1.0)), cx = lerp(x + tw + 140, x + tw * 0.7, q), cy = lerp(y + thh + 90, y + thh * 0.7, q);
        if (p < t3 + 2.4) { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 18, cy + 26); c.lineTo(cx + 8, cy + 24); c.lineTo(cx + 4, cy + 34); c.closePath(); c.fill(); }
        if (rej > 0) chip(c, 'SHADOW · REMOVED', x + 8, y + 8, { alpha: Math.min(rej, 1 - seg(p, t3 + 3.0, t3 + 3.4)), bg: 'rgba(229,84,74,0.9)', font: F.mono(500, 12), h: 28 });
      }
      if (!isFP && ma > 0.9 && p > t3 + 1.6) { const q = eOut(seg(p, t3 + 1.6 + k * 0.08, t3 + 2.0 + k * 0.08)); c.save(); c.globalAlpha *= q; c.fillStyle = P.green; c.beginPath(); c.arc(x + tw - 20, y + 20, 13, 0, 7); c.fill(); icon(c, 'check', x + tw - 20, y + 20, 22, '#0B1322', 3.4); c.restore(); }
    }
    // agent panel
    const ax = 1240, ay = 180, aA = eOut(seg(p, t2 + 2.6, t2 + 3.3)) * (1 - shrink);
    if (aA > 0) {
      c.save(); c.globalAlpha *= aA;
      c.fillStyle = 'rgba(20,32,54,0.95)'; rr(c, ax, ay, 560, 330, 16); c.fill(); c.strokeStyle = hexA(P.cobalt, .4); c.lineWidth = 1.5; c.stroke();
      txt(c, 'AI AGENT', ax + 30, ay + 46, { font: F.mono(500, 15), color: P.cobalt, ls: 2 });
      txt(c, 'Label new storm imagery', ax + 30, ay + 88, { font: F.disp(700, 32), stretch: 'condensed' });
      ['Pull new flight imagery', 'Run Auto Label', 'Queue for expert review'].forEach((s, i) => {
        const st = t2 + 3.4 + i * 0.7, q = seg(p, st, st + 0.6), done = p > st + 0.6;
        c.save(); c.globalAlpha *= eOut(seg(p, st - 0.3, st));
        if (done) { c.fillStyle = hexA(P.green, .18); c.beginPath(); c.arc(ax + 46, ay + 142 + i * 56, 14, 0, 7); c.fill(); icon(c, 'check', ax + 46, ay + 142 + i * 56, 24, P.green, 3); }
        else { c.strokeStyle = P.cobalt; c.lineWidth = 3; c.beginPath(); c.arc(ax + 46, ay + 142 + i * 56, 11, p * 6, p * 6 + 4.2); c.stroke(); }
        txt(c, s, ax + 76, ay + 150 + i * 56, { font: F.body(500, 23), color: done ? P.ink : P.muted });
        c.restore();
      });
      c.restore();
    }
    // two model cards
    const mA = eOut(seg(p, t3 + 3.6, t3 + 4.6));
    if (mA > 0) {
      [['MODEL A', 'Community sweep', 'Building damage level'], ['MODEL B', 'Facility detail', 'Roof & structure defects']].forEach((m, i) => {
        const x = 920 + i * 470, y = 300; c.save(); c.globalAlpha *= mA; c.translate(0, (1 - mA) * 30);
        c.fillStyle = 'rgba(20,32,54,0.95)'; rr(c, x, y, 440, 360, 16); c.fill(); c.strokeStyle = hexA(i ? P.amber : P.cobalt, .5); c.lineWidth = 1.5; c.stroke();
        txt(c, m[0], x + 30, y + 46, { font: F.mono(500, 15), color: i ? P.amber : P.cobalt, ls: 2 });
        txt(c, m[1], x + 30, y + 92, { font: F.disp(700, 38), stretch: 'condensed' });
        txt(c, m[2], x + 30, y + 126, { font: F.body(400, 22), color: P.muted });
        // training curve
        const cx0 = x + 30, cy0 = y + 320, cw = 380, chh = 150, q = seg(p, t3 + 4.0 + i * 0.3, t3 + 6.3 + i * 0.3);
        c.strokeStyle = hexA(P.muted, .25); c.lineWidth = 1; c.beginPath(); c.moveTo(cx0, cy0); c.lineTo(cx0 + cw, cy0); c.moveTo(cx0, cy0); c.lineTo(cx0, cy0 - chh); c.stroke();
        c.strokeStyle = i ? P.amber : P.cobalt; c.lineWidth = 3.5; c.beginPath();
        const N = Math.floor(80 * q); for (let k = 0; k <= N; k++) { const u = k / 80, v = 1 - Math.exp(-u * 4.2) + Math.sin(k * 1.7 + i) * 0.015 * (1 - u); const px = cx0 + u * cw, py = cy0 - v * chh * 0.92; k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke();
        txt(c, 'TRAINING', cx0, cy0 + 26, { font: F.mono(400, 12), color: P.faint, ls: 1.5 });
        c.restore();
      });
    }
    c.restore();
  }
  railCompact(c, 2, 1);
}

/* 7. DETECT */
function sDetect(c, p, d) {
  drawWater(c);
  const t1 = lineT('detect', 1), t2 = lineT('detect', 2);
  const z = eIO(seg(p, t1 + 0.2, t1 + 3.0));
  const xs = ROUTE.map(q => q[0]).concat([FACm[0]]), ys = ROUTE.map(q => q[1]).concat([FACm[1]]);
  const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
  const ZZ = Math.min(2.1, 1150 / (bx1 - bx0 + 160), 640 / (by1 - by0 + 120));
  const cam = { x: lerp(20, (bx0 + bx1) / 2 - 90 / ZZ, z), y: lerp(-40, (by0 + by1) / 2 + 10 / ZZ, z), z: lerp(1.0, ZZ, z) };
  drawLand(c, cam);
  const scanX = lerp(-980, 980, eIO(seg(p, 0.3, 4.6)));
  drawBuildings(c, cam, b => b.c[0] < scanX ? P.jds[b.jds] : '#3A4860');
  // roads status after scan
  c.save(); camSet(c, cam); c.lineCap = 'round';
  c.strokeStyle = hexA(P.amber, 0.55); c.lineWidth = 3 / cam.z;
  SLOW.forEach(l => { if (l[0][0] > scanX) return; c.beginPath(); c.moveTo(l[0][0], l[0][1]); l.forEach(q => c.lineTo(q[0], q[1])); c.stroke(); });
  c.strokeStyle = P.red; c.lineWidth = 5 / cam.z;
  BLOCK.forEach(l => { if (l[0][0] > scanX) return; c.beginPath(); c.moveTo(l[0][0], l[0][1]); l.forEach(q => c.lineTo(q[0], q[1])); c.stroke(); });
  c.restore();
  // scan line
  if (p < 5) { const sx = toScreen(cam, [scanX, 0])[0]; const g = c.createLinearGradient(sx - 120, 0, sx, 0); g.addColorStop(0, hexA(P.cobalt, 0)); g.addColorStop(1, hexA(P.cobalt, .35)); c.fillStyle = g; c.fillRect(sx - 120, 0, 120, H); c.fillStyle = P.cobalt; c.fillRect(sx - 1, 0, 2, H); }
  // route
  const rp = eIO(seg(p, t1 + 2.6, t1 + 5.6));
  if (rp > 0) {
    drawRoute(c, cam, rp, p);
    const s0 = toScreen(cam, STG), sf = toScreen(cam, FACm);
    c.fillStyle = P.ink; c.beginPath(); c.arc(s0[0], s0[1], 10, 0, 7); c.fill();
    if (rp >= 1) {
      const end = toScreen(cam, ROUTE[ROUTE.length - 1]);
      c.strokeStyle = P.red; c.lineWidth = 4; c.setLineDash([8, 8]); c.beginPath(); c.moveTo(end[0], end[1]); c.lineTo(sf[0], sf[1]); c.stroke(); c.setLineDash([]);
      const q = eBack(seg(p, t1 + 5.6, t1 + 6.2));
      c.save(); c.translate(sf[0], sf[1] - 10); c.scale(q, q); icon(c, 'pin', 0, -18, 40, P.amber); c.restore();
      chip(c, 'COMMUNITY CENTER · LAST 58 M BLOCKED', sf[0] - 190, sf[1] - 104, { alpha: q, bg: 'rgba(20,30,50,0.92)', font: F.mono(500, 14), h: 34, border: hexA(P.amber, .6) });
    }
  }
  // stats panel
  const sa = eOut(seg(p, 1.2, 2.0));
  c.save(); c.globalAlpha = sa; const gx = 96, gy = 160;
  const grd = c.createLinearGradient(0, 0, 640, 0); grd.addColorStop(0, 'rgba(8,13,24,0.88)'); grd.addColorStop(1, 'rgba(8,13,24,0)'); c.fillStyle = grd; c.fillRect(0, 0, 700, H);
  const k = eOut(seg(p, 1.2, 4.8));
  counter(c, fmtN(931 * k), gx, gy + 100, 'buildings rated', 1, { size: 76 });
  counter(c, fmtN(104 * k), gx, gy + 230, 'major damage or destroyed', 1, { size: 76, color: P.jds[2] });
  counter(c, fmtN(82 * k), gx, gy + 360, 'roads impassable', 1, { size: 76, color: P.red });
  c.restore();
  // real data badge
  chip(c, 'REAL LABELS · CRASAR-U-DROIDs · HURRICANE IAN', 96, 880, { alpha: eOut(seg(p, t2 - 0.2, t2 + 0.5)), dot: P.green, bg: 'rgba(20,30,50,0.92)' });
  railCompact(c, 3, 1);
}

/* 8. LOCATE */
function sLocate(c, p, d) {
  bg(c);
  const cx = 1000, cy = 640, s = 1.25;
  const da = eOut(seg(p, 0.6, 1.4));
  const res = isoFacility(c, cx, cy, s, { defect: da, pulse: seg(p, 1.4, 2.6) < 1 ? seg(p, 1.4, 2.6) : 0 });
  const ctr = res.center;
  // camera rays
  const cams = [[560, 210], [820, 140], [1120, 130], [1400, 200], [1600, 330]];
  cams.forEach((q, i) => {
    const st = 1.6 + i * 0.35, a = eOut(seg(p, st, st + 0.4)), rp = eIO(seg(p, st + 0.1, st + 0.8));
    if (a <= 0) return;
    c.save(); c.globalAlpha = a;
    c.strokeStyle = hexA(P.cobalt, .7); c.lineWidth = 2; c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(lerp(q[0], ctr[0], rp), lerp(q[1], ctr[1], rp)); c.stroke();
    c.translate(q[0], q[1]); c.rotate(Math.atan2(ctr[1] - q[1], ctr[0] - q[0])); icon(c, 'cam', 0, 0, 40, P.ink); c.restore();
  });
  if (p > 3.7) { const q = eBack(seg(p, 3.7, 4.2)); c.save(); c.translate(ctr[0], ctr[1]); c.scale(q, q); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 18, 0, 7); c.stroke(); c.restore(); }
  // callouts
  const ma = eOut(seg(p, 4.4, 5.2)), la = eOut(seg(p, 5.4, 6.2));
  c.save(); c.globalAlpha = ma;
  counter(c, '1,280 sq ft', 120, 330, 'exposed decking · ± 90 sq ft', 1, { size: 80, color: P.amber });
  c.restore();
  c.save(); c.globalAlpha = la;
  counter(c, '± 0.6 m', 120, 500, 'location · verified against ground control', 1, { size: 80 });
  c.restore();
  c.save(); c.globalAlpha = eOut(seg(p, 6.2, 7.0));
  counter(c, '7 views', 120, 670, 'independent photos confirm it', 1, { size: 80, color: P.cobalt });
  c.restore();
  txt(c, 'ILLUSTRATIVE FACILITY', W - 96, 1000 - 0, { font: F.mono(400, 13), align: 'right', color: P.faint, ls: 1.5, alpha: 0.9 });
  railCompact(c, 3, 1);
}

/* 9. REVIEW */
function sReview(c, p, d) {
  bg(c);
  const t1 = lineT('review', 1);
  const cards = [['Exposed decking', '1,280 sq ft', 'CONFIRMED', P.green, 2.4], ['Shadow on roof', 'false detection', 'REJECTED', P.red, 3.4], ['Broken window', 'one oblique view', 'FIELD CHECK', P.grey, 4.6]];
  cards.forEach((cd, i) => {
    const x = 330 + i * 440, y = 330, w = 400, h = 440, a = eOut(seg(p, 0.3 + i * 0.15, 0.9 + i * 0.15));
    c.save(); c.globalAlpha = a; c.translate(0, (1 - a) * 40);
    c.fillStyle = 'rgba(20,32,54,0.95)'; rr(c, x, y, w, h, 18); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.08)'; c.lineWidth = 1; c.stroke();
    if (i === 2) facadeTile(c, x + 20, y + 20, w - 40, 240);
    else roofTile(c, x + 20, y + 20, w - 40, 240, [104, 106, 103][i], 0.9, { shadow: i === 1, noDamage: i === 1, maskColor: i === 1 ? P.red : P.amber });
    txt(c, cd[0], x + 26, y + 312, { font: F.disp(700, 34), stretch: 'condensed' });
    txt(c, cd[1], x + 26, y + 346, { font: F.body(400, 22), color: P.muted });
    // stamp
    const q = seg(p, cd[4], cd[4] + 0.3);
    if (q > 0) {
      const sc = lerp(1.6, 1, eOut(q)); c.save(); c.globalAlpha *= q; c.translate(x + w / 2, y + 400); c.scale(sc, sc);
      c.fillStyle = hexA(cd[3], 0.16); rr(c, -150, -30, 300, 54, 27); c.fill(); c.strokeStyle = cd[3]; c.lineWidth = 2.5; c.stroke();
      txt(c, cd[2], 0, 6, { font: F.mono(500, 20), align: 'center', color: cd[3], ls: 3 }); c.restore();
    }
    c.restore();
  });
  // feedback arc to the Train node on the rail
  const fq = eIO(seg(p, t1 - 0.2, t1 + 1.6));
  if (fq > 0) {
    const from = [530, 320], to = [96 + 148 * 2, 100];
    c.save(); c.strokeStyle = hexA(P.green, .8); c.lineWidth = 3; c.setLineDash([10, 10]); c.lineDashOffset = -p * 40;
    c.beginPath(); const N = 60; for (let k = 0; k <= N * fq; k++) { const u = k / N; const px = lerp(from[0], to[0], u), py = lerp(from[1], to[1], u) - Math.sin(u * Math.PI) * 120; k ? c.lineTo(px, py) : c.moveTo(px, py); } c.stroke(); c.setLineDash([]);
    c.restore();
    txt(c, 'Every correction retrains the model', 560, 300, { font: F.body(500, 26), color: P.green, alpha: eOut(seg(p, t1 + 0.6, t1 + 1.3)) });
  }
  railCompact(c, 4, 1, 2, fq >= 1 ? 0.5 + 0.5 * Math.sin((p - t1 - 1.6) * 6) : 0);
}

/* 10. DELIVER */
function sDeliver(c, p, d) {
  bg(c);
  const t1 = lineT('deliver', 1);
  const pack = eIO(seg(p, t1 + 0.1, t1 + 1.6));
  // document
  const dx = lerp(260, 300, pack), dy = lerp(170, 300, pack), sc = lerp(1, 0.5, pack);
  c.save(); c.translate(dx, dy); c.scale(sc, sc);
  const da = eOut(seg(p, 0.2, 0.9));
  c.globalAlpha = da;
  c.fillStyle = P.paper; rr(c, 0, 0, 900, 720, 12); c.fill();
  txt(c, 'DRAFT FOR INSPECTOR VERIFICATION', 56, 66, { font: F.mono(500, 15), color: '#7A7466', ls: 1.6 });
  txt(c, 'Damage Description', 56, 132, { font: F.disp(800, 60), stretch: 'condensed', color: P.paperInk });
  txt(c, 'and Dimensions', 56, 192, { font: F.disp(800, 60), stretch: 'condensed', color: P.paperInk });
  txt(c, 'Community Center · Site 3', 56, 236, { font: F.body(500, 24), color: '#5A6070' });
  const rows = [['Roof R-02', 'Covering removed', '2,450', 'SF'], ['Roof R-02', 'Decking exposed', '1,280', 'SF'], ['R-01 eave', 'Drip edge displaced', '180', 'LF'], ['Interior', 'Water damage', 'field', '']];
  c.fillStyle = P.paperInk; c.fillRect(56, 278, 788, 2);
  ['COMPONENT', 'DAMAGE', 'QTY'].forEach((h, i) => txt(c, h, [56, 300, 760][i], 268, { font: F.mono(500, 14), color: '#7A7466', ls: 1.4, align: i === 2 ? 'right' : 'left' }));
  rows.forEach((r, i) => {
    const q = eOut(seg(p, 1.2 + i * 0.6, 1.8 + i * 0.6)); if (q <= 0) return;
    const y = 330 + i * 70, ox = (1 - q) * 300;
    c.save(); c.globalAlpha *= q; c.translate(ox, 0);
    txt(c, r[0], 56, y, { font: F.body(600, 26), color: P.paperInk });
    txt(c, r[1], 300, y, { font: F.body(400, 26), color: P.paperInk });
    txt(c, r[2] + (r[3] ? ' ' + r[3] : ''), 844, y, { font: F.mono(500, 26), color: r[2] === 'field' ? '#9A5B00' : P.paperInk, align: 'right' });
    c.restore(); c.fillStyle = P.paperRule; c.fillRect(56, y + 22, 788 * q, 1);
  });
  const vq = eOut(seg(p, 4.4, 5.0));
  if (vq > 0) { c.save(); c.globalAlpha *= vq; c.fillStyle = 'rgba(31,122,77,0.12)'; rr(c, 56, 620, 420, 56, 28); c.fill(); icon(c, 'check', 90, 648, 30, '#1F7A4D', 3.4); txt(c, 'Verified by site inspector', 120, 657, { font: F.body(600, 24), color: '#1F7A4D' }); c.restore(); }
  c.restore();
  // right side: package
  const items = [['Damage maps', 'layers'], ['Measurements', 'detect'], ['Imagery', 'cam'], ['Evidence trail', 'deliver']];
  items.forEach((it, i) => {
    const q = eOut(seg(p, t1 + 0.9 + i * 0.35, t1 + 1.5 + i * 0.35)); if (q <= 0) return;
    const x = 900 + (i % 2) * 330, y = 300 + Math.floor(i / 2) * 200;
    c.save(); c.globalAlpha = q; c.translate(0, (1 - q) * 30);
    c.fillStyle = 'rgba(20,32,54,0.95)'; rr(c, x, y, 300, 170, 16); c.fill(); c.strokeStyle = hexA(P.cobalt, .35); c.lineWidth = 1.5; c.stroke();
    icon(c, it[1], x + 56, y + 62, 46, P.cobalt, 2.6);
    txt(c, it[0], x + 30, y + 140, { font: F.disp(700, 32), stretch: 'condensed' });
    c.restore();
  });
  const aq = eOut(seg(p, t1 + 2.8, t1 + 3.6));
  if (aq > 0) {
    c.save(); c.globalAlpha = aq;
    c.strokeStyle = P.amber; c.lineWidth = 3; c.beginPath(); c.moveTo(1560, 485); c.lineTo(1560 + 120 * aq, 485); c.stroke();
    c.fillStyle = P.amber; c.beginPath(); c.moveTo(1690, 485); c.lineTo(1676, 476); c.lineTo(1676, 494); c.fill();
    txt(c, 'Applicant', 1710, 476, { font: F.disp(700, 34), stretch: 'condensed' });
    txt(c, '& FEMA', 1710, 512, { font: F.disp(700, 34), stretch: 'condensed', color: P.muted });
    chip(c, 'CLIENT DELIVERY', 900, 230, { dot: P.amber });
    c.restore();
  }
  railCompact(c, 5, 1);
}

/* 11. CLOSE */
function sClose(c, p, d) {
  bg(c);
  const t1 = lineT('close', 1);
  railBig(c, 2, { y: 640, line: 1, flow: (p * 0.35) % 1.3, lit: () => 1 });
  const ha = 1 - eIO(seg(p, t1 - 0.3, t1 + 0.1));
  if (ha > 0) { c.save(); c.globalAlpha = ha; headline(c, ['From flight, to field, to funding.'], W / 2, 330, seg(p, 0.3, 2.2), { size: 100, align: 'center' }); c.restore(); }
  if (p > t1 - 0.1) {
    const fa = 1 - eIO(seg(p, d - 3.6, d - 2.8));
    c.save(); c.globalAlpha = fa;
    headline(c, ['The pieces exist today.', 'Connecting them is the opportunity.'], W / 2, 290, seg(p, t1 - 0.1, t1 + 2.6), { size: 92, align: 'center', colors: [P.ink, P.amber], stagger: 0.07 });
    c.restore();
  }
  // end card
  const ea = eOut(seg(p, d - 3.0, d - 2.2));
  if (ea > 0) {
    c.save(); c.globalAlpha = ea; c.fillStyle = P.bg; c.fillRect(0, 0, W, H); bg(c, 1);
    txt(c, 'SORTIE', W / 2, 560, { font: F.disp(800, 180), stretch: 'condensed', align: 'center', ls: 18 });
    txt(c, 'FLIGHT-TO-FIELD DISASTER RECOVERY · CONCEPT', W / 2, 630, { font: F.mono(500, 20), align: 'center', color: P.amber, ls: 4 });
    txt(c, 'Sweep data: CRASAR-U-DROIDs, Texas A&M (CC BY 4.0). Facility details illustrative.', W / 2, 960, { font: F.body(400, 18), align: 'center', color: P.faint });
    c.restore();
  }
  const fo = seg(p, d - 0.6, d); if (fo > 0) { c.fillStyle = `rgba(0,0,0,${fo})`; c.fillRect(0, 0, W, H); }
}

const FN = { open: sOpen, problem: sProblem, idea: sIdea, capture: sCapture, process: sProcess, train: sTrain, detect: sDetect, locate: sLocate, review: sReview, deliver: sDeliver, close: sClose };
const XF = 0.6; // crossfade seconds
function drawScene(ctx, id, t) { const s = SC[id]; ctx.save(); FN[id](ctx, t - s.start, s.end - s.start); ctx.restore(); }
const grain = document.createElement('canvas'); grain.width = 512; grain.height = 512;
(() => { const g = grain.getContext('2d'), im = g.createImageData(512, 512), r = rng(42); for (let i = 0; i < im.data.length; i += 4) { const v = Math.floor(r() * 255); im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; } g.putImageData(im, 0, 0); })();
function filmGrain(c, t) { const f = Math.floor(t * 30), ox = (f * 137) % 512, oy = (f * 251) % 512; c.save(); c.globalAlpha = 0.035; c.globalCompositeOperation = 'overlay'; for (let y = -oy; y < H; y += 512) for (let x = -ox; x < W; x += 512) c.drawImage(grain, x, y); c.restore(); }
function vignette(c) { const g = c.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, H * 1.05); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.42)'); c.fillStyle = g; c.fillRect(0, 0, W, H); }
window.drawFrame = function (t) {
  X.setTransform(1, 0, 0, 1, 0, 0); X.globalAlpha = 1; X.fillStyle = P.bg; X.fillRect(0, 0, W, H);
  const i = TL.scenes.findIndex(s => t >= s.start && t < s.end); const idx = i < 0 ? TL.scenes.length - 1 : i;
  const cur = TL.scenes[idx];
  drawScene(X, cur.id, t);
  const next = TL.scenes[idx + 1];
  if (next && t > next.start - XF) {
    const a = eIO(seg(t, next.start - XF, next.start));
    OX.setTransform(1, 0, 0, 1, 0, 0); OX.globalAlpha = 1; OX.clearRect(0, 0, W, H);
    drawScene(OX, next.id, Math.max(t, next.start));
    X.save(); X.globalAlpha = a; X.drawImage(off, 0, 0); X.restore();
  }
  vignette(X);
  filmGrain(X, t);
  captions(X, t);
};
window.initExplainer = init;
