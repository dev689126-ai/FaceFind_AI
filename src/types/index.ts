export type Photo = {
  id: string;
  user_id: string;
  album_id: string | null;
  caption: string | null;
  tags: string[];
  gps_lat: number | null;
  gps_lng: number | null;
  device_meta: Record<string, unknown> | null;
  privacy: 'public' | 'discoverable' | 'private';
  faces_detected: number;
  storage_path: string;
  optimized_path: string | null;
  thumbnail_path: string | null;
  width: number | null;
  height: number | null;
  bytes: number;
  created_at: string;
};

export type Album = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  cover_photo_id: string | null;
  created_at: string;
};

export type SearchMatch = {
  photo_id: string;
  similarity: number;
  embedding_id: string;
  bbox: { x: number; y: number; width: number; height: number } | null;
  user_id: string;
  caption: string | null;
  tags: string[];
  privacy: string;
  thumbnail_path: string | null;
  optimized_path: string | null;
  storage_path: string;
  width: number | null;
  height: number | null;
  bytes: number;
  created_at: string;
  album_id: string | null;
};

export type Favorite = {
  id: string;
  user_id: string;
  photo_id: string;
  created_at: string;
};

export type SearchHistoryItem = {
  id: string;
  user_id: string;
  selfie_path: string | null;
  result_count: number;
  top_score: number | null;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: string;
  message: string;
  data: Record<string, unknown> | null;
  read: boolean;
  created_at: string;
};

export type Report = {
  id: string;
  reporter_id: string;
  photo_id: string;
  reason: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  created_at: string;
};

export type AdminLog = {
  id: string;
  admin_id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};
