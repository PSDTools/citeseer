import type { settings } from '$lib/server/db/schema';

export type LlmProvider = 'gemini' | 'openai' | 'claude' | 'custom';

export interface LlmConfig {
	provider: LlmProvider;
	apiKey: string;
	model: string;
	baseUrl?: string;
}

type SettingsRow = typeof settings.$inferSelect;

export const DEFAULT_MODEL_BY_PROVIDER: Record<LlmProvider, string> = {
	gemini: 'gemini-2.0-flash',
	openai: 'gpt-4o-mini',
	claude: 'claude-3-5-sonnet-latest',
	custom: 'gpt-4o-mini',
};

export function resolveLlmConfig(orgSettings: SettingsRow | undefined | null): LlmConfig | null {
	if (!orgSettings) return null;

	const provider = normalizeProvider(orgSettings.llmProvider);
	const apiKey = (orgSettings.llmApiKey || orgSettings.geminiApiKey || '').trim();
	if (!apiKey) return null;

	const model =
		(
			orgSettings.llmModel ||
			orgSettings.geminiModel ||
			DEFAULT_MODEL_BY_PROVIDER[provider]
		).trim() || DEFAULT_MODEL_BY_PROVIDER[provider];
	const baseUrl = (orgSettings.llmBaseUrl || '').trim() || undefined;

	return { provider, apiKey, model, baseUrl };
}

export function hasLlmConfig(orgSettings: SettingsRow | undefined | null): boolean {
	return Boolean(resolveLlmConfig(orgSettings));
}

function normalizeProvider(provider: string | null | undefined): LlmProvider {
	if (provider === 'openai' || provider === 'claude' || provider === 'custom') {
		return provider;
	}
	return 'gemini';
}
