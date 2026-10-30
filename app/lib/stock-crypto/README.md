# Browser crypto helper

Generated from `crates/accord-sapient-client` using wasm-bindgen **0.2.128** and Tari wallet crypto **0.48.0**. The browser uses public receiving keys and private return metadata, never a wallet seed, view secret or input spending key.

Build the client crate for `wasm32-unknown-unknown --release --lib`, then run wasm-bindgen with `--target web --out-dir app/lib/stock-crypto --out-name accord_sapient_client`. The JS and WASM are shipped together. Native `.d.ts` files are development declarations and are excluded from the static Pages package.

The wrapper in `stock-client.mjs` initializes the WASM lazily from the same origin, with the application’s build version. CSP permits WASM compilation without permitting JavaScript eval. The generated helper links Tari and other Rust dependencies under their respective licenses; application code remains MIT.
