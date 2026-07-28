import { useEffect, useState } from "react";
import * as THREE from "three";

/**
 * Loads a CORS-clean card image into a rounded CanvasTexture. Clipping at the
 * texture boundary removes the opaque white JPEG corners present on some card
 * backs and keeps every 3D card surface on the same silhouette.
 */
export function useArenaImageTexture(source: string | null): THREE.Texture | null {
  const [loaded, setLoaded] = useState<{
    source: string;
    texture: THREE.Texture;
  } | null>(null);

  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.beginPath();
      context.roundRect(
        0,
        0,
        canvas.width,
        canvas.height,
        Math.round(canvas.width * 0.045),
      );
      context.clip();
      context.drawImage(image, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 8;
      setLoaded({ source, texture });
    };
    image.src = source;
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(
    () => () => {
      loaded?.texture.dispose();
    },
    [loaded],
  );

  return loaded?.source === source ? loaded.texture : null;
}
