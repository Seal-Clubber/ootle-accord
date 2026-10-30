# Second community accord — 7/10 tTARI

> Earlier immutable v4 test. Use the [latest stock-Sapient accord](sapient-escrow-testnet.md) for direct funding and encrypted memo recovery.

The second accord holds **7 tTARI against a 10 tTARI target**, leaving **3 tTARI**. This is a committed private-output Esmeralda escrow, not a local simulation. The first funded accord remains separate in the app.

Recorded at epoch **12737**, component version **2**. The creator's work fingerprint is submitted. No reviewer votes are recorded. **Approval opens only after 10/10 funding.** Payout then requires three of five reviewers, including the required community reviewer, followed by the creator's separate claim. Four reviewers are operated by the deployer and are not independent people. No payout has been made.

| Item | Value |
| --- | --- |
| Component | `component_5d2639cc01fdb9524a64da98b85bb8fd04a6c4979d0a8f6861aff3a3b8a7e3fc` |
| Reused escrow template | `5d035ef964e51458ccfd8e654781715cdd6725a1b72ac1ac0b546682169c2d45` |
| Agreement ID | `ddc24346d81fb625d1de38708725717edce8d66b6d783f92ba5d5ec599ba7872` |
| Work SHA256 | `f1f0177484583a1c5be3d84b41eba4fe7900ccd3a524850e79a4481e65fae3bf` |
| Review/refund deadline | Epoch 14000 |

## Committed receipts

| Step | Receipt |
| --- | --- |
| Create immutable escrow | [e26aba7f…](https://ootle-indexer-a.tari.com/transactions/e26aba7fe101587dbcbaf1a9783aadd81435914f94174d19982b8d180d41e762/result) |
| Public shielding bootstrap | [11b98bba…](https://ootle-indexer-a.tari.com/transactions/11b98bbae855b0eeb432df21772a5dded7168d1329f3a0f23c1c0546548d3874/result) |
| Private-input 7 tTARI funding | [76fc0597…](https://ootle-indexer-a.tari.com/transactions/76fc0597fb3ee175a065a80d16ae60477524fd55dda5ac71862c5f8c63708629/result) |
| Creator work submission | [e079c382…](https://ootle-indexer-a.tari.com/transactions/e079c3821cabd9bd5c91ff64ec141e7c53e6f1bf99d799a885bdcd3982f928d8/result) |

Each finalized with Commit. The native private funding was successfully dry-run before its exact signed envelope was journaled and submitted. Its counter, 10 tTARI cap, private script authority, required reviewer, empty votes and unpaid status were checked against committed state. The [live component](https://ootle-indexer-a.tari.com/substates/component_5d2639cc01fdb9524a64da98b85bb8fd04a6c4979d0a8f6861aff3a3b8a7e3fc) may change after this checkpoint; use Refresh balance for current status.

The setup shielded 8 tTARI from the existing isolated test wallet: 7 for funding and 1 for private fees. The donation spent 7 into the script-only escrow and paid 0.1 tTARI from a separate private input, leaving 0.9 private fee change owned by the local test client. Creation, shielding, funding and work cost **0.123898 tTARI** in total; the 7 tTARI principal is separate. The 10 tTARI first escrow was not used to fund this one.

The privacy boundary is unchanged: encrypted native output amounts/masks and one-time spending/signing keys, but an exact public aggregate that exposes donation sizes by subtraction. The public bootstrap, transaction links, timing, fees and creator/reviewer roles remain observable. Recovery material stays only in ignored local storage. Read [the escrow privacy model and qualification](private-escrow-testnet.md).

The app shows both accords with independent balances, Max values, work and contract selection. The second Max is 3 tTARI. Private funding through the current Sapient provider remains disabled; this test used the native client. No vote is accepted while the second accord remains partially funded, even from the required reviewer. After full funding, that reviewer's approval is still mandatory. The on-chain cap prevents overfunding even if a displayed remaining quote is stale.
