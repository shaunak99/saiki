-- Supabase Blob Storage Setup Script
-- Run this SQL in your Supabase SQL Editor to set up the required database table

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

-- Create index on created_at for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_blob_metadata_created_at ON blob_metadata(created_at);

-- Create index on hash for efficient deduplication checks
CREATE INDEX IF NOT EXISTS idx_blob_metadata_hash ON blob_metadata(hash);

-- Add comments to document the table structure
COMMENT ON TABLE blob_metadata IS 'Stores metadata for blobs stored in Supabase Storage';
COMMENT ON COLUMN blob_metadata.id IS 'Unique blob identifier (content hash)';
COMMENT ON COLUMN blob_metadata.mime_type IS 'MIME type of the blob (e.g., image/png, text/plain)';
COMMENT ON COLUMN blob_metadata.original_name IS 'Original filename when blob was uploaded';
COMMENT ON COLUMN blob_metadata.created_at IS 'Timestamp when blob was created';
COMMENT ON COLUMN blob_metadata.size IS 'Size of blob in bytes';
COMMENT ON COLUMN blob_metadata.hash IS 'SHA-256 hash of blob content for deduplication';
COMMENT ON COLUMN blob_metadata.source IS 'Source of blob: tool, user, or system';

-- Enable Row Level Security (RLS)
ALTER TABLE blob_metadata ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid "already exists" errors
DROP POLICY IF EXISTS "Service role can manage all blobs" ON blob_metadata;
DROP POLICY IF EXISTS "Authenticated users can read blobs" ON blob_metadata;
DROP POLICY IF EXISTS "Authenticated users can insert blobs" ON blob_metadata;

-- Create policy: Service role has full access
CREATE POLICY "Service role can manage all blobs"
  ON blob_metadata
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create policy: Authenticated users can read all blobs (adjust as needed)
CREATE POLICY "Authenticated users can read blobs"
  ON blob_metadata
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy: Authenticated users can insert blobs (adjust as needed)
CREATE POLICY "Authenticated users can insert blobs"
  ON blob_metadata
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Optional: Create policy for user-specific blob access
-- Uncomment and modify if you want users to only access their own blobs
-- DROP POLICY IF EXISTS "Users can manage their own blobs" ON blob_metadata;
-- CREATE POLICY "Users can manage their own blobs"
--   ON blob_metadata
--   FOR ALL
--   TO authenticated
--   USING (auth.uid()::text = source)
--   WITH CHECK (auth.uid()::text = source);

-- Verify table creation
SELECT 'blob_metadata table created successfully!' AS status;
SELECT COUNT(*) as initial_blob_count FROM blob_metadata;
