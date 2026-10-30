# Published escrow artifact

`sapient-escrow-v5.wasm` is the exact optimized **252,968-byte** WASM published on Esmeralda.

- SHA-256: `923ceb4d64bde0af878ae355008720959f6d41ebc3adf5adf43466ec1a8ada46`
- Template: `bc30266a3c2d025a02aa723b1de4396788c8c477b3dc1c5798bce4ca49a2d5a0`
- Publication: `58ef332896b0e1b717940d9ff928c0b0ed91431235ab84ead5276e5d7d34c344`
- Source: `crates/accord-sapient-escrow-template`, Tari template library 0.35.0, engine tests 0.47.0.
- Build: Rust 1.98.1 on Linux, release `wasm32-unknown-unknown`; Binaryen 132.0.0 `wasm-opt -Oz --enable-bulk-memory --enable-sign-ext --enable-nontrapping-float-to-int --enable-mutable-globals --enable-reference-types --enable-multivalue`.

The three lifecycle tests passed using this exact artifact. To repeat on Linux:

```sh
OOTLEACCORD_TEMPLATE_WASM="$PWD/artifacts/esmeralda/sapient-escrow-v5.wasm" cargo +1.97.1 test -p accord-sapient-escrow-template --test stock_wallet --locked
```

The source is formatted for review; formatting/compiler versions can change panic locations and binary hashes. Preserve this published binary when verifying the deployed template. It is an original OotleAccord build under the repository’s MIT license, linking Tari dependencies under their upstream licenses. It is not included in the GitHub Pages app bundle.
