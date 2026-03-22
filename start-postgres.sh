#!/bin/bash
set -e

PGDATA_DIR="/home/runner/workspace/.pgdata"
PGLOG="$PGDATA_DIR/server.log"

# Initialize data directory if it doesn't exist or is empty
if [ ! -f "$PGDATA_DIR/PG_VERSION" ]; then
  echo "[pg] Initializing PostgreSQL data directory..."
  rm -rf "$PGDATA_DIR"
  mkdir -p "$PGDATA_DIR"
  initdb -D "$PGDATA_DIR" --username=postgres --auth=trust 2>&1
fi

# Force correct socket dir and TCP settings (handles commented-out defaults)
sed -i "s|#*unix_socket_directories.*|unix_socket_directories = '/tmp'|" "$PGDATA_DIR/postgresql.conf"
sed -i "s|#*listen_addresses.*|listen_addresses = 'localhost'|" "$PGDATA_DIR/postgresql.conf"
sed -i "s|#*port = .*|port = 5432|" "$PGDATA_DIR/postgresql.conf"

# Start if not already running
if ! pg_ctl -D "$PGDATA_DIR" status > /dev/null 2>&1; then
  echo "[pg] Starting PostgreSQL..."
  pg_ctl -D "$PGDATA_DIR" -l "$PGLOG" -w start
fi

# Wait for TCP to be ready (use postgres maintenance db to avoid PGDATABASE env var)
echo "[pg] Waiting for PostgreSQL to accept connections..."
for i in $(seq 1 20); do
  PGDATABASE=postgres pg_isready -h localhost -p 5432 -U postgres > /dev/null 2>&1 && break
  sleep 0.5
done

# Create heliumdb if it doesn't exist (connect to postgres maintenance db explicitly)
PGDATABASE=postgres psql -h localhost -p 5432 -U postgres \
  -tc "SELECT 1 FROM pg_database WHERE datname='heliumdb'" | grep -q 1 || \
  PGDATABASE=postgres psql -h localhost -p 5432 -U postgres -c "CREATE DATABASE heliumdb;"

echo "[pg] PostgreSQL ready at localhost:5432/heliumdb"
