import { useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useToast } from '@/context/ToastContext';
import { supabase, PHOTOS_BUCKET } from '@/lib/supabase';
import { detectSingleFace, loadFaceModels, vectorToPgArray } from '@/lib/face';
import { loadImage, formatRelative, similarityPercent, similarityColor } from '@/lib/image';
import { Spinner, EmptyState } from '@/components/ui/Feedback';
import { Search, ScanFace, UploadCloud, Download, Heart, ImageOff, TrendingUp } from 'lucide-react';
import type { SearchMatch } from '@/types';
import { PhotoViewer } from '@/components/PhotoViewer';

export function FaceSearch() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [selfie, setSelfie] = useState<File | null>(null);
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [results, setResults] = useState<SearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSelfie(file: File) {
    setSelfiePreview(URL.createObjectURL(file));
    setSelfie(file);
    setResults([]);
    setHasSearched(false);
  }

  async function search() {
    if (!selfie || !user) return;
    setSearching(true);
    setResults([]);
    try {
      await loadFaceModels();
      const img = await loadImage(selfie);
      const face = await detectSingleFace(img);
      if (!face) {
        toast('No face detected in your selfie. Try a clearer, front-facing photo.', 'error');
        setSearching(false);
        return;
      }
      // Upload selfie for history record
      const path = `${user.id}/searches/${Date.now()}.jpg`;
      await supabase.storage.from(PHOTOS_BUCKET).upload(path, selfie, { upsert: true });

      const { data, error } = await supabase.rpc('search_faces', {
        query: vectorToPgArray(face.descriptor),
        match_threshold: 0.6,
        match_count: 50,
      });

      if (error) throw new Error(error.message);

      const matches = (data ?? []) as SearchMatch[];
      // Deduplicate by photo_id, keeping highest similarity
      const byPhoto = new Map<string, SearchMatch>();
      for (const m of matches) {
        const existing = byPhoto.get(m.photo_id);
        if (!existing || m.similarity > existing.similarity) byPhoto.set(m.photo_id, m);
      }
      const deduped = Array.from(byPhoto.values()).sort((a, b) => b.similarity - a.similarity);
      setResults(deduped);
      setHasSearched(true);

      // Record search history
      await supabase.from('search_history').insert({
        user_id: user.id,
        selfie_path: path,
        result_count: deduped.length,
        top_score: deduped[0]?.similarity ?? null,
      });

      toast(`Found ${deduped.length} matching photo${deduped.length !== 1 ? 's' : ''}!`, 'success');
    } catch (err) {
      toast((err as Error).message, 'error');
    } finally {
      setSearching(false);
    }
  }

  const topScore = results[0]?.similarity;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Face Search</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Upload a selfie. We search every public & discoverable photo across the platform for your face.
        </p>
      </div>

      {/* Selfie upload */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card p-5 lg:col-span-1">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">Your selfie</h2>
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files[0]) handleSelfie(e.dataTransfer.files[0]);
            }}
            className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-3 overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-sky-400 dark:border-slate-700 dark:bg-slate-800/50"
          >
            {selfiePreview ? (
              <img src={selfiePreview} alt="selfie" className="h-full w-full rounded-2xl object-cover" />
            ) : (
              <>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-50 text-sky-600 dark:bg-sky-500/10">
                  <UploadCloud className="h-6 w-6" />
                </div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Click or drop a selfie</p>
              </>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleSelfie(e.target.files[0])}
          />
          <button onClick={search} disabled={!selfie || searching} className="btn-primary mt-4 w-full">
            {searching ? (
              <>
                <Spinner className="h-4 w-4" /> Searching…
              </>
            ) : (
              <>
                <ScanFace className="h-4 w-4" /> Search faces
              </>
            )}
          </button>
        </div>

        {/* Summary */}
        <div className="card flex flex-col justify-center p-6 lg:col-span-2">
          {searching ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <div className="relative">
                <ScanFace className="h-16 w-16 text-sky-500 animate-pulse" />
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Searching the global face index…</p>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-500" />
              </div>
            </div>
          ) : hasSearched ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                <TrendingUp className="h-8 w-8" />
              </div>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{results.length}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">matching photos found</p>
              {topScore != null && (
                <p className="mt-1 text-sm font-semibold text-emerald-500">
                  Top confidence: {similarityPercent(topScore).toFixed(2)}%
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              icon={<Search className="h-10 w-10" />}
              title="Ready to search"
              description="Add a clear, front-facing selfie and click Search. We'll match it against every indexed face on the platform."
            />
          )}
        </div>
      </div>

      {/* Results */}
      {hasSearched && results.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-slate-900 dark:text-white">Results</h2>
          <div className="masonry columns-2 sm:columns-3 lg:columns-4 xl:columns-5">
            {results.map((match, idx) => (
              <ResultCard key={match.photo_id} match={match} onOpen={() => setViewerIndex(idx)} />
            ))}
          </div>
        </div>
      )}

      {hasSearched && results.length === 0 && !searching && (
        <div className="card">
          <EmptyState
            icon={<ImageOff className="h-10 w-10" />}
            title="No matches found"
            description="We couldn't find your face in any discoverable photos yet. Try a different selfie or check back later as more photos are uploaded."
          />
        </div>
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={results.map((m) => ({
            id: m.photo_id,
            storage_path: m.storage_path,
            optimized_path: m.optimized_path,
            thumbnail_path: m.thumbnail_path,
            privacy: m.privacy as 'public' | 'discoverable' | 'private',
            user_id: m.user_id,
          }))}
          index={viewerIndex}
          onClose={() => setViewerIndex(null)}
          onNavigate={(i) => setViewerIndex(i)}
          matchScore={results[viewerIndex]?.similarity}
        />
      )}
    </div>
  );
}

