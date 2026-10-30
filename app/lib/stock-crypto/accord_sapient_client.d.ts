/* tslint:disable */
/* eslint-disable */

export function actionTransaction(component: string, principal_vault: string, fee_vault: string, note_json: string, refund_index: number | null | undefined, max_epoch: string, dry_run: boolean): string;

export function constructorArgs(note_json: string, config_json: string): string;

export function fundingArgs(note_json: string, expected_total: string, address: string, amount: string, agreement: string, receiver_key: string): string;

export function inspectEnvelope(encoded: string): string;

export function makeReturnNote(address: string, raw: string): string;

export function publicReturnBinding(note_json: string): string;

export function restoreReturnReceipt(memo: string, address: string, agreement: string): string;

export function returnStatement(note_json: string): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly actionTransaction: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly constructorArgs: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly fundingArgs: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number, j: number, k: number, l: number, m: number) => void;
    readonly inspectEnvelope: (a: number, b: number, c: number) => void;
    readonly makeReturnNote: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly publicReturnBinding: (a: number, b: number, c: number) => void;
    readonly restoreReturnReceipt: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly returnStatement: (a: number, b: number, c: number) => void;
    readonly tari_free: (a: number) => void;
    readonly tari_alloc: (a: number) => number;
    readonly __wbindgen_export: (a: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export2: (a: number, b: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export4: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
