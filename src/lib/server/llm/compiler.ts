import { GeminiCompiler } from '$lib/server/compiler/gemini';
import { HttpLLMCompiler } from '$lib/server/compiler/http-llm';
import type { QueryCompiler } from '$lib/server/compiler/types';
import type { LlmConfig } from './config';

export function createQueryCompiler(config: LlmConfig): QueryCompiler {
	if (config.provider === 'gemini') {
		return new GeminiCompiler({
			apiKey: config.apiKey,
			model: config.model,
		});
	}

	return new HttpLLMCompiler(config);
}
