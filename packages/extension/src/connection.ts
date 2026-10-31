import type { RemoteConnection, RemoteMutationRecord } from '@remote-dom/core';
import { nativeBudgets } from './protocol.js';

/** Swallows a rejected host call: the host decides what failure means. */
const settle = (result: unknown) => {
  if (result && typeof (result as Promise<unknown>).then === 'function')
    (result as Promise<unknown>).then(undefined, () => {});
};

/** Approximate size of a value as the host measures it (UTF-16 bytes). */
const estimate = (record: RemoteMutationRecord) => {
  try {
    return (JSON.stringify(record)?.length ?? 0) * 2;
  } catch {
    return 0;
  }
};

export type MountConnection = RemoteConnection & {
  /** Sends everything queued now. */
  flush(): void;
  /** Sends what is queued, then drops every later change. */
  close(): void;
};

/**
 * Batches one mount's mutation records per microtask and splits batches the
 * host would find too large. Method calls flush first so they stay ordered.
 */
export const mountConnection = (connection: RemoteConnection): MountConnection => {
  let queue: RemoteMutationRecord[] | undefined;
  let closed = false;
  const send = (records: RemoteMutationRecord[]) => {
    let batch: RemoteMutationRecord[] = [];
    let bytes = 0;
    for (const record of records) {
      const size = estimate(record);
      if (batch.length && bytes + size > nativeBudgets.mutationBatchBytes) {
        settle(connection.mutate(batch));
        batch = [];
        bytes = 0;
      }
      batch.push(record);
      bytes += size;
    }
    if (batch.length) settle(connection.mutate(batch));
  };
  const flush = () => {
    const records = queue;
    queue = undefined;
    if (records?.length && !closed) send(records);
  };
  return {
    mutate(records) {
      if (closed) return;
      if (!queue) {
        queue = [];
        queueMicrotask(flush);
      }
      queue.push(...records);
    },
    call(id, method, ...args) {
      flush();
      if (closed) return undefined;
      return connection.call(id, method, ...args);
    },
    flush,
    close() {
      flush();
      closed = true;
    },
  };
};
