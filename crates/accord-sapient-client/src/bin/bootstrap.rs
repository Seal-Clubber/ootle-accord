//! Public test bootstrap only. Uses receiving public keys, never a wallet seed.
use accord_private_client::{PrivateOutput, wallet_keys};
use ootle_byte_type::ConvertFromByteType;
use std::{io::Write, str::FromStr};
use tari_crypto::ristretto::RistrettoPublicKey;
use tari_ootle_common_types::Epoch;
use tari_ootle_transaction::{Transaction, args};
use tari_ootle_wallet_crypto::{StealthCryptoApi, memo::Memo};
use tari_template_lib::prelude::*;
fn main() {
    let a: Vec<_> = std::env::args().collect();
    assert_eq!(
        a.len(),
        5,
        "bootstrap ADDRESS ROOT_COMPONENT RAW_AMOUNT OUTPUT_FILE"
    );
    let (owner, view) = wallet_keys(&a[1]);
    let root = ComponentAddress::from_str(&a[2]).unwrap();
    let amount = a[3].parse::<u64>().unwrap();
    let source = PrivateOutput::new(amount, owner, view, None, None);
    let marker = PrivateOutput::new(0, owner, view, None, None);
    let mut witness = marker.witness();
    let api = StealthCryptoApi::new();
    let memo = Memo::new_message("ootleaccord-test:zero-value-receipt").unwrap();
    witness.witness.encrypted_data = api
        .encrypt_value_and_mask(
            0,
            &marker.mask,
            &RistrettoPublicKey::convert_from_byte_type(&view).unwrap(),
            &marker.nonce,
            Some(&memo),
        )
        .unwrap();
    let proof = api
        .generate_transfer_statement(
            vec![],
            amount,
            [&source.witness(), &witness].into_iter(),
            None,
        )
        .unwrap();
    let result = serde_json::json!({"sourceCommitment":proof.outputs_statement.outputs[0].output.commitment,"receiptCommitment":proof.outputs_statement.outputs[1].output.commitment,"instructions":Transaction::builder(38u8,Epoch::from(20000u64)).call_method(root,"withdraw",args![TARI_TOKEN,Amount::from(amount)]).put_last_instruction_output_on_workspace("shield").stealth_transfer_with_input_bucket(TARI_TOKEN,proof,"shield").into_instructions()});
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&a[4])
        .unwrap();
    file.write_all(serde_json::to_string_pretty(&result).unwrap().as_bytes())
        .unwrap();
    println!("Public bootstrap saved; nothing submitted.");
}
