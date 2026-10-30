//! Stock-Sapient escrow: public contribution amounts, one-time deposit signers.
//! Principal is held in a native TARI vault; payout/refunds create fixed stealth
//! outputs. Private return nonces authorize fresh ciphertext without revealing
//! wallet identities; the page backs them up in an encrypted return receipt.
use tari_template_lib::prelude::*;

pub const MAX_PLEDGES: usize = 16;
pub const ACTION_FEE: u64 = 100_000;
pub const RETURN_DOMAIN: &[u8] = b"ootleaccord.private-return.v5";

#[template]
mod sapient_escrow {
    use super::*;
    pub struct SapientEscrow {
        agreement_id: String,
        milestone_id: String,
        creator: RistrettoPublicKeyBytes,
        payout_key: RistrettoPublicKeyBytes,
        payout_nonce: RistrettoPublicKeyBytes,
        reviewers: Vec<RistrettoPublicKeyBytes>,
        approval_percent: u8,
        required_reviewer: u32,
        target: u64,
        deadline: u64,
        total: u64,
        submission_hash: String,
        votes: Vec<bool>,
        principal: Vault,
        fees: Vault,
        refund_keys: Vec<RistrettoPublicKeyBytes>,
        refund_nonces: Vec<RistrettoPublicKeyBytes>,
        contributions: Vec<u64>,
        refunded: Vec<bool>,
        paid: bool,
        receipt_commitments: Vec<PedersenCommitmentBytes>,
        payout_receipt: PedersenCommitmentBytes,
    }
    impl SapientEscrow {
        pub fn new(
            fee_reserve: Bucket,
            agreement_id: String,
            milestone_id: String,
            creator: RistrettoPublicKeyBytes,
            payout_key: RistrettoPublicKeyBytes,
            payout_nonce: RistrettoPublicKeyBytes,
            reviewers: Vec<RistrettoPublicKeyBytes>,
            approval_percent: u8,
            required_reviewer: u32,
            target: u64,
            deadline: u64,
            payout_receipt: StealthTransferStatement,
        ) -> Component<Self> {
            assert!(valid_hash(&agreement_id), "Invalid agreement ID");
            assert!(
                !milestone_id.is_empty() && milestone_id.len() <= 40,
                "Invalid milestone ID"
            );
            assert!(
                (1..=10).contains(&reviewers.len()) && (1..=100).contains(&approval_percent),
                "Invalid review quorum"
            );
            assert!(
                (required_reviewer as usize) < reviewers.len(),
                "Required reviewer missing"
            );
            valid_key(&creator);
            for (i, key) in reviewers.iter().enumerate() {
                valid_key(key);
                assert!(!reviewers[..i].contains(key), "Duplicate reviewer");
            }
            assert!(
                target > 0 && deadline > Consensus::current_epoch(),
                "Invalid goal or deadline"
            );
            valid_key(&payout_key);
            valid_key(&payout_nonce);
            assert_eq!(
                fee_reserve.resource_address(),
                TARI_TOKEN,
                "Native TARI fee reserve required"
            );
            assert!(
                fee_reserve.amount() >= Amount::from(ACTION_FEE * MAX_PLEDGES as u64),
                "Insufficient action fee reserve"
            );
            let count = reviewers.len();
            let fees = Vault::from_bucket(fee_reserve);
            let payout_receipt = save_receipt(&fees, payout_receipt);
            Component::new(Self {
                agreement_id,
                milestone_id,
                creator,
                payout_key,
                payout_nonce,
                reviewers,
                approval_percent,
                required_reviewer,
                target,
                deadline,
                total: 0,
                submission_hash: String::new(),
                votes: vec![false; count],
                principal: Vault::new_empty(TARI_TOKEN),
                fees,
                refund_keys: vec![],
                refund_nonces: vec![],
                contributions: vec![],
                refunded: vec![],
                paid: false,
                receipt_commitments: vec![],
                payout_receipt,
            })
            .with_owner_rule(OwnerRule::None)
            .with_access_rules(AccessRules::allow_all())
            .create()
        }

