import { SystemPromptContributor, DynamicContributorContext } from './types.js';
import { readFile, stat } from 'fs/promises';
import { resolve, extname } from 'path';
import { logger } from '../logger/index.js';

export class StaticContributor implements SystemPromptContributor {
    constructor(
        public id: string,
        public priority: number,
        private content: string
    ) {}

    async getContent(_context: DynamicContributorContext): Promise<string> {
        return this.content;
    }
}

export class DynamicContributor implements SystemPromptContributor {
    constructor(
        public id: string,
        public priority: number,
        private promptGenerator: (context: DynamicContributorContext) => Promise<string>
    ) {}

    async getContent(context: DynamicContributorContext): Promise<string> {
        return this.promptGenerator(context);
    }
}

export interface FileContributorOptions {
    includeFilenames?: boolean | undefined;
    separator?: string | undefined;
    errorHandling?: 'skip' | 'error' | undefined;
    maxFileSize?: number | undefined;
    includeMetadata?: boolean | undefined;
    cache?: boolean | undefined;
}

export class FileContributor implements SystemPromptContributor {
    // Basic in-memory cache to avoid reading files on every prompt build
    private cache: Map<string, string> = new Map();

    constructor(
        public id: string,
        public priority: number,
        private files: string[],
        private options: FileContributorOptions = {},
        private configDir: string = process.cwd()
    ) {
        logger.debug(
            `[FileContributor] Created "${id}" with configDir: ${configDir} and files: ${JSON.stringify(files)}`
        );
    }

    async getContent(_context: DynamicContributorContext): Promise<string> {
        const {
            includeFilenames = true,
            separator = '\n\n---\n\n',
            errorHandling = 'skip',
            maxFileSize = 100000,
            includeMetadata = false,
            cache = true,
        } = this.options;

        // If caching is enabled, check if we have cached content
        if (cache) {
            const cacheKey = JSON.stringify({ files: this.files, options: this.options });
            const cached = this.cache.get(cacheKey);
            if (cached) {
                logger.debug(`[FileContributor] Using cached content for "${this.id}"`);
                return cached;
            }
        }

        const fileParts: string[] = [];

        for (const filePath of this.files) {
            try {
                // Resolve relative paths from config directory
                const resolvedPath = resolve(this.configDir, filePath);
                logger.debug(
                    `[FileContributor] Resolving path: ${filePath} with configDir: ${this.configDir} → ${resolvedPath}`
                );

                // Check if file is .md or .txt
                const ext = extname(resolvedPath).toLowerCase();
                if (ext !== '.md' && ext !== '.txt') {
                    if (errorHandling === 'error') {
                        throw new Error(`File ${filePath} is not a .md or .txt file`);
                    }
                    continue;
                }

                // Check file size
                const stats = await stat(resolvedPath);
                if (stats.size > maxFileSize) {
                    if (errorHandling === 'error') {
                        throw new Error(
                            `File ${filePath} exceeds maximum size of ${maxFileSize} bytes`
                        );
                    }
                    continue;
                }

                // Read file content (always utf-8)
                const content = await readFile(resolvedPath, { encoding: 'utf-8' });

                // Build file part
                let filePart = '';

                if (includeFilenames) {
                    filePart += `## ${filePath}\n\n`;
                }

                if (includeMetadata) {
                    filePart += `*File size: ${stats.size} bytes, Modified: ${stats.mtime.toISOString()}*\n\n`;
                }

                filePart += content;

                fileParts.push(filePart);
            } catch (error: any) {
                if (errorHandling === 'error') {
                    throw new Error(`Failed to read file ${filePath}: ${error.message || error}`);
                }
                // 'skip' mode - do nothing, continue to next file
            }
        }

        if (fileParts.length === 0) {
            return '<fileContext>No files could be loaded</fileContext>';
        }

        const combinedContent = fileParts.join(separator);
        const result = `<fileContext>\n${combinedContent}\n</fileContext>`;

        // Cache the result if caching is enabled
        if (cache) {
            const cacheKey = JSON.stringify({ files: this.files, options: this.options });
            this.cache.set(cacheKey, result);
            logger.debug(`[FileContributor] Cached content for "${this.id}"`);
        }

        return result;
    }
}
