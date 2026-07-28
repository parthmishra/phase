import { describe, expect, it } from "vitest";

import { arenaFrameLetter } from "../arenaCardCanvas.ts";

describe("arenaFrameLetter", () => {
  it("selects the matching monocolor frame", () => {
    expect(
      arenaFrameLetter({
        colors: ["Green"],
        typeLine: "Creature — Squirrel",
      }),
    ).toBe("G");
  });

  it("uses dedicated land, artifact, colorless, and multicolor frames", () => {
    expect(arenaFrameLetter({ colors: [], typeLine: "Basic Land — Forest" }))
      .toBe("L");
    expect(arenaFrameLetter({ colors: [], typeLine: "Artifact" })).toBe("A");
    expect(arenaFrameLetter({ colors: [], typeLine: "Creature — Eldrazi" }))
      .toBe("V");
    expect(
      arenaFrameLetter({
        colors: ["Blue", "Red"],
        typeLine: "Legendary Creature",
      }),
    ).toBe("M");
  });
});
