use accord_private_client::*;
use ootle_byte_type::ToByteType;
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{fs, io::Write, path::Path, str::FromStr};
use tari_crypto::{
    keys::{PublicKey as _, SecretKey as _},
    ristretto::{RistrettoPublicKey, RistrettoSecretKey},
};
use tari_ootle_common_types::{Epoch, InputDeclaration};
use tari_ootle_transaction::{Transaction, TransactionEnvelope, UnsignedTransaction, args};
use tari_template_lib::prelude::*;
use tari_template_lib_types::stealth::RevealedOutput;

#[derive(Serialize, Deserialize)]
struct Journal {
    owner: RistrettoSecretKey,
    view: RistrettoSecretKey,
    source: PrivateOutput,
    fee: PrivateOutput,
    payout: PrivateOutput,
    refund: PrivateOutput,
    pledge: Option<PrivateOutput>,
    fee_change: Option<PrivateOutput>,
}
fn write_new(path: &str, value: &impl Serialize) {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = options
        .open(path)
        .expect("Refusing to overwrite journal or signed transaction");
    file.write_all(&serde_json::to_vec_pretty(value).unwrap())
        .unwrap();
    file.sync_all().unwrap();
}
fn read<T: serde::de::DeserializeOwned>(path: &str) -> T {
    serde_json::from_slice(&fs::read(path).unwrap()).unwrap()
}
fn literal<T: tari_bor::Encode<()>>(v: T) -> Value {
    json!({"Literal":tari_bor::encode(&v).unwrap().iter().map(|b|format!("{b:02x}")).collect::<String>()})
}
fn main() {
    let argv: Vec<_> = std::env::args().collect();
    assert_eq!(
        argv.len(),
        4,
        "Use COMMAND LOCAL_DIRECTORY PUBLIC_CONFIG.json"
    );
    let command = &argv[1];
    let dir = &argv[2];
    let config: Value = read(&argv[3]);
    let funding_units = config
        .get("funding_units")
        .map(|v| {
            v.as_u64()
                .expect("funding_units must be an unsigned integer")
        })
        .unwrap_or(10_000_000);
    let target_units = config
        .get("target_units")
        .map(|v| {
            v.as_u64()
                .expect("target_units must be an unsigned integer")
        })
        .unwrap_or(10_000_000);
    assert!(
        funding_units > 0 && funding_units <= target_units,
        "Funding must be positive and within the target"
    );
    assert!(
        Path::new(dir)
            .components()
            .any(|p| p.as_os_str() == ".local"),
        "Recovery journals must remain in ignored .local storage"
    );
    fs::create_dir_all(dir).unwrap();
    let path = format!("{dir}/secrets.json");
    match command.as_str() {
        "condition" => {
            let resource: ResourceAddress =
                FromStr::from_str(config["authority_resource"].as_str().unwrap()).unwrap();
            let leaf = SpendCondition::access_rule(rule!(resource(resource)));
            let (_, root) =
                tari_ootle_wallet_crypto::stealth::script_path_witness(&[leaf.clone()], &leaf)
                    .unwrap();
            write_new(
                &format!("{dir}/condition.json"),
                &json!({"condition_root":root}),
            );
            println!("Official native condition root saved.");
        }
        "prepare" => {
            let owner = RistrettoSecretKey::random(&mut ::rand::rng());
            let view = RistrettoSecretKey::random(&mut ::rand::rng());
            let op = RistrettoPublicKey::from_secret_key(&owner).to_byte_type();
            let vp = RistrettoPublicKey::from_secret_key(&view).to_byte_type();
            let (po, pv) = wallet_keys(config["payout_address"].as_str().unwrap());
            let source = PrivateOutput::new(funding_units, op, vp, Some(&owner), None);
            let fee = PrivateOutput::new(1_000_000, op, vp, Some(&owner), None);
            let payout = PrivateOutput::new(target_units, po, pv, None, None);
            let refund = PrivateOutput::new(funding_units, op, vp, Some(&owner), None);
            source.validate_decryption(&view);
            fee.validate_decryption(&view);
            refund.validate_decryption(&view);
            write_new(
                &path,
                &Journal {
                    owner,
                    view,
                    source,
                    fee,
                    payout: payout.clone(),
                    refund: refund.clone(),
                    pledge: None,
                    fee_change: None,
                },
            );
            write_new(
                &format!("{dir}/destinations.json"),
                &json!({"payout":payout.auth,"refund":refund.auth}),
            );
            println!("Private recovery journal and public one-time destinations saved.");
        }
        "shield" => {
            let j: Journal = read(&path);
            let shield_units = j.source.value.checked_add(j.fee.value).unwrap();
            let stmt = transfer(vec![], shield_units, &[j.source, j.fee], None);
            let account: ComponentAddress =
                FromStr::from_str(config["creator_component"].as_str().unwrap()).unwrap();
            let instructions = Transaction::builder(38u8, Epoch::from(20000u64))
                .call_method(
                    account,
                    "withdraw",
                    args![TARI_TOKEN, Amount::from(shield_units)],
                )
                .put_last_instruction_output_on_workspace("shield")
                .stealth_transfer_with_input_bucket(TARI_TOKEN, stmt, "shield")
                .into_instructions();
            write_new(&format!("{dir}/shield-instructions.json"), &instructions);
            println!("Public bootstrap instructions saved; no transaction submitted.");
        }
        "fund" => {
            let mut j: Journal = read(&path);
            assert!(j.pledge.is_none(), "Funding proof already prepared");
            assert_eq!(
                j.source.value, funding_units,
                "Funding config differs from recovery journal"
            );
            let component: ComponentAddress =
                FromStr::from_str(config["component"].as_str().unwrap()).unwrap();
            let root: Hash32 = serde_json::from_value(config["condition_root"].clone()).unwrap();
            let op = RistrettoPublicKey::from_secret_key(&j.owner).to_byte_type();
            let vp = RistrettoPublicKey::from_secret_key(&j.view).to_byte_type();
            // Creator can decrypt and build the eventual payout; the donor also
            // retains the mask in fund-recovery.json for an expired refund.
            let pledge = PrivateOutput::new(
                funding_units,
                j.payout.recipient_owner,
                j.payout.recipient_view,
                None,
                Some(root),
            );
            let refund = match j.refund.auth {
                SpendAuthorization::Key(pk) => pk,
                _ => panic!(),
            };
            let sig = pledge.opening_proof(
                component,
                config["agreement_id"].as_str().unwrap(),
                0,
                funding_units,
                refund,
                b"ootleaccord.private-funding.v1",
            );
            assert!(j.fee.value > 100_000, "Private fee output too small");
            let fee_change =
                PrivateOutput::new(j.fee.value - 100_000, op, vp, Some(&j.owner), None);
            fee_change.validate_decryption(&j.view);
            let signer =
                RistrettoPublicKey::from_secret_key(j.source.spend_secret.as_ref().unwrap())
                    .to_byte_type();
            let fee_stmt = transfer(
                vec![j.fee.input()],
                0,
                &[fee_change.clone()],
                Some(RevealedOutput::new(Amount::from(100_000u64), signer)),
            );
            let stmt = transfer(vec![j.source.input()], 0, &[pledge.clone()], None);
            let unsigned =
                Transaction::builder(38u8, Epoch::from(config["max_epoch"].as_u64().unwrap()))
                    .with_nonce(config["nonce"].as_u64().unwrap_or(100_000_001))
                    .with_fee_instructions_builder(|b| {
                        b.stealth_transfer(TARI_TOKEN, fee_stmt)
                            .put_last_instruction_output_on_workspace("fees")
                            .pay_fee_from_bucket("fees")
                    })
                    .call_method(component, "fund", args![stmt, funding_units, refund, sig])
                    .add_input(InputDeclaration::write(UtxoAddress::new(
                        TARI_TOKEN,
                        j.source.commitment().into(),
                    )))
                    .add_input(InputDeclaration::write(UtxoAddress::new(
                        TARI_TOKEN,
                        j.fee.commitment().into(),
                    )))
                    .build_unsigned();
            j.pledge = Some(pledge);
            j.fee_change = Some(fee_change);
            write_new(&format!("{dir}/fund-recovery.json"), &j);
            write_new(&format!("{dir}/fund-unsigned.json"), &unsigned);
            println!("Private funding proof and recovery saved; resolve inputs before signing.");
        }
        "seal" | "dry-seal" => {
            let j: Journal = read(&format!("{dir}/fund-recovery.json"));
            let unsigned: UnsignedTransaction = read(&format!("{dir}/fund-resolved.json"));
            let source = j.source.spend_secret.as_ref().unwrap();
            let fee = j.fee.spend_secret.as_ref().unwrap();
            let signer = RistrettoPublicKey::from_secret_key(source).to_byte_type();
            assert_eq!(unsigned.network(), 38);
            let original: UnsignedTransaction = read(&format!("{dir}/fund-unsigned.json"));
            let mut a = serde_json::to_value(&original).unwrap();
            let b = serde_json::to_value(&unsigned).unwrap();
            a["V1"]["inputs"] = b["V1"]["inputs"].clone();
            assert_eq!(
                a, b,
                "Input resolver changed transaction instructions or terms"
            );
            let unsigned = unsigned.with_dry_run(command == "dry-seal");
            let tx = unsigned.add_signer(&signer, fee).seal(source);
            assert!(tx.verify_all_signatures());
            let id = tx.calculate_id().to_string();
            let envelope = TransactionEnvelope::encode(tx.clone()).unwrap();
            let prefix = if command == "seal" {
                "fund"
            } else {
                "fund-dry"
            };
            write_new(&format!("{dir}/{prefix}-signed.json"), &tx);
            write_new(
                &format!("{dir}/{prefix}-envelope.json"),
                &json!({"transaction":envelope}),
            );
            write_new(
                &format!("{dir}/{prefix}-id.json"),
                &json!({"transaction_id":id}),
            );
            println!("Signed transaction {} saved; no transaction submitted.", id);
        }
        "claim-args" | "refund-args" => {
            // Offline preparation only. The contract still enforces the actual
            // required vote/deadline and caller authorization at execution.
            let j: Journal = read(&format!("{dir}/fund-recovery.json"));
            let pledge = j.pledge.as_ref().expect("No funded pledge recovery");
            if command == "claim-args" {
                assert_eq!(
                    pledge.value, target_units,
                    "A partial campaign payout needs all pledge recoveries; this journal contains only one pledge"
                );
            }
            let resource: ResourceAddress =
                FromStr::from_str(config["authority_resource"].as_str().unwrap()).unwrap();
            let leaf = SpendCondition::access_rule(rule!(resource(resource)));
            let (witness, root) =
                tari_ootle_wallet_crypto::stealth::script_path_witness(&[leaf.clone()], &leaf)
                    .unwrap();
            assert_eq!(pledge.auth, SpendAuthorization::Script(root));
            let mut input = pledge.input();
            input.witness = witness;
            input.condition_root = Some(root);
            let refunding = command == "refund-args";
            let destination = if refunding { &j.refund } else { &j.payout };
            let statement = transfer(vec![input], 0, &[destination.clone()], None);
            let arguments = if refunding {
                let component: ComponentAddress =
                    FromStr::from_str(config["component"].as_str().unwrap()).unwrap();
                let refund_key = match j.refund.auth {
                    SpendAuthorization::Key(pk) => pk,
                    _ => panic!("Refund must be key-only"),
                };
                let proof = pledge.opening_proof(
                    component,
                    config["agreement_id"].as_str().unwrap(),
                    pledge.value,
                    0,
                    refund_key,
                    b"ootleaccord.private-refund.v1",
                );
                vec![
                    literal(0u32),
                    literal(statement),
                    literal(0u64),
                    literal(proof),
                ]
            } else {
                vec![literal(statement)]
            };
            write_new(&format!("{dir}/{command}.json"), &arguments);
            println!("Recovery arguments saved. No transaction signed or submitted.");
        }
        "new-args" => {
            let j: Journal = read(&path);
            assert_eq!(
                j.payout.value, target_units,
                "Target config differs from recovery journal"
            );
            let payout = match j.payout.auth {
                SpendAuthorization::Key(pk) => pk,
                _ => panic!(),
            };
            let creator: RistrettoPublicKeyBytes =
                serde_json::from_value(config["creator"].clone()).unwrap();
            let reviewers: Vec<RistrettoPublicKeyBytes> =
                serde_json::from_value(config["reviewers"].clone()).unwrap();
            let a = vec![
                literal(config["agreement_id"].as_str().unwrap()),
                literal("delivery"),
                literal(creator),
                literal(payout),
                literal(reviewers),
                literal(60u8),
                literal(2u32),
                literal(target_units),
                literal(config["deadline"].as_u64().unwrap()),
            ];
            write_new(&format!("{dir}/constructor-args.json"), &a);
            println!("Public constructor arguments saved.");
        }
        _ => panic!("Unknown command"),
    }
}
