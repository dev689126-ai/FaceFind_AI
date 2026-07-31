import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Download, RotateCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { supabase, PHOTOS_BUCKET } from '@/lib/supabase';
import { similarityPercent, similarityColor } from '@/lib/image';

type ViewerPhoto = {
  id: string;
  storage_path: string;
  optimized_path: string | null;
  thumbnail_path: string | null;
  privacy: string;
  user_id: string;
};

export function PhotoViewer({
  photos,
  index,
  onClose,
  onNavigate,
  matchScore,
}: {
  photos: ViewerPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  matchScore?: number;
}) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const photo = photos[index];

  useEffect(() => {
    setZoom(1);
    setRotation(0);
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNavigate((index - 1 + photos.length) % photos.length);
      if (e.key === 'ArrowRight') onNavigate((index + 1) % photos.length);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [index, photos.length, onClose, onNavigate]);

  if (!photo) return null;

  const url = urlFor(photo.optimized_path ?? photo.storage_path);

  async function download() {
    const path = photo.optimized_path ?? photo.storage_path;
    const { data, error } = await supabase.storage.from(PHOTOS_BUCKET).download(path);
    if (error || !data) return;
    const u = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = u;
    a.download = `photo-${photo.id.slice(0, 8)}.jpg`;
    a.click();
    URL.revokeObjectURL(u);
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-slate-950/95 backdrop-blur-md">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          {matchScore != null && (
            <span className={`rounded-lg bg-slate-800 px-2.5 py-1 text-sm font-bold ${similarityColor(matchScore)}`}>
              {similarityPercent(matchScore).toFixed(2)}% match
            </span>
          )}
          <span className="text-xs text-slate-400">{index + 1} / {photos.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <ViewerBtn onClick={() => setZoom((z) => Math.max(1, z - 0.25))} disabled={zoom <= 1}>
            <ZoomOut className="h-5 w-5" />
          </ViewerBtn>
          <ViewerBtn onClick={() => setZoom((z) => Math.min(4, z + 0.25))} disabled={zoom >= 4}>
            <ZoomIn className="h-5 w-5" />
          </ViewerBtn>
          <ViewerBtn onClick={() => setRotation((r) => (r + 90) % 360)}>
            <RotateCw className="h-5 w-5" />
          </ViewerBtn>
          <ViewerBtn onClick={download}>
            <Download className="h-5 w-5" />
          </ViewerBtn>
          <ViewerBtn onClick={onClose}>
            <X className="h-5 w-5" />
          </ViewerBtn>
        </div>
      </div>

      {/* Image */}
      <div className="relative flex flex-1 items-center justify-center overflow-hidden">
        {photos.length > 1 && (
          <button
            onClick={() => onNavigate((index - 1 + photos.length) % photos.length)}
            className="absolute left-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-800/70 text-white backdrop-blur transition hover:bg-slate-700"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <img
          src={url}
          alt=""
          className="max-h-full max-w-full object-contain transition-transform duration-200"
          style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
        />
        {photos.length > 1 && (
          <button
            onClick={() => onNavigate((index + 1) % photos.length)}
            className="absolute right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-slate-800/70 text-white backdrop-blur transition hover:bg-slate-700"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ViewerBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function urlFor(path: string): string {
  const { data } = supabase.storage.from(PHOTOS_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}
