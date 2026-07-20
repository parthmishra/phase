import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ManaCostPips } from "../ManaCostPips.tsx";

describe("ManaCostPips", () => {
  it("centers the compact backdrop around the reduced-size pips", () => {
    const { container } = render(
      <ManaCostPips
        cost={{ type: "Cost", shards: ["Blue", "Red"], generic: 1 }}
        size="compact"
      />,
    );

    expect(container.querySelector("[data-mana-cost-backdrop]")).toHaveClass(
      "-inset-x-[1px]",
      "-top-[1px]",
      "-bottom-[1px]",
    );
  });
});
