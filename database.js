const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const Decimal = require('decimal.js');
const logger = require('./utils/logger');

// Configure Decimal.js for financial precision
Decimal.config({ precision: 28, rounding: 4 });

// Create PostgreSQL connection pool
const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'cryptosim',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection with async/await
(async () => {
    try {
        const client = await pool.connect();
        logger.info('Connected to PostgreSQL database');
        client.release();
    } catch (err) {
        logger.error('Error acquiring database client', { 
            error: err.message, 
            stack: err.stack 
        });
    }
})();

/**
 * Create a new user in the database
 * @param {string} username - The username (3-20 characters, alphanumeric)
 * @param {string} password - The plain text password (min 6 characters)
 * @returns {Promise<number>} The created user ID
 * @throws {Error} If user creation fails or username exists
 */
// Initialize database tables for alerts and stop/take profit orders
const initializeAlertTables = async () => {
    try {
        // Create alert_settings table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS alert_settings (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                price_alert_enabled BOOLEAN DEFAULT true,
                price_alert_threshold DECIMAL(5,2) DEFAULT 1.00,
                email_alerts BOOLEAN DEFAULT false,
                browser_alerts BOOLEAN DEFAULT true,
                sound_enabled BOOLEAN DEFAULT true,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(user_id)
            )
        `);

        // Create stop_orders table for stop loss and take profit orders
        await pool.query(`
            CREATE TABLE IF NOT EXISTS stop_orders (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                market VARCHAR(20) NOT NULL,
                position_type VARCHAR(10) NOT NULL,
                order_type VARCHAR(20) NOT NULL,
                trigger_price DECIMAL(20,2) NOT NULL,
                amount DECIMAL(20,8) NOT NULL,
                leverage INTEGER DEFAULT 1,
                status VARCHAR(20) DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                executed_at TIMESTAMP,
                execution_price DECIMAL(20,2),
                CHECK (order_type IN ('stop_loss', 'take_profit')),
                CHECK (position_type IN ('spot', 'long', 'short')),
                CHECK (status IN ('active', 'triggered', 'cancelled', 'expired'))
            )
        `);

        // Create price_alerts table for triggered alerts history
        await pool.query(`
            CREATE TABLE IF NOT EXISTS price_alerts (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                market VARCHAR(20) NOT NULL,
                alert_type VARCHAR(20) NOT NULL,
                previous_price DECIMAL(20,2) NOT NULL,
                current_price DECIMAL(20,2) NOT NULL,
                change_percent DECIMAL(10,2) NOT NULL,
                message TEXT,
                acknowledged BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                CHECK (alert_type IN ('price_spike', 'price_drop', 'stop_loss', 'take_profit'))
            )
        `);

        logger.info('Alert and stop order tables initialized successfully');
    } catch (error) {
        logger.error('Error initializing alert tables', { error: error.message });
    }
};

// Initialize social tables for follow/following functionality
const initializeSocialTables = async () => {
    try {
        // Check if follows table exists and what columns it has
        const tableCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'follows' AND table_schema = 'public'
        `);

        if (tableCheck.rows.length === 0) {
            // Table doesn't exist, create it
            await pool.query(`
                CREATE TABLE follows (
                    id SERIAL PRIMARY KEY,
                    follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(follower_id, followed_id),
                    CHECK (follower_id != followed_id)
                )
            `);
        } else {
            // Table exists, check if it has the correct columns
            const columns = tableCheck.rows.map(row => row.column_name);
            
            if (!columns.includes('followed_id') && columns.includes('following_id')) {
                // Rename following_id to followed_id
                await pool.query(`ALTER TABLE follows RENAME COLUMN following_id TO followed_id`);
                logger.info('Renamed following_id to followed_id in follows table');
            } else if (!columns.includes('followed_id')) {
                // Add the followed_id column if it doesn't exist
                await pool.query(`
                    ALTER TABLE follows ADD COLUMN followed_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
                `);
                logger.info('Added followed_id column to follows table');
            }
        }

        // Create indexes for faster queries
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id)
        `);
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_follows_followed_id ON follows(followed_id)
        `);

        logger.info('Social tables (follows) initialized successfully');
    } catch (error) {
        logger.error('Error initializing social tables', { error: error.message });
    }
};

// Initialize tables on startup
initializeAlertTables();
initializeSocialTables();

