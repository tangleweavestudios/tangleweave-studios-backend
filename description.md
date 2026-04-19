# TangleWeave Studios Backend — Техническая документация

## 1. Общее описание

Единая серверная инфраструктура (Backend Monorepo) для поддержки мультиплатформенной головоломки **«Unwind: The Magic Atlas»** и последующих проектов студии **TangleWeave Studios**.

### Бизнес-цели
- Независимая, масштабируемая система
- Единая точка авторизации (SSO)
- Server-authoritative игровая логика
- Легковесная аналитика без клиентских SDK
- Надёжный микросервис для бэк-офиса

## 2. Архитектура

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Docker Network                                  │
│                           (internal_network)                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌──────────┐     ┌──────────┐     ┌───────────┐     ┌──────────────────┐  │
│   │ Rauthy  │────▶│  Nakama  │────▶│ PostgreSQL│     │    Aptabase     │  │
│   │ (OIDC)  │     │  (Game)  │     │  Cluster  │     │  (Analytics)    │  │
│   │  :8443   │     │  :7350   │     │   :5432   │     │     :3000        │  │
│   └────┬─────┘     └────┬─────┘     └─────┬─────┘     └────────┬─────────┘  │
│        │                │                 │                    │            │
│        │                │                 │                    │            │
│        │         ┌──────▼──────┐          │                    │            │
│        │         │ Backoffice  │◀─────────┘                    │            │
│        │         │    API       │                              │            │
│        │         │   (Rust)     │◀─────────────────────────────┘            │
│        │         │    :8080     │                                              │
│        │         └──────────────┘                                              │
│        │                                                                      │
│   ┌────▼────────────────┐                                                     │
│   │   Nginx / Proxy      │                                                     │
│   │   (Port 80/443)      │                                                     │
│   └─────────────────────┘                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Внешние порты (пробрасываются на host)

| Сервис | Порт | Описание |
|--------|------|----------|
| Nginx | 80, 443 | Обратный прокси |
| Nakama | 7350 | Игровой клиентский API |
| Rauthy | 8443 | UI администрирования |
| Aptabase | 3000 | UI аналитики |
| Backoffice API | 8080 | Админ-панель API |
| Mailcrab | 1080 | SMTP для Rauthy (dev) |

## 3. Структура репозитория

```
tangleweave-backend/
├── docker-compose.yml           # Главный файл оркестрации
├── .env                         # Секреты (не коммитится!)
│
├── configs/                     # Конфигурации сервисов
│   └── init.sql                 # Инициализация БД
│
├── nakama/                      # Игровой сервер
│   ├── data/                    # Конфиги Nakama
│   │   ├── local.yml           # Локальная конфигурация
│   │   └── rauthy.yml          # OIDC провайдер
│   └── modules/                 # Игровые модули (TypeScript/Lua/Go)
│       ├── analytics.ts        # Отправка событий в Aptabase
│       ├── progress.ts         # Синхронизация прогресса
│       └── rewards.ts          # Система наград
│
├── backoffice-api/              # Микросервис Rust
│   ├── src/
│   │   ├── main.rs             # Точка входа
│   │   ├── routes/             # Axum роуты
│   │   ├── middleware/         # JWT валидация
│   │   ├── models/             # Модели данных
│   │   └── services/           # Бизнес-логика
│   ├── Cargo.toml
│   └── Dockerfile
│
├── backoffice/                  # Фронтенд админ-панели (существующий)
│   ├── server/                  # Rust API сервер
│   └── frontend/                # React SPA
│
└── docs/                        # Документация
    ├── api/                     # OpenAPI схемы
    └── architecture/           # Схемы архитектуры
```

## 4. Компоненты

### 4.1 База данных (PostgreSQL)

**Единый кластер с изолированными базами данных:**

