//! Offline proof builder. Secrets are persisted by the CLI only in a local journal.
//! No network access, seed export, or signing with a donor's base identity.
use ootle_byte_type::{ConvertFromByteType, ToByteType};
use ootle_network::Network;
use serde::{Deserialize, Serialize};
use tari_crypto::{
    keys::{PublicKey as _, SecretKey as _},
    ristretto::{RistrettoPublicKey, RistrettoSchnorr, RistrettoSecretKey},
};
use tari_ootle_common_types::RistrettoSchnorrBlake2bVerifier;
use tari_ootle_wallet_crypto::{
    MaskAndValue, OutputWitness, StealthCryptoApi, StealthInputWitness, StealthOutputWitness,
};
use tari_template_lib::prelude::*;
use tari_template_lib_types::stealth::RevealedOutput;

#[derive(Clone, Serialize, Deserialize)]
pub struct PrivateOutput {
    pub value: u64,
    pub mask: RistrettoSecretKey,
    pub nonce: RistrettoSecretKey,
    pub recipient_owner: RistrettoPublicKeyBytes,
    pub recipient_view: RistrettoPublicKeyBytes,
    pub spend_secret: Option<RistrettoSecretKey>,
    pub auth: SpendAuthorization,
}
impl PrivateOutput {
    pub fn new(
        value: u64,
        owner: RistrettoPublicKeyBytes,
        view: RistrettoPublicKeyBytes,
        owner_secret: Option<&RistrettoSecretKey>,
        script: Option<Hash32>,
    ) -> Self {
        let crypto = StealthCryptoApi::new();
        let nonce = RistrettoSecretKey::random(&mut ::rand::rng());
        let owner_pk = RistrettoPublicKey::convert_from_byte_type(&owner).unwrap();
        let one_time =
            crypto.derive_stealth_owner_public_key(Network::Esmeralda, &owner_pk, &nonce);
        let public_nonce = RistrettoPublicKey::from_secret_key(&nonce);
        let spend_secret = owner_secret
            .map(|sk| crypto.derive_stealth_owner_secret(Network::Esmeralda, sk, &public_nonce));
        if let Some(ref sk) = spend_secret {
            assert_eq!(RistrettoPublicKey::from_secret_key(sk), one_time);
        }
        Self {
            value,
            mask: RistrettoSecretKey::random(&mut ::rand::rng()),
            nonce,
            recipient_owner: owner,
            recipient_view: view,
            spend_secret,
            auth: script
                .map(SpendAuthorization::Script)
                .unwrap_or(SpendAuthorization::Key(one_time.to_byte_type())),
        }
    }
    pub fn witness(&self) -> StealthOutputWitness {
        let crypto = StealthCryptoApi::new();
        let view = RistrettoPublicKey::convert_from_byte_type(&self.recipient_view).unwrap();
        StealthOutputWitness {
            witness: OutputWitness {
                amount: self.value,
                mask: self.mask.clone(),
                sender_public_nonce: RistrettoPublicKey::from_secret_key(&self.nonce),
                minimum_value_promise: 0,
                encrypted_data: crypto
                    .encrypt_value_and_mask(self.value, &self.mask, &view, &self.nonce, None)
                    .unwrap(),
                resource_view_key: None,
            },
            auth: self.auth.clone(),
            tag: crypto.derive_stealth_output_tag(
                Network::Esmeralda,
                &self.nonce,
                &view,
                &TARI_TOKEN,
            ),
        }
    }
    pub fn input(&self) -> StealthInputWitness {
        StealthInputWitness::new(MaskAndValue::new(self.value, self.mask.clone()))
    }
    pub fn commitment(&self) -> PedersenCommitmentBytes {
        self.witness().witness.to_commitment().to_byte_type()
    }
    pub fn validate_decryption(&self, view_secret: &RistrettoSecretKey) {
        let w = self.witness();
        let c = self.commitment();
        let d = StealthCryptoApi::new()
            .decrypt_utxo_data(
                &w.witness.encrypted_data,
                &c,
                view_secret,
                &w.witness.sender_public_nonce,
                true,
            )
            .expect("Recipient cannot decrypt output");
        assert_eq!(d.value(), self.value);
        assert_eq!(d.mask(), &self.mask);
    }
    pub fn opening_proof(
        &self,
        component: ComponentAddress,
        agreement: &str,
        old: u64,
        new: u64,
        refund: RistrettoPublicKeyBytes,
        domain: &[u8],
    ) -> SignaturePayload {
        let message =
            tari_bor::encode(&(component, agreement, self.commitment(), old, new, refund)).unwrap();
        let pk = RistrettoPublicKey::from_secret_key(&self.mask).to_byte_type();
        let nonce = RistrettoSecretKey::random(&mut ::rand::rng());
        let public_nonce = RistrettoPublicKey::from_secret_key(&nonce).to_byte_type();
        let challenge = RistrettoSchnorrBlake2bVerifier::compute_challenge(
            domain,
            &message,
            &pk,
            &public_nonce,
        );
        SignaturePayload::RistrettoSchnorrBlake2b(
            RistrettoSchnorr::sign_raw_uniform(&self.mask, nonce, &challenge)
                .unwrap()
                .to_byte_type(),
        )
    }
}
pub fn transfer(
    inputs: Vec<StealthInputWitness>,
    revealed: u64,
    outputs: &[PrivateOutput],
    reveal: Option<RevealedOutput>,
) -> StealthTransferStatement {
    let witnesses: Vec<_> = outputs.iter().map(PrivateOutput::witness).collect();
    StealthCryptoApi::new()
        .generate_transfer_statement(inputs, revealed, witnesses.iter(), reveal)
        .unwrap()
}
pub fn wallet_keys(address: &str) -> (RistrettoPublicKeyBytes, RistrettoPublicKeyBytes) {
    let (hrp, bytes) = bech32::decode(address).expect("Invalid wallet address");
    assert_eq!(hrp.as_str(), "otl_esm_");
    assert_eq!(bytes.len(), 64);
    let owner = RistrettoPublicKeyBytes::from_bytes(&bytes[..32]).unwrap();
    let view = RistrettoPublicKeyBytes::from_bytes(&bytes[32..]).unwrap();
    RistrettoPublicKey::convert_from_byte_type(&owner).unwrap();
    RistrettoPublicKey::convert_from_byte_type(&view).unwrap();
    (owner, view)
}
