import { describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';

describe('client', () => {
  it('sends the frame API calls as the host broker methods and payloads', async () => {
    const calls: [string, unknown][] = [];
    const client = createClient(async (method, payload) => {
      calls.push([method, payload]);
      return null;
    });
    await client.request('/api/records');
    await client.command({ command_id: 'c', payload: { a: 1 } });
    await client.storage.get({ key: 'k' });
    await client.storage.set({ key: 'k', value: 1, expected_revision: 2 });
    await client.storage.delete({ key: 'k' });
    await client.storage.list();
    await client.storage.list({ prefix: 'p', limit: 10 });
    await client.navigate({ record_id: 'r', tab: 't' });
    await client.notify({ message: 'm', severity: 'info' });
    await client.refresh();
    await client.dialog.close();
    await client.operations.start({ operation_id: 'o', input: {}, idempotency_key: 'k1' });
    await client.operations.get({ run_id: 'x' });
    await client.operations.list();
    await client.operations.cancel({ run_id: 'x' });
    await client.operations.download({ run_id: 'x', artifact_id: 'y' });
    expect(calls).toEqual([
      ['attricat.read', { path: '/api/records' }],
      ['command', { command_id: 'c', payload: { a: 1 } }],
      ['storage.get', { key: 'k' }],
      ['storage.set', { key: 'k', value: 1, expected_revision: 2 }],
      ['storage.delete', { key: 'k' }],
      ['storage.list', {}],
      ['storage.list', { prefix: 'p', limit: 10 }],
      ['navigate', { record_id: 'r', tab: 't' }],
      ['notify', { message: 'm', severity: 'info' }],
      ['refresh', { target: 'current_record' }],
      ['dialog.close', {}],
      ['operations.start', { operation_id: 'o', input: {}, idempotency_key: 'k1' }],
      ['operations.get', { run_id: 'x' }],
      ['operations.list', {}],
      ['operations.cancel', { run_id: 'x' }],
      ['operations.download', { run_id: 'x', artifact_id: 'y' }],
    ]);
  });

  it('rejects with the host error', async () => {
    const client = createClient(async () => {
      throw new Error('Request denied');
    });
    await expect(client.request('/api/records')).rejects.toThrow('Request denied');
  });
});
