import type { Cache } from './types.js';
import type { RedisCacheConfig, CacheConfig } from '../schemas.js';
import { MemoryCacheStore } from './memory-cache-store.js';
import type { IDextoLogger } from '../../logger/v2/types.js';
import { StorageError } from '../errors.js';

// Type for Redis store constructor
interface RedisStoreConstructor {
    new (config: RedisCacheConfig, logger: IDextoLogger): Cache;
}

// Lazy import for optional Redis dependency
let RedisStore: RedisStoreConstructor | null = null;

/**
 * Create a cache store based on configuration.
 * Handles lazy loading of optional dependencies.
 * Throws StorageError.dependencyNotInstalled if required package is missing.
 *
 * Config-validated service injection pattern:
 * - If providedInstance is given, validates that providedInstance.getStoreType() === config.type
 * - If match, uses the provided instance
 * - If mismatch, throws clear error
 * - If no instance and unknown type, throws error explaining options
 *
 * @param config Cache configuration
 * @param logger Logger instance for logging
 * @param providedInstance Optional pre-configured cache instance
 */
export async function createCache(
    config: CacheConfig,
    logger: IDextoLogger,
    providedInstance?: Cache
): Promise<Cache> {
    // If instance provided, validate it matches config type
    if (providedInstance) {
        const instanceType = providedInstance.getStoreType();
        if (instanceType !== config.type) {
            throw StorageError.configMismatch(
                'cache',
                config.type,
                instanceType,
                'The provided cache instance type does not match the config type. ' +
                    'Either update the config to match the instance type, or provide a different instance.'
            );
        }
        logger.info(`Using provided ${config.type} cache instance`);
        return providedInstance;
    }

    // No instance provided - use factory logic
    if (config.type === 'redis') {
        return createRedisStore(config as RedisCacheConfig, logger);
    }

    if (config.type === 'in-memory') {
        logger.info('Using in-memory cache store');
        return new MemoryCacheStore();
    }

    // Unknown type - custom implementation required
    throw StorageError.unknownStoreType(
        'cache',
        config.type,
        'To use a custom cache:\n' +
            '  1. Declare the custom type in your config: { cache: { type: "my-custom-type", ... } }\n' +
            '  2. Provide a Cache instance via DextoAgent options:\n' +
            '     new DextoAgent(config, { storageBackendInstances: { cache: myCache } })\n' +
            '  3. Ensure myCache.getStoreType() returns "my-custom-type"'
    );
}

async function createRedisStore(config: RedisCacheConfig, logger: IDextoLogger): Promise<Cache> {
    try {
        if (!RedisStore) {
            const module = await import('./redis-store.js');
            RedisStore = module.RedisStore;
        }
        logger.info(`Connecting to Redis at ${config.host}:${config.port}`);
        return new RedisStore(config, logger);
    } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ERR_MODULE_NOT_FOUND') {
            throw StorageError.dependencyNotInstalled('Redis', 'ioredis', 'npm install ioredis');
        }
        throw error;
    }
}
