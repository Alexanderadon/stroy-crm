import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const { userId, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && userId) return <Navigate to="/" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setSubmitting(false);
    if (result.error) {
      setError(
        result.error.status === 400
          ? 'Неверный email или пароль'
          : 'Не удалось войти. Попробуйте ещё раз',
      );
    }
  };

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder p="lg" radius="md" w="100%" maw={380}>
        <form onSubmit={submit}>
          <Stack>
            <Title order={3}>Объекты и задачи</Title>
            {error && <Alert color="red">{error}</Alert>}
            <TextInput
              label="Email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.currentTarget.value)}
            />
            <PasswordInput
              label="Пароль"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
            <Button type="submit" loading={submitting}>
              Войти
            </Button>
            <Text size="xs" c="dimmed">
              Регистрации нет: учётные записи выдаёт администратор.
            </Text>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
