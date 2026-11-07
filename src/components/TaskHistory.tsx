import { Text, Timeline } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { formatDate, STATUS_LABEL } from '../lib/tasks';
import { DataState } from './DataState';

export function TaskHistory({ taskId }: { taskId: string }) {
  const history = useQuery({
    queryKey: ['history', taskId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_history')
        .select('id, from_status, to_status, comment, actor_name, created_at')
        .eq('task_id', taskId)
        .order('id');
      if (error) throw error;
      return data;
    },
  });

  return (
    <DataState query={history}>
      {(rows) => (
        <Timeline active={rows.length - 1} bulletSize={14} lineWidth={2}>
          {rows.map((row) => (
            <Timeline.Item
              key={row.id}
              title={
                row.from_status
                  ? `${STATUS_LABEL[row.from_status]} → ${STATUS_LABEL[row.to_status]}`
                  : `Создана: ${STATUS_LABEL[row.to_status]}`
              }
            >
              <Text size="sm" c="dimmed">
                {row.actor_name}, {formatDate(row.created_at)}
              </Text>
              {row.comment && (
                <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
                  {row.comment}
                </Text>
              )}
            </Timeline.Item>
          ))}
        </Timeline>
      )}
    </DataState>
  );
}
