/*
# Core schema: profiles, albums, photos, face embeddings, search history

1. New Tables
- `profiles` — public user profile data keyed to auth.users. Columns: id (uuid PK, refs auth.users), full_name, avatar_url, role (user/super_admin), storage_used_bytes, created_at.
- `albums` — user-owned photo groupings. Columns: id, user_id (default auth.uid()), name, description, cover_photo_id, created_at.
- `photos` — centralized photo repository. Columns: id, user_id (default auth.uid()), album_id, caption, tags (text[]), gps_lat, gps_lng, device_meta (jsonb), privacy (public/discoverable/private), faces_detected, storage_path (original), optimized_path, thumbnail_path, width, height, bytes, created_at.
- `face_embeddings` — one row per detected face. Columns: id, photo_id, user_id (owner of the photo), embedding (vector(128)), bbox (jsonb x/y/width/height), created_at.
- `search_history` — record of each face search a user performs. Columns: id, user_id, selfie_path, result_count, top_score, created_at.

2. Security
- RLS enabled on all tables.
- profiles: owner read/update; super_admin read/update all.
- albums, photos, face_embeddings, search_history: owner-scoped CRUD for the owning user.
- photos SELECT is broadened so that discoverable/public photos can be read by any authenticated user (needed to display search matches and shared photos). Owner can do full CRUD.
- face_embeddings SELECT is owner-only (embeddings are sensitive). Search happens via an RPC that runs with elevated privileges, so embeddings never need to be directly readable by other users.
3. Notes
- Owner columns default to auth.uid() so client inserts omitting user_id succeed.
- pgvector type(128) matches face-api.js's 128-dim FaceNet-style descriptors.
*/

-- profiles
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','super_admin')),
  storage_used_bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_profile" ON profiles;
CREATE POLICY "select_own_profile" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
CREATE POLICY "insert_own_profile" ON profiles FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = id);

-- albums
CREATE TABLE IF NOT EXISTS albums (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  cover_photo_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE albums ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_albums" ON albums;
CREATE POLICY "select_own_albums" ON albums FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_albums" ON albums;
CREATE POLICY "insert_own_albums" ON albums FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_albums" ON albums;
CREATE POLICY "update_own_albums" ON albums FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_albums" ON albums;
CREATE POLICY "delete_own_albums" ON albums FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- photos
CREATE TABLE IF NOT EXISTS photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  album_id uuid REFERENCES albums(id) ON DELETE SET NULL,
  caption text,
  tags text[] DEFAULT '{}',
  gps_lat double precision,
  gps_lng double precision,
  device_meta jsonb,
  privacy text NOT NULL DEFAULT 'discoverable' CHECK (privacy IN ('public','discoverable','private')),
  faces_detected int NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  optimized_path text,
  thumbnail_path text,
  width int,
  height int,
  bytes bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;

-- Owner full access; others can SELECT only discoverable/public photos (for search results & shared viewing)
DROP POLICY IF EXISTS "select_photos" ON photos;
CREATE POLICY "select_photos" ON photos FOR SELECT
  TO authenticated USING (
    auth.uid() = user_id
    OR privacy IN ('public','discoverable')
    OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS "insert_own_photos" ON photos;
CREATE POLICY "insert_own_photos" ON photos FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_photos" ON photos;
CREATE POLICY "update_own_photos" ON photos FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_photos" ON photos;
CREATE POLICY "delete_own_photos" ON photos FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- face_embeddings (sensitive — owner + admin only direct access; search uses RPC)
CREATE TABLE IF NOT EXISTS face_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id uuid NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  embedding vector(128) NOT NULL,
  bbox jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE face_embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_embeddings" ON face_embeddings;
CREATE POLICY "select_own_embeddings" ON face_embeddings FOR SELECT
  TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

DROP POLICY IF EXISTS "insert_own_embeddings" ON face_embeddings;
CREATE POLICY "insert_own_embeddings" ON face_embeddings FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_embeddings" ON face_embeddings;
CREATE POLICY "delete_own_embeddings" ON face_embeddings FOR DELETE
  TO authenticated USING (auth.uid() = user_id OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

-- search_history
CREATE TABLE IF NOT EXISTS search_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  selfie_path text,
  result_count int NOT NULL DEFAULT 0,
  top_score float,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE search_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_search_history" ON search_history;
CREATE POLICY "select_own_search_history" ON search_history FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_search_history" ON search_history;
CREATE POLICY "insert_own_search_history" ON search_history FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_search_history" ON search_history;
CREATE POLICY "delete_own_search_history" ON search_history FOR DELETE
  TO authenticated USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_photos_user_id ON photos(user_id);
CREATE INDEX IF NOT EXISTS idx_photos_album_id ON photos(album_id);
CREATE INDEX IF NOT EXISTS idx_photos_privacy ON photos(privacy);
CREATE INDEX IF NOT EXISTS idx_face_embeddings_photo_id ON face_embeddings(photo_id);
CREATE INDEX IF NOT EXISTS idx_face_embeddings_user_id ON face_embeddings(user_id);
CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history(user_id);
CREATE INDEX IF NOT EXISTS idx_albums_user_id ON albums(user_id);

-- HNSW index for fast cosine similarity search over face embeddings
CREATE INDEX IF NOT EXISTS idx_face_embeddings_hnsw ON face_embeddings
  USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
