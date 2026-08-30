import { describe, expect, it } from "vitest";

import {
  ARENA_ART_ONLY_DEPTH_RATIO,
  ARENA_BOTTOM_FRAME_DEPTH_RATIO,
  ARENA_CARD_COLLAPSE_DURATION_SECONDS,
  ARENA_CARD_COLLAPSE_HOLD_FRACTION,
  ARENA_COLLAPSED_PERMANENT_DEPTH_RATIO,
  ARENA_COLLAPSED_TEXTURE_RATIO,
  arenaCardCollapseDuration,
  arenaCardCollapseProgress,
  arenaCardCollapseTransform,
  arenaCardRestPose,
  arenaCardSettleResponse,
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
    expect(ARENA_CARD_COLLAPSE_DURATION_SECONDS).toBeLessThan(0.5);
  });

  it("honors the persisted animation-speed setting, including instant mode", () => {
    expect(arenaCardCollapseDuration(1)).toBe(
      ARENA_CARD_COLLAPSE_DURATION_SECONDS,
    );
    expect(arenaCardCollapseDuration(0.5)).toBeCloseTo(
      ARENA_CARD_COLLAPSE_DURATION_SECONDS / 2,
    );
    expect(arenaCardCollapseProgress(0, arenaCardCollapseDuration(0))).toBe(1);

    expect(arenaCardSettleResponse(1 / 60, 0)).toBe(1);
    expect(arenaCardSettleResponse(1 / 60, 0.5)).toBeGreaterThan(
      arenaCardSettleResponse(1 / 60, 1),
    );
    expect(arenaCardSettleResponse(1 / 60, 2)).toBeLessThan(
      arenaCardSettleResponse(1 / 60, 1),
    );
  });
});

describe("arenaCardRestPose", () => {
  it("shows attack selection as the normal tapped pose without lunging", () => {
    const selectedAttacker = arenaCardRestPose(
      [1.2, 0.16, -2.4],
      0.3,
      false,
      true,
      false,
    );
    const tappedPermanent = arenaCardRestPose(
      [1.2, 0.16, -2.4],
      0.3,
      true,
      false,
      false,
    );

    expect(selectedAttacker).toEqual(tappedPermanent);
    expect(selectedAttacker.x).toBe(1.2);
    expect(selectedAttacker.y).toBe(0.16);
    expect(selectedAttacker.z).toBe(-2.4);
    expect(selectedAttacker.rotationY).toBeCloseTo(0.3 + Math.PI / 4);
  });
});
