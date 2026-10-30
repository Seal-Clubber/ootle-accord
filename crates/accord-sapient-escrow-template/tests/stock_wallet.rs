use accord_private_client::{PrivateOutput, transfer};
use accord_sapient_client::{ReturnReceipt, memo_statement, return_signature};
use ootle_byte_type::ToByteType;
use tari_crypto::{
    keys::{PublicKey as _, SecretKey as _},
    ristretto::{RistrettoPublicKey, RistrettoSecretKey},
};
use tari_template_lib::prelude::*;
use tari_template_lib::types::stealth::RevealedOutput;
use tari_template_test_tooling::{
    TemplateTest,
    engine_types::virtual_substate::{VirtualSubstate, VirtualSubstateId},
    transaction::args,
};
const GOAL: u64 = 10_000_000;
struct Fixture {
    test: TemplateTest,
    escrow: ComponentAddress,
    base: RistrettoSecretKey,
    view: RistrettoSecretKey,
    owner: RistrettoPublicKeyBytes,
    view_pk: RistrettoPublicKeyBytes,
    sources: Vec<PrivateOutput>,
    fees: Vec<PrivateOutput>,
    refunds: Vec<PrivateOutput>,
    payout: PrivateOutput,
    reviewers: Vec<RistrettoSecretKey>,
}
fn key(out: &PrivateOutput) -> RistrettoPublicKeyBytes {
    match out.auth {
        SpendAuthorization::Key(k) => k,
        _ => panic!(),
    }
}
fn nonce(out: &PrivateOutput) -> RistrettoPublicKeyBytes {
    RistrettoPublicKey::from_secret_key(&out.nonce).to_byte_type()
}
fn receipt(out: &PrivateOutput) -> ReturnReceipt {
    ReturnReceipt {
        value: out.value,
        owner: out.recipient_owner,
        view: out.recipient_view,
        nonce: out.nonce.clone(),
    }
}
fn harness() -> TemplateTest {
    if let Ok(path) = std::env::var("OOTLEACCORD_TEMPLATE_WASM") {
        let mut package = tari_template_test_tooling::Package::builder();
        package.add_all_builtin_templates();
        let code = std::fs::read(path).expect("Read release artifact");
        package
            .add_template_from_code(
                tari_template_test_tooling::engine_types::hashing::hash_template_code(&code),
                code,
            )
            .expect("Load release artifact");
        let mut test = TemplateTest::from_package(package.build());
        test.bootstrap_state();
        test
    } else {
        TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["."])
    }
}
fn fixture() -> Fixture {
    let mut test = harness();
    test.enable_auto_add_proofs_from_signers();
    let (account, _, base) = test.create_funded_account();
    let owner = RistrettoPublicKey::from_secret_key(&base).to_byte_type();
    let view = RistrettoSecretKey::random(&mut ::rand::rng());
    let view_pk = RistrettoPublicKey::from_secret_key(&view).to_byte_type();
    let sources: Vec<_> = [7_000_000, 3_000_000, 4_000_000, 1]
        .into_iter()
        .map(|v| PrivateOutput::new(v, owner, view_pk, Some(&base), None))
        .collect();
    let fees: Vec<_> = (0..sources.len())
        .map(|_| PrivateOutput::new(1_000_000, owner, view_pk, Some(&base), None))
        .collect();
    let all: Vec<_> = sources.iter().chain(&fees).cloned().collect();
    let total = all.iter().map(|o| o.value).sum::<u64>();
    let shield = transfer(vec![], total, &all, None);
    let tx = test
        .transaction()
        .call_method(account, "withdraw", args![TARI_TOKEN, Amount::from(total)])
        .put_last_instruction_output_on_workspace("shield")
        .stealth_transfer_with_input_bucket(TARI_TOKEN, shield, "shield")
        .build_and_seal(&base);
    test.execute_expect_success(tx, vec![]);
    let payout = PrivateOutput::new(GOAL, owner, view_pk, Some(&base), None);
    let reviewers: Vec<_> = (1..=5).map(|i| test.new_key_pair(i).0).collect();
    let keys: Vec<_> = reviewers
        .iter()
        .map(|s| RistrettoPublicKey::from_secret_key(s).to_byte_type())
        .collect();
    let template = test.get_template_address("SapientEscrow");
    let memo = memo_statement(&receipt(&payout), &"c".repeat(64), "payout", owner);
    let tx = test
        .transaction()
        .call_method(
            account,
            "withdraw",
            args![TARI_TOKEN, Amount::from(1_600_000u64)],
        )
        .put_last_instruction_output_on_workspace("reserve")
        .call_function(
            template,
            "new",
            args![
                Workspace("reserve"),
                "c".repeat(64),
                "delivery",
                owner,
                key(&payout),
                nonce(&payout),
                keys,
                60u8,
                2u32,
                GOAL,
                100u64,
                memo
            ],
        )
        .build_and_seal(&base);
    let result = test.execute_expect_success(tx, vec![]);
    let escrow = result.finalize.get_components_by_template(&template)[0];
    Fixture {
        test,
        escrow,
        base,
        view,
        owner,
        view_pk,
        sources,
        fees,
        refunds: vec![],
        payout,
        reviewers,
    }
}
fn status(f: &mut Fixture) -> (u64, u64, u64, bool) {
    f.test
        .call_method(f.escrow, "funding_status", args![], vec![])
}
fn fund(f: &mut Fixture, index: usize, expected: u64, success: bool) {
    let source = &f.sources[index];
    let fee = &f.fees[index];
    let refund = PrivateOutput::new(source.value, f.owner, f.view_pk, Some(&f.base), None);
    refund.validate_decryption(&f.view);
    let source_pk =
        RistrettoPublicKey::from_secret_key(source.spend_secret.as_ref().unwrap()).to_byte_type();
    let fee_pk =
        RistrettoPublicKey::from_secret_key(fee.spend_secret.as_ref().unwrap()).to_byte_type();
    assert_ne!(source_pk, f.owner);
    assert_ne!(fee_pk, f.owner);
    let reveal = transfer(
        vec![source.input()],
        0,
        &[],
        Some(RevealedOutput::new(Amount::from(source.value), source_pk)),
    );
    let change = PrivateOutput::new(900_000, f.owner, f.view_pk, Some(&f.base), None);
    let fees = transfer(
        vec![fee.input()],
        0,
        &[change],
        Some(RevealedOutput::new(Amount::from(100_000u64), fee_pk)),
    );
    let memo = memo_statement(&receipt(&refund), &"c".repeat(64), "refund", source_pk);
    let sealer = RistrettoSecretKey::random(&mut ::rand::rng());
    let sealer_pk = RistrettoPublicKey::from_secret_key(&sealer).to_byte_type();
    let tx = f
        .test
        .transaction()
        .with_fee_instructions_builder(|b| {
            b.stealth_transfer(TARI_TOKEN, fees)
                .put_last_instruction_output_on_workspace("fees")
                .pay_fee_from_bucket("fees")
        })
        .stealth_transfer(TARI_TOKEN, reveal)
        .put_last_instruction_output_on_workspace("payment")
        .call_method(
            f.escrow,
            "fund",
            args![
                Workspace("payment"),
                expected,
                key(&refund),
                nonce(&refund),
                memo
            ],
        )
        .build_unsigned()
        .add_signer(&sealer_pk, source.spend_secret.as_ref().unwrap())
        .add_signer(&sealer_pk, fee.spend_secret.as_ref().unwrap())
        .seal(&sealer);
    assert!(tx.verify_all_signatures());
    if success {
        f.test.execute_expect_success(tx, vec![]);
        f.refunds.push(refund);
    } else {
        f.test.execute_expect_failure(tx, vec![]);
    }
}
fn submit(f: &mut Fixture) {
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "submit_work", args!["a".repeat(64)])
        .build_and_seal(&f.base);
    f.test.execute_expect_success(tx, vec![]);
}
fn vote(f: &mut Fixture, i: usize) {
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "approve", args![i as u32, "a".repeat(64)])
        .build_and_seal(&f.reviewers[i]);
    f.test.execute_expect_success(tx, vec![]);
}
fn claim(f: &mut Fixture, dest: &PrivateOutput, success: bool) {
    let proof = transfer(vec![], GOAL, &[dest.clone()], None);
    let sig = return_signature(f.escrow, None, &proof, &f.payout.nonce);
    let relay = RistrettoSecretKey::random(&mut ::rand::rng());
    let tx = f
        .test
        .transaction()
        .with_fee_instructions_builder(|b| b.call_method(f.escrow, "claim", args![proof, sig]))
        .build_and_seal(&relay);
    if success {
        f.test.execute_expect_success(tx, vec![]);
    } else {
        f.test.execute_expect_failure(tx, vec![]);
    }
}
#[test]
fn stock_private_fee_deposits_enforce_real_total_cap_and_stale_max() {
    let mut f = fixture();
    fund(&mut f, 0, 0, true);
    assert_eq!(status(&mut f), (GOAL, 7_000_000, 3_000_000, false));
    fund(&mut f, 2, 7_000_000, false);
    assert_eq!(status(&mut f).1, 7_000_000);
    fund(&mut f, 1, 0, false);
    assert_eq!(status(&mut f).1, 7_000_000);
}
#[test]
fn full_goal_and_required_reviewer_gate_fixed_private_payout() {
    let mut f = fixture();
    fund(&mut f, 0, 0, true);
    submit(&mut f);
    let tx = f
        .test
        .transaction()
        .call_method(f.escrow, "approve", args![2u32, "a".repeat(64)])
        .build_and_seal(&f.reviewers[2]);
    f.test.execute_expect_failure(tx, vec![]);
    fund(&mut f, 1, 7_000_000, true);
    for i in [0, 1, 3] {
        vote(&mut f, i);
    }
    let payout = f.payout.clone();
    claim(&mut f, &payout, false);
    vote(&mut f, 2);
    let wrong = PrivateOutput::new(GOAL, f.owner, f.view_pk, Some(&f.base), None);
    claim(&mut f, &wrong, false);
    claim(&mut f, &payout, true);
    assert_eq!(status(&mut f).1, 0);
    assert!(
        f.test
            .call_method::<bool>(f.escrow, "is_paid", args![], vec![])
    );
    claim(&mut f, &payout, false);
}
#[test]
fn refund_requires_receipt_authority_fixed_destination_and_expiry_with_organizer_fees() {
    let mut f = fixture();
    fund(&mut f, 0, 0, true);
    let refund = f.refunds[0].clone();
    let proof = transfer(vec![], refund.value, &[refund.clone()], None);
    let sig = return_signature(f.escrow, Some(0), &proof, &refund.nonce);
    let relay = RistrettoSecretKey::random(&mut ::rand::rng());
    let tx = f
        .test
        .transaction()
        .with_fee_instructions_builder(|b| {
            b.call_method(f.escrow, "refund", args![0u32, proof.clone(), sig.clone()])
        })
        .build_and_seal(&relay);
    f.test.execute_expect_failure(tx, vec![]);
    f.test.set_virtual_substate(
        VirtualSubstateId::CurrentEpoch,
        VirtualSubstate::CurrentEpoch(100),
    );
    let wrong = transfer(
        vec![],
        refund.value,
        &[PrivateOutput::new(
            refund.value,
            f.owner,
            f.view_pk,
            Some(&f.base),
            None,
        )],
        None,
    );
    let wrong_sig = return_signature(f.escrow, Some(0), &wrong, &refund.nonce);
    let tx = f
        .test
        .transaction()
        .with_fee_instructions_builder(|b| {
            b.call_method(f.escrow, "refund", args![0u32, wrong, wrong_sig])
        })
        .build_and_seal(&relay);
    f.test.execute_expect_failure(tx, vec![]);
    let forged = return_signature(f.escrow, Some(0), &proof, &relay);
    let tx = f
        .test
        .transaction()
        .with_fee_instructions_builder(|b| {
            b.call_method(f.escrow, "refund", args![0u32, proof.clone(), forged])
        })
        .build_and_seal(&relay);
    f.test.execute_expect_failure(tx, vec![]);
    let tx = f
        .test
        .transaction()
        .with_fee_instructions_builder(|b| {
            b.call_method(f.escrow, "refund", args![0u32, proof.clone(), sig.clone()])
        })
        .build_and_seal(&relay);
    f.test.execute_expect_success(tx, vec![]);
    assert_eq!(status(&mut f), (GOAL, 0, 0, false));
    let tx = f
        .test
        .transaction()
        .with_fee_instructions_builder(|b| {
            b.call_method(f.escrow, "refund", args![0u32, proof, sig])
        })
        .build_and_seal(&relay);
    f.test.execute_expect_failure(tx, vec![]);
    let stolen = transfer(
        vec![refund.input()],
        0,
        &[PrivateOutput::new(
            refund.value,
            f.owner,
            f.view_pk,
            Some(&f.base),
            None,
        )],
        None,
    );
    let tx = f
        .test
        .transaction()
        .stealth_transfer(TARI_TOKEN, stolen)
        .build_and_seal(&relay);
    f.test.execute_expect_failure(tx, vec![]);
}
