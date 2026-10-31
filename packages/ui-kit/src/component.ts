import { h, type FunctionComponent } from 'preact';
import { forwardRef } from 'preact/compat';
import { createRemoteComponent } from '@remote-dom/preact';
import type { RemoteElementConstructor } from '@remote-dom/core/elements';

/** Text an element that accepts only text can hold. */
export type TextChildren =
  | string
  | number
  | bigint
  | boolean
  | null
  | undefined
  | readonly TextChildren[];

/**
 * A Preact component for one UI kit element. `onX` props become listeners for
 * the element's events and receive the host's payload, not an event object.
 * Slot props, such as EmptyState's `action`, put the given element in that
 * slot directly: the host accepts only UI kit elements there, never wrappers.
 */
export const uiKitComponent = <Props extends object>(
  name: string,
  tag: string,
  element: RemoteElementConstructor<any, any, any, any>,
  events: Record<string, string>,
): FunctionComponent<Props> => {
  const Remote = createRemoteComponent(tag as never, element as never, {
    slotProps: { wrapper: false },
  }) as unknown as FunctionComponent<Record<string, unknown>>;
  const Component = forwardRef<unknown, Record<string, unknown>>(
    function UiKitComponent(props, ref) {
      const remoteProps: Record<string, unknown> = { ref };
      for (const prop in props) {
        const event = events[prop];
        const value = props[prop];
        if (event === undefined) remoteProps[prop] = value;
        else if (typeof value === 'function')
          // Preact attaches `on<event>` as a listener for `<event>`.
          remoteProps[`on${event}`] = (remoteEvent: { detail: unknown }) =>
            value(remoteEvent.detail);
      }
      return h(Remote, remoteProps);
    },
  );
  Component.displayName = name;
  return Component as unknown as FunctionComponent<Props>;
};
