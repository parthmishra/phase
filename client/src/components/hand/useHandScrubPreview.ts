import { useCallback, useEffect, useRef } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";

import { useUiStore } from "../../stores/uiStore.ts";

const HOLD_DELAY_MS = 400;
const PRE_HOLD_MOVE_THRESHOLD_PX = 12;
const VERTICAL_SCRUB_TOLERANCE_PX = 28;

function cardAtPoint(container: HTMLElement, x: number, y: number): HTMLElement | null {
  const candidates = Array.from(
    container.querySelectorAll<HTMLElement>("[data-hand-card][data-object-id]"),
  )
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(({ rect }) =>
      x >= rect.left
      && x <= rect.right
      && y >= rect.top - VERTICAL_SCRUB_TOLERANCE_PX
      && y <= rect.bottom + VERTICAL_SCRUB_TOLERANCE_PX
    );

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const aDistance = Math.abs(x - (a.rect.left + a.rect.right) / 2);
    const bDistance = Math.abs(x - (b.rect.left + b.rect.right) / 2);
    return aDistance - bDistance;
  });
  return candidates[0].element;
}

/**
 * Mobile hand interaction matching Arena's gesture split:
 *
 * - a short tap remains available to open the full hand drawer;
 * - holding activates a non-blocking preview;
 * - horizontal movement while held scrubs across adjacent fanned cards;
 * - release dismisses the preview and never casts the card.
 *
 * The fan cards stay pointer-events-none on mobile, so this hook owns one stable
 * pointer-captured surface instead of moving the gesture target as cards animate.
 */
export function useHandScrubPreview(
  containerRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  const inspectObject = useUiStore((s) => s.inspectObject);
  const setPreviewSticky = useUiStore((s) => s.setPreviewSticky);
  const dismissPreview = useUiStore((s) => s.dismissPreview);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const startRef = useRef({ x: 0, y: 0 });
  const scrubbingRef = useRef(false);
  const activeCardRef = useRef<HTMLElement | null>(null);
  const suppressClickRef = useRef(false);
  const suppressResetRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoldTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearActiveCard = useCallback(() => {
    activeCardRef.current?.removeAttribute("data-hand-touch-active");
    activeCardRef.current = null;
  }, []);

  const inspectAtPoint = useCallback(
    (x: number, y: number) => {
      const container = containerRef.current;
      if (!container) return false;
      const card = cardAtPoint(container, x, y);
      if (!card) return false;
      if (card === activeCardRef.current) return true;

      const objectId = Number(card.dataset.objectId);
      if (!Number.isFinite(objectId)) return false;

      clearActiveCard();
      card.dataset.handTouchActive = "true";
      activeCardRef.current = card;
      inspectObject(objectId, undefined, "immediate");
      setPreviewSticky(true);
      return true;
    },
    [clearActiveCard, containerRef, inspectObject, setPreviewSticky],
  );

  const finishScrub = useCallback(() => {
    const wasScrubbing = scrubbingRef.current;
    clearHoldTimer();
    scrubbingRef.current = false;
    pointerIdRef.current = null;
    clearActiveCard();
    if (wasScrubbing) {
      dismissPreview();
      suppressClickRef.current = true;
      if (suppressResetRef.current != null) clearTimeout(suppressResetRef.current);
      // The synthetic click follows pointerup synchronously. Clear the guard on
      // the next task so a later real tap still opens the drawer.
      suppressResetRef.current = setTimeout(() => {
        suppressClickRef.current = false;
        suppressResetRef.current = null;
      }, 0);
    }
  }, [clearActiveCard, clearHoldTimer, dismissPreview]);

  useEffect(() => {
    return () => {
      clearHoldTimer();
      clearActiveCard();
      if (suppressResetRef.current != null) clearTimeout(suppressResetRef.current);
      if (scrubbingRef.current) dismissPreview();
    };
  }, [clearActiveCard, clearHoldTimer, dismissPreview]);

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled || event.pointerType === "mouse" || !event.isPrimary || event.button !== 0) {
        return;
      }

      clearHoldTimer();
      pointerIdRef.current = event.pointerId;
      startRef.current = { x: event.clientX, y: event.clientY };
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is best-effort on older WKWebView versions.
      }

      const { x, y } = startRef.current;
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        scrubbingRef.current = inspectAtPoint(x, y);
      }, HOLD_DELAY_MS);
    },
    [clearHoldTimer, enabled, inspectAtPoint],
  );

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;

      if (!scrubbingRef.current) {
        const dx = event.clientX - startRef.current.x;
        const dy = event.clientY - startRef.current.y;
        if (
          dx * dx + dy * dy
          > PRE_HOLD_MOVE_THRESHOLD_PX * PRE_HOLD_MOVE_THRESHOLD_PX
        ) {
          clearHoldTimer();
        }
        return;
      }

      event.preventDefault();
      inspectAtPoint(event.clientX, event.clientY);
    },
    [clearHoldTimer, inspectAtPoint],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      if (scrubbingRef.current) event.preventDefault();
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore capture-release mismatches from WebKit and test harnesses.
      }
      finishScrub();
    },
    [finishScrub],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (pointerIdRef.current !== event.pointerId) return;
      finishScrub();
    },
    [finishScrub],
  );

  const consumeClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  return {
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel },
    consumeClick,
  };
}
