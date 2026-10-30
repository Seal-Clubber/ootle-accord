// Allowlisted after engine tests and committed template/component receipts.
// Immutable component terms were compared with the full normalized public agreement.
export const REVIEW_DEPLOYMENTS = Object.freeze({ esmeralda: Object.freeze({
  '3d2e19660a07385e212e86e80ff54e6e7d327105507b56e5ffe2763d57e1517d:delivery': 'component_1baffe14c156f3cea0aee845416827d72646b7285802a84ba2066d950d9d7fc1',
  'ddc24346d81fb625d1de38708725717edce8d66b6d783f92ba5d5ec599ba7872:delivery': 'component_5d2639cc01fdb9524a64da98b85bb8fd04a6c4979d0a8f6861aff3a3b8a7e3fc',
  '11f52c1579d7c7c2a882cbe6012e56864783fd480154fb9db518e537a2096555:delivery': 'component_48e138e99add1ab06cfae8d09310cf320b143b6f08d9800c0b8f743965d81450',
  '7722512489d2d16a43e2f45d65a46b16fa22010108ae3e1bceee0817070625ce:quorum-demo': 'component_28f41b4c64ce179866567a144fb6b586abf4c3af17afbbc0b17ac1eedf70258d',
}) });

// Immutable public dependencies from the committed escrow constructor receipt.
// Declare them before signing so the wallet need not discover them by retrying
// a transaction whose private fee input might already have been consumed.
export const REVIEW_DEPENDENCIES = Object.freeze({ esmeralda: Object.freeze({
  'component_1baffe14c156f3cea0aee845416827d72646b7285802a84ba2066d950d9d7fc1': Object.freeze([
    'resource_0101010101010101010101010101010101010101010101010101010101010101',
    'vault_1b643d19814b15c6ee77a0bc58134283af521450362ecfd881a986c40698d4e0',
    'vault_1b6d2778e572a3d66ec9623f3dfe41751ca65ff1e69a26f7e16a14a894ea9929',
  ]),
  'component_5d2639cc01fdb9524a64da98b85bb8fd04a6c4979d0a8f6861aff3a3b8a7e3fc': Object.freeze([
    'resource_0101010101010101010101010101010101010101010101010101010101010101',
    'vault_5d9f808b8b88425bc65d1844e96992d303822b31adc23d72b991fc2de90c06b1',
    'resource_5dbe87ad4db5ea9b019e5c2b2e91af83d5b57775e7d5215e633324356ff245a0',
  ]),
  'component_48e138e99add1ab06cfae8d09310cf320b143b6f08d9800c0b8f743965d81450': Object.freeze([
    'resource_0101010101010101010101010101010101010101010101010101010101010101',
    'vault_48eb022a13a5aec5a22e59d108cc347f3a0f2c71737815dd54a2be558073281c',
    'resource_481aa520dd39e35015260bbff8d9134c6c3ed149f4101d15270360bc3e15c0ca',
  ]),
}) });
