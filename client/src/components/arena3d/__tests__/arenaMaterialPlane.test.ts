import { describe, expect, it } from "vitest";
import * as THREE from "three";

import {
  ARENA_STONE_NORMAL_URL_5K,
  ARENA_STONE_ROUGHNESS_URL_5K,
  ARENA_STONE_TEXTURE_URL_5K,
  ARENA_STONE_TEXTURE_URL_STANDARD,
  configureArenaStoneTexture,
  createArenaStoneMaterial,
  selectArenaStoneTextureFocusScale,
  selectArenaStoneTextureUrl,
  selectArenaStoneTextureUrls,
} from "../arenaMaterialPlane.ts";

describe("selectArenaStoneTextureUrl", () => {
  it("loads the 5K asset for high-resolution drawing buffers", () => {
    expect(selectArenaStoneTextureUrl(5120)).toBe(
      ARENA_STONE_TEXTURE_URL_5K,
    );
    expect(selectArenaStoneTextureUrl(3840)).toBe(
      ARENA_STONE_TEXTURE_URL_5K,
    );
    expect(selectArenaStoneTextureUrls(3840)).toEqual({
      color: ARENA_STONE_TEXTURE_URL_5K,
      normal: ARENA_STONE_NORMAL_URL_5K,
      roughness: ARENA_STONE_ROUGHNESS_URL_5K,
    });
  });

  it("loads the smaller asset for ordinary and mobile drawing buffers", () => {
    expect(selectArenaStoneTextureUrl(2560)).toBe(
      ARENA_STONE_TEXTURE_URL_STANDARD,
    );
    expect(selectArenaStoneTextureUrl(1170)).toBe(
      ARENA_STONE_TEXTURE_URL_STANDARD,
    );
  });
});

describe("configureArenaStoneTexture", () => {
  it("focuses one clamped authored surface without exposing its edge pixels", () => {
    const texture = new THREE.Texture();

    configureArenaStoneTexture(texture, 32, "color");

    expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(texture.wrapS).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.wrapT).toBe(THREE.ClampToEdgeWrapping);
    expect(texture.repeat.toArray()).toEqual([1.9, 1.9]);
    expect(texture.center.toArray()).toEqual([0.5, 0.5]);
    expect(texture.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(texture.magFilter).toBe(THREE.LinearFilter);
    expect(texture.generateMipmaps).toBe(true);
    expect(texture.anisotropy).toBe(16);
  });

  it("backs off the focus crop for ultrawide viewports", () => {
    expect(selectArenaStoneTextureFocusScale(16 / 9)).toBe(1.9);
    expect(selectArenaStoneTextureFocusScale(2)).toBe(1.9);
    expect(selectArenaStoneTextureFocusScale(21 / 9)).toBeCloseTo(
      1.6286,
      4,
    );
    expect(selectArenaStoneTextureFocusScale(32 / 9)).toBeCloseTo(
      1.0688,
      4,
    );
  });

  it("keeps normal and roughness maps in linear data space", () => {
    const texture = new THREE.Texture();

    configureArenaStoneTexture(texture, 8, "data");

    expect(texture.colorSpace).toBe(THREE.NoColorSpace);
  });
});

describe("createArenaStoneMaterial", () => {
  it("lets the PBR maps and scene lights define the surface response", () => {
    const color = new THREE.Texture();
    const normal = new THREE.Texture();
    const roughness = new THREE.Texture();

    const material = createArenaStoneMaterial({
      color,
      normal,
      roughness,
    });

    expect(material.color.getHex()).toBe(0xdedede);
    expect(material.map).toBe(color);
    expect(material.normalMap).toBe(normal);
    expect(material.normalScale.toArray()).toEqual([0.32, 0.32]);
    expect(material.roughnessMap).toBe(roughness);
    expect(material.roughness).toBe(1);
    expect(material.metalness).toBe(0);
  });
});
