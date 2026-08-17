// world.js — level data, camera, tilemap collision, painterly environment rendering.
// Collision remains simple AABB; all the organic-looking art is drawn on top
// of (and slightly beyond) those boxes so the player never sees a raw rectangle.

const TILE = CONFIG.tile;

// ---------------------------------------------------------------------------
// Level layout — "The Forest": a short, intentional vertical journey.
// Beats (bottom to top): calm start -> easy movement -> first jump ->
// climb sequence -> committed gap jump -> optional side collectible ->
// safe hazard intro -> rest area -> environmental reveal (broken bridge) ->
// final traversal -> ruin doorway (endpoint).
// ---------------------------------------------------------------------------

const LEVEL = {
  widthTiles: 26,
  heightTiles: 118,
  spawn: { x: 4 * TILE, y: 113 * TILE },
  checkpoint: { x: 10 * TILE, y: 70 * TILE }, // quiet resting area, mid-level
  endpoint: { x: 10 * TILE, y: 6 * TILE },     // ruin doorway
  // Top surface of the starting ground platform (see platforms[0] below).
  // Falling below this by more than a small margin means Wisp has gone
  // off the bottom of the world entirely, so the whole level restarts
  // rather than just respawning at the last checkpoint.
  groundLevelY: 115 * TILE,

  // platform kinds affect only the decorative silhouette, not collision:
  // 'ledge' rocky ledge, 'root' root/log shelf, 'ruin' broken stone, 'bridge' wooden planks
  platforms: [
    // 1. calm starting area — flat, safe
    { x: 0, y: 115, w: 11, kind: 'ledge' },
    // 2. easy introductory movement — small readable steps
    { x: 12, y: 113, w: 4, kind: 'ledge' },
    { x: 17, y: 111, w: 4, kind: 'root' },
    // 3. one simple first jump
    { x: 13, y: 107, w: 4, kind: 'ledge' },
    // short climbable wall segment (introduces climbing in a safe area)
    { x: 8, y: 100, w: 3, kind: 'ruin', wall: true },
    { x: 6, y: 95, w: 5, kind: 'ledge' },
    // 4. short upward climbing sequence among broken ruin fragments
    { x: 12, y: 90, w: 4, kind: 'ruin' },
    { x: 17, y: 85, w: 4, kind: 'ruin' },
    { x: 12, y: 80, w: 4, kind: 'root', wall: true },
    { x: 8, y: 75, w: 5, kind: 'ledge' },
    // rest area / checkpoint — quiet, wide, safe
    { x: 6, y: 70, w: 8, kind: 'ledge', checkpoint: true },
    // 5. safe hazard introduction — hazard sits on a wide safe platform
    { x: 6, y: 65, w: 8, kind: 'root', hazard: 'bramble', hazardX: 11 },
    // 6. wider gap requiring a committed jump
    { x: 18, y: 61, w: 4, kind: 'ruin' },
    // optional collectible ledge slightly off the main route (dead end above)
    { x: 22, y: 54, w: 3, kind: 'ledge', optional: true },
    // main route continues
    { x: 12, y: 55, w: 4, kind: 'root' },
    { x: 6, y: 50, w: 5, kind: 'ledge', hazard: 'spikes', hazardX: 8 },
    { x: 10, y: 44, w: 3, kind: 'ruin', wall: true },
    // 7. environmental reveal — broken bridge across a wide chasm
    { x: 5, y: 38, w: 14, kind: 'bridge' },
    // 8. final traversal — staggered ruin fragments climbing to the doorway
    { x: 16, y: 32, w: 4, kind: 'ruin' },
    { x: 10, y: 27, w: 4, kind: 'ruin' },
    { x: 15, y: 21, w: 3, kind: 'ruin', wall: true },
    { x: 10, y: 15, w: 5, kind: 'ledge' },
    // endpoint platform before the doorway
    { x: 7, y: 8, w: 8, kind: 'ruin' },
  ],

  lights: [
    { x: 14 * TILE, y: 112 * TILE },
    { x: 19 * TILE, y: 110 * TILE },
    { x: 9 * TILE, y: 99 * TILE },
    { x: 14 * TILE, y: 89 * TILE },
    { x: 19 * TILE, y: 84 * TILE },
    { x: 9 * TILE, y: 74 * TILE },
    { x: 23.5 * TILE, y: 53 * TILE }, // optional, off-route
    { x: 13 * TILE, y: 54 * TILE },
    { x: 8 * TILE, y: 49 * TILE },
    { x: 11 * TILE, y: 37 * TILE },   // on the bridge — encourages pause to look
    { x: 17 * TILE, y: 31 * TILE },
    { x: 11 * TILE, y: 14 * TILE },
    { x: 9 * TILE, y: 7 * TILE },
  ],

  enemies: [
    { type: 'walker', x: 14 * TILE, y: 112 * TILE },
    { type: 'walker', x: 13 * TILE, y: 79 * TILE },
  ],
};

