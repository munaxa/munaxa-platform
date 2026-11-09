# Config A1 owner input guide (Windows PowerShell)

Part of [`00-IDENTITY-CONFIG-A1-PREPARATION.md`](00-IDENTITY-CONFIG-A1-PREPARATION.md). This guide is
the only place where secret values come into existence. Nothing in it has been run by Claude.

**Rules for every step:** a secret value is never printed in a terminal, never written to a file,
never committed, never placed in GitHub, never pasted into Claude or ChatGPT. It goes from the
generator on your machine straight into AWS Secrets Manager. Public values (key id, public key,
image digests, version ids) may be shared and committed.

## What you do, in order

| # | When | What | Where |
|---|---|---|---|
| A | Before the inputs PR | Generate the signing key and the two Identity bundles, paste them into Secrets Manager | Your Windows PC, AWS console |
| B | Before the inputs PR | Send Claude the public key snippet and the two new version ids | This thread |
| C | During the first Identity session, after `identity-migrate` | Create `munaxa-nonprod/identity-bootstrap` | AWS console |
| D | Same session, after bootstrap steps 1 to 3 | Delete `munaxa-nonprod/identity-bootstrap` | AWS CloudShell |

## A. Signing key and the Identity bundles

### A.0 Once: prerequisites

1. Node.js 18 or later (`node --version`). If missing: `winget install OpenJS.NodeJS.LTS`, then open a new PowerShell window.
2. Turn off Windows clipboard history for the duration: Settings, System, Clipboard, **Clipboard history: Off**, and **Sync across devices: Off**. (Win+V would otherwise keep a copy of each paste.)
3. The database endpoint (not secret), read by Claude on 9 Nov 13:10 UTC: **`munaxa-nonprod-pg.cjw44yig4u0v.eu-central-1.rds.amazonaws.com`** (RDS, Databases, `munaxa-nonprod-pg`, Connectivity and security, Endpoint). Use exactly this name, never an IP address: Identity's bootstrap scripts verify the certificate's host name.

### A.1 Get the generator and check it

Why not `munaxa-identity/apps/api/scripts/generate-signing-key.mjs`: it writes the private key to
standard output, so in a terminal it is displayed (report §8). The generator below makes the same
key the same way (Node `generateKeyPairSync('ec', { namedCurve: 'P-256' })`, private PKCS#8 PEM,
public SPKI PEM) and also generates the four random values of the bundles. It refuses to run when
its output would reach the screen.

```powershell
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force "$env:USERPROFILE\munaxa-a1" | Out-Null
Set-Location "$env:USERPROFILE\munaxa-a1"
# Pinned to commit 631bd49f0b13b0afad49ab2ecd6a9ca4c6989676 (this PR); the hash check below still applies.
Invoke-WebRequest -UseBasicParsing `
  -Uri "https://raw.githubusercontent.com/munaxa/munaxa-platform/631bd49f0b13b0afad49ab2ecd6a9ca4c6989676/docs/aws-migration/agent-reports/2026-11-09-identity-config-a1-preparation/supporting/identity-a1-owner-values.mjs" `
  -OutFile .\identity-a1-owner-values.mjs
(Get-FileHash .\identity-a1-owner-values.mjs -Algorithm SHA256).Hash
```

The hash must be **`F7292ED5E8E0FFB396463688AFA116D7C2A68E70D701929F35FEC0439BA68CDE`**. If it is not, stop.

### A.2 Generate (nothing secret is shown)

```powershell
$dbHost = 'munaxa-nonprod-pg.cjw44yig4u0v.eu-central-1.rds.amazonaws.com'   # A.0 step 3
$v = node .\identity-a1-owner-values.mjs --kid identity-nonprod-2026-11 --db-host $dbHost --public-out .\public | ConvertFrom-Json
if (-not $v.identity -or -not $v.identityMigrate) { throw 'Generator failed; nothing to paste.' }
```

The window shows only: 13 `ok` check lines (key is PKCS#8 P-256, public half matches, an ES256
signature verifies, the four random values are distinct, role and database names and password
format match `db-bootstrap.sh`), the key id and the **public** key. The secret values are only in
the variable `$v` in memory. Do not type `$v` on its own.

The folder `.\public` now holds two public files: `identity_public_keys.json` and
`identity-a1.auto.tfvars.snippet`.

### A.3 Paste the bundle `munaxa-nonprod/identity`

```powershell
Set-Clipboard -Value $v.identity
```

