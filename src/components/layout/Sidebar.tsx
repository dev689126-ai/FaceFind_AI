import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { useTheme } from '@/context/ThemeContext';
import { LayoutDashboard, Upload, Search, Images, Album, Shield, LogOut, Sun, Moon, Sparkles } from 'lucide-react';

export function Sidebar() {
  const { profile, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const isAdmin = profile?.role === 'super_admin';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
    }`;

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex items-center gap-2 px-6 py-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-cyan-400 text-white shadow-lg shadow-sky-500/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-sm font-bold text-slate-900 dark:text-white">FaceFind</h1>
          <p className="text-[11px] text-slate-400">AI Photo Search</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        <NavLink to="/dashboard" className={linkClass}>
          <LayoutDashboard className="h-5 w-5" /> Dashboard
        </NavLink>
        <NavLink to="/upload" className={linkClass}>
          <Upload className="h-5 w-5" /> Upload
        </NavLink>
        <NavLink to="/search" className={linkClass}>
          <Search className="h-5 w-5" /> Face Search
        </NavLink>
        <NavLink to="/gallery" className={linkClass}>
          <Images className="h-5 w-5" /> My Photos
        </NavLink>
        <NavLink to="/albums" className={linkClass}>
          <Album className="h-5 w-5" /> Albums
        </NavLink>
        {isAdmin && (
          <NavLink to="/admin" className={linkClass}>
            <Shield className="h-5 w-5" /> Admin
          </NavLink>
        )}
      </nav>

      <div className="space-y-2 border-t border-slate-200 p-3 dark:border-slate-800">
        <button
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
        <button
          onClick={async () => {
            await signOut();
            navigate('/login');
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10"
        >
          <LogOut className="h-5 w-5" /> Sign out
        </button>
      </div>
    </aside>
  );
}
