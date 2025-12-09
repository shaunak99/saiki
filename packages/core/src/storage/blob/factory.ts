import type { BlobStore } from './types.js';
import type { BlobStoreConfig, InMemoryBlobStoreConfig, LocalBlobStoreConfig } from './schemas.js';
import { LocalBlobStore } from './local-blob-store.js';
import { InMemoryBlobStore } from './memory-blob-store.js';
import type { IDextoLogger } from '../../logger/v2/types.js';
import { StorageError } from '../errors.js';

/**
 * Create a blob store based on configuration.
 * Blob paths are provided via CLI enrichment layer for local storage.
 *
 * Config-validated service injection pattern:
 * - If providedInstance is given, validates that providedInstance.getStoreType() === config.type
 * - If match, uses the provided instance
 * - If mismatch, throws clear error
 * - If no instance and unknown type, throws error explaining options
 *
 * @param config Blob store configuration
 * @param logger Logger instance for logging
 * @param providedInstance Optional pre-configured blob store instance
 */
export function createBlobStore(
    config: BlobStoreConfig,
    logger: IDextoLogger,
    providedInstance?: BlobStore
): BlobStore {
    // If instance provided, validate it matches config type
    if (providedInstance) {
        const instanceType = providedInstance.getStoreType();
        if (instanceType !== config.type) {
            throw StorageError.configMismatch(
                'blob',
                config.type,
                instanceType,
                'The provided blob store instance type does not match the config type. ' +
                    'Either update the config to match the instance type, or provide a different instance.'
            );
        }
        logger.info(`Using provided ${config.type} blob store instance`);
        return providedInstance;
    }

    // No instance provided - use factory logic
    if (config.type === 'in-memory') {
        logger.info('Using in-memory blob store');
        return new InMemoryBlobStore(config as InMemoryBlobStoreConfig, logger);
    }

    if (config.type === 'local') {
        logger.info('Using local file-based blob store');
        return new LocalBlobStore(config as LocalBlobStoreConfig, logger);
    }

    // Unknown type - custom implementation required
    throw StorageError.unknownStoreType(
        'blob',
        config.type,
        'To use a custom blob store:\n' +
            '  1. Declare the custom type in your config: { blob: { type: "my-custom-type", ... } }\n' +
            '  2. Provide a BlobStore instance via DextoAgent options:\n' +
            '     new DextoAgent(config, { storageBackendInstances: { blob: myBlobStore } })\n' +
            '  3. Ensure myBlobStore.getStoreType() returns "my-custom-type"'
    );
}
