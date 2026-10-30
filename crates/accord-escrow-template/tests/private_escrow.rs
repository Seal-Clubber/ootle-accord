use accord_escrow_template::{FUNDING_DOMAIN, REFUND_DOMAIN, VALUE_GENERATOR};
use tari_crypto::{
    keys::{PublicKey as _, SecretKey as _},
    ristretto::{RistrettoPublicKey, RistrettoSchnorr, pedersen::ristretto_pedersen_h_compressed},
};
use tari_ootle_common_types::RistrettoSchnorrBlake2bVerifier;
use tari_template_lib::prelude::*;
use tari_template_test_tooling::{
    TemplateTest,
    byte_type::ToByteType,
    crypto::RistrettoSecretKey,
    engine_types::{
        stealth::MerkleTree,
        virtual_substate::{VirtualSubstate, VirtualSubstateId},
    },
    support::{
        spec::{OutputAuthSpec, OutputSpec},
        stealth::{self, StealthSecretTransferData},
    },
    transaction::args,
};
const GOAL: u64 = 10_000_000;
const WORK: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
fn copy(d: &StealthSecretTransferData) -> StealthSecretTransferData {
    StealthSecretTransferData {
        output_masks: d.output_masks.clone(),
        output_auths: d.output_auths.clone(),
        statement: d.statement.clone(),
    }
}
struct Fixture {
    test: TemplateTest,
    escrow: ComponentAddress,
    creator: RistrettoSecretKey,
    source_key: RistrettoSecretKey,
    source: StealthSecretTransferData,
    source_index: usize,
    source_value: u64,
    reviewers: Vec<RistrettoSecretKey>,
    payout: RistrettoPublicKeyBytes,
    refund: RistrettoPublicKeyBytes,
    leaf: SpendCondition,
    pledges: Vec<(u64, StealthSecretTransferData)>,
}
fn fixture() -> Fixture {
    let mut test = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["."]);
    test.enable_auto_add_proofs_from_signers();
    let creator = test.secret_key().clone();
    let (account, _, source_key) = test.create_funded_account();
    let source_pk = RistrettoPublicKey::from_secret_key(&source_key).to_byte_type();
    let source = stealth::generate_transfer_data(
        stealth::NO_INPUTS,
        20_000_000u64,
        [(20_000_000, OutputAuthSpec::KeyPath(source_pk))],
        0u64,
    );
    let tx = test
        .transaction()
        .call_method(
            account,
            "withdraw",
            args![TARI_TOKEN, Amount::from(20_000_000u64)],
        )
        .put_last_instruction_output_on_workspace("shield")
        .stealth_transfer_with_input_bucket(TARI_TOKEN, source.statement.clone(), "shield")
        .build_and_seal(&source_key);
    test.execute_expect_success(tx, vec![]);
    let keys: Vec<_> = (1..=5).map(|i| test.new_key_pair(i)).collect();
    let public: Vec<RistrettoPublicKeyBytes> = keys.iter().map(|(_, p)| p.to_byte_type()).collect();
    let payout = test.new_key_pair(80).1.to_byte_type();
    let refund = test.new_key_pair(81).1.to_byte_type();
    let escrow = test.call_function(
        "AccordEscrow",
        "new",
        args![
            "c".repeat(64),
            "delivery",
            test.to_public_key_bytes(),
            payout,
            public,
            60u8,
            2u32,
            GOAL,
            100u64
        ],
        vec![],
    );
    let authority: ResourceAddress =
        test.call_method(escrow, "authority_resource", args![], vec![]);
    let leaf = SpendCondition::access_rule(rule!(resource(authority)));
    let actual: Hash32 = test.call_method(escrow, "condition_root", args![], vec![]);
    assert_eq!(actual, MerkleTree::from_conditions([&leaf]).unwrap().root());
    assert_eq!(
        VALUE_GENERATOR,
        ristretto_pedersen_h_compressed().to_bytes()
    );
    Fixture {
        test,
        escrow,
        creator,
        source_key,
        source,
        source_index: 0,
        source_value: 20_000_000,
        reviewers: keys.into_iter().map(|(s, _)| s).collect(),
        payout,
        refund,
        leaf,
        pledges: vec![],
    }
}
fn status(f: &mut Fixture) -> (u64, u64, u64, bool) {
    f.test
        .call_method(f.escrow, "funding_status", args![], vec![])
}
fn proof(
    f: &Fixture,
    d: &StealthSecretTransferData,
    old: u64,
    new: u64,
    domain: &[u8],
) -> SignaturePayload {
    let c = d.statement.outputs_statement.outputs[0].output.commitment;
    let message = tari_bor::encode(&(f.escrow, "c".repeat(64), c, old, new, f.refund)).unwrap();
    let mask = &d.output_masks[0];
    let pk = RistrettoPublicKey::from_secret_key(mask).to_byte_type();
    let nonce = RistrettoSecretKey::random(&mut ::rand::rng());
    let public_nonce = RistrettoPublicKey::from_secret_key(&nonce).to_byte_type();
    let challenge =
        RistrettoSchnorrBlake2bVerifier::compute_challenge(domain, &message, &pk, &public_nonce);
    SignaturePayload::RistrettoSchnorrBlake2b(
        RistrettoSchnorr::sign_raw_uniform(mask, nonce, &challenge)
            .unwrap()
            .to_byte_type(),
    )
}
fn payment(f: &Fixture, value: u64) -> StealthSecretTransferData {
    let pk = RistrettoPublicKey::from_secret_key(&f.source_key).to_byte_type();
    let mut outputs = vec![OutputSpec::new(
        value,
        OutputAuthSpec::Conditions(vec![f.leaf.clone()]),
    )];
    if value < f.source_value {
        outputs.push(OutputSpec::new(
            f.source_value - value,
            OutputAuthSpec::KeyPath(pk),
        ));
    }
    stealth::generate_transfer_data(
        [f.source.input_spec_for(f.source_index, f.source_value)],
        0u64,
        outputs,
        0u64,
    )
}
fn fund(f: &mut Fixture, value: u64) {
    let old = status(f).1;
    let d = payment(f, value);
    let sig = proof(f, &d, old, old + value, FUNDING_DOMAIN);
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "fund",
            args![d.statement.clone(), old + value, f.refund, sig],
        )
        .build_and_seal(&f.source_key);
    f.test.execute_expect_success(tx, vec![]);
    f.source_value -= value;
    f.source = copy(&d);
    f.source_index = 1;
    f.pledges.push((value, d));
}
fn submit(f: &mut Fixture) {
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "submit_work", args![WORK])
        .build_and_seal(&f.creator);
    f.test.execute_expect_success(tx, vec![]);
}
fn vote(f: &mut Fixture, i: usize) {
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "approve", args![i as u32, WORK])
        .build_and_seal(&f.reviewers[i]);
    f.test.execute_expect_success(tx, vec![]);
}
fn claim_data(f: &Fixture, key: RistrettoPublicKeyBytes) -> StealthSecretTransferData {
    let inputs = f
        .pledges
        .iter()
        .map(|(v, d)| d.input_spec_for(0, *v))
        .collect::<Vec<_>>();
    stealth::generate_transfer_data(inputs, 0u64, [(GOAL, OutputAuthSpec::KeyPath(key))], 0u64)
}

