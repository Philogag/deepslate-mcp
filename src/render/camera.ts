/**
 * Camera presets — view matrices for the four common angles we render
 * structures at.
 *
 * We don't override deepslate's internal perspective projection; we just
 * provide a view transform that frames the structure in the viewport.
 * For a small structure (≤ 64³) and deepslate's 70° FOV this looks
 * effectively orthographic at the camera distances we use, which is
 * the look agents expect from "show me a structure" previews.
 *
 * The four presets:
 *
 * | name        | rotation (deg)        | meaning                                  |
 * |-------------|-----------------------|------------------------------------------|
 * | isometric   | Y=45°, X=arctan(1/√2) | classic Minecraft "F3" 3/4 view           |
 * | top         | X=90°                 | plan / bird's-eye view from above        |
 * | front       | (none)                | looking along -Z at the structure face  |
 * | side        | Y=90°                 | looking along -X at the structure face  |
 *
 * All presets center the structure in the viewport via `translate(-cx,
 * -cy, -cz)` after the rotation, and pull the camera back by `viewDist`
 * so the whole structure fits even when the longest axis is on the
 * diagonal of the screen.
 */
import { mat4, type mat4 as Mat4 } from 'gl-matrix';
import type { BlockPos } from 'deepslate';

const HALF_PI = Math.PI / 2;
const DEG_TO_RAD = Math.PI / 180;

/**
 * Build a view matrix for the given rotation angles and structure center.
 *
 * Internal helper — exported for testing, but the public API is the four
 * preset functions below.
 */
export function buildViewMatrix(
  size: BlockPos,
  rotationX: number,
  rotationY: number,
  viewDist?: number,
): Mat4 {
  const [w, h, d] = size;
  // Distance pulled from the centre: long enough to keep a structure of
  // this size comfortably inside the FOV, but not so far that we waste
  // pixels. 2.5× the longest diagonal works well across the presets.
  const longest = Math.max(w, h, d);
  const dist = viewDist ?? longest * 2.5;

  const view = mat4.create();
  // Pull the camera back along -Z first so subsequent rotations pivot
  // around the world origin rather than the camera.
  mat4.translate(view, view, [0, 0, -dist]);
  // Pitch (around X), then yaw (around Y). Matches deepslate's own
  // demo conventions and produces a natural "rotate the world under a
  // stationary camera" feel.
  mat4.rotateX(view, view, rotationX);
  mat4.rotateY(view, view, rotationY);
  // Center the structure: after rotation, translate by the negative
  // half-size so the cube sits in the middle of the viewport.
  mat4.translate(view, view, [-w / 2, -h / 2, -d / 2]);
  return view;
}

/**
 * Classic isometric (dimetric) angle:
 *   - 45° around Y
 *   - arctan(1/√2) ≈ 35.264° around X
 * This is the view Minecraft's debug screen uses; it shows three faces
 * of every cube with equal foreshortening.
 */
export function viewIsometric(size: BlockPos): Mat4 {
  return buildViewMatrix(
    size,
    Math.atan(1 / Math.sqrt(2)), // ≈ 35.264°
    45 * DEG_TO_RAD,
  );
}

/**
 * Top-down / plan view: looking straight down the +Y axis.
 */
export function viewTop(size: BlockPos): Mat4 {
  // Rotate +90° around X so the camera looks down. We also nudge -45°
  // around Y so the +X/+Z axes land symmetrically on screen — purely
  // aesthetic, helps agents eyeball the layout.
  return buildViewMatrix(size, HALF_PI, -45 * DEG_TO_RAD);
}

/**
 * Front view: looking along -Z at the +Z face. No rotation; we only
 * frame the structure in the viewport.
 */
export function viewFront(size: BlockPos): Mat4 {
  return buildViewMatrix(size, 0, 0);
}

/**
 * Side view: looking along -X at the +X face. 90° yaw around Y.
 */
export function viewSide(size: BlockPos): Mat4 {
  return buildViewMatrix(size, 0, HALF_PI);
}

/**
 * Custom angle: caller provides explicit rotation_x and rotation_y
 * (in radians). Falls back to isometric if both are 0.
 */
export function viewCustom(size: BlockPos, rotationX: number, rotationY: number): Mat4 {
  return buildViewMatrix(size, rotationX, rotationY);
}

/**
 * Convenience: dispatch by angle name. Used by `pipeline.ts`.
 * For `custom`, pass rotation as extra arguments (radians).
 */
export function viewForAngle(
  size: BlockPos,
  angle: 'isometric' | 'top' | 'front' | 'side' | 'custom',
  rotationX?: number,
  rotationY?: number,
): Mat4 {
  switch (angle) {
    case 'isometric':
      return viewIsometric(size);
    case 'top':
      return viewTop(size);
    case 'front':
      return viewFront(size);
    case 'side':
      return viewSide(size);
    case 'custom':
      return viewCustom(size, rotationX ?? 0, rotationY ?? 0);
    default: {
      // Exhaustiveness check — if a future caller adds a variant and
      // forgets to handle it here, this fails at compile time.
      const _exhaustive: never = angle;
      throw new Error(`Unknown angle: ${String(_exhaustive)}`);
    }
  }
}