const createUser = async (username, password) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const userResult = await client.query(
            'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id',
            [username, hashedPassword]
        );
        
        const userId = userResult.rows[0].id;
        
        // Create initial user data (default to 'real' account)
        await client.query(
            'INSERT INTO user_data (user_id, account_type) VALUES ($1, $2)',
            [userId, 'real']
        );
        
        await client.query('COMMIT');
        return userId;
        
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

/**
 * Authenticate a user with username and password
 * @param {string} username - The username to authenticate
 * @param {string} password - The plain text password
 * @returns {Promise<Object|null>} User object if authentication succeeds, null otherwise
 * @returns {Promise<Object>} returns.id - User ID
 * @returns {Promise<Object>} returns.username - Username
 * @returns {Promise<Object>} returns.created_at - Account creation timestamp
 */
const authenticateUser = async (username, password) => {
    try {
        const result = await pool.query(
            'SELECT * FROM users WHERE username = $1',
            [username]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const user = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password);
        
        return isValidPassword ? user : null;
    } catch (error) {
        throw error;
    }
};

/**
 * Get user data including balances and trading history
 * @param {number} userId - The user ID
 * @returns {Promise<Object|null>} User data object or null if not found
 * @returns {Promise<Object>} returns.usd_balance - USD balance as number
 * @returns {Promise<Object>} returns.btc_balance - BTC balance as number
 * @returns {Promise<Object>} returns.transactions - Array of transaction objects
 * @returns {Promise<Object>} returns.leverage_positions - Array of position objects
 * @returns {Promise<Object>} returns.timezone - User timezone string
 */
const getUserData = async (userId) => {
    try {
        const result = await pool.query(`
            SELECT ud.id, ud.user_id, ud.usd_balance, ud.btc_balance, 
                   ud.transactions, ud.leverage_positions, ud.timezone, 
                   ud.updated_at, ud.role, u.created_at as member_since 
            FROM user_data ud 
            JOIN users u ON ud.user_id = u.id 
            WHERE ud.user_id = $1
        `, [userId]);
        
        if (result.rows.length === 0) {
            return null;
        }
        
        const userData = result.rows[0];
        return {
            ...userData,
            usd_balance: parseFloat(userData.usd_balance),
            btc_balance: parseFloat(userData.btc_balance)
        };
    } catch (error) {
        throw error;
    }
};

const updateUserData = async (userId, data) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        // Add row-level locking to prevent concurrent updates
        await client.query('SELECT * FROM user_data WHERE user_id = $1 FOR UPDATE', [userId]);
        
        await client.query(`
            UPDATE user_data 
            SET usd_balance = $1, btc_balance = $2, transactions = $3, 
                leverage_positions = $4, timezone = $5, role = $6, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = $7
        `, [
            data.usdBalance, 
            data.btcBalance, 
            JSON.stringify(data.transactions || []), 
            JSON.stringify(data.leveragePositions || []), 
            data.timezone || 'UTC',
            data.role || 'user',
            userId
        ]);
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

