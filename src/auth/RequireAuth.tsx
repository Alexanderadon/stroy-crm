import { Alert, Button, Center, Container, Loader, Stack } from '@mantine/core';
import { Navigate, useLocation } from 'react-router';
import { Layout } from '../components/Layout';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { loading, userId, profile, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }

  if (!userId) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (!profile) {
    return (
      <Container size="xs" py="xl">
        <Stack>
          <Alert color="red" title="Профиль не найден">
            Для этой учётной записи нет профиля. Обратитесь к администратору.
          </Alert>
          <Button variant="default" onClick={signOut}>
            Выйти
          </Button>
        </Stack>
      </Container>
    );
  }

  return <Layout />;
}
