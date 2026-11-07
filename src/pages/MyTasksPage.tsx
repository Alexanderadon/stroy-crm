import { Stack, Title } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Navigate } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { DataState } from '../components/DataState';
import { ListPagination } from '../components/ListPagination';
import { TaskTable } from '../components/TaskTable';
import { fetchPage } from '../lib/pagination';
import { supabase } from '../lib/supabase';

export function MyTasksPage() {
  const profile = useProfile();
  const [page, setPage] = useState(1);

  const tasks = useQuery({
    queryKey: ['my-tasks', profile.id, page],
    enabled: profile.role === 'executor',
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchPage(page, (from, to) =>
        supabase
          .from('tasks')
          .select('id, title, status, created_at, object:objects(name)', { count: 'exact' })
          .eq('assignee_id', profile.id)
          .order('created_at', { ascending: false })
          .order('id')
          .range(from, to),
      ),
  });

  if (profile.role !== 'executor') return <Navigate to="/objects" replace />;

  return (
    <Stack>
      <Title order={2}>Мои задачи</Title>
      <DataState query={tasks}>
        {({ rows, total }) => (
          <Stack>
            <TaskTable tasks={rows} showObject emptyText="Вам пока не назначено задач." />
            <ListPagination page={page} total={total} rowsOnPage={rows.length} onChange={setPage} />
          </Stack>
        )}
      </DataState>
    </Stack>
  );
}
