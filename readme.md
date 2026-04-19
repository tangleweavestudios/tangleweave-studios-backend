# TangleWeave Studios Backend

Серверная инфраструктура для игры **«Unwind: The Magic Atlas»** и проектов студии TangleWeave Studios.

## Быстрый старт

```bash
# 1. Копируем .env файл и настраиваем переменные
cp .env.example .env

# 2. Запуск инфраструктуры (с чистой БД - первый запуск)
docker-compose up -d

# 3. Ждём запуска Rauthy (~10 секунд)
sleep 10

# 4. Автоматическая настройка SSO
./scripts/init-sso.sh

# 5. Проверка статуса
docker-compose ps
```

## Первичная настройка SSO (Rauthy)

При первом запуске Rauthy автоматически создаёт:
- **Админ-пользователь:** `admin@localhost.de`
- **Пароль:** см. `BOOTSTRAP_ADMIN_PASSWORD_PLAIN` в `.env`
- **API-ключ:** `bootstrap` (с правами на Clients и Roles)

Затем скрипт `./scripts/init-sso.sh` создаёт OIDC клиенты:
- `unwind-game` — для Godot клиента игры
- `backoffice-admin` — для Backoffice фронтенда
- `backoffice-api` — для machine-to-machine авторизации

## Структура

| Компонент | Описание |
|-----------|----------|
| **Nakama** | Игровой сервер (TypeScript/Go/Lua) |
| **Rauthy** | OIDC провайдер (SSO) |
| **PostgreSQL** | Единый кластер БД |
| **Aptabase** | Self-hosted аналитика |
| **Backoffice API** | Rust/Axum микросервис |

## Сервисы

| URL | Сервис |
|-----|--------|
| http://localhost:7350 | Nakama (игровой клиент) |
| http://localhost:7351 | Nakama Console |
| http://localhost:8443 | Rauthy (админка SSO) |
| http://localhost:3000 | Aptabase (аналитика) |
| http://localhost:8080 | Backoffice API |

## Документация

Подробная документация: [description.md](./description.md)
