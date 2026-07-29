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

  it("converges mirrored pod side zones toward the narrow far edge", () => {
    const left = arenaZoneLayout("left", "pod");
    const right = arenaZoneLayout("right", "pod");

    expect(left.library[0]).toBe(-right.library[0]);
    expect(left.graveyard[0]).toBe(-right.graveyard[0]);
    expect(left.exile[0]).toBe(-right.exile[0]);
    expect(left.library[2]).toBe(right.library[2]);
    expect(Math.abs(left.library[0])).toBeGreaterThan(
      Math.abs(left.graveyard[0]),
    );
    expect(Math.abs(left.graveyard[0])).toBeGreaterThan(
      Math.abs(left.exile[0]),
    );
    expect(left.library[2]).toBeGreaterThan(left.graveyard[2]);
    expect(left.graveyard[2]).toBeGreaterThan(left.exile[2]);
    expect(left.faceAngle).toBe(-Math.PI * 0.34);
    expect(right.faceAngle).toBe(Math.PI * 0.34);
  });
});