        /// Sapient's private-fee redemption supplies the bucket. There is no
        /// donor account/address argument, identity proof, or privileged operator.
        pub fn fund(
            &mut self,
            payment: Bucket,
            expected_total: u64,
            refund_key: RistrettoPublicKeyBytes,
            refund_nonce: RistrettoPublicKeyBytes,
            receipt: StealthTransferStatement,
        ) -> u32 {
            self.assert_open();
            assert!(
                !self.paid && self.refund_keys.len() < MAX_PLEDGES,
                "Escrow closed or pledge limit reached"
            );
            assert_eq!(
                expected_total, self.total,
                "Funding changed; refresh remaining capacity"
            );
            assert_eq!(
                payment.resource_address(),
                TARI_TOKEN,
                "Only native TARI accepted"
            );
            let amount = payment.amount();
            assert!(
                amount.is_positive() && amount <= Amount::from(self.target - self.total),
                "Funding exceeds remaining capacity"
            );
            let value = amount.to_u64_checked().expect("Invalid contribution");
            valid_key(&refund_key);
            valid_key(&refund_nonce);
            assert!(
                !self.refund_keys.contains(&refund_key)
                    && !self.refund_nonces.contains(&refund_nonce),
                "Duplicate refund binding"
            );
            assert!(
                refund_key != self.payout_key && refund_nonce != self.payout_nonce,
                "Refund must differ from payout"
            );
            let receipt_commitment = save_receipt(&self.fees, receipt);
            self.principal.deposit(payment);
            self.total += value;
            let index = self.refund_keys.len() as u32;
            self.refund_keys.push(refund_key);
            self.refund_nonces.push(refund_nonce);
            self.contributions.push(value);
            self.refunded.push(false);
            self.receipt_commitments.push(receipt_commitment);
            self.assert_balance();
            index
        }
        pub fn submit_work(&mut self, hash: String) {
            CallerContext::get_signer_proof_for_public_key(self.creator).drop();
            self.assert_open();
            assert!(
                !self.paid && valid_hash(&hash) && !self.votes.iter().any(|v| *v),
                "Invalid work or voting started"
            );
            self.submission_hash = hash;
        }
        pub fn approve(&mut self, index: u32, hash: String) {
            self.assert_open();
            let i = index as usize;
            assert!(i < self.reviewers.len(), "Unknown reviewer");
            CallerContext::get_signer_proof_for_public_key(self.reviewers[i]).drop();
            assert!(
                !self.paid && self.total == self.target && !self.submission_hash.is_empty(),
                "Funding and work must be complete"
            );
            assert_eq!(hash, self.submission_hash, "Different work");
            assert!(
                !self.votes[i] && !self.is_approved(),
                "Vote already recorded or quorum complete"
            );
            self.votes[i] = true;
        }

