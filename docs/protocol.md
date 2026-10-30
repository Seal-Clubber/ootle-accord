> **Historical HTLC reference.** The current funded v4 template uses private native outputs, a public exact aggregate and mandatory quorum review. See [current escrow design, limits and committed receipts](private-escrow-testnet.md). The older secret-based behavior below applies only to previous handoffs and recovery files.

# OotleAccord protocol

OotleAccord is an original community-funding protocol prototype built around one native Tari HTLC for each donor's pledge to each milestone. It does not deploy a custom Rust template. An agreement describes the project, creator, reviewer, milestones and deadlines; the native output enforces only the particular pledge's claim/refund conditions.

## Current implementation boundary

**New funding is disabled with the stock Sapient extension.** The inspected SDK supports spending stealth inputs, but Sapient's dApp HTLC method does not forward that option and defaults to withdrawing a public balance. OotleAccord refuses that route because it would disclose the contribution amount and funding account. Connecting a wallet, preparing agreements, generating reviewer hashlocks and protecting recovery data remain useful without sending a funding transaction. Existing compatible HTLCs can be imported for explicit claim/refund actions; those actions still require a supporting wallet and network validation. See [Sapient integration](sapient.md).

No live funding, payout or refund is claimed by this repository merely because the browser workflow or local tests run.

## Roles and agreement

- The **creator** controls the claimant wallet and performs the work.
- A **reviewer**, independent of the creator, decides whether the work and any agreed funding conditions justify releasing a milestone secret.
- Each **donor** controls its funding/refund wallet and retains the recovery material for its own pledge.

Each milestone has exactly one reviewer-held secret and its SHA-256 hash. A multi-reviewer policy is a human arrangement outside this protocol. There is no on-chain voting threshold.

The reviewer must generate a fresh, unpredictable 32-byte secret independently for every milestone and campaign. The reviewer shares only its hash for agreement preparation and keeps the secret away from the creator until approval. A hash supplied by the creator does not establish independent review: the creator could already know its preimage. Authenticate the reviewer and hash through a channel the parties trust; an agreement file alone does not prove who generated a secret.

Changing an agreement creates different proposed terms; it cannot change an already funded output. Human-readable milestone descriptions are not interpreted by the Ootle engine.

## Native pledge conditions

The intended output has two alternative branches:

| Branch | All required conditions |
| --- | --- |
| Creator claims | Correct SHA-256 preimage; current epoch **less than** the refund epoch; signature by the claimant key |
| Donor refunds | Current epoch **greater than or equal to** the refund epoch; signature by the funder's refund key |

The secret is 32 raw bytes represented as 64 hexadecimal characters. Hash those bytes with SHA-256; hashing the text of their hexadecimal representation produces a different lock. Epochs are network consensus values, not local clock times. An estimated calendar deadline is not an execution guarantee.

These boundaries follow the engine's `BeforeEpoch` / `AfterEpoch` definitions and the SDK's standard HTLC tree. The full condition tree must match its on-chain root; altering the leaves makes the original output unspendable through that altered tree. [Engine predicates](https://github.com/tari-project/tari-ootle/blob/v0.47.0/crates/template_lib_types/src/stealth/unspent_output.rs), [SDK HTLC construction](https://github.com/chironbuilds/ootle-sdk-ts/blob/52e04247300a0d2ef6d8f825709976d15276b4b4/src/htlc.ts)

## Intended lifecycle

1. The parties review the agreement, claimant address, resource, milestone hash and refund epoch. The reviewer retains its secret separately.
2. A donor would fund a separate conditional output for each milestone. This step is currently blocked until a verified Sapient integration exposes stealth-source funding explicitly.
3. The donor retains the complete refund backup. A private claim handoff gives the creator the exact condition tree, resource, commitment, transaction reference and agreed pledge context, without the donor's `outputMask`.
4. The creator verifies that the actual output matches the handoff and agreed terms. The reviewer checks work, funding sufficiency and stage readiness through the parties' chosen process. This application has no independent aggregate-funding proof.
5. On approval, the reviewer gives the secret to the creator. The creator claims each unspent pledge before its own refund epoch. A successful claim reveals the secret to the network.
6. At or after the refund epoch, the donor may refund any still-unspent pledge using the funding account, exact condition tree, amount and output mask. No reviewer or creator permission is required by that branch.

After the first claim publishes a milestone secret, it can unlock every compatible pledge using that hash. Never reuse that secret for another milestone, and never add new pledges to an already released hashlock. Disclosure cannot be revoked. A leaked secret lets the designated creator claim early; knowing the secret alone does not satisfy the creator's signing-key condition.

## What the native output does not enforce

The ledger does not know the campaign's target, matching promise, stage order, quality standard, reviewer identity or quorum. The creator can claim whenever it has the secret before expiry, including if a reviewer releases it prematurely. Reviewer dishonesty, collusion or a compromised secret defeats the review policy. A reviewer who refuses to release leaves the donor's time-delayed refund path; it does not guarantee that the creator gets paid for completed work.

Separate pledges and milestones settle separately. A creator might claim some pledges and miss others before expiry. There is no atomic campaign-wide activation, all-or-nothing goal, sponsor matching, proportional recovery of prior payments or reversal of a completed claim. Funds are not automatically returned when the deadline arrives: the donor must submit an eligible refund and pay the required fee.

## Submission and recovery

A wallet request identifier is not a payment. A wallet's `submitted` status is also not an independent proof of ledger commitment. Preserve the same request and transaction references when a result is ambiguous, reconcile the original transaction, and never create another pledge merely because a page timed out. See [request handling](sapient.md).

The refund branch additionally requires the original funding account's keys, network access, a spendable unspent output and fee funds. Its backup needs the exact amount, `outputMask` and complete conditions. A wallet seed alone cannot reconstruct an output mask encrypted to the creator. Current SDK journaling may retain recovery information in the wallet, but an application backup must not assume every installed wallet version has that behavior. [SDK funding, verification and recovery](https://github.com/chironbuilds/ootle-sdk-ts/blob/52e04247300a0d2ef6d8f825709976d15276b4b4/src/wallet.ts)
