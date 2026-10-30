use accord_private_client::{PrivateOutput, transfer};
use ootle_byte_type::ToByteType;
use tari_crypto::{
    keys::{PublicKey as _, SecretKey as _},
    ristretto::{RistrettoPublicKey, RistrettoSecretKey},
};
use tari_ootle_wallet_crypto::stealth::script_path_witness;
use tari_template_lib::prelude::*;
use tari_template_lib_types::stealth::RevealedOutput;
use tari_template_test_tooling::{TemplateTest, transaction::args};

#[test]
fn real_encrypted_outputs_fund_with_one_time_signers_and_private_fees() {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../accord-escrow-template");
    let mut test = TemplateTest::new(dir, ["."]);
    test.enable_auto_add_proofs_from_signers();
    let (account, _, base) = test.create_funded_account();
    let base_pk = RistrettoPublicKey::from_secret_key(&base).to_byte_type();
    let view = RistrettoSecretKey::random(&mut ::rand::rng());
    let vp = RistrettoPublicKey::from_secret_key(&view).to_byte_type();
    let source = PrivateOutput::new(10_000_000, base_pk, vp, Some(&base), None);
    let fee = PrivateOutput::new(1_000_000, base_pk, vp, Some(&base), None);
    source.validate_decryption(&view);
    fee.validate_decryption(&view);
    let shield = transfer(vec![], 11_000_000, &[source.clone(), fee.clone()], None);
    let tx = test
        .transaction()
        .call_method(
            account,
            "withdraw",
            args![TARI_TOKEN, Amount::from(11_000_000u64)],
        )
        .put_last_instruction_output_on_workspace("shield")
        .stealth_transfer_with_input_bucket(TARI_TOKEN, shield, "shield")
        .build_and_seal(&base);
    test.execute_expect_success(tx, vec![]);
    let payout = PrivateOutput::new(10_000_000, base_pk, vp, Some(&base), None);
    payout.validate_decryption(&view);
    let payout_key = match payout.auth {
        SpendAuthorization::Key(pk) => pk,
        _ => panic!(),
    };
    let reviewers: Vec<_> = (1..=5).map(|i| test.new_key_pair(i)).collect();
    let pks: Vec<_> = reviewers.iter().map(|(_, pk)| pk.to_byte_type()).collect();
    let escrow: ComponentAddress = test.call_function(
        "AccordEscrow",
        "new",
        args![
            "c".repeat(64),
            "delivery",
            base_pk,
            payout_key,
            pks,
            60u8,
            2u32,
            10_000_000u64,
            100u64
        ],
        vec![],
    );
    let root: Hash32 = test.call_method(escrow, "condition_root", args![], vec![]);
    let authority: ResourceAddress =
        test.call_method(escrow, "authority_resource", args![], vec![]);
    let pledge = PrivateOutput::new(10_000_000, base_pk, vp, None, Some(root));
    pledge.validate_decryption(&view);
    let refund = PrivateOutput::new(10_000_000, base_pk, vp, Some(&base), None);
    let refund_pk = match refund.auth {
        SpendAuthorization::Key(pk) => pk,
        _ => panic!(),
    };
    let sig = pledge.opening_proof(
        escrow,
        &"c".repeat(64),
        0,
        10_000_000,
        refund_pk,
        b"ootleaccord.private-funding.v1",
    );
    let funding = transfer(vec![source.input()], 0, &[pledge.clone()], None);
    let change = PrivateOutput::new(900_000, base_pk, vp, Some(&base), None);
    let sealer = source.spend_secret.as_ref().unwrap();
    let sealer_pk = RistrettoPublicKey::from_secret_key(sealer).to_byte_type();
    assert_ne!(sealer_pk, base_pk);
    let fees = transfer(
        vec![fee.input()],
        0,
        &[change],
        Some(RevealedOutput::new(Amount::from(100_000u64), sealer_pk)),
    );
    let tx = test
        .transaction()
        .with_fee_instructions_builder(|b| {
            b.stealth_transfer(TARI_TOKEN, fees)
                .put_last_instruction_output_on_workspace("fee")
                .pay_fee_from_bucket("fee")
        })
        .call_method(
            escrow,
            "fund",
            args![funding, 10_000_000u64, refund_pk, sig],
        )
        .build_unsigned()
        .add_signer(&sealer_pk, fee.spend_secret.as_ref().unwrap())
        .seal(sealer);
    assert!(tx.verify_all_signatures());
    test.execute_expect_success(tx, vec![]);
    assert_eq!(
        test.call_method::<(u64, u64, u64, bool)>(escrow, "funding_status", args![], vec![]),
        (10_000_000, 10_000_000, 0, true)
    );
    let work = "a".repeat(64);
    let tx = test
        .transaction()
        .call_method(escrow, "submit_work", args![work.clone()])
        .build_and_seal(&base);
    test.execute_expect_success(tx, vec![]);
    for i in [0usize, 1, 2] {
        let tx = test
            .transaction()
            .call_method(escrow, "approve", args![i as u32, work.clone()])
            .build_and_seal(&reviewers[i].0);
        test.execute_expect_success(tx, vec![]);
    }
    let leaf = SpendCondition::access_rule(rule!(resource(authority)));
    let (witness, actual_root) = script_path_witness(&[leaf.clone()], &leaf).unwrap();
    assert_eq!(root, actual_root);
    let mut input = pledge.input();
    input.witness = witness;
    input.condition_root = Some(root);
    let claim = transfer(vec![input], 0, &[payout], None);
    let tx = test
        .transaction()
        .call_method(escrow, "claim", args![claim])
        .build_and_seal(&base);
    test.execute_expect_success(tx, vec![]);
    assert!(test.call_method::<bool>(escrow, "is_paid", args![], vec![]));
}
