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
     Composed hand face CanvasTexture
                          │
                          ▼
                   Three.js permanent
```

The hand remains a DOM interaction surface, but its visible face is a
high-resolution canvas composition shared by hand and inspection modes. It uses
the PoC's measured M15 frame geometry, Beleren title/type typography, MPlantin
rules typography, and locally rasterized Scryfall pips. Battlefield permanents
use small, bounded canvas textures that rebuild only when their presentation
revision changes.

Frame, font, and pip assets are runtime-only and gitignored. Run
`pnpm arena:assets` from `client/` to download them for a fresh checkout.

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

## Second vertical slice

The in-game desktop inspection surface now uses `ArenaCardFace` for the
engine-current active face. This preserves the existing preview's cursor
tracking, hand-origin animation, Shift/side preferences, Alt parse view,
attribution footer, and reporting controls while replacing the printing image
with readable live characteristics. Alternate-face inspection remains on the
printing renderer until the engine exposes a renderer-neutral projection for
the inactive face.

New battlefield permanents also arrive with a restrained lift, scale settle,
and one-shot brass resolve ring. The effect is deliberately attached to the
object mount rather than guessed from card text or zone names.

## Visual language

- Weathered flagstone slab in a spring woodland clearing: moss-tinged stone,
  a moss-and-leaf-litter floor, and a flat-shaded treeline closing in through
  soft green mist. The pod presentation is the kitchen table — one square
  seat per side; the inward diagonal variant was dropped.
- Warm afternoon sun filtered through the canopy, with dappled light pooled
  on the stone and a faint carved ring at the table's heart. Permanents hover
  above the slab with real cast shadows (`shadowSide` must stay double-sided —
  three.js renders only a front-side plane's culled back face into the shadow
  map, so flat card meshes otherwise cast nothing).
- Restrained ambient life: pollen-gold and faintly arcane motes drifting on a
  30 fps tick, and a near-still hover bob on idle permanents.
- Cyan: an available action.
- Acid green: a legal target.
- Ember orange: declared combat.
- Warm ivory: selected/inspected.
- Green edge filament on a card face: engine-attributed live modification.

Ambient motion is capped at the mote tick and the hover bob. Everything else
is reserved for state changes and direct input so the board stays calm while
the player thinks.

## Live game-feel review

The vertical slice was exercised in a real Commander AI game rather than only
with fixture state. The review covered mulligan-to-main-phase flow, land play,
manual mana, casting, token creation, a continuous +1/+1 effect, and attacker
selection.

What currently earns its place:

- The shallow perspective establishes a duel space without compromising hand
  access or the existing priority controls. The table deliberately fills the
  available play area rather than floating as a small object over the chosen
  background.
- Land tapping, permanent arrival, hover lift, and attack travel are brief and
  state-linked. The table is still while the player is reading.
- Legal-action cyan, modifier green, and combat ember remain distinguishable
  against both green and multicolor art.
- Engine-current 2/2 stats and the modifier filament appeared on a Squirrel
  token immediately after Squirrel Sovereign resolved, which validates the
  primary advantage over static printing images.

What should be rejected or changed in the next slice:

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
- The R3F loop uses `frameloop="demand"`; springs invalidate only while moving,
  and the ambient motes/dapple invalidate on a throttled 30 fps tick.
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
- Mobile and inactive-face inspection still use printing images. They should
  adopt the live face once their renderer-neutral face projections are
  available without reconstructing characteristics in React.
