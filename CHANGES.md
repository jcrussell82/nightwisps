# NightWisps — Vertical Slice Polish Pass

## Running it
Unzip and open `index.html` directly in a browser — no server or build step needed. Best viewed on a phone, or in a desktop browser window resized tall/narrow (the viewport now locks to a 9:19.5 portrait ratio and letterboxes with dark space on wide windows, per the requirement that the world never stretches).

## File structure (unchanged, one addition)
```
index.html
style.css
config.js   <- NEW: central tunable constants, load this before the others
audio.js
input.js
world.js
player.js
enemy.js
game.js
```
`config.js` is loaded first in `index.html` and holds every major tunable (player scale/speed/jump, camera easing/look-ahead, collectible size, parallax factors, control opacity/deadzone, etc.) so they're easy to find in one place instead of scattered across files.

## What changed, by area

**Viewport** — `#app` is now locked to a fixed portrait aspect ratio (9:19.5) via `applyViewportSize()` in `game.js`, sized against a new `#viewport-frame` wrapper. On desktop this centers the game with dark space on the sides; on phones it fills the screen. The world canvas can no longer stretch.

**Wisp** — Rendered ~30% larger (`CONFIG.player.scale = 1.3`) with a rebuilt silhouette: elongated muzzle, tall pointed ears (not round), large curved brush tail, four separated legs, soft glowing cream eyes. Collision box grew only slightly (32×30 vs. the old 30×26) so existing platform spacing still works. Added: breathing idle, occasional ear flick and head tilt, blink, pre-jump crouch anticipation, squash/stretch tuned per state (jump/fall/land/run), landing dust puff, tail follow-through that responds to run/scared/jump states, and a `look up` posture. State machine (`STATE` enum in `player.js`) now includes stubs for lookdown/happy/sit/sleep/wake/stretch/shake so those can be filled in without restructuring.

**Collectible lights** — Shrunk core+bloom by roughly 35% (`CONFIG.light.coreRadius`/`bloomRadius`), added 4 drifting motes per light, gentle float, pulsing, and a collect animation that brightens and collapses the light toward the pickup point before it disappears, alongside the existing chime. No guiding/leading behavior was added — lights stay stationary within their small floating radius.

**Platforms & hazards** — Replaced flat rectangles with `drawPlatform()` in `world.js`, which renders an irregular jittered top edge, a soft highlight along it, and kind-specific decoration: `ledge` gets moss patches, `root` gets hanging root tendrils, `ruin` gets stone cracks, `bridge` gets planks + a swaying rope rail. All decoration uses a per-platform seed so shapes stay stable frame to frame. Collision remains a plain AABB underneath — invisible to the player. Hazards (`bramble`, `spikes`) are now organic thorn clusters and jagged broken stakes instead of triangles, built from the same per-platform seed.

**Depth & parallax** — Added two slow-scrolling background silhouette bands (distant towers, nearer treeline) plus a foreground layer (branch + hanging vine) that drifts faster than the camera at the screen edges. Parallax factors are all in `CONFIG.parallax` and kept restrained per the "no motion sickness" direction.

**Atmosphere** — Added falling leaves, kept the existing fog/particles/light rays, all tuned down in count and speed for a calmer feel (`CONFIG.atmosphere`).

**Camera** — Rebuilt to add directional horizontal look-ahead and a vertical bias that shifts to reveal more space below while falling and more above while rising, instead of rigid centering. A very small, fast-decaying landing "kick" replaces any shake. Config lives in `CONFIG.camera`.

**Controls** — Same joystick + two-button layout and behavior, restyled: thinner ring, lower inactive opacity (0.32 vs. the old 0.55) so it visually recedes into the mist, small dot ticks instead of solid triangle arrows, and a deadzone (`CONFIG.controls.joystickDeadzone`) so tiny touch jitter near center doesn't register as input.

**Level** — Rebuilt "The Forest" as one continuous vertical route with the requested 11 beats: calm start → easy stepped movement → first jump → a safe climbable wall → a short ruin-climbing sequence → a quiet checkpoint rest area → a hazard introduced on a wide safe ledge → a committed wider jump → an optional off-route collectible ledge → a broken rope bridge (the environmental reveal) → a final staggered climb → a glowing ruin doorway as the clear endpoint. One `Walker` enemy patrols an early ledge; a second guards the ruin-climb section. Reaching the doorway triggers level completion.

**Level completion & onboarding** — The old "swipe to move" onboarding screen is removed; the splash screen goes straight into gameplay, and the first level beats now do the teaching. Level completion is a quiet fade into the existing complete panel showing lights collected and time, no confetti.

**Checkpoint** — One midpoint checkpoint (a small stone shrine, purely visual, no text) at the rest area; dying respawns there instead of at the level start once reached.

## Key adjustable values (all in `config.js`)
- `CONFIG.player.scale`, `.colliderW/H` — Wisp's visual size vs. collision size
- `CONFIG.player.jumpVelocity`, `.gravity`, `.moveSpeed`, `.runSpeed` — jump/movement feel
- `CONFIG.camera.lookAheadX/Y`, `.verticalBiasFall/Rise`, `.landingKickPx`
- `CONFIG.light.coreRadius`, `.bloomRadius`, `.particleCount`
- `CONFIG.parallax.*` — per-layer scroll speed multipliers
- `CONFIG.controls.joystickRadius`, `.joystickDeadzone`, `.inactiveOpacity`
- `CONFIG.atmosphere.*` — particle/leaf counts

## Known limitations / not yet verified hands-on
I wasn't able to load this build in a live browser this session (the sandboxed browser tool can't reach this container's local server — confirmed by testing twice). Everything above was verified by: syntax-checking every file, running the actual `Player`/`Enemy`/`Camera`/`Atmosphere` classes and level data through a scripted 600-frame simulation with a fake canvas context to catch runtime errors, and manually tracing the render/collision/camera transform code path line by line. I could not verify actual visual appearance or feel by eye. Please treat this as "should run cleanly" rather than "confirmed to feel right" — the jump timing on the one intentionally-hard "committed gap jump" platform (ruin fragment around level row 61, listed in `LEVEL.platforms` in `world.js`) is the single spot most worth playtesting first, since it's close to the character's max jump distance.

## Placeholder / not-yet-final art
Everything is still procedural canvas drawing, not illustrated assets — this was intentional per "no build step, no external dependencies." The organic platform/hazard shapes, Wisp's fox silhouette, and the background silhouette bands are all generated from primitives with jitter/seeding rather than hand-painted. If a future pass wants actual painted textures (per the mood-style reference's brushwork), that would mean introducing image assets and a loader, which is a bigger architectural change than this polish pass was meant to make.
