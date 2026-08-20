#!/usr/bin/env bash
#
# Run the PayByPalm schema invariant tests against a throwaway Postgres 17.
#
#   ./supabase/tests/run.sh
#
# Requires Docker. Nothing else — no Supabase CLI, no local psql, no network
# access to your Supabase project. The container is created and destroyed here.
#
# What this proves (see schema_test.sql for the assertions):
#   * migrations apply cleanly, in order, from scratch
#   * money cannot be created, destroyed, or double-spent
#   * a client key cannot read another user's data or call the money functions
#
# local_supabase_stub.sql fakes the parts of Supabase the migrations depend on
# (auth.users, auth.uid(), the anon/authenticated/service_role roles). It is a
# test fixture and is never applied to a real project.

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SUPA="$(dirname "$HERE")"
IMAGE="postgres:17-alpine"
CONTAINER="pbp-schema-test"

# The Docker daemon mounts host paths, so the SQL must live somewhere the daemon
# can see. Staging into a directory under $HOME avoids sandboxed /tmp mounts that
# the daemon cannot resolve.
STAGE="${TMPDIR:-$HOME}/.pbp-schema-test"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

rm -rf "$STAGE"; mkdir -p "$STAGE"
cp "$SUPA"/migrations/*.sql "$SUPA"/seed.sql "$HERE"/*.sql "$STAGE"/

cleanup
docker run -d --name "$CONTAINER" \
  -e POSTGRES_PASSWORD=pbp -e POSTGRES_DB=pbp "$IMAGE" >/dev/null

pg() {
  docker run --rm --network "container:$CONTAINER" \
    -e PGPASSWORD=pbp -v "$STAGE:/sql:ro" "$IMAGE" \
    psql -h 127.0.0.1 -U postgres -d pbp "$@"
}

printf 'waiting for postgres'
for _ in $(seq 1 60); do
  pg -Atc 'select 1' >/dev/null 2>&1 && break
  printf '.'; sleep 1
done
echo

fail() { echo "FAILED: $1"; echo "$2"; exit 1; }

out=$(pg -v ON_ERROR_STOP=1 -q -f /sql/local_supabase_stub.sql 2>&1) \
  || fail "supabase stub" "$out"

for f in "$SUPA"/migrations/*.sql; do
  b="$(basename "$f")"
  out=$(pg -v ON_ERROR_STOP=1 -q -f "/sql/$b" 2>&1) || fail "migration $b" "$out"
  echo "applied  $b"
done

out=$(pg -v ON_ERROR_STOP=1 -q -f /sql/seed.sql 2>&1) || fail "seed.sql" "$out"
echo "applied  seed.sql"

# Re-run to prove the seed is safe to apply twice.
out=$(pg -v ON_ERROR_STOP=1 -q -f /sql/seed.sql 2>&1) || fail "seed.sql (rerun)" "$out"
counts=$(pg -Atc "select (select count(*) from accounts where kind='float')
                     || '/' || (select count(*) from merchants)
                     || '/' || (select count(*) from terminals)" 2>&1)
[ "$counts" = "1/1/1" ] || fail "seed is not idempotent" "float/merchants/terminals = $counts"
echo "verified seed.sql is idempotent"
echo

result=$(pg -v ON_ERROR_STOP=1 -f /sql/schema_test.sql 2>&1); rc=$?
echo "$result"
[ $rc -eq 0 ] || { echo; echo "SCHEMA TESTS FAILED (exit $rc)"; exit 1; }
