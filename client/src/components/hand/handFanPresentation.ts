import type { CSSProperties } from "react";

import { fanGeometry, spreadFactor } from "../card/fanGeometry.ts";

const HAND_FAN_WIDTH_BUDGET_VW = 92;

/** Resting cards sit mostly below the viewport edge, matching Arena's shallow
 *  bottom ribbon while leaving the battlefield vertically unobstructed. */
export const HAND_FAN_RESTING_Y = 48;
export const HAND_FAN_HOVER_Y = 38;
export const MOBILE_HAND_FAN_LIFT_Y = -28;
export const PLAYER_HUD_HAND_GAP_PX = 8;
export const HAND_CARD_HEIGHT_SCALE = 1.4;
export const OPPONENT_CARD_SCALE = 0.78;
const COMPACT_HEIGHT_VERTICAL_SCALE = 0.9;
/** Opponent cards render at 0.78x the base card while the standard hand renders
 *  at 1.4x. Scale the mirrored vertical depth by the same 0.78 / 1.4 ratio. */
export const OPPONENT_HAND_VERTICAL_SCALE = OPPONENT_CARD_SCALE / HAND_CARD_HEIGHT_SCALE;

export interface HandFanVerticalMetrics {
  arcScale: number;
  hoverY: number;
  restingY: number;
}

/** Short landscape viewports retain an Arena-sized card face. Keep nearly the
 *  full desktop curve so the lower frame rests below the viewport rather than
 *  exposing the entire card and consuming battlefield space. */
export function handFanVerticalMetrics(
  isCompactHeight: boolean,
  cardScale = 1,
): HandFanVerticalMetrics {
  const viewportScale = isCompactHeight ? COMPACT_HEIGHT_VERTICAL_SCALE : 1;
  const scale = viewportScale * cardScale;
  return {
    arcScale: scale,
    hoverY: HAND_FAN_HOVER_Y * scale,
    restingY: HAND_FAN_RESTING_Y * scale,
  };
}

/** One authoritative wide, shallow geometry profile for the player hand on
 *  every viewport. Responsive sizing may fit the fan to the screen, but mobile
 *  and desktop share the exact same card transforms and animation path. */
export function handFanGeometry(
  totalCards: number,
  cardWidthVar = "--hand-card-w",
  verticalScale = 1,
) {
  const geometry = fanGeometry(totalCards, cardWidthVar, "wide");
  return {
    ...geometry,
    arc: (index: number) => geometry.arc(index) * verticalScale,
  };
}

/** Preserve the normal responsive hand-card size until the complete fan would
 *  exceed 92vw, then shrink cards just enough to fit smaller screens. */
export function playerHandFanSizingStyle(totalCards: number): CSSProperties {
  const widthCapVw = (HAND_FAN_WIDTH_BUDGET_VW / spreadFactor(totalCards, "wide")).toFixed(2);
  return {
    "--hand-card-w": `min(calc(var(--card-w) * var(--hand-card-scale)), ${widthCapVw}vw)`,
    "--hand-card-h": `calc(var(--hand-card-w) * ${HAND_CARD_HEIGHT_SCALE})`,
  } as CSSProperties;
}

/** Position the local HUD immediately above the visible center hand card.
 * Both inputs are viewport coordinates, while the returned value is the
 * stage-relative CSS `bottom` offset used by the screen-space HUD. */
export function playerHudBottomForCardTop(
  stageBottom: number,
  cardTop: number,
  gap = PLAYER_HUD_HAND_GAP_PX,
): number {
  return Math.max(0, stageBottom - cardTop + gap);
}
