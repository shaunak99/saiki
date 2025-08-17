import { generateText, LanguageModelV1, streamText, type CoreMessage, APICallError } from 'ai';
import { ToolManager } from '../../tools/tool-manager.js';
import { ILLMService, LLMServiceConfig } from './types.js';
import { logger } from '../../logger/index.js';
import { ToolSet } from '../../tools/types.js';
import { ToolSet as VercelToolSet, jsonSchema } from 'ai';
import { ContextManager } from '../../context/manager.js';
import { getMaxInputTokensForModel, getEffectiveMaxInputTokens } from '../registry.js';
import { ImageData, FileData } from '../../context/types.js';
import { DextoRuntimeError } from '../../errors/DextoRuntimeError.js';
import { LLMErrorCode } from '../error-codes.js';
import { ErrorScope, ErrorType } from '../../errors/types.js';
import type { SessionEventBus } from '../../events/index.js';
import { ToolErrorCode } from '../../tools/error-codes.js';
import type { IConversationHistoryProvider } from '../../session/history/types.js';
import type { PromptManager } from '../../systemPrompt/manager.js';
import { VercelMessageFormatter } from '../formatters/vercel.js';
import { createTokenizer } from '../tokenizer/factory.js';
import type { ValidatedLLMConfig } from '../schemas.js';

/**
 * Vercel AI SDK implementation of LLMService
 * TODO: improve token counting logic across all LLM services - approximation isn't matching vercel actual token count properly
 */
export class VercelLLMService implements ILLMService {
    private model: LanguageModelV1;
    private config: ValidatedLLMConfig;
    private toolManager: ToolManager;
    private contextManager: ContextManager<CoreMessage>;
    private sessionEventBus: SessionEventBus;
    private readonly sessionId: string;
    private toolSupportCache: Map<string, boolean> = new Map();

    constructor(
        toolManager: ToolManager,
        model: LanguageModelV1,
        promptManager: PromptManager,
        historyProvider: IConversationHistoryProvider,
        sessionEventBus: SessionEventBus,
        config: ValidatedLLMConfig,
        sessionId: string
    ) {
        this.model = model;
        this.config = config;
        this.toolManager = toolManager;
        this.sessionEventBus = sessionEventBus;
        this.sessionId = sessionId;

        // Create properly-typed ContextManager for Vercel
        const formatter = new VercelMessageFormatter();
        const tokenizer = createTokenizer(config.provider, model.modelId);
        const maxInputTokens = getEffectiveMaxInputTokens(config);

        this.contextManager = new ContextManager<CoreMessage>(
            formatter,
            promptManager,
            sessionEventBus,
            maxInputTokens,
            tokenizer,
            historyProvider,
            sessionId
        );

        logger.debug(
            `[VercelLLMService] Initialized for model: ${this.model.modelId}, provider: ${this.config.provider}, temperature: ${this.config.temperature}, maxOutputTokens: ${this.config.maxOutputTokens}`
        );
    }

    getAllTools(): Promise<ToolSet> {
        return this.toolManager.getAllTools();
    }

    formatTools(tools: ToolSet): VercelToolSet {
        logger.debug(`Formatting tools for vercel`);
        return Object.keys(tools).reduce<VercelToolSet>((acc, toolName) => {
            const tool = tools[toolName];
            if (tool) {
                acc[toolName] = {
                    parameters: jsonSchema(tool.parameters),
                    execute: async (args: unknown) => {
                        try {
                            return await this.toolManager.executeTool(
                                toolName,
                                args as Record<string, unknown>,
                                this.sessionId
                            );
                        } catch (err: unknown) {
                            if (
                                err instanceof DextoRuntimeError &&
                                err.code === ToolErrorCode.EXECUTION_DENIED
                            ) {
                                return { error: err.message, denied: true };
                            }
                            if (
                                err instanceof DextoRuntimeError &&
                                err.code === ToolErrorCode.CONFIRMATION_TIMEOUT
                            ) {
                                return { error: err.message, denied: true, timeout: true };
                            }
                            // Other failures
                            const message = err instanceof Error ? err.message : String(err);
                            return { error: message };
                        }
                    },
                    ...(tool.description && { description: tool.description }),
                };
            }
            return acc;
        }, {});
    }

