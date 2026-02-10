import { isDemoActive } from './runtime';

export function redactEmailForDemo(email: string): string {
	if (!isDemoActive()) {
		return email;
	}

	return 'demo@redacted.local';
}
