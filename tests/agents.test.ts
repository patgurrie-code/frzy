import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const body = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8').split('\n').slice(1).join('\n');

describe('agent guides', () => {
  it('CLAUDE.md and AGENTS.md stay in sync (everything after the title line)', () => {
    expect(body('AGENTS.md')).toBe(body('CLAUDE.md'));
  });
});
