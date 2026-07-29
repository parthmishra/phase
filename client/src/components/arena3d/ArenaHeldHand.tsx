import { useMemo } from "react";
import * as THREE from "three";

import type {
  GameObject,
  ObjectId,
  PlayerId,
} from "../../adapter/types.ts";
import { useCardImage } from "../../hooks/useCardImage.ts";
import { usePerspectivePlayerId } from "../../hooks/usePlayerId.ts";
import { cardImageLookup } from "../../services/cardImageLookup.ts";
import { CARD_BACK_URL } from "../../services/scryfall.ts";
import { useGameStore } from "../../stores/gameStore.ts";
import { isPrivatelyLookedAtByViewer } from "../../viewmodel/gameStateView.ts";
import {
  ARENA_CARD_DEPTH,
  ARENA_CARD_WIDTH,
  arenaHeldCardFan,
  arenaHeldHandLayout,
  type ArenaHeldCardTransform,
  type ArenaSeat,
  type ArenaTableLayout,
} from "./arenaLayout.ts";
import { arenaComposableArtSource } from "./arenaArtSource.ts";
import { useArenaImageTexture } from "./useArenaImageTexture.ts";

const HELD_CARD_WIDTH = ARENA_CARD_WIDTH * 0.92;
const HELD_CARD_HEIGHT = ARENA_CARD_DEPTH * 0.92;
const HELD_CARD_THICKNESS = 0.045;

interface ArenaHeldHandProps {
  playerId: PlayerId;
  seat: ArenaSeat;
  tableLayout: ArenaTableLayout;
  showCards?: boolean;
}

/**
 * A concealed hand belongs to the world, not the HUD. The restrained floating
 * fan sits above the material plane at its player's seat edge without adding a
 * holder, prop, or screen-space ribbon.
 */
export function ArenaHeldHand({
  playerId,
  seat,
  tableLayout,
  showCards = false,
}: ArenaHeldHandProps) {
  const gameState = useGameStore((state) => state.gameState);
  const perspectivePlayerId = usePerspectivePlayerId();
  const player = gameState?.players[playerId];
  const backTexture = useArenaImageTexture(
    arenaComposableArtSource(CARD_BACK_URL),
  );
  const layout = arenaHeldHandLayout(seat, tableLayout);
  const transforms = useMemo(
    () => arenaHeldCardFan(player?.hand.length ?? 0),
    [player?.hand.length],
  );

  if (!player) return null;

  return (
    <group
      position={layout.position}
      rotation={[0, layout.faceAngle, 0]}
      scale={layout.scale}
    >
      {player.hand.map((objectId, index) => {
        const isRevealed =
          gameState?.revealed_cards?.includes(objectId) === true
          || gameState?.public_revealed_cards?.includes(objectId) === true
          || isPrivatelyLookedAtByViewer(
            gameState,
            objectId,
            perspectivePlayerId,
          );
        const transform = transforms[index];
        return transform ? (
          <HeldCard
            key={objectId}
            objectId={objectId}
            transform={transform}
            showFace={showCards || isRevealed}
            backTexture={backTexture}
          />
        ) : null;
      })}
    </group>
  );
}

function HeldCard({
  objectId,
  transform,
  showFace,
  backTexture,
}: {
  objectId: ObjectId;
  transform: ArenaHeldCardTransform;
  showFace: boolean;
  backTexture: THREE.Texture | null;
}) {
  const object = useGameStore(
    (state) => state.gameState?.objects[objectId] ?? null,
  );

  return (
    <group
      position={[transform.x, transform.y, transform.z]}
      rotation={[0, 0, transform.rotationZ]}
      scale={transform.scale}
    >
      <mesh position={[0, HELD_CARD_HEIGHT / 2, 0]}>
        <boxGeometry
          args={[HELD_CARD_WIDTH, HELD_CARD_HEIGHT, HELD_CARD_THICKNESS]}
        />
        <meshStandardMaterial
          color="#17191d"
          roughness={0.96}
          metalness={0}
        />
      </mesh>
      {showFace && object ? (
        <HeldFace
          object={object}
          fallbackTexture={backTexture}
        />
      ) : (
        <HeldCardSurface texture={backTexture} />
      )}
    </group>
  );
}

function HeldFace({
  object,
  fallbackTexture,
}: {
  object: GameObject;
  fallbackTexture: THREE.Texture | null;
}) {
  const lookup = cardImageLookup(object);
  const { src } = useCardImage(lookup.name, {
    size: "normal",
    oracleId: lookup.oracleId,
    faceName: lookup.faceName,
    faceIndex: lookup.faceIndex,
  });
  const texture = useArenaImageTexture(
    src ? arenaComposableArtSource(src) : null,
  );

  return <HeldCardSurface texture={texture ?? fallbackTexture} />;
}

function HeldCardSurface({ texture }: { texture: THREE.Texture | null }) {
  return (
    <mesh
      position={[0, HELD_CARD_HEIGHT / 2, HELD_CARD_THICKNESS / 2 + 0.003]}
    >
      <planeGeometry args={[HELD_CARD_WIDTH * 0.97, HELD_CARD_HEIGHT * 0.97]} />
      <meshLambertMaterial
        key={texture?.uuid ?? "held-card-loading"}
        map={texture}
        color={texture ? "#ffffff" : "#332f29"}
        emissive={texture ? "#18130e" : "#17130f"}
        emissiveIntensity={texture ? 0.3 : 0.18}
        transparent
        alphaTest={0.04}
        shadowSide={THREE.DoubleSide}
      />
    </mesh>
  );
}
