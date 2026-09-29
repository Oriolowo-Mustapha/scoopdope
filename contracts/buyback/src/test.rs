#![cfg(test)]

use super::*;
use soroban_sdk::testutils::{Address as _, Ledger};

const MIN_RESERVE: i128 = 1_000_0000000;

fn setup() -> (Env, BuybackContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();
    // Keep the contract instance alive when tests advance the ledger past the default TTL.
    env.ledger().with_mut(|l| {
        l.min_persistent_entry_ttl = 100_000;
        l.max_entry_ttl = 1_000_000;
    });

    let contract_id = env.register_contract(None, BuybackContract);
    let client = BuybackContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    client.initialize(
        &admin,
        &Address::generate(&env),
        &Address::generate(&env),
        &Address::generate(&env),
        &BytesN::from_array(&env, &[0; 32]),
    );

    (env, client, admin)
}

fn enable(client: &BuybackContractClient, admin: &Address) {
    client.update_config(admin, &Some(true), &None, &None, &None, &None);
}

#[test]
fn test_initialize_sets_defaults() {
    let (_env, client, _admin) = setup();

    let config = client.get_config();
    assert!(!config.enabled);
    assert_eq!(config.price_threshold, 1000);
    assert_eq!(config.min_reserve_balance, MIN_RESERVE);
    assert_eq!(config.buyback_interval, 1000);
    assert_eq!(client.get_reserve_balance(), 0);

    let analytics = client.get_buyback_analytics();
    assert_eq!(analytics.total_buybacks, 0);
    assert_eq!(analytics.total_bst_bought, 0);
}

#[test]
#[should_panic(expected = "Already initialized")]
fn test_initialize_twice_panics() {
    let (env, client, admin) = setup();
    client.initialize(
        &admin,
        &Address::generate(&env),
        &Address::generate(&env),
        &Address::generate(&env),
        &BytesN::from_array(&env, &[0; 32]),
    );
}

#[test]
fn test_update_config() {
    let (_env, client, admin) = setup();

    client.update_config(&admin, &Some(true), &Some(500), &None, &None, &Some(10));

    let config = client.get_config();
    assert!(config.enabled);
    assert_eq!(config.price_threshold, 500);
    assert_eq!(config.buyback_interval, 10);
    assert_eq!(config.min_reserve_balance, MIN_RESERVE);
}

#[test]
#[should_panic(expected = "Only admin can update config")]
fn test_update_config_non_admin_panics() {
    let (env, client, _admin) = setup();
    client.update_config(
        &Address::generate(&env),
        &Some(true),
        &None,
        &None,
        &None,
        &None,
    );
}

#[test]
fn test_add_to_reserve() {
    let (env, client, _admin) = setup();
    let funder = Address::generate(&env);

    client.add_to_reserve(&funder, &500);
    client.add_to_reserve(&funder, &250);

    assert_eq!(client.get_reserve_balance(), 750);
}

#[test]
#[should_panic(expected = "Amount must be positive")]
fn test_add_to_reserve_zero_panics() {
    let (env, client, _admin) = setup();
    client.add_to_reserve(&Address::generate(&env), &0);
}

#[test]
fn test_manual_buyback_records_history() {
    let (env, client, admin) = setup();
    enable(&client, &admin);
    client.add_to_reserve(&Address::generate(&env), &(2 * MIN_RESERVE));

    let xlm = 1_000_000_000;
    client.manual_buyback(&admin, &xlm);

    // Mock oracle price is 2000 => bst = xlm * 1_000_000 / 2000
    let expected_bst = xlm * 1_000_000 / 2000;
    assert_eq!(client.get_reserve_balance(), 2 * MIN_RESERVE - xlm);

    let history = client.get_buyback_history(&0, &10);
    assert_eq!(history.len(), 1);
    let record = history.get(0).unwrap();
    assert_eq!(record.xlm_spent, xlm);
    assert_eq!(record.amount_bought, expected_bst);
    assert_eq!(record.bst_price, 2000);
    assert_eq!(record.trigger_reason, symbol_short!("manual"));

    let analytics = client.get_buyback_analytics();
    assert_eq!(analytics.total_buybacks, 1);
    assert_eq!(analytics.total_bst_bought, expected_bst);
    assert_eq!(analytics.total_xlm_spent, xlm);
}

