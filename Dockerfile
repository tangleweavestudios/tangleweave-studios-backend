# --- Этап сборки ---
FROM rust:1.93-slim AS builder

WORKDIR /app

# 1. Копируем файлы воркспейса
COPY Cargo.toml Cargo.lock ./
# 2. Копируем манифесты всех подпроектов (нужно для кеширования)
COPY app/client/Cargo.toml ./app/client/Cargo.toml
COPY app/server/Cargo.toml ./app/server/Cargo.toml
COPY backoffice/client/Cargo.toml ./backoffice/client/Cargo.toml
COPY backoffice/server/Cargo.toml ./backoffice/server/Cargo.toml
COPY shared/models/Cargo.toml ./shared/models/Cargo.toml
COPY shared/protocol/Cargo.toml ./shared/protocol/Cargo.toml
COPY shared/utils/Cargo.toml ./shared/utils/Cargo.toml

RUN mkdir -p backoffice/server/migrations

# 3. Копируем реальный код
COPY shared/models/src ./shared/models/src
COPY shared/protocol/src ./shared/protocol/src
COPY shared/utils/src ./shared/utils/src
COPY app/client/src ./app/client/src
COPY app/server/src ./app/server/src
COPY backoffice/client/src ./backoffice/client/src
COPY backoffice/server/src ./backoffice/server/src
COPY backoffice/server/migrations ./backoffice/server/migrations

# Финальная сборка бинарника
RUN cargo build --release -p tangleweavestudios-backoffice-server

# --- Этап запуска ---
FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Копируем бинарник из общей папки target воркспейса
COPY --from=builder /app/target/release/tangleweavestudios-backoffice-server ./server
COPY backoffice/server/migrations ./migrations

EXPOSE 3000
CMD ["./server"]