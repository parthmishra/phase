import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePreferencesStore } from "../../../stores/preferencesStore";
import { PreferencesModal } from "../PreferencesModal";

vi.mock("../../../services/backup", () => ({
  downloadBackup: vi.fn(),
  importBackupFromFile: vi.fn(),
}));

describe("PreferencesModal priority passing", () => {
  beforeEach(() => {
    usePreferencesStore.setState({ priorityPassingMode: "Standard" });
  });

  afterEach(() => cleanup());

  it("offers the experimental Smart mode and persists the selection", () => {
    render(<PreferencesModal onClose={vi.fn()} initialTab="gameplay" />);

    expect(screen.getByText("Priority Passing")).toBeInTheDocument();
    expect(
      screen.getByText(/automatically passes your empty Upkeep, Draw, and End/i),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Smart (Experimental)" }));
    expect(usePreferencesStore.getState().priorityPassingMode).toBe("Smart");
  });
});
