import { Alert, Center, Loader } from '@mantine/core';
import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { errorMessage } from '../lib/useAppMutation';

type Props<T> = {
  query: UseQueryResult<T>;
  children: (data: NonNullable<T>) => ReactNode;
};

/** Загрузка, ошибка и «нет доступа» выглядят на всех экранах одинаково. */
export function DataState<T>({ query, children }: Props<T>) {
  if (query.isLoading) {
    return (
      <Center py="xl">
        <Loader />
      </Center>
    );
  }
  if (query.error) {
    return (
      <Alert color="red" title="Не удалось загрузить данные">
        {errorMessage(query.error)}
      </Alert>
    );
  }
  if (query.data === null || query.data === undefined) {
    return (
      <Alert color="gray" title="Не найдено">
        Запись не существует, удалена или у вас нет к ней доступа.
      </Alert>
    );
  }
  return <>{children(query.data as NonNullable<T>)}</>;
}
