/*
# Enable pgvector extension

1. Extensions
- Enables `vector` extension (pgvector) for storing and searching face embeddings.
- Provides the `vector` type and ivfflat/hnsw index access methods used for similarity search.
2. Security
- No RLS changes (extension only).
3. Notes
- Safe to re-run: uses IF NOT EXISTS via CREATE EXTENSION default behavior.
*/

CREATE EXTENSION IF NOT EXISTS vector;
