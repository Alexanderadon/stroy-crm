import { Anchor, Table, Text } from '@mantine/core';
import { Link } from 'react-router';
import { formatDate, type TaskStatus } from '../lib/tasks';
import { StatusBadge } from './StatusBadge';

export type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  created_at: string;
  assignee?: { full_name: string } | null;
  object?: { name: string } | null;
};

type Props = {
  tasks: TaskRow[];
  showAssignee?: boolean;
  showObject?: boolean;
  emptyText: string;
};

export function TaskTable({ tasks, showAssignee, showObject, emptyText }: Props) {
  if (tasks.length === 0) return <Text c="dimmed">{emptyText}</Text>;

  return (
    <Table.ScrollContainer minWidth={600}>
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Задача</Table.Th>
            {showObject && <Table.Th>Объект</Table.Th>}
            {showAssignee && <Table.Th>Исполнитель</Table.Th>}
            <Table.Th>Статус</Table.Th>
            <Table.Th>Создана</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {tasks.map((task) => (
            <Table.Tr key={task.id}>
              <Table.Td>
                <Anchor component={Link} to={`/tasks/${task.id}`}>
                  {task.title}
                </Anchor>
              </Table.Td>
              {showObject && <Table.Td>{task.object?.name ?? '—'}</Table.Td>}
              {showAssignee && <Table.Td>{task.assignee?.full_name ?? '—'}</Table.Td>}
              <Table.Td>
                <StatusBadge status={task.status} />
              </Table.Td>
              <Table.Td>{formatDate(task.created_at)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}
