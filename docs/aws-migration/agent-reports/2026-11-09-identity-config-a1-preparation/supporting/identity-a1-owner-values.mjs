#!/usr/bin/env node
// Munaxa Identity, Testing (Config A1): generates the values of the two Identity secret bundles on
// the owner's own machine, checks them, and hands them to the caller WITHOUT printing a secret.
//
//   node identity-a1-owner-values.mjs --kid identity-nonprod-2026-11 \
//        --db-host <database_endpoint> --public-out <folder>
//
// Why not munaxa-identity apps/api/scripts/generate-signing-key.mjs: that script writes the private
// key to stdout, so in a terminal it is displayed. This file makes the same key the same way
// (node:crypto generateKeyPairSync('ec', { namedCurve: 'P-256' }), private PKCS#8 PEM, public SPKI
// PEM, the formats Identity's configuration accepts) and differs only in where the output goes:
//
//   stdout  ONE line of JSON holding the two bundle values, meant to be captured into a PowerShell
//           variable ($v = node ... | ConvertFrom-Json), never shown. Refuses to run when stdout is a
//           terminal, so a secret cannot be printed by mistake.
//   stderr  public information and check results only: key id, public key, the tfvars lines.
//   files   in --public-out: identity_public_keys.json and identity-a1.auto.tfvars.snippet (public).
//
// Nothing is written to disk that is secret. No network access. Node 18 or later.
import { createPrivateKey, createPublicKey, generateKeyPairSync, randomBytes, sign, verify } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fail = (message) => {
  process.stderr.write(`identity-a1-owner-values: ${message}\nNothing was produced.\n`);
  process.exit(1);
};
const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
};

if (process.stdout.isTTY) {
  fail('stdout is a terminal. Capture it into a variable: $v = node identity-a1-owner-values.mjs ... | ConvertFrom-Json');
}

const kid = argument('kid') ?? '';
const dbHost = (argument('db-host') ?? '').trim();
const publicOut = argument('public-out') ?? '';
if (!/^identity-nonprod-\d{4}-\d{2}$/.test(kid)) fail('--kid must look like identity-nonprod-2026-11.');
// The bundle URL host must be the instance endpoint DNS name: Identity's bootstrap scripts use
// node-postgres, which verifies the certificate's host name (munaxa-identity docs/runbooks/aws.md).
if (!/^munaxa-nonprod-pg\.[a-z0-9]+\.eu-central-1\.rds\.amazonaws\.com$/.test(dbHost)) {
  fail('--db-host must be the RDS endpoint, munaxa-nonprod-pg.<id>.eu-central-1.rds.amazonaws.com.');
}
if (publicOut === '') fail('--public-out <folder> is required (public files only).');

// --- Signing key (ES256, P-256) -------------------------------------------------------------------
const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString().trimEnd();
const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString().trimEnd();

const checks = [];
const check = (label, ok) => {
  if (!ok) fail(`check failed: ${label}`);
  checks.push(label);
};
const reloaded = createPrivateKey(privatePem);
check('private key is PKCS#8 PEM', privatePem.startsWith('-----BEGIN PRIVATE KEY-----') && privatePem.endsWith('-----END PRIVATE KEY-----'));
check('private key is EC P-256', reloaded.asymmetricKeyType === 'ec' && reloaded.asymmetricKeyDetails?.namedCurve === 'prime256v1');
check('public key is SPKI PEM', publicPem.startsWith('-----BEGIN PUBLIC KEY-----') && publicPem.endsWith('-----END PUBLIC KEY-----'));
check(
  'public key is the private key\'s public half (as Identity derives it)',
  createPublicKey(privatePem).export({ type: 'spki', format: 'pem' }).toString().trimEnd() === publicPem,
);
const probe = randomBytes(32);
const signature = sign('sha256', probe, { key: privatePem, dsaEncoding: 'ieee-p1363' });
check('ES256 signature verifies with the public key', signature.length === 64 && verify('sha256', probe, { key: publicPem, dsaEncoding: 'ieee-p1363' }, signature));