    private async validateToolSupport(): Promise<boolean> {
        const modelKey = `${this.config.provider}:${this.model.modelId}`;

        // Check cache first
        if (this.toolSupportCache.has(modelKey)) {
            return this.toolSupportCache.get(modelKey)!;
        }

        // Only test tool support for providers using custom baseURL endpoints
        // Built-in providers without baseURL have known tool support
        if (!this.config.baseURL) {
            logger.debug(`Skipping tool validation for ${modelKey} - no custom baseURL`);
            // Assume built-in providers support tools
            this.toolSupportCache.set(modelKey, true);
            return true;
        }

        logger.debug(`Testing tool support for custom endpoint model: ${modelKey}`);

        // Create a minimal test tool
        const testTool = {
            test_tool: {
                parameters: jsonSchema({
                    type: 'object',
                    properties: {},
                    additionalProperties: false,
                }),
                execute: async () => ({ result: 'test' }),
            },
        };

        try {
            // Make a minimal generateText call with tools to test support
            await generateText({
                model: this.model,
                messages: [{ role: 'user', content: 'Hello' }],
                tools: testTool,
                maxSteps: 1,
            });

            // If we get here, tools are supported
            this.toolSupportCache.set(modelKey, true);
            logger.debug(`Model ${modelKey} supports tools`);
            return true;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('does not support tools')) {
                this.toolSupportCache.set(modelKey, false);
                logger.debug(`Model ${modelKey} does not support tools`);
                return false;
            }
            // Other errors - assume tools are supported and let the actual call handle it
            logger.debug(
                `Tool validation error for ${modelKey}, assuming supported: ${errorMessage}`
            );
            this.toolSupportCache.set(modelKey, true);
            return true;
        }
    }

    async completeTask(
        textInput: string,
        imageData?: ImageData,
        fileData?: FileData,
        stream?: boolean
    ): Promise<string> {
        // Add user message, with optional image and file data
        logger.debug(
            `VercelLLMService: Adding user message: ${textInput}, imageData: ${imageData}, fileData: ${fileData}`
        );
        await this.contextManager.addUserMessage(textInput, imageData, fileData);

        // Get all tools
        const tools = await this.toolManager.getAllTools();
        logger.silly(
            `[VercelLLMService] Tools before formatting: ${JSON.stringify(tools, null, 2)}`
        );

        const formattedTools = this.formatTools(tools);

        logger.silly(
            `[VercelLLMService] Formatted tools: ${JSON.stringify(formattedTools, null, 2)}`
        );

        let fullResponse = '';

        this.sessionEventBus.emit('llmservice:thinking');
        const prepared = await this.contextManager.getFormattedMessagesWithCompression(
            { mcpManager: this.toolManager.getMcpManager() },
            { provider: this.config.provider, model: this.model.modelId }
        );
        const formattedMessages: unknown[] = prepared.formattedMessages;
        const _systemPrompt: string | undefined = prepared.systemPrompt;
        const tokensUsed: number = prepared.tokensUsed;

        logger.silly(
            `Messages (potentially compressed): ${JSON.stringify(formattedMessages, null, 2)}`
        );
        logger.silly(`Tools: ${JSON.stringify(formattedTools, null, 2)}`);
        logger.debug(`Estimated tokens being sent to Vercel provider: ${tokensUsed}`);

        // Both methods now return strings and handle message processing internally
        if (stream) {
            fullResponse = await this.streamText(
                formattedMessages,
                formattedTools,
                this.config.maxIterations
            );
        } else {
            fullResponse = await this.generateText(
                formattedMessages,
                formattedTools,
                this.config.maxIterations
            );
        }

        return (
            fullResponse ||
            `Reached maximum number of steps (${this.config.maxIterations}) without a final response.`
        );
    }

    async generateText(
        messages: unknown[],
        tools: VercelToolSet,
        maxSteps: number = 50
    ): Promise<string> {
        let stepIteration = 0;
        let totalTokens = 0;

        const estimatedTokens = Math.ceil(JSON.stringify(messages, null, 2).length / 4);
        logger.debug(
            `vercel generateText:Generating text with messages (${estimatedTokens} estimated tokens)`
        );

        const temperature = this.config.temperature;
        const maxTokens = this.config.maxOutputTokens;

        // Check if model supports tools and adjust accordingly
        const supportsTools = await this.validateToolSupport();
        const effectiveTools = supportsTools ? tools : {};

        if (!supportsTools && Object.keys(tools).length > 0) {
            logger.debug(
                `Model ${this.model.modelId} does not support tools, using empty tools object for generation`
            );
        }

        try {
            const response = await generateText({
                model: this.model,
                messages: messages as any,
                tools: effectiveTools,
                onStepFinish: (step) => {
                    logger.debug(`Step iteration: ${stepIteration}`);
                    stepIteration++;
                    logger.debug(`Step finished, step type: ${step.stepType}`);
                    logger.debug(`Step finished, step text: ${step.text}`);
                    logger.debug(
                        `Step finished, step tool calls: ${JSON.stringify(step.toolCalls, null, 2)}`
                    );
                    logger.debug(
                        `Step finished, step tool results: ${JSON.stringify(step.toolResults, null, 2)}`
                    );

                    if (step.usage?.totalTokens !== undefined) {
                        totalTokens += step.usage.totalTokens;
                    }

                    if (step.text) {
                        this.sessionEventBus.emit('llmservice:response', {
                            content: step.text,
                            model: this.model.modelId,
                            tokenCount: totalTokens > 0 ? totalTokens : undefined,
                        });
                    }
                    if (step.toolCalls && step.toolCalls.length > 0) {
                        for (const toolCall of step.toolCalls) {
                            this.sessionEventBus.emit('llmservice:toolCall', {
                                toolName: toolCall.toolName,
                                args: toolCall.args,
                                callId: toolCall.toolCallId,
                            });
                        }
                    }
                    if (step.toolResults && step.toolResults.length > 0) {
                        for (const toolResult of step.toolResults as any) {
                            this.sessionEventBus.emit('llmservice:toolResult', {
                                toolName: toolResult.toolName,
                                result: toolResult.result,
                                callId: toolResult.toolCallId,
                                success: true,
                            });
                        }
                    }
                },
                maxSteps,
                ...(maxTokens && { maxTokens }),
                ...(temperature !== undefined && { temperature }),
            });

            // Response received successfully
            // Parse and append each new InternalMessage from the formatter using ContextManager
            await this.contextManager.processLLMResponse(response);

            // Update ContextManager with actual token count for hybrid approach
            if (totalTokens > 0) {
                this.contextManager.updateActualTokenCount(totalTokens);
            }

            // Return the plain text of the response
            return response.text;
        } catch (err: any) {
            this.mapProviderError(err, 'generate');
        }
    }

    private mapProviderError(err: any, phase: 'generate' | 'stream'): never {
        // APICallError from Vercel AI SDK
        if (APICallError.isInstance?.(err)) {
            const status = err.statusCode;
            const headers = (err.responseHeaders || {}) as Record<string, string>;
            const retryAfter = headers['retry-after'] ? Number(headers['retry-after']) : undefined;
            const body =
                typeof err.responseBody === 'string'
                    ? err.responseBody
                    : JSON.stringify(err.responseBody ?? '');

            if (status === 429) {
                throw new DextoRuntimeError(
                    LLMErrorCode.RATE_LIMIT_EXCEEDED,
                    ErrorScope.LLM,
                    ErrorType.RATE_LIMIT,
                    'Rate limit exceeded',
                    {
                        sessionId: this.sessionId,
                        provider: this.config.provider,
                        model: this.model.modelId,
                        status,
                        retryAfter,
                        body,
                        phase,
                    }
                );
            }
            if (status === 408) {
                throw new DextoRuntimeError(
                    LLMErrorCode.GENERATION_FAILED,
                    ErrorScope.LLM,
                    ErrorType.TIMEOUT,
                    'Provider timed out',
                    {
                        sessionId: this.sessionId,
                        provider: this.config.provider,
                        model: this.model.modelId,
                        status,
                        body,
                        phase,
                    }
                );
            }
            throw new DextoRuntimeError(
                LLMErrorCode.GENERATION_FAILED,
                ErrorScope.LLM,
                ErrorType.THIRD_PARTY,
                `Provider error ${status}`,
                {
                    sessionId: this.sessionId,
                    provider: this.config.provider,
                    model: this.model.modelId,
                    status,
                    body,
                    phase,
                }
            );
        }
        // rethrow any other errors (including DextoRuntimeError and DextoValidationError)
        throw err;
    }

    // Updated streamText to behave like generateText - returns string and handles message processing internally
    async streamText(
        messages: unknown[],
        tools: VercelToolSet,
        maxSteps: number = 10
    ): Promise<string> {
        let stepIteration = 0;
        let totalTokens = 0;

        const temperature = this.config.temperature;
        const maxTokens = this.config.maxOutputTokens;

        // Check if model supports tools and adjust accordingly
        const supportsTools = await this.validateToolSupport();
        const effectiveTools = supportsTools ? tools : {};

        if (!supportsTools && Object.keys(tools).length > 0) {
            logger.debug(
                `Model ${this.model.modelId} does not support tools, using empty tools object for streaming`
            );
        }

        // use vercel's streamText
        let streamErr: unknown | undefined;
        const response = streamText({
            model: this.model,
            messages: messages as any, // Type assertion for complex message structure compatibility
            tools: effectiveTools,
            onChunk: (chunk) => {
                logger.debug(`Chunk type: ${chunk.chunk.type}`);
                if (chunk.chunk.type === 'text-delta') {
                    this.sessionEventBus.emit('llmservice:chunk', {
                        content: chunk.chunk.textDelta,
                        isComplete: false,
                    });
                }
            },
            onError: (error) => {
                logger.error(`Error in streamText: ${JSON.stringify(error, null, 2)}`);
                this.sessionEventBus.emit('llmservice:error', {
                    error: error instanceof Error ? error : new Error(String(error)),
                    context: 'streamText',
                    recoverable: false,
                });
                streamErr = error;
            },
            onStepFinish: (step) => {
                logger.debug(`Step iteration: ${stepIteration}`);
                stepIteration++;
                logger.debug(`Step finished, step type: ${step.stepType}`);
                logger.debug(`Step finished, step text: ${step.text}`);
                logger.debug(
                    `Step finished, step tool calls: ${JSON.stringify(step.toolCalls, null, 2)}`
                );
                logger.debug(
                    `Step finished, step tool results: ${JSON.stringify(step.toolResults, null, 2)}`
                );

                // Track token usage from each step as fallback for providers that don't report final usage
                if (step.usage?.totalTokens !== undefined) {
                    totalTokens += step.usage.totalTokens;
                    logger.debug(
                        `Step ${stepIteration} tokens: ${step.usage.totalTokens}, running total: ${totalTokens}`
                    );
                }

                // Emit response event for step text (without token count until final)
                if (step.text) {
                    this.sessionEventBus.emit('llmservice:response', {
                        content: step.text,
                        model: this.model.modelId,
                        tokenCount: totalTokens > 0 ? totalTokens : undefined,
                    });
                }

                // Process tool calls (same as generateText)
                if (step.toolCalls && step.toolCalls.length > 0) {
                    for (const toolCall of step.toolCalls) {
                        this.sessionEventBus.emit('llmservice:toolCall', {
                            toolName: toolCall.toolName,
                            args: toolCall.args,
                            callId: toolCall.toolCallId,
                        });
                    }
                }

                // Process tool results (same condition as generateText)
                if (step.toolResults && step.toolResults.length > 0) {
                    for (const toolResult of step.toolResults as any) {
                        this.sessionEventBus.emit('llmservice:toolResult', {
                            toolName: toolResult.toolName,
                            result: toolResult.result,
                            callId: toolResult.toolCallId,
                            success: true,
                        });
                    }
                }
            },
            onFinish: (result) => {
                logger.debug(`Stream finished, result finishReason: ${result.finishReason}`);
                logger.debug(`Stream finished, result text: ${result.text}`);
                logger.debug(
                    `Stream finished, result tool calls: ${JSON.stringify(result.toolCalls, null, 2)}`
                );
                logger.debug(
                    `Stream finished, result tool results: ${JSON.stringify(
                        result.toolResults,
                        null,
                        2
                    )}`
                );

                // Use final result usage if available (authoritative), otherwise keep accumulated count
                // Some providers may not report final usage, so we maintain both approaches:
                // 1. Accumulate step tokens as fallback (done in onStepFinish above)
                // 2. Use final result tokens if provided (more accurate for providers that support it)
                if (result.usage && result.usage.totalTokens !== undefined) {
                    const accumulatedTokens = totalTokens;
                    totalTokens = result.usage.totalTokens;
                    logger.debug(
                        `Token count - Accumulated: ${accumulatedTokens}, Final result: ${totalTokens}`
                    );
                } else {
                    logger.debug(
                        `Using accumulated token count: ${totalTokens} (no final usage provided)`
                    );
                }
            },
            maxSteps: maxSteps,
            ...(maxTokens && { maxTokens }),
            ...(temperature !== undefined && { temperature }),
        });
        // Consume the stream to get the final text
        let fullResponse = '';
        for await (const textPart of response.textStream) {
            fullResponse += textPart;
        }

        // If streaming reported an error, map and throw now
        if (streamErr) {
            this.mapProviderError(streamErr, 'stream');
        }

        // Process the LLM response through ContextManager using the new stream method
        await this.contextManager.processLLMStreamResponse(response);

        // Update ContextManager with actual token count for hybrid approach
        if (totalTokens > 0) {
            logger.debug(`Stream finished, updating actual token count: ${totalTokens}`);
            this.contextManager.updateActualTokenCount(totalTokens);
        }

        // Emit final response event with token count
        this.sessionEventBus.emit('llmservice:response', {
            content: fullResponse,
            model: this.model.modelId,
            tokenCount: totalTokens > 0 ? totalTokens : undefined,
        });

        logger.silly(`streamText response object: ${JSON.stringify(response, null, 2)}`);

        // Return the final text string (same as generateText)
        return fullResponse;
    }

    /**
     * Get configuration information about the LLM service
     * @returns Configuration object with provider and model information
     */
    getConfig(): LLMServiceConfig {
        const configuredMaxTokens = this.contextManager.getMaxInputTokens();
        let modelMaxInputTokens: number;

        // Fetching max tokens from LLM registry - default to configured max tokens if not found
        // Max tokens may not be found if the model is supplied by user
        try {
            modelMaxInputTokens = getMaxInputTokensForModel(
                this.config.provider, // Use our internal provider name
                this.model.modelId
            );
        } catch (error) {
            // if the model is not found in the LLM registry, log and default to configured max tokens
            if (error instanceof DextoRuntimeError && error.code === LLMErrorCode.MODEL_UNKNOWN) {
                modelMaxInputTokens = configuredMaxTokens;
                logger.debug(
                    `Could not find model ${this.model.modelId} in LLM registry to get max tokens. Using configured max tokens: ${configuredMaxTokens}.`
                );
                // for any other error, throw
            } else {
                throw error;
            }
        }
        return {
            router: 'vercel',
            provider: this.config.provider, // Use our internal provider name
            model: this.model,
            configuredMaxInputTokens: configuredMaxTokens,
            modelMaxInputTokens: modelMaxInputTokens,
        };
    }

    /**
     * Get the context manager for external access
     */
    getContextManager(): ContextManager<unknown> {
        return this.contextManager;
    }
}
