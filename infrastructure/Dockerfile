FROM rust:1.93-slim AS builder

WORKDIR /app

COPY Cargo.toml Cargo.lock ./
COPY app/client/Cargo.toml ./app/client/Cargo.toml
COPY app/server/Cargo.toml ./app/server/Cargo.toml
COPY backoffice/client/Cargo.toml ./backoffice/client/Cargo.toml
COPY backoffice/server/Cargo.toml ./backoffice/server/Cargo.toml
COPY shared/models/Cargo.toml ./shared/models/Cargo.toml
COPY shared/protocol/Cargo.toml ./shared/protocol/Cargo.toml
COPY shared/utils/Cargo.toml ./shared/utils/Cargo.toml

RUN mkdir -p backoffice/server/migrations

RUN mkdir -p app/client/src && echo "fn main() {}" > app/client/src/main.rs
RUN mkdir -p app/server/src && echo "fn main() {}" > app/server/src/main.rs
RUN mkdir -p backoffice/client/src && echo "fn main() {}" > backoffice/client/src/main.rs
RUN mkdir -p backoffice/server/src && echo "fn main() {}" > backoffice/server/src/main.rs
RUN mkdir -p shared/models/src && touch shared/models/src/lib.rs
RUN mkdir -p shared/protocol/src && touch shared/protocol/src/lib.rs
RUN mkdir -p shared/utils/src && touch shared/utils/src/lib.rs

RUN cargo build --release -p tangleweavestudios-backoffice-server

COPY shared/models/src ./shared/models/src
COPY shared/protocol/src ./shared/protocol/src
COPY shared/utils/src ./shared/utils/src
COPY app/client/src ./app/client/src
COPY app/server/src ./app/server/src
COPY backoffice/client/src ./backoffice/client/src
COPY backoffice/server/src ./backoffice/server/src
COPY backoffice/server/migrations ./backoffice/server/migrations

RUN cargo build --release -p tangleweavestudios-backoffice-server

FROM debian:bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y \
    libssl3 \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/tangleweavestudios-backoffice-server ./server
COPY backoffice/server/migrations ./migrations

EXPOSE 3000
CMD ["./server"]
