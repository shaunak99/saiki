/*
 * Service Initializer: Centralized Wiring for Saiki Core Services
 *
 * This module is responsible for initializing and wiring together all core agent services (LLM, client manager, message manager, event bus, etc.)
 * for the Saiki application. It provides a single entry point for constructing the service graph, ensuring consistent dependency injection
 * and configuration across CLI, web, and test environments.
 *
 * **Configuration Pattern:**
 * - The primary source of configuration is the config file (e.g., `saiki.yml`), which allows users to declaratively specify both high-level
 *   and low-level service options (such as compression strategies for MessageManager, LLM provider/model, etc.).
 * - For most use cases, the config file is sufficient and preferred, as it enables environment-specific, auditable, and user-friendly customization.
 *
 * **Override Pattern:**
 * - For advanced, programmatic, or test scenarios, this initializer supports code-level overrides via the `InitializeServicesOptions` type.
 * - These overrides are intended for swapping out top-level services (e.g., injecting a mock MessageManager or LLMService in tests), not for
 *   overriding every internal dependency. This keeps the override API surface small, maintainable, and focused on real-world needs.
 * - If deeper customization is required (e.g., a custom compression strategy for MessageManager in a test), construct the desired service
 *   yourself and inject it via the appropriate top-level override (e.g., `messageManager`).
 *
 * **Best Practice:**
 * - Use the config file for all user-facing and environment-specific configuration, including low-level service details.
 * - Use code-level overrides only for top-level services and only when necessary (e.g., for testing, mocking, or advanced integration).
 * - Do not expose every internal dependency as an override unless there is a strong, recurring need.
 *
 * This pattern ensures a clean, scalable, and maintainable architecture, balancing flexibility with simplicity.
 */

import { MCPClientManager } from '../client/manager.js';
import { ILLMService } from '../ai/llm/services/types.js';
import { AgentConfig } from '../config/types.js';
import { createLLMService } from '../ai/llm/services/factory.js';
import { logger } from './logger.js';
import { EventEmitter } from 'events';
import { LLMRouter } from '../ai/llm/types.js';
import { MessageManager } from '../ai/llm/messages/manager.js';
import { createMessageManager } from '../ai/llm/messages/factory.js';
import { createToolConfirmationProvider } from '../client/tool-confirmation/factory.js';
import { loadContributors } from '../ai/systemPrompt/loader.js';
import { loadConfigFile } from '../config/loader.js';
import { ConfigManager } from '../config/manager.js';
import type { CLIConfigOverrides } from '../config/types.js';

/**
 * Type for the core agent services returned by initializeServices
 */
export type AgentServices = {
    clientManager: MCPClientManager;
    llmService: ILLMService;
    agentEventBus: EventEmitter;
    messageManager: MessageManager;
    configManager: ConfigManager;
};

/**
 * Options for overriding or injecting services/config at runtime.
 *
 * **Design Rationale:**
 * - The config file (e.g., `saiki.yml`) is the main source of truth for configuring both high-level and low-level service options.
 *   This allows users and operators to declaratively tune the system without code changes.
 * - The `InitializeServicesOptions` type is intended for advanced/test scenarios where you need to override top-level services
 *   (such as injecting a mock MessageManager or LLMService). This keeps the override API surface small and focused.
 * - For most use cases, do not expose every internal dependency here. If you need to customize internals (e.g., a custom compression strategy),
 *   construct the service yourself and inject it as a top-level override.
 *
 * **Summary:**
 * - Use config for normal operation and low-level tuning.
 * - Use top-level service overrides for code/test/advanced scenarios.
 * - This pattern is robust, scalable, and easy to maintain.
 */
export type InitializeServicesOptions = {
    runMode?: 'cli' | 'web'; // Context/mode override
    connectionMode?: 'strict' | 'lenient'; // Connection mode override
    clientManager?: MCPClientManager; // Inject a custom or mock MCPClientManager
    llmService?: ILLMService; // Inject a custom or mock LLMService
    agentEventBus?: EventEmitter; // Inject a custom or mock EventEmitter
    messageManager?: MessageManager; // Inject a custom or mock MessageManager
    // Add more overrides as needed
    // configOverride?: Partial<AgentConfig>; // (optional) for field-level config overrides
};

// High-level factory to load, validate, and wire up all agent services in one call
/**
 * Loads and validates configuration and initializes all agent services as a single unit.
 * @param configPath Path to the agent config file
 * @param cliArgs Overrides from the CLI
 * @param overrides Optional service overrides for testing or advanced scenarios
 * @returns All the initialized services and the config manager
 */
export async function createAgentServices(
    configPath: string,
    cliArgs: CLIConfigOverrides,
    overrides?: InitializeServicesOptions
): Promise<AgentServices> {
    // 1. Load raw configuration from file
    const rawConfig = await loadConfigFile(configPath);

    // 2. Initialize config manager, apply CLI config level overrides and validate
    const configManager = new ConfigManager(rawConfig).overrideCLI(cliArgs);
    configManager.validate();
    const config = configManager.getConfig();

    // 3. Initialize shared event bus
    const agentEventBus = overrides?.agentEventBus ?? new EventEmitter();
    logger.debug('Agent event bus initialized');

    // 4. Initialize client manager
    const connectionMode = overrides?.connectionMode ?? 'lenient';
    const runMode = overrides?.runMode ?? 'cli';
    const confirmationProvider = createToolConfirmationProvider(runMode);
    const clientManager = overrides?.clientManager ?? new MCPClientManager(confirmationProvider);
    await clientManager.initializeFromConfig(config.mcpServers, connectionMode);
    logger.debug(
        overrides?.clientManager
            ? 'Client manager and MCP servers initialized via override'
            : 'Client manager and MCP servers initialized'
    );

    // 5. Initialize message manager
    const router: LLMRouter = config.llm.router ?? 'vercel';
    const contributors = loadContributors(config.llm.systemPrompt);
    const messageManager =
        overrides?.messageManager ?? createMessageManager(config.llm, router, contributors);

    // 6. Initialize LLM service
    const llmService =
        overrides?.llmService ??
        createLLMService(config.llm, router, clientManager, agentEventBus, messageManager);
    logger.debug(
        overrides?.llmService
            ? 'LLM service provided via override'
            : `LLM service initialized using router: ${router}`
    );

    // 7. Return the full service graph, including the ConfigManager
    return { clientManager, llmService, agentEventBus, messageManager, configManager };
}
