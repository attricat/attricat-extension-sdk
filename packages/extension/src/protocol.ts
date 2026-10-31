/**
 * The native UI protocol as the Attricat host defines it. Names and shapes
 * mirror `apps/web/src/features/extensions/native/` and
 * `apps/web/src/features/extensions/constants.ts` in the core repository.
 */
import type { RemoteConnection } from '@remote-dom/core';

/** Frame to Worker: the extension's port, in `event.ports[0]`. */
export const workerInitMessageType = 'attricat:native-init.v1';

/** What a contribution receives when it mounts and on every update. */
export type NativeMountInit = {
  context: Record<string, unknown>;
  configuration: unknown;
  capabilities: readonly string[];
  locale: string;
  theme: { color_mode: ColorMode };
  ui_kit: string;
};
export type ColorMode = 'light' | 'dark';

/** What the host offers an extension's Worker. */
export type HostExports = {
  ready: (registered: readonly string[]) => Promise<void>;
  request: (mountId: string, method: string, payload: unknown) => Promise<unknown>;
};

/** What the SDK in an extension's Worker offers the host. */
export type WorkerExports = {
  mount: (
    mountId: string,
    contributionId: string,
    connection: RemoteConnection,
    init: NativeMountInit,
  ) => Promise<void>;
  update: (mountId: string, init: NativeMountInit) => Promise<void>;
  unmount: (mountId: string) => Promise<void>;
  ping: () => Promise<void>;
};

/** Broker methods a contribution may call; the host checks its grants. */
export const brokerMethods = {
  attricatRead: 'attricat.read',
  command: 'command',
  dialogClose: 'dialog.close',
  operationsCancel: 'operations.cancel',
  operationsDownload: 'operations.download',
  operationsGet: 'operations.get',
  operationsList: 'operations.list',
  operationsStart: 'operations.start',
  navigate: 'navigate',
  notify: 'notify',
  refresh: 'refresh',
  editorPropose: 'editor.propose',
} as const;
export const storageMethodPrefix = 'storage.';
export const storageOperations = ['get', 'set', 'delete', 'list'] as const;
export type StorageOperation = (typeof storageOperations)[number];

/** Host limits the SDK keeps under; exceeding one stops the Worker. */
export const nativeBudgets = {
  /** The largest message the host accepts from a Worker. */
  maximumMessageBytes: 1_048_576,
  /** The SDK splits mutation batches well below that. */
  mutationBatchBytes: 262_144,
  /** The largest client_native artifact a release may carry. */
  maximumArtifactBytes: 1_048_576,
} as const;

/** Appended to a client_native artifact's path for its build record. */
export const buildRecordSuffix = '.build.json';

/** A contribution ID, as the manifest accepts it. */
export const contributionIdPattern = /^[A-Za-z0-9._-]{1,128}$/;

/** Sends one broker request on behalf of one mount. */
export type Requester = (method: string, payload: unknown) => Promise<unknown>;
