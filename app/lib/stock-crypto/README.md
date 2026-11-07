# Browser crypto helper

Generated from `crates/accord-sapient-client` using wasm-bindgen **0.2.128** and Tari wallet crypto **0.50.0**, for the Ootle **0.49** network. The browser uses public receiving keys and private return metadata, never a wallet seed, view secret or input spending key.

Build the client crate for `wasm32-unknown-unknown --release --lib`, then run wasm-bindgen with `--target web --out-dir app/lib/stock-crypto --out-name accord_sapient_client`. The JS and WASM are shipped together. Native `.d.ts` files are development declarations and are excluded from the static Pages package.

The wrapper in `stock-client.mjs` initializes the WASM lazily from the same origin, with the application’s build version. CSP permits WASM compilation without permitting JavaScript eval. The generated helper links Tari and other Rust dependencies under their respective licenses; application code remains MIT.

The helper also decodes the current indexer's base64 CBOR substates and execution results using pinned Ootle types, rejecting trailing bytes. `chain-codec.mjs` preserves the server's verification flag and passes already decoded wallet responses through. Private output keys now use the recipient's public view key as required by the current wallet protocol; return signatures bind the network, component, action and contribution index.
