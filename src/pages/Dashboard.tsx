import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { formatBytes, formatRelative, getPublicUrl } from '@/lib/image';
import { Images, Search, Heart, Download, HardDrive, Clock, TrendingUp, Upload, ArrowRight } from 'lucide-react';
import type { Photo, SearchHistoryItem } from '@/types';

type Stats = {
  total_uploads: number;
  total_searches: number;
  total_favorites: number;
  total_downloads: number;
  storage_used: number;
};

export function Dashboard() {
  const { user, profile } = useAuth();
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<Photo[]>([]);
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [statsRes, recentRes, histRes] = await Promise.all([
        supabase.rpc('user_stats', { uid: user.id }),
        supabase.from('photos').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(6),
        supabase.from('search_history').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(5),
      ]);
      if (statsRes.data) setStats(statsRes.data as unknown as Stats);
      if (recentRes.data) setRecent(recentRes.data as Photo[]);
      if (histRes.data) setHistory(histRes.data as SearchHistoryItem[]);
      setLoading(false);
    })();
  }, [user]);

  const firstName = profile?.full_name?.split(' ')[0] ?? 'there';

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Hello, {firstName}</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Here's what's happening with your photos.</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={<Images className="h-5 w-5" />} label="Uploaded Photos" value={stats?.total_uploads} loading={loading} color="sky" />
        <StatCard icon={<Search className="h-5 w-5" />} label="Searches Made" value={stats?.total_searches} loading={loading} color="cyan" />
        <StatCard icon={<Heart className="h-5 w-5" />} label="Favorites" value={stats?.total_favorites} loading={loading} color="rose" />
        <StatCard icon={<Download className="h-5 w-5" />} label="Downloads" value={stats?.total_downloads} loading={loading} color="emerald" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700/50">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Clock className="h-4 w-4" /> Recent Uploads
            </h2>
            <Link to="/gallery" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:underline dark:text-sky-400">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="aspect-square" />
                ))}
              </div>
            ) : recent.length === 0 ? (
              <EmptyState
                icon={<Upload className="h-10 w-10" />}
                title="No photos yet"
                description="Upload your first photos to make them searchable by face."
                action={
                  <Link to="/upload" className="btn-primary mt-2">
                    <Upload className="h-4 w-4" /> Upload photos
                  </Link>
                }
              />
            ) : (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {recent.map((p) => (
                  <div key={p.id} className="group relative aspect-square overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-700">
                    <img
                      src={getPublicUrl(p.thumbnail_path ?? p.optimized_path ?? p.storage_path)}
                      alt={p.caption ?? ''}
                      className="h-full w-full object-cover transition group-hover:scale-105"
                      loading="lazy"
                    />
                    {p.faces_detected > 0 && (
                      <span className="absolute bottom-1.5 right-1.5 rounded-md bg-slate-900/70 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                        {p.faces_detected} face{p.faces_detected > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700/50">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <TrendingUp className="h-4 w-4" /> Search History
            </h2>
          </div>
          <div className="p-5">
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                icon={<Search className="h-10 w-10" />}
                title="No searches yet"
                description="Upload a selfie to find your photos across the platform."
                action={
                  <Link to="/search" className="btn-primary mt-2">
                    <Search className="h-4 w-4" /> Search faces
                  </Link>
                }
              />
            ) : (
              <div className="space-y-3">
                {history.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-700/50">
                    {h.selfie_path ? (
                      <img src={getPublicUrl(h.selfie_path)} alt="selfie" className="h-12 w-12 rounded-lg object-cover" />
                    ) : (
                      <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-700">
                        <Search className="h-5 w-5 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium text-slate-900 dark:text-white">
                        {h.result_count} match{h.result_count !== 1 ? 'es' : ''}
                      </p>
                      <p className="text-xs text-slate-400">{formatRelative(h.created_at)}</p>
                    </div>
                    {h.top_score != null && (
                      <span className="text-xs font-semibold text-emerald-500">
                        {(h.top_score * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10">
          <HardDrive className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Storage used</p>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
              style={{ width: `${Math.min(100, (stats?.storage_used ?? 0) / (5 * 1024 ** 3) * 100)}%` }}
            />
          </div>
        </div>
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">
          {formatBytes(stats?.storage_used ?? 0)} / 5 GB
        </span>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  loading,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value?: number;
  loading: boolean;
  color: 'sky' | 'cyan' | 'rose' | 'emerald';
}) {
  const colors = {
    sky: 'bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-300',
    cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-500/10 dark:text-cyan-300',
    rose: 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300',
    emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300',
  };
  return (
    <div className="card p-5">
      <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${colors[color]}`}>{icon}</div>
      {loading ? (
        <Skeleton className="h-7 w-16" />
      ) : (
        <p className="text-2xl font-bold text-slate-900 dark:text-white">{value ?? 0}</p>
      )}
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}
