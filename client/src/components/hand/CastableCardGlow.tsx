import { motion, useReducedMotion } from "framer-motion";

import { usePreferencesStore } from "../../stores/preferencesStore.ts";

interface CastableCardGlowProps {
  className?: string;
}

/**
 * A castability cue that lives entirely outside the printed card frame.
 * Keeping this as a separate, pointer-transparent layer preserves the card's
 * real border color while the soft cyan bloom supplies the Arena-style cue.
 */
export function CastableCardGlow({ className = "" }: CastableCardGlowProps) {
  const shouldReduceMotion = useReducedMotion();
  const animationSpeedMultiplier = usePreferencesStore(
    (state) => state.animationSpeedMultiplier,
  );
  const animateGlow = !shouldReduceMotion && animationSpeedMultiplier > 0;

  return (
    <motion.div
      aria-hidden
      data-castable-card-glow
      className={`pointer-events-none absolute -inset-[6px] rounded-[6%/4.5%] ${className}`}
      style={{
        background: "rgba(34, 211, 238, 0.3)",
        boxShadow:
          "0 0 10px 6px rgba(103, 232, 249, 0.72), 0 0 28px 10px rgba(14, 165, 233, 0.4)",
        filter: "blur(4px)",
      }}
      initial={false}
      animate={
        animateGlow
          ? {
              opacity: [0.48, 0.88, 0.56],
              scale: [0.99, 1.018, 0.99],
            }
          : { opacity: 0.72, scale: 1 }
      }
      transition={
        animateGlow
          ? {
              duration: 2.15 * animationSpeedMultiplier,
              ease: "easeInOut",
              repeat: Infinity,
            }
          : { duration: 0 }
      }
    />
  );
}
