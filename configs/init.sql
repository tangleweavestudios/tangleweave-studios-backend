-- TangleWeave Studios Database Initialization
-- Phase 2: Production Readiness

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Note: Tables are created by applications themselves via migrations
-- - Nakama: creates its tables on startup
-- - Rauthy: manages its own schema
-- - Backoffice API: manages its own tables
-- - Aptabase: manages its own tables
