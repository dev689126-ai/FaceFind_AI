/*
# Engagement tables: favorites, downloads, notifications, reports, admin_logs + search RPC

1. New Tables
- `favorites` — user bookmarks a photo. Columns: id, user_id, photo_id, created_at.
- `downloads` — audit of photo downloads. Columns: id, user_id, photo_id, quality, created_at.
- `notifications` — in-app notices. Columns: id, user_id, type, message, data (jsonb), read, created_at.
- `reports` — abuse/content reports. Columns: id, reporter_id, photo_id, reason, status, created_at.
- `admin_logs` — admin action audit trail. Columns: id, admin_id, action, target_type, target_id, details (jsonb), created_at.

2. Security
- RLS enabled on all tables; owner-scoped CRUD for favorites/downloads/notifications.
- reports: any authenticated user can insert; owner or admin can read; admin can update status.
- admin_logs: super_admin only.
3. New Functions
- `search_faces(query vector(128), match_threshold float, match_count int)` — SECURITY DEFINER RPC that searches ALL face_embeddings across the platform (bypassing RLS) and returns matching photos with cosine similarity scores, joined to photo metadata. Only returns photos whose privacy is 'public' or 'discoverable'. This is the core global face-search primitive.
4. Notes
- search_faces runs as the function owner (postgres) so it can read embeddings owned by other users without exposing them via RLS. Callers still must be authenticated.
*/

-- favorites
CREATE TABLE IF NOT EXISTS favorites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, photo_id)
);
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_favorites" ON favorites;
CREATE POLICY "select_own_favorites" ON favorites FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_favorites" ON favorites;
CREATE POLICY "insert_own_favorites" ON favorites FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_favorites" ON favorites;
CREATE POLICY "delete_own_favorites" ON favorites FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- downloads
CREATE TABLE IF NOT EXISTS downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  quality text NOT NULL DEFAULT 'optimized' CHECK (quality IN ('original','optimized','thumbnail')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE downloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_downloads" ON downloads;
CREATE POLICY "select_own_downloads" ON downloads FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_downloads" ON downloads;
CREATE POLICY "insert_own_downloads" ON downloads FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_downloads" ON downloads;
CREATE POLICY "delete_own_downloads" ON downloads FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  message text NOT NULL,
  data jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_notifications" ON notifications;
CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_notifications" ON notifications;
CREATE POLICY "insert_own_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_notifications" ON notifications;
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_notifications" ON notifications;
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- reports
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_reports" ON reports;
CREATE POLICY "select_reports" ON reports FOR SELECT
  TO authenticated USING (auth.uid() = reporter_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "insert_reports" ON reports;
CREATE POLICY "insert_reports" ON reports FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "update_reports_admin" ON reports;
CREATE POLICY "update_reports_admin" ON reports FOR UPDATE
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- admin_logs
CREATE TABLE IF NOT EXISTS admin_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  target_type text,
  target_id uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE admin_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_admin_logs" ON admin_logs;
CREATE POLICY "select_admin_logs" ON admin_logs FOR SELECT
  TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "insert_admin_logs" ON admin_logs;
CREATE POLICY "insert_admin_logs" ON admin_logs FOR INSERT
  TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_photo_id ON favorites(photo_id);
CREATE INDEX IF NOT EXISTS idx_downloads_user_id ON downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- Global face search RPC (SECURITY DEFINER so it can read all embeddings + photos across users)
CREATE OR REPLACE FUNCTION search_faces(
  query vector(128),
  match_threshold float DEFAULT 0.4,
  match_count int DEFAULT 50
)
RETURNS TABLE (
  photo_id uuid,
  similarity float,
  embedding_id uuid,
  bbox jsonb,
  user_id uuid,
  caption text,
  tags text[],
  privacy text,
  thumbnail_path text,
  optimized_path text,
  storage_path text,
  width int,
  height int,
  bytes bigint,
  created_at timestamptz,
  album_id uuid
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS photo_id,
    1 - (fe.embedding <=> query) AS similarity,
    fe.id AS embedding_id,
    fe.bbox,
    p.user_id,
    p.caption,
    p.tags,
    p.privacy,
    p.thumbnail_path,
    p.optimized_path,
    p.storage_path,
    p.width,
    p.height,
    p.bytes,
    p.created_at,
    p.album_id
  FROM face_embeddings fe
  JOIN photos p ON p.id = fe.photo_id
  WHERE (1 - (fe.embedding <=> query)) > match_threshold
    AND p.privacy IN ('public','discoverable')
  ORDER BY fe.embedding <=> query ASC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION search_faces(vector(128), float, int) TO authenticated;

-- Helper: platform-wide stats for dashboard
CREATE OR REPLACE FUNCTION platform_stats()
RETURNS TABLE (
  total_photos bigint,
  total_users bigint,
  total_faces bigint,
  total_searches bigint,
  total_downloads bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM photos),
    (SELECT count(*) FROM profiles),
    (SELECT count(*) FROM face_embeddings),
    (SELECT count(*) FROM search_history),
    (SELECT count(*) FROM downloads);
$$;

GRANT EXECUTE ON FUNCTION platform_stats() TO authenticated;

-- Helper: per-user dashboard stats
CREATE OR REPLACE FUNCTION user_stats(uid uuid)
RETURNS TABLE (
  total_uploads bigint,
  photos_found bigint,
  total_searches bigint,
  total_favorites bigint,
  total_downloads bigint,
  storage_used bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM photos WHERE photos.user_id = uid),
    (SELECT count(*) FROM search_history WHERE search_history.user_id = uid),
    (SELECT count(*) FROM search_history WHERE search_history.user_id = uid),
    (SELECT count(*) FROM favorites WHERE favorites.user_id = uid),
    (SELECT count(*) FROM downloads WHERE downloads.user_id = uid),
    (SELECT COALESCE(storage_used_bytes,0) FROM profiles WHERE id = uid);
$$;

GRANT EXECUTE ON FUNCTION user_stats(uuid) TO authenticated;
