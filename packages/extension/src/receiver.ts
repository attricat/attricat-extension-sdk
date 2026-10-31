import {
  MUTATION_TYPE_INSERT_CHILD,
  MUTATION_TYPE_REMOVE_CHILD,
  MUTATION_TYPE_UPDATE_PROPERTY,
  MUTATION_TYPE_UPDATE_TEXT,
  NODE_TYPE_ELEMENT,
  NODE_TYPE_TEXT,
  ROOT_ID,
  UPDATE_PROPERTY_TYPE_ATTRIBUTE,
  UPDATE_PROPERTY_TYPE_EVENT_LISTENER,
  type RemoteConnection,
  type RemoteMutationRecord,
  type RemoteNodeSerialization,
} from '@remote-dom/core';
import { UI_KIT_ELEMENTS, UI_KIT_TAGS, type UiKitElementName } from '@attricat/ui-kit/version';

export type TestTextNode = { kind: 'text'; id: string; text: string; parent?: TestElement | TestRoot };
export type TestElement = {
  kind: 'element';
  id: string;
  tag: string;
  /** The UI kit element, or undefined for a tag the host would drop. */
  name: UiKitElementName | undefined;
  props: Record<string, unknown>;
  listeners: Record<string, (payload: unknown) => unknown>;
  slot: string | undefined;
  children: TestNode[];
  parent?: TestElement | TestRoot;
};
export type TestNode = TestTextNode | TestElement | { kind: 'ignored'; id: string; parent?: TestElement | TestRoot };
export type TestRoot = { kind: 'root'; id: string; children: TestNode[] };

const tagNames = new Map(
  Object.entries(UI_KIT_TAGS).map(([name, tag]) => [tag as string, name as UiKitElementName]),
);

/**
 * A stand-in for the host's receiver. It keeps the tree an extension sends
 * and reports, as warnings, what the host would drop: unknown tags,
 * undeclared props and events, attributes other than `slot`, misplaced text,
 * and missing required props. Prop values are not checked against their
 * JSON Schema here; the host does that.
 */
export class TestReceiver {
  readonly root: TestRoot = { kind: 'root', id: ROOT_ID, children: [] };
  readonly warnings: string[] = [];
  readonly calls: { id: string; method: string; args: unknown[] }[] = [];
  readonly connection: RemoteConnection;
  #nodes = new Map<string, TestNode | TestRoot>([[ROOT_ID, this.root]]);

  constructor() {
    this.connection = {
      mutate: (records) => this.mutate(records),
      call: (id, method, ...args) => {
        this.calls.push({ id, method, args: [...args] });
      },
    };
  }

  mutate(records: readonly RemoteMutationRecord[]) {
    for (const record of records)
      switch (record[0]) {
        case MUTATION_TYPE_INSERT_CHILD: {
          const parent = this.#nodes.get(record[1]);
          if (parent?.kind !== 'element' && parent?.kind !== 'root') break;
          const node = this.#build(record[2], parent);
          parent.children.splice(record[3] ?? parent.children.length, 0, node);
          break;
        }
        case MUTATION_TYPE_REMOVE_CHILD: {
          const parent = this.#nodes.get(record[1]);
          if (parent?.kind !== 'element' && parent?.kind !== 'root') break;
          const [removed] = parent.children.splice(record[2], 1);
          if (removed) this.#forget(removed);
          break;
        }
        case MUTATION_TYPE_UPDATE_TEXT: {
          const node = this.#nodes.get(record[1]);
          if (node?.kind === 'text') node.text = record[2];
          break;
        }
        case MUTATION_TYPE_UPDATE_PROPERTY: {
          const node = this.#nodes.get(record[1]);
          if (node?.kind !== 'element') break;
          const [, , name, value, type] = record;
          if (type === UPDATE_PROPERTY_TYPE_EVENT_LISTENER) this.#listener(node, name, value);
          else if (type === UPDATE_PROPERTY_TYPE_ATTRIBUTE) this.#attribute(node, name, value);
          else this.#property(node, name, value);
          break;
        }
      }
  }

