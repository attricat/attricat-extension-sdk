import { afterEach, describe, expect, it, vi } from 'vitest';
import { ThreadMessagePort } from '@quilted/threads';
import { useState } from 'preact/hooks';
import { Button, Stack, Text } from '@attricat/ui-kit';
import { register, useAttricat, useEditor, useOutletContext } from '../src/index.js';
import { Registry } from '../src/registry.js';
import { connectPort, startWorker } from '../src/runtime.js';
import { TestReceiver, elementsOf, textOf } from '../src/receiver.js';
import type { HostExports, NativeMountInit, WorkerExports } from '../src/protocol.js';

const init = (context: Record<string, unknown> = { context_version: 1 }): NativeMountInit => ({
  context,
  configuration: { greeting: 'Hi' },
  capabilities: ['client.commands'],
  locale: 'en',
  theme: { color_mode: 'light' },
  ui_kit: '1.0.0',
});

const until = async (check: () => boolean, what: string) => {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`timed out waiting for ${what}`);
};

const ports: MessagePort[] = [];
afterEach(() => ports.splice(0).forEach((port) => port.close()));

/** A fake host: the Thread the real host creates over its end of the channel. */
const fakeHost = (answer: (method: string, payload: unknown) => unknown = () => null) => {
  const channel = new MessageChannel();
  ports.push(channel.port1, channel.port2);
  const registered: string[][] = [];
  const requests: [string, string, unknown][] = [];
  const exports: HostExports = Object.assign(Object.create(null), {
    ready: async (ids: readonly string[]) => {
      registered.push([...ids]);
    },
    request: async (mountId: string, method: string, payload: unknown) => {
      requests.push([mountId, method, payload]);
      return answer(method, payload);
    },
  });
  const thread = new ThreadMessagePort<WorkerExports, HostExports>(channel.port1, { exports });
  channel.port1.start();
  return { thread, worker: channel.port2, registered, requests };
};

const Panel = () => {
  const [count, setCount] = useState(0);
  const { record_id } = useOutletContext<{ record_id: string }>();
  const attricat = useAttricat();
  return (
    <Stack>
      <Text>{`${record_id}:${count}`}</Text>
      <Button
        onPress={async () => {
          setCount((value) => value + 1);
          await attricat.command({ command_id: 'go', payload: { record_id } });
        }}
      >
        Go
      </Button>
    </Stack>
  );
};
const Broken = () => {
  throw new Error('boom');
};
const Editor = () => {
  const editor = useEditor();
  return <Button onPress={() => editor.propose(42)}>Propose</Button>;
};

describe('worker runtime', () => {
  it('announces registrations, mounts, updates, isolates failures and unmounts', async () => {
    const registry = new Registry();
    registry.register('panel', Panel);
    registry.register('broken', Broken);
    registry.register('editor', Editor);
    const host = fakeHost((method) => (method === 'command' ? { ok: true } : null));
    connectPort(host.worker, registry);
    await until(() => host.registered.length === 1, 'ready');
    expect(host.registered[0]).toEqual(['panel', 'broken', 'editor']);

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registry.register('late', Panel);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();

    const panel = new TestReceiver();
    await host.thread.imports.mount('1', 'panel', panel.connection, init({ record_id: 'r1' }));
    await until(() => textOf(panel.root).includes('r1:0'), 'first tree');

    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = new TestReceiver();
    await expect(
      host.thread.imports.mount('2', 'broken', broken.connection, init()),
    ).rejects.toThrow('boom');
    error.mockRestore();
    await expect(
      host.thread.imports.mount('3', 'missing', new TestReceiver().connection, init()),
    ).rejects.toThrow('not registered');

    const button = elementsOf(panel.root).find((item) => item.name === 'Button')!;
    await button.listeners.press!({});
    await until(() => textOf(panel.root).includes('r1:1'), 'state change');
    expect(host.requests).toEqual([['1', 'command', { command_id: 'go', payload: { record_id: 'r1' } }]]);

    await host.thread.imports.update('1', init({ record_id: 'r2' }));
    await until(() => textOf(panel.root).includes('r2:1'), 'update keeping state');

    const editor = new TestReceiver();
    await host.thread.imports.mount('4', 'editor', editor.connection, init({ value: 1, props: {} }));
    await until(() => elementsOf(editor.root).length > 0, 'editor tree');
    await elementsOf(editor.root)[0]!.listeners.press!({});
    await until(() => host.requests.length === 2, 'proposal');
    expect(host.requests[1]).toEqual(['4', 'editor.propose', { value: 42 }]);

    await expect(host.thread.imports.ping()).resolves.toBeUndefined();
    await host.thread.imports.unmount('1');
    await until(() => panel.root.children.length === 0, 'unmount');
    await host.thread.imports.unmount('unknown');
  });

  it('takes the port from the frame init message', async () => {
    const listeners: ((event: MessageEvent) => void)[] = [];
    const scope = globalThis as unknown as Record<string, unknown>;
    const saved = [scope.addEventListener, scope.removeEventListener];
    scope.addEventListener = (_: string, listener: (event: MessageEvent) => void) => listeners.push(listener);
    scope.removeEventListener = (_: string, listener: (event: MessageEvent) => void) =>
      listeners.splice(listeners.indexOf(listener), 1);
    try {
      register('frame-panel', Panel);
      startWorker();
      const host = fakeHost();
      listeners[0]!({ data: { type: 'other' }, ports: [host.worker] } as unknown as MessageEvent);
      expect(listeners).toHaveLength(1);
      listeners[0]!({ data: { type: 'attricat:native-init.v1' }, ports: [host.worker] } as unknown as MessageEvent);
      expect(listeners).toHaveLength(0);
      await until(() => host.registered.length === 1, 'ready');
      expect(host.registered[0]).toEqual(['frame-panel']);
    } finally {
      [scope.addEventListener, scope.removeEventListener] = saved;
    }
  });
});

