/**
 * Type definitions for application configuration
 */

/**
 * Configuration for stdio-based MCP server connections
 * - type: Must be 'stdio'
 * - command: The shell command to launch the server (e.g., 'node')
 * - args: Array of arguments for the command (e.g., ['script.js'])
 * - env: Optional environment variables for the server process
 */
export interface StdioServerConfig {
    type: 'stdio';
    command: string;
    args: string[];
    env?: Record<string, string>;
    timeout?: number; // in milliseconds
}

/**
 * Configuration for SSE-based MCP server connections
 */
export interface SSEServerConfig {
    type: 'sse';
    url: string;
    headers?: Record<string, string>;
    timeout?: number; // in milliseconds
}

/**
 * Union type for MCP server configurations
 */
export type McpServerConfig = StdioServerConfig | SSEServerConfig;

/**
 * Type for server configurations dictionary
 */
export type ServerConfigs = Record<string, McpServerConfig>;

/**
 * LLM configuration type
 */
export interface ContributorConfig {
    id: string;
    type: 'static' | 'dynamic';
    priority: number;
    enabled?: boolean;
    content?: string; // for static
    source?: string; // for dynamic
}

export interface SystemPromptConfig {
    contributors: ContributorConfig[];
}

export type LLMConfig = {
    provider: string;
    model: string;
    systemPrompt: string | SystemPromptConfig;
    apiKey?: string;
    /** Maximum number of tool-iteration steps (for in-built and Vercel providers) */
    maxIterations?: number;
    providerOptions?: Record<string, any>;
};

/**
 * Agent configuration type
 */
export type AgentConfig = {
    mcpServers: ServerConfigs;
    llm: LLMConfig;
    [key: string]: any; // Allow for future extensions
};
