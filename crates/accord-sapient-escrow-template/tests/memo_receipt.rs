use accord_private_client::PrivateOutput;
use ootle_byte_type::ToByteType;
use tari_crypto::{
    keys::{PublicKey as _, SecretKey as _},
    ristretto::{RistrettoPublicKey, RistrettoSecretKey},
};
use tari_ootle_wallet_crypto::{StealthCryptoApi, memo::Memo};
use tari_template_lib::prelude::*;
use tari_template_lib::types::stealth::RevealedOutput;
use tari_template_test_tooling::{TemplateTest, transaction::args};

#[test]
fn zero_value_native_receipt_preserves_an_encrypted_memo_without_holding_funds() {
    let mut test = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["."]);
    test.enable_auto_add_proofs_from_signers();
    let (account, _, owner) = test.create_funded_account();
    let view = RistrettoSecretKey::random(&mut ::rand::rng());
    let note = PrivateOutput::new(
        0,
        RistrettoPublicKey::from_secret_key(&owner).to_byte_type(),
        RistrettoPublicKey::from_secret_key(&view).to_byte_type(),
        Some(&owner),
        None,
    );
    let api = StealthCryptoApi::new();
    let mut witness = note.witness();
    let memo = Memo::new_message("ootleaccord-return-v5:test-only-metadata").unwrap();
    witness.witness.encrypted_data = api
        .encrypt_value_and_mask(
            0,
            &note.mask,
            &RistrettoPublicKey::from_secret_key(&view),
            &note.nonce,
            Some(&memo),
        )
        .unwrap();
    // Native transfers require an input. Round-trip one micro-TARI unchanged;
    // the encrypted zero-value receipt holds no funds and the vault loses none.
    let proof = api
        .generate_transfer_statement(
            vec![],
            1u64,
            [&witness].into_iter(),
            Some(RevealedOutput::new(
                Amount::from(1u64),
                RistrettoPublicKey::from_secret_key(&owner).to_byte_type(),
            )),
        )
        .unwrap();
    let body = &proof.outputs_statement.outputs[0].output;
    let decoded = api
        .decrypt_utxo_data(
            &body.encrypted_data,
            &body.commitment,
            &view,
            &RistrettoPublicKey::from_secret_key(&note.nonce),
            false,
        )
        .unwrap();
    assert_eq!(decoded.value(), 0);
    assert_eq!(decoded.memo(), Some(&memo));
    let tx = test
        .transaction()
        .call_method(account, "withdraw", args![TARI_TOKEN, Amount::from(1u64)])
        .put_last_instruction_output_on_workspace("receipt")
        .stealth_transfer_with_input_bucket(TARI_TOKEN, proof, "receipt")
        .put_last_instruction_output_on_workspace("roundtrip")
        .call_method(account, "deposit", args![Workspace("roundtrip")])
        .build_and_seal(&owner);
    test.execute_expect_success(tx, vec![]);
}
