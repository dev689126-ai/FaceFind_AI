import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { ToastProvider } from '@/context/ToastContext';
import { AppLayout, AdminLayout } from '@/components/layout/AppLayout';
import { Login, Signup, ForgotPassword } from '@/pages/auth/AuthPages';
import { Dashboard } from '@/pages/Dashboard';
import { Upload } from '@/pages/Upload';
import { FaceSearch } from '@/pages/FaceSearch';
import { Gallery } from '@/pages/Gallery';
import { Albums } from '@/pages/Albums';
import { Admin } from '@/pages/Admin';
import { MobileNav } from '@/components/layout/MobileNav';
import { isSupabaseConfigured } from '@/lib/supabase';

function ConfigError() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 p-6 text-center dark:bg-slate-900">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-rose-500 dark:bg-rose-500/10">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-white">Configuration required</h1>
      <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
        This app needs a Supabase project to function. The connection details couldn't be found.
        If you're the developer, make sure <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">VITE_SUPABASE_URL</code> and{' '}
        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">VITE_SUPABASE_ANON_KEY</code> are set in your environment.
      </p>
    </div>
  );
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return <Navigate to={user ? '/dashboard' : '/login'} replace />;
}

export default function App() {
  if (!isSupabaseConfigured) return <ConfigError />;
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<RootRedirect />} />
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route element={<AppLayout />}>
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/upload" element={<Upload />} />
                  <Route path="/search" element={<FaceSearch />} />
                  <Route path="/gallery" element={<Gallery />} />
                  <Route path="/albums" element={<Albums />} />
                </Route>
                <Route element={<AdminLayout />}>
                  <Route path="/admin" element={<Admin />} />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
              <MobileNav />
            </BrowserRouter>
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
