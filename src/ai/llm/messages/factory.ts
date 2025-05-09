import { MessageManager } from './manager.js';
import { createMessageFormatter } from './formatters/factory.js';
import { createTokenizer } from '../tokenizer/factory.js';
import { LLMConfig } from '../../../config/types.js';
import { LLMRouter } from '../types.js';
import { PromptManager } from '../../systemPrompt/manager.js';
import { logger } from '../../../utils/logger.js';
import { getMaxTokensForModel } from '../registry.js';

/**
 * Factory function to create a MessageManager instance with the correct formatter, tokenizer, and maxTokens
 * based on the LLM config and router
 *
 * @param config LLMConfig object containing provider, model, systemPrompt, etc.
 * @param router LLMRouter flag
 * @param promptManager PromptManager instance
 * @returns MessageManager instance
 * TODO: Make compression strategy also configurable
 */
export function createMessageManager(
    config: LLMConfig,
    router: LLMRouter = 'vercel',
    promptManager: PromptManager
): MessageManager {
    const provider = config.provider.toLowerCase();
    const model = config.model.toLowerCase();

    const registryMaxTokens = getMaxTokensForModel(provider, model);
    const maxTokens = Math.floor(registryMaxTokens! * 0.9);

    const tokenizer = createTokenizer(provider, model);
    logger.debug(`Tokenizer created for ${provider}/${model}`);

    const formatter = createMessageFormatter(provider, router);
    logger.debug(`Message formatter created for ${provider}/${model}`);

    logger.debug(
        `Creating MessageManager for ${provider}/${model} using ${router} router with maxTokens: ${maxTokens}`
    );
    return new MessageManager(formatter, promptManager, maxTokens, tokenizer);
}