// Chart settings functions
const saveChartSettings = async (userId, market, settings) => {
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        const { indicators, indicatorSettings, drawings, chartType } = settings;
        
        await client.query(`
            INSERT INTO chart_settings 
            (user_id, market, indicators, indicator_settings, drawings, chart_type)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (user_id, market) 
            DO UPDATE SET 
                indicators = $3,
                indicator_settings = $4,
                drawings = $5,
                chart_type = $6,
                updated_at = CURRENT_TIMESTAMP
        `, [
            userId,
            market,
            JSON.stringify(indicators || {}),
            JSON.stringify(indicatorSettings || {}),
            JSON.stringify(drawings || []),
            chartType || 'candlestick'
        ]);
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const getChartSettings = async (userId, market) => {
    try {
        const result = await pool.query(
            'SELECT * FROM chart_settings WHERE user_id = $1 AND market = $2',
            [userId, market]
        );
        
        if (result.rows.length === 0) {
            return null;
        }
        
        return result.rows[0];
    } catch (error) {
        throw error;
    }
};

const deleteChartSettings = async (userId, market) => {
    try {
        await pool.query(
            'DELETE FROM chart_settings WHERE user_id = $1 AND market = $2',
            [userId, market]
        );
    } catch (error) {
        throw error;
    }
};

// Batch operations
const getUsersByIds = async (userIds) => {
    if (!userIds.length) return [];
    
    try {
        const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
        const result = await pool.query(
            `SELECT * FROM users WHERE id IN (${placeholders})`,
            userIds
        );
        return result.rows;
    } catch (error) {
        throw error;
    }
};

const getUserDataByIds = async (userIds) => {
    if (!userIds.length) return [];
    
    try {
        const placeholders = userIds.map((_, i) => `$${i + 1}`).join(',');
        const result = await pool.query(`
            SELECT ud.*, u.created_at as member_since, u.username 
            FROM user_data ud 
            JOIN users u ON ud.user_id = u.id 
            WHERE ud.user_id IN (${placeholders})
        `, userIds);
        
        return result.rows.map(row => ({
            ...row,
            usd_balance: parseFloat(row.usd_balance),
            btc_balance: parseFloat(row.btc_balance)
        }));
    } catch (error) {
        throw error;
    }
};

// Candles functions for market data
const saveCandles = async (candles, bar) => {
    if (!candles.length) return;
    
    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');
        
        for (const candle of candles) {
            await client.query(`
                INSERT INTO candles (inst_id, bar, timestamp, open, high, low, close, volume, vol_ccy)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                ON CONFLICT (inst_id, bar, timestamp) DO UPDATE SET
                    open = EXCLUDED.open,
                    high = EXCLUDED.high,
                    low = EXCLUDED.low,
                    close = EXCLUDED.close,
                    volume = EXCLUDED.volume,
                    vol_ccy = EXCLUDED.vol_ccy
            `, [
                candle.instId,
                bar,
                candle.timestamp,
                candle.open,
                candle.high,
                candle.low,
                candle.close,
                candle.volume,
                candle.volCcy || 0
            ]);
        }
        
        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }
};

const getCandles = async (instId, bar, limit = 1000) => {
    try {
        // For 1-minute candles, return directly from database
        if (bar === '1m') {
            const result = await pool.query(`
                SELECT * FROM candles 
                WHERE inst_id = $1 AND bar = $2 
                ORDER BY timestamp DESC 
                LIMIT $3
            `, [instId, bar, limit]);
            
            return result.rows.reverse(); // Return in ascending order
        }
        
        // For other timeframes, aggregate from 1-minute candles
        const aggregatedCandles = await getAggregatedCandles(instId, bar, limit);
        return aggregatedCandles;
    } catch (error) {
        throw error;
    }
};

// Aggregate 1-minute candles to create higher timeframe candles
const getAggregatedCandles = async (instId, bar, limit = 1000) => {
    try {
        // Define interval in minutes for each bar type
        const intervalMap = {
            '3m': 3,
            '5m': 5,
            '10m': 10,
            '15m': 15,
            '30m': 30,
            '1H': 60,
            '4H': 240,
            '1D': 1440
        };
        
        const intervalMinutes = intervalMap[bar];
        if (!intervalMinutes) {
            return [];
        }
        
        // Calculate how many 1-minute candles we need
        const minuteCandlesNeeded = limit * intervalMinutes;
        
        // Get 1-minute candles from database
        const result = await pool.query(`
            SELECT * FROM candles 
            WHERE inst_id = $1 AND bar = '1m'
            ORDER BY timestamp DESC 
            LIMIT $2
        `, [instId, minuteCandlesNeeded]);
        
        if (result.rows.length === 0) {
            return [];
        }
        
        // Sort by timestamp ascending for aggregation
        const minuteCandles = result.rows.reverse();
        
        // Aggregate candles by time intervals
        const aggregatedCandles = [];
        const intervalMs = intervalMinutes * 60 * 1000;
        
        // Group candles by time intervals
        const candleGroups = new Map();
        
        for (const candle of minuteCandles) {
            const candleTime = parseInt(candle.timestamp);
            let intervalStart;
            
            if (bar === '1D') {
                // For daily candles, align to UTC midnight
                const date = new Date(candleTime);
                date.setUTCHours(0, 0, 0, 0);
                intervalStart = date.getTime();
            } else {
                // For other intervals, use regular interval calculation
                intervalStart = Math.floor(candleTime / intervalMs) * intervalMs;
            }
            
            if (!candleGroups.has(intervalStart)) {
                candleGroups.set(intervalStart, []);
            }
            candleGroups.get(intervalStart).push(candle);
        }
        
        // Convert groups to aggregated candles
        for (const [intervalStart, candlesInInterval] of candleGroups) {
            if (candlesInInterval.length === 0) continue;
            
            // Sort candles in this interval by timestamp
            candlesInInterval.sort((a, b) => a.timestamp - b.timestamp);
            
            const firstCandle = candlesInInterval[0];
            const lastCandle = candlesInInterval[candlesInInterval.length - 1];
            
            const aggregated = {
                inst_id: instId,
                bar: bar,
                timestamp: intervalStart,
                open: parseFloat(firstCandle.open),
                high: Math.max(...candlesInInterval.map(c => parseFloat(c.high))),
                low: Math.min(...candlesInInterval.map(c => parseFloat(c.low))),
                close: parseFloat(lastCandle.close),
                volume: candlesInInterval.reduce((sum, c) => sum + parseFloat(c.volume || 0), 0),
                vol_ccy: candlesInInterval.reduce((sum, c) => sum + parseFloat(c.vol_ccy || 0), 0)
            };
            
            aggregatedCandles.push(aggregated);
        }
        
        // Sort by timestamp and limit results
        aggregatedCandles.sort((a, b) => a.timestamp - b.timestamp);
        
        // Limit the result
        return aggregatedCandles.slice(-limit);
    } catch (error) {
        console.error('Error aggregating candles:', error);
        throw error;
    }
};