  /** Warnings for elements the host would not draw as they stand. */
  check(node: TestRoot | TestElement = this.root): string[] {
    const problems: string[] = [];
    const visit = (parent: TestRoot | TestElement) => {
      const definition = parent.kind === 'element' && parent.name ? UI_KIT_ELEMENTS[parent.name] : undefined;
      const accepts = parent.kind === 'root' ? 'elements' : (definition?.children ?? 'none');
      if (definition && parent.kind === 'element') {
        for (const [prop, item] of Object.entries(definition.props))
          if (item.required && parent.props[prop] === undefined)
            problems.push(`${parent.name} is missing required prop '${prop}'`);
      }
      for (const child of parent.children) {
        if (child.kind === 'element' && child.slot !== undefined) {
          const slots: Record<string, readonly string[]> = definition?.slots ?? {};
          if (!slots[child.slot]?.includes(child.name ?? ''))
            problems.push(`${child.name ?? child.tag} cannot fill slot '${child.slot}'`);
        } else if (child.kind === 'text' && accepts !== 'text' && child.text.trim())
          problems.push(`text '${child.text}' inside ${parent.kind === 'root' ? 'the root' : parent.name} is not drawn`);
        else if (child.kind === 'element' && accepts !== 'elements')
          problems.push(`${child.name ?? child.tag} inside ${parent.kind === 'root' ? 'the root' : parent.name} is not drawn`);
        if (child.kind === 'element' && child.name) visit(child);
      }
    };
    visit(node);
    return problems;
  }

  #warn(message: string) {
    if (!this.warnings.includes(message)) this.warnings.push(message);
  }

  #build(serialization: RemoteNodeSerialization, parent: TestElement | TestRoot): TestNode {
    const id = String(serialization.id);
    let node: TestNode;
    if (serialization.type === NODE_TYPE_TEXT) node = { kind: 'text', id, text: serialization.data, parent };
    else if (serialization.type === NODE_TYPE_ELEMENT) {
      const name = tagNames.get(serialization.element);
      if (!name) this.#warn(`<${serialization.element}> is not a UI kit element and would be dropped`);
      const element: TestElement = {
        kind: 'element',
        id,
        tag: serialization.element,
        name,
        props: {},
        listeners: {},
        slot: undefined,
        children: [],
        parent,
      };
      node = element;
      this.#nodes.set(id, element);
      for (const [key, value] of Object.entries(serialization.properties ?? {})) this.#property(element, key, value);
      for (const [key, value] of Object.entries(serialization.attributes ?? {})) this.#attribute(element, key, value);
      for (const [key, value] of Object.entries(serialization.eventListeners ?? {})) this.#listener(element, key, value);
      element.children = (serialization.children ?? []).map((child) => this.#build(child, element));
    } else node = { kind: 'ignored', id, parent };
    this.#nodes.set(id, node);
    return node;
  }

  #forget(node: TestNode) {
    this.#nodes.delete(node.id);
    if (node.kind === 'element') node.children.forEach((child) => this.#forget(child));
  }

  #property(node: TestElement, name: string, value: unknown) {
    if (value === undefined) {
      delete node.props[name];
      return;
    }
    if (node.name && !(name in UI_KIT_ELEMENTS[node.name].props))
      this.#warn(`${node.name}.${name} is not a declared prop and would be dropped`);
    node.props[name] = value;
  }

  #attribute(node: TestElement, name: string, value: unknown) {
    if (name !== 'slot') {
      this.#warn(`attribute '${name}' would be dropped`);
      return;
    }
    node.slot = typeof value === 'string' ? value : undefined;
  }

  #listener(node: TestElement, name: string, value: unknown) {
    if (typeof value !== 'function') {
      delete node.listeners[name];
      return;
    }
    if (node.name && !(UI_KIT_ELEMENTS[node.name].events as readonly string[]).includes(name))
      this.#warn(`${node.name} has no '${name}' event`);
    node.listeners[name] = value as (payload: unknown) => unknown;
  }
}

/** The text an element shows: its text children, recursively. */
export const textOf = (node: TestNode | TestRoot): string => {
  if (node.kind === 'text') return node.text;
  if (node.kind === 'ignored') return '';
  return node.children.map(textOf).join('');
};

/** Every element below a node, depth first. */
export const elementsOf = (node: TestRoot | TestElement): TestElement[] =>
  node.children.flatMap((child) => (child.kind === 'element' ? [child, ...elementsOf(child)] : []));
