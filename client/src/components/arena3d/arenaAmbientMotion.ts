import type { GameObject } from "../../adapter/types.ts";

export const ARENA_FLYING_BOB_AMPLITUDE = 0.055;
export const ARENA_FLYING_BOB_PERIOD_SECONDS = 3.2;

/**
 * Presentation eligibility comes directly from the engine-projected permanent:
 * only a creature that currently has Flying receives the airborne treatment.
 */
export function isFlyingCreature(
  object: Pick<GameObject, "card_types" | "keywords"> | null | undefined,
): boolean {
  return object?.card_types.core_types.includes("Creature") === true
    && object.keywords.includes("Flying");
}

/** A deterministic phase keeps several flyers from moving in lockstep. */
export function arenaFlyingBobOffset(
  elapsedSeconds: number,
  objectId: number,
  animationSpeedMultiplier: number,
): number {
  if (animationSpeedMultiplier <= 0) return 0;

  const angularVelocity = (Math.PI * 2)
    / (ARENA_FLYING_BOB_PERIOD_SECONDS * animationSpeedMultiplier);
  const phase = (Math.abs(objectId) % 11) * 0.61;
  return Math.sin(elapsedSeconds * angularVelocity + phase)
    * ARENA_FLYING_BOB_AMPLITUDE;
}
