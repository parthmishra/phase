import { useEffect, useMemo, useState } from "react";
import { type ThreeEvent, useThree } from "@react-three/fiber";
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
  onViewZone?: (zone: ViewableZone, playerId: PlayerId) => void;
}

export function ArenaZonePiles({
  playerId,
  seat,
  tableLayout = "duel",
  onViewZone,
}: ArenaZonePilesProps) {
  const gameState = useGameStore((state) => state.gameState);
  const viewportLayout = useThree(({ size }) =>
    size.width / Math.max(size.height, 1) < 1 ? "compact" : "wide"
  );
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
  const layout = arenaZoneLayout(seat, tableLayout, viewportLayout);
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
              color={stack ? "#0b0e0f" : "#15191a"}
              roughness={0.98}
              metalness={0}
            />
          </mesh>
          <mesh
            rotation={[-Math.PI / 2, 0, 0]}
            position={[0, stackHeight + (hovered ? 0.055 : 0.006), 0]}
            castShadow
            receiveShadow
          >
            <planeGeometry args={[ARENA_CARD_WIDTH, ARENA_CARD_DEPTH]} />
            <meshLambertMaterial
              key={texture?.uuid ?? "arena-zone-loading"}
              map={texture}
              color={texture ? "#ffffff" : "#2f2a21"}
              transparent
              alphaTest={0.04}
              emissive={texture ? "#050505" : "#080b10"}
              emissiveIntensity={texture ? 0.02 : 0.16}
              shadowSide={THREE.DoubleSide}
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
      <mesh
        position={[0, 0.018 + Math.min(count, 8) * 0.001, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry
          args={[
            ARENA_CARD_WIDTH,
            0.036 + Math.min(count, 8) * 0.002,
            ARENA_CARD_DEPTH,
          ]}
        />
        <meshStandardMaterial
          color={hovered ? "#302d45" : "#211f31"}
          roughness={0.98}
          metalness={0}
        />
      </mesh>
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
  context.strokeStyle = kind === "graveyard"
    ? "rgba(145, 152, 166, 0.24)"
    : "rgba(122, 153, 174, 0.24)";
  context.lineWidth = 5;
  context.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}
