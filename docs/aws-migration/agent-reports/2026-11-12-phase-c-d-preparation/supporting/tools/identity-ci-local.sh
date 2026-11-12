#!/usr/bin/env bash
# Reproduces munaxa-identity .github/workflows/ci.yml "verify" job locally (no GitHub, no AWS).
# Usage: identity-ci-local.sh <identity worktree> <db name>
set -euo pipefail
WT="$1"; DB="$2"
export TEST_DATABASE_URL="postgresql://identity_app:identity_app@localhost:5432/$DB"
export TEST_DIRECT_DATABASE_URL="postgresql://identity_mig:identity_mig@localhost:5432/$DB"
export TEST_SUPERUSER_URL="postgresql://identity:identity@localhost:5432/$DB"
export CACHE_CONNECTION_TEST_REQUIRE_SERVER=1
cd "$WT"
psql "postgresql://identity:identity@localhost:5432/postgres" -qc "drop database if exists $DB" -c "create database $DB" 
PGPASSWORD=identity psql "$TEST_SUPERUSER_URL" -v ON_ERROR_STOP=1 -qc "
  do \$\$ begin
    if not exists (select from pg_roles where rolname='identity_mig') then create role identity_mig login password 'identity_mig' nosuperuser nobypassrls nocreatedb nocreaterole noreplication; end if;
    if not exists (select from pg_roles where rolname='identity_app') then create role identity_app login password 'identity_app' nosuperuser nobypassrls nocreatedb nocreaterole noreplication; end if;
  end \$\$;
  alter schema public owner to identity_mig;
  grant create on database $DB to identity_mig;"
for m in prisma/migrations/*/migration.sql; do psql "$TEST_DIRECT_DATABASE_URL" -q -v ON_ERROR_STOP=1 -f "$m" >/dev/null; done
psql "$TEST_DIRECT_DATABASE_URL" -v ON_ERROR_STOP=1 -qc "
  grant usage on schema public to identity_app;
  grant select on identity_tenant to identity_app;
  grant select, insert, update, delete on identity_account, identity_session,
    identity_refresh_token, identity_role, identity_role_assignment,
    identity_reset_token, identity_mfa_enrollment, identity_mfa_recovery_code to identity_app;
  grant select, insert on identity_audit_event to identity_app;"
step() { echo "### STEP $1"; shift; "$@"; echo "### OK"; }
step format pnpm format:check
step lint pnpm lint
step prisma-generate pnpm prisma:generate
step typecheck pnpm typecheck
step build pnpm build
DATABASE_URL="$TEST_DIRECT_DATABASE_URL" step prisma-validate pnpm prisma:validate
step unit pnpm test
step integration pnpm test:integration
step catalogue-drift pnpm check:catalogue-drift
