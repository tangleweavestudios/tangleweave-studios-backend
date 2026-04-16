# TangleWeaveStudios - Описание проекта

## Обзор

**TangleWeaveStudios** — это полнофункциональное веб-приложение с архитектурой микросервисов, построенное на Rust (бэкенд) и React (фронтенд). Проект включает систему администрирования (backoffice) с аутентификацией через OIDC (Rauthy) и маршрутизацией через Sōzu.

## Архитектура

```
┌─────────────────────────────────────────────────────────────────┐
│                         Sōzu (Reverse Proxy)                     │
│                    http://localhost:80                          │
└────────────────────┬────────────────────┬───────────────────────┘
                     │                    │                      │
              /api/*               /auth/*              /*
             │                    │                    │
    ┌────────▼────────┐    ┌──────▼──────┐    ┌───────▼───────┐
    │  Backoffice    │    │   Rauthy    │    │   Frontend    │
    │  Server (Rust) │    │  (OIDC)     │    │  (React/Vite) │
    │   :3000        │    │   :8443     │    │    :3000      │
    └───────┬────────┘    └─────────────┘    └───────────────┘
            │
            │         PostgreSQL (:5432)
            ▼
```

## Структура проекта

```
tangleweavestudios/
├── app/                      # Основное приложение (заготовка)
│   ├── client/               # Клиент app (заготовка)
│   └── server/               # Сервер app (заготовка)
│
├── backoffice/               # Админ-панель
│   ├── client/               # Клиентская библиотека (Rust)
│   ├── server/               # API сервер (Rust/Axum)
│   │   ├── src/
│   │   │   ├── main.rs       # Точка входа, роутинг
│   │   │   ├── handlers.rs   # HTTP обработчики
│   │   │   ├── auth.rs       # OIDC/JWT аутентификация
│   │   │   └── models.rs     # Модели данных
│   │   └── migrations/       # Миграции БД
│   │
│   └── frontend/             # React SPA
│       ├── src/
│       │   ├── api/          # OpenAPI сгенерированные модели
│       │   ├── components/  # React компоненты
│       │   ├── contexts/     # React Context (Auth)
│       │   ├── pages/        # Страницы
│       │   ├── routes/      # Защищённые маршруты
│       │   └── App.tsx      # Главный компонент
│       ├── package.json     # Vite + React + MUI
│       ├── vite.config.ts   # Конфигурация Vite
│       └── Dockerfile       # Multi-stage сборка
│
├── shared/                  # Общие библиотеки
│   ├── models/              # Общие модели данных
│   ├── protocol/            # Протоколы/интерфейсы
│   └── utils/               # Утилиты
│
├── infrastructure/           # Docker-инфраструктура
│   ├── docker-compose.yml   # Все сервисы
│   ├── Dockerfile           # Сборка Rust сервера
│   └── sozu/                # Конфигурация Sōzu
│       └── sozu.toml        # Правила маршрутизации
│
├── Cargo.toml               # Workspace конфигурация
├── Cargo.lock               # Зависимости Rust
├── Dockerfile               # Multi-stage сборка Rust
└── readme.md               # Пароли (удалить!)
```

## Технологический стек

### Backend (Rust)

| Компонент | Версия | Назначение |
|-----------|--------|------------|
| tokio | 1.49.0 | Асинхронная.runtime |
| axum | 0.8.8 | Веб-фреймворк |
| sqlx | 0.8.6 | Работа с PostgreSQL |
| jsonwebtoken | 10.3.0 | JWT валидация |
| tower-http | 0.6.8 | HTTP middleware |

### Frontend (React)

| Компонент | Версия | Назначение |
|-----------|--------|------------|
| react | 18.2.0 | UI фреймворк |
| vite | 7.3.1 | Сборщик |
| @mui/material | 5.15.6 | UI компоненты |
| oidc-client-ts | 3.0.1 | OIDC клиент |
| axios | 1.6.7 | HTTP клиент |

