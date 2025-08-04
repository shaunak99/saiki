// src/config/mcp/resolver.ts
import { ok, fail, type Result, type Issue, hasErrors, zodToIssues } from '../utils/result.js';
import { SaikiErrorCode } from '../schemas/errors.js';

import {
    McpServerConfigSchema,
    type McpServerConfig,
    type ValidatedMcpServerConfig,
} from '../schemas/mcp.js';

export type McpServerContext = { serverName?: string };

export function resolveAndValidateMcpServerConfig(
    serverName: string,
    serverConfig: McpServerConfig,
    existingServerNames: string[] = []
): Result<ValidatedMcpServerConfig, McpServerContext> {
    const { candidate, warnings } = resolveMcpServerConfig(
        serverName,
        serverConfig,
        existingServerNames
    );
    if (hasErrors(warnings)) {
        return fail<ValidatedMcpServerConfig, McpServerContext>(warnings);
    }
    return validateMcpServerConfig(candidate, warnings);
}

function resolveMcpServerConfig(
    serverName: string,
    candidate: McpServerConfig,
    existingServerNames: string[]
): { candidate: McpServerConfig; warnings: Issue<McpServerContext>[] } {
    const warnings: Issue<McpServerContext>[] = [];

    // name sanity: keep it as a hard error if it's clearly unusable
    if (typeof serverName !== 'string' || serverName.trim() === '') {
        warnings.push({
            code: SaikiErrorCode.MCP_SCHEMA_VALIDATION,
            message: 'Server name must be a non-empty string',
            severity: 'error',
            context: { serverName },
        });
    }

    // duplicate (case-insensitive) → warning
    const dup = existingServerNames.find(
        (n) => n.toLowerCase() === serverName.toLowerCase() && n !== serverName
    );
    if (dup) {
        warnings.push({
            code: SaikiErrorCode.MCP_DUPLICATE_NAME,
            message: `Server name '${serverName}' is similar to existing '${dup}' (case differs)`,
            severity: 'warning',
            context: { serverName },
        });
    }

    return { candidate, warnings };
}

/** Validates MCP server by prasing it through zod schema*/
function validateMcpServerConfig(
    candidate: McpServerConfig,
    warnings: Issue<McpServerContext>[]
): Result<ValidatedMcpServerConfig, McpServerContext> {
    const parsed = McpServerConfigSchema.safeParse(candidate);
    if (!parsed.success) {
        return fail<ValidatedMcpServerConfig, McpServerContext>(
            zodToIssues<McpServerContext>(parsed.error, 'error')
        );
    }
    return ok<ValidatedMcpServerConfig, McpServerContext>(parsed.data, warnings);
}
