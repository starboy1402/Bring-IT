import { supabase } from './supabase'

/**
 * Result wrapper for Supabase RPCs (docs/planning/05 §2).
 * RPCs return { ok: true, ...data } or { ok: false, code, message };
 * the wrapper also surfaces transport-level errors under a stable code.
 */
export type Result<T> =
  | ({ ok: true } & T)
  | { ok: false; code: string; message: string }

export async function rpc<T extends object>(
  fn: string,
  args: Record<string, unknown> = {},
): Promise<Result<T>> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) {
    return { ok: false, code: 'RPC_ERROR', message: error.message }
  }
  return (data ?? { ok: false, code: 'RPC_ERROR', message: 'No response.' }) as Result<T>
}
