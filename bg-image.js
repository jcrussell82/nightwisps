// bg-image.js — furthest-back atmospheric background image for Level 1.
// Purely decorative: sits behind every gameplay layer (platforms, hazards,
// player, collectibles, particles, foreground) and has no collision or
// gameplay logic whatsoever. Scales to fill the portrait viewport and
// extends tall so it supports the level's vertical progression.
//
// Loaded as an inline base64 data URI (not a file path) for the same
// reason the button icon SVGs were inlined in style.css: referencing an
// external image file can behave inconsistently when the page is opened
// directly via file:// rather than through a server, and inlining removes
// that risk entirely while keeping this a single-file-per-module, no-build
// project.
//
// Color treatment: graded (darkened, cooled toward teal/indigo, contrast
// crushed) and lightly blurred + desaturated ahead of time in image
// preprocessing to match the moodier reference palette and to reinforce
// distance — this is baked into the image itself rather than recomputed
// every frame, since it never needs to change at runtime.

const BG_IMAGE_DATA_URI = "data:image/webp;base64,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";

const bgImage = new Image();
let bgImageLoaded = false;
bgImage.onload = () => { bgImageLoaded = true; };
bgImage.src = BG_IMAGE_DATA_URI;

// Tracks its own eased vertical offset, independent of (slower than) the
// camera, so it drifts smoothly rather than snapping to camera position.
// Never locked 1:1 to the camera — see drawFarthestBackground below.
class FarthestBackground {
  constructor() {
    this.easedY = 0;      // current eased scroll offset (screen px)
    this.initialized = false;
  }

  // camY: camera's current render Y (world px). dt: frame delta seconds.
  update(camY, dt) {
    const targetY = camY * CONFIG.parallax.farthestImage;
    if (!this.initialized) {
      // snap once on the very first frame so it doesn't drift in from an
      // arbitrary start position
      this.easedY = targetY;
      this.initialized = true;
      return;
    }
    // Smooth exponential easing toward the target offset — this is what
    // keeps the drift free of jitter/snapping even though the underlying
    // camera can move in small discrete steps frame to frame.
    const easeRate = 1 - Math.pow(0.0025, dt); // time-constant based easing
    this.easedY += (targetY - this.easedY) * easeRate;
  }

  draw(ctx, w, h) {
    if (!bgImageLoaded) return;

    ctx.save();
    ctx.globalAlpha = 0.72; // 60-80% opacity so gameplay stays readable
    if (ctx.filter !== undefined) {
      // slight extra runtime blur on top of the pre-blurred source, plus a
      // touch of desaturation/contrast reduction — reinforces distance
      // without needing to touch the source image again
      ctx.filter = 'blur(1.5px) saturate(0.85) contrast(0.94)';
    }

    // Scale the image to always fully cover the viewport width, and let it
    // extend well beyond viewport height so there's vertical room for the
    // slow drift to move through without ever showing an edge.
    const scale = w / bgImage.width;
    const drawW = w;
    const drawH = bgImage.height * scale;

    // Tile vertically: draw two copies stacked so upward/downward drift
    // never reveals a gap, wrapping the eased offset into [-drawH, 0).
    let offsetY = this.easedY % drawH;
    if (offsetY > 0) offsetY -= drawH;

    for (let y = offsetY - drawH; y < h + drawH; y += drawH) {
      ctx.drawImage(bgImage, 0, y, drawW, drawH);
    }

    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}
