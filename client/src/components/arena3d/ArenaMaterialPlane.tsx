import { useEffect, useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  ARENA_MATERIAL_PLANE_DEPTH,
  ARENA_MATERIAL_PLANE_WIDTH,
  configureArenaStoneTexture,
  createArenaStoneMaterial,
  selectArenaStoneTextureFocusScale,
  selectArenaStoneTextureUrls,
} from "./arenaMaterialPlane.ts";

/**
 * The battlefield is a cropped piece of a larger environment, not a table.
 * This plane continues well beyond every supported camera crop so no border,
 * slab edge, or furniture silhouette competes with the cards.
 */
export function ArenaMaterialPlane() {
  const { gl, invalidate, size } = useThree();
  const textureUrls = selectArenaStoneTextureUrls(
    size.width * gl.getPixelRatio(),
  );
  const textureFocusScale = selectArenaStoneTextureFocusScale(
    size.width / Math.max(size.height, 1),
  );
  const [colorMap, normalMap, roughnessMap] = useLoader(
    THREE.TextureLoader,
    [textureUrls.color, textureUrls.normal, textureUrls.roughness],
  );
  const geometry = useMemo(
    () =>
      new THREE.PlaneGeometry(
        ARENA_MATERIAL_PLANE_WIDTH,
        ARENA_MATERIAL_PLANE_DEPTH,
      ),
    [],
  );
  const surfaceMaterial = useMemo(
    () =>
      createArenaStoneMaterial({
        color: colorMap,
        normal: normalMap,
        roughness: roughnessMap,
      }),
    [colorMap, normalMap, roughnessMap],
  );

  useEffect(() => {
    configureArenaStoneTexture(
      colorMap,
      gl.capabilities.getMaxAnisotropy(),
      "color",
      textureFocusScale,
    );
    configureArenaStoneTexture(
      normalMap,
      gl.capabilities.getMaxAnisotropy(),
      "data",
      textureFocusScale,
    );
    configureArenaStoneTexture(
      roughnessMap,
      gl.capabilities.getMaxAnisotropy(),
      "data",
      textureFocusScale,
    );
    invalidate();
  }, [
    colorMap,
    gl,
    invalidate,
    normalMap,
    roughnessMap,
    textureFocusScale,
  ]);

  useEffect(
    () => () => {
      geometry.dispose();
      surfaceMaterial.dispose();
    },
    [geometry, surfaceMaterial],
  );

  return (
    <mesh
      geometry={geometry}
      material={surfaceMaterial}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    />
  );
}
