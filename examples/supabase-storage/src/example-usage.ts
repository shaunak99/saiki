/**
 * Example usage of SupabaseBlobStore
 *
 * This demonstrates basic operations with the Supabase blob storage implementation.
 * To run this example:
 *
 * 1. Set up your Supabase project and create the blob_metadata table (see README.md)
 * 2. Set environment variables:
 *    export SUPABASE_URL="https://xxxxx.supabase.co"
 *    export SUPABASE_KEY="your-anon-or-service-key"
 *    export SUPABASE_BUCKET="dexto-blobs"
 * 3. Build and run:
 *    npm run build
 *    node dist/example-usage.js
 */

import { SupabaseBlobStore, ConsoleLogger } from './supabase-blob-store.js';

async function main() {
    // Check required environment variables
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;
    const bucket = process.env.SUPABASE_BUCKET || 'dexto-blobs';

    if (!supabaseUrl || !supabaseKey) {
        console.error('Error: Missing required environment variables');
        console.error('Please set SUPABASE_URL and SUPABASE_KEY');
        console.error('\nExample:');
        console.error('  export SUPABASE_URL="https://xxxxx.supabase.co"');
        console.error('  export SUPABASE_KEY="your-anon-or-service-key"');
        console.error('  export SUPABASE_BUCKET="dexto-blobs"');
        process.exit(1);
    }

    console.log('=== Supabase Blob Storage Example ===\n');

    // Create blob store instance
    const store = new SupabaseBlobStore(
        {
            supabaseUrl,
            supabaseKey,
            bucket,
            pathPrefix: 'examples', // Optional: organize blobs in subfolder
            maxBlobSize: 50 * 1024 * 1024, // 50MB
        },
        new ConsoleLogger()
    );

    try {
        // 1. Connect to Supabase
        console.log('1. Connecting to Supabase...');
        await store.connect();
        console.log('   ✓ Connected\n');

        // 2. Store a text blob
        console.log('2. Storing a text blob...');
        const textBlob = await store.store(Buffer.from('Hello from Supabase blob storage!'), {
            mimeType: 'text/plain',
            originalName: 'greeting.txt',
            source: 'user',
        });
        console.log(`   ✓ Stored blob: ${textBlob.id}`);
        console.log(`   URI: ${textBlob.uri}`);
        console.log(`   Size: ${textBlob.metadata.size} bytes`);
        console.log(`   MIME type: ${textBlob.metadata.mimeType}\n`);

        // 3. Store a JSON blob
        console.log('3. Storing a JSON blob...');
        const jsonData = { message: 'Example data', timestamp: new Date().toISOString() };
        const jsonBlob = await store.store(Buffer.from(JSON.stringify(jsonData, null, 2)), {
            mimeType: 'application/json',
            originalName: 'data.json',
            source: 'system',
        });
        console.log(`   ✓ Stored blob: ${jsonBlob.id}\n`);

        // 4. Test deduplication - store same content again
        console.log('4. Testing deduplication (storing same content again)...');
        const duplicateBlob = await store.store(Buffer.from('Hello from Supabase blob storage!'), {
            mimeType: 'text/plain',
            originalName: 'greeting-copy.txt',
        });
        console.log(`   ✓ Blob ID: ${duplicateBlob.id}`);
        console.log(
            `   Same as first blob? ${duplicateBlob.id === textBlob.id ? 'Yes (deduplicated!)' : 'No'}\n`
        );

        // 5. Retrieve blob as buffer
        console.log('5. Retrieving blob as buffer...');
        const bufferData = await store.retrieve(textBlob.id, 'buffer');
        console.log(`   ✓ Content: ${bufferData.data.toString()}\n`);

        // 6. Retrieve blob as base64
        console.log('6. Retrieving blob as base64...');
        const base64Data = await store.retrieve(textBlob.id, 'base64');
        if (base64Data.format === 'base64') {
            console.log(`   ✓ Base64 (truncated): ${base64Data.data.substring(0, 40)}...\n`);
        }

        // 7. Get signed URL
        console.log('7. Getting signed URL...');
        const urlData = await store.retrieve(textBlob.id, 'url');
        console.log(`   ✓ Signed URL (valid for 1 hour):`);
        console.log(`   ${urlData.data}\n`);

        // 8. Check if blob exists
        console.log('8. Checking blob existence...');
        const exists = await store.exists(textBlob.id);
        console.log(`   ✓ Blob ${textBlob.id} exists: ${exists}`);
        const notExists = await store.exists('nonexistent-id');
        console.log(`   ✓ Blob 'nonexistent-id' exists: ${notExists}\n`);

        // 9. List all blobs
        console.log('9. Listing all blobs...');
        const allBlobs = await store.listBlobs();
        console.log(`   ✓ Total blobs: ${allBlobs.length}`);
        allBlobs.forEach((blob, index) => {
            console.log(`   ${index + 1}. ${blob.id}`);
            console.log(`      - Name: ${blob.metadata.originalName || 'N/A'}`);
            console.log(`      - Size: ${blob.metadata.size} bytes`);
            console.log(`      - Created: ${blob.metadata.createdAt.toISOString()}`);
        });
        console.log();

        // 10. Get storage statistics
        console.log('10. Getting storage statistics...');
        const stats = await store.getStats();
        console.log(`   ✓ Backend type: ${stats.backendType}`);
        console.log(`   ✓ Total blobs: ${stats.count}`);
        console.log(
            `   ✓ Total size: ${stats.totalSize} bytes (${(stats.totalSize / 1024).toFixed(2)} KB)`
        );
        console.log(`   ✓ Store path: ${stats.storePath}\n`);

        // 11. Delete a blob
        console.log('11. Deleting a blob...');
        await store.delete(jsonBlob.id);
        console.log(`   ✓ Deleted blob: ${jsonBlob.id}`);
        const existsAfterDelete = await store.exists(jsonBlob.id);
        console.log(`   ✓ Blob exists after delete: ${existsAfterDelete}\n`);

        // 12. Cleanup old blobs (example: older than 30 days)
        console.log('12. Testing cleanup (blobs older than 30 days)...');
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const deletedCount = await store.cleanup(thirtyDaysAgo);
        console.log(`   ✓ Cleaned up ${deletedCount} old blobs\n`);

        // 13. Final statistics
        console.log('13. Final storage statistics...');
        const finalStats = await store.getStats();
        console.log(`   ✓ Remaining blobs: ${finalStats.count}`);
        console.log(`   ✓ Total size: ${finalStats.totalSize} bytes\n`);

        console.log('=== Example completed successfully! ===\n');
    } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    } finally {
        // Always disconnect
        await store.disconnect();
        console.log('Disconnected from Supabase');
    }
}

// Run the example
main().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});
