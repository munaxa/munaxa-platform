// L-5: docs-db-admin takes edms_owner's password from docs-migrate's DATABASE_MIGRATION_URL
// (docs-owner-password.sql), so the owner credential is kept in one place. This runs that SQL in
// psql against a throwaway PostgreSQL cluster made here (no network, a Unix socket in a temp
// directory) and checks that the password is decoded exactly, that anything but edms_owner on the
// tenant database is refused before a role could be changed, and that neither the URL nor the
// password is ever printed.
//
//   node --test 'infra/aws/stack/**/*.test.mjs'
//
// Needs the PostgreSQL server binaries (initdb, pg_ctl, psql; GitHub's Ubuntu runners have them).
// Without them it skips, unless DOCS_OWNER_PASSWORD_TEST_REQUIRE_POSTGRES=1, which CI sets.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

const SQL = readFileSync(new URL('./docs-owner-password.sql', import.meta.url), 'utf8');

function postgresBin() {
  const root = '/usr/lib/postgresql';
  if (!existsSync(root)) return undefined;
  const versions = readdirSync(root).filter((v) => existsSync(join(root, v, 'bin', 'initdb')));
  versions.sort((a, b) => Number(b) - Number(a));
  return versions.length ? join(root, versions[0], 'bin') : undefined;
}

const bin = postgresBin();
const required = process.env.DOCS_OWNER_PASSWORD_TEST_REQUIRE_POSTGRES === '1';
const runnable = bin !== undefined && process.getuid?.() !== 0;
if (required && !runnable) {
  throw new Error(
    bin === undefined
      ? 'PostgreSQL server binaries are required (DOCS_OWNER_PASSWORD_TEST_REQUIRE_POSTGRES=1) and were not found'
      : 'PostgreSQL refuses to run as root; run this test as an ordinary user',
  );
}

describe(
  'docs-db-admin: the owner password from the docs-migrate URL',
  { skip: runnable ? false : 'no PostgreSQL server binaries, or running as root' },
  () => {
    let dir;
    let port;
    const run = (url, database = 'edms_munaxa_internal') =>
      spawnSync(
        join(bin, 'psql'),
        [
          '-X',
          '-q',
          '-t',
          '-A',
          '-v',
          'ON_ERROR_STOP=1',
          '-h',
          dir,
          '-p',
          String(port),
          '-d',
          'postgres',
        ],
        {
          encoding: 'utf8',
          input: `${SQL}\nALTER ROLE edms_owner PASSWORD :'owner_pw';\nSELECT md5(:'owner_pw');\n`,
          env: {
            PATH: process.env.PATH,
            ...(url === undefined ? {} : { DATABASE_MIGRATION_URL: url }),
            TENANT_DATABASE: database,
          },
        },
      );

    before(() => {
      dir = mkdtempSync(join(tmpdir(), 'docs-owner-pw-'));
      port = 20000 + Math.floor(Math.random() * 20000);
      const init = spawnSync(
        join(bin, 'initdb'),
        ['-D', join(dir, 'data'), '-A', 'trust', '-U', process.env.USER || 'postgres'],
        { encoding: 'utf8' },
      );
      assert.equal(init.status, 0, init.stderr);
      const start = spawnSync(
        join(bin, 'pg_ctl'),
        [
          '-D',
          join(dir, 'data'),
          '-w',
          '-l',
          join(dir, 'log'),
          '-o',
          `-k ${dir} -p ${port} -c listen_addresses=''`,
          'start',
        ],
        { encoding: 'utf8' },
      );
      assert.equal(start.status, 0, start.stderr + start.stdout);
      const role = spawnSync(
        join(bin, 'psql'),
        [
          '-X',
          '-q',
          '-h',
          dir,
          '-p',
          String(port),
          '-d',
          'postgres',
          '-c',
          'CREATE ROLE edms_owner LOGIN',
        ],
        { encoding: 'utf8' },
      );
      assert.equal(role.status, 0, role.stderr);
    });

    after(() => {
      if (dir) {
        spawnSync(join(bin, 'pg_ctl'), ['-D', join(dir, 'data'), '-m', 'immediate', 'stop']);
        rmSync(dir, { recursive: true, force: true });
      }
    });

    const md5 = (text) => createHash('md5').update(text, 'utf8').digest('hex');

    for (const [encoded, decoded] of [
      ['simple-Passw0rd-1234', 'simple-Passw0rd-1234'],
      ['own%25pw%40x%2Fy%3A%3F%23%20z', 'own%pw@x/y:?# z'],
      ['%C3%A9t%C3%A9-%E2%82%AC-pass', 'été-€-pass'],
      ['quote%27and%22dq%5C', 'quote\'and"dq\\'],
    ]) {
      test(`sets the password the URL carries, percent-decoded (${JSON.stringify(decoded)})`, () => {
        for (const url of [
          `postgresql://edms_owner:${encoded}@db.internal:5432/edms_munaxa_internal`,
          `postgres://edms_owner:${encoded}@db.internal/edms_munaxa_internal?sslmode=require`,
        ]) {
          const result = run(url);
          assert.equal(result.status, 0, result.stderr);
          assert.equal(result.stdout.trim(), md5(decoded));
          for (const text of [result.stdout, result.stderr]) {
            assert.ok(
              !text.includes(encoded) && !text.includes(decoded),
              'the password was printed',
            );
            assert.doesNotMatch(text, /postgres(ql)?:\/\//);
          }
        }
      });
    }

    for (const [why, url, database] of [
      ['another role', 'postgresql://edms_app:secret-value-1@db/edms_munaxa_internal'],
      ['no password', 'postgresql://edms_owner:@db/edms_munaxa_internal'],
      ['no password at all', 'postgresql://edms_owner@db/edms_munaxa_internal'],
      ['another database', 'postgresql://edms_owner:secret-value-1@db/postgres'],
      ['a malformed escape', 'postgresql://edms_owner:bad%zzescape@db/edms_munaxa_internal'],
      ['not a URL', 'host=db user=edms_owner password=secret-value-1'],
      ['an empty value', ''],
      [
        'the tenant database not given',
        'postgresql://edms_owner:secret-value-1@db/edms_munaxa_internal',
        '',
      ],
    ]) {
      test(`refuses ${why} before any role is changed, printing nothing secret`, () => {
        const result = run(url, database);
        assert.notEqual(result.status, 0);
        assert.equal(result.stdout.trim(), '', 'the ALTER ROLE ran');
        assert.match(result.stderr, /must be edms_owner, with a password, on the tenant database/);
        assert.ok(!result.stderr.includes('secret-value-1') && !result.stderr.includes('zzescape'));
      });
    }

    test('refuses when the bundle key is not delivered at all', () => {
      const result = run(undefined);
      assert.notEqual(result.status, 0);
      assert.equal(result.stdout.trim(), '');
    });
  },
);
