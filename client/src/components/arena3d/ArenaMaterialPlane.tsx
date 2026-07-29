import { useEffect, useMemo } from "react";
import { useLoader, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  ARENA_MATERIAL_PLANE_DEPTH,
  ARENA_MATERIAL_PLANE_WIDTH,
  ARENA_STONE_TEXTURE_URL,
  configureArenaStoneTexture,
} from "./arenaMaterialPlane.ts";

/**
 * The battlefield is a cropped piece of a larger environment, not a table.
 * This plane continues well beyond every supported camera crop so no border,
 * slab edge, or furniture silhouette competes with the cards.
 */
export function ArenaMaterialPlane() {
  const { gl, invalidate } = useThree();
  const colorMap = useLoader(THREE.TextureLoader, ARENA_STONE_TEXTURE_URL);
  const geometry = useMemo(
    () =>
      new THREE.PlaneGeometry(
        ARENA_MATERIAL_PLANE_WIDTH,
        ARENA_MATERIAL_PLANE_DEPTH,
      ),
    [],
  );
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: colorMap,
        color: "#f1f3ef",
        roughness: 0.94,
        metalness: 0,
        envMapIntensity: 0.28,
      }),
    [colorMap],
  );

  useEffect(() => {
    configureArenaStoneTexture(
      colorMap,
      gl.capabilities.getMaxAnisotropy(),
    );
    invalidate();
  }, [colorMap, gl, invalidate]);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    />
  );
}
