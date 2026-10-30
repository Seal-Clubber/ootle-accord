# OotleAccord

**Shared goals. Private contributions.**

OotleAccord is an original community-funding prototype for Tari Ootle. Communities prepare a public agreement, split work into reviewed milestones, and keep recovery material private. It is inspired by Threshold's funding idea; this repository contains a fresh implementation for the October 2026 Tari build contest.

**A real 10 tTARI private-output escrow is funded on Esmeralda.** Its recorded checkpoint shows 0 remaining and two test approvals, with the required community vote still outstanding. Refresh in the app for current status. Changes in the exact public total reveal contribution sizes. General private funding through Sapient remains disabled; this test used the native private client. See [private escrow receipts and limits](docs/private-escrow-testnet.md).

A [second accord is privately funded 7/10 tTARI](docs/partial-escrow-testnet.md), with 3 tTARI remaining. Its approval opens only after full funding, and the community reviewer remains mandatory. Both accords are available separately in the app with their own balances, work and pinned contract calls.

## Try it locally

**Website:** [seal-clubber.github.io/ootle-accord](https://seal-clubber.github.io/ootle-accord/)

Install Node.js 22 or newer. There are no package dependencies to install.

```sh
node app/server.mjs
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). The local server binds only to your computer. Set `PORT` if 4173 is already in use.

The interface has three tabs:

- **Accords:** the funded Esmeralda escrow, remaining capacity, Max control, approval threshold and an explicit balance refresh.
- **Create:** milestone terms, reviewer wallets and approval percentages; saves a public agreement file.
- **Review:** the work and acceptance terms, with Sapient submission and approval.

The landing-page sections, simulated funding sandbox and legacy recovery screen have been removed. Cryptographic recovery helpers remain in the library for compatibility, with no recovery UI. The app requests no balances or private view access. It performs no background indexer requests. Refresh balance explicitly contacts the pinned Tari indexer with the public contract ID, checks immutable terms and updates the counter/votes. Saved checkpoints are labeled. The browser relies on indexer verification rather than independently checking consensus proofs.

Sapient's existing origin connection is restored after refresh and checked again when returning to the app. This uses passive account, network and capability reads; it never opens a permission or signing prompt. No account address or connection token is stored by the app. A locked wallet, revoked site permission or wrong network stays disconnected until Sapient reports a valid existing connection or the user explicitly connects again.

## Funding model and limits

The v4 escrow template fixes the native-TARI target, deadline, creator, one-time payout key, reviewer list, percentage and required reviewer. Funding spends private inputs into escrow-controlled script-only outputs. An opening proof binds each real output value to the public counter increase; native range and balance proofs validate the actual movement. Funding above the remaining capacity is rejected atomically. Each escrow supports up to 64 pledges. The Max control uses exact raw-unit capacity; a concurrent donation can make a quote stale and cause rejection.

The creator submits a work fingerprint. Payout requires the rounded-up quorum **and** the mandatory reviewer, then a creator signature and a transfer to the fixed private destination. After the deadline, eligible unpaid pledges refund only to their precommitted one-time refund keys. Recovery data is essential and stays local. Six escrow engine tests and an encrypted client flow cover these paths. The live 10 tTARI example remains locked; no live payout/refund is claimed.

Sapient signs work submissions and public review votes with private fees enforced. Its current provider does not expose the custom private escrow funding flow, so browser donations remain disabled without a revealed fallback. Create saves public v3 review terms and does not deploy a contract. The native client is an offline fixed 10 tTARI test utility. Older agreement helpers and the authorization-only demonstration remain in source for compatibility; see [earlier review deployment](docs/testnet-deployment.md).

The exact aggregate reveals donation sizes by subtraction. Stealth output amounts remain encrypted and donor signing keys are one-time, but transaction graph, timing, fees, public creator/reviewer keys and the documented public shielding bootstrap remain visible. This is not donor anonymity. See the [current privacy model and chain evidence](docs/private-escrow-testnet.md). Legacy [HTLC privacy](docs/privacy.md), [protocol](docs/protocol.md) and [Sapient notes](docs/sapient.md) are historical references.

## Check and build

```sh
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
```

`check.mjs` checks JavaScript syntax and page references. Tests cover amount precision, agreement validation, secrets, encrypted recovery, wallet request recovery and preview-server boundaries. Wallet tests use a mock provider; they do not establish validator acceptance, an installed-extension round trip or live privacy.

The private escrow update adds six real Tari-engine escrow tests and an additional real encrypted funding/payout test, alongside the existing five quorum-engine tests and JavaScript suite. Publication, creation, shielding, private funding, work submission and two test votes committed on Esmeralda. The required installed-Sapient community approval is still outstanding. See the [verification ledger](docs/verification.md).

`build.mjs` creates a static `dist/` directory with local app assets and documentation. It excludes the preview server, dotfiles and JSON exports. The build does not publish or deploy anything. When hosting, apply the restrictive response policy in [app/server.mjs](app/server.mjs) and verify that the installed wallet can inject its provider under that policy. Assets and fonts are local; the application has no analytics or remote font service.

## GitHub Pages

The `Publish GitHub Pages` workflow tests the code, builds `dist/`, and deploys it on every push to `main`. It can also be started manually from Actions. Repository Settings → Pages uses **GitHub Actions** as the publishing source.

All application assets use relative paths so the project works at `/ootle-accord/`. A page-level content security policy and no-referrer policy travel with the static HTML. GitHub Pages does not reproduce the preview server's custom HTTP headers. Recovery files are decrypted locally; GitHub serves the application files and can observe ordinary visitor connection metadata. General private donations through Sapient remain disabled; the native-client-funded escrow is real.

## Build the approval template

With Rust 1.97.1 and the wasm32-unknown-unknown target installed, run:

    cargo +1.97.1 build --target wasm32-unknown-unknown --release -p accord-review-template --locked

Run `cargo +1.97.1 test -p accord-review-template --test quorum_engine --locked` on Linux to exercise the engine tests. The test helper also compiles the WASM. The helper requires a native Cranelift-supported target and build tools. `accord-deploy-args` encodes public deployment arguments with Tari’s CBOR library. For private escrow, build `-p accord-escrow-template` and run `cargo +1.97.1 test -p accord-escrow-template --test private_escrow --locked` plus `cargo +1.97.1 test -p accord-private-client --test encrypted_flow --locked`. The native client never submits transactions itself; recovery journals stay under ignored `.local/`.

## Repository map

| Path | Purpose |
| --- | --- |
| `app/` | Browser application and local preview server |
| `app/lib/accord.mjs` | Public agreements, exact native-TARI amounts and reviewer secrets |
| `app/lib/recovery.mjs` | Recovery records, private handoffs and encrypted backups |
| `app/lib/sapient.mjs` | Explicit Sapient connection, fail-closed funding and resumable claim/refund requests |
| `tests/` | Dependency-free Node test suite |
| `docs/` | Protocol, privacy boundaries, wallet findings and contest checklist |

Never commit wallet seeds, passwords, real reviewer secrets, refund masks or recovery exports. File patterns for common exports are ignored; keep confidential material outside this repository as well.

## Contest and provenance

The October theme focuses on Tari privacy. The submission checklist and an unpublished entry draft are in [docs/contest.md](docs/contest.md). The project was developed with coding-agent assistance under the author's direction. No source code was copied from Threshold or another contest submission. The Tari and Sapient APIs are external dependencies documented from their primary sources.

License: [MIT](LICENSE).
