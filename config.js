// config.js — all major tunable values in one place, grouped by system.
// Load order: config.js must load before world.js/player.js/enemy.js/game.js.

const CONFIG = {
  // ---- Viewport ----
  viewport: {
    aspectW: 9,
    aspectH: 19.5,       // tall-phone portrait ratio; #app is locked to this
    maxWidthPx: 480,      // don't let the frame grow absurdly wide on huge desktop monitors
  },

  // ---- World ----
  tile: 48,
  world: {
    // How far below the starting ground level Wisp must fall before the
    // whole level restarts (rather than just respawning at a checkpoint).
    voidFallMargin: 4 * 48,
  },

  // ---- Player ----
  player: {
    scale: 1.56,           // 1.3 * 1.2 — 20% bigger again on top of the prior 25-35% bump, for readability
    colliderW: 32,         // collision box, kept close to prior size — small bump only
    colliderH: 30,
    moveSpeed: 210,
    runSpeed: 340,
    accel: 2200,
    friction: 2600,
    airControl: 0.6,
    gravity: 1400,
    fallGravityMult: 1.25,
    jumpVelocity: -560,
    jumpHoldForce: -1500,
    jumpHoldMaxTime: 0.22,
    wallSlideSpeed: 90,
    climbSpeed: 160,
    maxFallSpeed: 900,
    coyoteTime: 0.10,
    jumpBufferTime: 0.10,
    attackCooldown: 0.28,
    // Seconds into the bite animation where the hit registers. Starts at 0
    // (not e.g. 0.03) so a bite thrown while already touching an enemy
    // lands immediately on the same frame — otherwise the enemy-contact
    // check in enemy.js sees isBiteActive() as false for the first couple
    // of frames and hurts the player before the bite ever has a chance to
    // connect, since both checks use the same overlap distance.
    attackActiveWindow: [0, 0.18],
    invulnDuration: 1.1,
  },

  // ---- Camera ----
  camera: {
    easing: 0.0012,        // lower = smoother/slower follow (used as pow base)
    lookAheadX: 46,         // extra horizontal space in movement direction
    lookAheadY: 70,          // extra vertical space in movement direction
    lookAheadLerp: 0.006,
    verticalBiasFall: 0.62,  // fraction of viewport height above player when falling (reveal below)
    verticalBiasRise: 0.42,  // fraction above player when rising (reveal above)
    landingKickPx: 4,        // tiny downward kick on landing, decays fast
    lookUpPanPx: 40,         // extra upward camera pan while holding up (STATE.LOOKUP)
  },

  // ---- Collectible lights ----
  light: {
    coreRadius: 2.6,
    bloomRadius: 13,          // reduced from prototype's 22px wash
    floatRange: 6,
    floatSpeed: 1.6,
    particleCount: 4,
    pulseSpeed: 2.2,
    collectRadius: 30,
  },

  // ---- Atmosphere / particles ----
  atmosphere: {
    farParticleCount: 22,
    fogParticleCount: 10,
    leafCount: 6,
  },

  // ---- Parallax layers (multiplier applied to camera delta; <1 = slower than gameplay) ----
  parallax: {
    // Furthest-back atmospheric image layer (bg-image.js). Deliberately the
    // slowest of all layers — 10-20% of camera movement — so it reads as
    // extremely distant and reinforces vertical scale as Wisp climbs.
    farthestImage: 0.14,
    foreground: 1.18,
    midgroundNear: 0.72,
    midgroundFar: 0.45,
    farBackground: 0.22,
    fog: 0.10,
  },

  // ---- Controls ----
  controls: {
    joystickRadius: 44,
    joystickDeadzone: 0.16,
    inactiveOpacity: 0.4,
    activeOpacity: 0.85,
  },

  // ---- Audio ----
  audio: {
    defaultMusicVol: 0.6,
    defaultSfxVol: 0.7,
  },

  // ---- Enemy ----
  enemy: {
    walkerHp: 2,
  },
};