| База данных | Назначение |
|-------------|------------|
| `rauthy_db` | Данные OIDC провайдера |
| `nakama_db` | Данные игрового сервера |
| `aptabase_db` | Аналитические события |
| `backoffice_db` | Бизнес-данные бэк-офиса |

**Init SQL (`configs/init.sql`):**
```sql
CREATE DATABASE rauthy_db;
CREATE DATABASE nakama_db;
CREATE DATABASE aptabase_db;
CREATE DATABASE backoffice_db;
```

**Требования:**
- Контейнеры общаются с БД по внутренней сети `internal`
- Доступ с host защищён строгим паролем из `.env`
- Healthcheck через `pg_isready`

### 4.2 Система авторизации (Rauthy)

**Функции:**
- SSO для игроков (OIDC-клиент для «Unwind: The Magic Atlas»)
- SSO для админов (отдельный клиент с ролями: admin, support)
- Выдача JWT-токенов

#### Bootstrapping (автонастройка)

Rauthy поддерживает мощный механизм **Bootstrapping** — при первом запуске с чистой БД автоматически создаёт админа и API-ключ.

**Что создаётся автоматически:**
- Админ-пользователь: `admin@localhost.de`
- API-ключ: `bootstrap` (с правами на Clients и Roles)

**Настройка в `.env`:**
```bash
BOOTSTRAP_ADMIN_PASSWORD_PLAIN=MySuperSafePassword123!
BOOTSTRAP_API_KEY_SECRET=TwUA2M7RZ8H3FyJHbti2AcMADPDCxDqUKbvi8FDnm3nYidwQx57Wfv6iaVTQynMh
BOOTSTRAP_API_KEY=eyJuYW1lIjoiYm9vdHN0cmFwIiwiYWNjZXNzIjpb...
```

**Инициализация OIDC-клиентов:**
```bash
# После первого запуска Rauthy:
./scripts/init-sso.sh
```

Скрипт создаёт:
| Клиент | Тип | Назначение |
|--------|-----|------------|
| unwind-game | SPA (Public) | Игроки Godot |
| backoffice-admin | SPA (Public) | Админ-панель |
| backoffice-api | Public | Machine-to-machine API |

**Эндпоинты:**
- OIDC Discovery: `/auth/v1/.well-known/openid-configuration`
- JWKS: `/auth/v1/oidc/certs`
- API: `/auth/v1`

**Эндпоинты после настройки:**
```
Админ-панель: https://localhost:8443/admin
SMTP: mailcrab (port 1025)
```

### 4.3 Игровой сервер (Nakama)

**Конфигурация:**
- Отключена базовая email-аутентификация
- Включена валидация JWT от Rauthy
- gRPC для Server-to-Server коммуникации

**RPC Функции:**

| Функция | Описание |
|---------|----------|
| `sync_progress` | Синхронизация прогресса уровней |
| `use_hint` | Запись использования подсказки |
| `complete_level` | Завершение уровня |
| `get_rewards` | Получение наград |
| `claim_reward` | Запрос награды |

**Интеграция с аналитикой:**
```typescript
// Пример отправки события в Aptabase
nakama.rpc(ctx, "send_analytics", JSON.stringify({
  event: "level_completed",
  props: { level_id: 12, hints_used: 1, time_spent: 45 }
}));
```

### 4.4 Продуктовая аналитика (Aptabase)

**Режим:** Self-hosted с PostgreSQL

**Собираемые данные:**
- Сессии (без идентификации пользователей)
- Версии ОС и игры
- Кастомные события из Nakama

**Пример события:**
```json
{
  "eventName": "level_completed",
  "props": {
    "level_id": 12,
    "hints_used": 1,
    "time_spent": 45,
    "difficulty": "hard"
  }
}
```

### 4.5 Бэк-офис API (Rust / Axum)

**Авторизация:** JWT от Rauthy с ролью `admin`

**Эндпоинты:**

