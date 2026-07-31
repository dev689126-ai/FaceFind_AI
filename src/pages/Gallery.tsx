import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { supabase, PHOTOS_BUCKET } from '@/lib/supabase';
import { getPublicUrl, formatRelative } from '@/lib/image';
import { EmptyState, Skeleton } from '@/components/ui/Feedback';
import { PhotoViewer } from '@/components/PhotoViewer';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/context/ToastContext';
import { Images, Heart, Download, Trash2, MoreVertical, Filter } from 'lucide-react';
import type { Photo, Album as AlbumType } from '@/types';

type SortKey = 'recent' | 'oldest' | 'faces';

export function Gallery() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [albums, setAlbums] = useState<AlbumType[]>([]);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [sort, setSort] = useState<SortKey>('recent');
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);
  const [favOnly, setFavOnly] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const [editPhoto, setEditPhoto] = useState<Photo | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const [p, a, f] = await Promise.all([
        supabase.from('photos').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('albums').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
        supabase.from('favorites').select('photo_id').eq('user_id', user.id),
      ]);
      if (p.data) setPhotos(p.data as Photo[]);
      if (a.data) setAlbums(a.data as AlbumType[]);
      if (f.data) setFavorites(new Set((f.data as { photo_id: string }[]).map((x) => x.photo_id)));
      setLoading(false);
    })();
  }, [user]);

  const filtered = useMemo(() => {
    let list = photos;
    if (albumFilter) list = list.filter((p) => p.album_id === albumFilter);
    if (favOnly) list = list.filter((p) => favorites.has(p.id));
    if (sort === 'recent') list = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (sort === 'oldest') list = [...list].sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (sort === 'faces') list = [...list].sort((a, b) => b.faces_detected - a.faces_detected);
    return list;
  }, [photos, sort, albumFilter, favOnly, favorites]);

  async function toggleFav(photoId: string) {
    if (favorites.has(photoId)) {
      await supabase.from('favorites').delete().eq('user_id', user!.id).eq('photo_id', photoId);
      setFavorites((s) => { const n = new Set(s); n.delete(photoId); return n; });
    } else {
      await supabase.from('favorites').insert({ user_id: user!.id, photo_id: photoId });
      setFavorites((s) => new Set(s).add(photoId));
    }
  }

  async function deletePhoto(photoId: string, paths: { storage_path: string; optimized_path: string | null; thumbnail_path: string | null }) {
    if (!confirm('Delete this photo and its face data? This cannot be undone.')) return;
    await supabase.from('photos').delete().eq('id', photoId);
    // best-effort storage cleanup
    const allPaths = [paths.storage_path, paths.optimized_path, paths.thumbnail_path].filter(Boolean) as string[];
    await supabase.storage.from(PHOTOS_BUCKET).remove(allPaths);
    setPhotos((p) => p.filter((x) => x.id !== photoId));
    toast('Photo deleted.', 'success');
  }

  async function download(photo: Photo) {
    const path = photo.optimized_path ?? photo.storage_path;
    const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).download(path);
    if (error || !data) { toast('Download failed.', 'error'); return; }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `photo-${photo.id.slice(0, 8)}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    await supabase.from('downloads').insert({ user_id: user!.id, photo_id: photo.id, quality: 'optimized' });
  }

  async function saveEdit() {
    if (!editPhoto) return;
    await supabase.from('photos').update({
      caption: editPhoto.caption,
      privacy: editPhoto.privacy,
      album_id: editPhoto.album_id,
      tags: editPhoto.tags,
    }).eq('id', editPhoto.id);
    setPhotos((p) => p.map((x) => (x.id === editPhoto.id ? editPhoto : x)));
    setEditPhoto(null);
    toast('Photo updated.', 'success');
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Photos</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{photos.length} photo{photos.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="card flex flex-wrap items-center gap-3 p-4">
        <Filter className="h-4 w-4 text-slate-400" />
        <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)} className="auth-input w-auto py-1.5 text-xs">
          <option value="recent">Recently added</option>
          <option value="oldest">Oldest first</option>
          <option value="faces">Most faces</option>
        </select>
        <select value={albumFilter ?? ''} onChange={(e) => setAlbumFilter(e.target.value || null)} className="auth-input w-auto py-1.5 text-xs">
          <option value="">All albums</option>
          {albums.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
        <button
          onClick={() => setFavOnly((f) => !f)}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
            favOnly ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
          }`}
        >
          <Heart className={`h-3.5 w-3.5 ${favOnly ? 'fill-current' : ''}`} /> Favorites only
        </button>
      </div>

      {loading ? (
        <div className="masonry columns-2 sm:columns-3 lg:columns-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="mb-4 aspect-[3/4]" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState icon={<Images className="h-10 w-10" />} title="No photos here" description="Upload photos to see them in your gallery." />
        </div>
      ) : (
        <div className="masonry columns-2 sm:columns-3 lg:columns-4 xl:columns-5">
          {filtered.map((photo, idx) => (
            <div key={photo.id} className="card group relative overflow-hidden">
              <div className="relative cursor-pointer overflow-hidden" onClick={() => setViewerIndex(idx)}>
                <img
                  src={getPublicUrl(photo.thumbnail_path ?? photo.optimized_path ?? photo.storage_path)}
                  alt={photo.caption ?? ''}
                  className="w-full object-cover transition group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-900/70 to-transparent p-2 opacity-0 transition group-hover:opacity-100">
                  <p className="truncate text-[10px] text-white">{formatRelative(photo.created_at)}</p>
                </div>
                {photo.faces_detected > 0 && (
                  <span className="absolute right-2 top-2 rounded-md bg-sky-500/80 px-1.5 py-0.5 text-[10px] font-medium text-white backdrop-blur">
                    {photo.faces_detected} face{photo.faces_detected > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between p-2">
                <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-medium capitalize ${
                  photo.privacy === 'public' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10' :
                  photo.privacy === 'discoverable' ? 'bg-sky-50 text-sky-600 dark:bg-sky-500/10' :
                  'bg-slate-100 text-slate-500 dark:bg-slate-700'
                }`}>{photo.privacy}</span>
                <div className="flex gap-0.5">
                  <button onClick={() => toggleFav(photo.id)} className={`rounded-lg p-1.5 ${favorites.has(photo.id) ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'}`}>
                    <Heart className={`h-4 w-4 ${favorites.has(photo.id) ? 'fill-current' : ''}`} />
                  </button>
                  <button onClick={() => download(photo)} className="rounded-lg p-1.5 text-slate-400 hover:text-sky-500">
                    <Download className="h-4 w-4" />
                  </button>
                  <div className="relative">
                    <button onClick={() => setMenuOpen(menuOpen === photo.id ? null : photo.id)} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                    {menuOpen === photo.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-36 rounded-xl border border-slate-200 bg-white py-1 shadow-xl dark:border-slate-700 dark:bg-slate-800">
                        <button onClick={() => { setEditPhoto(photo); setMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700">
                          Edit
                        </button>
                        <button onClick={() => { deletePhoto(photo.id, photo); setMenuOpen(null); }} className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-500/10">
                          <Trash2 className="h-3 w-3" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={filtered}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={(i) => setViewerIndex(i)}
        />
      )}

      <Modal open={!!editPhoto} onClose={() => setEditPhoto(null)} title="Edit photo">
        {editPhoto && (
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Caption</label>
              <input
                value={editPhoto.caption ?? ''}
                onChange={(e) => setEditPhoto({ ...editPhoto, caption: e.target.value })}
                className="auth-input"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Privacy</label>
              <select
                value={editPhoto.privacy}
                onChange={(e) => setEditPhoto({ ...editPhoto, privacy: e.target.value as Photo['privacy'] })}
                className="auth-input"
              >
                <option value="public">Public</option>
                <option value="discoverable">Discoverable</option>
                <option value="private">Private</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Album</label>
              <select
                value={editPhoto.album_id ?? ''}
                onChange={(e) => setEditPhoto({ ...editPhoto, album_id: e.target.value || null })}
                className="auth-input"
              >
                <option value="">None</option>
                {albums.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">Tags (comma separated)</label>
              <input
                value={editPhoto.tags.join(', ')}
                onChange={(e) => setEditPhoto({ ...editPhoto, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })}
                className="auth-input"
              />
            </div>
            <button onClick={saveEdit} className="btn-primary w-full">Save changes</button>
          </div>
        )}
      </Modal>
    </div>
  );
}
