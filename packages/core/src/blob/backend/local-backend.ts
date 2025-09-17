import { promises as fs } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import { logger } from '../../logger/index.js';
import { getDextoPath } from '../../utils/path.js';
import { BlobError } from '../errors.js';
import type {
    BlobBackend,
    BlobInput,
    BlobMetadata,
    BlobReference,
    BlobData,
    BlobStats,
    StoredBlobMetadata,
    LocalBlobBackendConfig,
} from '../types.js';

/**
 * Internal configuration with all required properties
 */
interface ResolvedLocalBlobConfig {
    type: 'local';
    maxBlobSize: number;
    maxTotalSize: number;
    cleanupAfterDays: number;
    storePath: string;
}

/**
 * Local filesystem blob backend implementation
 *
 * Stores blobs on the local filesystem with content-based deduplication
 * and metadata tracking. This is the default backend for development
 * and single-machine deployments.
 */
export class LocalBlobBackend implements BlobBackend {
    private config: ResolvedLocalBlobConfig;
    private storePath: string;
    private connected = false;

    private static readonly DEFAULT_CONFIG = {
        maxBlobSize: 50 * 1024 * 1024, // 50MB
        maxTotalSize: 1024 * 1024 * 1024, // 1GB
        cleanupAfterDays: 30,
    } as const;

    constructor(config: LocalBlobBackendConfig) {
        const storePath = config.storePath || getDextoPath('data', 'blobs');
        this.config = {
            type: 'local',
            maxBlobSize: config.maxBlobSize ?? LocalBlobBackend.DEFAULT_CONFIG.maxBlobSize,
            maxTotalSize: config.maxTotalSize ?? LocalBlobBackend.DEFAULT_CONFIG.maxTotalSize,
            cleanupAfterDays:
                config.cleanupAfterDays ?? LocalBlobBackend.DEFAULT_CONFIG.cleanupAfterDays,
            storePath,
        };
        this.storePath = storePath;
    }

    async connect(): Promise<void> {
        if (this.connected) return;

        try {
            await fs.mkdir(this.storePath, { recursive: true });
            this.connected = true;
            logger.debug(`LocalBlobBackend connected at: ${this.storePath}`);
        } catch (error) {
            throw BlobError.operationFailed('connect', 'local', error);
        }
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        logger.debug('LocalBlobBackend disconnected');
    }

    isConnected(): boolean {
        return this.connected;
    }

    getBackendType(): string {
        return 'local';
    }

    async store(input: BlobInput, metadata: BlobMetadata = {}): Promise<BlobReference> {
        if (!this.connected) {
            throw BlobError.backendNotConnected('local');
        }

        // Convert input to buffer for processing
        const buffer = await this.inputToBuffer(input);

        // Check size limits
        if (buffer.length > this.config.maxBlobSize) {
            throw BlobError.sizeExceeded(buffer.length, this.config.maxBlobSize);
        }

        // Check total storage size if configured
        const maxTotalSize = this.config.maxTotalSize;
        if (maxTotalSize) {
            const stats = await this.getStats();
            if (stats.totalSize + buffer.length > maxTotalSize) {
                throw BlobError.totalSizeExceeded(stats.totalSize + buffer.length, maxTotalSize);
            }
        }

        // Generate content-based hash for deduplication
        const hash = createHash('sha256').update(buffer).digest('hex').substring(0, 16);
        const id = hash;

        const blobPath = path.join(this.storePath, `${id}.dat`);
        const metaPath = path.join(this.storePath, `${id}.meta.json`);

        // Check if blob already exists (deduplication)
        try {
            const existingMeta = await fs.readFile(metaPath, 'utf-8');
            const existingMetadata: StoredBlobMetadata = JSON.parse(existingMeta);
            logger.debug(`Blob ${id} already exists, returning existing reference`);

            return {
                id,
                uri: `blob:${id}`,
                metadata: existingMetadata,
            };
        } catch {
            // Blob doesn't exist, continue with storage
        }

        // Create complete metadata
        const storedMetadata: StoredBlobMetadata = {
            id,
            mimeType: metadata.mimeType || this.detectMimeType(buffer, metadata.originalName),
            originalName: metadata.originalName,
            createdAt: metadata.createdAt || new Date(),
            source: metadata.source || 'system',
            size: buffer.length,
            hash,
        };

        try {
            // Store blob data and metadata atomically
            await Promise.all([
                fs.writeFile(blobPath, buffer),
                fs.writeFile(metaPath, JSON.stringify(storedMetadata, null, 2)),
            ]);

            logger.debug(`Stored blob ${id} (${buffer.length} bytes, ${storedMetadata.mimeType})`);

            return {
                id,
                uri: `blob:${id}`,
                metadata: storedMetadata,
            };
        } catch (error) {
            // Cleanup on failure
            await Promise.allSettled([
                fs.unlink(blobPath).catch(() => {}),
                fs.unlink(metaPath).catch(() => {}),
            ]);
            throw BlobError.operationFailed('store', 'local', error);
        }
    }

