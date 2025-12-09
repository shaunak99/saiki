# SQL Setup Guide

This directory contains different SQL setup scripts depending on your needs.

## Quick Start (Recommended for Testing)

**Use: `setup-simple.sql`**

The simplest setup without Row Level Security (RLS). Perfect for testing and development:

```sql
-- Just the essentials:
-- ✓ Creates blob_metadata table
-- ✓ Adds performance indexes
-- ✗ No RLS policies (all users have access)
```

**When to use:** Local testing, development, proof of concept

## Standard Setup (Recommended for Production)

**Use: `setup.sql`**

Complete setup with Row Level Security policies:

```sql
-- Full setup:
-- ✓ Creates blob_metadata table
-- ✓ Adds performance indexes
-- ✓ Enables Row Level Security
-- ✓ Service role has full access
-- ✓ Authenticated users can read/insert
```

**When to use:** Production deployments with authentication

## How to Run

1. Go to your Supabase project
2. Navigate to **SQL Editor**
3. Click **New query**
4. Copy the contents of one of the SQL files
5. Click **Run** or press `Ctrl/Cmd + Enter`

## Troubleshooting

### Error: "policy already exists"

**Solution:** The script now automatically drops existing policies before creating new ones. If you still get this error, manually run:

```sql
DROP POLICY IF EXISTS "Service role can manage all blobs" ON blob_metadata;
DROP POLICY IF EXISTS "Authenticated users can read blobs" ON blob_metadata;
DROP POLICY IF EXISTS "Authenticated users can insert blobs" ON blob_metadata;
```

Then re-run the setup script.

### Error: "syntax error at or near 'NOT'"

**Solution:** This was caused by `IF NOT EXISTS` on CREATE POLICY statements, which isn't supported in older PostgreSQL versions. The updated scripts fix this by:
1. Dropping policies first with `DROP POLICY IF EXISTS`
2. Then creating them fresh with `CREATE POLICY`

### Error: "relation blob_metadata already exists"

**Solution:** Table already exists! You're good to go. If you want to start fresh:

```sql
DROP TABLE IF EXISTS blob_metadata CASCADE;
```

Then re-run the setup script.

## Security Notes

### Development (setup-simple.sql)
- No RLS enabled
- All users can access all blobs
- ⚠️ Not recommended for production

### Production (setup.sql)
- RLS enabled
- Service role: Full access (for server-side operations)
- Authenticated users: Can read all blobs, insert new ones
- You can customize policies for user-specific access

### Custom User-Specific Access

To restrict users to only their own blobs, uncomment this section in `setup.sql`:

```sql
DROP POLICY IF EXISTS "Users can manage their own blobs" ON blob_metadata;
CREATE POLICY "Users can manage their own blobs"
  ON blob_metadata
  FOR ALL
  TO authenticated
  USING (auth.uid()::text = source)
  WITH CHECK (auth.uid()::text = source);
```

This requires storing the user's UUID in the `source` column when creating blobs.

## Verification

After running the setup, verify it worked:

```sql
-- Check table exists
SELECT * FROM blob_metadata LIMIT 1;

-- Check indexes
SELECT indexname FROM pg_indexes WHERE tablename = 'blob_metadata';

-- Check RLS is enabled (should return true)
SELECT relrowsecurity FROM pg_class WHERE relname = 'blob_metadata';

-- Check policies
SELECT policyname FROM pg_policies WHERE tablename = 'blob_metadata';
```

## Files in This Directory

- **setup.sql** - Full production setup with RLS
- **setup-simple.sql** - Minimal setup without RLS (testing)
- **setup-fixed.sql** - Same as setup.sql (legacy, for reference)
