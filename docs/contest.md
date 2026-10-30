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
- Deployed and funded: the latest stock-Sapient escrow holds 7/10 tTARI, with the community reviewer mandatory after full funding. The unchanged SDK completed a live deposit and encrypted refund-memo recovery. See the [current receipt ledger](sapient-escrow-testnet.md). Earlier private-output escrows remain separate. No live payout or refund is claimed.
- Document the privacy boundary: what the public ledger, organizer, recipient, wallet and application host can each observe.
- Record validation commands and results. Label simulated, in-process and live-network evidence separately.
- Add a demonstration or screenshots showing Sapient approval and the resulting network receipt.
- Supply the prize-payment address and a public Bluesky or Reddit announcement URL.

Ootle mainnet is scheduled for 11 November 2026; the contest prototype targets Esmeralda testnet. The private escrow is deployed and funded on Esmeralda; this does not establish a mainnet lifecycle. See [official launch announcement](https://tari.com/updates/2026-09-01-update-143) and [official wallet setup](https://ootle.tari.com/guides/setup-a-wallet/).

## Forum submission draft — complete placeholders before posting

**OotleAccord — community funding with deliberate privacy boundaries**

Source (MIT): [Seal-Clubber/ootle-accord](https://github.com/Seal-Clubber/ootle-accord)

Demo: [GitHub Pages](https://seal-clubber.github.io/ootle-accord/#explore). Open **Community accord · Sapient** to see funding, work and memo recovery.

OotleAccord is a new Ootle escrow template and small browser app for community milestone funding. Its v5 agreement fixes the funding cap, deadline, creator, one-time payout key/nonce, reviewer list, approval percentage and mandatory reviewer. The current test holds 7/10 tTARI on Esmeralda, deposited with the unmodified Sapient SDK. Review opens at 10/10 and needs three of five approvals including the community reviewer. Four test reviewers share an operator and are not independent.

Stock Sapient redeems an exact-value private coin into the escrow’s native principal vault, with a separate private fee coin. The contract’s real balance must equal its public counter, and it rejects stale or excessive contributions atomically. Amount/Max, private exact-coin preparation and deposit each have clear controls. Payout and eligible expiry refunds create fixed private outputs; the organizer’s separate fee reserve pays return fees. The contract supports up to 16 contributions.

**Privacy tradeoff:** contribution amounts and the remaining counter are public. The deposit omits the donor base account/key and uses one-time signers. Transaction history, timing, fees, creator/reviewer identities and the public test bootstrap remain observable and may link activity. This is not evidence of donor anonymity. Return metadata is stored in encrypted zero-value Sapient memos, with fresh-ledger recovery verified against the real 7 tTARI refund binding. Explicit private view permission lets this tab read coin amounts/memos; wallet spending secrets stay in Sapient. There is no donor roster, analytics or remote font service. Public state refresh uses a pinned indexer whose verification the browser trusts.

**Sapient integration:** stock private-fee redemption, private self-transfer preparation when necessary, encrypted memo lookup, reviewer identity, allowlisted work/approval calls, Esmeralda/capability checks and resumable requests. There is no app funding wallet or Sapient fork. The current network evidence uses the unchanged SDK; the installed Chrome-extension approval still needs to be demonstrated. Create saves public agreement terms and does not deploy new escrows.

**Evidence:** [committed stock-Sapient funding and memo recovery](sapient-escrow-testnet.md), [verification ledger](verification.md), browser/WASM and provider regression tests, three new native lifecycle tests also run against the exact published artifact, and a separate encrypted memo engine test. Earlier escrow/quorum tests remain. No live payout, live refund, installed-extension round trip or independent audit is claimed.

It is an original implementation inspired by the community-funding problem explored by Threshold. October work includes canonical agreements, exact native-TARI amounts, wallet-address decoding, the review/escrow templates, private proof client, recovery helpers, resumable Sapient adapter and the dark app. No Threshold source was copied.

**Development disclosure:** developed with AI coding assistance under the submitter's direction. Testnet results and privacy limits are documented; experimental software, not an independently audited production service.

Tari prize-payment address: **[MAINNET_TARI_XTM_PRIZE_ADDRESS]**

Bluesky or Reddit announcement: **[PUBLIC_ANNOUNCEMENT_URL]**

Only the account owner should publish the announcement and submit this entry. Nothing has been submitted externally by preparing this file.
