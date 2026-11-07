import { Anchor, AppShell, Button, Container, Group, Text } from '@mantine/core';
import { Link, Outlet } from 'react-router';
import { useAuth, useProfile } from '../auth/AuthProvider';
import { ROLE_LABEL } from '../lib/tasks';

export function Layout() {
  const profile = useProfile();
  const { signOut } = useAuth();

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="md" wrap="nowrap">
            {profile.role === 'executor' && (
              <Anchor component={Link} to="/my-tasks" fw={500}>
                Мои задачи
              </Anchor>
            )}
            <Anchor component={Link} to="/objects" fw={500}>
              Объекты
            </Anchor>
          </Group>
          <Group gap="sm" wrap="nowrap">
            <Text size="sm" c="dimmed" visibleFrom="sm">
              {profile.full_name}, {ROLE_LABEL[profile.role].toLowerCase()}
            </Text>
            <Button variant="default" size="xs" onClick={signOut}>
              Выйти
            </Button>
          </Group>
        </Group>
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg" px={0}>
          <Outlet />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
