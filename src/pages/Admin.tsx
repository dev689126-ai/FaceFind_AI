import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, PHOTOS_BUCKET } from '@/lib/supabase';
import { getPublicUrl, formatRelative, formatBytes, formatDate } from '@/lib/image';
import { Skeleton, EmptyState } from '@/components/ui/Feedback';
import { useToast } from '@/context/ToastContext';
import { Users, Images, ScanFace, Search, Download, Flag, Shield, Trash2, BarChart3, Activity } from 'lucide-react';

type Tab = 'overview' | 'users' | 'photos' | 'reports' | 'logs';

type PlatformStats = {
  total_photos: number;
  total_users: number;
  total_faces: number;
  total_searches: number;
  total_downloads: number;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  created_at: string;
  role: string;
  storage_used_bytes: number;
};

type ReportRow = {
  id: string;
  reporter_id: string;
  photo_id: string;
  reason: string;
  status: string;
  created_at: string;
};

type LogRow = {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export function Admin() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [users, setUsers] = useState<ProfileRow[]>([]);
  const [photos, setPhotos] = useState<any[]>([]);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [s, u, p, r, l] = await Promise.all([
        supabase.rpc('platform_stats'),
        supabase.from('profiles').select('id, full_name, created_at, role, storage_used_bytes').order('created_at', { ascending: false }),
        supabase.from('photos').select('id, user_id, caption, privacy, faces_detected, thumbnail_path, optimized_path, storage_path, created_at, bytes').order('created_at', { ascending: false }).limit(100),
        supabase.from('reports').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('admin_logs').select('*').order('created_at', { ascending: false }).limit(50),
      ]);
      if (s.data) setStats(s.data as unknown as PlatformStats);
      if (u.data) setUsers(u.data as ProfileRow[]);
      if (p.data) setPhotos(p.data as any[]);
      if (r.data) setReports(r.data as ReportRow[]);
      if (l.data) setLogs(l.data as LogRow[]);
      setLoading(false);
    })();
  }, []);

  async function logAdmin(action: string, targetType?: string, targetId?: string) {
    await supabase.from('admin_logs').insert({ admin_id: user!.id, action, target_type: targetType, target_id: targetId });
  }

  async function suspendUser(id: string, suspend: boolean) {
    // In this demo, "suspend" = set role to a non-admin value; real suspend would use auth admin API.
    // We'll just remove the profile as a soft action placeholder — but to avoid data loss we skip destructive.
    toast('User suspension requires server-side auth admin access.', 'info');
    await logAdmin(suspend ? 'suspend_user' : 'unsuspend_user', 'user', id);
  }

  async function deletePhotoRow(id: string, paths: { storage_path: string; optimized_path: string | null; thumbnail_path: string | null }) {
    if (!confirm('Remove this photo from the platform?')) return;
    await supabase.from('photos').delete().eq('id', id);
    const all = [paths.storage_path, paths.optimized_path, paths.thumbnail_path].filter(Boolean) as string[];
    await supabase.storage.from(PHOTOS_BUCKET).remove(all);
    setPhotos((p) => p.filter((x) => x.id !== id));
    await logAdmin('delete_photo', 'photo', id);
    toast('Photo removed.', 'success');
  }

  async function updateReport(id: string, status: string) {
    await supabase.from('reports').update({ status }).eq('id', id);
    setReports((r) => r.map((x) => (x.id === id ? { ...x, status } : x)));
    await logAdmin(`report_${status}`, 'report', id);
    toast(`Report marked ${status}.`, 'success');
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <BarChart3 className="h-4 w-4" /> },
    { key: 'users', label: 'Users', icon: <Users className="h-4 w-4" /> },
    { key: 'photos', label: 'Photos', icon: <Images className="h-4 w-4" /> },
    { key: 'reports', label: 'Reports', icon: <Flag className="h-4 w-4" /> },
    { key: 'logs', label: 'Audit Logs', icon: <Activity className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Shield className="h-6 w-6 text-amber-500" />
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Super Admin</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Platform-wide management and moderation.</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === t.key ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : tab === 'overview' ? (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <StatBox icon={<Images className="h-5 w-5" />} label="Total Photos" value={stats?.total_photos ?? 0} color="sky" />
            <StatBox icon={<Users className="h-5 w-5" />} label="Total Users" value={stats?.total_users ?? 0} color="cyan" />
            <StatBox icon={<ScanFace className="h-5 w-5" />} label="Faces Indexed" value={stats?.total_faces ?? 0} color="violet" />
            <StatBox icon={<Search className="h-5 w-5" />} label="Total Searches" value={stats?.total_searches ?? 0} color="amber" />
            <StatBox icon={<Download className="h-5 w-5" />} label="Total Downloads" value={stats?.total_downloads ?? 0} color="emerald" />
          </div>
          <div className="card p-6">
            <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-white">Recent photos across platform</h3>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-10">
              {photos.slice(0, 20).map((p) => (
                <div key={p.id} className="aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700">
                  <img src={getPublicUrl(p.thumbnail_path ?? p.optimized_path ?? p.storage_path)} alt="" className="h-full w-full object-cover" loading="lazy" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : tab === 'users' ? (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Storage</th>
                <th className="px-4 py-3 font-medium">Joined</th>
                <th className="px-4 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                  <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{u.full_name ?? 'Unnamed'}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${u.role === 'super_admin' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10' : 'bg-slate-100 text-slate-500 dark:bg-slate-700'}`}>
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatBytes(u.storage_used_bytes)}</td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== user?.id && (
                      <button onClick={() => suspendUser(u.id, true)} className="text-xs font-medium text-amber-600 hover:underline">
                        Suspend
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : tab === 'photos' ? (
        <div className="space-y-3">
          {photos.length === 0 ? (
            <EmptyState icon={<Images className="h-10 w-10" />} title="No photos" />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((p) => (
                <div key={p.id} className="card overflow-hidden">
                  <img src={getPublicUrl(p.thumbnail_path ?? p.optimized_path ?? p.storage_path)} alt="" className="aspect-square w-full object-cover" />
                  <div className="flex items-center justify-between p-2">
                    <span className="text-[10px] text-slate-400">{formatRelative(p.created_at)} · {p.faces_detected} face</span>
                    <button onClick={() => deletePhotoRow(p.id, p)} className="rounded-lg p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === 'reports' ? (
        <div className="card">
          {reports.length === 0 ? (
            <EmptyState icon={<Flag className="h-10 w-10" />} title="No reports" description="User-submitted content reports will appear here." />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {reports.map((r) => (
                <div key={r.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{r.reason}</p>
                    <p className="text-xs text-slate-400">Photo {r.photo_id.slice(0, 8)} · {formatRelative(r.created_at)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${
                      r.status === 'open' ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/10' :
                      r.status === 'resolved' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' :
                      'bg-slate-100 text-slate-500 dark:bg-slate-700'
                    }`}>{r.status}</span>
                    {r.status === 'open' && (
                      <button onClick={() => updateReport(r.id, 'resolved')} className="text-xs font-medium text-emerald-600 hover:underline">
                        Resolve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          {logs.length === 0 ? (
            <EmptyState icon={<Activity className="h-10 w-10" />} title="No admin actions yet" />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-700/50">
              {logs.map((l) => (
                <div key={l.id} className="flex items-center justify-between p-4">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">{l.action}</p>
                    {l.target_type && <p className="text-xs text-slate-400">on {l.target_type} {l.target_id?.slice(0, 8)}</p>}
                  </div>
                  <span className="text-xs text-slate-400">{formatRelative(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatBox({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10',
    cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10',
    violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10',
    amber: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10',
  };
  return (
    <div className="card p-5">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value.toLocaleString()}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
