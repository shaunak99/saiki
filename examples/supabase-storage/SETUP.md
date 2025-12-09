# Supabase Storage Setup Guide

Quick setup guide to get the example running.

## 1. Create Supabase Project

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a new project
3. Wait for the project to be ready (~2 minutes)

## 2. Create Storage Bucket

1. Navigate to **Storage** in the Supabase dashboard
2. Click **New bucket**
3. Name it: `dexto-blobs`
4. **Important:** Uncheck "Enable Row Level Security" (for testing)
5. Click **Create bucket**

## 3. Setup Database Table

1. Navigate to **SQL Editor** in the Supabase dashboard
2. Click **New query**
3. Copy and paste the contents of `setup-simple.sql`
4. Click **Run** or press `Ctrl/Cmd + Enter`
5. You should see: "Setup complete! blob_metadata table is ready."

## 4. Configure Environment Variables

1. Copy the example env file:
   ```bash
   cp .env.example .env
   ```

2. Get your credentials from **Project Settings → API**:
   - **Project URL** → Copy to `SUPABASE_URL`
   - **anon/public key** → Copy to `SUPABASE_KEY`

3. Your `.env` should look like:
   ```env
   SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   SUPABASE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   SUPABASE_BUCKET=dexto-blobs
   ```

## 5. Run the Example

```bash
npm run example:agent
```

You should see:
```
✅ Supabase storage is active!
✅ Stored blob: <blob-id>
✅ Retrieved content: "Hello from DextoAgent with Supabase storage!"
```

## Troubleshooting

### Error: "new row violates row-level security policy"

**Fix:** Your storage bucket has RLS enabled.

**Solution 1 (Easiest):**
1. Go to **Storage** → Find `dexto-blobs` bucket
2. Click **...** menu → **Edit bucket**
3. **Uncheck** "Enable Row Level Security"
4. Save and try again

**Solution 2 (Use service_role key):**
1. Go to **Project Settings → API**
2. Copy the **service_role** key (keep this secret!)
3. Use it in `.env`:
   ```env
   SUPABASE_KEY=eyJhbGc...your-service-role-key
   ```

### Error: "relation blob_metadata does not exist"

You didn't run `setup-simple.sql`. Go back to step 3.

### Error: "Invalid API key"

Check your `.env` file - make sure `SUPABASE_KEY` has the correct key from your project.

## Next Steps

- **See the code:** Check `src/dexto-agent-example.ts` for the implementation
- **Learn more:** Read `README.md` for features and API reference
- **Integration guide:** See `docs/INTEGRATION-GUIDE.md` for detailed usage patterns
- **Production setup:** Use `setup.sql` for proper RLS policies

## Files

- **setup-simple.sql** - Database setup (no RLS, for testing)
- **setup.sql** - Full setup with RLS policies (for production)
- **src/dexto-agent-example.ts** - DextoAgent integration example
- **src/supabase-blob-store.ts** - SupabaseBlobStore implementation
