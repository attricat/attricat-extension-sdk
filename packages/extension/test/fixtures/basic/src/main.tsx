import { useState } from 'preact/hooks';
import { Button, Stack, Text } from '@attricat/ui-kit';
import { register, useAttricat, useOutletContext } from '@attricat/extension';

const Panel = () => {
  const { record_id } = useOutletContext<{ record_id: string }>();
  const attricat = useAttricat();
  const [count, setCount] = useState(0);
  return (
    <Stack>
      <Text>{`Record ${record_id}: ${count}`}</Text>
      <Button
        onPress={async () => {
          setCount((value) => value + 1);
          await attricat.notify({ message: 'pressed' });
        }}
      >
        Press
      </Button>
    </Stack>
  );
};

register('panel', Panel);
