// input.js — floating virtual joystick + jump/attack buttons.
// Frosted-glass, appears where touched, minimal and translucent.

class InputManager {
  constructor() {
    this.moveX = 0;
    this.moveY = 0;
    this.jumpHeld = false;
    this.jumpPressed = false; // edge-triggered, consumed by Player each frame
    this.attackPressed = false;
    this.downHeld = false;

    this._jumpPressedQueued = false;
    this._attackPressedQueued = false;

    this.joystickActive = false;
    this.joystickTouchId = null;
    this.joystickOrigin = { x: 0, y: 0 };
    this.joystickCurrent = { x: 0, y: 0 };

    this._bind();
  }

  _bind() {
    const zone = document.getElementById('joystick-zone');
    const base = document.createElement('div');
    base.className = 'joystick-base';
    base.innerHTML = `
      <div class="joystick-arrows">
        <span class="arrow-up"></span><span class="arrow-down"></span>
        <span class="arrow-left"></span><span class="arrow-right"></span>
      </div>
      <div class="joystick-stick"></div>`;
    zone.appendChild(base);
    this.joyBase = base;
    this.joyStick = base.querySelector('.joystick-stick');

    const maxRadius = CONFIG.controls.joystickRadius;

    const start = (id, x, y) => {
      this.joystickActive = true;
      this.joystickTouchId = id;
      this.joystickOrigin = { x, y };
      this.joystickCurrent = { x, y };
      base.style.left = x + 'px';
      base.style.top = y + 'px';
      base.classList.add('visible', 'active');
    };
    const move = (x, y) => {
      if (!this.joystickActive) return;
      let dx = x - this.joystickOrigin.x;
      let dy = y - this.joystickOrigin.y;
      const dist = Math.hypot(dx, dy);
      if (dist > maxRadius) { dx = dx / dist * maxRadius; dy = dy / dist * maxRadius; }
      this.joystickCurrent = { x: this.joystickOrigin.x + dx, y: this.joystickOrigin.y + dy };
      this.joyStick.style.left = dx + 'px';
      this.joyStick.style.top = dy + 'px';
      const nx = dx / maxRadius, ny = dy / maxRadius;
      const dz = CONFIG.controls.joystickDeadzone;
      this.moveX = Math.abs(nx) < dz ? 0 : nx;
      this.moveY = Math.abs(ny) < dz ? 0 : ny;
      this.downHeld = this.moveY > 0.5;
    };
    const end = () => {
      this.joystickActive = false;
      this.joystickTouchId = null;
      this.moveX = 0; this.moveY = 0; this.downHeld = false;
      base.classList.remove('active');
      setTimeout(() => { if (!this.joystickActive) base.classList.remove('visible'); }, 120);
      this.joyStick.style.left = '0px';
      this.joyStick.style.top = '0px';
    };

    zone.addEventListener('touchstart', e => {
      e.preventDefault();
      for (const touch of e.changedTouches) {
        if (this.joystickTouchId === null) {
          const rect = zone.getBoundingClientRect();
          start(touch.identifier, touch.clientX - rect.left, touch.clientY - rect.top);
        }
      }
    }, { passive: false });
    zone.addEventListener('touchmove', e => {
      e.preventDefault();
      const rect = zone.getBoundingClientRect();
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.joystickTouchId) move(touch.clientX - rect.left, touch.clientY - rect.top);
      }
    }, { passive: false });
    const touchEndHandler = e => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.joystickTouchId) end();
      }
    };
    zone.addEventListener('touchend', touchEndHandler);
    zone.addEventListener('touchcancel', touchEndHandler);

    // mouse fallback for desktop testing
    let mouseDown = false;
    zone.addEventListener('mousedown', e => {
      mouseDown = true;
      const rect = zone.getBoundingClientRect();
      start('mouse', e.clientX - rect.left, e.clientY - rect.top);
    });
    window.addEventListener('mousemove', e => {
      if (!mouseDown) return;
      const rect = zone.getBoundingClientRect();
      move(e.clientX - rect.left, e.clientY - rect.top);
    });
    window.addEventListener('mouseup', () => { if (mouseDown) { mouseDown = false; end(); } });

    // Jump button
    const jumpBtn = document.getElementById('btn-jump');
    const onJumpStart = e => { e.preventDefault(); this.jumpHeld = true; this._jumpPressedQueued = true; jumpBtn.classList.add('pressed'); };
    const onJumpEnd = e => { this.jumpHeld = false; jumpBtn.classList.remove('pressed'); };
    jumpBtn.addEventListener('touchstart', onJumpStart, { passive: false });
    jumpBtn.addEventListener('touchend', onJumpEnd);
    jumpBtn.addEventListener('touchcancel', onJumpEnd);
    jumpBtn.addEventListener('mousedown', onJumpStart);
    jumpBtn.addEventListener('mouseup', onJumpEnd);

    // Attack button
    const attackBtn = document.getElementById('btn-attack');
    const onAttack = e => { e.preventDefault(); this._attackPressedQueued = true; attackBtn.classList.add('pressed'); setTimeout(() => attackBtn.classList.remove('pressed'), 120); };
    attackBtn.addEventListener('touchstart', onAttack, { passive: false });
    attackBtn.addEventListener('mousedown', onAttack);

    // Keyboard fallback (desktop testing convenience)
    window.addEventListener('keydown', e => {
      if (e.repeat) return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this._keyLeft = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this._keyRight = true;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this._keyUp = true;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this._keyDown = true;
      if (e.code === 'Space') { this.jumpHeld = true; this._jumpPressedQueued = true; }
      if (e.code === 'KeyJ') { this._attackPressedQueued = true; }
    });
    window.addEventListener('keyup', e => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') this._keyLeft = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') this._keyRight = false;
      if (e.code === 'ArrowUp' || e.code === 'KeyW') this._keyUp = false;
      if (e.code === 'ArrowDown' || e.code === 'KeyS') this._keyDown = false;
      if (e.code === 'Space') this.jumpHeld = false;
    });
  }

  // call once per frame after consuming edge-triggered flags
  beginFrame() {
    if (this._keyLeft) this.moveX = -1;
    else if (this._keyRight) this.moveX = 1;
    else if (!this.joystickActive) this.moveX = 0;
    if (this._keyUp) this.moveY = -1;
    else if (this._keyDown) this.moveY = 1;
    else if (!this.joystickActive) this.moveY = 0;
    this.downHeld = this.downHeld || this._keyDown;

    this.jumpPressed = this._jumpPressedQueued;
    this.attackPressed = this._attackPressedQueued;
    this._jumpPressedQueued = false;
    this._attackPressedQueued = false;
  }
}
