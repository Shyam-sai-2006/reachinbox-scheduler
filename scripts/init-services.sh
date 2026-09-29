#!/usr/bin/env bash
set -e

echo "Starting Redis..."
service redis-server start

echo "Starting PostgreSQL..."
service postgresql start

echo "Configuring PostgreSQL user and database..."
su - postgres -c "psql -c \"ALTER USER postgres WITH PASSWORD 'postgres';\""
su - postgres -c "psql -tc \"SELECT 1 FROM pg_database WHERE datname = 'reachinbox'\" | grep -q 1 || psql -c \"CREATE DATABASE reachinbox;\""

echo "Enabling listening on 0.0.0.0 for PostgreSQL..."
PG_CONF=$(su - postgres -c "psql -t -P format=unaligned -c 'show config_file;'")
sed -i "s/#listen_addresses = 'localhost'/listen_addresses = '*'/g" "$PG_CONF"
sed -i "s/listen_addresses = 'localhost'/listen_addresses = '*'/g" "$PG_CONF"
PG_HBA=$(dirname "$PG_CONF")/pg_hba.conf
grep -q "host all all 0.0.0.0/0 md5" "$PG_HBA" || echo "host all all 0.0.0.0/0 md5" >> "$PG_HBA"
grep -q "host all all 0.0.0.0/0 scram-sha-256" "$PG_HBA" || echo "host all all 0.0.0.0/0 scram-sha-256" >> "$PG_HBA"
service postgresql reload

echo "Checking Redis and Postgres connectivity..."
redis-cli ping
su - postgres -c "psql -d reachinbox -c 'SELECT current_database();'"

echo "Services started and verified successfully!"
