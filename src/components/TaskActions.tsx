import { Button, Group, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { useProfile } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';
import { getAvailableActions, type TaskAction, type TaskStatus } from '../lib/tasks';
import { useAppMutation } from '../lib/useAppMutation';

type Props = {
  task: { id: string; status: TaskStatus; assignee_id: string };
};

export function TaskActions({ task }: Props) {
  const profile = useProfile();
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);

  const change = useAppMutation<TaskAction>(
    async (action) => {
      const { error } = await supabase.rpc('change_task_status', {
        p_task_id: task.id,
        p_to_status: action.to,
        p_comment: comment.trim() || undefined,
      });
      if (error) throw error;
    },
    () => setComment(''),
  );

  const actions = getAvailableActions(task, profile);
  if (actions.length === 0) {
    return <Text c="dimmed">Сейчас для вас нет доступных действий по этой задаче.</Text>;
  }

  const run = (action: TaskAction) => {
    if (action.requiresComment && !comment.trim()) {
      setCommentError('Укажите, что нужно доработать');
      return;
    }
    setCommentError(null);
    change.mutate(action);
  };

  const commentRequired = actions.some((action) => action.requiresComment);

  return (
    <Stack>
      <Textarea
        label="Комментарий"
        description={commentRequired ? 'Обязателен при возврате на доработку' : 'Необязательно'}
        autosize
        minRows={2}
        maxLength={2000}
        value={comment}
        error={commentError}
        onChange={(event) => {
          setComment(event.currentTarget.value);
          setCommentError(null);
        }}
      />
      <Group>
        {actions.map((action) => (
          <Button
            key={action.to}
            color={action.color}
            loading={change.isPending && change.variables?.to === action.to}
            disabled={change.isPending}
            onClick={() => run(action)}
          >
            {action.label}
          </Button>
        ))}
      </Group>
    </Stack>
  );
}
