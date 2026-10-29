# Esmeralda quorum demonstration

Recorded 30 October 2026. This public authorization component holds **no funds** and implements no campaign deposits, payouts or refunds. Private funding stays disabled. Installed Sapient approval remains awaiting the community reviewer's transaction.

Five immutable reviewers at 60% require **three approvals**. Four reviewers are deployer-operated test wallets, not independent reviewers. The user supplied their public Sapient address for the fifth role. Two test approvals committed; the recorded state is `[true, true, false, false, false]`. This is a checkpoint, not a live count.

## Try it

1. Open Review & approve and choose **Load testnet demo**.
2. Read the public terms, reviewer list and bundled work. Download either file if needed.
3. Connect the designated community reviewer's Sapient wallet on Esmeralda. Its address begins `otl_esm_1vfh5ht7k`, owner key ends `a1f3d902`.
4. Choose **Approve milestone in Sapient**. Inspect `approve(2, work fingerprint)` against the component below. Private fees are required; there is no public-fee fallback.
5. Check acceptance in Sapient. Submission alone does not establish chain commitment. The website's checkpoint does not update automatically.

Approvals must precede chain epoch **14000**. Each reviewer votes once on the same creator-submitted work. The first vote fixes the work; threshold completion is final. Non-voters count toward the denominator. There is no negative vote, vote withdrawal, reviewer replacement, weighting, stage-order or work-quality enforcement.

## Public identifiers

| Item | Value |
| --- | --- |
| Network / walletd | Esmeralda, byte 38 / official 0.47.0 |
| Template | `4548b9ab612ef7a34b839af4a2436ea00046ea645d3f62b22b40b563cb0af756` |
| Component | `component_28f41b4c64ce179866567a144fb6b586abf4c3af17afbbc0b17ac1eedf70258d` |
| Agreement ID | `7722512489d2d16a43e2f45d65a46b16fa22010108ae3e1bceee0817070625ce` |
| Work SHA256 | `dd04f071b7f25419d501875c08305ec6082b5328ee7ad469dddbe525916adccb` |
| Engine-tested WASM SHA256 | `492fe4ab163847e2873ed563cf0821d90481433795c1c0b8e1a811b0d6f9dfee` |
| Source / optimized size | 131783 / 112703 bytes |
| Optimized blob commitment | `f59668bb00b2815633165eaeef0e048aa25b47f7a70431faaa353854f335c4b5` |

The engine-tested artifact used Ubuntu, Rust 1.98.1 and Tari template library 0.35.0. Walletd optimized it during publish. The [published ABI](https://ootle-indexer-a.tari.com/templates/4548b9ab612ef7a34b839af4a2436ea00046ea645d3f62b22b40b563cb0af756) matches the quorum methods. Immutable on-chain IDs, creator, reviewers, threshold and deadline were compared to the normalized agreement before enabling its allowlist entry. Owner rule is `None`.

## Committed receipts

Each link returns the official indexer's decision, execution result and fee receipt.

| Operation | Result | Fee (tTARI) |
| --- | --- | ---: |
| [Publish](https://ootle-indexer-a.tari.com/transactions/e33cafadacb1231ff2b24bdd333b6f21ab8e76ab26398a0cbdbeeaf1fa2c5a84/result) | Commit | 0.882197 |
| [Create component](https://ootle-indexer-a.tari.com/transactions/c71db8d84733372a5b6299485ffe8b6a596a351d277259aefad1e9edda3d74db/result) | Commit | 0.002171 |
| [Submit work](https://ootle-indexer-a.tari.com/transactions/9a6cb0aa660daca38fe2143821bb97f765a99c18718412831a4d28f6d2ed6a35/result) | Commit | 0.002245 |
| [Fund reviewer 1](https://ootle-indexer-a.tari.com/transactions/45cc285ca69da393b635c5fd4653f635809b896c5735b76f9a56f0ce0f0a0f96/result) | Commit; 1 tTARI moved internally | 0.002925 |
| [Fund reviewer 2](https://ootle-indexer-a.tari.com/transactions/87302d299eca3875190f7cc153ddc1ead1569a57db26ec61172cee9f2c0ced8a/result) | Commit; 1 tTARI moved internally | 0.002925 |
| [Reviewer 1 approval](https://ootle-indexer-a.tari.com/transactions/6837228673ea4e61145aad5f2a2be810d02069d36e5af0d1fb2b3e26f494f523/result) | Commit; 1/3 | 0.002243 |
| [Reviewer 2 approval](https://ootle-indexer-a.tari.com/transactions/8227e3cb93382cb672c1076233de9773fdf6d0b0e814f400a20c5cec4137dba3/result) | Commit; 2/3 | 0.002243 |
| Total fees | Within 10 tTARI budget | **0.896949** |

Deployment and internal test-wallet transfers used revealed funds. They demonstrate authorization, not private funding. Sapient requests enforce private fees but reviewer identity, work hash, timing and transaction relationships remain public.

The publish response timed out. Tari's transaction crate verified the original ID and signatures before the exact same signed envelope was resent through the other official indexer. No second publish transaction was created. One constructor [aborted with zero fees](https://ootle-indexer-a.tari.com/transactions/b2730622d2a65d8eecdf37d84f9b93a715a442d1d0797010ed55d5004f2a98f0/result) because input detection was disabled; the committed constructor above enabled it.

Wallet seeds, tokens and databases remain local ignored files, excluded from Git and Pages.
