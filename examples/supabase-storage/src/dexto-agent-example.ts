/**
 * DextoAgent Integration Example with Supabase Storage
 *
 * This example demonstrates how to use a custom storage backend (Supabase)
 * with DextoAgent using the config-validated service injection pattern.
 *
 * Key principles:
 * 1. Config declares the storage type ('supabase')
 * 2. We provide a pre-instantiated SupabaseBlobStore
 * 3. The framework validates that config type matches instance type
 * 4. If there's a mismatch, we get a clear error message
 */

import { DextoAgent, createLogger } from '@dexto/core';
import type { AgentConfig } from '@dexto/core';
import { SupabaseBlobStore } from './supabase-blob-store.js';
import 'dotenv/config';

async function main() {
    // 1. Create logger
    const logger = createLogger({
        agentId: 'supabase-demo',
        config: {
            level: 'info',
            transports: [
                {
                    type: 'console',
                    colorize: true,
                },
            ],
        },
    });

    logger.info('=== DextoAgent + Supabase Storage Example ===\n');

    // 2. Create Supabase blob store instance
    logger.info('Creating Supabase blob store instance...');
    const supabaseBlobStore = new SupabaseBlobStore(
        {
            supabaseUrl: process.env.SUPABASE_URL!,
            supabaseKey: process.env.SUPABASE_KEY!,
            bucket: process.env.SUPABASE_BUCKET || 'dexto-blobs',
            pathPrefix: 'agent-demo',
        },
        logger
    );

    // 3. Configure DextoAgent
    // IMPORTANT: Config must declare type: 'supabase' to match the instance
    const agentConfig: AgentConfig = {
        agentCard: {
            name: 'supabase-demo-agent',
            version: '1.0.0',
            description: 'Demo agent with Supabase storage',
            url: 'https://example.com',
        },
        llm: {
            provider: 'anthropic',
            model: 'claude-sonnet-4-5-20250929',
            apiKey: process.env.ANTHROPIC_API_KEY || 'dummy-key-for-demo',
        },
        storage: {
            // Config declares we're using Supabase storage
            blob: {
                type: 'supabase', // ✅ Must match supabaseBlobStore.getStoreType()
                // No other fields needed since we're providing the instance
            },
            cache: {
                type: 'in-memory',
            },
            database: {
                type: 'in-memory',
            },
        },
        toolConfirmation: {
            mode: 'auto-approve',
        },
        systemPrompt: {
            contributors: [
                {
                    type: 'static',
                    id: 'custom-instructions',
                    content: `You are a helpful AI assistant with access to Supabase blob storage.
When users provide images or files, you can store them using the blob storage system.`,
                    priority: 100,
                    enabled: true,
                },
            ],
        },
        mcpServers: {},
        internalTools: [],
        internalResources: [],
    };

    // 4. Create agent with service injection
    logger.info('Creating DextoAgent with Supabase storage...');
    const agent = new DextoAgent(
        agentConfig,
        undefined, // No config file path
        {
            // Inject the Supabase blob store instance
            storageBackendInstances: {
                blob: supabaseBlobStore,
            },
        }
    );

    // 5. Start the agent
    logger.info('Starting agent...');
    await agent.start();
    logger.info('Agent started successfully!\n');

    // 6. Verify storage integration
    logger.info('Verifying Supabase storage integration...');
    const storageInfo = await agent.services.storageManager.getInfo();
    logger.info('Storage backends:');
    logger.info(
        `  - Cache: ${storageInfo.cache.type} (${storageInfo.cache.connected ? 'connected' : 'disconnected'})`
    );
    logger.info(
        `  - Database: ${storageInfo.database.type} (${storageInfo.database.connected ? 'connected' : 'disconnected'})`
    );
    logger.info(
        `  - Blob: ${storageInfo.blob.type} (${storageInfo.blob.connected ? 'connected' : 'disconnected'})`
    );

    if (storageInfo.blob.type !== 'supabase') {
        throw new Error('Expected Supabase blob store but got: ' + storageInfo.blob.type);
    }
    logger.info('✅ Supabase storage is active!\n');

    // 7. Test blob storage operations
    logger.info('Testing blob storage operations...');

    // Store a sample blob
    const blobStore = agent.services.storageManager.getBlobStore();
    const testData = 'Hello from DextoAgent with Supabase storage!';
    const stored = await blobStore.store(Buffer.from(testData), {
        mimeType: 'text/plain',
        originalName: 'test.txt',
        source: 'system',
    });
    logger.info(`✅ Stored blob: ${stored.id}`);

    // Retrieve the blob
    const retrieved = await blobStore.retrieve(stored.id, 'buffer');
    if (retrieved.format === 'buffer') {
        const content = retrieved.data.toString('utf-8');
        logger.info(`✅ Retrieved content: "${content}"`);
    }

    // Get statistics
    const stats = await blobStore.getStats();
    logger.info(`✅ Storage stats: ${stats.count} blob(s), ${stats.totalSize} bytes`);

    // List all blobs
    const blobs = await blobStore.listBlobs();
    logger.info(`✅ Total blobs in storage: ${blobs.length}`);

    // Cleanup
    logger.info('\nCleaning up test blob...');
    await blobStore.delete(stored.id);
    logger.info('✅ Test blob deleted');

    // 8. Stop the agent
    logger.info('\nStopping agent...');
    await agent.stop();
    logger.info('✅ Agent stopped');

    logger.info('\n=== Demo completed successfully! ===\n');

    // 9. Example of config mismatch error (commented out)
    /*
    logger.info('\n=== Testing Config Mismatch Error ===');

    try {
        const mismatchAgent = new DextoAgent(
            {
                ...agentConfig,
                storage: {
                    ...agentConfig.storage,
                    blob: { type: 'local', path: '/tmp/blobs' }, // ❌ Mismatch!
                },
            },
            undefined,
            {
                storageBackendInstances: {
                    blob: supabaseBlobStore, // Says 'supabase'
                },
            }
        );
        await mismatchAgent.start();
    } catch (error) {
        logger.error('Expected error caught:');
        logger.error((error as Error).message);
        // Error: Configuration mismatch: config specifies blob store type 'local'
        //        but provided instance is type 'supabase'.
        //        Please update your config to: storage.blob.type = 'supabase'
    }
    */
}

// Run the example
main().catch((error) => {
    console.error('Error:', error);
    process.exit(1);
});
