import { motion, useReducedMotion } from "framer-motion";

import type {
  CardMotionTarget,
  ReleasedCardMotion,
} from "../../stores/animationStore.ts";
import { ArenaStackCardSurface } from "../stack/ArenaStackCardSurface.tsx";
import { cardFlightControl } from "./cardMotion.ts";

interface CastArcAnimationProps {
  objectId: number;
  from: CardMotionTarget;
  to: CardMotionTarget;
  release?: ReleasedCardMotion;
  mode:
    | "cast"
    | "play-permanent"
    | "resolve-permanent"
    | "resolve-spell";
  duration: number;
  onComplete: () => void;
}

/**
 * Carries the live, composed card face between zones. It intentionally does
 * not substitute a printing image: crown, title, counters, and frame treatment
 * remain the same visual game piece the player picked up in hand.
 */
export function CastArcAnimation({
  objectId,
  from,
  to,
  release,
  mode,
  duration,
  onComplete,
}: CastArcAnimationProps) {
  const shouldReduceMotion = useReducedMotion();
  const velocity = release?.velocity ?? { x: 0, y: 0 };
  const control = cardFlightControl(from, to, velocity);
  const transitDuration = shouldReduceMotion
    ? Math.min(duration, 0.12)
    : duration;
  const midWidth = (from.rect.width + to.rect.width) / 2 * 1.04;
  const midHeight = (from.rect.height + to.rect.height) / 2 * 1.04;

  return (
    <motion.div
      initial={{
        x: from.rect.x,
        y: from.rect.y,
        width: from.rect.width,
        height: from.rect.height,
        rotate: from.rotation,
        scale: 1,
        opacity: 1,
      }}
      animate={{
        x: shouldReduceMotion
          ? to.rect.x
          : [from.rect.x, control.x, to.rect.x],
        y: shouldReduceMotion
          ? to.rect.y
          : [from.rect.y, control.y, to.rect.y],
        width: shouldReduceMotion
          ? to.rect.width
          : [from.rect.width, midWidth, to.rect.width],
        height: shouldReduceMotion
          ? to.rect.height
          : [from.rect.height, midHeight, to.rect.height],
        rotate: shouldReduceMotion
          ? to.rotation
          : [from.rotation, control.rotation, to.rotation],
        scale: shouldReduceMotion ? 1 : [1, 1.035, 1],
        opacity: 1,
      }}
      transition={{
        duration: transitDuration,
        ease: [0.2, 0.72, 0.18, 1],
        times: shouldReduceMotion ? undefined : [0, 0.48, 1],
      }}
      onAnimationComplete={onComplete}
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        pointerEvents: "none",
        zIndex: 45,
        transformOrigin: "50% 50%",
        transformPerspective: 900,
        "--hand-card-w": "100%",
        "--hand-card-h": "100%",
      } as React.CSSProperties}
      data-card-in-flight={objectId}
      data-card-flight-mode={mode}
    >
      <ArenaStackCardSurface
        objectId={objectId}
        transitDuration={transitDuration}
      />
    </motion.div>
  );
}
