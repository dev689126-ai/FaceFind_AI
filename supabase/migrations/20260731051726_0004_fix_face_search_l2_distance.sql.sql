/*
# Fix face search: switch from cosine to Euclidean (L2) distance

## Problem
face-api.js produces 128-dim descriptors designed for Euclidean (L2) distance.
The original search_faces RPC used cosine distance (`<=>`), which is
magnitude-independent. Because face-api descriptors cluster in a narrow
cone of the vector space, cosine similarity between *different* people was
scoring 0.85-1.00, causing false matches across unrelated users.

## Fix
1. Replace the HNSW index from vector_cosine_ops to vector_l2_ops.
2. Rewrite search_faces to use L2 distance (`<->`) and convert to a
   similarity score in [0,1] via 1/(1+distance). A typical same-person L2
   distance is ~0.4-0.6 (similarity ~0.6-0.7); different people are ~0.9+
   (similarity ~0.5 and below). Default threshold is 0.5.
3. Keep SECURITY DEFINER + same return shape so the frontend is unaffected.

## Security
- No RLS policy changes. The function remains SECURITY DEFINER, search_path = public.
*/

-- Drop the old cosine HNSW index
DROP INDEX IF EXISTS idx_face_embeddings_hnsw;

-- Recreate with L2 (Euclidean) distance ops
CREATE INDEX idx_face_embeddings_hnsw ON face_embeddings
  USING hnsw (embedding vector_l2_ops) WITH (m = 16, ef_construction = 64);

-- Must drop the function first (cannot change return type of existing function)
DROP FUNCTION IF EXISTS search_faces(vector(128), float, int);

-- Rewrite the search function to use Euclidean distance
CREATE FUNCTION search_faces(
  query vector(128),
  match_threshold float DEFAULT 0.5,
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
