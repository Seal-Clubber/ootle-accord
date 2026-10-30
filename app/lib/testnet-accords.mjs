import { TESTNET_ESCROW } from './testnet-escrow.mjs';
import { TESTNET_PARTIAL_ESCROW } from './testnet-partial-escrow.mjs';
import { TESTNET_SAPIENT_ESCROW } from './testnet-sapient-escrow.mjs';

export const TESTNET_ACCORDS = Object.freeze([TESTNET_SAPIENT_ESCROW, TESTNET_PARTIAL_ESCROW, TESTNET_ESCROW]);