const getAllStoredCandles = async (instId, bar) => {
    try {
        const result = await pool.query(`
            SELECT * FROM candles 
            WHERE inst_id = $1 AND bar = $2 
            ORDER BY timestamp ASC
        `, [instId, bar]);
        
        return result.rows;
    } catch (error) {
        throw error;
    }
};

// Chat functions
const saveChatMessage = async (userId, username, message, messageType = 'message', metadata = null) => {
    try {
        const result = await pool.query(`
            INSERT INTO chat_messages (user_id, username, message, message_type, metadata) 
            VALUES ($1, $2, $3, $4, $5) 
            RETURNING id, user_id, username, message, message_type, metadata, created_at
        `, [userId, username, message, messageType, metadata]);
        
        return result.rows[0];
    } catch (error) {
        logger.error('Error saving chat message', { userId, username, error: error.message });
        throw error;
    }
};

const getChatHistory = async (limit = 50) => {
    try {
        const result = await pool.query(`
            SELECT id, user_id, username, message, message_type, metadata, created_at 
            FROM chat_messages 
            ORDER BY created_at DESC 
            LIMIT $1
        `, [limit]);
        
        return result.rows.reverse(); // Reverse to get chronological order
    } catch (error) {
        logger.error('Error getting chat history', { limit, error: error.message });
        throw error;
    }
};

const deleteChatMessage = async (messageId, userId) => {
    try {
        const result = await pool.query(`
            DELETE FROM chat_messages 
            WHERE id = $1 AND user_id = $2 
            RETURNING id
        `, [messageId, userId]);
        
        return result.rowCount > 0;
    } catch (error) {
        logger.error('Error deleting chat message', { messageId, userId, error: error.message });
        throw error;
    }
};

