// src/core/utils/execution-context.ts

import { walkUpDirectories } from './fs-walk.js';
import { readFileSync } from 'fs';
import * as path from 'path';

export type ExecutionContext = 'dexto-source' | 'dexto-project' | 'global-cli';

/**
 * Check if directory is the dexto source code itself
 * @param dirPath Directory to check
 * @returns True if directory contains dexto source (package.name === 'dexto')
 */
function isDextoSourceDirectory(dirPath: string): boolean {
    const packageJsonPath = path.join(dirPath, 'package.json');

    try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
        return pkg.name === 'dexto';
    } catch {
        return false;
    }
}

/**
 * Check if directory is a project that uses dexto as dependency (but is not dexto source)
 * @param dirPath Directory to check
 * @returns True if directory has dexto as dependency but is not dexto source
 */
function isDextoProjectDirectory(dirPath: string): boolean {
    const packageJsonPath = path.join(dirPath, 'package.json');

    try {
        const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

        // Not the dexto source itself
        if (pkg.name === 'dexto') {
            return false;
        }

        // Check if has dexto as dependency
        const allDeps = {
            ...(pkg.dependencies ?? {}),
            ...(pkg.devDependencies ?? {}),
            ...(pkg.peerDependencies ?? {}),
        };

        return 'dexto' in allDeps;
    } catch {
        return false;
    }
}

/**
 * Find dexto source root directory
 * @param startPath Starting directory path
 * @returns Dexto source root directory or null if not found
 */
export function findDextoSourceRoot(startPath: string = process.cwd()): string | null {
    return walkUpDirectories(startPath, isDextoSourceDirectory);
}

/**
 * Find dexto project root directory (projects using dexto as dependency)
 * @param startPath Starting directory path
 * @returns Dexto project root directory or null if not found
 */
export function findDextoProjectRoot(startPath: string = process.cwd()): string | null {
    return walkUpDirectories(startPath, isDextoProjectDirectory);
}

/**
 * Detect current execution context - standardized across codebase
 * @param startPath Starting directory path (defaults to process.cwd())
 * @returns Execution context
 */
export function getExecutionContext(startPath: string = process.cwd()): ExecutionContext {
    // Check for Dexto source context first (most specific)
    if (findDextoSourceRoot(startPath)) {
        return 'dexto-source';
    }

    // Check for Dexto project context
    if (findDextoProjectRoot(startPath)) {
        return 'dexto-project';
    }

    // Default to global CLI context
    return 'global-cli';
}