        /// Fixed private recipient. A return-receipt signature authorizes fresh
        /// ciphertext; it cannot redirect the output to a different spend key.
        /// The organizer's separate fee vault pays directly.
        /// Put this call in fee instructions so action + fee commit together.
        pub fn claim(&mut self, transfer: StealthTransferStatement, signature: SignaturePayload) {
            self.assert_open();
            assert!(
                !self.paid && self.total == self.target && self.is_approved(),
                "Payout not authorized"
            );
            validate_transfer(&transfer, self.payout_key, self.payout_nonce, self.target);
            verify_return(&transfer, self.payout_nonce, 0, 0, &signature);
            let bucket = self.principal.withdraw(Amount::from(self.target));
            assert!(
                ResourceManager::get(TARI_TOKEN)
                    .stealth_transfer_with_opt_input_bucket(transfer, Some(bucket))
                    .is_none(),
                "Unexpected revealed return"
            );
            self.total = 0;
            self.paid = true;
            self.assert_balance();
            self.fees.pay_fee(Amount::from(ACTION_FEE));
        }
        pub fn refund(
            &mut self,
            index: u32,
            transfer: StealthTransferStatement,
            signature: SignaturePayload,
        ) {
            assert!(
                Consensus::current_epoch() >= self.deadline && !self.paid,
                "Refund not eligible"
            );
            let i = index as usize;
            assert!(
                i < self.contributions.len() && !self.refunded[i],
                "Unknown or refunded pledge"
            );
            let value = self.contributions[i];
            validate_transfer(&transfer, self.refund_keys[i], self.refund_nonces[i], value);
            verify_return(&transfer, self.refund_nonces[i], 1, index, &signature);
            let bucket = self.principal.withdraw(Amount::from(value));
            assert!(
                ResourceManager::get(TARI_TOKEN)
                    .stealth_transfer_with_opt_input_bucket(transfer, Some(bucket))
                    .is_none(),
                "Unexpected revealed return"
            );
            self.refunded[i] = true;
            self.total -= value;
            self.assert_balance();
            self.fees.pay_fee(Amount::from(ACTION_FEE));
        }
        pub fn withdraw_unused_fees(&mut self) -> Bucket {
            CallerContext::get_signer_proof_for_public_key(self.creator).drop();
            assert!(
                self.paid || (Consensus::current_epoch() >= self.deadline && self.total == 0),
                "Unresolved principal"
            );
            self.fees.withdraw_all()
        }
        pub fn funding_status(&self) -> (u64, u64, u64, bool) {
            (
                self.target,
                self.total,
                if self.paid
                    || Consensus::current_epoch() >= self.deadline
                    || self.contributions.len() >= MAX_PLEDGES
                {
                    0
                } else {
                    self.target - self.total
                },
                !self.paid && self.total == self.target,
            )
        }
        pub fn approvals_count(&self) -> u32 {
            self.votes.iter().filter(|v| **v).count() as u32
        }
        pub fn required_approvals(&self) -> u32 {
            (self.reviewers.len() as u32 * self.approval_percent as u32 + 99) / 100
        }
        pub fn is_approved(&self) -> bool {
            self.approvals_count() >= self.required_approvals()
                && self.votes[self.required_reviewer as usize]
        }
        pub fn is_paid(&self) -> bool {
            self.paid
        }
        pub fn votes(&self) -> Vec<bool> {
            self.votes.clone()
        }
        pub fn submission(&self) -> String {
            self.submission_hash.clone()
        }
        pub fn action_fee(&self) -> u64 {
            ACTION_FEE
        }
        fn assert_open(&self) {
            assert!(
                Consensus::current_epoch() < self.deadline,
                "Deadline passed"
            );
        }
        fn assert_balance(&self) {
            assert_eq!(
                self.principal.balance(),
                Amount::from(self.total),
                "Escrow balance invariant"
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
    fn save_receipt(fees: &Vault, receipt: StealthTransferStatement) -> PedersenCommitmentBytes {
        assert!(
            receipt.inputs_statement.inputs.is_empty()
                && receipt.revealed_input_amount() == Amount::from(1u64),
            "Receipt uses one micro-TARI round trip only"
        );
        assert_eq!(
            receipt.outputs_statement.outputs.len(),
            1,
            "One encrypted receipt required"
        );
        let output = &receipt.outputs_statement.outputs[0];
        match output.auth {
            SpendAuthorization::Key(key) => valid_key(&key),
            _ => panic!("Key-only receipt required"),
        }
        assert_eq!(
            output.output.minimum_value_promise, 0,
            "Receipt must not promise value"
        );
        assert_eq!(
            receipt
                .outputs_statement
                .revealed_output
                .as_ref()
                .map(|o| o.amount),
            Some(Amount::from(1u64)),
            "Receipt must return the full round-trip amount"
        );
        let commitment = output.output.commitment;
        let bucket = fees.withdraw(Amount::from(1u64));
        let returned = ResourceManager::get(TARI_TOKEN)
            .stealth_transfer_with_opt_input_bucket(receipt, Some(bucket))
            .expect("Receipt round trip required");
        assert_eq!(
            returned.amount(),
            Amount::from(1u64),
            "Receipt changed fee reserve"
        );
        fees.deposit(returned);
        commitment
    }
    fn validate_transfer(
        transfer: &StealthTransferStatement,
        key: RistrettoPublicKeyBytes,
        nonce: RistrettoPublicKeyBytes,
        value: u64,
    ) {
        assert!(
            transfer.inputs_statement.inputs.is_empty()
                && transfer.revealed_input_amount() == Amount::from(value),
            "Return must use escrow principal only"
        );
        assert!(
            transfer.outputs_statement.revealed_output.is_none()
                && transfer.outputs_statement.outputs.len() == 1,
            "One fixed private return required"
        );
        let output = &transfer.outputs_statement.outputs[0];
        assert_eq!(
            output.auth,
            SpendAuthorization::Key(key),
            "Wrong return destination"
        );
        assert_eq!(
            output.output.sender_public_nonce, nonce,
            "Wrong return nonce"
        );
        assert_eq!(
            output.output.minimum_value_promise, 0,
            "Return value promise forbidden"
        );
    }
    fn verify_return(
        transfer: &StealthTransferStatement,
        nonce: RistrettoPublicKeyBytes,
        action: u8,
        index: u32,
        signature: &SignaturePayload,
    ) {
        let message = tari_bor::encode(&(
            CallerContext::current_component_address(),
            action,
            index,
            transfer,
        ))
        .unwrap();
        assert!(
            intrinsics::schnorr_verify_with_domain(
                &PublicKey::from(nonce),
                RETURN_DOMAIN,
                &message,
                signature
            ),
            "Return receipt authorization is invalid"
        );
    }
}
