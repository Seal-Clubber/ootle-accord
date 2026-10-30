//! Native TARI stealth-output escrow. The aggregate counter is public; individual
//! output values remain encrypted, but counter differences disclose contributions.
use tari_template_lib::prelude::*;

pub const FUNDING_DOMAIN: &[u8] = b"ootleaccord.private-funding.v1";
pub const REFUND_DOMAIN: &[u8] = b"ootleaccord.private-refund.v1";
// Tari's standard Pedersen value generator (NUMS point 0). Tested independently
// against tari_crypto::PedersenCommitmentFactory, never caller-selectable.
pub const VALUE_GENERATOR: [u8; 32] = [
    206, 56, 152, 65, 192, 200, 105, 138, 185, 91, 112, 36, 42, 238, 166, 72, 64, 177, 234, 197,
    246, 68, 183, 208, 8, 172, 5, 135, 207, 71, 29, 112,
];

#[template]
mod accord_escrow {
    use super::*;
    pub struct AccordEscrow {
        agreement_id: String,
        milestone_id: String,
        creator: RistrettoPublicKeyBytes,
        payout_key: RistrettoPublicKeyBytes,
        reviewers: Vec<RistrettoPublicKeyBytes>,
        approval_percent: u8,
        required_reviewer: u32,
        target: u64,
        deadline: u64,
        total: u64,
        submission_hash: String,
        votes: Vec<bool>,
        authority: Vault,
        commitments: Vec<PedersenCommitmentBytes>,
        refund_keys: Vec<RistrettoPublicKeyBytes>,
        spent: Vec<bool>,
        paid: bool,
    }
    impl AccordEscrow {
        pub fn new(
            agreement_id: String,
            milestone_id: String,
            creator: RistrettoPublicKeyBytes,
            payout_key: RistrettoPublicKeyBytes,
            reviewers: Vec<RistrettoPublicKeyBytes>,
            approval_percent: u8,
            required_reviewer: u32,
            target: u64,
            deadline: u64,
        ) -> Component<Self> {
            assert!(valid_hash(&agreement_id), "Invalid agreement ID");
            assert!(
                !milestone_id.is_empty() && milestone_id.len() <= 40,
                "Invalid milestone ID"
            );
            assert!(
                (1..=10).contains(&reviewers.len()),
                "Use one to ten reviewers"
            );
            assert!((1..=100).contains(&approval_percent), "Invalid percentage");
            assert!(
                (required_reviewer as usize) < reviewers.len(),
                "Required reviewer out of range"
            );
            for (i, k) in reviewers.iter().enumerate() {
                valid_key(k);
                assert!(!reviewers[..i].contains(k), "Duplicate reviewer");
            }
            valid_key(&creator);
            valid_key(&payout_key);
            assert!(
                target > 0 && deadline > Consensus::current_epoch(),
                "Invalid target or deadline"
            );
            let count = reviewers.len();
            let badge = ResourceBuilder::public_fungible()
                .with_owner_rule(OwnerRule::None)
                .with_divisibility(0)
                .mintable(rule!(deny_all), LOCKED)
                .initial_supply(1u32);
            Component::new(Self {
                agreement_id,
                milestone_id,
                creator,
                payout_key,
                reviewers,
                approval_percent,
                required_reviewer,
                target,
                deadline,
                total: 0,
                submission_hash: String::new(),
                votes: vec![false; count],
                authority: Vault::from_bucket(badge),
                commitments: vec![],
                refund_keys: vec![],
                spent: vec![],
                paid: false,
            })
            .with_owner_rule(OwnerRule::None)
            .with_access_rules(AccessRules::allow_all())
            .create()
        }
        /// No identity proof is requested from donors. The statement itself must
        /// spend private inputs. A wallet must also use unlinkable signing/fee keys.
        pub fn fund(
            &mut self,
            transfer: StealthTransferStatement,
            new_total: u64,
            refund_key: RistrettoPublicKeyBytes,
            opening_signature: SignaturePayload,
        ) {
            self.assert_open();
            assert!(
                !self.paid && self.commitments.len() < 64,
                "Escrow closed or pledge limit reached"
            );
            assert!(
                new_total > self.total && new_total <= self.target,
                "Funding exceeds remaining capacity"
            );
            valid_key(&refund_key);
            Self::private_transfer(&transfer);
            assert!(
                !transfer.inputs_statement.inputs.is_empty(),
                "Private inputs required"
            );
            for input in &transfer.inputs_statement.inputs {
                assert!(
                    !self.commitments.contains(&input.commitment),
                    "Cannot recycle escrow funds"
                );
            }
            let output = &transfer.outputs_statement.outputs[0];
            assert_eq!(
                output.auth,
                SpendAuthorization::Script(self.condition_root()),
                "Wrong escrow output authority"
            );
            for change in transfer.outputs_statement.outputs.iter().skip(1) {
                assert!(
                    matches!(change.auth, SpendAuthorization::Key(_)),
                    "Change must be key-only"
                );
            }
            let commitment = output.output.commitment;
            assert!(!self.commitments.contains(&commitment), "Duplicate pledge");
            let point = RistrettoPublicKeyBytes::from_bytes(commitment.as_bytes()).unwrap();
            assert!(
                intrinsics::ristretto_is_canonical(&point),
                "Invalid commitment"
            );
            let mut delta = [0u8; 32];
            delta[..8].copy_from_slice(&(new_total - self.total).to_le_bytes());
            let value_point = intrinsics::ristretto_mul(
                &RistrettoPublicKeyBytes::from_bytes(&VALUE_GENERATOR).unwrap(),
                &Scalar32Bytes::from_bytes(&delta).unwrap(),
            );
            let mask_key = intrinsics::ristretto_sub(&point, &value_point);
            assert!(
                !intrinsics::ristretto_is_identity(&mask_key),
                "Unblinded pledge"
            );
            let message = tari_bor::encode(&(
                CallerContext::current_component_address(),
                self.agreement_id.clone(),
                commitment,
                self.total,
                new_total,
                refund_key,
            ))
            .unwrap();
            assert!(
                intrinsics::schnorr_verify_with_domain(
                    &PublicKey::from(mask_key),
                    FUNDING_DOMAIN,
                    &message,
                    &opening_signature
                ),
                "Funding total proof is invalid"
            );
            // Native consensus validates the real input ownership, range proof,
            // balance proof and output creation atomically with the counter update.
            assert!(
                ResourceManager::get(TARI_TOKEN)
                    .stealth_transfer(transfer)
                    .is_none(),
                "Revealed output forbidden"
            );
            self.commitments.push(commitment);
            self.refund_keys.push(refund_key);
            self.spent.push(false);
            self.total = new_total;
        }
        pub fn submit_work(&mut self, hash: String) {
            CallerContext::get_signer_proof_for_public_key(self.creator).drop();
            self.assert_open();
            assert!(
                valid_hash(&hash) && !self.votes.iter().any(|v| *v),
                "Invalid work or voting already started"
            );
            self.submission_hash = hash;
        }
        pub fn approve(&mut self, index: u32, hash: String) {
            self.assert_open();
            let i = index as usize;
            assert!(i < self.reviewers.len(), "Unknown reviewer");
            CallerContext::get_signer_proof_for_public_key(self.reviewers[i]).drop();
            assert!(
                self.total == self.target && !self.submission_hash.is_empty(),
                "Funding and work must be complete"
            );
            assert_eq!(hash, self.submission_hash, "Different work");
            assert!(
                !self.votes[i] && !self.is_approved(),
                "Vote already recorded or quorum complete"
            );
            self.votes[i] = true;
        }
        pub fn claim(&mut self, transfer: StealthTransferStatement) {
            self.assert_open();
            CallerContext::get_signer_proof_for_public_key(self.creator).drop();
            assert!(
                !self.paid && self.total == self.target && self.is_approved(),
                "Payout is not authorized"
            );
            Self::private_transfer(&transfer);
            assert_eq!(
                transfer.inputs_statement.inputs.len(),
                self.commitments.len(),
                "Must claim all pledges"
            );
            for commitment in &self.commitments {
                assert_eq!(
                    transfer
                        .inputs_statement
                        .inputs
                        .iter()
                        .filter(|i| i.commitment == *commitment)
                        .count(),
                    1,
                    "Missing or duplicated pledge"
                );
            }
            Self::destination(&transfer, self.payout_key);
            self.authority.authorize_with(|| {
                assert!(
                    ResourceManager::get(TARI_TOKEN)
                        .stealth_transfer(transfer)
                        .is_none()
                );
            });
            self.paid = true;
            self.spent.fill(true);
            self.total = 0;
        }
        /// Anyone may relay an expired pledge's private refund. Its destination is
        /// fixed at funding time to the funder's one-time refund key, not the relayer.
        pub fn refund(
            &mut self,
            index: u32,
            transfer: StealthTransferStatement,
            new_total: u64,
            opening_signature: SignaturePayload,
        ) {
            assert!(
                Consensus::current_epoch() >= self.deadline && !self.paid,
                "Refund not open"
            );
            let i = index as usize;
            assert!(
                i < self.commitments.len() && !self.spent[i],
                "Pledge already spent"
            );
            Self::private_transfer(&transfer);
            assert_eq!(
                transfer.inputs_statement.inputs.len(),
                1,
                "Refund one pledge"
            );
            assert_eq!(
                transfer.inputs_statement.inputs[0].commitment, self.commitments[i],
                "Wrong pledge"
            );
            Self::destination(&transfer, self.refund_keys[i]);
            assert!(new_total < self.total, "Invalid refunded total");
            let point =
                RistrettoPublicKeyBytes::from_bytes(self.commitments[i].as_bytes()).unwrap();
            let mut delta = [0u8; 32];
            delta[..8].copy_from_slice(&(self.total - new_total).to_le_bytes());
            let value_point = intrinsics::ristretto_mul(
                &RistrettoPublicKeyBytes::from_bytes(&VALUE_GENERATOR).unwrap(),
                &Scalar32Bytes::from_bytes(&delta).unwrap(),
            );
            let key = intrinsics::ristretto_sub(&point, &value_point);
            let message = tari_bor::encode(&(
                CallerContext::current_component_address(),
                self.agreement_id.clone(),
                self.commitments[i],
                self.total,
                new_total,
                self.refund_keys[i],
            ))
            .unwrap();
            assert!(
                intrinsics::schnorr_verify_with_domain(
                    &PublicKey::from(key),
                    REFUND_DOMAIN,
                    &message,
                    &opening_signature
                ),
                "Invalid refund total proof"
            );
            self.authority.authorize_with(|| {
                assert!(
                    ResourceManager::get(TARI_TOKEN)
                        .stealth_transfer(transfer)
                        .is_none()
                );
            });
            self.spent[i] = true;
            self.total = new_total;
        }
        pub fn condition_root(&self) -> Hash32 {
            // Native v0 single-leaf condition-tree encoding; independently checked
            // against the official engine MerkleTree in integration tests.
            let leaf =
                SpendCondition::access_rule(rule!(resource(self.authority.resource_address())));
            let encoded = borsh::to_vec(&leaf).unwrap();
            let domain = b"com.tari.ootle.engine.v0.ConditionLeaf";
            intrinsics::hash_blake2b_parts(&[
                &(domain.len() as u64).to_le_bytes(),
                domain,
                &0u32.to_le_bytes(),
                &encoded,
            ])
        }
        pub fn authority_resource(&self) -> ResourceAddress {
            self.authority.resource_address()
        }
        pub fn funding_status(&self) -> (u64, u64, u64, bool) {
            (
                self.target,
                self.total,
                if self.paid || Consensus::current_epoch() >= self.deadline {
                    0
                } else {
                    self.target - self.total
                },
                !self.paid && self.total == self.target,
            )
        }
        pub fn required_approvals(&self) -> u32 {
            (self.reviewers.len() as u32 * self.approval_percent as u32 + 99) / 100
        }
        pub fn approvals_count(&self) -> u32 {
            self.votes.iter().filter(|v| **v).count() as u32
        }
        pub fn is_approved(&self) -> bool {
            self.approvals_count() >= self.required_approvals()
                && self.votes[self.required_reviewer as usize]
        }
        pub fn votes(&self) -> Vec<bool> {
            self.votes.clone()
        }
        pub fn submission(&self) -> String {
            self.submission_hash.clone()
        }
        pub fn is_paid(&self) -> bool {
            self.paid
        }
        pub fn pledge_status(&self, index: u32) -> bool {
            self.spent[index as usize]
        }
        fn assert_open(&self) {
            assert!(
                Consensus::current_epoch() < self.deadline,
                "Deadline passed"
            );
        }
        fn private_transfer(t: &StealthTransferStatement) {
            assert!(
                t.revealed_input_amount().is_zero()
                    && t.outputs_statement.revealed_output.is_none(),
                "Revealed funding is forbidden"
            );
            assert!(
                !t.outputs_statement.outputs.is_empty(),
                "Private output required"
            );
            for o in &t.outputs_statement.outputs {
                assert_eq!(
                    o.output.minimum_value_promise, 0,
                    "Do not disclose output value promises"
                );
            }
        }
        fn destination(t: &StealthTransferStatement, key: RistrettoPublicKeyBytes) {
            assert_eq!(
                t.outputs_statement.outputs.len(),
                1,
                "One private destination required"
            );
            assert_eq!(
                t.outputs_statement.outputs[0].auth,
                SpendAuthorization::Key(key),
                "Wrong payout destination"
            );
        }
    }
    fn valid_hash(s: &str) -> bool {
        s.len() == 64
            && s.bytes()
                .all(|c| c.is_ascii_digit() || (b'a'..=b'f').contains(&c))
    }
    fn valid_key(k: &RistrettoPublicKeyBytes) {
        assert!(
            intrinsics::ristretto_is_canonical(k) && !intrinsics::ristretto_is_identity(k),
            "Invalid public key"
        );
    }
}
