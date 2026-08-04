import { describe, expect, it } from "vitest";

import {
  ARENA_ART_ONLY_DEPTH_RATIO,
  ARENA_BOTTOM_FRAME_DEPTH_RATIO,
  ARENA_CARD_COLLAPSE_DURATION_SECONDS,
  ARENA_CARD_COLLAPSE_HOLD_FRACTION,
  ARENA_COLLAPSED_PERMANENT_DEPTH_RATIO,
  ARENA_COLLAPSED_TEXTURE_RATIO,
  arenaCardCollapseProgress,
  arenaCardCollapseTransform,
  arenaCardStatUv,
  collapsedArenaCardV,
} from "../arenaCardCollapse.ts";

describe("arenaCardCollapseTransform", () => {
  it("finishes top-anchored with the art and bottom frame retained", () => {
    expect(arenaCardCollapseTransform(0)).toEqual({
      easedProgress: 0,
      depthScale: 1,
      centerOffsetInCardDepths: 0,
      visibleTextureRatio: 1,
    });

    expect(arenaCardCollapseTransform(1)).toEqual({
      easedProgress: 1,
      depthScale: ARENA_COLLAPSED_PERMANENT_DEPTH_RATIO,
      centerOffsetInCardDepths:
        (ARENA_COLLAPSED_PERMANENT_DEPTH_RATIO - 1) / 2,
      visibleTextureRatio: ARENA_COLLAPSED_TEXTURE_RATIO,
    });
  });

  it("retains exactly the art and one bottom-frame rail from the source", () => {
    const transform = arenaCardCollapseTransform(1);

    expect(
      transform.visibleTextureRatio - ARENA_BOTTOM_FRAME_DEPTH_RATIO,
    ).toBeCloseTo(ARENA_ART_ONLY_DEPTH_RATIO);
    expect(transform.depthScale).toBeGreaterThan(
      transform.visibleTextureRatio,
    );
  });

  it("crops the main texture without moving its top edge", () => {
    expect(collapsedArenaCardV(1, ARENA_COLLAPSED_TEXTURE_RATIO))
      .toBe(1);
    expect(collapsedArenaCardV(0, ARENA_COLLAPSED_TEXTURE_RATIO))
      .toBeCloseTo(1 - ARENA_COLLAPSED_TEXTURE_RATIO);
  });

  it("maps a dedicated overlay onto the original live stat box", () => {
    const bottomLeft = arenaCardStatUv(0, 0);
    const topRight = arenaCardStatUv(1, 1);

    expect(bottomLeft.u).toBeCloseTo(0.762);
    expect(bottomLeft.v).toBeCloseTo(0.04);
    expect(topRight.u).toBeCloseTo(0.96);
    expect(topRight.v).toBeCloseTo(0.112);
  });

  it("settles the frame quickly after a short arrival beat", () => {
    expect(arenaCardCollapseProgress(0)).toBe(0);
    expect(
      arenaCardCollapseProgress(
        ARENA_CARD_COLLAPSE_DURATION_SECONDS
          * ARENA_CARD_COLLAPSE_HOLD_FRACTION,
      ),
    ).toBe(0);
    expect(
      arenaCardCollapseProgress(ARENA_CARD_COLLAPSE_DURATION_SECONDS),
    ).toBe(1);
    expect(ARENA_CARD_COLLAPSE_DURATION_SECONDS).toBeLessThan(0.8);
  });
});
