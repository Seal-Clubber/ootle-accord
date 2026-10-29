//! OotleAccord percentage-quorum authorization. This component holds no funds.
use tari_template_lib::prelude::*;

#[template]
mod accord_review {
    use super::*;
    pub struct AccordReview {
        agreement_id: String,
        milestone_id: String,
        creator: RistrettoPublicKeyBytes,
        reviewers: Vec<RistrettoPublicKeyBytes>,
        approval_percent: u8,
        refund_epoch: u64,
        submission_hash: String,
        votes: Vec<bool>,
    }
    impl AccordReview {
        pub fn new(
            agreement_id: String,
            milestone_id: String,
            creator: RistrettoPublicKeyBytes,
            reviewers: Vec<RistrettoPublicKeyBytes>,
            approval_percent: u8,
            refund_epoch: u64,
        ) -> Component<Self> {
            assert!(valid_hash(&agreement_id), "Invalid agreement ID");
            assert!(
                !milestone_id.is_empty() && milestone_id.len() <= 40,
                "Invalid milestone ID"
            );
            assert!(
                !reviewers.is_empty() && reviewers.len() <= 10,
                "Use one to ten reviewers"
            );
            for (i, key) in reviewers.iter().enumerate() {
                assert!(!reviewers[..i].contains(key), "Duplicate reviewer key");
            }
            assert!(
                (1..=100).contains(&approval_percent),
                "Approval percent must be 1 to 100"
            );
            assert!(
                refund_epoch > Consensus::current_epoch(),
                "Review deadline must be in the future"
            );
            let votes = vec![false; reviewers.len()];
            Component::new(Self {
                agreement_id,
                milestone_id,
                creator,
                reviewers,
                approval_percent,
                refund_epoch,
                submission_hash: String::new(),
                votes,
            })
            .with_owner_rule(OwnerRule::None)
            .with_access_rules(AccessRules::allow_all())
            .create()
        }
        /// The creator fixes the delivery. After the first vote it cannot change.
        pub fn submit_work(&mut self, submission_hash: String) {
            CallerContext::get_signer_proof_for_public_key(self.creator).drop();
            self.assert_open();
            assert!(
                valid_hash(&submission_hash),
                "Use a lowercase SHA256 submission hash"
            );
            assert!(
                !self.votes.iter().any(|v| *v),
                "Work cannot change after voting begins"
            );
            self.submission_hash = submission_hash;
        }
        pub fn approve(&mut self, reviewer_index: u32, submission_hash: String) {
            self.assert_open();
            let index = reviewer_index as usize;
            assert!(index < self.reviewers.len(), "Reviewer index out of range");
            CallerContext::get_signer_proof_for_public_key(self.reviewers[index]).drop();
            assert!(
                !self.submission_hash.is_empty(),
                "Creator must submit work first"
            );
            assert_eq!(
                submission_hash, self.submission_hash,
                "Approval concerns different work"
            );
            assert!(!self.votes[index], "Reviewer already voted");
            assert!(!self.is_approved(), "Approval threshold already reached");
            self.votes[index] = true;
        }
        pub fn terms(
            &self,
        ) -> (
            String,
            String,
            RistrettoPublicKeyBytes,
            Vec<RistrettoPublicKeyBytes>,
            u8,
            u64,
        ) {
            (
                self.agreement_id.clone(),
                self.milestone_id.clone(),
                self.creator,
                self.reviewers.clone(),
                self.approval_percent,
                self.refund_epoch,
            )
        }
        /// All designated reviewers are counted, including those who have not voted.
        pub fn required_approvals(&self) -> u32 {
            ((self.reviewers.len() as u32 * self.approval_percent as u32) + 99) / 100
        }
        pub fn approvals_count(&self) -> u32 {
            self.votes.iter().filter(|v| **v).count() as u32
        }
        pub fn is_approved(&self) -> bool {
            self.approvals_count() >= self.required_approvals()
        }
        pub fn submission(&self) -> String {
            self.submission_hash.clone()
        }
        pub fn votes(&self) -> Vec<bool> {
            self.votes.clone()
        }
        fn assert_open(&self) {
            assert!(
                Consensus::current_epoch() < self.refund_epoch,
                "Review deadline has passed"
            );
        }
    }
    fn valid_hash(value: &str) -> bool {
        value.len() == 64
            && value
                .bytes()
                .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
    }
}
