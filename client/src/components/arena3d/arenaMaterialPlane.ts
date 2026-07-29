import * as THREE from "three";

export const ARENA_MATERIAL_PLANE_WIDTH = 46;
export const ARENA_MATERIAL_PLANE_DEPTH = 42;
export const ARENA_STONE_TEXTURE_URL =
  "/textures/arena/painted-stone-v3.png";

/**
 * Configures the authored stone albedo for a shallow camera angle.
 *
 * Mirrored wrapping hides hard seams without inventing noisy surface relief.
 * The moderate repeat keeps enough source pixels under the camera on large
 * screens while preserving the texture's broad, hand-painted forms.
 */
export function configureArenaStoneTexture(
  texture: THREE.Texture,
  maxAnisotropy: number,
): void {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.MirroredRepeatWrapping;
  texture.wrapT = THREE.MirroredRepeatWrapping;
  texture.repeat.set(1.92, 1.75);
  texture.center.set(0.5, 0.5);
  texture.rotation = -0.035;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(maxAnisotropy, 8);
  texture.needsUpdate = true;
}
