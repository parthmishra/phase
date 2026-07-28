# Phase Arena 3D experiment

## Product intent

This fork treats the battlefield as a spatial digital game surface rather than
a simulation of paper on a flat web page. The target is the immediacy of Magic:
The Gathering Arena with the depth, camera confidence, and impact cadence of
Yu-Gi-Oh! Master Duel.

The visual system follows four principles:

1. **Readable before spectacular.** Current characteristics, legal affordances,
   combat state, and target state must survive every camera and effect choice.
2. **Depth communicates state.** Hover lifts, attack travel, tap rotation,
   stack height, and impact response carry meaning instead of decorating it.
3. **Engine state is the only gameplay authority.** The scene consumes current
   objects, derived views, legal actions, waiting states, and attribution. It
   never infers legality from card text, art, type names, or animation state.
4. **Art is an ingredient, not the card.** Scryfall provides printing art.
   Phase composes the live name, mana cost, type line, rules surface, stats,
   counters, and modification signals.

## Renderer boundary

`ArenaCardPresentation` is the renderer-neutral visual contract:

```text
engine GameObject + derived presentation state
                    │
                    ▼
          ArenaCardPresentation
              ┌─────┴─────┐
              ▼           ▼
       DOM hand face   CanvasTexture
                          │
                          ▼
                   Three.js permanent
```

The hand remains DOM-rendered because it needs sharp text, direct manipulation,
keyboard semantics, and high-resolution inspection. Battlefield permanents use
small, bounded canvas textures that rebuild only when their presentation
revision changes.

The existing Phase dispatch pipeline remains authoritative. Three.js hit tests
route object IDs into the same engine-provided legal action buckets and
waiting-state responses used by the DOM board.

## First vertical slice

The first slice intentionally targets desktop 1v1:

- live engine state on a perspective table;
- current characteristics composed over art crops;
- dynamic DOM hand cards;
- targeting, attacker/blocker selection, activated abilities, mana actions,
  equip targets, board choices, tap undo, inspection, and selection;
- low-cost hover lift, tap spring, attack travel, and semantic glow language;
- capped DPR, demand rendering, no post-processing, and delayed texture
  disposal.

Four-player camera choreography, attachments, combat lines, flight/impact
events, stack projection anchors, and a full semantic rules-text document are
the next milestones. Portrait is not a scaled-down desktop camera; it will
receive a separate composition after desktop interaction density is proven.

## Visual language

- Deep green-black stone/felt surface: quiet enough for multicolor art.
- Warm brass center light: priority and resolution feel ceremonial.
- Cyan: an available action.
- Acid green: a legal target.
- Ember orange: declared combat.
- Warm ivory: selected/inspected.
- Green edge filament on a card face: engine-attributed live modification.

The scene avoids constant ambient movement. Motion is reserved for state
changes and direct input so the board stays calm while the player thinks.

## Live game-feel review

The vertical slice was exercised in a real Commander AI game rather than only
with fixture state. The review covered mulligan-to-main-phase flow, land play,
manual mana, casting, token creation, a continuous +1/+1 effect, and attacker
selection.

What currently earns its place:

- The shallow perspective establishes a duel space without compromising hand
  access or the existing priority controls.
- Land tapping, permanent arrival, hover lift, and attack travel are brief and
  state-linked. The table is still while the player is reading.
- Legal-action cyan, modifier green, and combat ember remain distinguishable
  against both green and multicolor art.
- Engine-current 2/2 stats and the modifier filament appeared on a Squirrel
  token immediately after Squirrel Sovereign resolved, which validates the
  primary advantage over static printing images.

What should be rejected or changed in the next slice:

- A static printing image still takes over the large hover inspection. That
  breaks the live-card illusion precisely where a player expects authoritative
  detail.
- Permanents resolve directly into a lane; they need projected zone-to-table
  travel and impact timing before spell resolution has Master Duel-like weight.
- The focused-opponent layout is usable for 1v1 but is not a four-player
  composition. Four seats need deliberate camera choreography and focus
  transitions, not additional rows squeezed onto this table.
- Sound and particles should reinforce engine events only after projected
  anchors exist. Generic ambient spectacle would make priority-heavy Magic
  harder to read.

## Performance constraints

- Battlefield textures are 640×420 without mipmaps.
- Texture entries are revision-keyed, shared, reference-counted, and disposed
  after a short reuse window.
- Canvas DPR is capped at 1.5.
- The R3F loop uses `frameloop="demand"`; springs invalidate only while moving.
- Geometry is deliberately flat and post-processing is absent in the first
  slice.
- Full-card text remains DOM-only; battlefield textures prioritize glance
  recognition.
- Scryfall's image CDN is intentionally suitable for opaque `<img>` requests,
  not canvas/WebGL composition. Composited cards therefore use fixed-host,
  same-origin image transports (`/arena-card-art` and `/arena-card-back`).
  Vite supplies those routes for the experiment; a production target must
  expose equivalent fixed routes or ship an owned art cache.

## Known first-slice limitations

- Only the focused opponent is placed in the scene.
- Attachments and exile links are not yet spatialized.
- The old DOM animation position registry does not yet receive projected
  Three.js anchors, so some event overlays will not originate from the mesh.
- Rules text currently combines the printed text surface with engine-current
  characteristics and an attribution signal. Arbitrary phrase-level changes
  require a future engine-authored structured rules-text projection.
- Zone piles and the stack remain existing DOM surfaces.
- The existing large hover preview still uses a printing image. The dynamic
  face should replace that inspection surface next so modified text and
  characteristics remain visible at reading size, not only in the hand and
  battlefield badges.
