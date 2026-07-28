import { describe, expect, it } from "vitest";

import { spreadPositions } from "../arenaLayout.ts";

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
