import { BaseCompiler, joinUrl } from './base-compiler';
import type { LlmConfig } from '$lib/server/llm/config';

export class HttpLLMCompiler extends BaseCompiler {
	private config: LlmConfig;

	constructor(config: LlmConfig) {
		super();
		this.config = config;
	}

	protected async generateText(options: {
		prompt: string;
		temperature?: number;
		maxOutputTokens?: number;
	}): Promise<string> {
		if (this.config.provider === 'claude') {
			return this.generateTextWithClaude(options);
		}
		return this.generateTextWithOpenAICompat(options);
	}

	private async generateTextWithOpenAICompat(options: {
		prompt: string;
		temperature?: number;
		maxOutputTokens?: number;
	}): Promise<string> {
		const defaultBaseUrl = this.config.provider === 'openai' ? 'https://api.openai.com/v1' : '';
		const baseUrl = (this.config.baseUrl || defaultBaseUrl).trim();
		if (!baseUrl) {
			throw new Error('Base URL is required for custom OpenAI-compatible providers.');
		}

		const response = await fetch(joinUrl(baseUrl, 'chat/completions'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${this.config.apiKey}`,
			},
			body: JSON.stringify({
				model: this.config.model,
				messages: [{ role: 'user', content: options.prompt }],
				temperature: options.temperature,
				max_tokens: options.maxOutputTokens,
			}),
		});

		if (!response.ok) {
			const details = await response.text();
			throw new Error(`LLM request failed (${response.status}): ${details.slice(0, 300)}`);
		}

		const payload = (await response.json()) as {
			choices?: Array<{ message?: { content?: string | Array<{ type?: string; text?: string }> } }>;
		};
		const content = payload.choices?.[0]?.message?.content;
		if (typeof content === 'string') return content;
		if (Array.isArray(content)) {
			return content
				.filter((part) => part?.type === 'text' && typeof part.text === 'string')
				.map((part) => part.text)
				.join('\n');
		}
		return '';
	}

	private async generateTextWithClaude(options: {
		prompt: string;
		temperature?: number;
		maxOutputTokens?: number;
	}): Promise<string> {
		const baseUrl = (this.config.baseUrl || 'https://api.anthropic.com').trim();

		const response = await fetch(joinUrl(baseUrl, 'v1/messages'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': this.config.apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: this.config.model,
				temperature: options.temperature,
				max_tokens: options.maxOutputTokens ?? 2048,
				messages: [{ role: 'user', content: options.prompt }],
			}),
		});

		if (!response.ok) {
			const details = await response.text();
			throw new Error(`Claude request failed (${response.status}): ${details.slice(0, 300)}`);
		}

		const payload = (await response.json()) as {
			content?: Array<{ type?: string; text?: string }>;
		};
		return (payload.content || [])
			.filter((part) => part?.type === 'text' && typeof part.text === 'string')
			.map((part) => part.text)
			.join('\n');
	}
}
