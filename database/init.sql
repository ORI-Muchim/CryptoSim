-- CryptoSim PostgreSQL Database Schema
-- Drop tables if they exist (for fresh start)
DROP TABLE IF EXISTS chart_settings CASCADE;
DROP TABLE IF EXISTS user_data CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Create users table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create user_data table
CREATE TABLE user_data (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    usd_balance DECIMAL(15,2) DEFAULT 10000.00 CHECK (usd_balance >= 0),
    btc_balance DECIMAL(15,8) DEFAULT 0 CHECK (btc_balance >= 0),
    transactions JSONB DEFAULT '[]'::jsonb,
    leverage_positions JSONB DEFAULT '[]'::jsonb,
    timezone VARCHAR(50) DEFAULT 'UTC',
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create chart_settings table
CREATE TABLE chart_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market VARCHAR(50) NOT NULL,
    indicators JSONB DEFAULT '{}'::jsonb,
    indicator_settings JSONB DEFAULT '{}'::jsonb,
    drawings JSONB DEFAULT '[]'::jsonb,
    chart_type VARCHAR(50) DEFAULT 'candlestick',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, market)
);

-- Create indexes for better performance
CREATE INDEX idx_users_username ON users(username);
CREATE INDEX idx_user_data_user_id ON user_data(user_id);
CREATE INDEX idx_chart_settings_user_market ON chart_settings(user_id, market);

-- Create update trigger for updated_at columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_user_data_updated_at BEFORE UPDATE ON user_data
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_chart_settings_updated_at BEFORE UPDATE ON chart_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Market data tables
DROP TABLE IF EXISTS candles CASCADE;

CREATE TABLE candles (
    id SERIAL PRIMARY KEY,
    inst_id VARCHAR(20) NOT NULL,
    bar VARCHAR(10) NOT NULL,
    timestamp BIGINT NOT NULL,
    open DECIMAL(20,8) NOT NULL,
    high DECIMAL(20,8) NOT NULL,
    low DECIMAL(20,8) NOT NULL,
    close DECIMAL(20,8) NOT NULL,
    volume DECIMAL(20,8) NOT NULL,
    vol_ccy DECIMAL(20,8) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(inst_id, bar, timestamp)
);

-- Create indexes for candles table
CREATE INDEX idx_candles_inst_bar_time ON candles(inst_id, bar, timestamp DESC);
CREATE INDEX idx_candles_timestamp ON candles(timestamp DESC);

-- Add some initial data for testing (optional)
-- INSERT INTO users (username, password) VALUES ('admin', '$2b$10$...');