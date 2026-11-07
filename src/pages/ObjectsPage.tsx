import { Anchor, Button, Group, Stack, Table, Text, Title } from '@mantine/core';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { useProfile } from '../auth/AuthProvider';
import { DataState } from '../components/DataState';
import { ObjectFormModal } from '../components/ObjectFormModal';
import { supabase } from '../lib/supabase';

export function ObjectsPage() {
  const profile = useProfile();
  const [creating, setCreating] = useState(false);

  const objects = useQuery({
    queryKey: ['objects'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('objects')
        .select('id, name, address, tasks(count)')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Объекты</Title>
        {profile.role === 'manager' && <Button onClick={() => setCreating(true)}>Добавить объект</Button>}
      </Group>

      <DataState query={objects}>
        {(rows) =>
          rows.length === 0 ? (
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
          )
        }
      </DataState>

      {creating && <ObjectFormModal onClose={() => setCreating(false)} />}
    </Stack>
  );
}
