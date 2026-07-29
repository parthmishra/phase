import { useEffect, useMemo, useState } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import type { PlayerId } from "../../adapter/types.ts";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { cardImageLookup } from "../../services/cardImageLookup.ts";
import { CARD_BACK_URL } from "../../services/scryfall.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { getPlayerZoneIds } from "../../viewmodel/gameStateView.ts";
import { arenaComposableArtSource } from "./arenaArtSource.ts";
import {
  ARENA_CARD_DEPTH,
  ARENA_CARD_WIDTH,
  arenaZoneLayout,
  type ArenaPodPresentation,
  type ArenaSeat,
  type ArenaTableLayout,
} from "./arenaLayout.ts";
import { useArenaImageTexture } from "./useArenaImageTexture.ts";

type ViewableZone = "graveyard" | "exile" | "library";
type ArenaCardZoneKind = "graveyard" | "library";

interface ArenaZonePilesProps {
  playerId: PlayerId;
  seat: ArenaSeat;
  tableLayout?: ArenaTableLayout;
  podPresentation?: ArenaPodPresentation;
  onViewZone?: (zone: ViewableZone, playerId: PlayerId) => void;
}

export function ArenaZonePiles({
  playerId,
  seat,
  tableLayout = "duel",
  podPresentation = "inward",
  onViewZone,
}: ArenaZonePilesProps) {
  const gameState = useGameStore((state) => state.gameState);
  const library = getPlayerZoneIds(gameState, "library", playerId);
  const graveyard = getPlayerZoneIds(gameState, "graveyard", playerId);
  const exile = getPlayerZoneIds(gameState, "exile", playerId);
  const graveyardTopId = graveyard[graveyard.length - 1];
  const graveyardTop = graveyardTopId == null
    ? null
    : gameState?.objects[graveyardTopId] ?? null;
  const graveyardLookup = graveyardTop ? cardImageLookup(graveyardTop) : null;
  const { src: graveyardImage } = useCardImage(graveyardLookup?.name ?? "", {
    size: "normal",
    oracleId: graveyardLookup?.oracleId,
    faceName: graveyardLookup?.faceName,
    faceIndex: graveyardLookup?.faceIndex,
  });
  const layout = arenaZoneLayout(seat, tableLayout, podPresentation);
  const handleView = (zone: ViewableZone) => onViewZone?.(zone, playerId);

  return (
    <group>
      <ArenaCardZone
        kind="library"
        count={library.length}
        position={layout.library}
        faceAngle={layout.faceAngle}
        imageSource={
          library.length > 0
            ? arenaComposableArtSource(CARD_BACK_URL)
            : null
        }
        stack={library.length > 0}
        onClick={() => handleView("library")}
      />
      <ArenaCardZone
        kind="graveyard"
        count={graveyard.length}
        position={layout.graveyard}
        faceAngle={layout.faceAngle}
        imageSource={
          graveyardImage
            ? arenaComposableArtSource(graveyardImage)
            : null
        }
        onClick={() => handleView("graveyard")}
      />
      {exile.length > 0 && (
        <ArenaExileZone
          count={exile.length}
          position={layout.exile}
          faceAngle={layout.faceAngle}
          onClick={() => handleView("exile")}
        />
      )}
    </group>
  );
}

interface ArenaCardZoneProps {
  kind: ArenaCardZoneKind;
  count: number;
  position: [number, number, number];
  faceAngle: number;
  imageSource: string | null;
  stack?: boolean;
  onClick: () => void;
}

