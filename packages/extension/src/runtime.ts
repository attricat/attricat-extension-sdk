import { Thread, ThreadMessagePort } from '@quilted/threads';
import { Mount } from './mount.js';
import {
  workerInitMessageType,
  type HostExports,
  type WorkerExports,
} from './protocol.js';
import { registry as defaultRegistry, type Registry } from './registry.js';

/** The Worker side of the protocol: the exports the host calls. */
export const createWorkerExports = (
  registry: Registry,
  host: () => HostExports,
): WorkerExports => {
  const mounts = new Map<string, Mount>();
  // Only these are callable; a plain object would also expose its prototype.
  return Object.assign(Object.create(null), {
    async mount(mountId, contributionId, connection, init) {
      const component = registry.components.get(contributionId);
      if (!component) throw new Error(`'${contributionId}' is not registered`);
      mounts.get(mountId)?.unmount();
      const mount = new Mount(
        mountId,
        contributionId,
        component,
        connection,
        init,
        (method, payload) => host().request(mountId, method, payload),
      );
      mounts.set(mountId, mount);
      try {
        mount.start();
      } catch (error) {
        mounts.delete(mountId);
        throw error;
      }
    },
    async update(mountId, init) {
      mounts.get(mountId)?.update(init);
    },
    async unmount(mountId) {
      const mount = mounts.get(mountId);
      mounts.delete(mountId);
      mount?.unmount();
    },
    async ping() {},
  } satisfies WorkerExports);
};

/**
 * Serves the host over the extension's port. Registration closes, and the
 * registered contributions are announced, once the current task (the
 * module's evaluation) has finished.
 */
export const connectPort = (port: MessagePort, registry: Registry = defaultRegistry) => {
  const thread: Thread<HostExports, WorkerExports> = new ThreadMessagePort<
    HostExports,
    WorkerExports
  >(port, { exports: createWorkerExports(registry, () => thread.imports) });
  port.start();
  setTimeout(() => {
    void thread.imports.ready(registry.close()).catch(() => {});
  }, 0);
  return thread;
};

type WorkerScope = typeof globalThis & {
  addEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
  removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void;
};

/** Waits in a Worker for the frame's init message, then serves the host. */
export const startWorker = () => {
  const scope = globalThis as WorkerScope;
  const listener = (event: MessageEvent) => {
    const port = event.ports?.[0];
    if (event.data?.type !== workerInitMessageType || !port) return;
    scope.removeEventListener('message', listener);
    connectPort(port);
  };
  scope.addEventListener('message', listener);
};

/** Whether this code runs in a dedicated Worker. */
export const inWorker = () =>
  typeof (globalThis as { WorkerGlobalScope?: unknown }).WorkerGlobalScope === 'function' &&
  globalThis instanceof
    (globalThis as unknown as { WorkerGlobalScope: abstract new () => unknown }).WorkerGlobalScope;
