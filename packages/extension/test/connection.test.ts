import { describe, expect, it } from 'vitest';
import type { RemoteMutationRecord } from '@remote-dom/core';
import { mountConnection } from '../src/connection.js';

describe('mount connection', () => {
  it('batches per microtask, flushes before calls and drops changes after close', async () => {
    const sent: unknown[] = [];
    const connection = mountConnection({
      mutate: (records) => void sent.push(records.length),
      call: (_id, method) => void sent.push(method),
    });
    const record = [2, '1', 'x'] as unknown as RemoteMutationRecord;
    connection.mutate([record]);
    connection.mutate([record, record]);
    expect(sent).toEqual([]);
    await Promise.resolve();
    expect(sent).toEqual([3]);
    connection.mutate([record]);
    connection.call('1', 'focus');
    expect(sent).toEqual([3, 1, 'focus']);
    connection.close();
    connection.mutate([record]);
    await Promise.resolve();
    expect(sent).toEqual([3, 1, 'focus']);
  });

  it('splits batches the host would find too large', () => {
    const batches: number[] = [];
    const connection = mountConnection({ mutate: (records) => void batches.push(records.length), call: () => {} });
    const big = [3, '1', 'x'.repeat(100_000)] as unknown as RemoteMutationRecord;
    connection.mutate([big, big, big]);
    connection.flush();
    expect(batches).toEqual([1, 1, 1]);
  });
});
