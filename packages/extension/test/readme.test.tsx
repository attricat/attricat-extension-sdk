// The README's examples, kept compiling and passing.
import { expect, it } from 'vitest';
import { useState } from 'preact/hooks';
import { Button, EmptyState, Stack, Text, TextField } from '@attricat/ui-kit';
import {
  register,
  useAttricat,
  useEditor,
  useLocale,
  useOutletContext,
  type RecordTabContext,
} from '../src/index.js';

const Summary = () => {
  const { record_id } = useOutletContext<RecordTabContext>();
  const locale = useLocale();
  const attricat = useAttricat();
  const [note, setNote] = useState<string>();

  if (note === undefined)
    return (
      <EmptyState
        title={locale === 'pl' ? 'Brak notatki' : 'No note yet'}
        action={
          <Button
            onPress={async () => {
              // A server command of this extension; its answer is yours to define.
              const { note } = await attricat.command<{ note: string }>({
                command_id: 'load-note',
                payload: { record_id },
              });
              setNote(note);
            }}
          >
            Load
          </Button>
        }
      />
    );
  return (
    <Stack gap="sm">
      <Text tone="muted">{`Record ${record_id}`}</Text>
      <TextField
        label="Note"
        value={note}
        onChange={({ value }) => setNote(value)}
        onSubmit={({ value }) =>
          attricat.command({ command_id: 'save-note', payload: { record_id, note: value } })
        }
      />
    </Stack>
  );
};

const Formula = () => {
  const editor = useEditor<{ rows?: number }>();
  return (
    <TextField
      label={editor.attribute.name}
      hideLabel
      multiline
      monospace
      rows={editor.props.rows ?? 3}
      value={String(editor.value ?? '')}
      readOnly={editor.readOnly}
      onChange={({ value }) => editor.propose(value === '' ? null : value)}
    />
  );
};

export { Summary, Formula };

import { renderContribution } from '../src/testing.js';

it('saves the note', async () => {
  const view = await renderContribution(Summary, {
    context: { context_version: 1, record_id: 'r1' },
    broker: { command: ({ command_id }: { command_id: string }) => (command_id === 'load-note' ? { note: 'hello' } : null) },
  });
  await view.fire(view.getByText('Load'), 'press');
  expect(view.getByLabel('Note').props.value).toBe('hello');
  await view.fire(view.getByLabel('Note'), 'submit', { value: 'new' });
  expect(view.calls.at(-1)).toEqual({
    method: 'command',
    payload: { command_id: 'save-note', payload: { record_id: 'r1', note: 'new' } },
  });
  expect(view.warnings()).toEqual([]);
});
