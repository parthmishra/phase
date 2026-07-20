import { useEffect } from "react";

const GAME_VIEWPORT_LOCK_CLASS = "game-viewport-lock";

/**
 * Locks the document viewport while the battlefield is mounted.
 *
 * The fixed document prevents iOS rubber-band scrolling from moving the PWA,
 * while nested overflow containers such as drawers and dialogs remain
 * independently scrollable.
 */
export function useGameViewportLock() {
  useEffect(() => {
    const root = document.documentElement;
    const body = document.body;
    const rootAlreadyLocked = root.classList.contains(GAME_VIEWPORT_LOCK_CLASS);
    const bodyAlreadyLocked = body.classList.contains(GAME_VIEWPORT_LOCK_CLASS);

    root.classList.add(GAME_VIEWPORT_LOCK_CLASS);
    body.classList.add(GAME_VIEWPORT_LOCK_CLASS);

    return () => {
      if (!rootAlreadyLocked) root.classList.remove(GAME_VIEWPORT_LOCK_CLASS);
      if (!bodyAlreadyLocked) body.classList.remove(GAME_VIEWPORT_LOCK_CLASS);
    };
  }, []);
}
