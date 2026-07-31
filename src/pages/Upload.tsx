import { useState, useCallback, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase, PHOTOS_BUCKET } from '@/lib/supabase';
import { detectFaces, loadFaceModels, vectorToPgArray } from '@/lib/face';
import { compressImage, makeThumbnail, loadImage, fileHash, formatBytes } from '@/lib/image';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { UploadCloud, FileImage, CheckCircle, AlertCircle, X, ScanFace, Lock, Eye, Globe } from 'lucide-react';

type UploadItem = {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'detecting' | 'done' | 'error';
  progress: number;
  faces: number;
  error?: string;
  previewUrl: string;
};

type Privacy = 'public' | 'discoverable' | 'private';

const PRIVACY_OPTIONS: { value: Privacy; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: 'public', label: 'Public', icon: <Globe className="h-4 w-4" />, desc: 'Discoverable & downloadable' },
  { value: 'discoverable', label: 'Discoverable', icon: <Eye className="h-4 w-4" />, desc: 'Searchable, download restricted' },
  { value: 'private', label: 'Private', icon: <Lock className="h-4 w-4" />, desc: 'Only you can see it' },
];

export function Upload() {
  const { user, profile, refreshProfile } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<UploadItem[]>([]);
  const [dragging, setDragging] = useState(false);
  const [privacy, setPrivacy] = useState<Privacy>('discoverable');
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [modelsLoading, setModelsLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: FileList | File[]) => {
    const valid = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (valid.length === 0) {
      toast('Please select image files only.', 'error');
      return;
    }
    const newItems: UploadItem[] = valid.map((file) => ({
      id: Math.random().toString(36).slice(2),
      file,
      status: 'pending',
      progress: 0,
      faces: 0,
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((prev) => [...prev, ...newItems]);
  }, [toast]);

  async function processAll() {
    if (!user || items.length === 0) return;
    setProcessing(true);
    setModelsLoading(true);
    try {
      await loadFaceModels();
    } catch {
      toast('Could not load AI face models. Check your connection.', 'error');
      setProcessing(false);
      setModelsLoading(false);
      return;
    }
    setModelsLoading(false);

    let totalBytes = 0;
    for (const item of items) {
      if (item.status === 'done') continue;
      totalBytes += await processItem(item);
    }
    if (totalBytes > 0) {
      const { error: upErr } = await supabase.from('profiles').update({ storage_used_bytes: (profile?.storage_used_bytes ?? 0) + totalBytes }).eq('id', user.id);
      if (!upErr) await refreshProfile();
    }
    await refreshProfile();
    setProcessing(false);
    toast('Upload complete!', 'success');
  }

  async function processItem(item: UploadItem): Promise<number> {
    updateItem(item.id, { status: 'uploading', progress: 10 });
    try {
      const hash = await fileHash(item.file);
      const pathPrefix = `${user!.id}/${hash}`;
      const origPath = `${pathPrefix}/original.jpg`;
      const optPath = `${pathPrefix}/optimized.jpg`;
      const thumbPath = `${pathPrefix}/thumb.jpg`;

      // Compress
      const optimized = await compressImage(item.file, 1920, 0.85);
      const thumb = await makeThumbnail(item.file, 320);

      // Upload original
      updateItem(item.id, { progress: 30 });
      await uploadFile(origPath, item.file);
      updateItem(item.id, { progress: 50 });
      await uploadFile(optPath, optimized.blob);
      await uploadFile(thumbPath, thumb.blob);
      updateItem(item.id, { progress: 70, status: 'detecting' });

      // Detect faces on optimized image
      const img = await loadImage(optimized.blob);
      const faces = await detectFaces(img);
      updateItem(item.id, { progress: 85, faces: faces.length });

      // Insert photo row
      const { data: photo, error: photoErr } = await supabase
        .from('photos')
        .insert({
          user_id: user!.id,
          album_id: albumId,
          caption: caption || null,
          privacy,
          faces_detected: faces.length,
          storage_path: origPath,
          optimized_path: optPath,
          thumbnail_path: thumbPath,
          width: optimized.width,
          height: optimized.height,
          bytes: item.file.size,
        })
        .select()
        .single();

      if (photoErr) throw new Error(photoErr.message);

      // Insert face embeddings
      if (faces.length > 0) {
        const rows = faces.map((f) => ({
          photo_id: photo.id,
          user_id: user!.id,
          embedding: vectorToPgArray(f.descriptor),
          bbox: f.bbox,
        }));
        const { error: embErr } = await supabase.from('face_embeddings').insert(rows);
        if (embErr) throw new Error(embErr.message);
      }

      updateItem(item.id, { status: 'done', progress: 100 });
      return item.file.size;
    } catch (err) {
      updateItem(item.id, { status: 'error', error: (err as Error).message });
      return 0;
    }
  }

  async function uploadFile(path: string, file: Blob) {
    const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
  }

  function updateItem(id: string, patch: Partial<UploadItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  function removeItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  const doneCount = items.filter((i) => i.status === 'done').length;
  const totalFaces = items.reduce((s, i) => s + i.faces, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Upload Photos</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Drag in photos. Our AI detects every face and adds it to the global search index.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 transition ${
          dragging
            ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'
            : 'border-slate-300 bg-white hover:border-sky-400 dark:border-slate-700 dark:bg-slate-800/50'
        }`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-500/10">
          <UploadCloud className="h-7 w-7" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Drag & drop photos here</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">JPG, PNG, WEBP — multiple files supported</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(e) => e.target.files && addFiles(e.target.files)}
        />
      </div>

      {/* Settings */}
      {items.length > 0 && (
        <div className="card space-y-4 p-5">
          <div>
            <label className="mb-2 block text-xs font-medium text-slate-600 dark:text-slate-300">Privacy setting</label>
            <div className="grid grid-cols-3 gap-2">
              {PRIVACY_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setPrivacy(opt.value)}
                  className={`flex flex-col items-start gap-1 rounded-xl border p-3 text-left transition ${
                    privacy === opt.value
                      ? 'border-sky-500 bg-sky-50 dark:bg-sky-500/10'
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                  }`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
                    {opt.icon} {opt.label}
                  </span>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">{opt.desc}</span>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-300">Caption (optional)</label>
            <input
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              className="auth-input"
              placeholder="Add a caption to all uploaded photos…"
            />
          </div>
        </div>
      )}

      {/* Queue */}
      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {items.length} photo{items.length !== 1 ? 's' : ''} · {totalFaces} face{totalFaces !== 1 ? 's' : ''} indexed
            </p>
            <div className="flex gap-2">
              <button onClick={() => setItems([])} className="btn-ghost" disabled={processing}>
                Clear
              </button>
              <button onClick={processAll} className="btn-primary" disabled={processing || items.every((i) => i.status === 'done')}>
                {processing ? (
                  <>
                    <Spinner className="h-4 w-4" /> {modelsLoading ? 'Loading AI…' : 'Processing…'}
                  </>
                ) : (
                  <>
                    <ScanFace className="h-4 w-4" /> Upload & Index
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <div key={item.id} className="card group relative overflow-hidden">
                <div className="relative aspect-square overflow-hidden rounded-t-2xl bg-slate-100 dark:bg-slate-700">
                  <img src={item.previewUrl} alt="" className="h-full w-full object-cover" />
                  {item.status === 'done' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-emerald-500/20">
                      <CheckCircle className="h-8 w-8 text-white drop-shadow" />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <div className="absolute inset-0 flex items-center justify-center bg-rose-500/30">
                      <AlertCircle className="h-8 w-8 text-white drop-shadow" />
                    </div>
                  )}
                  {(item.status === 'uploading' || item.status === 'detecting') && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
                      <Spinner className="h-7 w-7 text-white" />
                    </div>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="absolute right-2 top-2 rounded-lg bg-slate-900/50 p-1 text-white opacity-0 transition group-hover:opacity-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="p-2.5">
                  <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-300">{item.file.name}</p>
                  <div className="mt-0.5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-400">{formatBytes(item.file.size)}</span>
                    {item.faces > 0 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-medium text-sky-600 dark:text-sky-400">
                        <ScanFace className="h-3 w-3" /> {item.faces}
                      </span>
                    )}
                  </div>
                  {(item.status === 'uploading' || item.status === 'detecting') && (
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                      <div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${item.progress}%` }} />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <p className="mt-1 text-[10px] text-rose-500">{item.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {items.length === 0 && (
        <div className="card">
          <EmptyState
            icon={<FileImage className="h-10 w-10" />}
            title="No photos queued"
            description="Drag and drop or click above to add photos for AI face indexing."
          />
        </div>
      )}
    </div>
  );
}
