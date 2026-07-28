import { describe, expect, it } from "vitest";

import {
  arenaFrameLetter,
  tokenizeArenaRulesParagraph,
} from "../arenaCardCanvas.ts";

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

describe("tokenizeArenaRulesParagraph", () => {
  it("keeps mana symbols inline when punctuation or reminder text surrounds them", () => {
    const context = {
      measureText: (text: string) => ({ width: text.length * 10 }),
    } as Pick<CanvasRenderingContext2D, "measureText">;

    expect(
      tokenizeArenaRulesParagraph(
        context,
        "({T}: Add one {R}.)",
        24,
      ),
    ).toMatchObject([
      { kind: "text", text: "(", attachPrevious: false },
      { kind: "pip", symbol: "T", attachPrevious: true },
      { kind: "text", text: ":", attachPrevious: true },
      { kind: "text", text: "Add", attachPrevious: false },
      { kind: "text", text: "one", attachPrevious: false },
      { kind: "pip", symbol: "R", attachPrevious: false },
      { kind: "text", text: ".)", attachPrevious: true },
    ]);
  });
});
