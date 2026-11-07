import { Anchor, Button, Group, Stack, Table, Text, Title } from '@mantine/core';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { DataState } from '../components/DataState';
import { ListPagination } from '../components/ListPagination';
import { ObjectFormModal } from '../components/ObjectFormModal';
import { fetchPage } from '../lib/pagination';
import { supabase } from '../lib/supabase';

export function ObjectsPage() {
  const profile = useProfile();
  const [creating, setCreating] = useState(false);
  const [page, setPage] = useState(1);

  const objects = useQuery({
    queryKey: ['objects', 'list', page],
    placeholderData: keepPreviousData,
    queryFn: () =>
      fetchPage(page, (from, to) =>
        supabase
          .from('objects')
          .select('id, name, address, tasks(count)', { count: 'exact' })
          .order('name')
          .order('id')
          .range(from, to),
      ),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Объекты</Title>
        {profile.role === 'manager' && <Button onClick={() => setCreating(true)}>Добавить объект</Button>}
      </Group>

      <DataState query={objects}>
        {({ rows, total }) => (
          <Stack>
            {rows.length === 0 ? (
              <Text c="dimmed">Объектов пока нет.</Text>
            ) : (
              <Table.ScrollContainer minWidth={500}>
                <Table striped highlightOnHover>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Название</Table.Th>
                      <Table.Th>Адрес</Table.Th>
                      <Table.Th>{profile.role === 'manager' ? 'Задач' : 'Моих задач'}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((object) => (
                      <Table.Tr key={object.id}>
                        <Table.Td>
                          <Anchor component={Link} to={`/objects/${object.id}`}>
                            {object.name}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>{object.address}</Table.Td>
                        <Table.Td>{object.tasks[0]?.count ?? 0}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
            <ListPagination page={page} total={total} rowsOnPage={rows.length} onChange={setPage} />
          </Stack>
        )}
      </DataState>

      {creating && <ObjectFormModal onClose={() => setCreating(false)} />}
    </Stack>
  );
}
