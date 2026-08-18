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
  widthTiles: 28, // widened by 2 from 26 to fit the optional ledge's new x:24 position
  heightTiles: 118,
  spawn: { x: 4 * TILE, y: 113 * TILE },
  checkpoint: { x: 10 * TILE, y: 70 * TILE }, // quiet resting area, mid-level
  endpoint: { x: 6 * TILE, y: 9 * TILE },     // ruin doorway (shifted with the endpoint platform, now x2-10, for reachability)
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
    // 3. one simple first jump. Shifted from x:13 to x:11 (2-tile horizontal
    // gap from the platform below instead of 0) — with zero gap, a player
    // jumping up-and-left from platform 2 crossed into this platform's
    // x-range before clearing its height, so they hit its underside like a
    // ceiling and fell straight back down instead of landing on top.
    { x: 11, y: 107, w: 4, kind: 'ledge' },
    // short climbable wall segment (introduces climbing in a safe area)
    { x: 8, y: 100, w: 3, kind: 'ruin', wall: true },
    { x: 6, y: 95, w: 5, kind: 'ledge' },
    // 4. short upward climbing sequence among broken ruin fragments.
    // Gaps widened from 1 tile to 3 between each of these three fragments
    // (5-tile rises) — a 1-tile gap left too little horizontal clearance
    // before a player jumping up-and-across would cross into the next
    // fragment's footprint below its top surface and bonk its underside
    // instead of landing on it.
    { x: 14, y: 90, w: 4, kind: 'ruin' },
    { x: 21, y: 85, w: 4, kind: 'ruin' },
    { x: 16, y: 80, w: 4, kind: 'root', wall: true },
    // Shifted from x:8 to x:17 — with the checkpoint platform below spanning
    // x6-14, a 0-gap 5-tile rise meant a player launching from anywhere
    // near this platform's left side crossed into the checkpoint's
    // footprint before clearing its height and bonked its underside
    // instead of landing on top. Moving this platform right creates real
    // horizontal separation, so height is gained before the x-ranges meet.
    { x: 17, y: 75, w: 5, kind: 'ledge' },
    // rest area / checkpoint — quiet, wide, safe
    { x: 6, y: 70, w: 8, kind: 'ledge', checkpoint: true },
    // 5. safe hazard introduction — hazard sits on a wide safe platform
    { x: 6, y: 65, w: 8, kind: 'root', hazard: 'bramble', hazardX: 11 },
    // 6. wider gap requiring a committed jump
    { x: 18, y: 61, w: 4, kind: 'ruin' },
    // optional collectible ledge slightly off the main route (dead end above).
    // Raised from y:54 to y:57 (previous 7-tile gain exceeded max jump
    // height) and shifted from x:22 to x:24 — the platform below spans
    // x18-22, so the earlier 0-gap arrangement meant a player jumping up
    // from it crossed into this ledge's footprint before clearing its
    // height and bonked its underside instead of landing on top.
    { x: 24, y: 57, w: 3, kind: 'ledge', optional: true },
    // main route continues. The real forward path skips the optional
    // ledge above and jumps directly from the platform at y:61 (x18-22) —
    // that was originally a 0-gap 6-tile rise (over the ~5.5-tile max jump
    // height, with x-overlap risking an underside bonk on top of being too
    // tall). Raised from y:55 to y:57 for a safely-gapped 4-tile jump.
    // Shifted from x:9 to x:14 — at x:9 the horizontal gap from the ruin
    // at x18-22 was 5-13 tiles, farther than moveSpeed/airtime can cross in
    // a single jump (confirmed via brute-force real-physics simulation:
    // the player cleared the height easily but sailed past the platform
    // horizontally every time). x:14-18 keeps a real 0-4 tile gap that's
    // actually reachable while still requiring a committed jump.
    { x: 14, y: 57, w: 4, kind: 'root' },
    // Raised from y:50 to y:52 (a shallower, safer rise from the platform
    // below) and shifted to x:9 — the platform below is now at x14-18
    // (moved there to fix its OWN reachability from the ruin at x18-22, see
    // that platform's comment); x:9-14 keeps a real but small horizontal
    // gap (0 tiles at closest edges) from x14-18 while still being a
    // deliberate jump, confirmed reachable via brute-force real-physics
    // simulation for a 5-tile rise with this much horizontal offset.
    { x: 9, y: 52, w: 5, kind: 'ledge', hazard: 'spikes', hazardX: 3 },
    // Lowered from y:44 to y:41, and shifted from x:10 to x:13 — with the
    // wall column now given real climbable height (see buildSolids in this
    // file: wall segments are 3 tiles tall, not the same thin slab as a
    // landing ledge), it needs an actual vertical FACE the player can jump
    // into and grab, not just a ceiling overhead. At x:10 the wall sat
    // entirely inside the footprint of the ledge above it (x9-14), so there
    // was no way to approach its side while grounded — every jump launched
    // straight up into its flat underside instead of its face, which
    // (correctly) halts upward motion like hitting a low ceiling rather
    // than grabbing on. Confirmed via brute-force real-physics simulation:
    // every launch position/direction from the ledge hit the wall's
    // underside and fell back, never registering onWall. Shifting to
    // x:13-16 puts most of the wall's width outside the ledge's x9-14
    // footprint, so a jump toward it from the ledge's right portion
    // approaches its left face laterally and can grab on properly.
    // Also given a taller 6-tile column (wallHeightTiles: 6, spanning
    // y41-47) instead of the default 3 — this keeps its BOTTOM at y:47
    // (reachable via a normal jump from the ledge at y:52, a 5-tile rise)
    // while its TOP reaches y:41, so climbing the wall's full height covers
    // most of the previous 8-tile gap to the bridge below at y:38. What's
    // left after the climb is a safe, short 3-tile hop onto the bridge
    // instead of a jump far beyond max jump height.
    { x: 13, y: 41, w: 3, kind: 'ruin', wall: true, wallHeightTiles: 6 },
    // 7. environmental reveal — broken bridge across a wide chasm
    { x: 5, y: 38, w: 14, kind: 'bridge' },
    // 8. final traversal — staggered ruin fragments climbing to the doorway.
    // First fragment raised from y:32 to y:34 (previous 6-tile gain
    // exceeded max jump height) and shifted from x:16 to x:21 — the bridge
    // spans the full x5-19 width, so with the old 0-gap arrangement a
    // player launching from anywhere near the bridge's right side crossed
    // into this fragment's footprint before clearing its height and
    // bonked its underside instead of landing on top.
    { x: 21, y: 34, w: 4, kind: 'ruin' },
    // Raised from y:27 to y:30, and shifted from x:10 to x:15 to keep the
    // gap from the fragment above (now at x:21) within jump range while
    // still preserving a safe gap from the bridge below.
    { x: 15, y: 30, w: 4, kind: 'ruin' },
    // Shifted from x:15 to x:18 and given a taller 6-tile column
    // (wallHeightTiles: 6, spanning y21-27) instead of the default 3 — same
    // fix as the wall segment earlier in the level (see that platform's
    // comment): at x:15 the wall sat fully inside the ruin fragment's
    // footprint above it (x15-19), so there was no side to jump into, only
    // a flat underside that (correctly) halts upward motion rather than
    // letting the player grab on. Shifting to x:18-21 puts most of its
    // width outside the ruin's x15-19 footprint for a real side approach.
    // The taller column also closes most of the previous 9-tile gap to the
    // ledge above at y:15: its bottom (y:27) is a reachable 3-tile rise
    // from the ruin at y:30, and climbing to its top (y:21) leaves a safe
    // 6-tile hop to the ledge instead of a jump far beyond max jump height.
    { x: 18, y: 21, w: 3, kind: 'ruin', wall: true, wallHeightTiles: 6 },
    // Shifted from x:10 to x:14 to open a safe horizontal gap from the
    // endpoint platform below (see that platform's comment).
    { x: 14, y: 15, w: 5, kind: 'ledge' },
    // endpoint platform before the doorway. Raised from y:8 to y:11 (previous
    // 7-tile gain exceeded max jump height) and shifted from x:7 to x:2 —
    // the platform above (now x14-19) previously overlapped this one
    // heavily in x, so a player jumping up from it crossed into this
    // platform's footprint before clearing its height and bonked its
    // underside instead of landing on top. LEVEL.endpoint below is shifted
    // to match this platform's new x/y.
    { x: 2, y: 11, w: 8, kind: 'ruin' },
  ],

  lights: [
    { x: 14 * TILE, y: 112 * TILE },
    { x: 19 * TILE, y: 110 * TILE },
    { x: 9 * TILE, y: 99 * TILE },
    { x: 16 * TILE, y: 89 * TILE },   // shifted with the ruin fragment below (now x:14, was x:12)
    { x: 22 * TILE, y: 84 * TILE },   // shifted with the ruin fragment below (now x:21, was x:17)
    { x: 19 * TILE, y: 74 * TILE },   // shifted with the ledge below (now x:17, was x:8)
    { x: 25.5 * TILE, y: 56 * TILE }, // optional, off-route — shifted with the ledge below (now x:24, y:57)
    { x: 11 * TILE, y: 54 * TILE },   // shifted with the platform below (now x:9, was x:12)
    { x: 3 * TILE, y: 49 * TILE },    // shifted with the ledge below (now x:1, was x:6)
    { x: 11 * TILE, y: 37 * TILE },   // on the bridge — encourages pause to look
    { x: 22 * TILE, y: 33 * TILE },   // shifted with the ruin fragment below (now x:21, y:34)
    { x: 16 * TILE, y: 14 * TILE },   // shifted with the ledge below (now x:14, y:15)
    { x: 5 * TILE, y: 10 * TILE },    // shifted with the endpoint platform below (now x:2, y:11)
  ],

  enemies: [
    { type: 'walker', x: 14 * TILE, y: 112 * TILE },
    { type: 'walker', x: 18 * TILE, y: 79 * TILE },  // shifted with the wall segment below (now x16-20, was x12-16)
  ],
};

