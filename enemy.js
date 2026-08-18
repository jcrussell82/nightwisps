// enemy.js — forest creatures. Prototype ships with only "Walker" active
// per the polish-first directive; other types remain defined for later use
// but are not placed in LEVEL.enemies yet.

const ENEMY_DEFS = {
  walker: { w: 22, h: 15, speed: 45, hp: CONFIG.enemy.walkerHp, color: '#08080a' },
  hopper: { w: 20, h: 18, speed: 0, hp: 1, color: '#08080a', hopForce: -380, hopInterval: 1.6 },
  flyer: { w: 24, h: 14, speed: 70, hp: 1, color: '#08080a', flySpan: 60 },
  beetle: { w: 26, h: 16, speed: 30, hp: 2, color: '#08080a' },
  sheller: { w: 24, h: 18, speed: 0, hp: 2, color: '#08080a', shellTime: 1.2 },
};

class Enemy {
  constructor(type, x, y) {
    this.type = type;
    const def = ENEMY_DEFS[type];
    Object.assign(this, def);
    this.x = x; this.y = y;
    this.vx = (Math.random() < 0.5 ? -1 : 1) * this.speed;
    this.vy = 0;
    this.alive = true;
    this.t = Math.random() * 10;
    this.hitFlash = 0;
    this.originX = x;
    this.shellClosed = false;
    this.shellTimer = 0;
    this.hopTimer = (this.hopInterval || 1.5) * Math.random();
    this.alertTimer = 0;
    this.legPhaseOffset = Math.random() * 10;
    // Brief stun + knockback after being hit — without this, a landed bite
    // left the enemy still overlapping the player on the very next frame
    // (bite range is body-touch range, so hitting something and standing
    // next to it are the same distance), and the enemy's contact-damage
    // check would immediately hurt the player right back with no window
    // to follow up or retreat. This creates the separation a real hit
    // needs: knocked back, can't deal contact damage, briefly can't act.
    this.hitStunTimer = 0;
  }

