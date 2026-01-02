import path from 'node:path';
import { run } from 'vitest';

const projectRoot = path.resolve(new URL(import.meta.url).pathname, '..');
process.chdir(projectRoot);

// Run vitest programmatically targeting src tests
const res = await run({ run: true, include: ['src/**/*.test.ts'] });
if (res === 0) process.exit(0);
process.exit(1);
