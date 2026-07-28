import { describe, expect, it } from "vitest";

import { arenaComposableArtSource } from "../arenaArtSource.ts";

describe("arenaComposableArtSource", () => {
  it("routes Scryfall card art through the fixed same-origin transport", () => {
    expect(
      arenaComposableArtSource(
        "https://cards.scryfall.io/art_crop/front/a/b/example.jpg?123",
      ),
    ).toBe("/arena-card-art/art_crop/front/a/b/example.jpg?123");
  });

  it("routes the canonical card back through its own fixed transport", () => {
    expect(
      arenaComposableArtSource(
        "https://backs.scryfall.io/normal/0/a/example.jpg",
      ),
    ).toBe("/arena-card-back/normal/0/a/example.jpg");
  });

  it("leaves same-origin and unrelated image sources unchanged", () => {
    expect(arenaComposableArtSource("/images/token.png")).toBe(
      "/images/token.png",
    );
    expect(arenaComposableArtSource("https://example.com/card.jpg")).toBe(
      "https://example.com/card.jpg",
    );
  });
});
