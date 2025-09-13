const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, 'trading.db'));

// Enable foreign key constraints
db.run('PRAGMA foreign_keys = ON');

// Initialize database tables
db.serialize(() => {
    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // User data table
    db.run(`
        CREATE TABLE IF NOT EXISTS user_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            usd_balance REAL DEFAULT 10000 CHECK (usd_balance >= 0),
            btc_balance REAL DEFAULT 0 CHECK (btc_balance >= 0),
            transactions TEXT DEFAULT '[]',
            leverage_positions TEXT DEFAULT '[]',
            timezone TEXT DEFAULT 'UTC',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
        )
    `);
    
    // Add timezone column to existing user_data table if it doesn't exist
    db.run(`ALTER TABLE user_data ADD COLUMN timezone TEXT DEFAULT 'UTC'`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding timezone column:', err);
        }
    });

    // Add role column to existing user_data table if it doesn't exist
    db.run(`ALTER TABLE user_data ADD COLUMN role TEXT DEFAULT 'user'`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
            console.error('Error adding role column:', err);
        }
    });

    // Chart settings table
    db.run(`
        CREATE TABLE IF NOT EXISTS chart_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            market TEXT NOT NULL,
            indicators TEXT DEFAULT '{}',
            indicator_settings TEXT DEFAULT '{}',
            drawings TEXT DEFAULT '[]',
            chart_type TEXT DEFAULT 'candlestick',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
            UNIQUE(user_id, market)
        )
    `);
});

// User functions
const createUser = (username, password) => {
    return new Promise((resolve, reject) => {
        bcrypt.hash(password, 10, (err, hash) => {
            if (err) return reject(err);
            
            // Use transaction for atomic user creation
            db.serialize(() => {
                db.run('BEGIN TRANSACTION');
                
                db.run(
                    'INSERT INTO users (username, password) VALUES (?, ?)',
                    [username, hash],
                    function(err) {
                        if (err) {
                            db.run('ROLLBACK');
                            return reject(err);
                        }
                        
                        const userId = this.lastID;
                        // Create initial user data
                        db.run(
                            'INSERT INTO user_data (user_id) VALUES (?)',
                            [userId],
                            (err) => {
                                if (err) {
                                    db.run('ROLLBACK');
                                    return reject(err);
                                }
                                
                                db.run('COMMIT', (err) => {
                                    if (err) return reject(err);
                                    resolve(userId);
                                });
                            }
                        );
                    }
                );
            });
        });
    });
};

const authenticateUser = (username, password) => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM users WHERE username = ?',
            [username],
            (err, user) => {
                if (err) return reject(err);
                if (!user) return resolve(null);
                
                bcrypt.compare(password, user.password, (err, result) => {
                    if (err) return reject(err);
                    resolve(result ? user : null);
                });
            }
        );
    });
};

const getUserData = (userId) => {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT ud.id, ud.user_id, ud.usd_balance, ud.btc_balance, 
                    ud.transactions, ud.leverage_positions, ud.timezone, 
                    ud.updated_at, ud.role, u.created_at as member_since 
             FROM user_data ud 
             JOIN users u ON ud.user_id = u.id 
             WHERE ud.user_id = ?`,
            [userId],
            (err, data) => {
                if (err) return reject(err);
                if (data) {
                    data.transactions = JSON.parse(data.transactions);
                    data.leverage_positions = JSON.parse(data.leverage_positions);
                }
                resolve(data);
            }
        );
    });
};

const updateUserData = (userId, data) => {
    return new Promise((resolve, reject) => {
        const transactions = JSON.stringify(data.transactions || []);
        const leveragePositions = JSON.stringify(data.leveragePositions || []);
        
        db.run(
            `UPDATE user_data 
             SET usd_balance = ?, btc_balance = ?, transactions = ?, leverage_positions = ?, timezone = ?, role = ?, updated_at = CURRENT_TIMESTAMP
             WHERE user_id = ?`,
            [data.usdBalance, data.btcBalance, transactions, leveragePositions, data.timezone || 'UTC', data.role || 'user', userId],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
};

// Chart settings functions
const saveChartSettings = (userId, market, settings) => {
    return new Promise((resolve, reject) => {
        const { indicators, indicatorSettings, drawings, chartType } = settings;
        
        db.run(`
            INSERT OR REPLACE INTO chart_settings 
            (user_id, market, indicators, indicator_settings, drawings, chart_type, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [
            userId,
            market,
            JSON.stringify(indicators || {}),
            JSON.stringify(indicatorSettings || {}),
            JSON.stringify(drawings || []),
            chartType || 'candlestick'
        ], (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
};

const getChartSettings = (userId, market) => {
    return new Promise((resolve, reject) => {
        db.get(
            'SELECT * FROM chart_settings WHERE user_id = ? AND market = ?',
            [userId, market],
            (err, data) => {
                if (err) return reject(err);
                if (data) {
                    data.indicators = JSON.parse(data.indicators);
                    data.indicator_settings = JSON.parse(data.indicator_settings);
                    data.drawings = JSON.parse(data.drawings);
                }
                resolve(data);
            }
        );
    });
};

const deleteChartSettings = (userId, market) => {
    return new Promise((resolve, reject) => {
        db.run(
            'DELETE FROM chart_settings WHERE user_id = ? AND market = ?',
            [userId, market],
            (err) => {
                if (err) return reject(err);
                resolve();
            }
        );
    });
};

// Batch operations to prevent N+1 queries
const getUsersByIds = (userIds) => {
    return new Promise((resolve, reject) => {
        if (!userIds.length) return resolve([]);
        
        const placeholders = userIds.map(() => '?').join(',');
        const sql = `SELECT * FROM users WHERE id IN (${placeholders})`;
        
        db.all(sql, userIds, (err, rows) => {
            if (err) return reject(err);
            resolve(rows);
        });
    });
};

const getUserDataByIds = (userIds) => {
    return new Promise((resolve, reject) => {
        if (!userIds.length) return resolve([]);
        
        const placeholders = userIds.map(() => '?').join(',');
        const sql = `
            SELECT ud.*, u.created_at as member_since, u.username 
            FROM user_data ud 
            JOIN users u ON ud.user_id = u.id 
            WHERE ud.user_id IN (${placeholders})
        `;
        
        db.all(sql, userIds, (err, rows) => {
            if (err) return reject(err);
            
            // Parse JSON fields
            const processedRows = rows.map(row => ({
                ...row,
                transactions: JSON.parse(row.transactions),
                leverage_positions: JSON.parse(row.leverage_positions)
            }));
            
            resolve(processedRows);
        });
    });
};

module.exports = {
    db,
    createUser,
    authenticateUser,
    getUserData,
    updateUserData,
    saveChartSettings,
    getChartSettings,
    deleteChartSettings,
    // Batch operations
    getUsersByIds,
    getUserDataByIds
};