function ArenaCardZone({
  kind,
  count,
  position,
  faceAngle,
  imageSource,
  stack = false,
  onClick,
}: ArenaCardZoneProps) {
  const texture = useArenaImageTexture(imageSource);
  const emptyTexture = useMemo(() => makeEmptyZoneTexture(kind), [kind]);
  const [hovered, setHovered] = useState(false);
  const stackHeight = stack
    ? Math.min(0.09 + count * 0.002, 0.2)
    : count > 0
      ? 0.045
      : 0;

  useEffect(() => () => emptyTexture.dispose(), [emptyTexture]);

  const pointerOver = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(true);
    document.body.style.cursor = "pointer";
  };
  const pointerOut = (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    setHovered(false);
    document.body.style.cursor = "";
  };

  return (
    <group
      position={position}
      rotation={[0, faceAngle, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerOver={pointerOver}
      onPointerOut={pointerOut}
    >
      {count > 0 ? (
        <>
          <mesh
            position={[0, stackHeight / 2, 0]}
            castShadow
            receiveShadow
          >
            <boxGeometry
              args={[ARENA_CARD_WIDTH, stackHeight, ARENA_CARD_DEPTH]}
            />
            <meshStandardMaterial
              color={stack ? "#111820" : "#22262b"}
              roughness={0.72}
              metalness={0.08}
            />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, stackHeight + (hovered ? 0.055 : 0.006), 0]}
          >
            <planeGeometry args={[ARENA_CARD_WIDTH, ARENA_CARD_DEPTH]} />
            <meshBasicMaterial
              key={texture?.uuid ?? "arena-zone-loading"}
              map={texture}
              color={texture ? "#ffffff" : "#29343f"}
              transparent
              alphaTest={0.04}
              toneMapped={false}
            />
          </mesh>
        </>
      ) : (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.006, 0]}
        >
          <planeGeometry args={[ARENA_CARD_WIDTH, ARENA_CARD_DEPTH]} />
          <meshBasicMaterial
            map={emptyTexture}
            transparent
            opacity={hovered ? 0.72 : 0.46}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

interface ArenaExileZoneProps {
  count: number;
  position: [number, number, number];
  faceAngle: number;
  onClick: () => void;
}

function ArenaExileZone({
  count,
  position,
  faceAngle,
  onClick,
}: ArenaExileZoneProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <group
      position={position}
      rotation={[0, faceAngle, 0]}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(event) => {
        event.stopPropagation();
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
        <planeGeometry args={[ARENA_CARD_WIDTH, ARENA_CARD_DEPTH]} />
        <meshStandardMaterial
          color="#17142b"
          emissive="#4b3490"
          emissiveIntensity={hovered ? 0.48 : 0.24}
          roughness={0.46}
          metalness={0.22}
        />
      </mesh>
      {Array.from({ length: Math.min(count, 3) }, (_, index) => (
        <mesh
          key={index}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, 0.025 + index * 0.003, 0]}
        >
          <ringGeometry
            args={[0.25 + index * 0.11, 0.31 + index * 0.11, 64]}
          />
          <meshBasicMaterial
            color="#9c7cf4"
            transparent
            opacity={(hovered ? 0.82 : 0.5) - index * 0.1}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

function makeEmptyZoneTexture(kind: ArenaCardZoneKind): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 390;
  canvas.height = 546;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");

  context.fillStyle = "rgba(5, 10, 17, 0.34)";
  context.beginPath();
  context.roundRect(8, 8, 374, 530, 28);
  context.fill();
  context.strokeStyle = "rgba(156, 176, 198, 0.26)";
  context.lineWidth = 5;
  context.stroke();

  context.strokeStyle = "rgba(156, 176, 198, 0.2)";
  context.fillStyle = "rgba(111, 131, 153, 0.16)";
  context.lineWidth = 10;
  if (kind === "graveyard") {
    context.beginPath();
    context.roundRect(126, 150, 138, 234, 54);
    context.fill();
    context.stroke();
    context.beginPath();
    context.moveTo(98, 396);
    context.lineTo(292, 396);
    context.stroke();
  } else {
    for (const offset of [0, 18]) {
      context.beginPath();
      context.roundRect(112 + offset, 134 - offset, 150, 244, 20);
      context.stroke();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}
