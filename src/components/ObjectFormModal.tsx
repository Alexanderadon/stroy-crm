import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { CONFLICT_MESSAGE, useAppMutation } from '../lib/useAppMutation';

type Props = {
  object?: { id: string; name: string; address: string; updated_at: string };
  onClose: () => void;
};

export function ObjectFormModal({ object, onClose }: Props) {
  const [name, setName] = useState(object?.name ?? '');
  const [address, setAddress] = useState(object?.address ?? '');
  // Версия на момент открытия формы: данные страницы могут обновиться, пока окно открыто.
  const [openedVersion] = useState(object?.updated_at);

  const save = useAppMutation(async () => {
    const values = { name: name.trim(), address: address.trim() };
    if (object) {
      const { data, error } = await supabase
        .from('objects')
        .update(values)
        .eq('id', object.id)
        .eq('updated_at', openedVersion!)
        .select('id');
      if (error) throw error;
      if (data.length === 0) throw new Error(CONFLICT_MESSAGE);
    } else {
      const { error } = await supabase.from('objects').insert(values);
      if (error) throw error;
    }
  }, onClose);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Modal opened onClose={onClose} title={object ? 'Изменить объект' : 'Новый объект'}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Название"
            required
            maxLength={200}
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <TextInput
            label="Адрес"
            required
            maxLength={300}
            value={address}
            onChange={(event) => setAddress(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={save.isPending}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
