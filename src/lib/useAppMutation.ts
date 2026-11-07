import { notifications } from '@mantine/notifications';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const CYRILLIC = /[а-яё]/i;

/** Сообщения функций базы уже на русском, остальные ошибки переводим в понятный текст. */
export function errorMessage(error: unknown): string {
  const { code, message } = (error ?? {}) as { code?: string; message?: string };
  if (message && CYRILLIC.test(message)) return message;
  if (code === '42501') return 'Недостаточно прав для этого действия';
  if (code === '23514') return 'Проверьте поля: они не должны быть пустыми или слишком длинными';
  return 'Не удалось выполнить действие. Попробуйте ещё раз';
}

export function useAppMutation<TVariables = void>(
  mutationFn: (variables: TVariables) => Promise<void>,
  onSuccess?: () => void,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: async () => {
      onSuccess?.();
      await queryClient.invalidateQueries();
    },
    onError: (error) => {
      notifications.show({ color: 'red', title: 'Ошибка', message: errorMessage(error) });
    },
  });
}
