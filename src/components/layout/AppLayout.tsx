import { Outlet, Navigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { Sidebar } from '@/components/layout/Sidebar';
import { FullPageSpinner } from '@/components/ui/Feedback';

export function AppLayout() {
  const { user, loading } = useAuth();

  if (loading) return <FullPageSpinner label="Loading your workspace…" />;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 dark:bg-slate-900">
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

export function AdminLayout() {
  const { profile, user, loading } = useAuth();
  if (loading) return <FullPageSpinner label="Loading…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (profile?.role !== 'super_admin') return <Navigate to="/dashboard" replace />;
  return <AppLayout />;
}