function ResultCard({ match, onOpen }: { match: SearchMatch; onOpen: () => void }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fav, setFav] = useState(false);
  const pct = similarityPercent(match.similarity);
  const canDownload = match.privacy === 'public' || match.user_id === user?.id;

  async function download() {
    if (!canDownload) {
      toast('This photo is discoverable but not downloadable.', 'info');
      return;
    }
    const path = match.optimized_path ?? match.storage_path;
    const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).download(path);
    if (error || !data) {
      toast('Download failed.', 'error');
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `match-${match.photo_id.slice(0, 8)}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
    await supabase.from('downloads').insert({ user_id: user!.id, photo_id: match.photo_id, quality: 'optimized' });
  }

  async function toggleFav() {
    if (fav) {
      await supabase.from('favorites').delete().eq('user_id', user!.id).eq('photo_id', match.photo_id);
      setFav(false);
    } else {
      await supabase.from('favorites').insert({ user_id: user!.id, photo_id: match.photo_id });
      setFav(true);
    }
  }

  return (
    <div className="card group relative overflow-hidden">
      <div className="relative cursor-pointer overflow-hidden" onClick={onOpen}>
        <img
          src={match.thumbnail_path ? urlFor(match.thumbnail_path) : urlFor(match.optimized_path ?? match.storage_path)}
          alt={match.caption ?? ''}
          className="w-full object-cover transition group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-2">
          <span className={`rounded-lg bg-slate-900/80 px-2 py-1 text-xs font-bold backdrop-blur ${similarityColor(match.similarity)}`}>
            {pct.toFixed(2)}%
          </span>
          <span className="rounded-lg bg-slate-900/60 px-2 py-1 text-[10px] font-medium capitalize text-white backdrop-blur">
            {match.privacy}
          </span>
        </div>
      </div>
      <div className="flex items-center justify-between gap-1 p-2">
        <span className="text-[10px] text-slate-400">{formatRelative(match.created_at)}</span>
        <div className="flex gap-1">
          <button onClick={toggleFav} className={`rounded-lg p-1.5 transition ${fav ? 'text-rose-500' : 'text-slate-400 hover:text-rose-500'}`}>
            <Heart className={`h-4 w-4 ${fav ? 'fill-current' : ''}`} />
          </button>
          <button onClick={download} className="rounded-lg p-1.5 text-slate-400 transition hover:text-sky-500">
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function urlFor(path: string): string {
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
