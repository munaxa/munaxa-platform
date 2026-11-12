-- The edms_owner password for docs-db-admin, taken from the one place it is kept: the
-- DATABASE_MIGRATION_URL key of the <env>/docs-migrate bundle, the URL docs-migrate connects with
-- (docs.tf, L-5). There is no second copy (the docs-operator bundle holds no owner password any
-- more), so a rotation is one write of that URL followed by one docs-db-admin run,
-- and the password the role is given is by construction the one docs-migrate presents.
--
-- psql, run by docs-db-admin as the RDS master (ON_ERROR_STOP on), before any role is touched. The
-- URL arrives through ECS secrets in DATABASE_MIGRATION_URL and is read with \getenv only; it is
-- never echoed, and it reaches the server only as a bound parameter (\bind), never inside the text
-- of a statement, so a server log of a failing statement shows $1, not the URL.
--
-- It must name edms_owner, one host (no second '@'), the tenant database itself (TENANT_DATABASE),
-- no user, password or dbname override in the query string, and a non-empty password whose
-- percent-escapes are well formed and decode to valid UTF-8 without NUL. Anything else stops the
-- task here, before any role is changed. The check is done on the decoded bytes in hex, so it
-- cannot itself raise an error that would carry a fragment of the password. The password is
-- percent-decoded exactly as libpq and Prisma decode it, into the psql variable owner_pw.
--
-- \bind takes the variable unquoted (:name; :'name' would keep its quotes) and one leading 'x'
-- that the SQL strips, so an empty or unset value is still one parameter and gets the refusal
-- below rather than a protocol error. The database name is not secret and is quoted inline.
\getenv migration_url DATABASE_MIGRATION_URL
\getenv owner_url_db TENANT_DATABASE
WITH m AS (
  SELECT regexp_match(substr($1, 2),
           '^postgres(?:ql)?://([^:@/?#]+):([^@/?#]*)@([^/?#@]+)/([^/?#]+)(?:\?([^#]*))?$') AS p
), h AS (
  SELECT p,
         (SELECT string_agg(CASE WHEN t[1] IS NOT NULL THEN lower(t[1])
                                 ELSE encode(convert_to(t[2], 'UTF8'), 'hex') END,
                            '' ORDER BY n)
            FROM regexp_matches(p[2], '%([0-9A-Fa-f]{2})|([^%]+)', 'g') WITH ORDINALITY AS r(t, n)) AS hex
    FROM m
), v AS (
  SELECT hex,
         coalesce(
           p[1] = 'edms_owner' AND p[4] = :'owner_url_db' AND p[2] <> ''
             AND p[2] !~ '%(?![0-9A-Fa-f]{2})'
             AND coalesce(p[5], '') !~* '(^|&)(user|password|dbname)='
             AND hex ~ ('^(?:0[1-9a-f]|[1-7][0-9a-f]'
                        || '|(?:c[2-9a-f]|d[0-9a-f])[89ab][0-9a-f]'
                        || '|e0[ab][0-9a-f][89ab][0-9a-f]'
                        || '|(?:e[1-9a-c]|e[ef])(?:[89ab][0-9a-f]){2}'
                        || '|ed[89][0-9a-f][89ab][0-9a-f]'
                        || '|f0[9ab][0-9a-f](?:[89ab][0-9a-f]){2}'
                        || '|f[1-3](?:[89ab][0-9a-f]){3}'
                        || '|f48[0-9a-f](?:[89ab][0-9a-f]){2})+$'),
           false) AS ok
    FROM h
)
SELECT ok AS owner_url_ok, CASE WHEN ok THEN hex END AS owner_pw_hex FROM v
\bind x:migration_url \gset
\unset migration_url
\if :owner_url_ok
SELECT convert_from(decode($1, 'hex'), 'UTF8') AS owner_pw \bind :owner_pw_hex \gset
\unset owner_pw_hex
\else
DO $$ BEGIN RAISE EXCEPTION 'docs-migrate DATABASE_MIGRATION_URL must be edms_owner, with a password, on the tenant database; no role was changed'; END $$;
\endif