// Initialize chat messages table
const initializeChatTable = async () => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS chat_messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                username VARCHAR(50) NOT NULL,
                message TEXT NOT NULL,
                message_type VARCHAR(20) DEFAULT 'message',
                metadata JSONB,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        
        // Create index for faster queries
        await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at 
            ON chat_messages(created_at DESC)
        `);
        
        logger.info('Chat messages table initialized');
    } catch (error) {
        logger.error('Error initializing chat table', { error: error.message });
    }
};

// Call initialization on startup
initializeChatTable();

// Ranking system functions
/**
 * Get trading rankings (excluding demo accounts)
 * @param {number} [limit=50] - Number of top users to return
 * @returns {Promise<Array>} Array of user rankings with stats
 */
const getRankings = async (limit = 50) => {
    try {
        // First, check if account_type column exists
        const columnCheck = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_data' AND column_name = 'account_type'
        `);
        
        const hasAccountType = columnCheck.rows.length > 0;
        
        // Use simpler query that works without account_type column
        const result = await pool.query(`
            WITH user_stats AS (
                SELECT 
                    u.id,
                    u.username,
                    COALESCE(ud.usd_balance, 10000) as usd_balance,
                    COALESCE(ud.btc_balance, 0) as btc_balance,
                    COALESCE(ud.transactions, '[]'::jsonb) as transactions,
                    COALESCE(ud.leverage_positions, '[]'::jsonb) as leverage_positions,
                    u.created_at as member_since
                FROM users u
                LEFT JOIN user_data ud ON u.id = ud.user_id
                ${hasAccountType ? "WHERE COALESCE(ud.account_type, 'real') = 'real'" : ""}
            ),
            calculated_stats AS (
                SELECT 
                    us.id,
                    us.username,
                    us.usd_balance,
                    us.btc_balance,
                    us.member_since,
                    -- Calculate total asset value (use fixed BTC price for now)
                    (us.usd_balance + (us.btc_balance * 50000)) as total_assets,
                    -- Calculate ROI based on initial $10,000
                    ((us.usd_balance + (us.btc_balance * 50000) - 10000) / 10000 * 100) as roi,
                    -- Calculate trading statistics
                    jsonb_array_length(us.transactions) as total_trades,
                    -- Simple win rate calculation (placeholder)
                    CASE 
                        WHEN jsonb_array_length(us.transactions) > 0 
                        THEN (
                            SELECT COUNT(*)::float / jsonb_array_length(us.transactions) * 100
                            FROM jsonb_array_elements(us.transactions) as txn
                            WHERE COALESCE((txn->>'pnl')::float, 0) > 0
                        )
                        ELSE 0
                    END as win_rate
                FROM user_stats us
            )
            SELECT 
                id,
                username,
                total_assets,
                roi,
                total_trades,
                COALESCE(win_rate, 0) as win_rate,
                member_since,
                ROW_NUMBER() OVER (ORDER BY roi DESC, total_assets DESC) as rank
            FROM calculated_stats
            WHERE total_trades > 0 OR total_assets != 10000
            ORDER BY roi DESC, total_assets DESC
            LIMIT $1
        `, [limit]);
        
        return result.rows;
    } catch (error) {
        logger.error('Error fetching rankings', { error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Get specific user ranking and stats
 * @param {number} userId - User ID to get ranking for
 * @returns {Promise<Object|null>} User ranking data or null
 */
const getUserRanking = async (userId) => {
    try {
        // Get all rankings first
        const allRankings = await getRankings(100);
        
        // Find the user in the rankings
        const userRanking = allRankings.find(ranking => ranking.id === userId);
        
        if (!userRanking) {
            return null;
        }
        
        return userRanking;
    } catch (error) {
        logger.error('Error fetching user ranking', { userId, error: error.message, stack: error.stack });
        throw error;
    }
};

/**
 * Update user account type
 * @param {number} userId - User ID
 * @param {'real'|'demo'} accountType - Account type
 * @returns {Promise<boolean>} Success status
 */
const updateAccountType = async (userId, accountType) => {
    try {
        const result = await pool.query(
            'UPDATE user_data SET account_type = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
            [accountType, userId]
        );
        
        return result.rowCount > 0;
    } catch (error) {
        logger.error('Error updating account type', { userId, accountType, error: error.message });
        throw error;
    }
};

/**
 * Initialize account_type column if it doesn't exist
 */
const initializeAccountTypeColumn = async () => {
    try {
        // Check if account_type column exists
        const columnExists = await pool.query(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'user_data' AND column_name = 'account_type'
        `);
        
        if (columnExists.rows.length === 0) {
            // Add account_type column
            await pool.query(`
                ALTER TABLE user_data 
                ADD COLUMN account_type VARCHAR(10) DEFAULT 'real'
            `);
            
            logger.info('Added account_type column to user_data table');
        }
    } catch (error) {
        logger.error('Error initializing account_type column', { error: error.message });
    }
};

// Initialize account_type column on startup
initializeAccountTypeColumn();

// Graceful shutdown
const closePool = async () => {
    await pool.end();
    logger.info('PostgreSQL pool has ended');
};

/**
 * Get user alert settings
 * @param {number} userId - User ID
 * @returns {Promise<Object|null>} Alert settings or null
 */
const getAlertSettings = async (userId) => {
    try {
        const result = await pool.query(
            'SELECT * FROM alert_settings WHERE user_id = $1',
            [userId]
        );
        
        if (result.rows.length === 0) {
            // Create default settings if not exists
            const insertResult = await pool.query(
                `INSERT INTO alert_settings (user_id) VALUES ($1) 
                 RETURNING *`,
                [userId]
            );
            return insertResult.rows[0];
        }
        
        return result.rows[0];
    } catch (error) {
        logger.error('Error getting alert settings', { userId, error: error.message });
        throw error;
    }
};

/**
 * Update user alert settings
 * @param {number} userId - User ID
 * @param {Object} settings - Alert settings to update
 * @returns {Promise<boolean>} Success status
 */
const updateAlertSettings = async (userId, settings) => {
    try {
        const {
            price_alert_enabled,
            price_alert_threshold,
            email_alerts,
            browser_alerts,
            sound_enabled
        } = settings;
        
        await pool.query(
            `INSERT INTO alert_settings 
                (user_id, price_alert_enabled, price_alert_threshold, 
                 email_alerts, browser_alerts, sound_enabled)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (user_id)
             DO UPDATE SET 
                price_alert_enabled = $2,
                price_alert_threshold = $3,
                email_alerts = $4,
                browser_alerts = $5,
                sound_enabled = $6,
                updated_at = CURRENT_TIMESTAMP`,
            [userId, price_alert_enabled, price_alert_threshold,
             email_alerts, browser_alerts, sound_enabled]
        );
        
        return true;
    } catch (error) {
        logger.error('Error updating alert settings', { userId, error: error.message });
        throw error;
    }
};

/**
 * Create stop loss or take profit order
 * @param {Object} orderData - Order data
 * @returns {Promise<number>} Created order ID
 */
const createStopOrder = async (orderData) => {
    try {
        const {
            user_id,
            market,
            position_type,
            order_type,
            trigger_price,
            amount,
            leverage = 1
        } = orderData;
        
        const result = await pool.query(
            `INSERT INTO stop_orders 
                (user_id, market, position_type, order_type, 
                 trigger_price, amount, leverage)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [user_id, market, position_type, order_type, 
             trigger_price, amount, leverage]
        );
        
        return result.rows[0].id;
    } catch (error) {
        logger.error('Error creating stop order', { error: error.message });
        throw error;
    }
};

/**
 * Get active stop orders for user
 * @param {number} userId - User ID
 * @param {string} [market] - Optional market filter
 * @returns {Promise<Array>} Array of stop orders
 */
const getActiveStopOrders = async (userId, market = null) => {
    try {
        let query = 'SELECT * FROM stop_orders WHERE user_id = $1 AND status = $2';
        const params = [userId, 'active'];
        
        if (market) {
            query += ' AND market = $3';
            params.push(market);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const result = await pool.query(query, params);
        return result.rows;
    } catch (error) {
        logger.error('Error getting stop orders', { userId, error: error.message });
        throw error;
    }
};

/**
 * Cancel stop order
 * @param {number} orderId - Order ID
 * @param {number} userId - User ID for security
 * @returns {Promise<boolean>} Success status
 */
const cancelStopOrder = async (orderId, userId) => {
    try {
        const result = await pool.query(
            `UPDATE stop_orders 
             SET status = 'cancelled'
             WHERE id = $1 AND user_id = $2 AND status = 'active'
             RETURNING id`,
            [orderId, userId]
        );
        
        return result.rows.length > 0;
    } catch (error) {
        logger.error('Error cancelling stop order', { orderId, userId, error: error.message });
        throw error;
    }
};

/**
 * Execute stop order
 * @param {number} orderId - Order ID
 * @param {number} executionPrice - Execution price
 * @returns {Promise<Object|null>} Executed order data or null
 */
const executeStopOrder = async (orderId, executionPrice) => {
    try {
        const result = await pool.query(
            `UPDATE stop_orders 
             SET status = 'triggered',
                 executed_at = CURRENT_TIMESTAMP,
                 execution_price = $2
             WHERE id = $1 AND status = 'active'
             RETURNING *`,
            [orderId, executionPrice]
        );
        
        return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
        logger.error('Error executing stop order', { orderId, error: error.message });
        throw error;
    }
};

/**
 * Save price alert
 * @param {Object} alertData - Alert data
 * @returns {Promise<number>} Created alert ID
 */
const savePriceAlert = async (alertData) => {
    try {
        const {
            user_id,
            market,
            alert_type,
            previous_price,
            current_price,
            change_percent,
            message
        } = alertData;
        
        const result = await pool.query(
            `INSERT INTO price_alerts 
                (user_id, market, alert_type, previous_price, 
                 current_price, change_percent, message)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             RETURNING id`,
            [user_id, market, alert_type, previous_price,
             current_price, change_percent, message]
        );
        
        return result.rows[0].id;
    } catch (error) {
        logger.error('Error saving price alert', { error: error.message });
        throw error;
    }
};

/**
 * Get unacknowledged alerts for user
 * @param {number} userId - User ID
 * @returns {Promise<Array>} Array of alerts
 */
const getUnacknowledgedAlerts = async (userId) => {
    try {
        const result = await pool.query(
            `SELECT * FROM price_alerts 
             WHERE user_id = $1 AND acknowledged = false
             ORDER BY created_at DESC
             LIMIT 10`,
            [userId]
        );
        
        return result.rows;
    } catch (error) {
        logger.error('Error getting unacknowledged alerts', { userId, error: error.message });
        throw error;
    }
};

/**
 * Acknowledge alerts
 * @param {number} userId - User ID
 * @param {Array<number>} alertIds - Alert IDs to acknowledge
 * @returns {Promise<boolean>} Success status
 */
const acknowledgeAlerts = async (userId, alertIds) => {
    try {
        await pool.query(
            `UPDATE price_alerts 
             SET acknowledged = true
             WHERE user_id = $1 AND id = ANY($2)`,
            [userId, alertIds]
        );
        
        return true;
    } catch (error) {
        logger.error('Error acknowledging alerts', { userId, error: error.message });
        throw error;
    }
};

// Social functions for follow/following functionality
/**
 * Follow a user
 * @param {number} followerId - ID of the user who wants to follow
 * @param {number} followedId - ID of the user to be followed
 * @returns {Promise<boolean>} Success status
 */
const followUser = async (followerId, followedId) => {
    try {
        if (followerId === followedId) {
            throw new Error('Cannot follow yourself');
        }

        await pool.query(
            'INSERT INTO follows (follower_id, followed_id) VALUES ($1, $2)',
            [followerId, followedId]
        );
        
        return true;
    } catch (error) {
        if (error.code === '23505') { // unique constraint violation
            throw new Error('Already following this user');
        }
        logger.error('Error following user', { followerId, followedId, error: error.message });
        throw error;
    }
};

/**
 * Unfollow a user
 * @param {number} followerId - ID of the user who wants to unfollow
 * @param {number} followedId - ID of the user to be unfollowed
 * @returns {Promise<boolean>} Success status
 */
const unfollowUser = async (followerId, followedId) => {
    try {
        const result = await pool.query(
            'DELETE FROM follows WHERE follower_id = $1 AND followed_id = $2',
            [followerId, followedId]
        );
        
        return result.rowCount > 0;
    } catch (error) {
        logger.error('Error unfollowing user', { followerId, followedId, error: error.message });
        throw error;
    }
};

/**
 * Check if user is following another user
 * @param {number} followerId - ID of the potential follower
 * @param {number} followedId - ID of the potentially followed user
 * @returns {Promise<boolean>} Whether the user is following
 */
const isFollowing = async (followerId, followedId) => {
    try {
        const result = await pool.query(
            'SELECT 1 FROM follows WHERE follower_id = $1 AND followed_id = $2',
            [followerId, followedId]
        );
        
        return result.rowCount > 0;
    } catch (error) {
        logger.error('Error checking follow status', { followerId, followedId, error: error.message });
        throw error;
    }
};

/**
 * Get users that a user is following
 * @param {number} userId - User ID
 * @param {number} [limit=50] - Maximum number of results
 * @returns {Promise<Array>} Array of followed user data
 */
const getFollowing = async (userId, limit = 50) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id, u.username, u.created_at,
                ud.usd_balance, ud.btc_balance,
                f.created_at as followed_at
            FROM follows f
            JOIN users u ON f.followed_id = u.id
            LEFT JOIN user_data ud ON u.id = ud.user_id
            WHERE f.follower_id = $1
            ORDER BY f.created_at DESC
            LIMIT $2
        `, [userId, limit]);
        
        return result.rows.map(row => ({
            ...row,
            usd_balance: parseFloat(row.usd_balance || 10000),
            btc_balance: parseFloat(row.btc_balance || 0)
        }));
    } catch (error) {
        logger.error('Error getting following list', { userId, error: error.message });
        throw error;
    }
};

/**
 * Get users that follow a user (followers)
 * @param {number} userId - User ID
 * @param {number} [limit=50] - Maximum number of results
 * @returns {Promise<Array>} Array of follower user data
 */
const getFollowers = async (userId, limit = 50) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.id, u.username, u.created_at,
                ud.usd_balance, ud.btc_balance,
                f.created_at as followed_at
            FROM follows f
            JOIN users u ON f.follower_id = u.id
            LEFT JOIN user_data ud ON u.id = ud.user_id
            WHERE f.followed_id = $1
            ORDER BY f.created_at DESC
            LIMIT $2
        `, [userId, limit]);
        
        return result.rows.map(row => ({
            ...row,
            usd_balance: parseFloat(row.usd_balance || 10000),
            btc_balance: parseFloat(row.btc_balance || 0)
        }));
    } catch (error) {
        logger.error('Error getting followers list', { userId, error: error.message });
        throw error;
    }
};

/**
 * Get follow statistics for a user
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Follow statistics
 */
const getFollowStats = async (userId) => {
    try {
        const followingResult = await pool.query(
            'SELECT COUNT(*) as count FROM follows WHERE follower_id = $1',
            [userId]
        );
        
        const followersResult = await pool.query(
            'SELECT COUNT(*) as count FROM follows WHERE followed_id = $1',
            [userId]
        );
        
        return {
            following: parseInt(followingResult.rows[0].count),
            followers: parseInt(followersResult.rows[0].count)
        };
    } catch (error) {
        logger.error('Error getting follow stats', { userId, error: error.message });
        throw error;
    }
};

/**
 * Get recent transactions from followed users (with 10-minute delay)
 * @param {number} userId - User ID requesting the data
 * @param {number} [limit=20] - Maximum number of transactions
 * @returns {Promise<Array>} Array of transaction data from followed users
 */
const getFollowedUserTransactions = async (userId, limit = 20) => {
    try {
        const result = await pool.query(`
            SELECT 
                u.username,
                txn.transaction_data,
                u.id as user_id,
                txn.tx_timestamp
            FROM follows f
            JOIN users u ON f.followed_id = u.id
            JOIN user_data ud ON u.id = ud.user_id
            JOIN LATERAL (
                SELECT 
                    jsonb_array_elements(ud.transactions) as transaction_data,
                    (jsonb_array_elements(ud.transactions)->>'timestamp')::bigint as tx_timestamp
                FROM user_data
                WHERE user_id = u.id AND transactions != '[]'::jsonb
            ) txn(transaction_data, tx_timestamp) ON true
            WHERE f.follower_id = $1
            AND txn.tx_timestamp <= EXTRACT(EPOCH FROM (NOW() - INTERVAL '10 minutes')) * 1000
            ORDER BY txn.tx_timestamp DESC
            LIMIT $2
        `, [userId, limit]);
        
        return result.rows.map(row => ({
            username: row.username,
            user_id: row.user_id,
            transaction: row.transaction_data,
            timestamp: row.tx_timestamp
        }));
    } catch (error) {
        logger.error('Error getting followed user transactions', { userId, error: error.message });
        throw error;
    }
};

process.on('SIGINT', closePool);
process.on('SIGTERM', closePool);

module.exports = {
    pool,
    createUser,
    authenticateUser,
    getUserData,
    updateUserData,
    saveChartSettings,
    getChartSettings,
    deleteChartSettings,
    getUsersByIds,
    getUserDataByIds,
    // Market data functions
    saveCandles,
    getCandles,
    getAllStoredCandles,
    // Chat functions
    saveChatMessage,
    getChatHistory,
    deleteChatMessage,
    // Ranking functions
    getRankings,
    getUserRanking,
    updateAccountType,
    // Alert functions
    getAlertSettings,
    updateAlertSettings,
    createStopOrder,
    getActiveStopOrders,
    cancelStopOrder,
    executeStopOrder,
    savePriceAlert,
    getUnacknowledgedAlerts,
    acknowledgeAlerts,
    // Social functions
    followUser,
    unfollowUser,
    isFollowing,
    getFollowing,
    getFollowers,
    getFollowStats,
    getFollowedUserTransactions,
    closePool
};