

Local build: 

docker compose --env-file .env.local -p tangleweave-local up -d --build
docker compose -p tangleweave-local down

Test build:

docker compose --env-file .env.test -p tangleweave-test up -d --build
docker compose -p tangleweave-test down

Prod build:

docker compose --env-file .env.prod -p tangleweave-prod up -d --build
docker compose -p tangleweave-prod down