# Current-network escrow artifact

`sapient-escrow.wasm` is the exact optimized artifact published on Esmeralda for the Ootle 0.49 network.

- Size: **254,501 bytes**.
- SHA-256: `0039db0ddcef1feabcf98b992204372253de066aa5a9a5026e27e04d5139374f`.
- Template library: **0.37.0**. Native test engine: **0.49.2**.
- Compiler: Rust **1.98.1**, Linux, `wasm32-unknown-unknown`, release profile.
- Optimizer: Binaryen **132.0.0**, optimize level 2, shrink level 2, with bulk memory, bulk memory opt, sign extension, nontrapping float conversion, mutable globals, reference types and multivalue enabled. Do not enable all proposals: that can introduce instructions the network rejects.
- Template address and publication receipt are recorded in [manifest.json](manifest.json).

All three lifecycle tests passed against this exact file before it was published:

```sh
OOTLEACCORD_TEMPLATE_WASM="$PWD/artifacts/esmeralda/current/sapient-escrow.wasm" cargo +1.98.1 test -p accord-sapient-escrow-template --test stock_wallet --locked
```

The historical `../sapient-escrow-v5.wasm` belongs to the pre-reset Ootle 0.47 deployment. It is preserved unchanged and is not loaded by current-engine tests. Neither artifact directory is included in the GitHub Pages app bundle.