function buildSolids(level) {
  return level.platforms.map(p => ({
    x: p.x * TILE,
    y: p.y * TILE,
    w: p.w * TILE,
    // Wall segments (wall:true) are climbable columns, not landing ledges,
    // so they get a much taller collision height (3 tiles by default, or
    // p.wallHeightTiles if a platform needs a taller column to close a
    // bigger vertical gap) than a normal platform's thin landing slab
    // (0.55 tiles). Without this, a wall's collider was exactly as thin as
    // any other platform — meaning a player jumping past it only overlapped
    // its horizontal band for a frame or two of a fast rising/falling arc,
    // almost never long enough to register the sustained horizontal
    // contact resolveHorizontal() needs to set onWall and let the player
    // grab on. The top of the tall column still sits at p.y (unchanged),
    // so it still reads and lands the same as before from above; it just
    // now has real vertical thickness below that top surface for the
    // player to catch against while jumping in.
    h: p.wall ? TILE * (p.wallHeightTiles || 3) : TILE * 0.55,
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

  // Palette cooled to match inspiration.jpg: deep indigo/near-black base
  // (rather than the previous warm neutral gray), teal-cyan glow for the
  // moon/particles/rays (rather than warm amber), muted cool leaves.
  drawFarBackground(ctx, w, h, camY, worldH) {
    const progress = 1 - Math.min(1, camY / worldH);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `rgba(${14 + progress * 10},${19 + progress * 14},${28 + progress * 20},1)`);
    g.addColorStop(0.55, `rgba(13,17,24,1)`);
    g.addColorStop(1, `rgba(6,8,12,1)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // moon / distant light source — cooled from warm cream to a soft teal-cyan
    const moonX = w * 0.68;
    const moonY = h * 0.2 + camY * CONFIG.parallax.farBackground * 0.05;
    const moonR = 40;
    const glow = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, moonR * 3);
    glow.addColorStop(0, 'rgba(150,210,220,0.28)');
    glow.addColorStop(1, 'rgba(150,210,220,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR * 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(200,230,232,0.75)';
    ctx.beginPath(); ctx.arc(moonX, moonY, moonR * 0.36, 0, Math.PI * 2); ctx.fill();
  }

  // Two background silhouette bands (distant mountains/towers, nearer treeline)
  // scrolling slower than gameplay to reinforce depth. Cooled toward blue-black.
  drawBackgroundLayers(ctx, w, h, cam) {
    drawSilhouetteBand(ctx, w, h, cam, CONFIG.parallax.farBackground, 'rgba(11,14,19,0.85)', 0.42, 340, 1);
    drawSilhouetteBand(ctx, w, h, cam, CONFIG.parallax.midgroundFar, 'rgba(6,8,11,0.92)', 0.30, 210, 2);
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
      g.addColorStop(0, 'rgba(160,215,220,0.5)');
      g.addColorStop(1, 'rgba(160,215,220,0)');
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
      ctx.fillStyle = `rgba(190,220,222,${alpha})`;
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
      ctx.fillStyle = 'rgba(40,52,58,0.5)';
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
    g.addColorStop(0, 'rgba(7,9,12,0)');
    g.addColorStop(1, 'rgba(5,6,9,0.88)');
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
  // cooled from a warm olive-green toward a blue-teal moss, matching inspiration.jpg's palette
  const mossColor = 'rgba(48,80,78,0.35)';

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
    ctx.strokeStyle = 'rgba(14,20,20,0.4)'; // cooled from a warm olive tint
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
