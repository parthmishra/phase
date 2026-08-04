import {
  ARENA_CARD_ART_BOTTOM_RATIO,
  ARENA_CARD_STAT_RECT,
} from "./arenaCardCanvas.ts";

/**
 * The compact face ends exactly where the rendered artwork ends. The preserved
 * lower rail is composited directly against this seam, leaving no type-box
 * frame between them.
 */
export const ARENA_ART_ONLY_DEPTH_RATIO = ARENA_CARD_ART_BOTTOM_RATIO;

/** Bottom-most portion of the full frame retained beneath the cropped art. */
export const ARENA_BOTTOM_FRAME_DEPTH_RATIO = 0.045;

/** Full-card texture span retained: crown/name/art plus the lower frame rail. */
export const ARENA_COLLAPSED_TEXTURE_RATIO =
  ARENA_ART_ONLY_DEPTH_RATIO + ARENA_BOTTOM_FRAME_DEPTH_RATIO;

/**
 * Final physical depth of a battlefield permanent.
 *
 * This is intentionally taller than the retained texture span. The compact
 * face stretches only the art presentation—not the hidden type/rules panels—
 * so sparse boards keep substantial, readable game pieces without revealing a
 * sliver of the type box at the art/frame seam.
 */
export const ARENA_COLLAPSED_PERMANENT_DEPTH_RATIO = 0.68;

/** Time from battlefield arrival to the compact frame's settled state. */
export const ARENA_CARD_COLLAPSE_DURATION_SECONDS = 0.72;

/** Brief arrival beat before the lower frame begins moving. */
export const ARENA_CARD_COLLAPSE_HOLD_FRACTION = 0.1;

export interface ArenaCardCollapseTransform {
  /** Smoothstep-normalized animation progress. */
  easedProgress: number;
  /** Scale applied only along the card's local depth axis. */
  depthScale: number;
  /** Normalized center shift that keeps the top edge stationary. */
  centerOffsetInCardDepths: number;
  /** Portion of the original full-card texture that remains visible. */
  visibleTextureRatio: number;
}

/** Converts arrival age into the frame-only collapse phase. */
export function arenaCardCollapseProgress(ageSeconds: number): number {
  const arrivalProgress = Math.min(
    1,
    Math.max(0, ageSeconds / ARENA_CARD_COLLAPSE_DURATION_SECONDS),
  );
  return Math.min(
    1,
    Math.max(
      0,
      (arrivalProgress - ARENA_CARD_COLLAPSE_HOLD_FRACTION)
        / (1 - ARENA_CARD_COLLAPSE_HOLD_FRACTION),
    ),
  );
}

/**
 * Smoothly raises the bottom edge while pinning the card's top edge. The same
 * eased ratio drives geometry depth and texture cropping, so frame contents do
 * not stretch while the text and type panels disappear.
 */
export function arenaCardCollapseTransform(
  progress: number,
  targetDepthRatio = ARENA_COLLAPSED_PERMANENT_DEPTH_RATIO,
  targetTextureRatio = ARENA_COLLAPSED_TEXTURE_RATIO,
): ArenaCardCollapseTransform {
  const clampedProgress = Math.min(1, Math.max(0, progress));
  const clampedTarget = Math.min(1, Math.max(0.05, targetDepthRatio));
  const clampedTextureTarget = Math.min(
    1,
    Math.max(0.05, targetTextureRatio),
  );
  const eased = clampedProgress * clampedProgress * (3 - 2 * clampedProgress);
  const depthScale = 1 + (clampedTarget - 1) * eased;

  return {
    easedProgress: eased,
    depthScale,
    centerOffsetInCardDepths: (depthScale - 1) / 2,
    visibleTextureRatio:
      1 + (clampedTextureTarget - 1) * eased,
  };
}

/** Maps a full-card UV into the retained top portion of the texture. */
export function collapsedArenaCardV(
  baseV: number,
  visibleTextureRatio: number,
): number {
  const visible = Math.min(1, Math.max(0.05, visibleTextureRatio));
  return 1 - visible + baseV * visible;
}

/** Maps a plane UV into the original live card's P/T or loyalty box. */
export function arenaCardStatUv(
  baseU: number,
  baseV: number,
): { u: number; v: number } {
  return {
    u: ARENA_CARD_STAT_RECT.x + baseU * ARENA_CARD_STAT_RECT.width,
    v:
      1
      - ARENA_CARD_STAT_RECT.y
      - ARENA_CARD_STAT_RECT.height
      + baseV * ARENA_CARD_STAT_RECT.height,
  };
}
