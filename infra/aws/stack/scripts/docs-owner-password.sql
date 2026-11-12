-- The edms_owner password for docs-db-admin, taken from the one place it is kept: the
-- DATABASE_MIGRATION_URL key of the <env>/docs-migrate bundle, the URL docs-migrate connects with
-- (docs.tf, L-5). There is no second copy (the docs-operator bundle holds no owner password any
-- more), so a rotation is one write of that URL followed by one docs-db-admin run,
-- and the password the role is given is by construction the one docs-migrate presents.
--
-- psql, run by docs-db-admin as the RDS master (ON_ERROR_STOP on). The URL arrives through ECS
-- secrets in DATABASE_MIGRATION_URL and is read with \getenv only; it is never echoed. It must name
-- edms_owner, a non-empty password whose percent-escapes are well formed, and the tenant database
-- itself (TENANT_DATABASE), or the task stops here before any role is changed. The password is
-- percent-decoded exactly as libpq and Prisma decode it, into the psql variable owner_pw.
\getenv migration_url DATABASE_MIGRATION_URL
\getenv owner_url_db TENANT_DATABASE
SELECT coalesce(
         parts[1] = 'edms_owner' AND parts[3] = :'owner_url_db' AND parts[2] <> ''
           AND parts[2] !~ '%(?![0-9A-Fa-f]{2})',
         false) AS owner_url_ok
  FROM (SELECT regexp_match(:'migration_url',
                 '^postgres(?:ql)?://([^:@/?#]+):([^@/?#]*)@[^/?#]+/([^/?#]+)(?:\?[^#]*)?$') AS parts) AS p
\gset
\if :owner_url_ok
SELECT convert_from(
         string_agg(CASE WHEN t[1] IS NOT NULL THEN decode(t[1], 'hex') ELSE convert_to(t[2], 'UTF8') END,
                    ''::bytea ORDER BY n),
         'UTF8') AS owner_pw
  FROM regexp_matches(
         (regexp_match(:'migration_url', '^postgres(?:ql)?://[^:@/?#]+:([^@/?#]*)@'))[1],
         '%([0-9A-Fa-f]{2})|([^%]+)', 'g') WITH ORDINALITY AS r(t, n)
\gset
\else
DO $$ BEGIN RAISE EXCEPTION 'docs-migrate DATABASE_MIGRATION_URL must be edms_owner, with a password, on the tenant database; no role was changed'; END $$;
\endif
\unset migration_url
