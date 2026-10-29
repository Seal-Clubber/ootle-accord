# October 2026 contest preparation

OotleAccord is being prepared for Tari's October 2026 privacy showcase. This document is a submission checklist and draft; it is not a submitted entry.

## Verified requirements

- Submit before **1 November 2026 at 00:00 UTC** (**01:00 Europe/Amsterdam**). This date follows the rule that a month's contest closes at the start of the next month in UTC.
- October's theme is **Spooky Secrets**, judged on demonstrations of Tari privacy. The application itself does not need seasonal branding.
- Use a new repository and new code created after the theme announcement on 1 October. The organizer allows newly created contracts or reusable libraries consumed by existing applications.
- Publish the source under an OSI-approved license. Do not borrow code from another submission.
- Council members and Tari Labs employees are ineligible. Agent-assisted development is permitted; code quality may affect judging.
- Post one entry in the official October forum thread, with a public source/app link, description, Tari prize-payment address and announcement on **Bluesky or Reddit**. Edit that post for later updates.

Sources checked 29 October 2026: [official rules and organizer clarification](https://community.tari.com/t/ootle-launch-date-and-launch-contest-rules/323/1), [October announcement and submission thread](https://community.tari.com/t/october-build-contest-thread-spooky-secrets/396).

## Sapient community bonus

A community sponsor offers 100,000 XTM across three places (50,000 / 30,000 / 20,000) to entries demonstrating the Sapient Web Extension. Official winners using the extension qualify first; otherwise the sponsor selects qualifying projects. The October deadline also applies. This is a community bonus, separate from the Council's judging: [bonus announcement](https://community.tari.com/t/spooky-secrets-community-bonus-contest/463).

## Evidence to finish before submitting

- Source repository created: [Seal-Clubber/ootle-accord](https://github.com/Seal-Clubber/ootle-accord).
- Verify the wallet/SDK versions and network, and record receipts for any claimed native HTLC funding, claim and refund flows. The new review template is compiled but has no deployment or engine qualification.
- Document the privacy boundary: what the public ledger, organizer, recipient, wallet and application host can each observe.
- Record validation commands and results. Label simulated, in-process and live-network evidence separately.
- Add a demonstration or screenshots showing Sapient approval and the resulting network receipt.
- Supply the prize-payment address and a public Bluesky or Reddit announcement URL.

Ootle mainnet is scheduled for 11 November 2026; the contest prototype targets Esmeralda testnet. Testnet deployment is an evidence goal here, not a claim that it has happened. See [official launch announcement](https://tari.com/updates/2026-09-01-update-143) and [official wallet setup](https://ootle.tari.com/guides/setup-a-wallet/).

## Forum submission draft — complete placeholders before posting

**OotleAccord — community funding with deliberate privacy boundaries**

Source (MIT): [Seal-Clubber/ootle-accord](https://github.com/Seal-Clubber/ootle-accord)

Demo or demonstration: **[DEMO_URL_OR_RECORDING]**

OotleAccord is a new escrow-protocol library and browser prototype for funding community work under agreed milestone terms. New v3 agreements fix a list of distinct Sapient reviewer keys and an approval percentage per milestone. The original approval template checks a real reviewer transaction-signer proof and a chain deadline. It holds no funds; a 60% quorum demonstration with two committed approvals is deployed on Esmeralda. Legacy secret-based HTLC recovery remains supported separately. Review votes are enforced on-chain for the same submitted work hash; funding targets, work quality and stage order remain human policies.

New funding is currently disabled because stock Sapient's dApp HTLC route reveals the funding amount. The SDK supports stealth-source funding, but the inspected wallet provider does not expose it. The prototype offers wallet-review agreements, Sapient reviewer identity, a guarded approval adapter, and encrypted legacy recovery tools. Approval and private escrow deployment are unfinished. These are implementation boundaries, not evidence of a live-network lifecycle.

It is a new implementation inspired by the community-funding problem explored by Threshold. Original October work includes the canonical agreement library, native-TARI amount validation, reviewer wallet-address decoding, the new authorization template, authenticated encrypted recovery format, resumable Sapient request adapter, and browser application. No Threshold source was copied.

**Privacy demonstrated locally:** recovery records are encrypted with PBKDF2-SHA256 and AES-256-GCM using fresh salts and IVs; creator handoffs omit the refund mask and amount field; public agreement validation rejects unsupported fields; no balance/view grant, analytics, or remote fonts are requested. These local properties do not establish private on-chain funding.

**Sapient integration implemented:** explicit connection, Esmeralda and capability checks, resumable native claim/refund requests with enforced private fees, and a funding guard. Provider behavior is verified with mocks and inspected upstream source. An installed-extension and validator round trip remains unverified.

**Evidence:** see [the verification ledger](verification.md) for local commands and browser checks. Esmeralda is the intended network; there are no live receipts. No template deployment, successful live funding, payment, refund or independent security review is claimed by this draft.

**Boundaries:** native stock-wallet funding reveals its amount and source account, so it is disabled. Claim/refund signers, timing and transaction graphs remain observable. A claim discloses the reviewer secret to the indexer and chain. Work approval, total funding and stage order require human review. Refunds need the original wallet, complete conditions, amount and refund mask, plus fees. No public exact funding total or donor roster is maintained.

**Development disclosure:** This original implementation was developed with AI coding assistance under the submitter's direction. Local protocol, encryption, provider-error and server tests were run, and the authorization template was compiled, and the browser sandbox, export and recovery flows were checked. An independent audit and live-network qualification remain outstanding.

Tari prize-payment address: **[MAINNET_TARI_XTM_PRIZE_ADDRESS]**

Bluesky or Reddit announcement: **[PUBLIC_ANNOUNCEMENT_URL]**

Only the account owner should publish the announcement and submit this entry. Nothing has been submitted externally by preparing this file.
