# Private escrow test — Esmeralda

> Earlier immutable v4 test. The [latest v5 escrow supports stock Sapient deposits and encrypted refund memos](sapient-escrow-testnet.md). Restrictions below apply to this earlier component.

Recorded 30 October 2026 at epoch **12721**, component version **4**.

**10 / 10 tTARI funded, 0 remaining. Two of three approvals recorded. The community reviewer has not approved; payout has not happened.**

The contract requires both a 60% quorum of five reviewers and reviewer index 2, the community reviewer's immutable signing key. Four other reviewers are deployer-operated test wallets, not independent people. Adding more test-wallet votes cannot bypass the required reviewer. The creator can release funds only before epoch 14000, after the required approval, to the precommitted one-time payout key belonging to the isolated test wallet. An approval authorizes a later payout; it does not itself make that payment.

| Item | Value |
| --- | --- |
| Template | `5d035ef964e51458ccfd8e654781715cdd6725a1b72ac1ac0b546682169c2d45` |
| Component | `component_48e138e99add1ab06cfae8d09310cf320b143b6f08d9800c0b8f743965d81450` |
| Agreement ID | `11f52c1579d7c7c2a882cbe6012e56864783fd480154fb9db518e537a2096555` |
| Work SHA256 | `26a59392d78c0d51fc3866e5c04920ebd2703182df1b8747d02ff869c8869ecd` |
| Payout one-time key | `1e82be4cc00cc4834317aa6825155bff4efbfeb30583fbf16a7d953c6b103902` |
| Escrow condition root | `1874baa5e609f26b08067020316a21e8fb37e9f27205fd2483764b121c7ca5e8` |

## Committed receipts

These links return public indexer receipts. Each recorded transaction finalized with `Commit`.

| Transaction | Receipt |
| --- | --- |
| Publish escrow template | [1f2c5a8e…](https://ootle-indexer-a.tari.com/transactions/1f2c5a8edcd317e621f9d497a1024f66811377cb35a73d31fee3b1959d6c8822/result) |
| Create immutable escrow | [bc2dc77c…](https://ootle-indexer-a.tari.com/transactions/bc2dc77caef347476bde1a3ed464228b4a76d4e2a7c6149fd548f7b62e7338ae/result) |
| Public test-wallet shielding bootstrap | [e32d959e…](https://ootle-indexer-a.tari.com/transactions/e32d959e68bdad7d5a58eb79c20f17ceb7f7371c83e8223f3ff72b0a6b716d8d/result) |
| Private-input 10 tTARI funding | [1953c89f…](https://ootle-indexer-a.tari.com/transactions/1953c89fea5494165d4cd27c628a2d9907f80c24db50ed7ba09acc0ba87aff74/result) |
| Submit work fingerprint | [003817bb…](https://ootle-indexer-a.tari.com/transactions/003817bbe83d99687bc453bf58f65e99fa361e859c160b5be00b46e35cef9807/result) |
| Test reviewer 1 approval | [d95636cc…](https://ootle-indexer-a.tari.com/transactions/d95636cc990a8a6846b6108a39da853c7fe377c02d9f2ac23c041507e0bb4fc8/result) |
| Test reviewer 2 approval | [8374b8c6…](https://ootle-indexer-a.tari.com/transactions/8374b8c64a0976a53c98c550a68ef20626ea1b3f63368b935d976d53432ed040/result) |

The [current public component](https://ootle-indexer-a.tari.com/substates/component_48e138e99add1ab06cfae8d09310cf320b143b6f08d9800c0b8f743965d81450) can change after this checkpoint. Refresh balance in the app to request current state. The app checks the expected template and all immutable funding/reviewer/payout terms, and rejects an unverified or older-than-recorded response. It relies on the selected indexer's verification; the browser does not independently validate consensus proofs. No background polling or wallet balance access is used.

## What stays private

The donation spends native stealth outputs and pays its fees from a separate private output. Its sealer and additional signer are fresh one-time spending keys. The donor's base account component and base owner key do not appear in that transaction. The escrow output has script-only authorization, an encrypted amount/mask payload, a range proof and minimum-value promise zero. It has no donor key-path escape. Native balance proofs ensure the payment is real; the contract's additional Schnorr opening proof binds the first output's value to the exact public counter increase, agreement, component and refund destination.

**Donation amounts can be inferred by subtracting public totals.** This is the accepted tradeoff for an exact remaining counter and Max option. Transaction graph, timing, fee amounts, public creator/reviewer identities and the initial shielding step remain visible. This particular test deliberately documents the funding trail; it is not evidence of donor anonymity. The public bootstrap moved 11 tTARI into a 10 tTARI funding output and a 1 tTARI private fee output. Funding consumed the former and used 0.1 tTARI in fees, leaving 0.9 tTARI private fee change owned by the isolated local client.

The contract holds an internal authority badge, not a revealed TARI balance. Its public total represents the real unspent escrow-controlled stealth commitments. It rejects amounts above remaining capacity atomically; simultaneous donations cannot overfill it. A stale Max quote can be rejected and must be refreshed. Each component supports at most 64 pledges. Max means campaign capacity; it does not subtract wallet fees or promise affordability.

After the deadline, an unpaid pledge can be refunded only to its immutable one-time refund key, with a proof of the amount removed from the public total. Donors must retain private recovery data; a seed alone does not recover this custom script-output workflow. The demonstration's recovery material remains only in ignored local storage. No live refund or payout is claimed here.

## Application and wallet limits

Sapient can sign the required review vote using the allowlisted `approve(index, work_hash)` call with private fees enforced. The installed-extension approval still needs to be performed by the community reviewer. The browser does not hold or export their seed.

The native private client performed this funding transaction. **General private escrow donations through Sapient remain disabled:** its inspected stock HTLC request does not expose this custom proof/escrow flow. The app does not fall back to revealed donations. Create currently saves v3 public review terms; it does not publish new escrows. The native client is a reproducible fixed 10 tTARI test utility, not a general-purpose wallet.

## Validation and fees

Six real Tari-engine escrow tests cover private totals/caps, inflated opening claims, invalid native balance proofs, replayed pledges, mandatory reviewer gating, payout and refund destination binding, external spending, expiry and double refunds. An additional engine test uses real encrypted wallet-crypto outputs, private fee inputs and one-time signers through funding and payout. Live funding was also dry-run successfully, then its exact signed transaction was journaled before submission and its committed output authority/counter checked.

The new publication, constructor, shield, private funding, work and two test approvals cost **4.393679 tTARI** in total. Including the earlier review-template work, cumulative test fees are **5.290628 tTARI**, within the previously stated 10 tTARI fee/testing budget. The 10 tTARI escrow principal is separate and remains locked awaiting the required vote. Experimental testnet code; independent security review remains outstanding.