function buildSolids(level) {
  return level.platforms.map(p => ({
    x: p.x * TILE,
    y: p.y * TILE,
    w: p.w * TILE,
    h: TILE * 0.55,
    wall: !!p.wall,
    dropThrough: p.kind === 'bridge', // bridges are the drop-through type in this level
    kind: p.kind,
    hazard: p.hazard,
    hazardX: p.hazardX != null ? p.hazardX * TILE : null,
    checkpoint: !!p.checkpoint,
    optional: !!p.optional,
    seed: (p.x * 31 + p.y * 17) % 1000, // stable per-platform seed for decoration
  }));
}

// ---------------------------------------------------------------------------
// Camera — portrait, gentle follow with directional look-ahead.
// Reveals more space below while falling, more above while rising, without
// rigidly centering the player. Small landing kick, no shake.
// ---------------------------------------------------------------------------

class Camera {
  constructor(viewW, viewH, worldW, worldH) {
    this.x = 0;
    this.y = 0;
    this.viewW = viewW;
    this.viewH = viewH;
    this.worldW = worldW;
    this.worldH = worldH;
    this.zoom = 1;
    this.lookAheadX = 0;
    this.lookAheadY = 0;
    this.landingKick = 0;
  }

  resize(viewW, viewH) {
    this.viewW = viewW;
    this.viewH = viewH;
  }

  notifyLanding() {
    this.landingKick = CONFIG.camera.landingKickPx;
  }

  follow(targetX, targetY, vx, vy, dt) {
    const C = CONFIG.camera;

    // directional look-ahead eases toward facing/movement direction
    const targetLookX = Math.sign(vx) * (Math.abs(vx) > 20 ? C.lookAheadX : 0);
    this.lookAheadX += (targetLookX - this.lookAheadX) * Math.min(1, C.lookAheadLerp * dt * 60);

    // vertical bias: show more space below while falling, more above while rising
    const fallingBias = vy > 40 ? C.verticalBiasFall : vy < -40 ? C.verticalBiasRise : 0.5;
    this._verticalBias = (this._verticalBias == null ? 0.5 : this._verticalBias) + (fallingBias - (this._verticalBias == null ? 0.5 : this._verticalBias)) * Math.min(1, 0.01 * dt * 60);

    const desiredX = targetX + this.lookAheadX - this.viewW / (2 * this.zoom);
    const desiredY = targetY - this.viewH * this._verticalBias / this.zoom;

    const lerp = 1 - Math.pow(0.0025, dt);
    this.x += (desiredX - this.x) * lerp;
    this.y += (desiredY - this.y) * lerp;

    this.x = Math.max(0, Math.min(this.x, Math.max(0, this.worldW - this.viewW / this.zoom)));
    this.y = Math.max(-200, Math.min(this.y, Math.max(0, this.worldH - this.viewH / this.zoom)));

    if (this.landingKick > 0) {
      this.landingKick *= Math.max(0, 1 - dt * 10);
      if (this.landingKick < 0.05) this.landingKick = 0;
    }
  }

  get renderY() { return this.y + this.landingKick; }
}

// ---------------------------------------------------------------------------
// Atmosphere: fog layers, drifting particles, light rays, leaves.
// Kept sparse and slow per art direction — calm, not busy.
// ---------------------------------------------------------------------------

