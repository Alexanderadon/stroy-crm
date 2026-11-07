import { Stack, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { DataState } from '../components/DataState';
import { TaskTable } from '../components/TaskTable';
import { supabase } from '../lib/supabase';

export function MyTasksPage() {
  const profile = useProfile();

  const tasks = useQuery({
    queryKey: ['my-tasks', profile.id],
    enabled: profile.role === 'executor',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, created_at, object:objects(name)')
        .eq('assignee_id', profile.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  if (profile.role !== 'executor') return <Navigate to="/objects" replace />;

  return (
    <Stack>
      <Title order={2}>Мои задачи</Title>
      <DataState query={tasks}>
        {(rows) => <TaskTable tasks={rows} showObject emptyText="Вам пока не назначено задач." />}
      </DataState>
    </Stack>
  );
}
