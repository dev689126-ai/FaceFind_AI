/*
# Raise default face search threshold to 0.6

The 1/(1+L2) similarity formula means 0.6 = L2 distance < 0.667, which
matches face-api.js's standard Euclidean threshold (~0.6). This filters
out the cross-user false positives that scored ~0.55 under the looser 0.5
threshold.
*/

DROP FUNCTION IF EXISTS search_faces(vector(128), float, int);

CREATE FUNCTION search_faces(
  query vector(128),
  match_threshold float DEFAULT 0.6,
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
    1.0 / (1.0 + (fe.embedding <-> query)) AS similarity,
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
  WHERE (1.0 / (1.0 + (fe.embedding <-> query))) > match_threshold
    AND p.privacy IN ('public','discoverable')
  ORDER BY fe.embedding <-> query ASC
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION search_faces(vector(128), float, int) TO authenticated;