| Метод | Путь | Описание |
|-------|------|----------|
| GET | `/api/users` | Список пользователей |
| POST | `/api/users/:id/reward` | Выдать награду |
| POST | `/api/users/:id/ban` | Заблокировать аккаунт |
| GET | `/api/stats` | Статистика игроков |
| POST | `/api/promocodes` | Создать промокод |
| POST | `/api/webhooks/payment` | Платежный вебхук |

**Server-to-Server:**
- Выделенный API-ключ для связи с Nakama (gRPC/HTTP)
- Управление балансом пользователей
- Выдача наград

## 5. Безопасность

### Изоляция сети
```
┌─────────────────────────────────────────────────┐
│              external (публичный)               │
│  :80 Nginx  :7350 Nakama  :8443 Rauthy  :3000   │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│              internal_network (Docker)          │
│                                                 │
│   PostgreSQL (:5432)  │  Aptabase (:5432)      │
│   Nakama gRPC (:7351) │  Backoffice API (:8080)│
└─────────────────────────────────────────────────┘
```

### Управление секретами

Все пароли и ключи передаются через `.env`:
```env
# PostgreSQL
POSTGRES_PASSWORD=secure_random_password

# Rauthy
RAUTHY_SECRET_KEY=...

# Nakama
NAKAMA_API_KEY=...

# Backoffice
BACKOFFICE_ADMIN_KEY=...
```

## 6. Запуск

### Требования
- Docker 20+
- Docker Compose 2+
- OpenSSL (для TLS сертификатов)

### Команда запуска

```bash
# 1. Генерация TLS сертификатов
openssl req -x509 -newkey rsa:4096 \
  -keyout key.pem -out cert.pem \
  -sha256 -days 365 -nodes \
  -subj "/CN=localhost"

# 2. Запуск инфраструктуры
docker-compose up -d

# 3. Проверка статуса
docker-compose ps
```

### Инициализация

1. **Rauthy:** Открыть http://localhost:8443, создать админ-аккаунт
2. **Nakama:** Создать OIDC клиент в Rauthy, настроить `nakama/data/rauthy.yml`
3. **Aptabase:** Открыть http://localhost:3000, настроить первый аккаунт

## 7. Roadmap

| Этап | Статус | Описание |
|------|--------|----------|
| 1. Инфраструктурный фундамент | 🔄 В работе | Docker Compose, PostgreSQL, init.sql |
| 2. Auth-слой | 📋 Планируется | Rauthy, OIDC клиенты, валидация токенов |
| 3. Аналитика | 📋 Планируется | Aptabase, RPC в Nakama |
| 4. Бэк-офис | ✅ Существует | Rust/Axum API |

## 8. Переменные окружения

```env
# ===========================================
# POSTGRESQL
# ===========================================
POSTGRES_USER=tangleweave
POSTGRES_PASSWORD=change_me_in_production

# ===========================================
# RAUTHY (OIDC Provider)
# ===========================================
RAUTHY_DATA_PATH=/app/data
LOCAL_TEST=true
SMTP_URL=mailcrab
SMTP_PORT=1025
SMTP_DANGER_INSECURE=true

# ===========================================
# NAKAMA (Game Server)
# ===========================================
NAKAMA_API_KEY=change_me_in_production
NAKAMA_LICENSE_KEY=your_nakama_license
ODBC_DSN=postgresql://tangleweave:change_me@db:5432/nakama_db

# ===========================================
# APTABASE (Analytics)
# ===========================================
APABASE_DATABASE_URL=postgresql://tangleweave:change_me@db:5432/aptabase_db

# ===========================================
# BACKOFFICE API
# ===========================================
BACKOFFICE_DATABASE_URL=postgresql://tangleweave:change_me@db:5432/backoffice_db
BACKOFFICE_ADMIN_KEY=change_me_in_production
OIDC_ISSUER=https://tangleweave_rauthy:8443
JWKS_URL=https://tangleweave_rauthy:8443/auth/v1/oidc/certs
OIDC_CLIENT_ID=backoffice-api
```