class Atmosphere {
  constructor() {
    this.particles = [];
    const n = CONFIG.atmosphere.farParticleCount;
    for (let i = 0; i < n; i++) {
      this.particles.push({
        x: Math.random(),
        y: Math.random(),
        layer: Math.random(),
        speed: 0.006 + Math.random() * 0.012,
        drift: (Math.random() - 0.5) * 0.003,
        size: 1 + Math.random() * 2,
      });
    }
    this.leaves = [];
    for (let i = 0; i < CONFIG.atmosphere.leafCount; i++) {
      this.leaves.push({
        x: Math.random(),
        y: Math.random(),
        speed: 0.02 + Math.random() * 0.02,
        sway: Math.random() * 10,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.6,
        size: 3 + Math.random() * 2.5,
      });
    }
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
    for (const p of this.particles) {
      p.y -= p.speed * dt;
      p.x += p.drift * dt + Math.sin(this.t * 0.4 + p.layer * 10) * 0.0002;
      if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
    }
    for (const l of this.leaves) {
      l.y += l.speed * dt * 0.6;
      l.x += Math.sin(this.t * 0.6 + l.sway) * 0.00025;
      l.rot += l.rotSpeed * dt;
      if (l.y > 1.05) { l.y = -0.05; l.x = Math.random(); }
    }
  }

