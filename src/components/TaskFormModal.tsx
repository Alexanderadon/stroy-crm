import { Button, Group, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { supabase } from '../lib/supabase';
import { useAppMutation } from '../lib/useAppMutation';

type Props = {
  task?: {
    id: string;
    title: string;
    description: string;
    object_id: string;
    assignee_id: string;
  };
  defaultObjectId?: string;
  onClose: () => void;
};

export function TaskFormModal({ task, defaultObjectId, onClose }: Props) {
  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [objectId, setObjectId] = useState<string | null>(task?.object_id ?? defaultObjectId ?? null);
  const [assigneeId, setAssigneeId] = useState<string | null>(task?.assignee_id ?? null);

  const objects = useQuery({
    queryKey: ['objects', 'options'],
    queryFn: async () => {
      const { data, error } = await supabase.from('objects').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  const executors = useQuery({
    queryKey: ['executors'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name')
        .eq('role', 'executor')
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });

  const save = useAppMutation(async () => {
    const values = {
      title: title.trim(),
      description: description.trim(),
      object_id: objectId!,
      assignee_id: assigneeId!,
    };
    const { error } = task
      ? await supabase.from('tasks').update(values).eq('id', task.id)
      : await supabase.from('tasks').insert(values);
    if (error) throw error;
  }, onClose);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate();
  };

  return (
    <Modal opened onClose={onClose} title={task ? 'Изменить задачу' : 'Новая задача'}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput
            label="Название"
            required
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.currentTarget.value)}
          />
          <Textarea
            label="Описание"
            autosize
            minRows={3}
            maxLength={5000}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
          <Select
            label="Объект"
            required
            searchable
            data={(objects.data ?? []).map((o) => ({ value: o.id, label: o.name }))}
            value={objectId}
            onChange={setObjectId}
          />
          <Select
            label="Исполнитель"
            required
            searchable
            data={(executors.data ?? []).map((e) => ({ value: e.id, label: e.full_name }))}
            value={assigneeId}
            onChange={setAssigneeId}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" loading={save.isPending} disabled={!objectId || !assigneeId}>
              Сохранить
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
