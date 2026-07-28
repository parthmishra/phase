import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import type { ArenaPlacement } from "./arenaLayout.ts";
import { useArenaCardTexture } from "./useArenaCardTexture.ts";
import { useArenaPermanentInteraction } from "./useArenaPermanentInteraction.ts";
import { useGameStore } from "../../stores/gameStore.ts";

const CARD_WIDTH = 1.78;
const CARD_HEIGHT = 1.16;

interface ArenaPermanentProps extends ArenaPlacement {
  pileCount: number;
}

export function ArenaPermanent({
  objectId,
  pileCount,
  position,
  faceAngle,
  attackDirection,
}: ArenaPermanentProps) {
  const object = useGameStore((state) => state.gameState?.objects[objectId]);
  const texture = useArenaCardTexture(objectId, pileCount);
  const interaction = useArenaPermanentInteraction(objectId);
  const groupRef = useRef<THREE.Group>(null);
  const arrivalRingRef = useRef<THREE.Mesh>(null);
  const arrivalAgeRef = useRef(0);
  const initialPlacementRef = useRef({
    attackDirection,
    faceAngle,
    position,
  });
  const { invalidate } = useThree();

  useLayoutEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    const initial = initialPlacementRef.current;
    group.position.set(
      initial.position[0],
      initial.position[1] + 0.42,
      initial.position[2] + initial.attackDirection * 0.14,
    );
    group.rotation.y = initial.faceAngle;
    group.scale.setScalar(0.86);
    invalidate();
  }, [invalidate]);

  useEffect(() => invalidate(), [
    faceAngle,
    interaction.isActionable,
    interaction.isAttacking,
    interaction.isBlocking,
    interaction.isHovered,
    interaction.isSelected,
    interaction.isValidTarget,
    invalidate,
    object?.tapped,
    position,
    texture,
  ]);

  useFrame((_state, delta) => {
    const group = groupRef.current;
    if (!group) return;

    const arrivalDuration = 0.52;
    arrivalAgeRef.current = Math.min(
      arrivalDuration,
      arrivalAgeRef.current + delta,
    );
    const arrivalProgress = arrivalAgeRef.current / arrivalDuration;
    const arrivalRing = arrivalRingRef.current;
    if (arrivalRing) {
      const ringScale = THREE.MathUtils.lerp(0.68, 1.46, arrivalProgress);
      arrivalRing.scale.setScalar(ringScale);
      const ringMaterial = arrivalRing.material as THREE.MeshBasicMaterial;
      ringMaterial.opacity = 0.46 * (1 - arrivalProgress) ** 2;
    }

    const response = 1 - Math.exp(-delta * 14);
    const targetX = position[0];
    const targetZ =
      position[2] + (interaction.isAttacking ? attackDirection : 0);
    const targetY =
      position[1]
      + (interaction.isAttacking ? 0.07 : 0);
    const targetRotation =
      faceAngle + (object?.tapped ? Math.PI / 2 : 0);
    const targetScale = interaction.isHovered ? 1.09 : 1;

    group.position.x = THREE.MathUtils.lerp(group.position.x, targetX, response);
    group.position.y = THREE.MathUtils.lerp(group.position.y, targetY, response);
    group.position.z = THREE.MathUtils.lerp(group.position.z, targetZ, response);
    group.rotation.y = lerpAngle(group.rotation.y, targetRotation, response);
    const nextScale = THREE.MathUtils.lerp(
      group.scale.x,
      targetScale,
      response,
    );
    group.scale.setScalar(nextScale);

    const unsettled =
      Math.abs(group.position.x - targetX) > 0.001
      || Math.abs(group.position.y - targetY) > 0.001
      || Math.abs(group.position.z - targetZ) > 0.001
      || Math.abs(angleDelta(group.rotation.y, targetRotation)) > 0.001
      || Math.abs(group.scale.x - targetScale) > 0.001;
    if (unsettled || arrivalProgress < 1) invalidate();
  });

  if (!object) return null;

  const glow = permanentGlow(interaction);

  const handlePointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    interaction.onPointerEnter();
    document.body.style.cursor = interaction.isActionable ? "pointer" : "zoom-in";
  };

  const handlePointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    interaction.onPointerLeave();
    document.body.style.cursor = "";
  };

  return (
    <group
      onClick={(event) => {
        event.stopPropagation();
        interaction.onClick();
      }}
      onPointerOver={handlePointerOver}
      onPointerOut={handlePointerOut}
    >
      {/* Keep a stationary raycast surface over the permanent's resting slot.
          Visual scale, arrival, tap, and combat motion must not move the hover
          target out from under the cursor and dismiss the inspection preview. */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[position[0], position[1] + 0.24, position[2]]}
      >
        <planeGeometry args={[CARD_WIDTH * 1.16, CARD_HEIGHT * 1.22]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>

      <group ref={groupRef}>
        <mesh
          ref={arrivalRingRef}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.01, 0]}
        >
          <ringGeometry args={[0.62, 0.72, 72]} />
          <meshBasicMaterial
            color="#f1cf83"
            transparent
            opacity={0.46}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>

        {glow && (
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, -0.004, 0]}
          >
            <planeGeometry args={[CARD_WIDTH + 0.13, CARD_HEIGHT + 0.13]} />
            <meshBasicMaterial
              color={glow.color}
              transparent
              opacity={glow.opacity}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        )}

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          castShadow
          receiveShadow
        >
          <planeGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
          <meshBasicMaterial
            key={texture?.uuid ?? "arena-loading"}
            map={texture}
            color={texture ? "#ffffff" : "#19221f"}
            transparent
            alphaTest={0.06}
            toneMapped={false}
          />
        </mesh>

        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.025, 0.035]}
        >
          <planeGeometry args={[CARD_WIDTH * 1.02, CARD_HEIGHT * 1.02]} />
          <meshBasicMaterial
            color="#000000"
            transparent
            opacity={0.34}
            depthWrite={false}
          />
        </mesh>
      </group>
    </group>
  );
}

function permanentGlow(
  interaction: ArenaPermanentInteractionLike,
): { color: string; opacity: number } | null {
  if (interaction.isAttacking || interaction.isBlocking) {
    return { color: "#f58b3b", opacity: 0.7 };
  }
  if (interaction.isValidTarget) {
    return { color: "#b9f65a", opacity: 0.82 };
  }
  if (interaction.isActionable) {
    return { color: "#62dcef", opacity: 0.58 };
  }
  if (interaction.isSelected) {
    return { color: "#f7e7b0", opacity: 0.55 };
  }
  return null;
}

interface ArenaPermanentInteractionLike {
  isActionable: boolean;
  isAttacking: boolean;
  isBlocking: boolean;
  isSelected: boolean;
  isValidTarget: boolean;
}

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function lerpAngle(from: number, to: number, amount: number): number {
  return from + angleDelta(from, to) * amount;
}
