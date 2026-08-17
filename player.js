// player.js — Wisp: physics, animation state machine, painterly procedural fox render.
// Tunable feel/scale values live in CONFIG.player (config.js).

const PT = CONFIG.player; // shorthand

const STATE = {
  IDLE: 'idle', WALK: 'walk', RUN: 'run', JUMP: 'jump', FALL: 'fall',
  LAND: 'land', CLIMB: 'climb', WALLSLIDE: 'wallslide', HANG: 'hang',
  CROUCH: 'crouch', ALERT: 'alert', BITE: 'bite', SCARED: 'scared',
  LOOKUP: 'lookup', LOOKDOWN: 'lookdown', HAPPY: 'happy', SIT: 'sit',
  SLEEP: 'sleep', WAKE: 'wake', STRETCH: 'stretch', SHAKE: 'shake',
};

class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.onWall = 0;
    this.climbing = false;
    this.dropThroughTimer = 0;

    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.jumpHoldTimer = 0;
    this.isJumping = false;
    this.crouchPrepTimer = 0; // brief pre-jump crouch anticipation

    this.hp = 3;
    this.maxHp = 3;
    this.lights = 0;
    this.invuln = 0;

    this.state = STATE.IDLE;
    this.animTime = 0;
    this.idleTime = 0;
    this.biteTimer = 0;
    this.attackCooldown = 0;
    this.alertTimer = 0;
    this.landSquash = 0;
    this.landDust = 0;    // drives small landing dust puff
    this.dustParticles = [];

    // secondary motion
    this.tailPhase = Math.random() * 10;
    this.earFlickTimer = 2 + Math.random() * 3;
    this.blinkTimer = 2 + Math.random() * 3;
    this.headTiltTimer = 4 + Math.random() * 4;
    this.headTilt = 0;
  }

  get w() { return PT.colliderW; }
  get h() { return PT.colliderH; }

  rect() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  bite() {
    if (this.attackCooldown <= 0) {
      this.biteTimer = 0.28;
      this.attackCooldown = PT.attackCooldown;
      return true;
    }
    return false;
  }

  isBiteActive() {
    const elapsed = 0.28 - this.biteTimer;
    return elapsed >= PT.attackActiveWindow[0] && elapsed <= PT.attackActiveWindow[1];
  }

  hurt(dir) {
    if (this.invuln > 0) return;
    this.hp = Math.max(0, this.hp - 1);
    this.invuln = PT.invulnDuration;
    this.vy = -300;
    this.vx = (dir || this.facing * -1) * 220;
    this.state = STATE.SCARED;
    this.alertTimer = 0.6;
  }

  update(dt, input, solids) {
    this.animTime += dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.biteTimer > 0) this.biteTimer -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;
    if (this.alertTimer > 0) this.alertTimer -= dt;
    if (this.dropThroughTimer > 0) this.dropThroughTimer -= dt;
    if (this.landSquash > 0) this.landSquash -= dt * 4;
    if (this.landDust > 0) this.landDust -= dt * 2.5;

    const wantLeft = input.moveX < -0.2;
    const wantRight = input.moveX > 0.2;
    const wantUp = input.moveY < -0.2;
    const wantDown = input.moveY > 0.2;

    // --- Horizontal movement ---
    const targetSpeed = (wantLeft ? -1 : wantRight ? 1 : 0) * PT.moveSpeed;
    const control = this.onGround ? 1 : PT.airControl;
    if (targetSpeed !== 0) {
      this.facing = targetSpeed > 0 ? 1 : -1;
      const diff = targetSpeed - this.vx;
      this.vx += Math.sign(diff) * PT.accel * control * dt;
      if (Math.sign(diff) !== Math.sign(targetSpeed - this.vx) && Math.sign(diff) !== 0) this.vx = targetSpeed;
    } else if (this.onGround) {
      const fr = PT.friction * dt;
      if (Math.abs(this.vx) <= fr) this.vx = 0;
      else this.vx -= Math.sign(this.vx) * fr;
    }

    // --- Wall climb / wall slide ---
    this.climbing = false;
    if (this.onWall !== 0 && !this.onGround) {
      if (wantUp) {
        this.climbing = true;
        this.vy = -PT.climbSpeed;
        this.vx = 0;
      } else if (wantDown) {
        this.climbing = true;
        this.vy = PT.climbSpeed;
        this.vx = 0;
      } else if (this.vy > 0) {
        this.vy = Math.min(this.vy, PT.wallSlideSpeed);
      }
    }

    // --- Gravity ---
    if (!this.climbing) {
      const g = (this.vy > 0 ? PT.gravity * PT.fallGravityMult : PT.gravity);
      this.vy += g * dt;
      this.vy = Math.min(this.vy, PT.maxFallSpeed);
    }

    // --- Jump buffering / coyote time ---
    if (this.onGround) this.coyoteTimer = PT.coyoteTime; else this.coyoteTimer -= dt;
    if (input.jumpPressed) this.jumpBufferTimer = PT.jumpBufferTime; else this.jumpBufferTimer -= dt;

    const canJump = this.coyoteTimer > 0 || this.onWall !== 0;
    if (this.jumpBufferTimer > 0 && canJump) {
      this.vy = PT.jumpVelocity;
      this.isJumping = true;
      this.jumpHoldTimer = PT.jumpHoldMaxTime;
      this.jumpBufferTimer = 0;
      this.coyoteTimer = 0;
      this.onGround = false;
      this.crouchPrepTimer = 0.08;
      if (this.onWall !== 0) { this.vx = -this.onWall * 260; this.onWall = 0; }
      this.landSquash = 0.6;
    }
    if (this.isJumping && input.jumpHeld && this.jumpHoldTimer > 0) {
      this.vy += PT.jumpHoldForce * dt;
      this.jumpHoldTimer -= dt;
    }
    if (!input.jumpHeld) this.isJumping = false;
    if (this.crouchPrepTimer > 0) this.crouchPrepTimer -= dt;

    // --- Drop through platforms ---
    if (wantDown && this.onGround) {
      this.dropThroughTimer = 0.25;
    }

    // --- Integrate & collide ---
    this.x += this.vx * dt;
    this.resolveHorizontal(solids);
    this.y += this.vy * dt;
    const wasOnGround = this.onGround;
    this.resolveVertical(solids);
    if (!wasOnGround && this.onGround && this.vy === 0) {
      const impactStrength = Math.min(1, Math.abs(this.vy) / 300 + 0.4);
      this.landSquash = Math.min(1, this.landSquash + 0.5);
      this.landDust = 1;
      this.spawnDust(impactStrength);
    }

    // --- Idle micro-animation timers ---
    const isIdleLike = this.onGround && Math.abs(this.vx) < 10 && !this.climbing;
    if (isIdleLike) { this.idleTime += dt; } else { this.idleTime = 0; }
    this.earFlickTimer -= dt;
    if (this.earFlickTimer <= 0) this.earFlickTimer = 2.5 + Math.random() * 3;
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0) this.blinkTimer = 2 + Math.random() * 3;
    this.headTiltTimer -= dt;
    if (this.headTiltTimer <= 0) { this.headTiltTimer = 4 + Math.random() * 5; this.headTiltGoal = (Math.random() - 0.5) * 0.35; }
    this.headTilt += ((this.headTiltGoal || 0) - this.headTilt) * Math.min(1, dt * 2);

    // --- Dust particles ---
    for (const d of this.dustParticles) {
      d.life -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.vy += 200 * dt;
    }
    this.dustParticles = this.dustParticles.filter(d => d.life > 0);

    // --- Secondary motion ---
    this.tailPhase += dt * (this.onGround && Math.abs(this.vx) > 20 ? 8 : 2.2);

    this.updateState(wantUp, wantDown);
  }

  spawnDust(strength) {
    const n = 4 + Math.round(strength * 3);
    for (let i = 0; i < n; i++) {
      this.dustParticles.push({
        x: this.x + (Math.random() - 0.5) * 14,
        y: this.y - 2,
        vx: (Math.random() - 0.5) * 60,
        vy: -20 - Math.random() * 30,
        life: 0.25 + Math.random() * 0.15,
        size: 2 + Math.random() * 2,
      });
    }
  }

  resolveHorizontal(solids) {
    const r = this.rect();
    this.onWall = 0;
    for (const s of solids) {
      if (s.dropThrough) continue;
      if (r.x < s.x + s.w && r.x + r.w > s.x && r.y < s.y + s.h && r.y + r.h > s.y) {
        if (this.vx > 0) { this.x = s.x - this.w / 2; if (s.wall) this.onWall = 1; }
        else if (this.vx < 0) { this.x = s.x + s.w + this.w / 2; if (s.wall) this.onWall = -1; }
        this.vx = 0;
      }
    }
  }

  resolveVertical(solids) {
    const r = this.rect();
    this.onGround = false;
    this.groundSeed = 0;
    for (const s of solids) {
      const overlapX = r.x < s.x + s.w && r.x + r.w > s.x;
      if (!overlapX) continue;
      if (s.dropThrough && this.dropThroughTimer > 0) continue;
      const rBottom = r.y + r.h;
      if (this.vy >= 0 && rBottom > s.y && rBottom < s.y + s.h + 14 && r.y < s.y) {
        this.y = s.y;
        this.vy = 0;
        this.onGround = true;
        this.groundSeed = s.seed || 0;
      } else if (!s.dropThrough && this.vy < 0 && r.y < s.y + s.h && r.y > s.y && rBottom > s.y + s.h) {
        this.y = s.y + s.h + this.h;
        this.vy = 0;
      }
    }
  }

  updateState(wantUp, wantDown) {
    if (this.alertTimer > 0 && this.hp < this.maxHp) { this.state = STATE.SCARED; return; }
    if (this.biteTimer > 0.14) { this.state = STATE.BITE; return; }
    if (this.climbing) { this.state = STATE.CLIMB; return; }
    if (this.onWall !== 0 && !this.onGround) { this.state = STATE.WALLSLIDE; return; }
    if (this.crouchPrepTimer > 0) { this.state = STATE.CROUCH; return; }
    if (!this.onGround) { this.state = this.vy < 0 ? STATE.JUMP : STATE.FALL; return; }
    if (this.landSquash > 0.4) { this.state = STATE.LAND; return; }
    if (wantDown) { this.state = STATE.CROUCH; return; }
    if (wantUp && Math.abs(this.vx) < 10) { this.state = STATE.LOOKUP; return; }
    const speed = Math.abs(this.vx);
    if (speed > 260) this.state = STATE.RUN;
    else if (speed > 10) this.state = STATE.WALK;
    else this.state = STATE.IDLE;
  }

  // -------------------------------------------------------------------
  // Procedural draw — painterly silhouette fox. Draws in WORLD space;
  // caller must have applied the camera translation already.
  // Distinctly fox: long muzzle, tall pointed ears, big brush tail,
  // slim legs, compact body — not a blob/cat/dog silhouette.
  // -------------------------------------------------------------------
  draw(ctx) {
    const sx = this.x;
    const sy = this.y;
    const t = this.animTime;
    const speed = Math.abs(this.vx);
    const scale = PT.scale;

    // subtle breathing bob during idle
    const breathe = this.state === STATE.IDLE ? Math.sin(this.idleTime * 1.6) * 1.2 : 0;
    const bob = this.onGround && speed > 10 ? Math.sin(t * (speed > 260 ? 14 : 10)) * (speed > 260 ? 2.5 : 1.6) : breathe;

    // squash/stretch per state
    let squashX = 1, squashY = 1;
    if (this.state === STATE.CROUCH && this.crouchPrepTimer > 0) { squashX = 1.12; squashY = 0.82; }
    else if (this.state === STATE.JUMP) { squashX = 0.9; squashY = 1.14; }
    else if (this.state === STATE.FALL) { squashX = 1.04; squashY = 0.97; }
    else if (this.state === STATE.LAND) { squashX = 1.22; squashY = 0.76; }
    else if (this.state === STATE.RUN) { squashX = 1.05; squashY = 0.97; }

    // draw landing dust (world space, behind character)
    for (const d of this.dustParticles) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, d.life * 2.2);
      ctx.fillStyle = 'rgba(180,172,150,0.5)';
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.translate(sx, sy + bob);
    ctx.scale(this.facing * squashX * scale, squashY * scale);

    if (this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0) {
      ctx.globalAlpha = 0.45;
    }

    const bodyColor = '#0a0a0c';
    ctx.fillStyle = bodyColor;

    // --- tail: big, wispy, multi-strand plume that fans out and curls
    // backward — per app-icon.png, looser and flame-like rather than one
    // single solid brush shape. Built from a wide base wedge plus two
    // separate curling strands of different length/curl so the silhouette
    // reads as loose fanned fur instead of a smooth paddle. ---
    const tailWag = Math.sin(this.tailPhase) * (this.state === STATE.SCARED ? 3 : this.state === STATE.RUN ? 12 : 7);
    const tailLift = this.state === STATE.JUMP ? -6 : this.state === STATE.FALL ? 4 : 0;
    ctx.save();
    ctx.translate(-12, -8 + tailLift);
    ctx.rotate((tailWag + (this.state === STATE.SCARED ? 22 : 0)) * Math.PI / 180);

    // wide base wedge — anchors the tail to the body
    ctx.beginPath();
    ctx.moveTo(4, 6);
    ctx.quadraticCurveTo(-4, 5, -9, 0);
    ctx.quadraticCurveTo(-12, -4, -10, -8);
    ctx.quadraticCurveTo(-4, -6, 1, -1);
    ctx.quadraticCurveTo(4, 3, 4, 6);
    ctx.closePath();
    ctx.fill();

    // strand 1 — longer, sweeps up and curls furthest back (the main plume)
    ctx.beginPath();
    ctx.moveTo(-2, -1);
    ctx.quadraticCurveTo(-14, -6, -20, -14);
    ctx.quadraticCurveTo(-25, -21, -22, -29);
    ctx.quadraticCurveTo(-19, -33, -14, -29);
    ctx.quadraticCurveTo(-18, -24, -14, -18);
    ctx.quadraticCurveTo(-9, -10, -1, -4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-20, -28, 5, 4, 0.4, 0, Math.PI * 2);
    ctx.fill();

    // strand 2 — shorter, fans out at a wider angle so the tail reads as
    // separated tufts rather than one solid mass
    ctx.beginPath();
    ctx.moveTo(-6, 2);
    ctx.quadraticCurveTo(-15, 1, -19, -6);
    ctx.quadraticCurveTo(-21, -11, -18, -15);
    ctx.quadraticCurveTo(-14, -12, -12, -7);
    ctx.quadraticCurveTo(-9, -1, -3, 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-18, -13, 4, 3.2, 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // --- hind legs: short and stubby. Only cycle the walk phase while
    // actually moving on the ground — otherwise freeze at a neutral pose
    // so idle Wisp doesn't look like it's marching in place. ---
    const isWalkingLike = this.onGround && speed > 10 && !this.climbing;
    const legPhase = isWalkingLike ? Math.sin(t * (this.state === STATE.RUN ? 16 : 10)) : 0;
    const legLift = this.climbing ? 2 : 0;
    if (this.state === STATE.FALL || this.state === STATE.JUMP) {
      ctx.fillRect(-8, -5, 5, 6);
      ctx.fillRect(3, -5, 5, 6);
    } else {
      ctx.fillRect(-9 + legPhase * 3, -2 - legLift, 5, 7);
      ctx.fillRect(4 - legPhase * 3, -2 - legLift, 5, 7);
    }

    // --- body: big, round, fluffy — chibi proportions, not a slim/realistic fox ---
    ctx.beginPath();
    ctx.ellipse(0, -14, 17, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    // belly patch — closes the visual gap between the body ellipse's bottom
    // edge (y=-1) and the top of the legs (y=-3/-2), which previously left
    // a thin sliver of background showing through like a hole in the torso
    ctx.beginPath();
    ctx.ellipse(3, -4, 13, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // fluffy chest tuft (rounder, more prominent — matches the puffed-out chest in the reference)
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    ctx.beginPath();
    ctx.ellipse(4, -9, 10, 6.5, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bodyColor;

    // --- front legs: short and stubby ---
    ctx.fillRect(-2 - legPhase * 2.5, -3, 5, 7);
    ctx.fillRect(9 + legPhase * 2.5, -3, 5, 7);

    // --- head: three-quarter view, per app-icon.png — turned enough toward
    // the viewer that both glowing eyes read at once, even though the body
    // stays in profile. Achieved by widening the skull toward the camera
    // side, shortening the snout so it no longer reads as a flat side
    // profile, and placing both eyes side by side near the head's center
    // rather than one eye hidden behind the muzzle. ---
    const headTiltRad = this.headTilt + (this.state === STATE.LOOKUP ? -0.4 : this.state === STATE.LOOKDOWN ? 0.3 : 0);
    const headBobY = this.state === STATE.LOOKUP ? -5 : this.state === STATE.SCARED ? 1 : 0;
    ctx.save();
    ctx.translate(10, -21 + headBobY);
    ctx.rotate(headTiltRad);

    // head/skull — wider than a profile view would be, so the far cheek
    // is still visible (this is what sells the three-quarter turn)
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // short, centered snout — angled toward the viewer rather than
    // projecting straight out to the side like a full profile muzzle
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.quadraticCurveTo(6, -2.2, 8, 0.8);
    ctx.quadraticCurveTo(6, 3.6, 0, 3.2);
    ctx.closePath();
    ctx.fill();
    // nose tip
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.beginPath();
    ctx.ellipse(7.5, 0.8, 1.4, 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bodyColor;

    // ears — near ear (bigger, forward) and far ear (smaller, set back),
    // both visible at once rather than the far one hidden behind the head
    const earFlick = this.earFlickTimer < 0.15 ? Math.sin(this.earFlickTimer * 40) * 6 : 0;
    const earAlert = (this.state === STATE.SCARED || this.alertTimer > 0) ? 3 : 0;
    // far ear (smaller, set back toward the top-left of the skull)
    ctx.beginPath();
    ctx.moveTo(-7, -5);
    ctx.lineTo(-9, -16 + earFlick * 0.25 - earAlert * 0.8);
    ctx.lineTo(-2, -7);
    ctx.closePath();
    ctx.fill();
    // near ear (bigger, more forward/central — reads closest to the viewer)
    ctx.beginPath();
    ctx.moveTo(1, -6);
    ctx.lineTo(4, -20 - earFlick * 0.3 - earAlert);
    ctx.lineTo(5, -8);
    ctx.closePath();
    ctx.fill();
    // inner-ear subtle dark detail on the near ear only (reads as depth, not color)
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.moveTo(1.5, -8);
    ctx.lineTo(3, -16);
    ctx.lineTo(4.5, -9);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = bodyColor;

    // eyes — both visible side by side near the head's center, the key
    // three-quarter-view trait (a strict profile would hide the far eye
    // behind the snout). Far eye is now the larger of the two (swapped
    // from the previous pass) so it reads with more presence, while the
    // near eye sits slightly smaller — still keeping a touch of depth
    // without losing either one's glow.
    const blink = this.blinkTimer < 0.12 ? 0.12 : 1;
    ctx.fillStyle = 'rgba(255,248,230,0.95)';
    ctx.shadowColor = 'rgba(255,240,210,0.85)';
    ctx.shadowBlur = 7;
    ctx.beginPath();
    ctx.ellipse(-1.5, -3, 2.3, 2.3 * blink, 0, 0, Math.PI * 2); // far eye (now larger)
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(2.5, -2, 1.9, 1.9 * blink, 0, 0, Math.PI * 2); // near eye (now smaller)
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore(); // end head transform

    ctx.restore(); // end body transform
  }
}