  rect() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  update(dt, solids, player) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.alertTimer > 0) this.alertTimer -= dt;
    if (this.hitStunTimer > 0) this.hitStunTimer -= dt;

    // notice the player when close — brief alert reaction (ears/posture read via draw)
    const distToPlayer = Math.abs(this.x - player.x);
    if (distToPlayer < 90 && Math.abs(this.y - player.y) < 60) this.alertTimer = Math.max(this.alertTimer, 0.4);

    if (this.hitStunTimer > 0) {
      // While stunned: let the knockback velocity carry the enemy away and
      // apply gravity/ground collision as normal, but skip the type's usual
      // patrol/hop/fly AI so it doesn't fight the knockback or immediately
      // walk back into the player.
      this.updateGravity(dt, solids);
      this.x += this.vx * dt;
      this.vx *= Math.max(0, 1 - dt * 6); // friction, settles out over the stun window
    } else {
      switch (this.type) {
        case 'walker':
        case 'beetle':
          this.updateGravity(dt, solids);
          this.x += this.vx * dt;
          if (Math.abs(this.x - this.originX) > 70) this.vx *= -1;
          this.turnAtEdges(solids);
          break;
        case 'hopper':
          this.updateGravity(dt, solids);
          this.hopTimer -= dt;
          if (this.hopTimer <= 0 && this.onGround) {
            this.vy = this.hopForce;
            this.vx = (player.x < this.x ? -1 : 1) * 90;
            this.hopTimer = this.hopInterval;
          }
          if (this.onGround) this.vx *= 0.9;
          this.x += this.vx * dt;
          break;
        case 'flyer':
          this.x = this.originX + Math.sin(this.t * 0.8) * this.flySpan;
          this.y += Math.sin(this.t * 1.6) * 12 * dt;
          break;
        case 'sheller':
          if (this.shellClosed) {
            this.shellTimer -= dt;
            if (this.shellTimer <= 0) this.shellClosed = false;
          }
          this.updateGravity(dt, solids);
          break;
      }
    }

    // contact with player
    if (this.alive && player.hp > 0) {
      const pr = player.rect();
      const er = this.rect();
      const overlap = pr.x < er.x + er.w && pr.x + pr.w > er.x && pr.y < er.y + er.h && pr.y + pr.h > er.y;
      if (overlap) {
        if (player.isBiteActive()) {
          this.takeHit(player.x);
        } else if (player.invuln <= 0 && this.hitStunTimer <= 0) {
          // hitStunTimer <= 0: a freshly-hit enemy can't deal contact damage
          // back during its stun window — see constructor comment.
          player.hurt(this.x < player.x ? -1 : 1);
        }
      }
    }
  }

  updateGravity(dt, solids) {
    this.vy += 1200 * dt;
    this.vy = Math.min(this.vy, 800);
    this.y += this.vy * dt;
    this.onGround = false;
    const r = this.rect();
    for (const s of solids) {
      if (s.dropThrough) continue;
      const overlapX = r.x < s.x + s.w && r.x + r.w > s.x;
      if (!overlapX) continue;
      const rBottom = r.y + r.h;
      if (this.vy >= 0 && rBottom > s.y && rBottom < s.y + s.h + 14 && r.y < s.y) {
        this.y = s.y;
        this.vy = 0;
        this.onGround = true;
      }
    }
  }

  turnAtEdges(solids) {
    const r = this.rect();
    const aheadX = this.x + Math.sign(this.vx) * (this.w / 2 + 4);
    let supported = false;
    for (const s of solids) {
      if (s.dropThrough) continue;
      if (aheadX > s.x && aheadX < s.x + s.w && Math.abs(this.y - s.y) < 6) { supported = true; break; }
    }
    if (!supported) this.vx *= -1;
  }

  takeHit(playerX) {
    if (this.type === 'sheller' && !this.shellClosed) {
      this.shellClosed = true;
      this.shellTimer = this.shellTime;
      this.hitFlash = 0.15;
      return;
    }
    this.hp -= 1;
    this.hitFlash = 0.15;
    if (this.hp <= 0) {
      this.alive = false;
      return;
    }
    // Knock back away from the player and briefly stun so a landed hit
    // creates real separation instead of leaving both parties still
    // touching on the next frame (see constructor comment on hitStunTimer).
    this.hitStunTimer = 0.35;
    const dir = playerX != null && playerX > this.x ? -1 : 1;
    this.vx = dir * 180;
  }

  // Draws in WORLD space — caller must have already applied the camera
  // translation to the canvas context.
  draw(ctx) {
    const sx = this.x;
    const sy = this.y;
    ctx.save();
    ctx.translate(sx, sy);
    if (this.vx !== 0) ctx.scale(this.vx < 0 ? -1 : 1, 1);

    const flashColor = this.hitFlash > 0 ? 'rgba(232,192,125,0.9)' : '#08080a';
    ctx.fillStyle = flashColor;

    switch (this.type) {
      case 'walker':
        this.drawWalker(ctx, flashColor);
        break;
      case 'hopper':
        ctx.beginPath(); ctx.ellipse(0, -this.h / 2, this.w / 2, this.h / 2, 0, 0, Math.PI * 2); ctx.fill();
        break;
      case 'flyer': {
        ctx.beginPath(); ctx.ellipse(0, -this.h / 2, this.w / 2, this.h / 3, 0, 0, Math.PI * 2); ctx.fill();
        const wingFlap = Math.sin(this.t * 14) * 8;
        ctx.beginPath();
        ctx.moveTo(-4, -this.h / 2);
        ctx.lineTo(-16, -this.h / 2 - wingFlap);
        ctx.lineTo(-4, -this.h / 2 + 4);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'beetle':
        ctx.beginPath(); ctx.ellipse(0, -this.h / 2, this.w / 2, this.h / 2, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, -this.h); ctx.lineTo(0, 0); ctx.stroke();
        break;
      case 'sheller':
        ctx.beginPath();
        ctx.ellipse(0, -this.h / 2, this.w / 2, this.shellClosed ? this.h / 2 : this.h / 2.4, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
    }

    // glowing eye — same visual language as Wisp but smaller/dimmer, keeps
    // Walker clearly a distinct creature rather than a Wisp palette-swap
    if (!(this.type === 'sheller' && this.shellClosed)) {
      const alertBoost = this.alertTimer > 0 ? 1.3 : 1;
      ctx.fillStyle = 'rgba(235,225,200,0.75)';
      ctx.shadowColor = 'rgba(235,225,200,0.6)';
      ctx.shadowBlur = 4 * alertBoost;
      ctx.beginPath();
      ctx.ellipse(this.w / 4, -this.h * 0.62, 1.4 * alertBoost, 1.4 * alertBoost, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  // Walker: low, rounded shadow-creature body with small hunched posture
  // and simple stepping legs — deliberately distinct from Wisp's fox shape
  // (no ears, no tail, no muzzle) so the two silhouettes never read alike.
  drawWalker(ctx, color) {
    const legPhase = Math.sin(this.t * 8 + this.legPhaseOffset);
    ctx.fillStyle = color;

    // legs
    ctx.fillRect(-7 + legPhase * 2, -3, 3, 5);
    ctx.fillRect(3 - legPhase * 2, -3, 3, 5);

    // hunched body — slightly asymmetric blob, low to the ground
    ctx.beginPath();
    ctx.moveTo(-this.w / 2, -3);
    ctx.quadraticCurveTo(-this.w / 2, -this.h, 0, -this.h - 2);
    ctx.quadraticCurveTo(this.w / 2, -this.h, this.w / 2, -3);
    ctx.quadraticCurveTo(this.w / 4, -1, 0, -1);
    ctx.quadraticCurveTo(-this.w / 4, -1, -this.w / 2, -3);
    ctx.closePath();
    ctx.fill();
  }
}

// ---------------------------------------------------------------------------
// The Watcher — first boss, guards the end of Misty Bridge (level 2).
// Per mood-style.png: a larger hunched/crawling black silhouette figure with
// glowing eyes. Design: a bigger, tougher walker-like creature that alternates
// between a slow stalking crawl and a telegraphed lunge attack, with a brief
// vulnerable/stunned recovery window after each lunge where it can be bitten
// safely. Three-hit fight (matches the "few solid hits" feel of the existing
// enemies' hp values, just scaled up for a boss).
// ---------------------------------------------------------------------------
const BOSS_DEFS = {
  watcher: { w: 58, h: 46, speed: 55, hp: 5, lungeSpeed: 340, lungeDuration: 0.5, telegraphDuration: 0.6, recoverDuration: 0.9 },
};

const BOSS_STATE = { STALK: 'stalk', TELEGRAPH: 'telegraph', LUNGE: 'lunge', RECOVER: 'recover', DEFEATED: 'defeated' };

class Boss {
  constructor(type, x, y, arena) {
    this.type = type;
    const def = BOSS_DEFS[type];
    Object.assign(this, def);
    this.maxHp = this.hp;
    this.x = x; this.y = y;
    this.arena = arena || null; // {left, right, y} — keeps the boss from wandering off its platform
    this.vx = 0; this.vy = 0;
    this.alive = true;
    this.defeated = false;
    this.t = 0;
    this.state = BOSS_STATE.STALK;
    this.stateTimer = 1.2; // brief pause before the first advance, reads as "waking up"
    this.facing = -1;
    this.hitFlash = 0;
    this.hitStunTimer = 0;
    this.introDone = false;
  }

  rect() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  // Vulnerable window — only during RECOVER does a bite land without the
  // boss's own contact damage immediately retaliating, mirroring the
  // hitStunTimer pattern used by regular enemies but gated to a specific
  // attack-pattern phase instead of purely post-hit.
  isVulnerable() {
    return this.state === BOSS_STATE.RECOVER || this.hitStunTimer > 0;
  }

  update(dt, solids, player) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.hitStunTimer > 0) this.hitStunTimer -= dt;
    if (this.defeated) return;

    this.facing = player.x < this.x ? -1 : 1;

    this.updateGravity(dt, solids);

    switch (this.state) {
      case BOSS_STATE.STALK: {
        // slow crawl toward the player, clamped to the arena bounds
        const dir = player.x < this.x ? -1 : 1;
        this.vx = dir * this.speed;
        this.x += this.vx * dt;
        if (this.arena) {
          this.x = Math.max(this.arena.left + this.w / 2, Math.min(this.x, this.arena.right - this.w / 2));
        }
        this.stateTimer -= dt;
        const distToPlayer = Math.abs(this.x - player.x);
        if (this.stateTimer <= 0 && distToPlayer < 140) {
          this.state = BOSS_STATE.TELEGRAPH;
          this.stateTimer = this.telegraphDuration;
          this.lungeDir = dir;
        } else if (this.stateTimer <= 0) {
          this.stateTimer = 0.4; // keep stalking, re-check soon
        }
        break;
      }
      case BOSS_STATE.TELEGRAPH: {
        // hunker down, visibly winding up — no movement, easy to read and dodge
        this.vx = 0;
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = BOSS_STATE.LUNGE;
          this.stateTimer = this.lungeDuration;
        }
        break;
      }
      case BOSS_STATE.LUNGE: {
        this.vx = this.lungeDir * this.lungeSpeed;
        this.x += this.vx * dt;
        if (this.arena) {
          this.x = Math.max(this.arena.left + this.w / 2, Math.min(this.x, this.arena.right - this.w / 2));
        }
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = BOSS_STATE.RECOVER;
          this.stateTimer = this.recoverDuration;
          this.vx = 0;
        }
        break;
      }
      case BOSS_STATE.RECOVER: {
        // stunned and vulnerable after the lunge — this is the safe window
        // to land a bite, mirroring how regular enemies get a post-hit
        // hitStunTimer, except here it's a designed part of the attack cycle
        this.vx *= Math.max(0, 1 - dt * 6);
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) {
          this.state = BOSS_STATE.STALK;
          this.stateTimer = 0.8;
        }
        break;
      }
    }

    // contact with player
    if (this.alive && !this.defeated && player.hp > 0) {
      const pr = player.rect();
      const er = this.rect();
      const overlap = pr.x < er.x + er.w && pr.x + pr.w > er.x && pr.y < er.y + er.h && pr.y + pr.h > er.y;
      if (overlap) {
        if (player.isBiteActive() && this.isVulnerable()) {
          this.takeHit(player.x);
        } else if (player.invuln <= 0 && this.state === BOSS_STATE.LUNGE) {
          // only the lunge itself deals contact damage — stalking near the
          // boss or biting during recovery should never hurt the player,
          // so the fight reads as fair and its danger windows are clear
          player.hurt(this.x < player.x ? -1 : 1);
        }
      }
    }
  }

  updateGravity(dt, solids) {
    this.vy += 1200 * dt;
    this.vy = Math.min(this.vy, 800);
    this.y += this.vy * dt;
    this.onGround = false;
    const r = this.rect();
    for (const s of solids) {
      if (s.dropThrough) continue;
      const overlapX = r.x < s.x + s.w && r.x + r.w > s.x;
      if (!overlapX) continue;
      const rBottom = r.y + r.h;
      if (this.vy >= 0 && rBottom > s.y && rBottom < s.y + s.h + 14 && r.y < s.y) {
        this.y = s.y;
        this.vy = 0;
        this.onGround = true;
      }
    }
  }

  takeHit(playerX) {
    this.hp -= 1;
    this.hitFlash = 0.2;
    this.hitStunTimer = 0.3;
    if (this.hp <= 0) {
      this.alive = false;
      this.defeated = true;
      return;
    }
    // interrupt whatever attack phase it was in and force a brief recovery,
    // so a well-timed bite always creates breathing room rather than the
    // boss immediately continuing its lunge into the player
    this.state = BOSS_STATE.RECOVER;
    this.stateTimer = this.recoverDuration * 0.6;
    const dir = playerX != null && playerX > this.x ? -1 : 1;
    this.vx = dir * 120;
  }

  // Draws in WORLD space — caller must have already applied the camera
  // translation to the canvas context.
  draw(ctx) {
    if (this.defeated) return;
    const sx = this.x, sy = this.y;
    ctx.save();
    ctx.translate(sx, sy);
    if (this.facing !== 0) ctx.scale(this.facing < 0 ? -1 : 1, 1);

    const flashColor = this.hitFlash > 0 ? 'rgba(232,192,125,0.9)' : '#050507';
    ctx.fillStyle = flashColor;

    // telegraph: a subtle pre-lunge crouch/shudder read via a slight squash
    const telegraphSquash = this.state === BOSS_STATE.TELEGRAPH
      ? 1 + Math.sin(this.t * 30) * 0.03 * (1 - this.stateTimer / this.telegraphDuration)
      : 1;

    ctx.save();
    ctx.scale(1, telegraphSquash);

    // hunched, crawling humanoid silhouette — wide low shoulders, long
    // dragging arms, no legs visible (crawls low to the ground), per the
    // mood-style.png reference art's hunched/crawling posture
    const crawlBob = Math.sin(this.t * 6) * 2;
    ctx.beginPath();
    ctx.moveTo(-this.w / 2, 0);
    ctx.quadraticCurveTo(-this.w / 2 - 6, -this.h * 0.35, -this.w * 0.3, -this.h * 0.75 + crawlBob);
    ctx.quadraticCurveTo(-this.w * 0.1, -this.h - 4 + crawlBob, this.w * 0.15, -this.h * 0.85 + crawlBob);
    ctx.quadraticCurveTo(this.w * 0.42, -this.h * 0.6, this.w / 2 + 4, -this.h * 0.15);
    ctx.quadraticCurveTo(this.w * 0.3, -2, 0, -1);
    ctx.quadraticCurveTo(-this.w * 0.3, -2, -this.w / 2, 0);
    ctx.closePath();
    ctx.fill();

    // long dragging front arm/limb, reaching toward its facing direction —
    // extends further during the lunge to sell the attack's reach
    const armReach = this.state === BOSS_STATE.LUNGE ? this.w * 0.55 : this.w * 0.3;
    ctx.beginPath();
    ctx.moveTo(this.w * 0.2, -this.h * 0.3);
    ctx.quadraticCurveTo(this.w * 0.5, -this.h * 0.1, armReach, 2);
    ctx.lineTo(armReach - 4, 6);
    ctx.quadraticCurveTo(this.w * 0.4, -this.h * 0.05, this.w * 0.1, -this.h * 0.22);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // two glowing eyes — larger/brighter than regular enemies' single eye,
    // reading as more dangerous, per the reference art's glowing-eyed boss
    const eyeGlow = this.state === BOSS_STATE.TELEGRAPH ? 1.6 : 1;
    ctx.fillStyle = 'rgba(235,225,200,0.85)';
    ctx.shadowColor = 'rgba(235,225,200,0.7)';
    ctx.shadowBlur = 6 * eyeGlow;
    ctx.beginPath();
    ctx.ellipse(this.w * 0.14, -this.h * 0.68, 2.2 * eyeGlow, 2.2 * eyeGlow, 0, 0, Math.PI * 2);
    ctx.ellipse(this.w * 0.3, -this.h * 0.7, 2.2 * eyeGlow, 2.2 * eyeGlow, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}
