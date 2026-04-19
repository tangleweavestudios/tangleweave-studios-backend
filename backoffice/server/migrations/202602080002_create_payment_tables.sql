CREATE TABLE IF NOT EXISTS payment_webhooks (
    id SERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS promocodes (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    reward_type TEXT NOT NULL,
    reward_amount INTEGER NOT NULL,
    max_uses INTEGER DEFAULT 1,
    current_uses INTEGER DEFAULT 0,
    expires_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processed ON payment_webhooks(processed);
CREATE INDEX IF NOT EXISTS idx_promocodes_code ON promocodes(code);
