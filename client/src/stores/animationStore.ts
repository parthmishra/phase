import { create } from "zustand";
import type { GameState } from "../adapter/types";
import type { AnimationStep, PositionSnapshot } from "../animation/types";

export interface CardMotionTarget {
  rect: DOMRect;
  rotation: number;
}

export interface ReleasedCardMotion extends CardMotionTarget {
  velocity: { x: number; y: number };
  intendedZone?: "Stack";
}

interface AnimationStoreState {
  queue: AnimationStep[];
  activeStep: AnimationStep | null;
  isPlaying: boolean;
  positionRegistry: Map<number, DOMRect>;
  cardMotionDestinations: Map<number, CardMotionTarget>;
  zoneMotionDestinations: Map<string, CardMotionTarget>;
  releasedCardMotions: Map<number, ReleasedCardMotion>;
  inFlightObjectIds: Set<number>;
  animationNewState: GameState | null;
}

interface AnimationStoreActions {
  enqueueSteps: (steps: AnimationStep[]) => void;
  advanceStep: () => void;
  captureSnapshot: () => PositionSnapshot;
  registerPosition: (objectId: number, rect: DOMRect) => void;
  getPosition: (objectId: number) => DOMRect | undefined;
  setCardMotionDestinations: (
    cards: Map<number, CardMotionTarget>,
    zones: Map<string, CardMotionTarget>,
  ) => void;
  getCardMotionDestination: (objectId: number) => CardMotionTarget | undefined;
  getZoneMotionDestination: (
    playerId: number,
    zone: string,
  ) => CardMotionTarget | undefined;
  setReleasedCardMotion: (
    objectId: number,
    motion: ReleasedCardMotion,
  ) => void;
  getReleasedCardMotion: (objectId: number) => ReleasedCardMotion | undefined;
  markObjectInFlight: (objectId: number) => void;
  clearObjectMotion: (objectId: number) => void;
  setAnimationNewState: (state: GameState | null) => void;
  clearQueue: () => void;
}

export type AnimationStore = AnimationStoreState & AnimationStoreActions;

export const useAnimationStore = create<AnimationStore>()((set, get) => ({
  queue: [],
  activeStep: null,
  isPlaying: false,
  positionRegistry: new Map(),
  cardMotionDestinations: new Map(),
  zoneMotionDestinations: new Map(),
  releasedCardMotions: new Map(),
  inFlightObjectIds: new Set(),
  animationNewState: null,

  enqueueSteps: (steps) => {
    if (steps.length === 0) return;

    const { activeStep, queue } = get();
    if (activeStep) {
      // Already animating — append to queue
      set({ queue: [...queue, ...steps] });
    } else {
      // Nothing playing — promote first step immediately
      const [first, ...rest] = steps;
      set({ activeStep: first, queue: rest, isPlaying: true });
    }
  },

  advanceStep: () => {
    const { queue } = get();
    if (queue.length > 0) {
      const [next, ...rest] = queue;
      set({ activeStep: next, queue: rest });
    } else {
      set({ activeStep: null, isPlaying: false, animationNewState: null });
    }
  },

  captureSnapshot: () => {
    const snapshot: PositionSnapshot = new Map();
    const elements = document.querySelectorAll("[data-object-id]");
    for (const el of elements) {
      const id = Number(el.getAttribute("data-object-id"));
      if (!Number.isNaN(id)) {
        snapshot.set(id, el.getBoundingClientRect());
      }
    }
    return snapshot;
  },

  registerPosition: (objectId, rect) => {
    set((state) => {
      const newRegistry = new Map(state.positionRegistry);
      newRegistry.set(objectId, rect);
      return { positionRegistry: newRegistry };
    });
  },

  getPosition: (objectId) => get().positionRegistry.get(objectId),

  setCardMotionDestinations: (cards, zones) =>
    set({
      cardMotionDestinations: cards,
      zoneMotionDestinations: zones,
    }),

  getCardMotionDestination: (objectId) =>
    get().cardMotionDestinations.get(objectId),

  getZoneMotionDestination: (playerId, zone) =>
    get().zoneMotionDestinations.get(`${playerId}:${zone}`),

  setReleasedCardMotion: (objectId, motion) =>
    set((state) => {
      const releasedCardMotions = new Map(state.releasedCardMotions);
      releasedCardMotions.set(objectId, motion);
      return { releasedCardMotions };
    }),

  getReleasedCardMotion: (objectId) =>
    get().releasedCardMotions.get(objectId),

  markObjectInFlight: (objectId) =>
    set((state) => {
      const inFlightObjectIds = new Set(state.inFlightObjectIds);
      inFlightObjectIds.add(objectId);
      return { inFlightObjectIds };
    }),

  clearObjectMotion: (objectId) =>
    set((state) => {
      const releasedCardMotions = new Map(state.releasedCardMotions);
      const inFlightObjectIds = new Set(state.inFlightObjectIds);
      releasedCardMotions.delete(objectId);
      inFlightObjectIds.delete(objectId);
      return { releasedCardMotions, inFlightObjectIds };
    }),

  setAnimationNewState: (state) => set({ animationNewState: state }),

  clearQueue: () =>
    set({
      queue: [],
      activeStep: null,
      isPlaying: false,
      animationNewState: null,
      cardMotionDestinations: new Map(),
      zoneMotionDestinations: new Map(),
      releasedCardMotions: new Map(),
      inFlightObjectIds: new Set(),
    }),
}));
