import { Anchor, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { DataState } from '../components/DataState';
import { StatusBadge } from '../components/StatusBadge';
import { TaskActions } from '../components/TaskActions';
import { TaskFormModal } from '../components/TaskFormModal';
import { TaskHistory } from '../components/TaskHistory';
import { supabase } from '../lib/supabase';
import { formatDate } from '../lib/tasks';
import { useAppMutation } from '../lib/useAppMutation';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text component="div">{children}</Text>
    </div>
  );
}

export function TaskPage() {
  const { id = '' } = useParams();
  const profile = useProfile();
  const navigate = useNavigate();
  const isManager = profile.role === 'manager';
  const [editing, setEditing] = useState(false);

  const task = useQuery({
    queryKey: ['task', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          `id, title, description, status, created_at, object_id, assignee_id,
           object:objects(id, name, address),
           assignee:profiles!tasks_assignee_id_fkey(full_name),
           author:profiles!tasks_author_id_fkey(full_name)`,
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const remove = useAppMutation(
    async () => {
      const { error } = await supabase.rpc('delete_task', { p_task_id: id });
      if (error) throw error;
    },
    () => navigate(task.data ? `/objects/${task.data.object_id}` : '/objects'),
  );

  const confirmRemove = () => {
    if (window.confirm('Удалить задачу? Она исчезнет из списков, история сохранится.')) remove.mutate();
  };

  return (
    <DataState query={task}>
      {(data) => (
        <Stack>
          <Group justify="space-between" align="flex-start">
            <Stack gap={4}>
              <Title order={2}>{data.title}</Title>
              <StatusBadge status={data.status} />
            </Stack>
            {isManager && (
              <Group>
                {data.status !== 'accepted' && (
                  <Button variant="default" onClick={() => setEditing(true)}>
                    Изменить задачу
                  </Button>
                )}
                <Button variant="light" color="red" loading={remove.isPending} onClick={confirmRemove}>
                  Удалить задачу
                </Button>
              </Group>
            )}
          </Group>

          <Paper withBorder p="md">
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <Field label="Объект">
                <Anchor component={Link} to={`/objects/${data.object_id}`}>
                  {data.object?.name ?? '—'}
                </Anchor>
              </Field>
              <Field label="Исполнитель">{data.assignee?.full_name ?? '—'}</Field>
              <Field label="Автор">{data.author?.full_name ?? '—'}</Field>
              <Field label="Дата создания">{formatDate(data.created_at)}</Field>
            </SimpleGrid>
            {data.description && (
              <Stack gap={0} mt="md">
                <Text size="xs" c="dimmed">
                  Описание
                </Text>
                <Text style={{ whiteSpace: 'pre-wrap' }}>{data.description}</Text>
              </Stack>
            )}
          </Paper>

          <Paper withBorder p="md">
            <Title order={4} mb="sm">
              Действия
            </Title>
            <TaskActions task={data} />
          </Paper>

          <Paper withBorder p="md">
            <Title order={4} mb="md">
              История
            </Title>
            <TaskHistory taskId={data.id} />
          </Paper>

          {editing && <TaskFormModal task={data} onClose={() => setEditing(false)} />}
        </Stack>
      )}
    </DataState>
  );
}
