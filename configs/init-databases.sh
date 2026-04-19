#!/bin/bash
set -e

echo "Initializing databases and users..."

# Создаём базы данных
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE rauthy_db" || echo "rauthy_db already exists"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE nakama_db" || echo "nakama_db already exists"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE aptabase_db" || echo "aptabase_db already exists"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE backoffice_db" || echo "backoffice_db already exists"

# Создаём пользователей для каждого сервиса
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE USER rauthy WITH PASSWORD '${RAUTHY_DB_PASSWORD}'" || echo "User rauthy already exists"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE USER nakama WITH PASSWORD '${NAKAMA_DB_PASSWORD}'" || echo "User nakama already exists"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE USER aptabase WITH PASSWORD '${APTABASE_DB_PASSWORD}'" || echo "User aptabase already exists"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE USER backoffice WITH PASSWORD '${BACKOFFICE_DB_PASSWORD}'" || echo "User backoffice already exists"

# Выдаём права на базы данных
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE rauthy_db TO rauthy"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE nakama_db TO nakama"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE aptabase_db TO aptabase"
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "GRANT ALL PRIVILEGES ON DATABASE backoffice_db TO backoffice"

# Выдаём права на схему public для каждой БД
for db in rauthy_db nakama_db aptabase_db backoffice_db; do
  user=$(echo $db | sed 's/_db$//')
  psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$db" -c "GRANT ALL ON SCHEMA public TO $user" 2>/dev/null || true
done

echo "Databases and users initialized successfully!"