#[test]
fn private_funding_tracks_real_remaining_and_stops_at_goal() {
    let mut f = fixture();
    fund(&mut f, 3_000_000);
    assert_eq!(status(&mut f), (GOAL, 3_000_000, 7_000_000, false));
    fund(&mut f, 7_000_000);
    assert_eq!(status(&mut f), (GOAL, GOAL, 0, true));
    let d = payment(&f, 1);
    let sig = proof(&f, &d, GOAL, GOAL + 1, FUNDING_DOMAIN);
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "fund",
            args![d.statement, GOAL + 1, f.refund, sig],
        )
        .build_and_seal(&f.source_key);
    f.test.execute_expect_failure(tx, vec![]);
    assert_eq!(status(&mut f).1, GOAL);
}
#[test]
fn cannot_inflate_tally_overfund_or_replay_a_private_payment() {
    let mut f = fixture();
    let d = payment(&f, 3_000_000);
    let sig = proof(&f, &d, 0, 9_000_000, FUNDING_DOMAIN);
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "fund",
            args![d.statement, 9_000_000u64, f.refund, sig],
        )
        .build_and_seal(&f.source_key);
    f.test.execute_expect_failure(tx, vec![]);
    assert_eq!(status(&mut f).1, 0);
    let d = payment(&f, 11_000_000);
    let sig = proof(&f, &d, 0, 11_000_000, FUNDING_DOMAIN);
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "fund",
            args![d.statement, 11_000_000u64, f.refund, sig],
        )
        .build_and_seal(&f.source_key);
    f.test.execute_expect_failure(tx, vec![]);
    fund(&mut f, GOAL);
}
#[test]
fn payout_needs_required_reviewer_and_cannot_be_redirected() {
    let mut f = fixture();
    fund(&mut f, GOAL);
    submit(&mut f);
    for i in [0, 1, 3] {
        vote(&mut f, i);
    }
    assert!(
        !f.test
            .call_method::<bool>(f.escrow, "is_approved", args![], vec![])
    );
    let d = claim_data(&f, f.payout);
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "claim", args![d.statement.clone()])
        .build_and_seal(&f.creator);
    f.test.execute_expect_failure(tx, vec![]);
    vote(&mut f, 2);
    let wrong = claim_data(&f, f.refund);
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "claim", args![wrong.statement])
        .build_and_seal(&f.creator);
    f.test.execute_expect_failure(tx, vec![]);
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "claim", args![d.statement])
        .build_and_seal(&f.creator);
    f.test.execute_expect_success(tx, vec![]);
    assert!(
        f.test
            .call_method::<bool>(f.escrow, "is_paid", args![], vec![])
    );
    assert_eq!(status(&mut f).1, 0);
}
#[test]
fn escrow_outputs_cannot_be_spent_outside_the_contract() {
    let mut f = fixture();
    fund(&mut f, GOAL);
    let d = claim_data(&f, f.payout);
    let tx = f
        .test
        .transaction()
        .stealth_transfer(TARI_TOKEN, d.statement)
        .build_and_seal(&f.creator);
    f.test.execute_expect_failure(tx, vec![]);
    assert_eq!(status(&mut f).1, GOAL);
}
#[test]
fn refund_is_private_destination_bound_and_only_after_deadline() {
    let mut f = fixture();
    fund(&mut f, GOAL);
    let d = stealth::generate_transfer_data(
        [f.pledges[0].1.input_spec_for(0, GOAL)],
        0u64,
        [(GOAL, OutputAuthSpec::KeyPath(f.refund))],
        0u64,
    );
    let sig = proof(&f, &f.pledges[0].1, GOAL, 0, REFUND_DOMAIN);
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "refund",
            args![0u32, d.statement.clone(), 0u64, sig.clone()],
        )
        .build_and_seal(&f.creator);
    f.test.execute_expect_failure(tx, vec![]);
    f.test.set_virtual_substate(
        VirtualSubstateId::CurrentEpoch,
        VirtualSubstate::CurrentEpoch(100),
    );
    let wrong = stealth::generate_transfer_data(
        [f.pledges[0].1.input_spec_for(0, GOAL)],
        0u64,
        [(GOAL, OutputAuthSpec::KeyPath(f.payout))],
        0u64,
    );
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "refund",
            args![0u32, wrong.statement, 0u64, sig.clone()],
        )
        .build_and_seal(&f.creator);
    f.test.execute_expect_failure(tx, vec![]);
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "refund",
            args![0u32, d.statement.clone(), 0u64, sig.clone()],
        )
        .build_and_seal(&f.creator);
    f.test.execute_expect_success(tx, vec![]);
    assert_eq!(status(&mut f), (GOAL, 0, 0, false));
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "refund", args![0u32, d.statement, 0u64, sig])
        .build_and_seal(&f.creator);
    f.test.execute_expect_failure(tx, vec![]);
}

#[test]
fn invalid_native_balance_proof_cannot_update_total() {
    let mut f = fixture();
    let mut d = payment(&f, 3_000_000);
    let sig = proof(&f, &d, 0, 3_000_000, FUNDING_DOMAIN);
    // Replace only the native balance proof with one for a different transfer.
    d.statement.balance_proof = payment(&f, 4_000_000).statement.balance_proof;
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "fund",
            args![d.statement, 3_000_000u64, f.refund, sig],
        )
        .build_and_seal(&f.source_key);
    f.test.execute_expect_failure(tx, vec![]);
    assert_eq!(status(&mut f).1, 0);
    fund(&mut f, 3_000_000);
    let replay = copy(&f.pledges[0].1);
    let sig = proof(&f, &replay, 3_000_000, 6_000_000, FUNDING_DOMAIN);
    let tx = f
        .test
        .transaction()
        .call_method(
            f.escrow,
            "fund",
            args![replay.statement, 6_000_000u64, f.refund, sig],
        )
        .build_and_seal(&f.source_key);
    f.test.execute_expect_failure(tx, vec![]);
    assert_eq!(status(&mut f).1, 3_000_000);
}
