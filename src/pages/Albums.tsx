import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { getPublicUrl } from '@/lib/image';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { Album as AlbumIcon, Plus, Trash2, Pencil, Images } from 'lucide-react';
import type { Album, Photo } from '@/types';

export function Albums() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [albums, setAlbums] = useState<Album[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editAlbum, setEditAlbum] = useState<Album | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  async function load() {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase.from('albums').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
    const albumList = (data ?? []) as Album[];
    setAlbums(albumList);
    // counts + covers
    const c: Record<string, number> = {};
    const cv: Record<string, string> = {};
    for (const a of albumList) {
      const { data: ph } = await supabase.from('photos').select('id, thumbnail_path, optimized_path, storage_path').eq('album_id', a.id).limit(1);
      const { count } = await supabase.from('photos').select('id', { count: 'exact', head: true }).eq('album_id', a.id);
      c[a.id] = count ?? 0;
      if (ph && ph[0]) {
        const p = ph[0] as Photo;
        cv[a.id] = getPublicUrl(p.thumbnail_path ?? p.optimized_path ?? p.storage_path);
      }
    }
    setCounts(c);
    setCovers(cv);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [user]);

  async function create() {
    if (!name.trim() || !user) return;
    const { error } = await supabase.from('albums').insert({ user_id: user.id, name: name.trim(), description: description || null });
    if (error) { toast(error.message, 'error'); return; }
    setName(''); setDescription(''); setCreateOpen(false);
    toast('Album created.', 'success');
    load();
  }

  async function saveEdit() {
    if (!editAlbum) return;
    await supabase.from('albums').update({ name: editAlbum.name, description: editAlbum.description }).eq('id', editAlbum.id);
    setEditAlbum(null);
    toast('Album updated.', 'success');
    load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this album? Photos inside will be moved to "no album".')) return;
    await supabase.from('photos').update({ album_id: null }).eq('album_id', id);
    await supabase.from('albums').delete().eq('id', id);
    toast('Album deleted.', 'success');
    load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Albums</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Organize your photos into collections.</p>
        </div>
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> New album
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
        </div>
      ) : albums.length === 0 ? (
        <div className="card">
          <EmptyState icon={<AlbumIcon className="h-10 w-10" />} title="No albums yet" description="Create an album to start organizing your photos." action={
            <button onClick={() => setCreateOpen(true)} className="btn-primary mt-2"><Plus className="h-4 w-4" /> New album</button>
          } />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {albums.map((a) => (
            <div key={a.id} className="card group overflow-hidden">
              <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-700">
                {covers[a.id] ? (
                  <img src={covers[a.id]} alt={a.name} className="h-full w-full object-cover transition group-hover:scale-105" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-slate-300 dark:text-slate-600">
                    <Images className="h-10 w-10" />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="truncate text-sm font-semibold text-white">{a.name}</p>
                  <p className="text-xs text-white/70">{counts[a.id] ?? 0} photo{(counts[a.id] ?? 0) !== 1 ? 's' : ''}</p>
                </div>
                <div className="absolute right-2 top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                  <button onClick={() => { setEditAlbum(a); setName(a.name); setDescription(a.description ?? ''); }} className="rounded-lg bg-slate-900/60 p-1.5 text-white backdrop-blur hover:bg-slate-800">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => remove(a.id)} className="rounded-lg bg-slate-900/60 p-1.5 text-rose-400 backdrop-blur hover:bg-slate-800">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="New album">
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="auth-input" placeholder="Summer 2024" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Description (optional)</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="auth-input" rows={3} />
          </div>
          <button onClick={create} className="btn-primary w-full">Create album</button>
        </div>
      </Modal>

      <Modal open={!!editAlbum} onClose={() => setEditAlbum(null)} title="Edit album">
        {editAlbum && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Name</label>
              <input value={editAlbum.name} onChange={(e) => setEditAlbum({ ...editAlbum, name: e.target.value })} className="auth-input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Description</label>
              <textarea value={editAlbum.description ?? ''} onChange={(e) => setEditAlbum({ ...editAlbum, description: e.target.value })} className="auth-input" rows={3} />
            </div>
            <button onClick={saveEdit} className="btn-primary w-full">Save</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
