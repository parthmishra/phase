//! Production parser → phase-trigger → damage-resolution coverage for Power Surge.

use std::collections::HashMap;

use engine::game::game_object::PhaseOutCause;
use engine::game::phasing::phase_out_object;
use engine::game::scenario::{GameScenario, P0, P1};
use engine::game::scenario_db::GameScenarioDbExt;
use engine::game::{layers, turns};
use engine::types::ability::{
    ContinuousModification, PlayerScope, QuantityExpr, QuantityRef, StaticDefinition, TargetFilter,
};
use engine::types::actions::GameAction;
use engine::types::game_state::{BeginningOfTurnSnapshot, WaitingFor};
use engine::types::phase::Phase;
use engine::types::zones::Zone;

use crate::support::shared_card_db;

const POWER_SURGE: &str = "Power Surge";

fn fixture_db() -> &'static engine::database::card_db::CardDatabase {
    shared_card_db().expect("committed integration card fixture must load")
}

fn assert_power_surge_runtime_tree_supported(db: &engine::database::card_db::CardDatabase) {
    let face = db
        .get_face_by_name(POWER_SURGE)
        .expect("committed integration card fixture must contain Power Surge");
    let details = engine::game::coverage::build_parse_details_for_face(face);
    assert!(
        details.iter().all(|item| item.is_fully_supported()),
        "Power Surge's deployed runtime tree must contain no unsupported node: {details:#?}"
    );
}

fn resolve_power_surge_trigger(runner: &mut engine::game::scenario::GameRunner) {
    for _ in 0..8 {
        if runner.state().stack.is_empty() {
            break;
        }
        runner
            .act(GameAction::PassPriority)
            .expect("priority passing must resolve Power Surge's trigger");
    }
    assert!(
        runner.state().stack.is_empty(),
        "Power Surge's trigger must leave the stack"
    );
}

/// CR 603.2b + CR 608.2i: the upkeep trigger uses the committed historical
/// count even when the same lands are tapped before the trigger resolves.
#[test]
fn power_surge_damages_the_upkeep_player_from_the_turn_start_snapshot() {
    let db = fixture_db();
    assert_power_surge_runtime_tree_supported(db);

    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::Untap);
    let power_surge = scenario.add_real_card(P0, POWER_SURGE, Zone::Battlefield, db);
    let first = scenario.add_land_from_oracle(P1, "Land A", "").id();
    let second = scenario.add_land_from_oracle(P1, "Land B", "").id();
    let mut runner = scenario.build();
    engine::game::rehydrate_game_from_card_db(runner.state_mut(), db);

    runner.state_mut().active_player = P1;
    runner.state_mut().priority_player = P1;
    runner.state_mut().waiting_for = WaitingFor::Priority { player: P1 };
    engine::game::trigger_index::reindex_object_triggers(runner.state_mut(), power_surge);
    assert_eq!(
        runner.state().objects[&power_surge]
            .trigger_definitions
            .len(),
        1,
        "the production Oracle parser must install Power Surge's upkeep trigger"
    );
    let turn_number = runner.state().turn_number;
    runner.state_mut().beginning_of_turn_snapshot = Some(BeginningOfTurnSnapshot {
        turn_number,
        untapped_lands_controlled: HashMap::from([(P0, 0), (P1, 2)]),
    });
    runner.state_mut().objects.get_mut(&first).unwrap().tapped = true;
    runner.state_mut().objects.get_mut(&second).unwrap().tapped = true;
    let life_before = runner.life(P1);

    runner.advance_to_upkeep();
    assert!(
        runner
            .state()
            .stack
            .iter()
            .any(|entry| entry.source_id == power_surge),
        "Power Surge's trigger must enter the production stack at P1's upkeep"
    );
    let stack_ability = runner
        .state()
        .stack
        .iter()
        .find(|entry| entry.source_id == power_surge)
        .and_then(|entry| entry.ability())
        .expect("Power Surge stack entry must carry its resolved ability");
    assert_eq!(stack_ability.scoped_player, Some(P1));
    let engine::types::ability::Effect::DealDamage { amount, .. } = &stack_ability.effect else {
        panic!("Power Surge stack entry must deal damage");
    };
    assert_eq!(
        engine::game::quantity::resolve_quantity_with_targets(
            runner.state(),
            amount,
            stack_ability,
        ),
        2,
        "the production stack ability must resolve P1's current-stamp historical row"
    );
    resolve_power_surge_trigger(&mut runner);

    assert_eq!(
        runner.life(P1),
        life_before - 2,
        "Power Surge must read P1's historical row, not recount the now-tapped lands"
    );
    assert_eq!(runner.life(P0), 20, "the scoped trigger damages only P1");
}

