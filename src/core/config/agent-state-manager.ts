import { logger } from '../logger/index.js';
import type { ValidatedAgentConfig } from '../config/schemas.js';
import type { ValidatedLLMConfig } from '../schemas/llm.js';
import type { ValidatedMcpServerConfig } from '../schemas/mcp.js';
import type { AgentEventBus } from '../events/index.js';

/**
 * Session-specific overrides that can differ from the global configuration
 */
export interface SessionOverride {
    /** Override LLM config for this session - must be a complete validated config */
    llm?: ValidatedLLMConfig;
}

/**
 * Manages the runtime configuration of the agent.
 *
 * This class handles dynamic configuration changes that occur during agent execution.
 *
 * Key responsibilities:
 * 1. Track runtime changes separate from static config baseline
 * 2. Support session-specific overrides for LLM settings
 * 3. Dynamic MCP server management (add/remove servers at runtime)
 * 4. Export modified state back to config format
 * 5. Provide change tracking and validation capabilities
 * 6. Maintain effective configuration for each session
 */
export class AgentStateManager {
    private runtimeConfig: ValidatedAgentConfig;
    private readonly baselineConfig: ValidatedAgentConfig;
    private sessionOverrides: Map<string, SessionOverride> = new Map();

    /**
     * Initialize AgentStateManager from a processed static configuration.
     *
     * @param staticConfig The processed configuration from ConfigManager
     * @param agentEventBus The agent event bus for emitting state change events
     */
    constructor(
        staticConfig: ValidatedAgentConfig,
        private agentEventBus: AgentEventBus
    ) {
        this.baselineConfig = structuredClone(staticConfig);
        this.runtimeConfig = structuredClone(staticConfig);

        logger.debug('AgentStateManager initialized', {
            staticConfigKeys: Object.keys(this.baselineConfig),
            mcpServerCount: Object.keys(this.runtimeConfig.mcpServers).length,
        });
    }

    // ============= GETTERS =============

    /**
     * Get runtime configuration for a session (includes session overrides if sessionId provided)
     */
    public getRuntimeConfig(sessionId?: string): Readonly<ValidatedAgentConfig> {
        if (!sessionId) {
            return structuredClone(this.runtimeConfig);
        }

        const override = this.sessionOverrides.get(sessionId);
        if (!override) {
            return structuredClone(this.runtimeConfig);
        }

        return {
            ...this.runtimeConfig,
            llm: { ...this.runtimeConfig.llm, ...override.llm },
        };
    }

    // ============= LLM CONFIGURATION =============

    /**
     * Update the LLM configuration (globally or for a specific session)
     *
     * This method is a pure state updater - it assumes the input has already been validated
     * by the caller (typically SaikiAgent.switchLLM). The ValidatedLLMConfig branded type
     * ensures validation has occurred.
     */
    public updateLLM(validatedConfig: ValidatedLLMConfig, sessionId?: string): void {
        const oldValue = sessionId ? this.getRuntimeConfig(sessionId).llm : this.runtimeConfig.llm;

        if (sessionId) {
            this.setSessionOverride(sessionId, {
                llm: validatedConfig,
            });
        } else {
            this.runtimeConfig.llm = validatedConfig;
        }

        this.agentEventBus.emit('saiki:stateChanged', {
            field: 'llm',
            oldValue,
            newValue: validatedConfig,
            sessionId,
        });

        logger.info('LLM config updated', {
            sessionId,
            provider: validatedConfig.provider,
            model: validatedConfig.model,
            isSessionSpecific: !!sessionId,
        });
    }

    // ============= MCP SERVER MANAGEMENT =============

    /**
     * Add or update an MCP server configuration at runtime.
     *
     * This method is a pure state updater - it assumes the input has already been validated
     * by the caller (typically SaikiAgent.connectMcpServer). The ValidatedMcpServerConfig
     * branded type ensures validation has occurred.
     */
    public addMcpServer(serverName: string, validatedConfig: ValidatedMcpServerConfig): void {
        logger.debug(`Adding/updating MCP server: ${serverName}`);

        // Update state
        const isUpdate = serverName in this.runtimeConfig.mcpServers;
        this.runtimeConfig.mcpServers[serverName] = validatedConfig;

        // Emit events
        const eventName = isUpdate ? 'saiki:mcpServerUpdated' : 'saiki:mcpServerAdded';
        this.agentEventBus.emit(eventName, { serverName, config: validatedConfig });

        this.agentEventBus.emit('saiki:stateChanged', {
            field: 'mcpServers',
            oldValue: isUpdate ? 'updated' : 'added',
            newValue: validatedConfig,
            sessionId: undefined, // MCP servers are global
        });

        logger.info(`MCP server '${serverName}' ${isUpdate ? 'updated' : 'added'} successfully`);
    }

