import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(import.meta.dirname, '..', 'src');
const sources = readdirSync(SRC)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => [file, readFileSync(join(SRC, file), 'utf8')] as const);

/**
 * The port catalogue is a design document that happens to compile. These tests defend the two
 * properties that make it worth having at all.
 */
describe('the seam stays a seam', () => {
  it('never names a concrete vendor in a port signature', () => {
    // A `RedisClient` or `PrismaClient` in this package would make every product that consumes
    // the platform depend on that vendor transitively.
    const banned = /\b(Redis|Prisma|Mongo|Postgres|DynamoDB|Firebase[A-Z]|Sequelize)\w*\s*[<;,)]/;
    for (const [file, content] of sources) {
      const offending = content
        .split('\n')
        .filter((line) => !line.trimStart().startsWith('*') && !line.trimStart().startsWith('//'))
        .filter((line) => banned.test(line));
      expect(offending, `${file}: ${offending.join(' | ')}`).toEqual([]);
    }
  });

  it('imports nothing but @munaxa/types', () => {
    for (const [file, content] of sources) {
      const imports = [...content.matchAll(/from '([^']+)'/g)].map((match) => match[1] as string);
      for (const specifier of imports) {
        expect(
          specifier.startsWith('./') || specifier === '@munaxa/types',
          `${file} imports ${specifier}`,
        ).toBe(true);
      }
    }
  });

  it('declares no runtime implementation beyond the registry and the token table', () => {
    // Ports with default implementations become the implementation nobody can replace.
    // `concurrency.ts` is exempt below because it carries the errors adapters *signal with*, not
    // behaviour they inherit — an adapter cannot report a chain conflict without a shared type.
    // `observability.ts` is exempt for the same reason at one remove: `AuditSequence` is a union of
    // two representations, and comparing or advancing one correctly (`1 === 1n` is false) is
    // arithmetic on the type, not a policy an adapter could sensibly disagree with. Both
    // exemptions are pinned by the tests below.
    for (const [file, content] of sources) {
      if (file === 'registry.ts' || file === 'ports.ts' || file === 'index.ts') continue;
      if (file === 'concurrency.ts' || file === 'observability.ts') continue;
      expect(content, file).not.toMatch(/^export (class|function|const enum) /m);
    }
  });

  it('keeps concurrency.ts to error types and their guards', () => {
    // The exemption above is only safe while it stays this narrow: an Error subclass and a
    // predicate over `unknown` cannot become the default an adapter silently relies on.
    const source = sources.find(([file]) => file === 'concurrency.ts')?.[1] ?? '';
    expect(source).not.toBe('');

    for (const declaration of source.match(/^export (class|function|const enum) .*/gm) ?? []) {
      expect(declaration, declaration).toMatch(
        /^export (class \w+Error extends Error|function is\w+\(error: unknown\))/,
      );
    }
  });

  it('keeps observability.ts to sequence arithmetic', () => {
    // The exemption is only safe while nothing here decides anything. A function that took a
    // record, a port or an option bag would be behaviour; these take sequences and return
    // sequences, which is the whole of what is allowed.
    const source = sources.find(([file]) => file === 'observability.ts')?.[1] ?? '';
    expect(source).not.toBe('');

    for (const declaration of source.match(/^export (class|function|const enum) .*/gm) ?? []) {
      expect(declaration, declaration).toMatch(
        /^export function \w+\((\w+: AuditSequence, )?\w+: AuditSequence\): (boolean|AuditSequence)/,
      );
    }
  });
});

describe('records carry hashes, not secrets', () => {
  it('stores tokens and passwords only in hashed form', () => {
    const tokenSource = sources.find(([file]) => file === 'tokens.ts')?.[1] ?? '';
    const identitySource = sources.find(([file]) => file === 'identity.ts')?.[1] ?? '';

    for (const field of ['tokenHash', 'secretHash', 'passwordHash']) {
      expect(`${tokenSource}${identitySource}`).toContain(field);
    }
    // A field literally called `token` or `password` on a stored record would mean plaintext at
    // rest; the records deliberately have neither.
    expect(tokenSource).not.toMatch(/^\s+readonly (token|secret|password):/m);
    expect(identitySource).not.toMatch(/^\s+readonly password:/m);
  });
});
