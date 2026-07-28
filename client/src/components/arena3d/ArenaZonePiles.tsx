import { useEffect, useMemo, useState } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { useTranslation } from "react-i18next";
import * as THREE from "three";

import type { PlayerId } from "../../adapter/types.ts";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { cardImageLookup } from "../../services/cardImageLookup.ts";
import { CARD_BACK_URL } from "../../services/scryfall.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { getPlayerZoneIds } from "../../viewmodel/gameStateView.ts";
import { arenaComposableArtSource } from "./arenaArtSource.ts";
import { arenaZoneLayout, type ArenaSeat } from "./arenaLayout.ts";

type ViewableZone = "graveyard" | "exile" | "library";

interface ArenaZonePilesProps {
  playerId: PlayerId;
  seat: ArenaSeat;
  onViewZone?: (zone: ViewableZone, playerId: PlayerId) => void;
}

const CARD_WIDTH = 1.3;
const CARD_HEIGHT = 1.82;

export function ArenaZonePiles({
  playerId,
  seat,
  onViewZone,
}: ArenaZonePilesProps) {
  const { t } = useTranslation("game");
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
  const layout = arenaZoneLayout(seat);
  const handleView = (zone: ViewableZone) => onViewZone?.(zone, playerId);

  return (
    <group>
      <ArenaCardZone
        label={t("zone.library")}
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
        label={t("zone.graveyard")}
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
          label={t("zone.exile")}
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
  label: string;
  count: number;
  position: [number, number, number];
  faceAngle: number;
  imageSource: string | null;
  stack?: boolean;
  onClick: () => void;
}

function ArenaCardZone({
  label,
  count,
  position,
  faceAngle,
  imageSource,
  stack = false,
  onClick,
}: ArenaCardZoneProps) {
  const texture = useImageTexture(imageSource);
  const labelTexture = useMemo(
    () => makeZoneLabelTexture(label, count, "#dbe8f4"),
    [count, label],
  );
  const [hovered, setHovered] = useState(false);
  const stackHeight = stack ? Math.min(0.09 + count * 0.002, 0.2) : 0.045;

  useEffect(() => () => labelTexture.dispose(), [labelTexture]);

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
      <mesh
        position={[0, stackHeight / 2, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[CARD_WIDTH, stackHeight, CARD_HEIGHT]} />
        <meshStandardMaterial
          color={stack ? "#111820" : "#22262b"}
          roughness={0.72}
          metalness={0.08}
        />
      </mesh>

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, stackHeight + (hovered ? 0.07 : 0.006), 0]}
        castShadow
      >
        <planeGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
        <meshBasicMaterial
          key={texture?.uuid ?? "arena-zone-loading"}
          map={texture}
          color={texture ? "#ffffff" : count > 0 ? "#29343f" : "#141b24"}
          toneMapped={false}
        />
      </mesh>

      {count === 0 && (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, stackHeight + 0.012, 0]}
        >
          <ringGeometry args={[0.34, 0.42, 48]} />
          <meshBasicMaterial
            color="#708197"
            transparent
            opacity={0.22}
            depthWrite={false}
          />
        </mesh>
      )}

      <sprite position={[0, 0.62 + stackHeight, 0]} scale={[1.56, 0.39, 1]}>
        <spriteMaterial
          map={labelTexture}
          transparent
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

interface ArenaExileZoneProps {
  label: string;
  count: number;
  position: [number, number, number];
  faceAngle: number;
  onClick: () => void;
}

function ArenaExileZone({
  label,
  count,
  position,
  faceAngle,
  onClick,
}: ArenaExileZoneProps) {
  const labelTexture = useMemo(
    () => makeZoneLabelTexture(label, count, "#c5b9ff"),
    [count, label],
  );
  const [hovered, setHovered] = useState(false);

  useEffect(() => () => labelTexture.dispose(), [labelTexture]);

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
        <planeGeometry args={[CARD_WIDTH, CARD_HEIGHT]} />
        <meshStandardMaterial
          color="#17142b"
          emissive="#4b3490"
          emissiveIntensity={hovered ? 0.48 : 0.24}
          roughness={0.46}
          metalness={0.22}
        />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.025, 0]}>
        <ringGeometry args={[0.28, 0.48, 64]} />
        <meshBasicMaterial
          color="#9c7cf4"
          transparent
          opacity={hovered ? 0.8 : 0.48}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <sprite position={[0, 0.62, 0]} scale={[1.56, 0.39, 1]}>
        <spriteMaterial
          map={labelTexture}
          transparent
          depthTest={false}
          toneMapped={false}
        />
      </sprite>
    </group>
  );
}

function useImageTexture(source: string | null): THREE.Texture | null {
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

function makeZoneLabelTexture(
  label: string,
  count: number,
  color: string,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas unavailable");

  context.fillStyle = "rgba(8, 13, 20, 0.9)";
  context.beginPath();
  context.roundRect(34, 27, 444, 74, 30);
  context.fill();
  context.strokeStyle = "rgba(170, 195, 220, 0.28)";
  context.lineWidth = 3;
  context.stroke();
  context.fillStyle = color;
  context.font = '700 34px "Arena Beleren", Georgia, serif';
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(`${label.toUpperCase()}  ${count}`, 256, 65);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}
