//! Encodes public deployment parameters using Tari's own CBOR implementation. No wallet secrets.
use std::io::{self, Read};
use tari_template_lib::prelude::{RistrettoPublicKeyBytes, tari_bor};

fn literal<T: tari_bor::Encode<()>>(value: T) -> serde_json::Value {
    let bytes = tari_bor::encode(&value).expect("CBOR encoding failed");
    let hex: String = bytes.iter().map(|b| format!("{b:02x}")).collect();
    serde_json::json!({"Literal":hex})
}

fn main() {
    let mut input = String::new();
    io::stdin().take(65537).read_to_string(&mut input).unwrap();
    assert!(input.len() <= 65536, "Input too large");
    let value: serde_json::Value =
        serde_json::from_str(&input).expect("Use a JSON object on stdin");
    let action = value["action"].as_str().unwrap();
    let args = match action {
        "new" => {
            let creator: RistrettoPublicKeyBytes =
                serde_json::from_value(value["creator"].clone()).unwrap();
            let reviewers: Vec<RistrettoPublicKeyBytes> =
                serde_json::from_value(value["reviewers"].clone()).unwrap();
            let percent = u8::try_from(value["approval_percent"].as_u64().unwrap()).unwrap();
            vec![
                literal(value["agreement_id"].as_str().unwrap()),
                literal(value["milestone_id"].as_str().unwrap()),
                literal(creator),
                literal(reviewers),
                literal(percent),
                literal(value["refund_epoch"].as_u64().unwrap()),
            ]
        }
        "approve" => vec![
            literal(u32::try_from(value["reviewer_index"].as_u64().unwrap()).unwrap()),
            literal(value["submission_hash"].as_str().unwrap()),
        ],
        "submit_work" => vec![literal(value["submission_hash"].as_str().unwrap())],
        "read" => vec![],
        _ => panic!("Unsupported action"),
    };
    println!("{}", serde_json::to_string(&args).unwrap());
}
