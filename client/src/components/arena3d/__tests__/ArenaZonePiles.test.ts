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

  it.each(["inward", "kitchen"] as const)(
    "places the right library at the near corner in %s mode",
    (presentation) => {
      const right = arenaZoneLayout("right", "pod", presentation);

      expect(right.library[2]).toBeGreaterThan(0);
      expect(right.graveyard[2]).toBeLessThan(right.library[2]);
      expect(right.graveyard[0]).toBeLessThanOrEqual(right.library[0]);
    },
  );

  it("keeps inward side libraries perpendicular to local and far seats", () => {
    const left = arenaZoneLayout("left", "pod");
    const right = arenaZoneLayout("right", "pod");

    expect(left.library[2]).toBeLessThan(0);
    expect(left.library[2]).toBeLessThan(right.library[2]);
    expect(left.faceAngle).toBe(-Math.PI / 2);
    expect(right.faceAngle).toBe(Math.PI / 2);
  });

  it.each([
    ["local", "inward"],
    ["far", "inward"],
    ["left", "inward"],
    ["local", "kitchen"],
    ["far", "kitchen"],
    ["left", "kitchen"],
  ] as const)(
    "places the %s graveyard to that player's right in %s mode",
    (seat, presentation) => {
      const layout = arenaZoneLayout(seat, "pod", presentation);
      const deltaX = layout.graveyard[0] - layout.library[0];
      const deltaZ = layout.graveyard[2] - layout.library[2];
      const playerRelativeRight =
        deltaX * Math.cos(layout.faceAngle)
        - deltaZ * Math.sin(layout.faceAngle);

      expect(playerRelativeRight).toBeCloseTo(1.45);
    },
  );

  it("pushes the top library farther toward the far edge", () => {
    expect(arenaZoneLayout("far", "pod", "inward").library[2]).toBe(-5.35);
    expect(arenaZoneLayout("far", "pod", "kitchen").library[2]).toBe(-5.35);
  });

  it("uses square side-seat orientation for the kitchen-table view", () => {
    expect(arenaZoneLayout("left", "pod", "kitchen").faceAngle).toBe(
      -Math.PI / 2,
    );
    expect(arenaZoneLayout("right", "pod", "kitchen").faceAngle).toBe(
      Math.PI / 2,
    );
  });

  it("anchors kitchen side libraries toward their respective corners", () => {
    const left = arenaZoneLayout("left", "pod", "kitchen");
    const right = arenaZoneLayout("right", "pod", "kitchen");

    expect(left.library[0]).toBeLessThan(-7.5);
    expect(left.library[2]).toBeLessThan(-4.2);
    expect(right.library[0]).toBeGreaterThan(7.5);
    expect(right.library[2]).toBeGreaterThan(2.9);
  });
});
