import { describe, expect, it } from 'vitest';
import { useState } from 'preact/hooks';
import { Button, EmptyState, Stack, Text, TextField } from '@attricat/ui-kit';
import { useAttricat, useEditor, useLocale, useOutletContext, useTheme } from '../src/index.js';
import { renderContribution } from '../src/testing.js';

const Counter = () => {
  const [count, setCount] = useState(0);
  const { record_id } = useOutletContext<{ record_id: string }>();
  const locale = useLocale();
  const { color_mode } = useTheme();
  return (
    <Stack>
      <Text>{`Record ${record_id} (${locale}, ${color_mode})`}</Text>
      <Text>Count {count}</Text>
      <Button onPress={() => setCount(count + 1)}>Add</Button>
    </Stack>
  );
};

describe('renderContribution', () => {
  it('renders, fires events and keeps state across updates', async () => {
    const view = await renderContribution(Counter, { context: { record_id: 'r1' }, locale: 'pl' });
    expect(view.getByText('Record r1 (pl, light)')).toBeDefined();
    await view.fire(view.getByText('Add'), 'press');
    await view.fire(view.getByText('Add'), 'press');
    expect(view.getByText('Count 2').name).toBe('Text');
    await view.update({ context: { record_id: 'r2' }, theme: { color_mode: 'dark' } });
    expect(view.getByText('Record r2 (pl, dark)')).toBeDefined();
    expect(view.getByText('Count 2')).toBeDefined();
    expect(view.warnings()).toEqual([]);
    await view.unmount();
    expect(view.root.children).toEqual([]);
  });

  it('records broker calls and answers them from the broker', async () => {
    const Notes = () => {
      const attricat = useAttricat();
      const [note, setNote] = useState('');
      return (
        <Stack>
          <Text>{note || 'none'}</Text>
          <Button
            onPress={async () => {
              const value = await attricat.storage.get<{ value: string }>({ key: 'note' });
              setNote(value.value);
              await attricat.notify({ message: 'Loaded', severity: 'success' });
            }}
          >
            Load
          </Button>
        </Stack>
      );
    };
    const view = await renderContribution(Notes, {
      broker: { 'storage.get': { value: 'hello' }, notify: null },
    });
    await view.fire(view.getByText('Load'), 'press');
    expect(view.getByText('hello')).toBeDefined();
    expect(view.calls).toEqual([
      { method: 'storage.get', payload: { key: 'note' } },
      { method: 'notify', payload: { message: 'Loaded', severity: 'success' } },
    ]);
  });

  it('collects editor proposals', async () => {
    const Editor = () => {
      const editor = useEditor<{ placeholder?: string }>();
      return (
        <TextField
          label={editor.attribute.name}
          hideLabel
          value={String(editor.value ?? '')}
          placeholder={editor.props.placeholder}
          onChange={({ value }) => editor.propose(value.toUpperCase())}
        />
      );
    };
    const view = await renderContribution(Editor, {
      context: {
        context_version: 1,
        record_id: 'r',
        context_id: null,
        value: 'a',
        attribute: { code: 'c', name: 'Code', value_type: 'text', constraints: null, options: null },
        read_only: false,
        required: false,
        errors: [],
        props: { placeholder: 'Type' },
      },
    });
    const field = view.getByLabel('Code');
    expect(field.props).toMatchObject({ value: 'a', placeholder: 'Type', hideLabel: true });
    await view.fire(field, 'change', { value: 'abc' });
    expect(view.proposals()).toEqual(['ABC']);
  });

  it('reports what the host would drop', async () => {
    const Wrong = () => (
      <Stack>
        {'loose text'}
        <EmptyState title="Empty" action={<Button>Add</Button>} />
        <div>raw</div>
      </Stack>
    );
    const view = await renderContribution(Wrong);
    expect(view.getByElement('Button').slot).toBe('action');
    expect(view.warnings()).toEqual([
      '<div> is not a UI kit element and would be dropped',
      "text 'loose text' inside Stack is not drawn",
    ]);
    await expect(view.fire(view.getByElement('Stack'), 'press')).rejects.toThrow("no 'press' event");
  });
});
