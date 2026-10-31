import { describe, expect, it } from 'vitest';
import { h, render } from 'preact';
import {
  Button,
  EmptyState,
  Table,
  TextField,
  UI_KIT_ELEMENTS,
  UI_KIT_TAGS,
  UI_KIT_VERSION,
} from './index.js';

describe('UI kit components', () => {
  it('defines every element under its contract tag', () => {
    expect(UI_KIT_VERSION).toBe('1.0.0');
    for (const tag of Object.values(UI_KIT_TAGS))
      expect(customElements.get(tag), tag).toBeDefined();
    expect(Object.keys(UI_KIT_ELEMENTS)).toHaveLength(16);
  });

  it('sets declared props and maps onX props to event payloads', () => {
    const root = document.createElement('div');
    const changes: unknown[] = [];
    const rows: unknown[] = [];
    render(
      h('div', null, [
        h(TextField, { label: 'Name', value: 'a', onChange: (payload) => changes.push(payload) }),
        h(Table, {
          label: 'T',
          columns: [{ key: 'a', label: 'A' }],
          rows: [],
          onRowPress: (payload) => rows.push(payload),
        }),
      ]),
      root,
    );
    const field = root.querySelector('attricat-text-field')!;
    expect(field.label).toBe('Name');
    expect(field.value).toBe('a');
    field.dispatchEvent(new CustomEvent('change', { detail: { value: 'b' } }));
    expect(changes).toEqual([{ value: 'b' }]);
    const table = root.querySelector('attricat-table')!;
    table.dispatchEvent(new CustomEvent('rowPress', { detail: { id: 'r1' } }));
    expect(rows).toEqual([{ id: 'r1' }]);
  });

  it('puts slot props in the slot without a wrapper element', () => {
    const root = document.createElement('div');
    render(h(EmptyState, { title: 'Nothing', action: h(Button, null, 'Add') }), root);
    const empty = root.querySelector('attricat-empty-state')!;
    const [child] = Array.from(empty.children);
    expect(child?.localName).toBe('attricat-button');
    expect(child?.getAttribute('slot')).toBe('action');
  });
});
