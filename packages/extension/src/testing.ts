import { UI_KIT_ELEMENTS, UI_KIT_VERSION, type UiKitElementName } from '@attricat/ui-kit/version';
import { Mount } from './mount.js';
import type { ColorMode, NativeMountInit } from './protocol.js';
import type { ContributionComponent } from './registry.js';
import {
  TestReceiver,
  elementsOf,
  textOf,
  type TestElement,
  type TestNode,
  type TestRoot,
} from './receiver.js';

export { textOf, type TestElement, type TestNode, type TestRoot };

/** One broker call a contribution made. */
export type BrokerCall = { method: string; payload: unknown };

/**
 * Answers broker calls: a function of the method and payload, or a map from
 * method (such as `storage.get` or `attricat.read`) to an answer or a function
 * computing one. A thrown error, or a method without an answer in a map,
 * rejects the call as the host would. Without a broker every call resolves
 * to `null`.
 */
export type TestBroker =
  | ((method: string, payload: unknown) => unknown)
  | Record<string, unknown | ((payload: unknown) => unknown)>;

export type RenderOptions = {
  context?: Record<string, unknown>;
  configuration?: unknown;
  capabilities?: readonly string[];
  locale?: string;
  theme?: { color_mode: ColorMode };
  uiKit?: string;
  broker?: TestBroker;
};

/** Lets pending renders, effects and broker answers run. */
export const settle = async () => {
  for (let tick = 0; tick < 3; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

const answer = async (broker: TestBroker | undefined, method: string, payload: unknown) => {
  if (!broker) return null;
  if (typeof broker === 'function') return broker(method, payload);
  if (!(method in broker)) throw new Error('Request denied');
  const entry = broker[method];
  return typeof entry === 'function' ? (entry as (payload: unknown) => unknown)(payload) : entry;
};

const matches = (text: string, expected: string | RegExp) =>
  typeof expected === 'string' ? text === expected : expected.test(text);

let nextMount = 0;

/**
 * Renders a contribution the way the host's Worker runtime does, in-process,
 * and collects the tree the host would receive. Run it in Vitest's `node`
 * environment: it installs Remote DOM's DOM polyfill globally.
 */
export const renderContribution = async (
  component: ContributionComponent,
  {
    context = { context_version: 1 },
    configuration = null,
    capabilities = [],
    locale = 'en',
    theme = { color_mode: 'light' },
    uiKit = UI_KIT_VERSION,
    broker,
  }: RenderOptions = {},
) => {
  const receiver = new TestReceiver();
  const calls: BrokerCall[] = [];
  let init: NativeMountInit = {
    context,
    configuration,
    capabilities,
    locale,
    theme,
    ui_kit: uiKit,
  };
  const mount = new Mount(
    String(++nextMount),
    component.displayName ?? component.name ?? 'contribution',
    component,
    receiver.connection,
    init,
    async (method, payload) => {
      calls.push({ method, payload });
      return answer(broker, method, payload);
    },
  );
  mount.start();
  await settle();

  const all = () => elementsOf(receiver.root);
  const queryAllByElement = (name: UiKitElementName) => all().filter((item) => item.name === name);
  const queryAllByText = (text: string | RegExp) =>
    all().filter(
      (item) =>
        matches(textOf(item), text) &&
        // The innermost element showing the text.
        !item.children.some((child) => child.kind === 'element' && matches(textOf(child), text)),
    );
  const only = (found: TestElement[], what: string) => {
    if (found.length !== 1)
      throw new Error(`Expected one element ${what}, found ${found.length}\n${describe(receiver.root)}`);
    return found[0]!;
  };

  return {
    /** The tree the host received. */
    root: receiver.root,
    /** What the host would drop or refuse to draw, as messages. */
    warnings: () => [...receiver.warnings, ...receiver.check()],
    /** Broker calls made, in order; `editor.propose` included. */
    calls,
    /** Values an attribute editor proposed. */
    proposals: () =>
      calls.filter((call) => call.method === 'editor.propose').map((call) => (call.payload as { value: unknown }).value),
    /** Element method calls, such as `focus`. */
    methodCalls: receiver.calls,
    queryAllByElement,
    getByElement: (name: UiKitElementName) => only(queryAllByElement(name), `<${name}>`),
    queryAllByText,
    getByText: (text: string | RegExp) => only(queryAllByText(text), `with text ${String(text)}`),
    /** The one element whose `label` prop matches, such as a TextField. */
    getByLabel: (label: string | RegExp) =>
      only(
        all().filter((item) => typeof item.props.label === 'string' && matches(item.props.label, label)),
        `labelled ${String(label)}`,
      ),
    text: textOf,
    /** Sends an event the host would send, with its payload, and settles. */
    fire: async (element: TestElement, event: string, payload: unknown = {}) => {
      const declared = element.name ? (UI_KIT_ELEMENTS[element.name].events as readonly string[]) : [];
      if (!declared.includes(event))
        throw new Error(`${element.name ?? element.tag} has no '${event}' event`);
      const listener = element.listeners[event];
      if (!listener) throw new Error(`${element.name} has no '${event}' listener`);
      await listener(payload);
      await settle();
    },
    /** Sends the host's next init: a new context, theme, locale, etc. */
    update: async (next: Partial<Omit<NativeMountInit, 'ui_kit'>>) => {
      init = { ...init, ...next };
      mount.update(init);
      await settle();
    },
    unmount: async () => {
      mount.unmount();
      await settle();
    },
    settle,
    /** The tree as indented text, for debugging and snapshots. */
    debug: () => describe(receiver.root),
  };
};

export type RenderResult = Awaited<ReturnType<typeof renderContribution>>;

const describe = (node: TestRoot | TestNode, depth = 0): string => {
  const pad = '  '.repeat(depth);
  if (node.kind === 'root') return node.children.map((child) => describe(child, depth)).join('\n');
  if (node.kind === 'text') return `${pad}${JSON.stringify(node.text)}`;
  if (node.kind === 'ignored') return `${pad}<!-- -->`;
  const props = Object.entries(node.props)
    .filter(([, value]) => value !== undefined && value !== false)
    .map(([key, value]) => ` ${key}=${JSON.stringify(value)}`)
    .join('');
  const slot = node.slot === undefined ? '' : ` slot="${node.slot}"`;
  const events = Object.keys(node.listeners).map((event) => ` on:${event}`).join('');
  const children = node.children.map((child) => describe(child, depth + 1));
  return [`${pad}<${node.name ?? node.tag}${slot}${props}${events}>`, ...children].join('\n');
};
