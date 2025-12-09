-- Simplified Supabase Setup (No RLS for quick testing)
-- Run this SQL in your Supabase SQL Editor

-- Create blob_metadata table
CREATE TABLE IF NOT EXISTS blob_metadata (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  original_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  size BIGINT NOT NULL,
  hash TEXT NOT NULL,
  source TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_blob_metadata_created_at ON blob_metadata(created_at);
CREATE INDEX IF NOT EXISTS idx_blob_metadata_hash ON blob_metadata(hash);

-- Add table comments
COMMENT ON TABLE blob_metadata IS 'Stores metadata for blobs stored in Supabase Storage';

-- Verify setup
SELECT 'Setup complete! blob_metadata table is ready.' AS status;
