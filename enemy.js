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
  }

  rect() {
    return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h };
  }

  update(dt, solids, player) {
    this.t += dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.alertTimer > 0) this.alertTimer -= dt;

    // notice the player when close — brief alert reaction (ears/posture read via draw)
    const distToPlayer = Math.abs(this.x - player.x);
    if (distToPlayer < 90 && Math.abs(this.y - player.y) < 60) this.alertTimer = Math.max(this.alertTimer, 0.4);

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

    // contact with player
    if (this.alive && player.hp > 0) {
      const pr = player.rect();
      const er = this.rect();
      const overlap = pr.x < er.x + er.w && pr.x + pr.w > er.x && pr.y < er.y + er.h && pr.y + pr.h > er.y;
      if (overlap) {
        if (player.isBiteActive()) {
          this.takeHit();
        } else if (player.invuln <= 0) {
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

  takeHit() {
    if (this.type === 'sheller' && !this.shellClosed) {
      this.shellClosed = true;
      this.shellTimer = this.shellTime;
      this.hitFlash = 0.15;
      return;
    }
    this.hp -= 1;
    this.hitFlash = 0.15;
    if (this.hp <= 0) this.alive = false;
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
