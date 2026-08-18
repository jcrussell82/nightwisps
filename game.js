// game.js — screen flow, main loop, HUD wiring, viewport sizing.
// Keep this file focused on orchestration; gameplay systems live in their own modules.

(function () {
  const screens = {};
  document.querySelectorAll('.screen').forEach(el => screens[el.id.replace('screen-', '')] = el);

  function showScreen(name) {
    Object.values(screens).forEach(el => el.classList.remove('active'));
    screens[name].classList.add('active');
  }

  const saveState = {
    totalLights: LEVEL.lights.length,
  };

  let input, player, camera, atmosphere, farthestBg, solids, hazards, enemies;
  let lights = [];
  let gameCanvas, gameCtx;
  let running = false;
  let levelStartTime = 0;
  let lastTime = 0;
  let reachedEndpoint = false;

  // ---------------------------------------------------------------------
  // Fixed-aspect portrait viewport. Locks #app to CONFIG.viewport's ratio
  // so the world never stretches; letterboxes with dark space on desktop.
  // ---------------------------------------------------------------------
  function applyViewportSize() {
    const frame = document.getElementById('viewport-frame');
    const app = document.getElementById('app');
    const availW = frame.clientWidth;
    const availH = frame.clientHeight;
    const ratio = CONFIG.viewport.aspectW / CONFIG.viewport.aspectH;

    let w = availW;
    let h = w / ratio;
    if (h > availH) {
      h = availH;
      w = h * ratio;
    }
    w = Math.min(w, CONFIG.viewport.maxWidthPx);
    h = w / ratio;
    if (h > availH) { h = availH; w = h * ratio; }

    app.style.width = Math.round(w) + 'px';
    app.style.height = Math.round(h) + 'px';
    resizeCanvas();
  }

  function initGameplay() {
    solids = buildSolids(LEVEL);
    hazards = buildHazards(solids, LEVEL);
    player = new Player(LEVEL.spawn.x, LEVEL.spawn.y);
    enemies = LEVEL.enemies.map(e => new Enemy(e.type, e.x, e.y));
    lights = LEVEL.lights.map(l => ({
      x: l.x, y: l.y, collected: false, bob: Math.random() * 10,
      collectAnim: 0, particles: spawnLightParticles(l.x, l.y),
    }));
    // Use the canvas's CSS size (style.width/height), not its physical
    // buffer size (gameCanvas.width/height, which is devicePixelRatio times
    // larger) — Camera's internal math is all in CSS/world pixel space. See
    // the comment in resizeCanvas() for the full explanation of why mixing
    // these up made the player disappear on any screen with dpr > 1.
    const dpr0 = Math.min(window.devicePixelRatio || 1, 2);
    camera = new Camera(gameCanvas.width / dpr0, gameCanvas.height / dpr0, LEVEL.widthTiles * TILE, LEVEL.heightTiles * TILE);
    atmosphere = new Atmosphere();
    farthestBg = new FarthestBackground();
    levelStartTime = performance.now();
    reachedEndpoint = false;
    updateHeartsUI();
    updateLightUI();
  }

  function spawnLightParticles(x, y) {
    const n = CONFIG.light.particleCount;
    const particles = [];
    for (let i = 0; i < n; i++) {
      particles.push({
        angle: (i / n) * Math.PI * 2 + Math.random(),
        radius: 6 + Math.random() * 5,
        speed: 0.3 + Math.random() * 0.4,
        phase: Math.random() * 10,
      });
    }
    return particles;
  }

  function updateHeartsUI() {
    const containers = [document.getElementById('hearts'), document.getElementById('pause-hearts')];
    containers.forEach(c => {
      c.innerHTML = '';
      for (let i = 0; i < player.maxHp; i++) {
        const d = document.createElement('div');
        d.className = 'heart';
        const filled = i < player.hp;
        d.innerHTML = `<svg viewBox="0 0 24 24"><path fill="${filled ? '#c98a6b' : 'rgba(255,255,255,0.12)'}" d="M12 21s-7.5-4.6-10-9.3C.5 8 2 4 6 4c2 0 3.5 1.2 4.5 2.7C11.5 5.2 13 4 15 4c4 0 5.5 4 4 7.7C19.5 16.4 12 21 12 21z"/></svg>`;
        c.appendChild(d);
      }
    });
  }

  function updateLightUI() {
    document.getElementById('light-count').textContent = player.lights;
    document.getElementById('pause-light-count').textContent = player.lights;
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!gameCanvas) return;
    const rect = gameCanvas.parentElement.getBoundingClientRect();
    gameCanvas.width = rect.width * dpr;
    gameCanvas.height = rect.height * dpr;
    gameCanvas.style.width = rect.width + 'px';
    gameCanvas.style.height = rect.height + 'px';
    // Camera math (follow(), world-space clamping) all operates in CSS/world
    // pixel space — the same space render() uses after its ctx.scale(dpr,dpr)
    // — so the camera's viewW/viewH must be the CSS size (rect.width/height),
    // NOT the physical canvas buffer size (which is dpr times larger). Passing
    // the buffer size here was invisible on desktop (dpr is usually 1, so the
    // two match), but on any phone reporting dpr 2 or 3 it made the camera
    // think the viewport was 2-3x taller/wider than it really is: every
    // world-space Y calculation in Camera.follow() (desiredY, the worldH
    // clamp, etc.) came out far too large, pushing the camera well below
    // where the player actually stood — the player was still drawn correctly,
    // just entirely outside the visible viewport. This is what made Wisp
    // disappear on mobile while every other layer (background, platforms,
    // HUD) rendered fine, since those aren't camera-relative in the same way.
    if (camera) camera.resize(rect.width, rect.height);
  }

  // ---------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.033, (now - lastTime) / 1000 || 0.016);
    lastTime = now;

    input.beginFrame();

    const wasOnGround = player.onGround;
    const wasBiting = player.biteTimer > 0;
    player.update(dt, input, solids);
    if (!wasBiting && player.biteTimer > 0) audioSystem.bite();
    if (input.attackPressed) player.bite();
    if (!wasOnGround && player.onGround) camera && camera.notifyLanding();

    // footstep cadence
    if (player.onGround && Math.abs(player.vx) > 40) {
      player._stepAccum = (player._stepAccum || 0) + dt;
      if (player._stepAccum > 0.28) { player._stepAccum = 0; audioSystem.footstep(); }
    }
    if (player.state === STATE.LAND && !player._landedSoundPlayed) {
      audioSystem.land(); player._landedSoundPlayed = true;
    } else if (player.state !== STATE.LAND) {
      player._landedSoundPlayed = false;
    }
    if (input.jumpPressed && (player.coyoteTimer > 0 || player.onWall !== 0)) audioSystem.jump();

    // Track hp/lights across this frame's enemy and hazard checks so the
    // HUD can refresh immediately when either changes — previously the
    // hearts only redrew on init/respawn/pause, so taking damage mid-game
    // never visibly updated them until the player paused or died.
    const hpBefore = player.hp;

    for (const e of enemies) if (e.alive) e.update(dt, solids, player);
    enemies = enemies.filter(e => e.alive);

    // hazard contact (simple AABB against player, ignores invulnerability window like enemies)
    const pr = player.rect();
    for (const hz of hazards) {
      const hr = hazardRect(hz);
      const overlap = pr.x < hr.x + hr.w && pr.x + pr.w > hr.x && pr.y < hr.y + hr.h && pr.y + pr.h > hr.y;
      if (overlap && player.invuln <= 0) {
        player.hurt(player.x < hz.x ? -1 : 1);
        audioSystem.hurt();
      }
    }

    if (player.hp !== hpBefore) updateHeartsUI();

    // light collection (with brief collapse-toward-player animation before disappearing)
    for (const l of lights) {
      if (l.collected) continue;
      if (l.collectAnim > 0) {
        l.collectAnim -= dt * 3.5;
        if (l.collectAnim <= 0) l.collected = true;
        continue;
      }
      const dx = l.x - player.x, dy = l.y - (player.y - player.h / 2);
      if (dx * dx + dy * dy < CONFIG.light.collectRadius * CONFIG.light.collectRadius) {
        l.collectAnim = 1;
        player.lights += 1;
        audioSystem.collect();
        updateLightUI();
      }
    }

    // checkpoint (quiet, no text — just internal state)
    if (!player._checkpointReached && Math.abs(player.x - LEVEL.checkpoint.x) < 100 &&
        Math.abs(player.y - LEVEL.checkpoint.y) < 60 && player.onGround) {
      player._checkpointReached = true;
      player._checkpointX = LEVEL.checkpoint.x;
      player._checkpointY = LEVEL.checkpoint.y;
    }

    // endpoint (ruin doorway) reached
    if (!reachedEndpoint && Math.abs(player.x - LEVEL.endpoint.x) < 60 &&
        Math.abs(player.y - LEVEL.endpoint.y) < 50) {
      reachedEndpoint = true;
      onLevelComplete();
    }

    atmosphere.update(dt);
    camera.follow(player.x, player.y, player.vx, player.vy, dt, player.state === STATE.LOOKUP);
    farthestBg.update(camera.renderY, dt);

    // Falling below the original starting ground level means Wisp has
    // gone off the bottom of the world — restart the whole level rather
    // than just respawning at the last checkpoint.
    if (player.y > LEVEL.groundLevelY + CONFIG.world.voidFallMargin) {
      restartLevel();
    } else if (player.hp <= 0) {
      respawn();
    }

    render();
    if (running) requestAnimationFrame(loop);
  }

  function respawn() {
    const cp = player._checkpointReached ? { x: player._checkpointX, y: player._checkpointY } : LEVEL.spawn;
    player.x = cp.x;
    player.y = cp.y;
    player.vx = 0; player.vy = 0;
    player.hp = player.maxHp;
    player.invuln = 1.5;
    updateHeartsUI();
  }

  // Full level restart: rebuilds everything from scratch (lights, enemies,
  // hp, checkpoint progress, camera, elapsed time) as if the level had
  // just been entered. Used when Wisp falls off the bottom of the world.
  function restartLevel() {
    initGameplay();
  }

  function onLevelComplete() {
    running = false;
    document.getElementById('stat-light').textContent = `${player.lights}/${saveState.totalLights}`;
    const elapsed = Math.round((performance.now() - levelStartTime) / 1000);
    document.getElementById('stat-time').textContent = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}`;
    const lightsDiv = document.getElementById('complete-lights');
    lightsDiv.innerHTML = '';
    for (let i = 0; i < Math.min(6, saveState.totalLights); i++) {
      const d = document.createElement('div');
      d.className = 'dot' + (i < player.lights ? '' : ' empty');
      lightsDiv.appendChild(d);
    }
    setTimeout(() => showScreen('complete'), 500);
  }

  // ---------------------------------------------------------------------
  // Render — layered: far background -> silhouette bands -> light rays ->
  // (camera transform) -> hazards -> platforms -> lights -> enemies ->
  // player -> (reset transform) -> near fog -> far particles -> leaves ->
  // foreground layer.
  // ---------------------------------------------------------------------
  function render() {
    const ctx = gameCtx;
    const w = gameCanvas.width, h = gameCanvas.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    ctx.save();
    ctx.scale(dpr, dpr);
    const vw = w / dpr, vh = h / dpr;

    // Base sky gradient first (opaque) so there's a solid backdrop, then
    // the furthest-back atmospheric image (bg-image.js) on top of it but
    // still beneath every gameplay element, the moon, and the closer
    // parallax silhouette bands. Purely decorative — no collision or
    // interaction of any kind.
    atmosphere.drawFarBackground(ctx, vw, vh, camera.renderY, LEVEL.heightTiles * TILE);
    farthestBg.draw(ctx, vw, vh);
    atmosphere.drawBackgroundLayers(ctx, vw, vh, camera);
    atmosphere.drawLightRays(ctx, vw, vh, atmosphere.t);

    ctx.translate(-camera.x, -camera.renderY);

    // hazards (drawn before platforms so their base tucks behind the ledge edge)
    for (const hz of hazards) drawHazard(ctx, hz, atmosphere.t);

    // platforms — painterly organic silhouettes
    for (const s of solids) {
      ctx.globalAlpha = s.dropThrough ? 0.85 : 1;
      drawPlatform(ctx, s, atmosphere.t);
    }
    ctx.globalAlpha = 1;

    // checkpoint marker (subtle glowing stone, only visible near it)
    drawCheckpointMarker(ctx, atmosphere.t);
    drawEndpointDoorway(ctx, atmosphere.t);

    // collectible lights — small, delicate, restrained bloom
    for (const l of lights) {
      if (l.collected) continue;
      drawLightWisp(ctx, l, atmosphere.t);
    }

    for (const e of enemies) e.draw(ctx);
    player.draw(ctx);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    atmosphere.drawFogNear(ctx, vw, vh);
    atmosphere.drawFarParticles(ctx, vw, vh);
    atmosphere.drawLeaves(ctx, vw, vh);
    drawForegroundLayer(ctx, vw, vh, camera, atmosphere.t);

    ctx.restore();
  }

  function drawLightWisp(ctx, l, t) {
    const L = CONFIG.light;
    const bobY = Math.sin(t * L.floatSpeed + l.bob) * L.floatRange;
    const bobX = Math.cos(t * L.floatSpeed * 0.7 + l.bob) * (L.floatRange * 0.4);
    const collapse = l.collectAnim > 0 ? l.collectAnim : 0;
    const px = l.x + bobX * (1 - collapse);
    const py = l.y + bobY * (1 - collapse);
    const pulse = 0.85 + Math.sin(t * L.pulseSpeed + l.bob) * 0.15;
    const brighten = collapse > 0 ? 1 + collapse * 1.5 : 1;

    ctx.save();
    // soft restrained bloom — small, not a wash. Cooled from warm amber to
    // teal-cyan to match inspiration.jpg's dominant glow color.
    const bloom = ctx.createRadialGradient(px, py, 0, px, py, L.bloomRadius * pulse * brighten);
    bloom.addColorStop(0, `rgba(140,210,215,${0.55 * brighten})`);
    bloom.addColorStop(1, 'rgba(140,210,215,0)');
    ctx.fillStyle = bloom;
    ctx.beginPath(); ctx.arc(px, py, L.bloomRadius * pulse * brighten, 0, Math.PI * 2); ctx.fill();

    // drifting motes around the core
    for (const p of l.particles) {
      const a = p.angle + t * p.speed;
      const mx = px + Math.cos(a) * p.radius;
      const my = py + Math.sin(a) * p.radius * 0.7;
      ctx.fillStyle = 'rgba(190,230,230,0.5)';
      ctx.beginPath(); ctx.arc(mx, my, 0.9, 0, Math.PI * 2); ctx.fill();
    }

    // small bright core — the brightest point stays tiny
    ctx.fillStyle = '#e4f7f5';
    ctx.shadowColor = 'rgba(210,245,240,0.9)';
    ctx.shadowBlur = 6 * brighten;
    ctx.beginPath();
    ctx.arc(px, py, L.coreRadius * pulse * brighten, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawCheckpointMarker(ctx, t) {
    const cx = LEVEL.checkpoint.x, cy = LEVEL.checkpoint.y;
    const pulse = 0.6 + Math.sin(t * 1.2) * 0.15;
    ctx.save();
    // warm coral-pink accent (per inspiration.jpg's small flower/lamp accent
    // lights) — deliberately distinct from the cyan collectible lights so
    // the checkpoint reads as a different kind of marker at a glance
    const glow = ctx.createRadialGradient(cx, cy - 6, 0, cx, cy - 6, 26 * pulse);
    glow.addColorStop(0, 'rgba(235,140,140,0.28)');
    glow.addColorStop(1, 'rgba(235,140,140,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy - 6, 26 * pulse, 0, Math.PI * 2); ctx.fill();
    // small stone shrine silhouette
    ctx.fillStyle = '#050506';
    ctx.beginPath();
    ctx.moveTo(cx - 6, cy);
    ctx.lineTo(cx - 4, cy - 14);
    ctx.lineTo(cx + 4, cy - 14);
    ctx.lineTo(cx + 6, cy);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = `rgba(240,175,175,${0.5 * pulse})`;
    ctx.beginPath(); ctx.arc(cx, cy - 15, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawEndpointDoorway(ctx, t) {
    const ex = LEVEL.endpoint.x, ey = LEVEL.endpoint.y;
    const pulse = 0.7 + Math.sin(t * 0.8) * 0.2;
    ctx.save();
    const glow = ctx.createRadialGradient(ex, ey - 20, 0, ex, ey - 20, 50 * pulse);
    glow.addColorStop(0, 'rgba(160,220,220,0.35)');
    glow.addColorStop(1, 'rgba(160,220,220,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(ex, ey - 20, 50 * pulse, 0, Math.PI * 2); ctx.fill();
    // ruin doorway arch
    ctx.fillStyle = '#050506';
    ctx.beginPath();
    ctx.moveTo(ex - 16, ey);
    ctx.lineTo(ex - 16, ey - 30);
    ctx.quadraticCurveTo(ex, ey - 44, ex + 16, ey - 30);
    ctx.lineTo(ex + 16, ey);
    ctx.lineTo(ex + 12, ey);
    ctx.lineTo(ex + 12, ey - 28);
    ctx.quadraticCurveTo(ex, ey - 38, ex - 12, ey - 28);
    ctx.lineTo(ex - 12, ey);
    ctx.closePath();
    ctx.fill();
    // cool cyan light glowing through the doorway opening
    ctx.fillStyle = `rgba(190,235,235,${0.4 * pulse})`;
    ctx.beginPath();
    ctx.moveTo(ex - 12, ey);
    ctx.lineTo(ex - 12, ey - 28);
    ctx.quadraticCurveTo(ex, ey - 38, ex + 12, ey - 28);
    ctx.lineTo(ex + 12, ey);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Foreground parallax layer — dark branch/leaf silhouettes drifting at
  // the screen edges, faster than the camera, kept sparse so they never
  // block Wisp or the controls for long.
  function drawForegroundLayer(ctx, w, h, cam, t) {
    ctx.save();
    ctx.fillStyle = 'rgba(3,3,4,0.9)';
    const px = -(cam.x * CONFIG.parallax.foreground) % (w * 1.4);

    // left branch
    ctx.save();
    ctx.translate(px * 0.15, 0);
    ctx.beginPath();
    ctx.moveTo(-10, -10);
    ctx.quadraticCurveTo(40, h * 0.08, 10, h * 0.22 + Math.sin(t * 0.4) * 4);
    ctx.quadraticCurveTo(-10, h * 0.15, -10, -10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // right hanging vine
    ctx.save();
    ctx.translate(w - px * 0.1, 0);
    const sway = Math.sin(t * 0.5) * 6;
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(8 + sway, h * 0.12, 4 + sway, h * 0.3);
    ctx.quadraticCurveTo(-6, h * 0.14, -6, -10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
  }

  // ---------------------------------------------------------------------
  // Splash canvas — small static atmospheric render matching new art style
  // ---------------------------------------------------------------------
  // Splash-screen atmosphere is animated (not a single static frame) so the
  // title screen has the same drifting-particle/light-ray life as gameplay
  // instead of feeling like a flat backdrop behind the fox.
  let splashParticles = null;
  let splashAnimHandle = null;
  let splashStartTime = null;

  function drawStaticAtmosphere(canvasId) {
    const c = document.getElementById(canvasId);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = c.parentElement.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    c.style.width = rect.width + 'px'; c.style.height = rect.height + 'px';
    const ctx = c.getContext('2d');

    if (!splashParticles) {
      splashParticles = Array.from({ length: 16 }, () => ({
        x: Math.random(), y: Math.random(), size: 0.6 + Math.random() * 1.4,
        speed: 0.01 + Math.random() * 0.02, layer: Math.random(),
      }));
    }
    splashStartTime = splashStartTime || performance.now();

    function frame() {
      const t = (performance.now() - splashStartTime) / 1000;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const w = rect.width, h = rect.height;

      // cooled toward inspiration.jpg's deep indigo/teal palette (previously a warm neutral gray)
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#141a22'); g.addColorStop(0.5, '#0f141b'); g.addColorStop(1, '#080a0e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      // faint drifting light rays, same treatment as gameplay's drawLightRays
      ctx.save();
      ctx.globalAlpha = 0.04;
      const rayX = w * 0.62;
      for (let i = 0; i < 2; i++) {
        const sway = Math.sin(t * 0.12 + i) * 10;
        ctx.save();
        ctx.translate(rayX + i * 30 + sway, -20);
        ctx.rotate(0.1 + i * 0.03);
        const rg = ctx.createLinearGradient(0, 0, 0, h * 1.2);
        rg.addColorStop(0, 'rgba(160,215,220,0.5)'); rg.addColorStop(1, 'rgba(160,215,220,0)');
        ctx.fillStyle = rg; ctx.fillRect(-14, 0, 28, h * 1.2);
        ctx.restore();
      }
      ctx.restore();

      // moon — slightly blurred (per request) so it reads as a soft glowing
      // disc rather than a hard-edged circle, matching the blur added to
      // drawFarBackground()'s moon in world.js for the live gameplay screen
      ctx.save();
      ctx.filter = 'blur(2px)';
      const moon = ctx.createRadialGradient(w * 0.7, h * 0.25, 0, w * 0.7, h * 0.25, 140);
      moon.addColorStop(0, 'rgba(150,210,220,0.28)'); moon.addColorStop(1, 'rgba(150,210,220,0)');
      ctx.fillStyle = moon; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(200,230,232,0.75)';
      ctx.beginPath(); ctx.arc(w * 0.7, h * 0.25, 18, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      // slowly drifting far particles (dust/embers), same visual language as
      // atmosphere.drawFarParticles() in gameplay
      for (const p of splashParticles) {
        const py = (p.y + t * p.speed * 0.3) % 1;
        const alpha = 0.05 + p.layer * 0.12;
        ctx.fillStyle = `rgba(190,220,222,${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x * w, py * h, p.size * (0.5 + p.layer), 0, Math.PI * 2);
        ctx.fill();
      }

      // static preview fox — reuses the same silhouette language as the live
      // player (kept in sync with Player.draw()'s proportions/shapes; see
      // player.js if that changes — updated here to match the simplified
      // single-piece tail and rounded legs used in live gameplay).
      ctx.save();
      ctx.translate(w * 0.32, h * 0.78);
      ctx.scale(CONFIG.player.scale, CONFIG.player.scale);
      ctx.fillStyle = '#050506';
      // tail — single smooth curling shape tapering to a point, matching
      // Player.draw()'s simplified tail (no separate strand pieces/tip blobs)
      ctx.save();
      ctx.translate(-12, -8);
      ctx.beginPath();
      ctx.moveTo(4, 6);
      ctx.quadraticCurveTo(-6, 6, -12, -2);
      ctx.quadraticCurveTo(-20, -11, -21, -21);
      ctx.quadraticCurveTo(-21.5, -28, -18, -32);
      ctx.quadraticCurveTo(-13.5, -29, -13, -22);
      ctx.quadraticCurveTo(-14, -13, -7, -5);
      ctx.quadraticCurveTo(-2, 0, 1, 4);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      // legs — rounded corners (roundRect with a manual-path fallback),
      // matching Player.draw()'s drawLeg() so legs read as part of one soft
      // silhouette instead of hard rectangular nubs
      const legR = 2;
      const drawLeg = (x, y, lw, lh) => {
        if (ctx.roundRect) {
          ctx.beginPath(); ctx.roundRect(x, y, lw, lh, legR); ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x + legR, y);
          ctx.lineTo(x + lw - legR, y);
          ctx.quadraticCurveTo(x + lw, y, x + lw, y + legR);
          ctx.lineTo(x + lw, y + lh - legR);
          ctx.quadraticCurveTo(x + lw, y + lh, x + lw - legR, y + lh);
          ctx.lineTo(x + legR, y + lh);
          ctx.quadraticCurveTo(x, y + lh, x, y + lh - legR);
          ctx.lineTo(x, y + legR);
          ctx.quadraticCurveTo(x, y, x + legR, y);
          ctx.closePath(); ctx.fill();
        }
      };
      drawLeg(-9, -2, 5, 7); drawLeg(4, -2, 5, 7);
      ctx.beginPath(); ctx.ellipse(0, -14, 17, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2, -2, 11, 4, 0, 0, Math.PI * 2); ctx.fill(); // belly patch, matches Player.draw()
      drawLeg(-2, -3, 5, 7); drawLeg(9, -3, 5, 7);
      // head — three-quarter view, mirrored from Player.draw() in player.js so
      // the splash preview matches the live gameplay character (both eyes
      // visible at once, wider skull, shorter centered snout)
      ctx.save();
      ctx.translate(10, -21);
      ctx.beginPath(); ctx.ellipse(0, 0, 10, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -2); ctx.quadraticCurveTo(6, -2.2, 8, 0.8); ctx.quadraticCurveTo(6, 3.6, 0, 3.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.9)';
      ctx.beginPath(); ctx.ellipse(7.5, 0.8, 1.4, 1.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#050506';
      ctx.beginPath(); ctx.moveTo(-7, -5); ctx.lineTo(-9, -16); ctx.lineTo(-2, -7); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(1, -6); ctx.lineTo(4, -20); ctx.lineTo(5, -8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath(); ctx.moveTo(1.5, -8); ctx.lineTo(3, -16); ctx.lineTo(4.5, -9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,248,230,0.95)';
      ctx.shadowColor = 'rgba(255,240,210,0.85)'; ctx.shadowBlur = 7;
      ctx.beginPath(); ctx.ellipse(-3, -3, 2.3, 2.3, 0, 0, Math.PI * 2); ctx.fill(); // far eye (larger)
      ctx.beginPath(); ctx.ellipse(4, -2, 1.9, 1.9, 0, 0, Math.PI * 2); ctx.fill(); // near eye (smaller)
      ctx.shadowBlur = 0;
      ctx.restore();
      ctx.restore();

      ctx.fillStyle = '#050506';
      ctx.fillRect(0, h * 0.8, w, h * 0.2);
      ctx.fillRect(0, h * 0.78, w * 0.5, h * 0.03);

      // keep animating only while the splash screen is actually visible —
      // avoids burning CPU on a hidden canvas once gameplay starts
      const splashEl = document.getElementById('screen-splash');
      if (splashEl && splashEl.classList.contains('active')) {
        splashAnimHandle = requestAnimationFrame(frame);
      } else {
        splashAnimHandle = null;
      }
    }

    if (splashAnimHandle) cancelAnimationFrame(splashAnimHandle);
    frame();
  }

  // ---------------------------------------------------------------------
  // Wiring: screen transitions
  // ---------------------------------------------------------------------
  function boot() {
    gameCanvas = document.getElementById('game-canvas');
    gameCtx = gameCanvas.getContext('2d');
    input = new InputManager();

    applyViewportSize();
    window.addEventListener('resize', applyViewportSize);

    drawStaticAtmosphere('splash-canvas');

    document.getElementById('screen-splash').addEventListener('click', () => {
      audioSystem.init();
      showScreen('gameplay');
      resizeCanvas();
      initGameplay();
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    }, { once: true });

    document.getElementById('pause-btn').addEventListener('click', () => {
      running = false;
      updateHeartsUI(); updateLightUI();
      showScreen('pause');
    });
    document.getElementById('btn-resume').addEventListener('click', () => {
      showScreen('gameplay');
      running = true;
      lastTime = performance.now();
      requestAnimationFrame(loop);
    });
    document.getElementById('btn-exit').addEventListener('click', () => {
      running = false;
      showScreen('splash');
      drawStaticAtmosphere('splash-canvas'); // restart its rAF loop, which stops itself once the screen isn't active
    });
    document.getElementById('btn-collection').addEventListener('click', () => {
      renderCollection();
      showScreen('collection');
    });
    document.getElementById('btn-map').addEventListener('click', () => {
      renderMap();
      showScreen('map');
    });
    document.getElementById('btn-settings').addEventListener('click', () => showScreen('settings'));
    document.querySelectorAll('[data-back]').forEach(btn => {
      btn.addEventListener('click', () => showScreen(btn.dataset.back));
    });

    document.getElementById('setting-music').addEventListener('input', e => audioSystem.setMusicVolume(e.target.value / 100));
    document.getElementById('setting-sfx').addEventListener('input', e => audioSystem.setSfxVolume(e.target.value / 100));

    document.getElementById('btn-continue').addEventListener('click', () => {
      showScreen('splash');
      drawStaticAtmosphere('splash-canvas'); // restart its rAF loop, which stops itself once the screen isn't active
    });
  }

  function renderCollection() {
    const grid = document.getElementById('collection-grid');
    grid.innerHTML = '';
    for (let i = 0; i < saveState.totalLights; i++) {
      const slot = document.createElement('div');
      const collected = lights[i] && lights[i].collected;
      slot.className = 'collection-slot' + (collected ? ' filled' : '');
      if (collected) slot.innerHTML = '<div class="dot"></div>';
      grid.appendChild(slot);
    }
  }

  function renderMap() {
    const c = document.getElementById('map-canvas');
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr;
    const ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.fillStyle = '#0e0e11';
    ctx.fillRect(0, 0, rect.width, rect.height);
    const n = LEVEL.lights.length;
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const x = rect.width * (0.3 + 0.4 * Math.sin(i * 1.3));
      const y = rect.height - (i / (n - 1)) * (rect.height - 20) - 10;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    for (let i = 0; i < n; i++) {
      const x = rect.width * (0.3 + 0.4 * Math.sin(i * 1.3));
      const y = rect.height - (i / (n - 1)) * (rect.height - 20) - 10;
      const collected = lights[i] && lights[i].collected;
      ctx.fillStyle = collected ? '#e8c07d' : 'rgba(255,255,255,0.2)';
      ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
    }
    const progress = 1 - Math.min(1, player.y / (LEVEL.heightTiles * TILE));
    ctx.fillStyle = '#f5f2e8';
    ctx.beginPath();
    ctx.arc(rect.width * 0.5, rect.height - progress * (rect.height - 20) - 10, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
