import * as THREE from "three";

export const ARENA_MATERIAL_PLANE_WIDTH = 46;
export const ARENA_MATERIAL_PLANE_DEPTH = 42;
export const ARENA_STONE_TEXTURE_URL_5K =
  "/textures/arena/weathered-circular-inlay-v4-5k.jpg";
export const ARENA_STONE_TEXTURE_URL_STANDARD =
  "/textures/arena/weathered-circular-inlay-v4-2k.jpg";
export const ARENA_STONE_NORMAL_URL_5K =
  "/textures/arena/weathered-circular-inlay-v4-normal-5k.jpg";
export const ARENA_STONE_NORMAL_URL_STANDARD =
  "/textures/arena/weathered-circular-inlay-v4-normal-2k.jpg";
export const ARENA_STONE_ROUGHNESS_URL_5K =
  "/textures/arena/weathered-circular-inlay-v4-roughness-5k.jpg";
export const ARENA_STONE_ROUGHNESS_URL_STANDARD =
  "/textures/arena/weathered-circular-inlay-v4-roughness-2k.jpg";
const HIGH_RESOLUTION_TEXTURE_THRESHOLD = 3200;
const ARENA_STONE_TEXTURE_FOCUS_SCALE = 1.9;
const ARENA_STONE_FOCUS_REFERENCE_ASPECT = 2;

export interface ArenaStoneTextureUrls {
  color: string;
  normal: string;
  roughness: string;
}

export type ArenaStoneTextureSemantic = "color" | "data";

export function selectArenaStoneTextureUrls(
  canvasPixelWidth: number,
): ArenaStoneTextureUrls {
  return canvasPixelWidth >= HIGH_RESOLUTION_TEXTURE_THRESHOLD
    ? {
        color: ARENA_STONE_TEXTURE_URL_5K,
        normal: ARENA_STONE_NORMAL_URL_5K,
        roughness: ARENA_STONE_ROUGHNESS_URL_5K,
      }
    : {
        color: ARENA_STONE_TEXTURE_URL_STANDARD,
        normal: ARENA_STONE_NORMAL_URL_STANDARD,
        roughness: ARENA_STONE_ROUGHNESS_URL_STANDARD,
      };
}

export function selectArenaStoneTextureUrl(
  canvasPixelWidth: number,
): string {
  return selectArenaStoneTextureUrls(canvasPixelWidth).color;
}

/**
 * Keeps the authored texture footprint wider than the visible ground-plane
 * crop. Above a 2:1 viewport the horizontal crop grows with aspect ratio, so
 * the focus scale backs off instead of sampling ClampToEdge pixels.
 */
export function selectArenaStoneTextureFocusScale(
  viewportAspect: number,
): number {
  const safeAspect = Math.max(viewportAspect, 1);
  const aspectAdjustedScale =
    (ARENA_STONE_TEXTURE_FOCUS_SCALE
      * ARENA_STONE_FOCUS_REFERENCE_ASPECT)
    / safeAspect;
  return Math.min(ARENA_STONE_TEXTURE_FOCUS_SCALE, aspectAdjustedScale);
}

export function configureArenaStoneTexture(
  texture: THREE.Texture,
  maxAnisotropy: number,
  semantic: ArenaStoneTextureSemantic,
  focusScale = ARENA_STONE_TEXTURE_FOCUS_SCALE,
): void {
  texture.colorSpace =
    semantic === "color" ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  // Focus the single authored surface into the camera-visible play area.
  // The caller bounds this scale to the camera crop so clamp pixels remain
  // outside the viewport instead of stretching into visible corner streaks.
  texture.repeat.set(focusScale, focusScale);
  texture.rotation = 0;
  texture.center.set(0.5, 0.5);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(maxAnisotropy, 16);
  texture.needsUpdate = true;
}

export interface ArenaStoneMaterialMaps {
  color: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
}

export function createArenaStoneMaterial(
  maps: ArenaStoneMaterialMaps,
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: "#dedede",
    map: maps.color,
    normalMap: maps.normal,
    normalScale: new THREE.Vector2(0.32, 0.32),
    roughnessMap: maps.roughness,
    roughness: 1,
    metalness: 0,
    envMapIntensity: 0.18,
  });
}
