import { Component, h, render, type ComponentChildren } from 'preact';
import type { RemoteConnection } from '@remote-dom/core';
import { createClient } from './client.js';
import { mountConnection, type MountConnection } from './connection.js';
import { createRoot } from './dom.js';
import { MountContext, type MountState } from './hooks.js';
import type { NativeMountInit, Requester } from './protocol.js';
import type { ContributionComponent } from './registry.js';

type BoundaryProps = { onError: (error: unknown) => void; children?: ComponentChildren };

/** Stops one mount's rendering on an error, leaving every other mount alone. */
class MountBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };
  override componentDidCatch(error: unknown) {
    this.setState({ failed: true });
    this.props.onError(error);
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

/** One contribution drawn into one host mount. */
export class Mount {
  readonly #root = createRoot();
  readonly #connection: MountConnection;
  readonly #component: ContributionComponent;
  #state: MountState;
  #error: unknown;
  #mounted = false;

  constructor(
    mountId: string,
    contributionId: string,
    component: ContributionComponent,
    connection: RemoteConnection,
    init: NativeMountInit,
    request: Requester,
  ) {
    this.#component = component;
    this.#connection = mountConnection(connection);
    this.#state = { mountId, contributionId, init, request, client: createClient(request) };
  }

  /** Draws the first tree; throws when the component fails to render. */
  start() {
    this.#root.connect(this.#connection);
    this.#mounted = true;
    this.#render();
    this.#connection.flush();
    if (this.#error !== undefined) {
      const error = this.#error;
      this.unmount();
      throw error;
    }
  }

  /** Re-renders with the host's new init; component state survives. */
  update(init: NativeMountInit) {
    if (!this.#mounted) return;
    this.#state = { ...this.#state, init };
    this.#render();
  }

  unmount() {
    if (!this.#mounted) return;
    this.#mounted = false;
    try {
      render(null, this.#root);
    } finally {
      this.#connection.close();
    }
  }

  #render() {
    render(
      h(
        MountBoundary,
        { onError: (error) => this.#fail(error) },
        h(MountContext.Provider, { value: this.#state }, h(this.#component, {})),
      ),
      this.#root,
    );
  }

  #fail(error: unknown) {
    this.#error ??= error;
    console.error(`[attricat] '${this.#state.contributionId}' failed to render`, error);
  }
}
