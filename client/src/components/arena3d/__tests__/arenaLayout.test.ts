import { describe, expect, it } from "vitest";

import {
  assignArenaOpponentSeats,
  spreadPositions,
} from "../arenaLayout.ts";

describe("spreadPositions", () => {
  it("centers a single permanent", () => {
    expect(spreadPositions(1, 8)).toEqual([0]);
  });

  it("keeps a crowded lane centered within the available width", () => {
    const positions = spreadPositions(9, 8);

    expect(positions).toHaveLength(9);
    expect(positions[0]).toBe(-4);
    expect(positions[positions.length - 1]).toBe(4);
    expect(positions[4]).toBe(0);
  });

  it("uses a readable maximum gap for sparse lanes", () => {
    expect(spreadPositions(3, 20)).toEqual([-2.02, 0, 2.02]);
  });
});

describe("assignArenaOpponentSeats", () => {
  it("places a four-player pod around the viewer in stable seat order", () => {
    expect(assignArenaOpponentSeats([0, 1, 2, 3], 2, [0, 1, 3])).toEqual([
      { playerId: 3, seat: "left" },
      { playerId: 0, seat: "far" },
      { playerId: 1, seat: "right" },
    ]);
  });

  it("does not shift surviving players when the far seat is eliminated", () => {
    expect(assignArenaOpponentSeats([0, 1, 2, 3], 2, [1, 3])).toEqual([
      { playerId: 3, seat: "left" },
      { playerId: 1, seat: "right" },
    ]);
  });

  it("balances a three-player table across the diagonal seats", () => {
    expect(assignArenaOpponentSeats([0, 1, 2], 0, [1, 2])).toEqual([
      { playerId: 1, seat: "left" },
      { playerId: 2, seat: "right" },
    ]);
  });
});
