//! Original OotleAccord reviewer authorization component. It holds no funds.
//! A future escrow must verify this gate's template and immutable terms before trusting it.
use tari_template_lib::prelude::*;

#[template]
mod accord_review {
    use super::*;

    pub struct AccordReview {
        agreement_id: String,
        milestone_id: String,
        reviewer: RistrettoPublicKeyBytes,
        refund_epoch: u64,
        approved: bool,
    }

    impl AccordReview {
        pub fn new(
            agreement_id: String,
            milestone_id: String,
            reviewer: RistrettoPublicKeyBytes,
            refund_epoch: u64,
        ) -> Component<Self> {
            assert!(
                agreement_id.len() == 64 && agreement_id.bytes().all(|b| b.is_ascii_hexdigit()),
                "Invalid agreement ID"
            );
            assert!(
                !milestone_id.is_empty() && milestone_id.len() <= 40,
                "Invalid milestone ID"
            );
            assert!(
                refund_epoch > Consensus::current_epoch(),
                "Review deadline must be in the future"
            );
            Component::new(Self {
                agreement_id,
                milestone_id,
                reviewer,
                refund_epoch,
                approved: false,
            })
            .with_owner_rule(OwnerRule::None)
            .with_access_rules(AccessRules::allow_all())
            .create()
        }

        /// The wallet signs the transaction. A browser flag or ownership challenge cannot approve.
        pub fn approve(&mut self) {
            CallerContext::get_signer_proof_for_public_key(self.reviewer).drop();
            assert!(
                Consensus::current_epoch() < self.refund_epoch,
                "Review deadline has passed"
            );
            assert!(!self.approved, "Milestone is already approved");
            self.approved = true;
        }

        pub fn terms(&self) -> (String, String, RistrettoPublicKeyBytes, u64) {
            (
                self.agreement_id.clone(),
                self.milestone_id.clone(),
                self.reviewer,
                self.refund_epoch,
            )
        }

        pub fn is_approved(&self) -> bool {
            self.approved
        }
    }
}
