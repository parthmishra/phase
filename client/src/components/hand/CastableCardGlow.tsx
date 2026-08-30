interface CastableCardGlowProps {
  className?: string;
}

/**
 * A castability cue that lives entirely outside the printed card frame.
 * Keeping this as a separate, pointer-transparent layer preserves the card's
 * real border color while the soft cyan bloom supplies the Arena-style cue.
 */
export function CastableCardGlow({ className = "" }: CastableCardGlowProps) {
  return (
    <div
      aria-hidden
      data-castable-card-glow
      className={`pointer-events-none absolute -inset-[2px] rounded-[4.8%/3.4%] ${className}`}
      style={{
        background: "rgba(34, 211, 238, 0.26)",
        boxShadow:
          "0 0 5px 2px rgba(103, 232, 249, 0.68), 0 0 11px 3px rgba(14, 165, 233, 0.32)",
        filter: "blur(2px)",
        opacity: 0.76,
      }}
    />
  );
}
