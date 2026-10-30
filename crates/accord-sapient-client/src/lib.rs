//! Browser proof preparation. Only public wallet keys and private return metadata
//! are handled here; never a Sapient seed, view secret, or input spending key.
use accord_private_client::{PrivateOutput, transfer, wallet_keys};
use ootle_byte_type::{ConvertFromByteType, ToByteType};
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use tari_crypto::{
    keys::{PublicKey as _, SecretKey as _},
    ristretto::{RistrettoPublicKey, RistrettoSchnorr, RistrettoSecretKey},
};
use tari_ootle_common_types::{Epoch, InputDeclaration, RistrettoSchnorrBlake2bVerifier};
use tari_ootle_transaction::{Transaction, TransactionEnvelope, args};
use tari_ootle_wallet_crypto::StealthCryptoApi;
use tari_ootle_wallet_crypto::memo::Memo;
use tari_template_lib::prelude::*;
use tari_template_lib_types::stealth::RevealedOutput;
use wasm_bindgen::prelude::*;

const RETURN_DOMAIN: &[u8] = b"ootleaccord.private-return.v5";
#[wasm_bindgen(js_name=inspectEnvelope)]
pub fn inspect_envelope(encoded: &str) -> Result<String, JsError> {
    let envelope: TransactionEnvelope =
        serde_json::from_value(serde_json::Value::String(encoded.into()))
            .map_err(|e| JsError::new(&e.to_string()))?;
    let tx = envelope
        .decode()
        .map_err(|e| JsError::new(&e.to_string()))?;
    Ok(
        serde_json::json!({"transactionId":tx.calculate_id().to_string(),"transaction":tx})
            .to_string(),
    )
}
mod decimal {
    use serde::{Deserialize, Deserializer, Serializer};
    pub fn serialize<S: Serializer>(v: &u64, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&v.to_string())
    }
    pub fn deserialize<'de, D: Deserializer<'de>>(d: D) -> Result<u64, D::Error> {
        String::deserialize(d)?
            .parse()
            .map_err(serde::de::Error::custom)
    }
}
#[derive(Serialize, Deserialize)]
pub struct ReturnReceipt {
    #[serde(with = "decimal")]
    pub value: u64,
    pub owner: RistrettoPublicKeyBytes,
    pub view: RistrettoPublicKeyBytes,
    pub nonce: RistrettoSecretKey,
}
fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}
fn literal<T: tari_bor::Encode<()>>(v: &T) -> serde_json::Value {
    serde_json::json!({"Literal":hex(&tari_bor::encode(v).unwrap())})
}
fn parse_receipt(json: &str) -> Result<ReturnReceipt, JsError> {
    let note: ReturnReceipt =
        serde_json::from_str(json).map_err(|e| JsError::new(&e.to_string()))?;
    if note.value == 0
        || RistrettoPublicKey::from_secret_key(&note.nonce)
            .to_byte_type()
            .is_zero()
    {
        return Err(JsError::new("Invalid return receipt"));
    }
    Ok(note)
}
pub fn binding(receipt: &ReturnReceipt) -> (RistrettoPublicKeyBytes, RistrettoPublicKeyBytes) {
    let owner = RistrettoPublicKey::convert_from_byte_type(&receipt.owner).unwrap();
    let key = StealthCryptoApi::new()
        .derive_stealth_owner_public_key(ootle_network::Network::Esmeralda, &owner, &receipt.nonce)
        .to_byte_type();
    (
        key,
        RistrettoPublicKey::from_secret_key(&receipt.nonce).to_byte_type(),
    )
}
pub fn destination(receipt: &ReturnReceipt) -> PrivateOutput {
    let mut out = PrivateOutput::new(receipt.value, receipt.owner, receipt.view, None, None);
    out.nonce = receipt.nonce.clone();
    out.auth = SpendAuthorization::Key(binding(receipt).0);
    out
}
pub fn statement(receipt: &ReturnReceipt) -> StealthTransferStatement {
    transfer(vec![], receipt.value, &[destination(receipt)], None)
}
pub fn return_signature(
    component: ComponentAddress,
    index: Option<u32>,
    proof: &StealthTransferStatement,
    nonce: &RistrettoSecretKey,
) -> SignaturePayload {
    let message = tari_bor::encode(&(
        component,
        if index.is_some() { 1u8 } else { 0u8 },
        index.unwrap_or(0),
        proof,
    ))
    .unwrap();
    let pk = RistrettoPublicKey::from_secret_key(nonce).to_byte_type();
    let secret = RistrettoSecretKey::random(&mut ::rand::rng());
    let public = RistrettoPublicKey::from_secret_key(&secret).to_byte_type();
    let challenge =
        RistrettoSchnorrBlake2bVerifier::compute_challenge(RETURN_DOMAIN, &message, &pk, &public);
    SignaturePayload::RistrettoSchnorrBlake2b(
        RistrettoSchnorr::sign_raw_uniform(nonce, secret, &challenge)
            .unwrap()
            .to_byte_type(),
    )
}
pub fn memo_statement(
    receipt: &ReturnReceipt,
    agreement: &str,
    kind: &str,
    receiver: RistrettoPublicKeyBytes,
) -> StealthTransferStatement {
    use tari_crypto::tari_utilities::ByteArray;
    assert!(agreement.len() == 64 && agreement.bytes().all(|b| b.is_ascii_hexdigit()));
    assert!(kind == "refund" || kind == "payout");
    let text = format!(
        "ootleaccord:v5:{kind}:{agreement}:{}:{}",
        receipt.value,
        hex(receipt.nonce.as_bytes())
    );
    let memo = Memo::new_message(text).expect("Bounded receipt memo");
    let note = PrivateOutput::new(0, receipt.owner, receipt.view, None, None);
    let api = StealthCryptoApi::new();
    let mut witness = note.witness();
    witness.witness.encrypted_data = api
        .encrypt_value_and_mask(
            0,
            &note.mask,
            &RistrettoPublicKey::convert_from_byte_type(&receipt.view).unwrap(),
            &note.nonce,
            Some(&memo),
        )
        .unwrap();
    api.generate_transfer_statement(
        vec![],
        1u64,
        [&witness].into_iter(),
        Some(RevealedOutput::new(Amount::from(1u64), receiver)),
    )
    .unwrap()
}
#[wasm_bindgen(js_name=makeReturnNote)]
pub fn make_return_note(address: &str, raw: &str) -> Result<String, JsError> {
    let value = raw
        .parse::<u64>()
        .map_err(|_| JsError::new("Invalid amount"))?;
    if value == 0 {
        return Err(JsError::new("Positive return amount required"));
    }
    let (owner, view) = wallet_keys(address);
    let note = ReturnReceipt {
        value,
        owner,
        view,
        nonce: RistrettoSecretKey::random(&mut ::rand::rng()),
    };
    serde_json::to_string(&note).map_err(|e| JsError::new(&e.to_string()))
}
#[wasm_bindgen(js_name=publicReturnBinding)]
pub fn public_return_binding(note_json: &str) -> Result<String, JsError> {
    let n = parse_receipt(note_json)?;
    let (key, nonce) = binding(&n);
    Ok(serde_json::json!({"value":n.value.to_string(),"key":key,"nonce":nonce}).to_string())
}
#[wasm_bindgen(js_name=fundingArgs)]
pub fn funding_args(
    note_json: &str,
    expected_total: &str,
    address: &str,
    amount: &str,
    agreement: &str,
    receiver_key: &str,
) -> Result<String, JsError> {
    let n = parse_receipt(note_json)?;
    let (owner, view) = wallet_keys(address);
    if n.owner != owner || n.view != view || n.value.to_string() != amount {
        return Err(JsError::new(
            "Refund receipt does not match the connected wallet and contribution",
        ));
    }
    let total = expected_total
        .parse::<u64>()
        .map_err(|_| JsError::new("Invalid funding counter"))?;
    let (key, nonce) = binding(&n);
    let receiver: RistrettoPublicKeyBytes =
        serde_json::from_value(serde_json::Value::String(receiver_key.into()))
            .map_err(|e| JsError::new(&e.to_string()))?;
    let memo = memo_statement(&n, agreement, "refund", receiver);
    let receipt_commitment = memo.outputs_statement.outputs[0].output.commitment;
    Ok(serde_json::json!({"args":[{"Workspace":{"id":0,"offset":null}},literal(&total),literal(&key),literal(&nonce),literal(&memo)],"receiptCommitment":receipt_commitment}).to_string())
}
#[wasm_bindgen(js_name=restoreReturnReceipt)]
pub fn restore_return_receipt(
    memo: &str,
    address: &str,
    agreement: &str,
) -> Result<String, JsError> {
    let parts: Vec<_> = memo.split(':').collect();
    if memo.len() > 253
        || parts.len() != 6
        || parts[0] != "ootleaccord"
        || parts[1] != "v5"
        || !["refund", "payout"].contains(&parts[2])
        || parts[3] != agreement
    {
        return Err(JsError::new("Not a receipt for this accord"));
    }
    let value = parts[4]
        .parse::<u64>()
        .map_err(|_| JsError::new("Invalid receipt value"))?;
    let nonce: RistrettoSecretKey =
        serde_json::from_value(serde_json::Value::String(parts[5].into()))
            .map_err(|_| JsError::new("Invalid receipt nonce"))?;
    let (owner, view) = wallet_keys(address);
    let receipt = ReturnReceipt {
        value,
        owner,
        view,
        nonce,
    };
    Ok(serde_json::json!({"kind":parts[2],"receipt":receipt}).to_string())
}
#[wasm_bindgen(js_name=returnStatement)]
pub fn return_statement(note_json: &str) -> Result<String, JsError> {
    Ok(serde_json::to_string(&statement(&parse_receipt(note_json)?)).unwrap())
}
#[wasm_bindgen(js_name=constructorArgs)]
pub fn constructor_args(note_json: &str, config_json: &str) -> Result<String, JsError> {
    let note = parse_receipt(note_json)?;
    let c: serde_json::Value =
        serde_json::from_str(config_json).map_err(|e| JsError::new(&e.to_string()))?;
    let read_key = |v: &serde_json::Value| -> Result<RistrettoPublicKeyBytes, JsError> {
        serde_json::from_value(v.clone()).map_err(|e| JsError::new(&e.to_string()))
    };
    let creator = read_key(&c["creator"])?;
    let reviewers: Vec<RistrettoPublicKeyBytes> =
        serde_json::from_value(c["reviewers"].clone()).map_err(|e| JsError::new(&e.to_string()))?;
    let target = c["target"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or_else(|| JsError::new("Invalid goal"))?;
    let deadline = c["deadline"]
        .as_str()
        .and_then(|s| s.parse::<u64>().ok())
        .ok_or_else(|| JsError::new("Invalid deadline"))?;
    if target != note.value || creator != note.owner {
        return Err(JsError::new(
            "Payout receipt does not match creator and goal",
        ));
    }
    let (key, nonce) = binding(&note);
    let agreement = c["agreementId"]
        .as_str()
        .ok_or_else(|| JsError::new("Missing agreement"))?;
    let memo = memo_statement(&note, agreement, "payout", creator);
    Ok(serde_json::json!([{"Workspace":{"id":0,"offset":null}},literal(&agreement),literal(&c["stageId"].as_str().unwrap_or("delivery")),literal(&creator),literal(&key),literal(&nonce),literal(&reviewers),literal(&(c["approvalPercent"].as_u64().unwrap_or(60) as u8)),literal(&(c["requiredReviewer"].as_u64().unwrap_or(2) as u32)),literal(&target),literal(&deadline),literal(&memo)]).to_string())
}
#[wasm_bindgen(js_name=actionTransaction)]
pub fn action_transaction(
    component: &str,
    principal_vault: &str,
    fee_vault: &str,
    note_json: &str,
    refund_index: Option<u32>,
    max_epoch: &str,
    dry_run: bool,
) -> Result<String, JsError> {
    let c = ComponentAddress::from_str(component)
        .map_err(|_| JsError::new("Invalid escrow address"))?;
    let note = parse_receipt(note_json)?;
    let epoch = max_epoch
        .parse::<u64>()
        .map_err(|_| JsError::new("Invalid epoch"))?;
    let principal =
        VaultId::from_str(principal_vault).map_err(|_| JsError::new("Invalid principal vault"))?;
    let fees = VaultId::from_str(fee_vault).map_err(|_| JsError::new("Invalid fee vault"))?;
    let proof = statement(&note);
    let sig = return_signature(c, refund_index, &proof, &note.nonce);
    let return_commitment = proof.outputs_statement.outputs[0].output.commitment;
    // A throwaway transaction sealer, not a wallet or a key controlling funds.
    let sealer = RistrettoSecretKey::random(&mut ::rand::rng());
    let tx = Transaction::builder(38u8, Epoch::from(epoch))
        .with_fee_instructions_builder(|b| {
            if let Some(i) = refund_index {
                b.call_method(c, "refund", args![i, proof, sig])
            } else {
                b.call_method(c, "claim", args![proof, sig])
            }
        })
        .add_input(InputDeclaration::write(c))
        .add_input(InputDeclaration::write(principal))
        .add_input(InputDeclaration::write(fees))
        .add_input(InputDeclaration::read(TARI_TOKEN))
        .with_dry_run(dry_run)
        .build_and_seal(&sealer);
    let id = tx.calculate_id().to_string();
    let envelope =
        TransactionEnvelope::encode(tx.clone()).map_err(|e| JsError::new(&e.to_string()))?;
    Ok(serde_json::json!({"transactionId":id,"transaction":envelope,"returnCommitment":return_commitment,"signed":tx}).to_string())
}