AWS console, eu-central-1, Secrets Manager, Secrets, **`munaxa-nonprod/identity`** (it exists, with
no value yet). In "Secret value" choose **Retrieve secret value**, then **Set secret value** (on a
secret that already has a value the button is **Edit**). Choose the **Plaintext** tab, select
everything in the box, paste (Ctrl+V), **Save**. The console shows the pasted JSON while the editor
is open; close it as soon as it is saved. Do not change the encryption key (the bundle already uses
`alias/munaxa-nonprod-data`, the only key Identity's execution role may decrypt with).

### A.4 Paste the bundle `munaxa-nonprod/identity-migrate`

```powershell
Set-Clipboard -Value $v.identityMigrate
```

Same steps on **`munaxa-nonprod/identity-migrate`**.

### A.5 Clean up

```powershell
Set-Clipboard -Value ' '
Remove-Variable v
```

Close the PowerShell window. The private key now exists only in Secrets Manager. If anything went
wrong before both saves, run A.2 to A.5 again: a new run makes a new key and new passwords, and the
new version simply replaces the old one (nothing has used them yet).

## B. Send Claude the public values

1. `Get-Content .\public\identity-a1.auto.tfvars.snippet` and paste the two lines into the thread.
   They hold `identity_signing_kid` and `identity_public_keys` (the public key only; the generator
   refuses to write a private key there).
2. The two version ids: Secrets Manager, each of the two secrets, tab **Versions**, the version
   with label `AWSCURRENT`; copy its **Version ID** (a UUID). Version ids are metadata, not secrets.
   Alternatively, authorize Claude to read them (`ListSecretVersionIds`, read-only, no value).

Claude then opens the inputs PR (report §6): the digests already in the template, your public key,
`secret_version_ids` for `identity` and `identity-migrate`, and the 22-address declaration.

## C. The temporary bootstrap secret (first session only)

Create it **during the first Identity session, after `identity-migrate` has exited 0 and before
`identity-bootstrap` step 1** (runbook `02-IDENTITY-ONLY-RUNBOOK.md` step 9).

1. In a password manager, create the entry "Munaxa Testing Identity operator". Username: a
   **dedicated Testing address you own**, recommended `identity-test-admin@munaxa.com` (a mailbox or
   alias you can receive mail on; not your normal sign-in address). Password: generated by the
   password manager, **32 characters**, letters and digits (symbols are allowed but not needed),
   never used anywhere else, not your AWS or Microsoft password.
2. AWS console, eu-central-1, Secrets Manager, **Store a new secret**, "Other type of secret".
   Key/value pairs: `IDENTITY_OWNER_EMAIL` = the address, `IDENTITY_OWNER_PASSWORD` = the password
   (copy from the password manager, paste, nothing else). **Encryption key: `alias/munaxa-nonprod-data`**
   (the task's role can decrypt only with this key). Next.
3. Secret name exactly **`munaxa-nonprod/identity-bootstrap`**. No description containing the
   address. No rotation. Store.

The account's password must satisfy Identity's policy (12 to 128 characters, not a single repeated
character or a sequence, not containing the email); 32 random characters does.

## D. Delete the bootstrap secret

**Delete it as soon as bootstrap steps 1, 2 and 3 have each exited 0** (runbook step 13), and in
any case before the session is taken down. Use CloudShell (eu-central-1), because the console's
delete keeps a recoverable copy of the password for at least 7 days:

```bash
aws secretsmanager delete-secret --region eu-central-1 \
  --secret-id munaxa-nonprod/identity-bootstrap --force-delete-without-recovery
aws secretsmanager list-secrets --region eu-central-1 \
  --filters Key=name,Values=munaxa-nonprod/identity-bootstrap --query 'length(SecretList)'
```

The second command must print `0`. The password stays in your password manager: it is the
operator's sign-in for Testing.

## Values summary

| Value | Who makes it | Where it goes | Committed? |
|---|---|---|---|
| Signing private key (P-256, PKCS#8) | You, A.2 | `munaxa-nonprod/identity` `IDENTITY_SIGNING_PRIVATE_KEY` | **Never** |
| `IDENTITY_SIGNING_SECRET` (64 hex) | You, A.2 | `munaxa-nonprod/identity` | **Never** |
| `REDIS_PASSWORD` (64 hex) and `REDIS_URL` | You, A.2 | `munaxa-nonprod/identity` | **Never** |
| `identity_app` password inside `DATABASE_URL` (64 hex) | You, A.2 | `munaxa-nonprod/identity` | **Never** |
| `identity_owner` password inside `DATABASE_MIGRATION_URL` (64 hex) | You, A.2 | `munaxa-nonprod/identity-migrate` | **Never** |
| Operator email and password | You, password manager, C | `munaxa-nonprod/identity-bootstrap` (temporary) | **Never** |
| RDS master password | AWS (RDS-managed secret) | read only by `db-admin` | Never seen by anyone |
| Key id `identity-nonprod-2026-11` | Decided | `envs/nonprod.tfvars` | Yes |
| Public key (SPKI PEM in JSON) | You, A.2 | `envs/nonprod.tfvars` `identity_public_keys` | Yes |
| Secret version ids | AWS | `envs/nonprod.tfvars` `secret_version_ids` | Yes |
| Image digests (Identity, Valkey, PostgreSQL) | Claude, verified | `envs/nonprod.tfvars` | Yes |