    async retrieve(
        reference: string,
        format: 'base64' | 'buffer' | 'path' | 'stream' | 'url' = 'buffer'
    ): Promise<BlobData> {
        if (!this.connected) {
            throw BlobError.backendNotConnected('local');
        }

        const id = this.parseReference(reference);
        const blobPath = path.join(this.storePath, `${id}.dat`);
        const metaPath = path.join(this.storePath, `${id}.meta.json`);

        try {
            // Load metadata
            const metaContent = await fs.readFile(metaPath, 'utf-8');
            const metadata: StoredBlobMetadata = JSON.parse(metaContent);

            // Return data in requested format
            switch (format) {
                case 'base64': {
                    const buffer = await fs.readFile(blobPath);
                    return { format: 'base64', data: buffer.toString('base64'), metadata };
                }
                case 'buffer': {
                    const buffer = await fs.readFile(blobPath);
                    return { format: 'buffer', data: buffer, metadata };
                }
                case 'path': {
                    // Verify file exists
                    await fs.access(blobPath);
                    return { format: 'path', data: blobPath, metadata };
                }
                case 'stream': {
                    const stream = require('fs').createReadStream(blobPath);
                    return { format: 'stream', data: stream, metadata };
                }
                case 'url': {
                    // For local backend, return file:// URL
                    const absolutePath = path.resolve(blobPath);
                    return { format: 'url', data: `file://${absolutePath}`, metadata };
                }
                default:
                    throw BlobError.invalidInput(format, `Unsupported format: ${format}`);
            }
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                throw BlobError.notFound(reference);
            }
            throw BlobError.operationFailed('retrieve', 'local', error);
        }
    }

    async exists(reference: string): Promise<boolean> {
        if (!this.connected) {
            throw BlobError.backendNotConnected('local');
        }

        const id = this.parseReference(reference);
        const blobPath = path.join(this.storePath, `${id}.dat`);
        const metaPath = path.join(this.storePath, `${id}.meta.json`);

        try {
            await Promise.all([fs.access(blobPath), fs.access(metaPath)]);
            return true;
        } catch {
            return false;
        }
    }

    async delete(reference: string): Promise<void> {
        if (!this.connected) {
            throw BlobError.backendNotConnected('local');
        }

        const id = this.parseReference(reference);
        const blobPath = path.join(this.storePath, `${id}.dat`);
        const metaPath = path.join(this.storePath, `${id}.meta.json`);

        try {
            await Promise.all([fs.unlink(blobPath), fs.unlink(metaPath)]);
            logger.debug(`Deleted blob: ${id}`);
        } catch (error) {
            if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
                throw BlobError.notFound(reference);
            }
            throw BlobError.operationFailed('delete', 'local', error);
        }
    }

    async cleanup(olderThan?: Date): Promise<number> {
        if (!this.connected) {
            throw BlobError.backendNotConnected('local');
        }

        const cleanupDays = this.config.cleanupAfterDays;
        const cutoffDate = olderThan || new Date(Date.now() - cleanupDays * 24 * 60 * 60 * 1000);
        let deletedCount = 0;

        try {
            const files = await fs.readdir(this.storePath);
            const metaFiles = files.filter((f) => f.endsWith('.meta.json'));

            for (const metaFile of metaFiles) {
                const metaPath = path.join(this.storePath, metaFile);
                const id = metaFile.replace('.meta.json', '');
                const blobPath = path.join(this.storePath, `${id}.dat`);

                try {
                    const metaContent = await fs.readFile(metaPath, 'utf-8');
                    const metadata: StoredBlobMetadata = JSON.parse(metaContent);

                    if (new Date(metadata.createdAt) < cutoffDate) {
                        await Promise.all([
                            fs.unlink(blobPath).catch(() => {}),
                            fs.unlink(metaPath).catch(() => {}),
                        ]);
                        deletedCount++;
                        logger.debug(`Cleaned up old blob: ${id}`);
                    }
                } catch (error) {
                    logger.warn(`Failed to process blob metadata ${metaFile}: ${String(error)}`);
                }
            }

            if (deletedCount > 0) {
                logger.info(`Blob cleanup: removed ${deletedCount} old blobs`);
            }

            return deletedCount;
        } catch (error) {
            throw BlobError.cleanupFailed('local', error);
        }
    }

    async getStats(): Promise<BlobStats> {
        if (!this.connected) {
            throw BlobError.backendNotConnected('local');
        }

        try {
            const files = await fs.readdir(this.storePath);
            const datFiles = files.filter((f) => f.endsWith('.dat'));

            let totalSize = 0;
            for (const datFile of datFiles) {
                try {
                    const stat = await fs.stat(path.join(this.storePath, datFile));
                    totalSize += stat.size;
                } catch {
                    // Skip files that can't be stat'd
                }
            }

            return {
                count: datFiles.length,
                totalSize,
                backendType: 'local',
                storePath: this.storePath,
            };
        } catch (error) {
            logger.warn(`Failed to get blob store stats: ${String(error)}`);
            return {
                count: 0,
                totalSize: 0,
                backendType: 'local',
                storePath: this.storePath,
            };
        }
    }

    async listBlobs(): Promise<import('../types.js').BlobReference[]> {
        if (!this.connected) {
            throw BlobError.backendNotConnected('local');
        }

        try {
            const files = await fs.readdir(this.storePath);
            const metaFiles = files.filter((f) => f.endsWith('.meta.json'));
            const blobs: import('../types.js').BlobReference[] = [];

            for (const metaFile of metaFiles) {
                try {
                    const metaPath = path.join(this.storePath, metaFile);
                    const metaContent = await fs.readFile(metaPath, 'utf-8');
                    const metadata: StoredBlobMetadata = JSON.parse(metaContent);
                    const blobId = metaFile.replace('.meta.json', '');

                    blobs.push({
                        id: blobId,
                        uri: `blob:${blobId}`,
                        metadata,
                    });
                } catch (error) {
                    logger.warn(`Failed to process blob metadata ${metaFile}: ${String(error)}`);
                }
            }

            return blobs;
        } catch (error) {
            logger.warn(`Failed to list blobs: ${String(error)}`);
            return [];
        }
    }

    /**
     * Convert various input types to Buffer
     */
    private async inputToBuffer(input: BlobInput): Promise<Buffer> {
        if (Buffer.isBuffer(input)) {
            return input;
        }

        if (input instanceof Uint8Array) {
            return Buffer.from(input);
        }

        if (input instanceof ArrayBuffer) {
            return Buffer.from(new Uint8Array(input));
        }

        if (typeof input === 'string') {
            // Handle data URI
            if (input.startsWith('data:')) {
                const commaIndex = input.indexOf(',');
                if (commaIndex !== -1 && input.includes(';base64,')) {
                    const base64Data = input.substring(commaIndex + 1);
                    return Buffer.from(base64Data, 'base64');
                }
                throw BlobError.encodingError('inputToBuffer', 'Unsupported data URI format');
            }

            // Handle file path - only if it looks like an actual file path
            if ((input.includes('/') || input.includes('\\')) && input.length > 1) {
                try {
                    await fs.access(input);
                    return await fs.readFile(input);
                } catch {
                    // If file doesn't exist, treat as base64
                }
            }

            // Assume base64 string
            try {
                return Buffer.from(input, 'base64');
            } catch {
                throw BlobError.encodingError('inputToBuffer', 'Invalid base64 string');
            }
        }

        throw BlobError.invalidInput(input, `Unsupported input type: ${typeof input}`);
    }

    /**
     * Parse blob reference to extract ID
     */
    private parseReference(reference: string): string {
        if (!reference) {
            throw BlobError.invalidReference(reference, 'Empty reference');
        }

        if (reference.startsWith('blob:')) {
            const id = reference.substring(5);
            if (!id) {
                throw BlobError.invalidReference(reference, 'Empty blob ID after prefix');
            }
            return id;
        }

        return reference;
    }

    /**
     * Detect MIME type from buffer content and/or filename
     */
    private detectMimeType(buffer: Buffer, filename?: string): string {
        // Basic magic number detection
        const header = buffer.subarray(0, 16);

        // Check common file signatures
        if (header.length >= 4) {
            const signature = header.subarray(0, 4);
            if (signature.equals(Buffer.from([0xff, 0xd8, 0xff]))) return 'image/jpeg';
            if (signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return 'image/png';
            if (signature.equals(Buffer.from([0x47, 0x49, 0x46, 0x38]))) return 'image/gif';
            if (signature.equals(Buffer.from([0x25, 0x50, 0x44, 0x46]))) return 'application/pdf';
        }

        // Try filename extension
        if (filename) {
            const ext = path.extname(filename).toLowerCase();
            const mimeTypes: Record<string, string> = {
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.png': 'image/png',
                '.gif': 'image/gif',
                '.pdf': 'application/pdf',
                '.txt': 'text/plain',
                '.json': 'application/json',
                '.xml': 'text/xml',
                '.html': 'text/html',
                '.css': 'text/css',
                '.js': 'text/javascript',
                '.mp3': 'audio/mpeg',
                '.mp4': 'video/mp4',
                '.wav': 'audio/wav',
            };
            if (mimeTypes[ext]) return mimeTypes[ext];
        }

        // Check if content looks like text
        if (this.isTextBuffer(buffer)) {
            return 'text/plain';
        }

        return 'application/octet-stream';
    }

    /**
     * Check if buffer contains text content
     */
    private isTextBuffer(buffer: Buffer): boolean {
        // Simple heuristic: check if most bytes are printable ASCII or common UTF-8
        let printableCount = 0;
        const sampleSize = Math.min(512, buffer.length);

        for (let i = 0; i < sampleSize; i++) {
            const byte = buffer[i];
            if (
                byte !== undefined &&
                ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13)
            ) {
                printableCount++;
            }
        }

        return printableCount / sampleSize > 0.7;
    }
}
