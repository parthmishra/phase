import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registerPwaServiceWorker: vi.fn(),
  updateSW: vi.fn(async () => {}),
  isBundledTauriOrigin: vi.fn(() => false),
  isMultiplayerGameLive: vi.fn(() => false),
  whenMultiplayerGameEnds: vi.fn(),
  claimServiceWorkerReload: vi.fn(() => true),
  markPendingAutoUpdate: vi.fn(),
  claimUpdateStatus: vi.fn(() => true),
  setUpdateStatus: vi.fn(),
  getUpdateStatus: vi.fn(() => "idle"),
  releaseUpdateStatus: vi.fn(),
  setDownloadProgress: vi.fn(),
  pushUpdateDebug: vi.fn(),
  setUpdateError: vi.fn(),
  clearUpdateError: vi.fn(),
}));

vi.mock("../serviceWorkerRegistrar", () => ({
  registerPwaServiceWorker: mocks.registerPwaServiceWorker,
}));
vi.mock("../../services/platform", () => ({
  isBundledTauriOrigin: mocks.isBundledTauriOrigin,
}));
vi.mock("../multiplayerGuard", () => ({
  isMultiplayerGameLive: mocks.isMultiplayerGameLive,
  whenMultiplayerGameEnds: mocks.whenMultiplayerGameEnds,
}));
vi.mock("../updateMarker", () => ({
  claimServiceWorkerReload: mocks.claimServiceWorkerReload,
  markPendingAutoUpdate: mocks.markPendingAutoUpdate,
}));
vi.mock("../updateStatus", () => ({
  claimUpdateStatus: mocks.claimUpdateStatus,
  setUpdateStatus: mocks.setUpdateStatus,
  getUpdateStatus: mocks.getUpdateStatus,
  releaseUpdateStatus: mocks.releaseUpdateStatus,
  setDownloadProgress: mocks.setDownloadProgress,
  pushUpdateDebug: mocks.pushUpdateDebug,
  setUpdateError: mocks.setUpdateError,
  clearUpdateError: mocks.clearUpdateError,
}));

describe("registerServiceWorker update reload coordination", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("DEV", false);
    mocks.registerPwaServiceWorker.mockReturnValue(mocks.updateSW);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {},
    });
  });

  it("uses one guarded reload owner for an automatically applied update", async () => {
    const reload = vi.fn();
    Object.defineProperty(window.location, "reload", {
      configurable: true,
      value: reload,
    });

    const { registerServiceWorker } = await import("../registerServiceWorker");
    registerServiceWorker();

    expect(mocks.registerPwaServiceWorker).toHaveBeenCalledTimes(1);
    const options = mocks.registerPwaServiceWorker.mock.calls[0]?.[0] as {
      onNeedRefresh?: () => void;
      onNeedReload?: () => void;
    };

    options.onNeedRefresh?.();
    expect(mocks.markPendingAutoUpdate).toHaveBeenCalledTimes(1);
    expect(mocks.updateSW).toHaveBeenCalledWith(true);

    options.onNeedReload?.();
    options.onNeedReload?.();

    expect(mocks.claimServiceWorkerReload).toHaveBeenCalledTimes(1);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
