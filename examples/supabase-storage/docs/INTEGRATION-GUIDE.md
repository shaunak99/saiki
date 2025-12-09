# DextoAgent Integration Guide

This guide explains how to integrate the Supabase blob store with DextoAgent using **config-validated service injection**.

## Table of Contents

1. [Core Concept](#core-concept)
2. [Setup](#setup)
3. [Usage Pattern](#usage-pattern)
4. [Error Handling](#error-handling)
5. [Complete Example](#complete-example)

## Core Concept

Dexto follows a **"config as source of truth"** pattern. When you provide a custom storage backend:

1. **Config declares the type** - Your agent config must specify the storage type (e.g., `type: 'supabase'`)
2. **You provide the instance** - You create and configure the storage backend yourself
3. **Framework validates match** - Dexto validates that the instance type matches the config type
4. **Mismatch = clear error** - If they don't match, you get a helpful error message

This approach ensures:
- ✅ Config remains auditable and accurate
- ✅ No silent overrides or confusing behavior
- ✅ Clear error messages guide you to fix issues
- ✅ Type safety is maintained throughout

## Setup

### 1. Install Dependencies

```bash
cd examples/supabase-storage
npm install
```

### 2. Configure Supabase

Create a `.env` file with your Supabase credentials:

```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-anon-or-service-key
SUPABASE_BUCKET=dexto-blobs
ANTHROPIC_API_KEY=your-anthropic-api-key  # For LLM functionality
```

### 3. Setup Database

Run the SQL in `setup.sql` to create the required `blob_metadata` table in your Supabase project.

### 4. Create Storage Bucket

Create a storage bucket named `dexto-blobs` (or match your `SUPABASE_BUCKET` env var) in the Supabase dashboard.

## Usage Pattern

### Step 1: Create the Supabase Blob Store

```typescript
import { SupabaseBlobStore } from './src/supabase-blob-store.js';
import { createLogger } from 'dexto/logger';

const logger = createLogger({
    agentId: 'my-agent',
    config: {
        level: 'info',
        transports: [{ type: 'console', colorize: true }],
    },
});

const supabaseBlobStore = new SupabaseBlobStore(
    {
        supabaseUrl: process.env.SUPABASE_URL!,
        supabaseKey: process.env.SUPABASE_KEY!,
        bucket: 'dexto-blobs',
        pathPrefix: 'my-app', // Optional: organize blobs by app
    },
    logger  // Pass the Dexto logger for integrated logging
);
```

### Step 2: Configure DextoAgent

**IMPORTANT**: The config MUST declare `type: 'supabase'` to match the instance:

```typescript
import { DextoAgent } from 'dexto';

const agentConfig = {
    agentCard: {
        name: 'my-agent',
        version: '1.0.0',
    },
    llm: {
        provider: 'anthropic',
        model: 'claude-sonnet-4',
        apiKey: process.env.ANTHROPIC_API_KEY!,
    },
    storage: {
        blob: {
            type: 'supabase',  // ✅ MUST match supabaseBlobStore.getStoreType()
            // No other fields needed - instance provides the config
        },
        cache: { type: 'in-memory' },
        database: { type: 'in-memory' },
    },
    // ... other config
};
```

### Step 3: Create Agent with Service Injection

```typescript
const agent = new DextoAgent(
    agentConfig,           // Config declares the type
    undefined,             // No config file path needed
    {
        // Inject the pre-configured instance
        storageBackendInstances: {
            blob: supabaseBlobStore,
        },
    }
);

await agent.start();
```

### Step 4: Use the Agent

```typescript
// The agent now uses Supabase for blob storage
const session = agent.createSession('user-123');

// Any blob operations will use Supabase
const response = await agent.run(
    'Store this image for me: <image data>',
    undefined,
    session.id
);

// Verify storage backend
const storageInfo = await agent.services.storageManager.getInfo();
console.log('Blob storage type:', storageInfo.blob.type); // 'supabase'

await agent.stop();
```

## Error Handling

### Config Mismatch Error

If your config type doesn't match the instance type:

```typescript
const agent = new DextoAgent(
    {
        storage: {
            blob: { type: 'local', path: '/tmp' },  // ❌ Says 'local'
        },
    },
    undefined,
    {
        storageBackendInstances: {
            blob: supabaseBlobStore,  // ❌ But instance is 'supabase'
        },
    }
);

await agent.start();
// Error: Configuration mismatch: config specifies blob store type 'local'
//        but provided instance is type 'supabase'.
//        Please update your config to: storage.blob.type = 'supabase'
```

**Fix**: Update your config to match the instance:

```typescript
storage: {
    blob: {
        type: 'supabase',  // ✅ Now matches
    },
}
```

### Unknown Type Without Instance

If you specify an unknown type without providing an instance:

```typescript
const agent = new DextoAgent({
    storage: {
        blob: { type: 'supabase' },  // Unknown to core
    },
});

await agent.start();
// Error: Cannot create blob store: type 'supabase' is not built-in.
//        Either:
//          1. Change config to a supported type: 'local' or 'in-memory'
//          2. Provide a pre-instantiated BlobStore instance
```

**Fix**: Provide the instance via `storageBackendInstances`:

```typescript
const agent = new DextoAgent(
    config,
    undefined,
    {
        storageBackendInstances: { blob: supabaseBlobStore },
    }
);
```

## Complete Example

See `src/dexto-agent-example.ts` for a complete working example that:

1. Creates a Supabase blob store
2. Configures DextoAgent with matching type
3. Injects the instance
4. Starts the agent
5. Verifies storage integration
6. Tests blob operations
7. Cleans up

Run it:

```bash
npm run example:agent
```

## Architecture

### How Config-Validated Injection Works

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User Code                                                 │
│    - Creates SupabaseBlobStore instance                      │
│    - Config declares type: 'supabase'                        │
│    - Passes both to DextoAgent                               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. DextoAgent.start()                                        │
│    - Calls createAgentServices with options                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. createAgentServices()                                     │
│    - Passes storageBackendInstances to createStorageManager  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. StorageManager.initialize()                               │
│    - Passes blob instance to createBlobStore()               │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. createBlobStore(config, logger, providedInstance)         │
│    - If instance provided:                                   │
│      - Validates: instance.getStoreType() === config.type    │
│      - If match: returns instance ✅                         │
│      - If mismatch: throws clear error ❌                    │
│    - If no instance:                                         │
│      - Tries to create from config (built-in types only)     │
└─────────────────────────────────────────────────────────────┘
```

### Type Validation Flow

```typescript
// In createBlobStore():
if (providedInstance) {
    const instanceType = providedInstance.getStoreType();
    if (instanceType !== config.type) {
        throw new Error(
            `Config says '${config.type}' but instance is '${instanceType}'`
        );
    }
    return providedInstance;  // ✅ Valid
}
```

## Benefits

1. **Config Integrity**: Config file accurately reflects what's running
2. **No Silent Overrides**: Mismatches are caught immediately
3. **Clear Errors**: Error messages guide you to fix configuration
4. **Type Safety**: TypeScript catches many issues at compile time
5. **Flexibility**: Supports both built-in and custom backends
6. **Testability**: Easy to inject mock implementations for testing

## Next Steps

- **Try it**: Run `npm run example:agent` to see it in action
- **Customize**: Modify `SupabaseBlobStoreConfig` for your use case
- **Extend**: Add more methods or features to the Supabase implementation
- **Deploy**: Use in production with proper error handling and monitoring

## Related Documentation

- [README.md](./README.md) - Supabase blob store features and API
- [QUICKSTART.md](./QUICKSTART.md) - 5-minute quick start guide
- [IMPLEMENTATION.md](./IMPLEMENTATION.md) - Technical implementation details
- [Plugin Architecture Analysis](../../feature-plans/PLUGIN_ARCHITECTURE_ANALYSIS.md) - Future plugin system design