// --- Random values ----------------------------------------------------------------------------------
// Hex only: db-bootstrap.sh accepts [A-Za-z0-9]{32,128} passwords, and hex needs no URL-encoding.
const hex = () => randomBytes(32).toString('hex'); // 64 characters, 256 bits
const appPassword = hex();
const ownerPassword = hex();
const signingSecret = hex();
const redisPassword = hex();
check('four distinct 256-bit random values', new Set([appPassword, ownerPassword, signingSecret, redisPassword]).size === 4);

const url = (role, password) => `postgresql://${role}:${password}@${dbHost}:5432/identity?sslmode=require`;
const identity = {
  DATABASE_URL: url('identity_app', appPassword),
  IDENTITY_SIGNING_PRIVATE_KEY: privatePem,
  IDENTITY_SIGNING_SECRET: signingSecret,
  REDIS_URL: `redis://:${redisPassword}@127.0.0.1:6379`,
  REDIS_PASSWORD: redisPassword,
};
const identityMigrate = { DATABASE_MIGRATION_URL: url('identity_owner', ownerPassword) };

// The same parsing db-bootstrap.sh applies (infra/aws/stack/scripts/db-bootstrap.sh).
const parse = (u) => u.match(/^postgres(?:ql)?:\/\/([^:@/]*):([^@]*)@[^/]*\/([^?]*)/);
const [, appUser, appPw, appDb] = parse(identity.DATABASE_URL);
const [, ownerUser, ownerPw, ownerDb] = parse(identityMigrate.DATABASE_MIGRATION_URL);
check('role names are identity_app and identity_owner', appUser === 'identity_app' && ownerUser === 'identity_owner');
check('both URLs name the database identity', appDb === 'identity' && ownerDb === 'identity');
check('passwords match db-bootstrap.sh [A-Za-z0-9]{32,128}', [appPw, ownerPw].every((p) => /^[A-Za-z0-9]{32,128}$/.test(p)));
check('IDENTITY_SIGNING_SECRET is at least 32 characters', signingSecret.length >= 32);
check('IDENTITY_SIGNING_PRIVATE_KEY is at least 100 characters', privatePem.length >= 100);
check('bundle key sets match infra/aws/stack/data.tf', Object.keys(identity).join() === 'DATABASE_URL,IDENTITY_SIGNING_PRIVATE_KEY,IDENTITY_SIGNING_SECRET,REDIS_URL,REDIS_PASSWORD' && Object.keys(identityMigrate).join() === 'DATABASE_MIGRATION_URL');

// --- Public outputs ---------------------------------------------------------------------------------
const publicKeys = JSON.stringify([{ kid, publicKey: publicPem }]);
check('public outputs hold no private key', !publicKeys.includes('PRIVATE KEY'));
mkdirSync(publicOut, { recursive: true });
writeFileSync(join(publicOut, 'identity_public_keys.json'), `${publicKeys}\n`);
const snippet = [
  `identity_signing_kid = "${kid}"`,
  `identity_public_keys = ${JSON.stringify(publicKeys)}`,
  '',
].join('\n');
writeFileSync(join(publicOut, 'identity-a1.auto.tfvars.snippet'), snippet);

process.stderr.write(
  [
    'Checks passed:',
    ...checks.map((c) => `  ok  ${c}`),
    '',
    `Key id: ${kid}`,
    'Public key (safe to share and commit):',
    publicPem,
    '',
    `Public files written to ${publicOut}: identity_public_keys.json, identity-a1.auto.tfvars.snippet`,
    'Secret values were NOT printed. They are only in the captured stdout.',
    '',
  ].join('\n'),
);

process.stdout.write(
  `${JSON.stringify({
    identity: JSON.stringify(identity),
    identityMigrate: JSON.stringify(identityMigrate),
    kid,
  })}\n`,
);
