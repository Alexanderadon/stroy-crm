import { Button, Group, Stack, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { DataState } from '../components/DataState';
import { ObjectFormModal } from '../components/ObjectFormModal';
import { TaskFormModal } from '../components/TaskFormModal';
import { TaskTable, type TaskRow } from '../components/TaskTable';
import { supabase } from '../lib/supabase';
import { useAppMutation } from '../lib/useAppMutation';

export function ObjectPage() {
  const { id = '' } = useParams();
  const profile = useProfile();
  const navigate = useNavigate();
  const isManager = profile.role === 'manager';
  const [editing, setEditing] = useState(false);
  const [addingTask, setAddingTask] = useState(false);

  const object = useQuery({
    queryKey: ['object', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .select('id, name, address')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const tasks = useQuery({
    queryKey: ['tasks', 'object', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, created_at, assignee:profiles!tasks_assignee_id_fkey(full_name)')
        .eq('object_id', id)
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });

  const remove = useAppMutation(
    async () => {
      const { error } = await supabase.rpc('delete_object', { p_object_id: id });
      if (error) throw error;
    },
    () => navigate('/objects'),
  );

  const removeTask = useAppMutation<string>(async (taskId) => {
    const { error } = await supabase.rpc('delete_task', { p_task_id: taskId });
    if (error) throw error;
  });

  const confirmRemove = () => {
    if (window.confirm('Удалить объект? Он исчезнет из списка.')) remove.mutate();
  };

  const confirmRemoveTask = (task: TaskRow) => {
    if (window.confirm(`Удалить задачу «${task.title}»? Она исчезнет из списков, история сохранится.`)) {
      removeTask.mutate(task.id);
    }
  };

  return (
    <DataState query={object}>
      {(data) => (
        <Stack>
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={2}>{data.name}</Title>
              <Text c="dimmed">{data.address}</Text>
            </div>
            {isManager && (
              <Group>
                <Button variant="default" onClick={() => setEditing(true)}>
                  Изменить объект
                </Button>
                <Button variant="light" color="red" loading={remove.isPending} onClick={confirmRemove}>
                  Удалить объект
                </Button>
              </Group>
            )}
          </Group>

          <Group justify="space-between">
            <Title order={4}>{isManager ? 'Задачи' : 'Мои задачи на объекте'}</Title>
            {isManager && <Button onClick={() => setAddingTask(true)}>Добавить задачу</Button>}
          </Group>

          <DataState query={tasks}>
            {(rows) => (
              <TaskTable
                tasks={rows}
                showAssignee={isManager}
                emptyText="Задач пока нет."
                onDelete={isManager ? confirmRemoveTask : undefined}
                deleteDisabled={removeTask.isPending}
              />
            )}
          </DataState>

          {editing && <ObjectFormModal object={data} onClose={() => setEditing(false)} />}
          {addingTask && <TaskFormModal defaultObjectId={id} onClose={() => setAddingTask(false)} />}
        </Stack>
      )}
    </DataState>
  );
}
