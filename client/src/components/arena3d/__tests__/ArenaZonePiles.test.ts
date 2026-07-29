import { describe, expect, it } from "vitest";

import { arenaZoneLayout } from "../arenaLayout.ts";

describe("arenaZoneLayout", () => {
  it("mirrors each player's tabletop zones without entering the battlefield lanes", () => {
    const local = arenaZoneLayout("local");
    const opponent = arenaZoneLayout("far");

    expect(local.library).toEqual([-5.55, 0.08, 3.46]);
    expect(local.graveyard[2]).toBe(local.library[2]);
    expect(local.exile[2]).toBe(local.library[2]);
    expect(opponent.library).toEqual([5.55, 0.08, -3.46]);
    expect(opponent.graveyard[2]).toBe(opponent.library[2]);
    expect(opponent.exile[2]).toBe(opponent.library[2]);
    expect(opponent.faceAngle).toBe(Math.PI);
  });

  it("keeps both side libraries on the far side without mirroring pile order", () => {
    const left = arenaZoneLayout("left", "pod");
    const right = arenaZoneLayout("right", "pod");

    expect(left.library[2]).toBeLessThan(0);
    expect(right.library[2]).toBeLessThan(0);
    expect(left.library[0]).not.toBe(-right.library[0]);
    expect(left.graveyard[0]).not.toBe(-right.graveyard[0]);
    expect(left.exile[0]).toBe(-right.exile[0]);
    expect(left.library[2]).toBe(right.library[2]);
    expect(left.faceAngle).toBe(-Math.PI * 0.555);
    expect(right.faceAngle).toBe(Math.PI * 0.555);
  });

  it("uses square side-seat orientation for the kitchen-table view", () => {
    expect(arenaZoneLayout("left", "pod", "kitchen").faceAngle).toBe(
      -Math.PI / 2,
    );
    expect(arenaZoneLayout("right", "pod", "kitchen").faceAngle).toBe(
      Math.PI / 2,
    );
  });
});
