use tari_template_lib::prelude::{ComponentAddress, RistrettoPublicKeyBytes};
use tari_template_test_tooling::{
    TemplateTest,
    byte_type::ToByteType,
    crypto::RistrettoSecretKey,
    engine_types::virtual_substate::{VirtualSubstate, VirtualSubstateId},
    transaction::args,
};

const WORK: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const OTHER: &str = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

struct Fixture {
    test: TemplateTest,
    component: ComponentAddress,
    reviewers: Vec<RistrettoSecretKey>,
    creator: RistrettoSecretKey,
}

fn fixture(n: u8, percent: u8) -> Fixture {
    let mut test = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["."]);
    test.enable_auto_add_proofs_from_signers();
    let creator = test.secret_key().clone();
    let pairs: Vec<_> = (1..=n).map(|i| test.new_key_pair(i)).collect();
    let keys: Vec<RistrettoPublicKeyBytes> =
        pairs.iter().map(|(_, pk)| pk.to_byte_type()).collect();
    let component = test.call_function(
        "AccordReview",
        "new",
        args![
            "c".repeat(64),
            "delivery",
            test.to_public_key_bytes(),
            keys,
            percent,
            100u64
        ],
        vec![],
    );
    Fixture {
        test,
        component,
        reviewers: pairs.into_iter().map(|(sk, _)| sk).collect(),
        creator,
    }
}

fn submit(f: &mut Fixture) {
    let tx = f
        .test
        .transaction()
        .call_method(f.component, "submit_work", args![WORK])
        .build_and_seal(&f.creator);
    f.test.execute_expect_success(tx, vec![]);
}

fn vote(f: &mut Fixture, index: usize) {
    let tx = f
        .test
        .transaction()
        .call_method(f.component, "approve", args![index as u32, WORK])
        .build_and_seal(&f.reviewers[index]);
    f.test.execute_expect_success(tx, vec![]);
}

#[test]
fn three_of_five_passes_only_at_sixty_percent() {
    let mut f = fixture(5, 60);
    assert_eq!(
        f.test
            .call_method::<u32>(f.component, "required_approvals", args![], vec![]),
        3
    );
    submit(&mut f);
    vote(&mut f, 0);
    vote(&mut f, 1);
    assert!(
        !f.test
            .call_method::<bool>(f.component, "is_approved", args![], vec![])
    );
    vote(&mut f, 2);
    assert!(
        f.test
            .call_method::<bool>(f.component, "is_approved", args![], vec![])
    );
}

#[test]
fn percent_rounds_up_and_unanimity_requires_every_reviewer() {
    let mut f = fixture(3, 67);
    assert_eq!(
        f.test
            .call_method::<u32>(f.component, "required_approvals", args![], vec![]),
        3
    );
    submit(&mut f);
    vote(&mut f, 0);
    vote(&mut f, 1);
    assert!(
        !f.test
            .call_method::<bool>(f.component, "is_approved", args![], vec![])
    );
    vote(&mut f, 2);
    assert!(
        f.test
            .call_method::<bool>(f.component, "is_approved", args![], vec![])
    );
}

#[test]
fn forged_duplicate_and_wrong_delivery_votes_do_not_count() {
    let mut f = fixture(5, 60);
    submit(&mut f);
    vote(&mut f, 0);
    for (index, work, signer) in [
        (0u32, WORK, f.reviewers[0].clone()),
        (1, OTHER, f.reviewers[1].clone()),
        (1, WORK, f.creator.clone()),
        (10, WORK, f.creator.clone()),
    ] {
        let tx = f
            .test
            .transaction()
            .call_method(f.component, "approve", args![index, work])
            .build_and_seal(&signer);
        f.test.execute_expect_failure(tx, vec![]);
    }
    assert_eq!(
        f.test
            .call_method::<u32>(f.component, "approvals_count", args![], vec![]),
        1
    );
    let tx = f
        .test
        .transaction()
        .call_method(f.component, "submit_work", args![OTHER])
        .build_and_seal(&f.creator);
    f.test.execute_expect_failure(tx, vec![]);
    assert_eq!(
        f.test
            .call_method::<String>(f.component, "submission", args![], vec![]),
        WORK
    );
}

#[test]
fn work_and_votes_are_rejected_at_the_deadline() {
    let mut f = fixture(3, 60);
    submit(&mut f);
    f.test.set_virtual_substate(
        VirtualSubstateId::CurrentEpoch,
        VirtualSubstate::CurrentEpoch(100),
    );
    let tx = f
        .test
        .transaction()
        .call_method(f.component, "approve", args![0u32, WORK])
        .build_and_seal(&f.reviewers[0]);
    f.test.execute_expect_failure(tx, vec![]);
    let tx = f
        .test
        .transaction()
        .call_method(f.component, "submit_work", args![OTHER])
        .build_and_seal(&f.creator);
    f.test.execute_expect_failure(tx, vec![]);
    assert_eq!(
        f.test
            .call_method::<u32>(f.component, "approvals_count", args![], vec![]),
        0
    );
}

#[test]
fn rejects_duplicate_reviewers_and_invalid_thresholds() {
    let mut test = TemplateTest::new(env!("CARGO_MANIFEST_DIR"), ["."]);
    let key = test.to_public_key_bytes();
    for (keys, percent) in [
        (vec![key, key], 60u8),
        (vec![key], 0),
        (vec![key], 101),
        (vec![], 60),
    ] {
        let tx = test
            .transaction()
            .call_function(
                test.get_template_address("AccordReview"),
                "new",
                args!["c".repeat(64), "delivery", key, keys, percent, 100u64],
            )
            .build_and_seal(test.secret_key());
        test.execute_expect_failure(tx, vec![]);
    }
}
