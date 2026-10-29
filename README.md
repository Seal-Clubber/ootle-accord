# OotleAccord

**Shared goals. Private contributions.**

OotleAccord is an original community-funding prototype for Tari Ootle. Communities prepare a public agreement, split work into reviewed milestones, and keep recovery material private. It is inspired by Threshold's funding idea; this repository contains a fresh implementation for the October 2026 Tari build contest.

**Live private funding is disabled.** The inspected Sapient HTLC operation funds from revealed balances and does not forward the SDK's private-source options. OotleAccord blocks new pledges instead of presenting that route as private. No funded campaign, successful payout, or completed live refund is claimed here. This is experimental testnet software.

## Try it locally

**Website:** [seal-clubber.github.io/ootle-accord](https://seal-clubber.github.io/ootle-accord/)

Install Node.js 22 or newer. There are no package dependencies to install.

```sh
node app/server.mjs
```

Open [http://127.0.0.1:4173/](http://127.0.0.1:4173/). The local server binds only to your computer. Set `PORT` if 4173 is already in use.

The application includes:

- A local sandbox demonstrating milestone pledges, reviewer release and deadline refunds. Sandbox actions never contact a wallet or move funds.
- A public agreement designer with fixed recipient, milestone acceptance terms, distinct reviewer wallet addresses, approval percentages and chain refund epochs.
- Reviewer identity read directly from Sapient, with no manual release-secret generation for new agreements.
- A Sapient connection with runtime network and capability checks. It requests no private balance or view access.
- Explicit refund requests for compatible existing HTLC records, with private fees required. These paths still need an installed supporting extension, the original material and network validation.
- Encrypted recovery helpers using PBKDF2-SHA256 and AES-256-GCM. A private creator handoff omits the donor's amount and refund mask.

## Funding model and limits

New v3 agreements fix up to ten Sapient reviewer keys and a percentage per milestone. The creator submits a work fingerprint, and reviewers sign approvals for that same work. Votes required round up against all designated reviewers. The quorum template and a 3-of-5 example are deployed on Esmeralda, with two committed test approvals awaiting the community reviewer. This component holds no funds; private escrow remains unfinished. See [wallet review](docs/wallet-review.md) and [deployment receipts](docs/testnet-deployment.md).

Legacy v1 HTLC handoffs and encrypted recovery files remain readable. Their hashlocks are unchanged and cannot be upgraded by this website. The website no longer offers the old secret-based claim flow. There is no campaign-wide goal, stage-order or work-quality enforcement. Quorum applies to review authorization only.

This version supports native TARI on Esmeralda and six decimal places. Refund deadlines are chain epochs, not calendar timestamps. A wallet seed alone is insufficient for this recovery format: retain the encrypted backup, its password, the original funding wallet and fee funds.

Private amounts do not make participants anonymous. Fees, transaction graphs, timings, public keys and public reviewer wallet keys can expose links. Legacy HTLC claim preflight discloses its secret to the wallet's indexer before broadcast. No public live funding total is calculated from hidden contributions. Read the [privacy model](docs/privacy.md), [protocol](docs/protocol.md) and [Sapient integration status](docs/sapient.md).

## Check and build

```sh
node scripts/check.mjs
node --test tests/*.test.mjs
node scripts/build.mjs
```

`check.mjs` checks JavaScript syntax and page references. Tests cover amount precision, agreement validation, secrets, encrypted recovery, wallet request recovery and preview-server boundaries. Wallet tests use a mock provider; they do not establish validator acceptance, an installed-extension round trip or live privacy.

The quorum update passed 48 JavaScript tests with one Windows symlink-permission skip and five real Tari-engine tests. Template publication, component creation, creator submission and two reviewer votes committed on Esmeralda. Installed Sapient approval and funded private escrow remain outstanding. See the [verification ledger](docs/verification.md).

`build.mjs` creates a static `dist/` directory with local app assets and documentation. It excludes the preview server, dotfiles and JSON exports. The build does not publish or deploy anything. When hosting, apply the restrictive response policy in [app/server.mjs](app/server.mjs) and verify that the installed wallet can inject its provider under that policy. Assets and fonts are local; the application has no analytics or remote font service.

## GitHub Pages

The `Publish GitHub Pages` workflow tests the code, builds `dist/`, and deploys it on every push to `main`. It can also be started manually from Actions. Repository Settings → Pages uses **GitHub Actions** as the publishing source.

All application assets use relative paths so the project works at `/ootle-accord/`. A page-level content security policy and no-referrer policy travel with the static HTML. GitHub Pages does not reproduce the preview server's custom HTTP headers. Recovery files are decrypted locally; GitHub serves the application files and can observe ordinary visitor connection metadata. Live private funding remains disabled.

## Build the approval template

With Rust 1.97.1 and the wasm32-unknown-unknown target installed, run:

    cargo +1.97.1 build --target wasm32-unknown-unknown --release -p accord-review-template --locked

Run `cargo +1.97.1 test -p accord-review-template --test quorum_engine --locked` on Linux to exercise the engine tests. The test helper also compiles the WASM. The helper requires a native Cranelift-supported target and build tools. `accord-deploy-args` encodes public deployment arguments with Tari’s CBOR library. This builds authorization, not a complete private escrow.

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
