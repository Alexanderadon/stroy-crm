import { Navigate, Route, Routes } from 'react-router';
import { RequireAuth } from './auth/RequireAuth';
import { useProfile } from './auth/AuthProvider';
import { LoginPage } from './pages/LoginPage';
import { MyTasksPage } from './pages/MyTasksPage';
import { ObjectPage } from './pages/ObjectPage';
import { ObjectsPage } from './pages/ObjectsPage';
import { TaskPage } from './pages/TaskPage';

function HomeRedirect() {
  const profile = useProfile();
  return <Navigate to={profile.role === 'manager' ? '/objects' : '/my-tasks'} replace />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route index element={<HomeRedirect />} />
        <Route path="/objects" element={<ObjectsPage />} />
        <Route path="/objects/:id" element={<ObjectPage />} />
        <Route path="/tasks/:id" element={<TaskPage />} />
        <Route path="/my-tasks" element={<MyTasksPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