    /**
     * Remove an MCP server configuration at runtime.
     */
    public removeMcpServer(serverName: string): void {
        logger.debug(`Removing MCP server: ${serverName}`);

        if (serverName in this.runtimeConfig.mcpServers) {
            delete this.runtimeConfig.mcpServers[serverName];

            this.agentEventBus.emit('saiki:mcpServerRemoved', { serverName });
            this.agentEventBus.emit('saiki:stateChanged', {
                field: 'mcpServers',
                oldValue: 'removed',
                newValue: undefined,
                sessionId: undefined, // MCP servers are global
            });

            logger.info(`MCP server '${serverName}' removed successfully`);
        } else {
            logger.warn(`MCP server '${serverName}' not found for removal`);
        }
    }

    // ============= SESSION MANAGEMENT =============

    /**
     * Set a session-specific override
     */
    private setSessionOverride(sessionId: string, override: SessionOverride): void {
        this.sessionOverrides.set(sessionId, override);
        this.agentEventBus.emit('saiki:sessionOverrideSet', {
            sessionId,
            override: structuredClone(override),
        });
    }

    /**
     * Get a session override (internal helper)
     */
    private getSessionOverride(sessionId: string): SessionOverride | undefined {
        return this.sessionOverrides.get(sessionId);
    }

    /**
     * Clear session-specific overrides
     */
    public clearSessionOverride(sessionId: string): void {
        const hadOverride = this.sessionOverrides.has(sessionId);
        this.sessionOverrides.delete(sessionId);

        if (hadOverride) {
            this.agentEventBus.emit('saiki:sessionOverrideCleared', { sessionId });
            logger.info('Session override cleared', { sessionId });
        }
    }

    /**
     * Clear all session overrides (private helper for resetToBaseline)
     */
    private clearAllSessionOverrides(): void {
        const sessionIds = Array.from(this.sessionOverrides.keys());
        this.sessionOverrides.clear();

        sessionIds.forEach((sessionId) => {
            this.agentEventBus.emit('saiki:sessionOverrideCleared', { sessionId });
        });

        if (sessionIds.length > 0) {
            logger.info('All session overrides cleared', { clearedSessions: sessionIds });
        }
    }

    // ============= CONFIG EXPORT =============

    /**
     * Export current runtime state as config.
     * This allows users to save their runtime modifications as a new agent config.
     */
    public exportAsConfig(): ValidatedAgentConfig {
        const exportedConfig: ValidatedAgentConfig = {
            ...this.baselineConfig,
            llm: structuredClone(this.runtimeConfig.llm),
            systemPrompt: this.runtimeConfig.systemPrompt,
            mcpServers: structuredClone(this.runtimeConfig.mcpServers),
        };

        this.agentEventBus.emit('saiki:stateExported', { config: exportedConfig });

        logger.info('Runtime state exported as config', {
            exportedConfig,
        });

        return exportedConfig;
    }

    /**
     * Reset runtime state back to baseline configuration
     */
    public resetToBaseline(): void {
        this.runtimeConfig = structuredClone(this.baselineConfig);

        this.clearAllSessionOverrides();
        this.agentEventBus.emit('saiki:stateReset', { toConfig: this.baselineConfig });

        logger.info('Runtime state reset to baseline config');
    }

    // ============= CONVENIENCE GETTERS FOR USED FUNCTIONALITY =============

    /**
     * Get the current effective LLM configuration for a session.
     * **Use this for session-specific LLM config** (includes session overrides).
     */
    public getLLMConfig(sessionId?: string): Readonly<ValidatedLLMConfig> {
        return this.getRuntimeConfig(sessionId).llm;
    }
}