  drawFarBackground(ctx, w, h, camY, worldH) {
    const progress = 1 - Math.min(1, camY / worldH);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(${20 + progress * 18},${18 + progress * 13},${23 + progress * 9},1)`);
    g.addColorStop(0.55, `rgba(19,18,21,1)`);
    g.addColorStop(1, `rgba(9,9,10,1)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // moon / distant light source
    const moonX = w * 0.68;
    const moonY = h * 0.2 + camY * CONFIG.parallax.farBackground * 0.05;
    const moonR = 40;
    const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 3);
    glow.addColorStop(0, 'rgba(230,218,188,0.30)');
    glow.addColorStop(1, 'rgba(230,218,188,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(234,228,208,0.7)';
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR * 0.36, 0, Math.PI * 2); ctx.fill();
  }

  // Two background silhouette bands (distant mountains/towers, nearer treeline)
  // scrolling slower than gameplay to reinforce depth.
  drawBackgroundLayers(ctx, w, h, cam) {
    drawSilhouetteBand(ctx, w, h, cam, CONFIG.parallax.farBackground, 'rgba(14,13,15,0.85)', 0.42, 340, 1);
    drawSilhouetteBand(ctx, w, h, cam, CONFIG.parallax.midgroundFar, 'rgba(8,8,9,0.92)', 0.30, 210, 2);
  }

  drawLightRays(ctx, w, h, t) {
    ctx.save();
    ctx.globalAlpha = 0.045;
    const rayX = w * 0.66;
    for (let i = 0; i < 3; i++) {
      const sway = Math.sin(t * 0.12 + i) * 12;
      ctx.save();
      ctx.translate(rayX + i * 34 + sway, -20);
      ctx.rotate(0.10 + i * 0.03);
      const g = ctx.createLinearGradient(0, 0, 0, h * 1.2);
      g.addColorStop(0, 'rgba(228,206,166,0.55)');
      g.addColorStop(1, 'rgba(228,206,166,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-16, 0, 32, h * 1.2);
      ctx.restore();
    }
    ctx.restore();
  }

  drawFarParticles(ctx, w, h) {
    ctx.save();
    for (const p of this.particles) {
      const alpha = 0.06 + p.layer * 0.14;
      ctx.fillStyle = `rgba(216,210,196,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x * w, p.y * h, p.size * (0.5 + p.layer), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawLeaves(ctx, w, h) {
    ctx.save();
    for (const l of this.leaves) {
      ctx.save();
      ctx.translate(l.x * w, l.y * h);
      ctx.rotate(l.rot);
      ctx.fillStyle = 'rgba(60,52,38,0.5)';
      ctx.beginPath();
      ctx.ellipse(0, 0, l.size, l.size * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  drawFogNear(ctx, w, h) {
    ctx.save();
    ctx.globalAlpha = 0.32;
    const g = ctx.createLinearGradient(0, h * 0.58, 0, h);
    g.addColorStop(0, 'rgba(10,10,11,0)');
    g.addColorStop(1, 'rgba(7,7,8,0.88)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }
}

// A horizontal band of simple silhouette shapes (trees / distant towers)
// that repeats seamlessly and scrolls at `parallaxFactor` relative to camera.
function drawSilhouetteBand(ctx, w, h, cam, parallaxFactor, color, baseline, spacing, styleVariant) {
  ctx.save();
  ctx.fillStyle = color;
  const offsetX = -(cam.x * parallaxFactor) % spacing;
  const bandBaseY = h * baseline - cam.y * parallaxFactor * 0.12;
  const count = Math.ceil(w / spacing) + 2;
  for (let i = -1; i < count; i++) {
    const seed = Math.sin((i + Math.floor(cam.x / (spacing * count))) * 12.9898) * 43758.5453;
    const frac = seed - Math.floor(seed);
    const x = offsetX + i * spacing;
    const size = 60 + frac * 80;
    if (styleVariant === 1) drawDistantTower(ctx, x, bandBaseY, size);
    else drawDistantTree(ctx, x, bandBaseY, size);
  }
  ctx.restore();
}

function drawDistantTree(ctx, x, y, size) {
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.lineTo(x - size * 0.42, y);
  ctx.lineTo(x + size * 0.42, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillRect(x - size * 0.05, y - size * 0.1, size * 0.1, size * 0.35);
}

function drawDistantTower(ctx, x, y, size) {
  const w = size * 0.28;
  ctx.fillRect(x - w / 2, y - size, w, size);
  // crenellations
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(x - w / 2 + i * (w / 3), y - size - 8, w / 5, 8);
  }
}

// ---------------------------------------------------------------------------
// Painterly platform rendering — replaces raw rectangles with irregular,
// organic silhouettes (rocky ledges, roots, ruin fragments, wooden bridges)
// drawn from a stable per-platform seed so shapes don't jitter frame to frame.
// The collision box (s.x, s.y, s.w, s.h) is unchanged; visuals extend
// slightly above/below/around it for a broken, natural edge.
// ---------------------------------------------------------------------------

function seededRand(seed, i) {
  const v = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

function drawPlatform(ctx, s, t) {
  const { x, y, w, h, kind, seed } = s;
  ctx.save();

  const baseColor = '#08080a';
  const edgeHighlight = 'rgba(255,255,255,0.05)';
  const mossColor = 'rgba(74,84,58,0.35)';

  ctx.fillStyle = baseColor;

  // irregular top edge via jittered path, consistent per platform via seed
  const segs = Math.max(4, Math.round(w / 22));
  ctx.beginPath();
  ctx.moveTo(x, y + h + 6);
  ctx.lineTo(x, y + 6);
  for (let i = 0; i <= segs; i++) {
    const px = x + (w * i) / segs;
    const jitter = (seededRand(seed, i) - 0.5) * 8;
    const py = y + jitter * (kind === 'bridge' ? 0.2 : 1);
    ctx.lineTo(px, py);
  }
  ctx.lineTo(x + w, y + h + 6);
  ctx.closePath();
  ctx.fill();

  // subtle top highlight following the same irregular edge
  ctx.strokeStyle = edgeHighlight;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i <= segs; i++) {
    const px = x + (w * i) / segs;
    const jitter = (seededRand(seed, i) - 0.5) * 8;
    const py = y + jitter * (kind === 'bridge' ? 0.2 : 1);
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.stroke();

  // kind-specific decoration
  if (kind === 'root') {
    ctx.strokeStyle = 'rgba(30,24,18,0.6)';
    ctx.lineWidth = 3;
    for (let i = 0; i < Math.floor(w / 30); i++) {
      const rx = x + 15 + i * 30 + seededRand(seed, i + 50) * 10;
      ctx.beginPath();
      ctx.moveTo(rx, y + 2);
      ctx.quadraticCurveTo(rx - 6, y + h * 0.6, rx + 4, y + h + 8);
      ctx.stroke();
    }
  } else if (kind === 'bridge') {
    // wooden planks with rope rails
    ctx.strokeStyle = 'rgba(4,4,5,0.7)';
    ctx.lineWidth = 2;
    const plankCount = Math.floor(w / 16);
    for (let i = 0; i <= plankCount; i++) {
      const px = x + i * (w / plankCount);
      ctx.beginPath(); ctx.moveTo(px, y - 2); ctx.lineTo(px, y + h + 4); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(60,52,40,0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y - 10);
    for (let i = 0; i <= segs; i++) {
      const px = x + (w * i) / segs;
      ctx.lineTo(px, y - 10 + Math.sin(i * 1.3 + t * 0.5) * 3);
    }
    ctx.stroke();
  } else if (kind === 'ruin') {
    // stone block cracks
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 1;
    for (let i = 1; i < segs; i++) {
      const px = x + (w * i) / segs + seededRand(seed, i + 20) * 6 - 3;
      ctx.beginPath(); ctx.moveTo(px, y + 4); ctx.lineTo(px + 4, y + h * 0.7); ctx.stroke();
    }
  }

  // sparse moss patches on ledges/roots (not bridges/ruins, keeps it varied)
  if (kind === 'ledge' || kind === 'root') {
    for (let i = 0; i < Math.floor(w / 40); i++) {
      const mx = x + 10 + i * 40 + seededRand(seed, i + 80) * 14;
      const mw = 14 + seededRand(seed, i + 90) * 10;
      ctx.fillStyle = mossColor;
      ctx.beginPath();
      ctx.ellipse(mx, y + 2, mw / 2, 3, 0, 0, Math.PI);
      ctx.fill();
    }
  }

  ctx.restore();

  // hanging vine detail below some ledges for depth (purely decorative)
  if ((kind === 'ledge' || kind === 'ruin') && seededRand(seed, 200) > 0.5) {
    ctx.save();
    ctx.strokeStyle = 'rgba(20,22,14,0.4)';
    ctx.lineWidth = 1.5;
    const vx = x + w * (0.3 + seededRand(seed, 201) * 0.4);
    ctx.beginPath();
    ctx.moveTo(vx, y + h);
    const sway = Math.sin(t * 0.8 + seed) * 4;
    ctx.quadraticCurveTo(vx + sway, y + h + 18, vx + sway * 1.4, y + h + 34);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Hazards — drawn as organic thorny growths rather than geometric triangles.
// Hazard rects are derived alongside their host platform for collision.
// ---------------------------------------------------------------------------

function buildHazards(solids, level) {
  const hazards = [];
  for (const s of solids) {
    if (!s.hazard) continue;
    hazards.push({
      x: s.hazardX,
      y: s.y,
      w: TILE * 0.9,
      h: TILE * 0.6,
      type: s.hazard,
      seed: s.seed,
    });
  }
  return hazards;
}

function drawHazard(ctx, hz, t) {
  ctx.save();
  ctx.translate(hz.x, hz.y);
  ctx.fillStyle = '#050506';
  ctx.strokeStyle = 'rgba(0,0,0,0.6)';

  if (hz.type === 'bramble') {
    // cluster of curved thorn stems
    for (let i = 0; i < 5; i++) {
      const bx = -hz.w / 2 + (i / 4) * hz.w;
      const sway = Math.sin(t * 1.2 + hz.seed + i) * 1.5;
      ctx.beginPath();
      ctx.moveTo(bx, 4);
      ctx.quadraticCurveTo(bx + sway, -hz.h * 0.5, bx + sway * 0.6, -hz.h);
      ctx.lineWidth = 2.4;
      ctx.strokeStyle = 'rgba(10,9,8,0.85)';
      ctx.stroke();
      // small thorns
      for (let j = 0; j < 3; j++) {
        const ty = -j * hz.h * 0.3 - 6;
        ctx.beginPath();
        ctx.moveTo(bx, ty);
        ctx.lineTo(bx + 5, ty - 4);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(bx, ty);
        ctx.lineTo(bx - 5, ty - 4);
        ctx.stroke();
      }
    }
  } else if (hz.type === 'spikes') {
    // jagged broken stakes, irregular heights (not clean triangles)
    const count = 4;
    for (let i = 0; i < count; i++) {
      const bx = -hz.w / 2 + (i / (count - 1)) * hz.w;
      const height = hz.h * (0.6 + seededRand(hz.seed, i) * 0.5);
      ctx.beginPath();
      ctx.moveTo(bx - 5, 4);
      ctx.lineTo(bx + seededRand(hz.seed, i + 10) * 3 - 1.5, -height);
      ctx.lineTo(bx + 5, 4);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
}

// export a rough rect for collision purposes
function hazardRect(hz) {
  return { x: hz.x - hz.w / 2, y: hz.y - hz.h, w: hz.w, h: hz.h };
}
