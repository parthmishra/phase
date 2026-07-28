import { describe, expect, it } from "vitest";

import { arenaZoneLayout } from "../arenaLayout.ts";

describe("arenaZoneLayout", () => {
  it("mirrors each player's tabletop zones without entering the battlefield lanes", () => {
    const local = arenaZoneLayout("local");
    const opponent = arenaZoneLayout("opponent");

    expect(local.library).toEqual([-6.3, 0.08, 3.82]);
    expect(local.graveyard[0]).toBe(local.library[0]);
    expect(local.exile[0]).toBe(local.library[0]);
    expect(opponent.library).toEqual([6.3, 0.08, -3.82]);
    expect(opponent.graveyard[0]).toBe(opponent.library[0]);
    expect(opponent.exile[0]).toBe(opponent.library[0]);
    expect(opponent.faceAngle).toBe(Math.PI);
  });
});
