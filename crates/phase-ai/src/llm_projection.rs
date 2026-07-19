//! Server-facing, viewer-safe projection for the opt-in LLM decision tier.
//!
//! This module deliberately does not serialize `GameState`, `GameAction`, or
//! engine identifiers. The provider receives a compact allowlist DTO and may
//! return only one request-scoped opaque candidate id.

use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;

use engine::ai_support::legal_actions_for_viewer;
use engine::database::CardDatabase;
use engine::game::combat::AttackTarget;
use engine::game::mana_abilities;
use engine::game::turn_control;
use engine::game::visibility::filter_state_for_viewer;
use engine::types::actions::GameAction;
use engine::types::game_state::{CastPaymentMode, GameState, WaitingFor};
use engine::types::identifiers::ObjectId;
use engine::types::mana::ManaType;
use engine::types::player::PlayerId;
use rand::SeedableRng;
use rand_chacha::ChaCha8Rng;
use serde::Serialize;

use crate::config::AiConfig;
use crate::eval::{strategic_intent, StrategicIntent};
use crate::search::{choose_action_with_session, score_candidates_with_session};
use crate::session::AiSession;

const UNKNOWN_CARD: &str = "Unknown card";

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmDecisionRequest {
    pub turn_number: u32,
    pub phase: String,
    pub decision: DecisionSnapshot,
    pub active_player: RelativePlayer,
    pub decision_subject: RelativePlayer,
    pub strategy: StrategySnapshot,
    pub players: Vec<PlayerSnapshot>,
    pub battlefield: Vec<PublicObjectSnapshot>,
    pub stack: Vec<StackObjectSnapshot>,
    pub exile: Vec<ZoneCardSnapshot>,
    pub command_zone: Vec<ZoneCardSnapshot>,
    pub card_context: Vec<CardContextSnapshot>,
    pub candidates: Vec<CandidateSnapshot>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum DecisionSnapshot {
    Priority,
    DeclareAttackers,
    DeclareBlockers,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StrategySnapshot {
    pub engine_intent: EngineIntentSnapshot,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub previous_plan: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EngineIntentSnapshot {
    PushLethal,
    Stabilize,
    PreserveAdvantage,
    Develop,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardContextSnapshot {
    pub name: String,
    pub mana_cost: String,
    pub type_line: String,
    pub oracle_text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "index", rename_all = "camelCase")]
pub enum RelativePlayer {
    You,
    Opponent(u8),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayerSnapshot {
    pub player: RelativePlayer,
    pub life: i32,
    pub poison: u32,
    pub hand_count: usize,
    pub library_count: usize,
    pub mana: ManaPoolSnapshot,
    pub visible_hand: Vec<String>,
    pub graveyard: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ManaPoolSnapshot {
    pub white: usize,
    pub blue: usize,
    pub black: usize,
    pub red: usize,
    pub green: usize,
    pub colorless: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicObjectSnapshot {
    pub reference: String,
    pub name: String,
    pub controller: RelativePlayer,
    pub types: Vec<String>,
    pub tapped: bool,
    pub power: Option<i32>,
    pub toughness: Option<i32>,
    pub damage: u32,
    pub counters: Vec<PublicCounterSnapshot>,
    pub keywords: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicCounterSnapshot {
    pub kind: String,
    pub count: u32,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StackObjectSnapshot {
    pub reference: String,
    pub name: String,
    pub controller: RelativePlayer,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ZoneCardSnapshot {
    pub reference: String,
    pub name: String,
    pub controller: RelativePlayer,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CandidateSnapshot {
    pub id: String,
    pub action: CandidateSummary,
    /// Local search's relative preference (0-100) from the same viewer-safe
    /// position. This is advisory; the opaque candidate map remains authority.
    pub engine_preference: u8,
    pub engine_rank: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum CandidateSummary {
    PassPriority,
    PlayLand { card: String },
    CastSpell { card: String },
    TapLandForMana { source: String },
    ActivateManaAbility { source: String },
    DeclareAttackers { attacks: Vec<AttackSnapshot> },
    DeclareBlockers { blocks: Vec<BlockSnapshot> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttackSnapshot {
    pub attacker: String,
    pub defender: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BlockSnapshot {
    pub blocker: String,
    pub attacker: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LocalOnlyReason {
    DisabledShape,
    ForcedChoice,
    Unauthorized,
}

#[derive(Debug, Clone)]
pub struct OpaqueCandidate {
    pub id: String,
    pub action: GameAction,
}

#[derive(Debug, Clone)]
pub struct PreparedLlmDecision {
    pub request: LlmDecisionRequest,
    pub candidates: Vec<OpaqueCandidate>,
    pub fallback: GameAction,
    pub decision_subject: PlayerId,
    pub authorized_submitter: PlayerId,
}

impl PreparedLlmDecision {
    pub fn action_for_id(&self, id: &str) -> Option<&GameAction> {
        self.candidates
            .iter()
            .find(|candidate| candidate.id == id)
            .map(|candidate| &candidate.action)
    }
}

#[derive(Debug, Clone)]
pub enum LlmPreparation {
    Provider(Box<PreparedLlmDecision>),
    LocalOnly {
        action: Option<GameAction>,
        reason: LocalOnlyReason,
    },
}

/// Build the provider request and the private request-scoped action map.
///
/// Only ordinary priority actions enter the provider tier. The complete union
/// of flat and grouped actions is inspected fail-closed; one unsupported
/// action keeps the whole decision local. Forced decisions also stay local.
pub fn prepare_llm_decision(
    state: &GameState,
    submitter: PlayerId,
    config: &AiConfig,
    session: &Arc<AiSession>,
    fallback_seed: u64,
    card_db: &CardDatabase,
    previous_plan: Option<&str>,
) -> LlmPreparation {
    let local = || {
        let mut rng = ChaCha8Rng::seed_from_u64(fallback_seed);
        choose_action_with_session(state, submitter, config, &mut rng, session)
    };

    let (subject, decision) = match state.waiting_for {
        WaitingFor::Priority { player } => (player, DecisionSnapshot::Priority),
        WaitingFor::DeclareAttackers { player, .. } => (player, DecisionSnapshot::DeclareAttackers),
        WaitingFor::DeclareBlockers { player, .. } => (player, DecisionSnapshot::DeclareBlockers),
        _ => {
            return LlmPreparation::LocalOnly {
                action: local(),
                reason: LocalOnlyReason::DisabledShape,
            };
        }
    };

    if turn_control::authorized_submitter_for_player(state, subject) != submitter {
        return LlmPreparation::LocalOnly {
            action: None,
            reason: LocalOnlyReason::Unauthorized,
        };
    }

    let (flat, _, grouped) = legal_actions_for_viewer(state, submitter);
    let mut actions = flat;
    if decision == DecisionSnapshot::Priority {
        for action in grouped.into_values().flatten() {
            if !actions.contains(&action) {
                actions.push(action);
            }
        }
    }

    if actions.len() <= 1 {
        return LlmPreparation::LocalOnly {
            action: local(),
            reason: LocalOnlyReason::ForcedChoice,
        };
    }

    if !actions
        .iter()
        .all(|action| provider_supported(state, decision, action))
    {
        return LlmPreparation::LocalOnly {
            action: local(),
            reason: LocalOnlyReason::DisabledShape,
        };
    }

    let filtered = filter_state_for_viewer(state, submitter);
    let refs = ProjectionRefs::new(&filtered);
    let candidates: Vec<OpaqueCandidate> = actions
        .into_iter()
        .enumerate()
        .map(|(index, action)| OpaqueCandidate {
            id: format!("c{index:03}"),
            action,
        })
        .collect();
    // Score only the viewer-filtered position. Provider-visible rankings must
    // not encode facts from hidden hands, libraries, or authoritative RNG.
    let scored = score_candidates_with_session(&filtered, submitter, config, session);
    let preferences = normalized_preferences(&candidates, &scored);
    let mut ranked: Vec<usize> = (0..candidates.len()).collect();
    ranked.sort_by_key(|index| std::cmp::Reverse(preferences[*index]));
    let mut ranks = vec![0; candidates.len()];
    for (rank, index) in ranked.into_iter().enumerate() {
        ranks[index] = rank + 1;
    }
    let summaries = candidates
        .iter()
        .enumerate()
        .map(|(index, candidate)| CandidateSnapshot {
            id: candidate.id.clone(),
            action: summarize_action(&filtered, submitter, &refs, &candidate.action),
            engine_preference: preferences[index],
            engine_rank: ranks[index],
        })
        .collect();

    let fallback = local()
        .filter(|action| {
            candidates
                .iter()
                .any(|candidate| candidate.action == *action)
        })
        .unwrap_or_else(|| candidates[0].action.clone());

    LlmPreparation::Provider(Box::new(PreparedLlmDecision {
        request: project_request(
            &filtered,
            submitter,
            subject,
            decision,
            summaries,
            card_db,
            previous_plan,
        ),
        candidates,
        fallback,
        decision_subject: subject,
        authorized_submitter: submitter,
    }))
}

fn provider_supported(state: &GameState, decision: DecisionSnapshot, action: &GameAction) -> bool {
    match (decision, action) {
        (DecisionSnapshot::DeclareAttackers, GameAction::DeclareAttackers { bands, .. }) => {
            bands.is_empty()
        }
        (DecisionSnapshot::DeclareBlockers, GameAction::DeclareBlockers { .. }) => true,
        (DecisionSnapshot::Priority, GameAction::PassPriority)
        | (DecisionSnapshot::Priority, GameAction::PlayLand { .. })
        | (DecisionSnapshot::Priority, GameAction::TapLandForMana { .. }) => true,
        (
            DecisionSnapshot::Priority,
            GameAction::CastSpell {
                targets,
                payment_mode: CastPaymentMode::Auto,
                ..
            },
        ) => targets.is_empty(),
        (
            DecisionSnapshot::Priority,
            GameAction::ActivateAbility {
                source_id,
                ability_index,
            },
        ) => state
            .objects
            .get(source_id)
            .and_then(|object| object.abilities.get(*ability_index))
            .is_some_and(mana_abilities::is_mana_ability),
        _ => false,
    }
}

fn normalized_preferences(candidates: &[OpaqueCandidate], scored: &[(GameAction, f64)]) -> Vec<u8> {
    let raw: Vec<Option<f64>> = candidates
        .iter()
        .map(|candidate| {
            scored
                .iter()
                .find(|(action, _)| action == &candidate.action)
                .map(|(_, score)| *score)
                .filter(|score| score.is_finite())
        })
        .collect();
    let min = raw.iter().flatten().copied().reduce(f64::min);
    let max = raw.iter().flatten().copied().reduce(f64::max);
    match (min, max) {
        (Some(min), Some(max)) if max > min => raw
            .into_iter()
            .map(|score| {
                score.map_or(0, |score| {
                    (((score - min) / (max - min)) * 100.0).round() as u8
                })
            })
            .collect(),
        (Some(_), Some(_)) => raw
            .into_iter()
            .map(|score| if score.is_some() { 50 } else { 0 })
            .collect(),
        _ => vec![0; candidates.len()],
    }
}

struct ProjectionRefs {
    by_object: HashMap<ObjectId, String>,
}

impl ProjectionRefs {
    fn new(state: &GameState) -> Self {
        let mut by_object = HashMap::new();
        for (index, id) in state.battlefield.iter().enumerate() {
            by_object.insert(*id, format!("b{index:03}"));
        }
        for (index, entry) in state.stack.iter().enumerate() {
            by_object.insert(entry.source_id, format!("s{index:03}"));
        }
        Self { by_object }
    }

    fn object_label(&self, state: &GameState, id: ObjectId) -> String {
        self.by_object
            .get(&id)
            .cloned()
            .unwrap_or_else(|| safe_name(state.objects.get(&id)))
    }
}

fn relative_player(viewer: PlayerId, player: PlayerId) -> RelativePlayer {
    if viewer == player {
        RelativePlayer::You
    } else {
        // Stable ordinal among the other seats, not the engine's PlayerId.
        let ordinal = if player.0 < viewer.0 {
            player.0.saturating_add(1)
        } else {
            player.0
        };
        RelativePlayer::Opponent(ordinal)
    }
}

fn safe_name(object: Option<&engine::game::game_object::GameObject>) -> String {
    object
        .map(|object| object.name.trim())
        .filter(|name| !name.is_empty())
        .unwrap_or(UNKNOWN_CARD)
        .to_string()
}

fn project_request(
    state: &GameState,
    viewer: PlayerId,
    subject: PlayerId,
    decision: DecisionSnapshot,
    candidates: Vec<CandidateSnapshot>,
    card_db: &CardDatabase,
    previous_plan: Option<&str>,
) -> LlmDecisionRequest {
    let players = state
        .players
        .iter()
        .map(|player| {
            let visible_hand = player
                .hand
                .iter()
                .filter_map(|id| {
                    let name = safe_name(state.objects.get(id));
                    (name != UNKNOWN_CARD).then_some(name)
                })
                .collect();
            let graveyard = player
                .graveyard
                .iter()
                .map(|id| safe_name(state.objects.get(id)))
                .collect();
            PlayerSnapshot {
                player: relative_player(viewer, player.id),
                life: player.life,
                poison: player.poison_counters,
                hand_count: player.hand.len(),
                library_count: player.library.len(),
                mana: ManaPoolSnapshot {
                    white: player.mana_pool.count_color(ManaType::White),
                    blue: player.mana_pool.count_color(ManaType::Blue),
                    black: player.mana_pool.count_color(ManaType::Black),
                    red: player.mana_pool.count_color(ManaType::Red),
                    green: player.mana_pool.count_color(ManaType::Green),
                    colorless: player.mana_pool.count_color(ManaType::Colorless),
                },
                visible_hand,
                graveyard,
            }
        })
        .collect();

    let battlefield = state
        .battlefield
        .iter()
        .enumerate()
        .filter_map(|(index, id)| {
            let object = state.objects.get(id)?;
            let mut counters: Vec<_> = object
                .counters
                .iter()
                .map(|(kind, count)| PublicCounterSnapshot {
                    kind: format!("{kind:?}"),
                    count: *count,
                })
                .collect();
            counters.sort_by(|left, right| left.kind.cmp(&right.kind));
            let mut keywords: Vec<_> = object
                .keywords
                .iter()
                .map(|keyword| format!("{:?}", keyword.kind()))
                .collect();
            keywords.sort();
            Some(PublicObjectSnapshot {
                reference: format!("b{index:03}"),
                name: safe_name(Some(object)),
                controller: relative_player(viewer, object.controller),
                types: object
                    .card_types
                    .core_types
                    .iter()
                    .map(|kind| format!("{kind:?}"))
                    .chain(object.card_types.subtypes.iter().cloned())
                    .collect(),
                tapped: object.tapped,
                power: object.power,
                toughness: object.toughness,
                damage: object.damage_marked,
                counters,
                keywords,
            })
        })
        .collect();

    let stack = state
        .stack
        .iter()
        .enumerate()
        .map(|(index, entry)| StackObjectSnapshot {
            reference: format!("s{index:03}"),
            name: safe_name(state.objects.get(&entry.source_id)),
            controller: relative_player(viewer, entry.controller),
        })
        .collect();

    let exile: Vec<_> = state
        .exile
        .iter()
        .enumerate()
        .filter_map(|(index, id)| {
            let object = state.objects.get(id)?;
            Some(ZoneCardSnapshot {
                reference: format!("x{index:03}"),
                name: safe_name(Some(object)),
                controller: relative_player(viewer, object.controller),
            })
        })
        .collect();
    let command_zone: Vec<_> = state
        .command_zone
        .iter()
        .enumerate()
        .filter_map(|(index, id)| {
            let object = state.objects.get(id)?;
            Some(ZoneCardSnapshot {
                reference: format!("z{index:03}"),
                name: safe_name(Some(object)),
                controller: relative_player(viewer, object.controller),
            })
        })
        .collect();

    let mut visible_names = BTreeSet::new();
    for player in &state.players {
        for id in player.hand.iter().chain(player.graveyard.iter()) {
            let name = safe_name(state.objects.get(id));
            if name != UNKNOWN_CARD {
                visible_names.insert(name);
            }
        }
    }
    for id in &state.battlefield {
        let name = safe_name(state.objects.get(id));
        if name != UNKNOWN_CARD {
            visible_names.insert(name);
        }
    }
    for entry in &state.stack {
        let name = safe_name(state.objects.get(&entry.source_id));
        if name != UNKNOWN_CARD {
            visible_names.insert(name);
        }
    }
    for card in exile.iter().chain(command_zone.iter()) {
        if card.name != UNKNOWN_CARD {
            visible_names.insert(card.name.clone());
        }
    }
    for candidate in &candidates {
        match &candidate.action {
            CandidateSummary::PlayLand { card } | CandidateSummary::CastSpell { card } => {
                if card != UNKNOWN_CARD {
                    visible_names.insert(card.clone());
                }
            }
            CandidateSummary::PassPriority
            | CandidateSummary::TapLandForMana { .. }
            | CandidateSummary::ActivateManaAbility { .. }
            | CandidateSummary::DeclareAttackers { .. }
            | CandidateSummary::DeclareBlockers { .. } => {}
        }
    }
    let card_context = visible_names
        .into_iter()
        .filter_map(|name| {
            let face = card_db.get_face_by_name(&name)?;
            Some(card_context_from_face(name, face))
        })
        .collect();

    let engine_intent = match strategic_intent(state, viewer) {
        StrategicIntent::PushLethal => EngineIntentSnapshot::PushLethal,
        StrategicIntent::Stabilize => EngineIntentSnapshot::Stabilize,
        StrategicIntent::PreserveAdvantage => EngineIntentSnapshot::PreserveAdvantage,
        StrategicIntent::Develop => EngineIntentSnapshot::Develop,
    };

    LlmDecisionRequest {
        turn_number: state.turn_number,
        phase: format!("{:?}", state.phase),
        decision,
        active_player: relative_player(viewer, state.active_player),
        decision_subject: relative_player(viewer, subject),
        strategy: StrategySnapshot {
            engine_intent,
            previous_plan: previous_plan.map(|plan| truncate_text(plan, 280)),
        },
        players,
        battlefield,
        stack,
        exile,
        command_zone,
        card_context,
        candidates,
    }
}

fn truncate_text(text: &str, max_chars: usize) -> String {
    text.chars().take(max_chars).collect()
}

fn card_context_from_face(
    name: String,
    face: &engine::types::card::CardFace,
) -> CardContextSnapshot {
    CardContextSnapshot {
        name,
        mana_cost: format!("{:?}", face.mana_cost),
        type_line: format!("{:?}", face.card_type),
        oracle_text: truncate_text(face.oracle_text.as_deref().unwrap_or_default(), 1_200),
    }
}

fn summarize_action(
    state: &GameState,
    viewer: PlayerId,
    refs: &ProjectionRefs,
    action: &GameAction,
) -> CandidateSummary {
    match action {
        GameAction::PassPriority => CandidateSummary::PassPriority,
        GameAction::PlayLand { object_id, .. } => CandidateSummary::PlayLand {
            card: safe_name(state.objects.get(object_id)),
        },
        GameAction::CastSpell { object_id, .. } => CandidateSummary::CastSpell {
            card: safe_name(state.objects.get(object_id)),
        },
        GameAction::TapLandForMana { object_id } => CandidateSummary::TapLandForMana {
            source: refs.object_label(state, *object_id),
        },
        GameAction::ActivateAbility { source_id, .. } => CandidateSummary::ActivateManaAbility {
            source: refs.object_label(state, *source_id),
        },
        GameAction::DeclareAttackers { attacks, .. } => CandidateSummary::DeclareAttackers {
            attacks: attacks
                .iter()
                .map(|(attacker, target)| AttackSnapshot {
                    attacker: refs.object_label(state, *attacker),
                    defender: match target {
                        AttackTarget::Player(player) => {
                            format!("{:?}", relative_player(viewer, *player))
                        }
                        AttackTarget::Planeswalker(id) => refs.object_label(state, *id),
                        AttackTarget::Battle(id) => refs.object_label(state, *id),
                    },
                })
                .collect(),
        },
        GameAction::DeclareBlockers { assignments } => CandidateSummary::DeclareBlockers {
            blocks: assignments
                .iter()
                .map(|(blocker, attacker)| BlockSnapshot {
                    blocker: refs.object_label(state, *blocker),
                    attacker: refs.object_label(state, *attacker),
                })
                .collect(),
        },
        _ => unreachable!("provider_supported exhaustively gates summaries"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn eligible_state_with_hidden_opponent_card() -> GameState {
        use engine::game::zones::create_object;
        use engine::types::card_type::CoreType;
        use engine::types::identifiers::CardId;
        use engine::types::zones::Zone;

        let mut state = GameState::new_two_player(42);
        state.active_player = PlayerId(0);
        state.priority_player = PlayerId(0);
        state.waiting_for = WaitingFor::Priority {
            player: PlayerId(0),
        };
        let forest = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Forest".to_string(),
            Zone::Battlefield,
        );
        let object = state.objects.get_mut(&forest).unwrap();
        object.card_types.core_types.push(CoreType::Land);
        object.card_types.subtypes.push("Forest".to_string());
        create_object(
            &mut state,
            CardId(2),
            PlayerId(1),
            "Opponent Secret".to_string(),
            Zone::Hand,
        );
        state
    }

    #[test]
    fn serialized_request_has_no_engine_identifier_or_action_payload_fields() {
        let request = LlmDecisionRequest {
            turn_number: 3,
            phase: "PreCombatMain".to_string(),
            decision: DecisionSnapshot::Priority,
            active_player: RelativePlayer::You,
            decision_subject: RelativePlayer::You,
            strategy: StrategySnapshot {
                engine_intent: EngineIntentSnapshot::Develop,
                previous_plan: None,
            },
            players: vec![],
            battlefield: vec![],
            stack: vec![],
            exile: vec![],
            command_zone: vec![],
            card_context: vec![],
            candidates: vec![CandidateSnapshot {
                id: "c000".to_string(),
                action: CandidateSummary::PassPriority,
                engine_preference: 50,
                engine_rank: 1,
            }],
        };
        let json = serde_json::to_string(&request).unwrap();
        assert!(json.contains("\"id\":\"c000\""));
        for forbidden in [
            "objectId",
            "cardId",
            "sourceId",
            "rngSeed",
            "deckPools",
            "pendingCast",
            "printedRef",
            "abilities",
        ] {
            assert!(
                !json.contains(forbidden),
                "leaked forbidden field {forbidden}"
            );
        }
    }

    #[test]
    fn ordinary_priority_projection_redacts_hidden_card_and_uses_opaque_ids() {
        let state = eligible_state_with_hidden_opponent_card();
        let config = crate::config::create_config_for_players(
            crate::config::AiDifficulty::Medium,
            crate::config::Platform::Native,
            2,
        );
        let session = AiSession::arc_from_game(&state);
        let db = CardDatabase::default();
        let LlmPreparation::Provider(prepared) = prepare_llm_decision(
            &state,
            PlayerId(0),
            &config,
            &session,
            7,
            &db,
            Some("Develop mana"),
        ) else {
            panic!("pass plus basic-land mana action must be provider-eligible");
        };

        assert!(prepared.candidates.len() >= 2);
        assert!(prepared
            .candidates
            .iter()
            .enumerate()
            .all(|(index, candidate)| candidate.id == format!("c{index:03}")));
        let json = serde_json::to_string(&prepared.request).unwrap();
        assert!(!json.contains("Opponent Secret"));
        assert!(!json.contains("objectId"));
        assert!(!json.contains("sourceId"));
        assert!(json.contains("c000"));
        assert!(json.contains("Develop mana"));
        assert!(prepared
            .request
            .candidates
            .iter()
            .all(|candidate| candidate.engine_rank > 0));
    }

    #[test]
    fn forced_priority_choice_stays_local() {
        let mut state = GameState::new_two_player(42);
        state.active_player = PlayerId(0);
        state.priority_player = PlayerId(0);
        state.waiting_for = WaitingFor::Priority {
            player: PlayerId(0),
        };
        let config = crate::config::create_config_for_players(
            crate::config::AiDifficulty::Medium,
            crate::config::Platform::Native,
            2,
        );
        let session = AiSession::arc_from_game(&state);
        let db = CardDatabase::default();
        assert!(matches!(
            prepare_llm_decision(&state, PlayerId(0), &config, &session, 7, &db, None),
            LlmPreparation::LocalOnly {
                reason: LocalOnlyReason::ForcedChoice,
                ..
            }
        ));
    }

    #[test]
    fn card_context_preserves_oracle_text_and_bounds_it() {
        let face = engine::types::card::CardFace {
            name: "Test Mage".to_string(),
            oracle_text: Some("Draw a card. ".repeat(200)),
            ..Default::default()
        };
        let context = card_context_from_face("Test Mage".to_string(), &face);
        assert!(context.oracle_text.starts_with("Draw a card."));
        assert_eq!(context.oracle_text.chars().count(), 1_200);
    }

    #[test]
    fn declare_attackers_is_provider_eligible_and_described_by_local_refs() {
        use engine::game::combat::AttackTarget;
        use engine::game::zones::create_object;
        use engine::types::card_type::CoreType;
        use engine::types::identifiers::CardId;
        use engine::types::phase::Phase;
        use engine::types::zones::Zone;

        let mut state = GameState::new_two_player(42);
        state.active_player = PlayerId(0);
        state.phase = Phase::DeclareAttackers;
        let attacker = create_object(
            &mut state,
            CardId(1),
            PlayerId(0),
            "Tactical Bear".to_string(),
            Zone::Battlefield,
        );
        let object = state.objects.get_mut(&attacker).unwrap();
        object.card_types.core_types.push(CoreType::Creature);
        object.power = Some(2);
        object.toughness = Some(2);
        object.summoning_sick = false;
        state.waiting_for = WaitingFor::DeclareAttackers {
            player: PlayerId(0),
            valid_attacker_ids: vec![attacker],
            valid_attack_targets: vec![AttackTarget::Player(PlayerId(1))],
            valid_attack_targets_by_attacker: None,
            attacker_constraints: Default::default(),
        };

        let config = crate::config::create_config_for_players(
            crate::config::AiDifficulty::Medium,
            crate::config::Platform::Native,
            2,
        );
        let session = AiSession::arc_from_game(&state);
        let db = CardDatabase::default();
        let LlmPreparation::Provider(prepared) = prepare_llm_decision(
            &state,
            PlayerId(0),
            &config,
            &session,
            7,
            &db,
            Some("Pressure the opponent"),
        ) else {
            panic!("attack with the creature or decline must reach the tactical provider tier");
        };
        assert_eq!(
            prepared.request.decision,
            DecisionSnapshot::DeclareAttackers
        );
        assert!(prepared.request.candidates.iter().any(|candidate| matches!(
            &candidate.action,
            CandidateSummary::DeclareAttackers { attacks } if !attacks.is_empty()
        )));
        let json = serde_json::to_string(&prepared.request).unwrap();
        assert!(json.contains("b000"));
        assert!(!json.contains("objectId"));
    }

    #[test]
    fn declare_blockers_is_provider_eligible_and_described_by_local_refs() {
        use engine::game::combat::{AttackerInfo, CombatState};
        use engine::game::zones::create_object;
        use engine::types::card_type::CoreType;
        use engine::types::identifiers::CardId;
        use engine::types::phase::Phase;
        use engine::types::zones::Zone;

        let mut state = GameState::new_two_player(42);
        state.active_player = PlayerId(1);
        state.phase = Phase::DeclareBlockers;
        let attacker = create_object(
            &mut state,
            CardId(1),
            PlayerId(1),
            "Attacking Bear".to_string(),
            Zone::Battlefield,
        );
        let blocker = create_object(
            &mut state,
            CardId(2),
            PlayerId(0),
            "Blocking Bear".to_string(),
            Zone::Battlefield,
        );
        for id in [attacker, blocker] {
            let object = state.objects.get_mut(&id).unwrap();
            object.card_types.core_types.push(CoreType::Creature);
            object.power = Some(2);
            object.toughness = Some(2);
        }
        state.combat = Some(CombatState {
            attackers: vec![AttackerInfo::attacking_player(attacker, PlayerId(0))],
            ..Default::default()
        });
        state.waiting_for = WaitingFor::DeclareBlockers {
            player: PlayerId(0),
            valid_blocker_ids: vec![blocker],
            valid_block_targets: [(blocker, vec![attacker])].into_iter().collect(),
            block_requirements: Default::default(),
            blocker_constraints: Default::default(),
        };

        let config = crate::config::create_config_for_players(
            crate::config::AiDifficulty::Medium,
            crate::config::Platform::Native,
            2,
        );
        let session = AiSession::arc_from_game(&state);
        let db = CardDatabase::default();
        let LlmPreparation::Provider(prepared) = prepare_llm_decision(
            &state,
            PlayerId(0),
            &config,
            &session,
            7,
            &db,
            Some("Trade resources if favorable"),
        ) else {
            panic!("block or decline must reach the tactical provider tier");
        };
        assert_eq!(prepared.request.decision, DecisionSnapshot::DeclareBlockers);
        assert!(prepared.request.candidates.iter().any(|candidate| matches!(
            &candidate.action,
            CandidateSummary::DeclareBlockers { blocks } if !blocks.is_empty()
        )));
    }
}
