# Current Esmeralda deployment

Verified 7 November 2026 against the running **Ootle 0.49.1** indexer. This is a fresh deployment after the Esmeralda resets; earlier accord receipts are historical records. The application uses stock Sapient and does not require a custom wallet build.

## Accord

- Goal: **10 testnet TARI**, initially **0 funded / 10 remaining**.
- Review opens only after full funding. **Three of five approvals** are required, including the mandatory community reviewer whose public key ends `a1f3d902`.
- Four reviewers are operated by the same test operator. They are not independent people, and none has voted.
- Payout is private and fixed to the isolated deployment wallet. Eligible unpaid contributions become refundable at epoch **14920**.
- The separate **1.6 TARI** return-fee reserve is held outside campaign principal.
- Owner rule is `None` and upgrade rule is `Locked`. Terms and payout destinations cannot be replaced by an administrator.

| Item | Identifier |
| --- | --- |
| Agreement | `d85ffba007a467d1fb5281c44ecd7df833ef999f404cbee37e243ee7977c0d80` |
| Template | `f4e2fe6ed85b10079ee72e4e61b08b3789f679c42085af63e9e1b7bb2b986a01` |
| Escrow | `component_dd022cc1e7e96ad8b27b3957e454af1ed4ee1fadaa1e6269f03d1c83b9206003` |
| Principal vault | `vault_dd9155a87d303fa5d7906c7f5bbb04dcaa98f7fefac89fc4043b09f39b3ae883` |
| Fee vault | `vault_dd0221e145796133563832baba5c859085ef8759cb175f523a1eb2435e01a53c` |
| Work fingerprint | `179b9799f39c063bfbd19c832577a5e6ff37932aa52df9142ac664838fae57ab` |
| Checkpoint | Component version **1**, epoch **12920**, no contributions or approvals |

## Receipts and accounting

Each operation passed a dry run before broadcast. Each listed receipt has a consensus `Commit` **and an accepted main state transition**, rather than a fee-only commit.

| Operation | Receipt | Fee (TARI) |
| --- | --- | ---: |
| Publish template | [3c70f97d…](https://ootle-indexer-a.tari.com/transactions/3c70f97d7b03c54de53a380d142b9c5b910bc9d1a9c6643dfeb3139a6cc1328b/result) | 3.627639 |
| Create escrow and reserve | [3b4fffae…](https://ootle-indexer-a.tari.com/transactions/3b4fffae90d1354a077adde5f625148ac9621f87474018410677b074e6b09ca6/result) | 0.016033 |
| Register submitted work | [592d40b9…](https://ootle-indexer-a.tari.com/transactions/592d40b9a950c53f8b639ab04685b693d9b49fb586c2da8f956ebf9dcd0e8520/result) | 0.003225 |
| **Total paid fees** | | **3.646897** |

Of the 10 TARI deployment payment, **1.6 TARI** is separately reserved in the escrow and **4.753103 TARI** remains in the isolated deployment wallet. None of that payment has been counted as campaign funding. Deployment fees used revealed testnet funds; contributor funding uses the separate stock-Sapient private flow.

## Privacy and verification

Contribution amounts and the exact remaining total are public. Deposits use one-time signing keys and omit the donor's base wallet address. Transaction history, preparation and timing can still link activity; this is not an anonymity claim. Reviewer identities and votes are public. Refund and payout memos are encrypted to their recipient wallets.

The browser helper now follows the current private-output derivation using the recipient's public view key. Return signatures are bound to the network, component, action, contribution index and transfer statement. Current indexer responses are base64 CBOR; the app decodes them with pinned Ootle types and rejects trailing bytes while preserving the indexer's verification flag.

The template uses `tari_template_lib` **0.37.0** and current-network dependencies. All **16 native lifecycle tests** passed, covering quorum, private custody, caps, stale funding, recovery, fixed private payouts and expiry refunds. The **exact optimized 254,501-byte publication artifact** also passed all three stock-wallet lifecycle tests. See its [manifest](../artifacts/esmeralda/current/manifest.json).

The app's chain-reading code was checked against the live component. This deployment has not yet received a contribution or an installed-extension approval. Earlier live funding and payout evidence is preserved in [the historical deployment record](sapient-escrow-testnet.md). The current browser still relies on the indexer's verified response rather than independently validating consensus proofs.

Ootle 0.50 requires another template build when the network adopts it. This deployment intentionally targets the currently running 0.49 network, as selected by the project owner. The future-release preparation remains local and is not presented as a deployed escrow.