#[test]
#[should_panic(expected = "Buyback is disabled")]
fn test_manual_buyback_disabled_panics() {
    let (env, client, admin) = setup();
    client.add_to_reserve(&Address::generate(&env), &(2 * MIN_RESERVE));
    client.manual_buyback(&admin, &1_000);
}

#[test]
#[should_panic(expected = "Insufficient reserve for buyback")]
fn test_manual_buyback_insufficient_reserve_panics() {
    let (_env, client, admin) = setup();
    enable(&client, &admin);
    client.manual_buyback(&admin, &1_000);
}

#[test]
#[should_panic(expected = "Only admin can execute manual buyback")]
fn test_manual_buyback_non_admin_panics() {
    let (env, client, admin) = setup();
    enable(&client, &admin);
    client.manual_buyback(&Address::generate(&env), &1_000);
}

#[test]
fn test_check_and_execute_noop_when_disabled() {
    let (env, client, _admin) = setup();
    client.add_to_reserve(&Address::generate(&env), &(2 * MIN_RESERVE));
    env.ledger().with_mut(|l| l.sequence_number = 5_000);

    client.check_and_execute_buyback();

    assert_eq!(client.get_buyback_analytics().total_buybacks, 0);
}

#[test]
fn test_check_and_execute_respects_interval() {
    let (env, client, admin) = setup();
    enable(&client, &admin);
    client.add_to_reserve(&Address::generate(&env), &(2 * MIN_RESERVE));
    env.ledger().with_mut(|l| l.sequence_number = 500);

    client.check_and_execute_buyback();

    assert_eq!(client.get_buyback_analytics().total_buybacks, 0);
}

#[test]
fn test_check_and_execute_noop_when_reserve_at_minimum() {
    let (env, client, admin) = setup();
    enable(&client, &admin);
    client.add_to_reserve(&Address::generate(&env), &MIN_RESERVE);
    env.ledger().with_mut(|l| l.sequence_number = 5_000);

    client.check_and_execute_buyback();

    assert_eq!(client.get_reserve_balance(), MIN_RESERVE);
}

#[test]
fn test_check_and_execute_triggers_on_price_threshold() {
    let (env, client, admin) = setup();
    enable(&client, &admin);
    client.add_to_reserve(&Address::generate(&env), &(2 * MIN_RESERVE));
    env.ledger().with_mut(|l| l.sequence_number = 5_000);

    client.check_and_execute_buyback();

    // xlm spent = min(reserve - min_reserve, max_buyback_amount * price / 1_000_000)
    let expected_xlm = MIN_RESERVE.min(100_000_0000000 * 2000 / 1_000_000);
    let history = client.get_buyback_history(&0, &10);
    assert_eq!(history.len(), 1);
    let record = history.get(0).unwrap();
    assert_eq!(record.xlm_spent, expected_xlm);
    assert_eq!(record.ledger, 5_000);
    assert_eq!(record.trigger_reason, symbol_short!("threshold"));
    assert_eq!(client.get_reserve_balance(), 2 * MIN_RESERVE - expected_xlm);

    // A second call in the same ledger window is skipped by the interval check.
    client.check_and_execute_buyback();
    assert_eq!(client.get_buyback_analytics().total_buybacks, 1);
}

#[test]
fn test_get_buyback_history_pagination() {
    let (env, client, admin) = setup();
    enable(&client, &admin);
    client.add_to_reserve(&Address::generate(&env), &(2 * MIN_RESERVE));

    for _ in 0..3 {
        client.manual_buyback(&admin, &1_000_000);
    }

    assert_eq!(client.get_buyback_history(&0, &2).len(), 2);
    assert_eq!(client.get_buyback_history(&2, &10).len(), 1);
    assert_eq!(client.get_buyback_history(&5, &10).len(), 0);
}
