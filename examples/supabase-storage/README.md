# Supabase Blob Storage Example

Demonstrates how to implement a custom blob storage backend for Dexto using [Supabase](https://supabase.com).

## Overview

This example shows **config-validated service injection** - a pattern where:
1. Your config declares the storage type (`type: 'supabase'`)
2. You provide a pre-configured instance
3. Dexto validates they match
4. Mismatches throw clear, helpful errors

This maintains Dexto's "config as source of truth" philosophy.

## Features

- ✅ **Remote Storage** - Store blobs in Supabase Storage buckets
- ✅ **Metadata Persistence** - Track blob metadata in PostgreSQL
- ✅ **Content Deduplication** - Same content = same blob ID
- ✅ **Multi-Format Retrieval** - base64, buffer, stream, signed URLs
- ✅ **Automatic Cleanup** - Delete old blobs by age
- ✅ **Full BlobStore Interface** - Drop-in replacement for built-in stores

## Quick Start

**5 minutes to running:**

1. **Setup Supabase:**
   - Create free account at [supabase.com](https://supabase.com)
   - Create storage bucket: `dexto-blobs` (disable RLS for testing)
   - Run `setup-simple.sql` in SQL Editor

2. **Configure:**
   ```bash
   cp .env.example .env
   # Add your SUPABASE_URL and SUPABASE_KEY
   ```

3. **Run:**
   ```bash
   npm run example:agent
   ```

**Full setup guide:** See [SETUP.md](./SETUP.md)

## Usage Pattern

```typescript
import { DextoAgent, createLogger } from '@dexto/core';
import { SupabaseBlobStore } from './src/supabase-blob-store.js';

// 1. Create custom blob store
const supabaseBlobStore = new SupabaseBlobStore(
  {
    supabaseUrl: process.env.SUPABASE_URL!,
    supabaseKey: process.env.SUPABASE_KEY!,
    bucket: 'dexto-blobs',
  },
  logger
);

// 2. Config MUST declare matching type
const agent = new DextoAgent(
  {
    storage: {
      blob: {
        type: 'supabase',  // ✅ Must match instance.getStoreType()
      },
      // ... other storage config
    },
    // ... other config
  },
  undefined,
  {
    // 3. Inject the instance
    storageBackendInstances: {
      blob: supabaseBlobStore,
    },
  }
);

await agent.start();
```

**What happens:**
- ✅ Config declares `type: 'supabase'`
- ✅ Instance returns `'supabase'` from `getStoreType()`
- ✅ Validation passes, agent uses Supabase storage

**If they don't match:**
```
Error: Configuration mismatch: config specifies blob store type 'local'
       but provided instance is type 'supabase'.
       Please update your config to: storage.blob.type = 'supabase'
```

## Architecture

**Storage Strategy:**
- Blobs → Supabase Storage (S3-compatible object storage)
- Metadata → PostgreSQL table with indexes
- Deduplication → Content-based hashing (SHA-256)

**BlobStore Interface:**
```typescript
interface BlobStore {
  store(input: BlobInput, metadata?: BlobMetadata): Promise<BlobReference>;
  retrieve(reference: string, format?: Format): Promise<BlobData>;
  exists(reference: string): Promise<boolean>;
  delete(reference: string): Promise<void>;
  cleanup(olderThan?: Date): Promise<number>;
  getStats(): Promise<BlobStats>;
  listBlobs(): Promise<BlobReference[]>;
  getStoragePath(): string | undefined;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  getStoreType(): string;
}
```

All 12 methods are fully implemented.

## Files

```
examples/supabase-storage/
├── SETUP.md                    # Quick setup guide
├── README.md                   # This file
├── setup-simple.sql            # Database setup (testing)
├── setup.sql                   # Database setup (production with RLS)
├── src/
│   ├── supabase-blob-store.ts  # SupabaseBlobStore implementation
│   ├── dexto-agent-example.ts  # DextoAgent integration example
│   └── example-usage.ts        # Standalone usage example
└── docs/
    ├── INTEGRATION-GUIDE.md    # Detailed integration patterns
    ├── IMPLEMENTATION.md       # Technical deep-dive
    └── SQL-SETUP-GUIDE.md      # SQL troubleshooting
```

## Key Concepts

### Config-Validated Service Injection

**Why not just override config?**

Dexto follows "config as source of truth" - the config file should accurately reflect what's running. Silent overrides create confusion.

**The pattern:**
1. Config explicitly declares the storage type
2. You provide a matching instance
3. Framework validates they match
4. Clear errors guide you to fix mismatches

**Benefits:**
- ✅ Config is auditable and accurate
- ✅ No silent overrides or confusing behavior
- ✅ Clear error messages
- ✅ Type-safe throughout

### Implementation Details

**Deduplication:**
- Same content → same SHA-256 hash → same blob ID
- Storing duplicate content returns existing reference
- Saves storage space and bandwidth

**Format Support:**
- `base64` - Downloads and encodes to base64 string
- `buffer` - Downloads to Node.js Buffer
- `stream` - Returns readable stream
- `url` - Generates signed URL (1 hour expiry)
- `path` - Not supported (remote storage)

**Error Handling:**
- Network failures
- Missing/inaccessible buckets
- Upload/download errors
- Database query failures
- Invalid references

## Documentation

- **[SETUP.md](./SETUP.md)** - Quick setup guide with troubleshooting
- **[docs/INTEGRATION-GUIDE.md](./docs/INTEGRATION-GUIDE.md)** - Complete integration guide
- **[docs/IMPLEMENTATION.md](./docs/IMPLEMENTATION.md)** - Technical implementation details
- **[docs/SQL-SETUP-GUIDE.md](./docs/SQL-SETUP-GUIDE.md)** - SQL setup and troubleshooting

## Examples

**Run DextoAgent integration:**
```bash
npm run example:agent
```

**Run standalone usage:**
```bash
npm run example
```

## Production Considerations

1. **Use service_role key** - Server-side operations need full access
2. **Enable RLS properly** - Use `setup.sql` for production policies
3. **Configure bucket permissions** - Public vs private buckets
4. **Set up proper indexes** - Already included in setup scripts
5. **Monitor storage usage** - Use `getStats()` for tracking
6. **Implement backup strategy** - Regular backups to another provider

## Extending This Example

Add features like:
- Public URLs (for public buckets)
- Image transformations (Supabase API)
- Custom metadata fields
- User-based access control
- CDN integration
- Automatic compression
- Virus scanning
- Backup automation

## License

MIT
