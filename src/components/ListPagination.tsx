import { Group, Pagination } from '@mantine/core';
import { useEffect } from 'react';
import { PAGE_SIZE } from '../lib/pagination';

type Props = {
  page: number;
  total: number;
  rowsOnPage: number;
  onChange: (page: number) => void;
};

export function ListPagination({ page, total, rowsOnPage, onChange }: Props) {
  // Страница опустела, например после удаления последней записи: возвращаемся на предыдущую.
  useEffect(() => {
    if (rowsOnPage === 0 && page > 1) onChange(page - 1);
  }, [rowsOnPage, page, onChange]);

  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;

  return (
    <Group justify="center">
      <Pagination value={page} total={pages} onChange={onChange} />
    </Group>
  );
}
