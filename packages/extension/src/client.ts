import { brokerMethods, storageMethodPrefix, type Requester } from './protocol.js';

export type NotificationSeverity = 'success' | 'info' | 'warning' | 'error';

export type StorageGetRequest = { key: string };
export type StorageSetRequest = { key: string; value: unknown; expected_revision?: number };
export type StorageDeleteRequest = { key: string; expected_revision?: number };
export type StorageListRequest = { prefix?: string; cursor?: string; limit?: number };

export type StartOperationRequest = {
  operation_id: string;
  input: Record<string, unknown>;
  /** Visible ASCII, at most 64 characters. */
  idempotency_key: string;
};
export type RunReference = { run_id: string };
export type ArtifactReference = { run_id: string; artifact_id: string };

/**
 * The host calls a contribution may make, mirroring the frame `attricat` API.
 * Each is checked against the contribution's grants and context; a refused
 * call rejects with an Error whose message does not reveal why.
 */
export interface AttricatClient {
  /** `GET` an allowed catalog path (needs `attricat.read`). */
  request<T = unknown>(path: string): Promise<T>;
  /** Calls one of the extension's server commands (needs `client.commands`). */
  command<T = unknown>(detail: { command_id: string; payload?: unknown }): Promise<T>;
  /** The extension's key-value storage (needs `storage.extension`). */
  storage: {
    get<T = unknown>(detail: StorageGetRequest): Promise<T>;
    set<T = unknown>(detail: StorageSetRequest): Promise<T>;
    delete<T = unknown>(detail: StorageDeleteRequest): Promise<T>;
    list<T = unknown>(detail?: StorageListRequest): Promise<T>;
  };
  /** Opens a record, or one of this extension's record tabs on it. */
  navigate(detail: { record_id: string; tab?: string }): Promise<void>;
  /** Shows a host notification (needs `client.notification`). */
  notify(detail: { message: string; severity?: NotificationSeverity }): Promise<void>;
  /** Reloads the current record's views (needs `client.refresh`). */
  refresh(detail?: { target: 'current_record' }): Promise<void>;
  /** Action dialogs only. */
  dialog: { close(): Promise<void> };
  operations: {
    start(detail: StartOperationRequest): Promise<{ run_id: string }>;
    get<T = unknown>(detail: RunReference): Promise<T>;
    list<T = unknown>(): Promise<T>;
    cancel(detail: RunReference): Promise<void>;
    download(detail: ArtifactReference): Promise<void>;
  };
}

/** A client whose every call goes to the host as one mount's request. */
export const createClient = (request: Requester): AttricatClient => {
  const call = <T>(method: string, payload: unknown) => request(method, payload) as Promise<T>;
  const storage = (operation: string, detail: unknown) =>
    call<never>(`${storageMethodPrefix}${operation}`, detail ?? {});
  return Object.freeze({
    request: (path: string) => call<never>(brokerMethods.attricatRead, { path }),
    command: (detail: unknown) => call<never>(brokerMethods.command, detail),
    storage: Object.freeze({
      get: (detail: unknown) => storage('get', detail),
      set: (detail: unknown) => storage('set', detail),
      delete: (detail: unknown) => storage('delete', detail),
      list: (detail?: unknown) => storage('list', detail),
    }),
    navigate: (detail: unknown) => call<void>(brokerMethods.navigate, detail),
    notify: (detail: unknown) => call<void>(brokerMethods.notify, detail),
    refresh: (detail: unknown = { target: 'current_record' }) =>
      call<void>(brokerMethods.refresh, detail),
    dialog: Object.freeze({ close: () => call<void>(brokerMethods.dialogClose, {}) }),
    operations: Object.freeze({
      start: (detail: unknown) => call<{ run_id: string }>(brokerMethods.operationsStart, detail),
      get: (detail: unknown) => call<never>(brokerMethods.operationsGet, detail),
      list: () => call<never>(brokerMethods.operationsList, {}),
      cancel: (detail: unknown) => call<void>(brokerMethods.operationsCancel, detail),
      download: (detail: unknown) => call<void>(brokerMethods.operationsDownload, detail),
    }),
  }) as AttricatClient;
};
