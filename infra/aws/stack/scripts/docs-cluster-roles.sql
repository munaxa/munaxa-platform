-- Vendored verbatim from munaxa-docs infra/sql/cluster/01-roles.sql at commit 4e8e1ca (main 406eaee),
-- sha256 of the original below this header: a6cf9e9625715074b8ce4a6e76b5f30240f20b2db6a711d4128bb25b21989968. Docs owns it; refresh this copy
-- by PR when Docs changes it. The docs-db-admin task (docs.tf) runs it as the RDS master user.

-- The database roles. Applied ONCE PER CLUSTER, as a superuser, before any database exists.
--
-- Cluster-scoped because a PostgreSQL role is cluster-scoped: under ADR-0015 one cluster holds many
-- tenant databases, and `edms_app` is the same role in all of them. Creating it per database would
-- fail on the second one — and worse, a deployment that let it fail quietly would have a database
-- whose application role was never restricted.
--
-- Nothing here may reference a table or a database. Everything that belongs to a *database* —
-- grants on it, default privileges in its schema, the tenant discriminator function — is in
-- ../database/, which runs once per tenant database. Everything that references a table is in
-- ../post-migrate/, which runs after every migration.
--
-- The application connects as edms_app, which does NOT have BYPASSRLS; migrations run as
-- edms_owner, which owns the schema. A logic error in a query therefore returns nothing rather than
-- another tenant's rows — inside a tenant's own database, which is the layer underneath the physical
-- separation rather than a replacement for it
-- (docs/architecture/adr/0015-database-per-tenant.md).

-- The migration owner. Owns every object; never used by the running application.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edms_owner') THEN
    CREATE ROLE edms_owner LOGIN;
  END IF;
END
$$;

-- The application role. NOBYPASSRLS is the point of this file.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'edms_app') THEN
    CREATE ROLE edms_app LOGIN NOBYPASSRLS;
  END IF;
END
$$;

ALTER ROLE edms_app SET statement_timeout = '15s';
ALTER ROLE edms_app SET idle_in_transaction_session_timeout = '30s';