### Инфраструктура

| Сервис | Версия | Назначение |
|--------|--------|------------|
| Sōzu | latest | Обратный прокси |
| PostgreSQL | 15-alpine | База данных |
| Rauthy | 0.34.3 | OIDC провайдер |
| Node.js | 20 | Сборка фронтенда |

## Компоненты

### 1. Backoffice Server (Rust)

**Функции:**
- REST API для управления пользователями
- JWT аутентификация через Rauthy
- PostgreSQL для хранения данных

**Эндпоинты:**
- `POST /users` — создание пользователя
- `GET /users` — получение списка пользователей
- `GET /health` — проверка здоровья
- `GET /auth/config` — OIDC конфигурация

**Middleware:**
- JWT валидация через `auth_middleware`
- Извлечение claims из токена
- Логирование запросов

### 2. Backoffice Frontend (React)

**Страницы:**
- `/login` — вход через OIDC
- `/callback` — обработка callback от OIDC
- `/users` — управление пользователями
- `/products` — управление продуктами
- `/orders` — управление заказами

**Компоненты:**
- `Layout` — основная структура с sidebar
- `DataTable` — таблицы с данными
- `EditForm` — формы редактирования
- `ProtectedRoute` — защита маршрутов

**Аутентификация:**
- OIDC Authorization Code Flow с PKCE
- Хранение токенов в sessionStorage
- Автоматическое обновление токенов

### 3. Rauthy (OIDC Provider)

**Функции:**
- Управление пользователями
- Аутентификация через OAuth2/OIDC
- Выдача JWT токенов

**Настройка:**
- Админ: http://localhost/auth
- SMTP: mailcrab (порт 8081)
- Client: backoffice-frontend (SPA)

### 4. Sōzu (Reverse Proxy)

**Маршрутизация:**
| Путь | Цель |
|------|------|
| `/` | Frontend (SPA) |
| `/api/*` | Backoffice API |
| `/auth/*` | Rauthy |
| `/callback` | Frontend (OIDC) |

## Запуск

### Требования
- Docker
- Docker Compose

### Сборка и запуск

```bash
cd infrastructure
docker-compose up --build
```

### Доступ

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost |
| API | http://localhost/api |
| Rauthy | http://localhost/auth |
| Mailcrab | http://localhost:8081 |

## Настройка Rauthy

1. Открыть http://localhost/auth
2. Создать админ-аккаунт (письмо придёт в mailcrab)
3. Создать клиента:
   - **Имя**: backoffice-frontend
   - **Тип**: SPA (Public)
   - **Redirect URIs**: http://localhost/callback
   - **Flows**: Authorization Code
   - **Token Endpoint Auth**: PKCE (S256)

## Переменные окружения

### Frontend (.env)
```
VITE_OIDC_AUTHORITY=http://localhost/auth
VITE_OIDC_CLIENT_ID=backoffice-frontend
VITE_OIDC_REDIRECT_URI=http://localhost/callback
VITE_API_URL=http://localhost/api
```

### Backend (docker-compose)
```
DATABASE_URL=postgres://user:pass@db:5432/backoffice_db
JWKS_URL=http://rauthy:8443/jwks
OIDC_ISSUER=http://rauthy:8443
OIDC_CLIENT_ID=backoffice-frontend
OIDC_REDIRECT_URI=http://localhost/callback
```

## Сборка

### Rust (вручную)
```bash
cargo build --release -p tangleweavestudios-backoffice-server
```

### Frontend (вручную)
```bash
cd backoffice/frontend
npm install
npm run build
```

## Разработка

### Backend
```bash
cd backoffice/server
cargo run
```

### Frontend
```bash
cd backoffice/frontend
npm run dev
```

## TODO

- [ ] App приложение (основное)
- [ ] WebSocket поддержка
- [ ] Мониторинг и метрики
- [ ] CI/CD
- [ ] Тесты