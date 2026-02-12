import type { KnipConfig } from 'knip';

export default {
	ignoreExportsUsedInFile: {
		interface: true,
		type: true,
	},
	includeEntryExports: true,
	treatConfigHintsAsErrors: true,
} satisfies KnipConfig;
