import type { Database } from './database.types';

export type TaskStatus = Database['public']['Enums']['task_status'];
export type UserRole = Database['public']['Enums']['user_role'];

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  review: 'На проверке',
  accepted: 'Принята',
  rework: 'На доработке',
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'blue',
  in_progress: 'yellow',
  review: 'violet',
  accepted: 'green',
  rework: 'red',
};

export const ROLE_LABEL: Record<UserRole, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
};

export type TaskAction = {
  to: TaskStatus;
  label: string;
  color?: string;
  requiresComment?: boolean;
};

/**
 * Какие кнопки показать пользователю. Это только удобство интерфейса:
 * решение о переходе принимает база в функции change_task_status.
 */
export function getAvailableActions(
  task: { status: TaskStatus; assignee_id: string },
  user: { id: string; role: UserRole },
): TaskAction[] {
  const isAssignee = task.assignee_id === user.id;
  const isManager = user.role === 'manager';

  switch (task.status) {
    case 'new':
    case 'rework':
      return isAssignee ? [{ to: 'in_progress', label: 'Взять в работу' }] : [];
    case 'in_progress':
      return isAssignee ? [{ to: 'review', label: 'Отправить на проверку' }] : [];
    case 'review':
      return isManager
        ? [
            { to: 'accepted', label: 'Принять', color: 'green' },
            { to: 'rework', label: 'Вернуть на доработку', color: 'red', requiresComment: true },
          ]
        : [];
    case 'accepted':
      return [];
  }
}

export function formatDate(value: string): string {
  return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}
