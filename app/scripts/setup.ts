#!/usr/bin/env npx tsx
/**
 * CiteSeer Auto-Setup Script
 *
 * This script:
 * 1. Creates .env file if missing
 * 2. Starts PostgreSQL via Docker (if available)
 * 3. Waits for database to be ready
 * 4. Runs database migrations
 */

import { execSync, spawn } from 'child_process';
import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(import.meta.dirname, '..');
const ENV_FILE = join(ROOT, '.env');
const ENV_EXAMPLE = join(ROOT, '.env.example');

const DEFAULT_DATABASE_URL = 'postgresql://citeseer:citeseer@localhost:5432/citeseer';

function log(msg: string) {
	console.log(`\x1b[32m✓\x1b[0m ${msg}`);
}

function info(msg: string) {
	console.log(`\x1b[34mℹ\x1b[0m ${msg}`);
}

function error(msg: string) {
	console.error(`\x1b[31m✗\x1b[0m ${msg}`);
}

function run(cmd: string, silent = false): string {
	try {
		return execSync(cmd, {
			cwd: ROOT,
			encoding: 'utf-8',
			stdio: silent ? 'pipe' : 'inherit'
		});
	} catch (e) {
		return '';
	}
}

function checkCommand(cmd: string): boolean {
	try {
		execSync(`which ${cmd}`, { stdio: 'pipe' });
		return true;
	} catch {
		return false;
	}
}

async function waitForPostgres(maxAttempts = 30): Promise<boolean> {
	info('Waiting for PostgreSQL to be ready...');

	for (let i = 0; i < maxAttempts; i++) {
		try {
			execSync(`docker exec citeseer-db pg_isready -U citeseer`, { stdio: 'pipe' });
			return true;
		} catch {
			await new Promise((r) => setTimeout(r, 1000));
		}
	}
	return false;
}

async function main() {
	console.log('\n🚀 \x1b[1mCiteSeer Setup\x1b[0m\n');

	// Step 1: Create .env if missing
	if (!existsSync(ENV_FILE)) {
		info('Creating .env file...');

		let envContent = `# Database
DATABASE_URL=${DEFAULT_DATABASE_URL}

# Environment
NODE_ENV=development
`;
		writeFileSync(ENV_FILE, envContent);
		log('.env file created');
	} else {
		log('.env file exists');
	}

	// Load DATABASE_URL
	const envContent = readFileSync(ENV_FILE, 'utf-8');
	const dbUrlMatch = envContent.match(/DATABASE_URL=(.+)/);
	const databaseUrl = dbUrlMatch?.[1] || DEFAULT_DATABASE_URL;

	// Step 2: Check if Docker is available and start PostgreSQL
	const hasDocker = checkCommand('docker');

	if (hasDocker) {
		info('Docker detected, checking PostgreSQL container...');

		// Check if container is running
		const containerRunning = run(
			'docker ps --filter name=citeseer-db --format "{{.Names}}"',
			true
		).trim();

		if (containerRunning === 'citeseer-db') {
			log('PostgreSQL container already running');
		} else {
			// Check if container exists but stopped
			const containerExists = run(
				'docker ps -a --filter name=citeseer-db --format "{{.Names}}"',
				true
			).trim();

			if (containerExists === 'citeseer-db') {
				info('Starting existing PostgreSQL container...');
				run('docker start citeseer-db');
			} else {
				info('Starting PostgreSQL with Docker Compose...');
				run('docker compose up -d');
			}

			// Wait for PostgreSQL to be ready
			const ready = await waitForPostgres();
			if (ready) {
				log('PostgreSQL is ready');
			} else {
				error('PostgreSQL failed to start');
				process.exit(1);
			}
		}
	} else {
		info('Docker not found - assuming PostgreSQL is running externally');
		info(`Using DATABASE_URL: ${databaseUrl.replace(/:[^:@]+@/, ':****@')}`);
	}

	// Step 3: Run database migrations
	info('Running database migrations...');
	try {
		run('pnpm drizzle-kit push --force');
		log('Database migrations complete');
	} catch (e) {
		error('Migration failed. Make sure PostgreSQL is running and DATABASE_URL is correct.');
		process.exit(1);
	}

	// Done!
	console.log('\n\x1b[32m✓ Setup complete!\x1b[0m\n');
	console.log('Run \x1b[1mpnpm dev\x1b[0m to start the development server.\n');
}

main().catch(console.error);
