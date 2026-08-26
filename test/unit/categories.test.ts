import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  CATEGORY_META,
  categoriesByParent,
  normalizeCategory,
} from '../../src/categories.js';
import { CATEGORY_VALUES } from '../../src/llm/schemas.js';

/**
 * The taxonomy exists in four places: this module, the client's copy in
 * `web/src/types.ts`, the LLM enum, and a CHECK constraint in
 * the latest taxonomy migration. The client cannot import from `src/`, so the duplication
 * is structural — which makes it worth asserting rather than hoping.
 *
 * Every drift here fails quietly in production: a category the model returns
 * but the schema rejects, or one the schema accepts and the database refuses at
 * write time, failing an invoice that parsed perfectly.
 */
describe('category taxonomy', () => {
  it('has no duplicate slugs', () => {
    expect(new Set(CATEGORIES).size).toBe(CATEGORIES.length);
  });

  it('gives every category a parent and an icon', () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_META[category].label.length).toBeGreaterThan(0);
      expect(CATEGORY_META[category].icon.length).toBeGreaterThan(0);
    }
  });

  it('exposes exactly the same values to the LLM', () => {
    expect([...CATEGORY_VALUES]).toEqual([...CATEGORIES]);
  });

  it('places every category in exactly one parent group', () => {
    const grouped = categoriesByParent().flatMap((g) => g.categories);
    expect([...grouped].sort()).toEqual([...CATEGORIES].sort());
  });

  it('keeps an escape hatch, since normalizeCategory falls back to it', () => {
    expect(CATEGORIES).toContain('other');
    expect(normalizeCategory('no-such-category')).toBe('other');
    expect(normalizeCategory(null)).toBe('other');
  });

  it('matches the client copy in web/src/types.ts', () => {
    // Parsed rather than imported: the web tree is a separate tsconfig with its
    // own module resolution, and importing across it here would make this suite
    // depend on the frontend build.
    const web = readFileSync(new URL('../../web/src/types.ts', import.meta.url), 'utf8');
    const block = web.slice(
      web.indexOf('export const CATEGORY_META'),
      web.indexOf('export type Category ='),
    );
    const clientSlugs = [...block.matchAll(/^\s{2}(\w+):\s*\{ label:/gm)].map((m) => m[1]);

    expect(clientSlugs).toEqual([...CATEGORIES]);
  });

  it('matches the values the database will accept', () => {
    /*
     * Resolved by scanning, not hardcoded to one filename.
     *
     * This used to name `0012_category_taxonomy_v3.sql` directly, which meant
     * the next migration to widen the taxonomy failed this test for the wrong
     * reason: the constraint and the code agreed, but the assertion was reading
     * a superseded file. The live constraint is whichever migration defines it
     * last, so that is what this finds.
     */
    const dir = new URL('../../migrations/', import.meta.url);
    const defining = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) =>
        readFileSync(new URL(f, dir), 'utf8').includes(
          'ADD CONSTRAINT invoice_line_items_category_check',
        ),
      );

    const latest = defining.at(-1);
    expect(latest, 'no migration defines invoice_line_items_category_check').toBeDefined();

    const sql = readFileSync(new URL(latest as string, dir), 'utf8');
    // The Up migration only. Every one of these files also restores a narrower
    // CHECK in its Down section, and matching that instead would assert the
    // taxonomy we are moving away from.
    const upOnly = sql.slice(0, sql.indexOf('-- Down Migration'));
    const check = upOnly.slice(upOnly.indexOf('ADD CONSTRAINT'));
    const allowed = [...check.matchAll(/'(\w+)'/g)].map((m) => m[1]);

    expect([...allowed].sort()).toEqual([...CATEGORIES].sort());
  });
});
