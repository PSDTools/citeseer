import type { LlmConfig } from './config';

export async function generateTextWithLlm(
	config: LlmConfig,
	options: { prompt: string; temperature?: number; maxOutputTokens?: number },
): Promise<string> {
	if (config.provider === 'gemini') {
		const { GoogleGenerativeAI } = await import('@google/generative-ai');
		const genAI = new GoogleGenerativeAI(config.apiKey);
		const model = genAI.getGenerativeModel({ model: config.model });
		const result = await model.generateContent(options.prompt);
		return result.response.text();
	}

	if (config.provider === 'claude') {
		const baseUrl = (config.baseUrl || 'https://api.anthropic.com').trim();
		const response = await fetch(joinUrl(baseUrl, 'v1/messages'), {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': config.apiKey,
				'anthropic-version': '2023-06-01',
			},
			body: JSON.stringify({
				model: config.model,
				temperature: options.temperature,
				max_tokens: options.maxOutputTokens ?? 1024,
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

	const defaultBaseUrl = config.provider === 'openai' ? 'https://api.openai.com/v1' : '';
	const baseUrl = (config.baseUrl || defaultBaseUrl).trim();
	if (!baseUrl) {
		throw new Error('Base URL is required for custom OpenAI-compatible providers.');
	}

	const response = await fetch(joinUrl(baseUrl, 'chat/completions'), {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${config.apiKey}`,
		},
		body: JSON.stringify({
			model: config.model,
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

function joinUrl(base: string, path: string): string {
	const normalizedBase = base.replace(/\/+$/, '');
	const normalizedPath = path.replace(/^\/+/, '');
	return `${normalizedBase}/${normalizedPath}`;
}
