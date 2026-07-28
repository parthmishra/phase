import { useEffect, useState } from "react";

import {
  arenaCardRevision,
  type ArenaCardPresentation,
} from "./arenaCardPresentation.ts";
import { renderArenaCardCanvas } from "./arenaCardCanvas.ts";

const composedCardCache = new Map<string, Promise<string>>();

export function useArenaComposedCard(
  presentation: ArenaCardPresentation | null,
  artSource: string | null,
): string | null {
  const key =
    presentation && artSource
      ? `${arenaCardRevision(presentation)}|${artSource}`
      : null;
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!key || !presentation || !artSource) {
      setDataUrl(null);
      return;
    }

    let cancelled = false;
    let request = composedCardCache.get(key);
    if (!request) {
      request = renderArenaCardCanvas(presentation, artSource).then((canvas) =>
        canvas.toDataURL("image/png"),
      );
      composedCardCache.set(key, request);
    }
    request
      .then((nextDataUrl) => {
        if (!cancelled) setDataUrl(nextDataUrl);
      })
      .catch((error: unknown) => {
        console.error("Arena card composition failed", error);
        if (!cancelled) setDataUrl(null);
        composedCardCache.delete(key);
      });

    return () => {
      cancelled = true;
    };
  }, [artSource, key, presentation]);

  return dataUrl;
}