/// CR 500.1 + CR 502.1 + CR 603.2b + CR 702.26b-c: the global turn-start
/// history is captured while a phased-out source is treated as absent, then the
/// source phases in before untap and can trigger using the already-committed row.
#[test]
fn phased_out_power_surge_uses_history_captured_before_it_phases_in() {
    let db = fixture_db();
    assert_power_surge_runtime_tree_supported(db);

    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::Untap);
    let power_surge = scenario.add_real_card(P1, POWER_SURGE, Zone::Battlefield, db);
    scenario.add_land_from_oracle(P1, "Land A", "");
    scenario.add_land_from_oracle(P1, "Land B", "");
    let mut runner = scenario.build();
    engine::game::rehydrate_game_from_card_db(runner.state_mut(), db);

    let mut phase_events = Vec::new();
    assert_eq!(
        phase_out_object(
            runner.state_mut(),
            power_surge,
            PhaseOutCause::Directly,
            &mut phase_events,
        ),
        vec![power_surge],
        "the hostile source fixture must actually phase Power Surge out"
    );
    assert!(runner.state().objects[&power_surge].is_phased_out());

    turns::start_next_turn(runner.state_mut(), &mut phase_events);
    assert_eq!(runner.state().active_player, P1);
    assert_eq!(
        runner
            .state()
            .beginning_of_turn_snapshot
            .as_ref()
            .unwrap()
            .untapped_lands_controlled[&P1],
        2,
        "turn history must be captured globally while Power Surge is absent"
    );
    let life_before = runner.life(P1);
    runner.state_mut().waiting_for = WaitingFor::Priority { player: P1 };

    runner.advance_to_upkeep();
    assert!(
        !runner.state().objects[&power_surge].is_phased_out(),
        "Power Surge must phase in before the upkeep trigger check"
    );
    assert!(
        runner
            .state()
            .stack
            .iter()
            .any(|entry| entry.source_id == power_surge),
        "the phased-in Power Surge must trigger at upkeep"
    );
    resolve_power_surge_trigger(&mut runner);

    assert_eq!(
        runner.life(P1),
        life_before - 2,
        "the phased-in source must use history committed while it was absent"
    );
    assert_eq!(runner.life(P0), 20, "the non-upkeep player is not damaged");
}

/// CR 500.1 + CR 608.2i + CR 613.4a: replacing the historical snapshot at the
/// production turn boundary invalidates a previously clean dynamic CDA cache.
#[test]
fn turn_start_snapshot_replacement_invalidates_dynamic_cda_cache() {
    let mut scenario = GameScenario::new();
    scenario.at_phase(Phase::PostCombatMain);
    let creature = scenario.add_creature(P1, "Historical CDA", 0, 1).id();
    scenario.add_land_from_oracle(P1, "Land A", "");
    scenario.add_land_from_oracle(P1, "Land B", "");
    let mut runner = scenario.build();
    let starting_turn = runner.state().turn_number;

    runner.state_mut().beginning_of_turn_snapshot = Some(BeginningOfTurnSnapshot {
        turn_number: starting_turn,
        untapped_lands_controlled: HashMap::from([(P0, 0), (P1, 0)]),
    });
    {
        let object = runner.state_mut().objects.get_mut(&creature).unwrap();
        let definition = StaticDefinition::continuous()
            .affected(TargetFilter::SelfRef)
            .cda()
            .modifications(vec![ContinuousModification::SetDynamicPower {
                value: QuantityExpr::Ref {
                    qty: QuantityRef::UntappedLandsAtTurnStart {
                        player: PlayerScope::Controller,
                    },
                },
            }]);
        object.static_definitions = vec![definition.clone()].into();
        object.base_static_definitions = std::sync::Arc::new(vec![definition]);
    }

    runner.state_mut().layers_dirty.mark_full();
    layers::flush_layers(runner.state_mut());
    assert_eq!(runner.state().objects[&creature].power, Some(0));

    runner.advance_to_upkeep();

    assert_eq!(runner.state().active_player, P1);
    assert_eq!(runner.state().phase, Phase::Upkeep);
    assert_eq!(
        runner
            .state()
            .beginning_of_turn_snapshot
            .as_ref()
            .unwrap()
            .turn_number,
        starting_turn + 1
    );
    assert_eq!(
        runner.state().objects[&creature].power,
        Some(2),
        "normal turn advancement must expose the fresh snapshot to a previously clean CDA cache"
    );
}
