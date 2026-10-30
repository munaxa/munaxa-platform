#!/bin/sh
# Creates each service's database, owner role and runtime role on the shared PostgreSQL instance,
# with the passwords already written to the services' secret bundles. Run by the db-admin task
# (ops.tf) as the RDS master user; idempotent, so a second run changes nothing but passwords that
# were rotated in the bundles.
#
# For every product P in identity, control, work, school, the task receives:
#   P_APP_URL    the runtime DATABASE_URL from <env>/<P>-api (or <env>/identity)
#   P_OWNER_URL  the DATABASE_MIGRATION_URL from <env>/<P>-migrate
# A product whose two URLs are both absent is skipped. Role and database names are read from the
# URLs, so they must be the names each product's migrations grant to:
#   identity_owner / identity_app   control_owner / control_app
#   work_owner / work_app           school_owner / munaxa_app
#
# Nothing secret is printed or passed on a command line: passwords reach psql through \getenv.
set -eu

: "${PGHOST:?}" "${PGUSER:?}" "${PGPASSWORD:?}"
export PGPORT="${PGPORT:-5432}" PGDATABASE=postgres PGSSLMODE=require

field() { # field <url> user|password|database
  case "$2" in
    user) printf '%s' "$1" | sed -n 's#^postgres\(ql\)\{0,1\}://\([^:@/]*\):.*#\2#p' ;;
    password) printf '%s' "$1" | sed -n 's#^postgres\(ql\)\{0,1\}://[^:@/]*:\([^@]*\)@.*#\2#p' ;;
    database) printf '%s' "$1" | sed -n 's#^[^@]*@[^/]*/\([^?]*\).*#\1#p' ;;
  esac
}

check() { # check <product> <label> <value> <pattern>
  if ! printf '%s' "$3" | grep -Eq "^$4\$"; then
    echo "db-bootstrap: $1: the $2 in its bundle is missing or malformed; nothing was changed for $1." >&2
    exit 1
  fi
}

for product in identity control work school; do
  upper=$(printf '%s' "$product" | tr '[:lower:]' '[:upper:]')
  app_url=$(printenv "${upper}_APP_URL" || true)
  owner_url=$(printenv "${upper}_OWNER_URL" || true)
  if [ -z "$app_url" ] && [ -z "$owner_url" ]; then
    echo "db-bootstrap: $product: no bundle values, skipped."
    continue
  fi

  app_user=$(field "$app_url" user)
  owner_user=$(field "$owner_url" user)
  database=$(field "$owner_url" database)
  app_database=$(field "$app_url" database)
  check "$product" "runtime role name" "$app_user" '[a-z][a-z0-9_]{2,40}'
  check "$product" "owner role name" "$owner_user" '[a-z][a-z0-9_]{2,40}'
  check "$product" "database name" "$database" '[a-z][a-z0-9_]{2,40}'
  [ "$database" = "$app_database" ] || { echo "db-bootstrap: $product: the two URLs name different databases." >&2; exit 1; }
  [ "$app_user" != "$owner_user" ] || { echo "db-bootstrap: $product: the runtime and owner roles must differ." >&2; exit 1; }
  # Hex or alphanumeric only: nothing that needs URL-encoding, so the URL and the role agree.
  DB_APP_PASSWORD=$(field "$app_url" password)
  DB_OWNER_PASSWORD=$(field "$owner_url" password)
  check "$product" "runtime password" "$DB_APP_PASSWORD" '[A-Za-z0-9]{32,128}'
  check "$product" "owner password" "$DB_OWNER_PASSWORD" '[A-Za-z0-9]{32,128}'
  export DB_APP_PASSWORD DB_OWNER_PASSWORD

  psql -v ON_ERROR_STOP=1 -q \
    -v app="$app_user" -v owner="$owner_user" -v db="$database" <<'SQL'
\getenv app_password DB_APP_PASSWORD
\getenv owner_password DB_OWNER_PASSWORD
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'owner') AS create_owner \gset
\if :create_owner
  -- CREATEROLE: Work's migrations create the non-login role they grant to (Work ADR-0077).
  CREATE ROLE :"owner" LOGIN NOSUPERUSER NOCREATEDB CREATEROLE NOBYPASSRLS;
\endif
SELECT NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app') AS create_app \gset
\if :create_app
  CREATE ROLE :"app" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;
\endif
ALTER ROLE :"owner" PASSWORD :'owner_password';
ALTER ROLE :"app" PASSWORD :'app_password';
-- The owner may grant to and act as the runtime role (Identity's baseline grants per table).
GRANT :"app" TO :"owner" WITH INHERIT FALSE, SET TRUE;
SELECT NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'db') AS create_db \gset
\if :create_db
  -- The master user must be a member of the owner to create a database owned by it.
  GRANT :"owner" TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;
  CREATE DATABASE :"db" OWNER :"owner";
\endif
-- Only this product's two roles may connect to its database.
REVOKE ALL ON DATABASE :"db" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"db" TO :"app";
GRANT ALL ON DATABASE :"db" TO :"owner";
SQL

  # PostgreSQL 15+ gives PUBLIC no CREATE on the public schema; the owner owns the schema so its
  # migrations can create objects, and the runtime role gets USAGE only.
  PGDATABASE="$database" psql -v ON_ERROR_STOP=1 -q -v app="$app_user" -v owner="$owner_user" <<'SQL'
ALTER SCHEMA public OWNER TO :"owner";
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO :"app";
SQL
  unset DB_APP_PASSWORD DB_OWNER_PASSWORD
  echo "db-bootstrap: $product: database $database, roles $owner_user and $app_user are in place."
done
