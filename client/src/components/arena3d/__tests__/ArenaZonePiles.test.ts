import { describe, expect, it } from "vitest";

import { arenaZoneLayout } from "../arenaLayout.ts";

describe("arenaZoneLayout", () => {
  it("mirrors each player's tabletop zones without entering the battlefield lanes", () => {
    const local = arenaZoneLayout("local");
    const opponent = arenaZoneLayout("opponent");

    expect(local.library).toEqual([-6.8, 0.08, 3.46]);
    expect(local.graveyard[2]).toBe(local.library[2]);
    expect(local.exile[2]).toBe(local.library[2]);
    expect(local.command).toEqual([6.35, 0.08, 3.46]);
    expect(opponent.library).toEqual([6.8, 0.08, -3.46]);
    expect(opponent.graveyard[2]).toBe(opponent.library[2]);
    expect(opponent.exile[2]).toBe(opponent.library[2]);
    expect(opponent.command).toEqual([-6.35, 0.08, -3.46]);
    expect(opponent.faceAngle).toBe(Math.PI);
  });
});
