import type { Database } from './types.js';
import type { DatabaseConfig, PostgresDatabaseConfig, SqliteDatabaseConfig } from '../schemas.js';
import { MemoryDatabaseStore } from './memory-database-store.js';
import type { IDextoLogger } from '../../logger/v2/types.js';
import { StorageError } from '../errors.js';

// Types for database store constructors
interface SQLiteStoreConstructor {
    new (config: SqliteDatabaseConfig, logger: IDextoLogger): Database;
}

interface PostgresStoreConstructor {
    new (config: PostgresDatabaseConfig, logger: IDextoLogger): Database;
}

// Lazy imports for optional dependencies
let SQLiteStore: SQLiteStoreConstructor | null = null;
let PostgresStore: PostgresStoreConstructor | null = null;

/**
 * Create a database store based on configuration.
 * Handles lazy loading of optional dependencies.
 * Throws StorageError.dependencyNotInstalled if required package is missing.
 * Database paths are provided via CLI enrichment layer.
 *
 * Config-validated service injection pattern:
 * - If providedInstance is given, validates that providedInstance.getStoreType() === config.type
 * - If match, uses the provided instance
 * - If mismatch, throws clear error
 * - If no instance and unknown type, throws error explaining options
 *
 * @param config Database configuration with explicit paths
 * @param logger Logger instance for logging
 * @param providedInstance Optional pre-configured database instance
 */
export async function createDatabase(
    config: DatabaseConfig,
    logger: IDextoLogger,
    providedInstance?: Database
): Promise<Database> {
    // If instance provided, validate it matches config type
    if (providedInstance) {
        const instanceType = providedInstance.getStoreType();
        if (instanceType !== config.type) {
            throw StorageError.configMismatch(
                'database',
                config.type,
                instanceType,
                'The provided database instance type does not match the config type. ' +
                    'Either update the config to match the instance type, or provide a different instance.'
            );
        }
        logger.info(`Using provided ${config.type} database instance`);
        return providedInstance;
    }

    // No instance provided - use factory logic
    if (config.type === 'postgres') {
        return createPostgresStore(config as PostgresDatabaseConfig, logger);
    }

    if (config.type === 'sqlite') {
        return createSQLiteStore(config as SqliteDatabaseConfig, logger);
    }

    if (config.type === 'in-memory') {
        logger.info('Using in-memory database store');
        return new MemoryDatabaseStore();
    }

    // Unknown type - custom implementation required
    throw StorageError.unknownStoreType(
        'database',
        config.type,
        'To use a custom database:\n' +
            '  1. Declare the custom type in your config: { database: { type: "my-custom-type", ... } }\n' +
            '  2. Provide a Database instance via DextoAgent options:\n' +
            '     new DextoAgent(config, { storageBackendInstances: { database: myDatabase } })\n' +
            '  3. Ensure myDatabase.getStoreType() returns "my-custom-type"'
    );
}

async function createPostgresStore(
    config: PostgresDatabaseConfig,
    logger: IDextoLogger
): Promise<Database> {
    try {
        if (!PostgresStore) {
            const module = await import('./postgres-store.js');
            PostgresStore = module.PostgresStore;
        }
        logger.info('Connecting to PostgreSQL database');
        return new PostgresStore(config, logger);
    } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code === 'ERR_MODULE_NOT_FOUND') {
            throw StorageError.dependencyNotInstalled('PostgreSQL', 'pg', 'npm install pg');
        }
        throw error;
    }
}

async function createSQLiteStore(
    config: SqliteDatabaseConfig,
    logger: IDextoLogger
): Promise<Database> {
    // SQLiteStore uses dynamic import for better-sqlite3 inside connect(),
    // so dependency errors are thrown there, not here
    if (!SQLiteStore) {
        const module = await import('./sqlite-store.js');
        SQLiteStore = module.SQLiteStore;
    }
    logger.info(`Creating SQLite database store: ${config.path}`);
    return new SQLiteStore(config, logger);
}
