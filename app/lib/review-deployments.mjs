// Allowlisted after engine tests and committed template/component receipts.
// Immutable component terms were compared with the full normalized public agreement.
export const REVIEW_DEPLOYMENTS = Object.freeze({ esmeralda: Object.freeze({
  '11f52c1579d7c7c2a882cbe6012e56864783fd480154fb9db518e537a2096555:delivery': 'component_48e138e99add1ab06cfae8d09310cf320b143b6f08d9800c0b8f743965d81450',
  '7722512489d2d16a43e2f45d65a46b16fa22010108ae3e1bceee0817070625ce:quorum-demo': 'component_28f41b4c64ce179866567a144fb6b586abf4c3af17afbbc0b17ac1eedf70258d',
}) });

// Immutable public dependencies from the committed escrow constructor receipt.
// Declare them before signing so the wallet need not discover them by retrying
// a transaction whose private fee input might already have been consumed.
export const REVIEW_DEPENDENCIES = Object.freeze({ esmeralda: Object.freeze({
  'component_48e138e99add1ab06cfae8d09310cf320b143b6f08d9800c0b8f743965d81450': Object.freeze([
    'resource_0101010101010101010101010101010101010101010101010101010101010101',
    'vault_48eb022a13a5aec5a22e59d108cc347f3a0f2c71737815dd54a2be558073281c',
    'resource_481aa520dd39e35015260bbff8d9134c6c3ed149f4101d15270360bc3e15c0ca',
  ]),
}) });
