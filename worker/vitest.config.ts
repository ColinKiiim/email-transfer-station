import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
    plugins: [{
        name: 'sql-text',
        load(id) { if (id.endsWith('.sql')) return `export default ${JSON.stringify(readFileSync(id, 'utf8'))}`; },
    }],
});
