import { NavLink } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { LayoutDashboard, Upload, Search, Images, Shield } from 'lucide-react';

export function MobileNav() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'super_admin';

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium transition ${
      isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200 bg-white/90 px-2 py-2 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 md:hidden">
      <NavLink to="/dashboard" className={linkClass}>
        <LayoutDashboard className="h-5 w-5" /> Home
      </NavLink>
      <NavLink to="/search" className={linkClass}>
        <Search className="h-5 w-5" /> Search
      </NavLink>
      <NavLink to="/upload" className={linkClass}>
        <Upload className="h-5 w-5" /> Upload
      </NavLink>
      <NavLink to="/gallery" className={linkClass}>
        <Images className="h-5 w-5" /> Photos
      </NavLink>
      {isAdmin && (
        <NavLink to="/admin" className={linkClass}>
          <Shield className="h-5 w-5" /> Admin
        </NavLink>
      )}
    </nav>
  );
}
