# Wallet-review update

The new v2 flow passed 40 JavaScript tests with one Windows symlink-permission skip. A reviewer address was decoded against an independent Rust Bech32m vector. Tests cover mismatched signer keys, legacy/v2 format separation, account changes and the unverified-deployment request guard. The release WASM build passed with Rust 1.97.1 and Tari template library 0.35.0.

This approval component holds no funds. Engine authorization tests, verified deployment, installed-extension approval and private escrow integration are still outstanding. No live approval or escrow lifecycle is claimed.

The ledger below records the earlier v1 prototype and is historical.

# Verification ledger

Recorded 29 October 2026. This ledger distinguishes implemented application behavior from network evidence.

| Check | Result |
| --- | --- |
| `node --test` | 35 passed, 1 skipped, 0 failed. The skipped case needs Windows permission to create a file symlink; traversal and other server tests passed. |
| `node scripts/check.mjs` | JavaScript syntax and 13 page references passed. |
| `node scripts/build.mjs` | Static build passed; generated output contains application assets and documentation. |
| Local browser sandbox | Pledges remain local; early refund is rejected, expiry enables unpaid refund, reset clears the simulation. |
| Local reviewer tools | Secret/hashlock generation and explicit clearing worked. |
| Agreement designer | Synthetic public agreement exported with its deterministic agreement ID. |
| Encrypted recovery import | Synthetic backup decrypted locally, displayed its exact 12.345678 TARI amount, and cleared when locked. |
| Wallet discovery | Missing-extension path checked. Connection never requests private balance access. |
| Responsive layout | Checked at 390px and 1440px widths; no page-wide horizontal overflow. Mobile navigation uses a two-column layout. |
| Browser console | No errors or warnings reported during the checked flows. |
| Stock Sapient funding guard | Tests establish that no funding request is created, even if the wallet reports native HTLC support. |

Wallet tests use a mock provider. Synthetic browser fixtures are local and ignored by Git. They contain no real wallet information, usable outputs or funded balances.

## Outstanding evidence

- An installed Sapient extension round trip, including recovery after page reload and account changes.
- A wallet release that exposes verified private-source HTLC funding; the inspected stock provider does not.
- Fresh Esmeralda funding, claim and refund transactions, with chain acceptance and privacy verified from actual receipts.
- Cryptographic validation that a funded output's conditions implement the full public agreement. Current recovery import validates structure and agreement identity only; the wallet enforces the actual native conditions.
- Independent security review.

No template is published or deployed by this repository. No local check is evidence of a completed live payment or refund.
