// Server-side Configuration
// Contains all server-side settings and constants

require('dotenv').config();

const SERVER_CONFIG = {
    // Server Configuration
    SERVER: {
        PORT: process.env.PORT || 3000,
        HOST: process.env.HOST || 'localhost',
        ENV: process.env.NODE_ENV || 'development',
        CORS: {
            ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
            CREDENTIALS: true
        }
    },

    // Database Configuration
    DATABASE: {
        MARKET_DATA: {
            PATH: process.env.MARKET_DB_PATH || './market_data.db',
            OPTIONS: {
                verbose: process.env.NODE_ENV === 'development' ? console.log : null
            }
        },
        USER_DATA: {
            PATH: process.env.USER_DB_PATH || './trading.db',
            OPTIONS: {
                verbose: process.env.NODE_ENV === 'development' ? console.log : null
            }
        },
        BACKUP: {
            ENABLED: process.env.DB_BACKUP_ENABLED === 'true',
            INTERVAL: parseInt(process.env.DB_BACKUP_INTERVAL) || 86400000, // 24 hours
            MAX_BACKUPS: parseInt(process.env.DB_MAX_BACKUPS) || 7
        }
    },

    // WebSocket Configuration
    WEBSOCKET: {
        PORT: process.env.WS_PORT || 3000,
        HEARTBEAT_INTERVAL: parseInt(process.env.WS_HEARTBEAT_INTERVAL) || 30000,
        MAX_CONNECTIONS: parseInt(process.env.WS_MAX_CONNECTIONS) || 1000,
        MESSAGE_SIZE_LIMIT: parseInt(process.env.WS_MESSAGE_SIZE_LIMIT) || 1024 * 1024 // 1MB
    },

    // OKX API Configuration
    OKX_API: {
        BASE_URL: process.env.OKX_BASE_URL || 'https://www.okx.com',
        WEBSOCKET_URL: process.env.OKX_WS_URL || 'wss://ws.okx.com:8443/ws/v5/public',
        RATE_LIMITS: {
            PUBLIC_API: {
                REQUESTS_PER_SECOND: 20,
                BURST_LIMIT: 40
            },
            WEBSOCKET: {
                SUBSCRIPTIONS_PER_CONNECTION: 240,
                MAX_CONNECTIONS: 5
            }
        },
        RETRY: {
            MAX_ATTEMPTS: 3,
            DELAY: 1000,
            BACKOFF_MULTIPLIER: 2
        },
        TIMEOUT: parseInt(process.env.OKX_API_TIMEOUT) || 10000
    },

    // Data Collection Configuration
    DATA_COLLECTION: {
        INTERVALS: {
            PRICE_UPDATE: parseInt(process.env.PRICE_UPDATE_INTERVAL) || 1000,      // 1 second
            ORDERBOOK_UPDATE: parseInt(process.env.ORDERBOOK_UPDATE_INTERVAL) || 500, // 500ms
            CANDLE_UPDATE: parseInt(process.env.CANDLE_UPDATE_INTERVAL) || 60000,   // 1 minute
            FULL_SYNC: parseInt(process.env.FULL_SYNC_INTERVAL) || 3600000         // 1 hour
        },
        LIMITS: {
            MAX_CANDLES_PER_REQUEST: parseInt(process.env.MAX_CANDLES_PER_REQUEST) || 1000,
            HISTORY_RETENTION_DAYS: parseInt(process.env.HISTORY_RETENTION_DAYS) || 365,
            MAX_ORDERBOOK_LEVELS: parseInt(process.env.MAX_ORDERBOOK_LEVELS) || 20
        },
        SUPPORTED_INSTRUMENTS: process.env.SUPPORTED_INSTRUMENTS ? 
            process.env.SUPPORTED_INSTRUMENTS.split(',') : 
            ['BTC-USDT', 'ETH-USDT', 'SOL-USDT', 'XRP-USDT'],
        SUPPORTED_TIMEFRAMES: process.env.SUPPORTED_TIMEFRAMES ?
            process.env.SUPPORTED_TIMEFRAMES.split(',') :
            ['1m', '5m', '15m', '30m', '1H', '4H', '1D']
    },

    // Cron Job Configuration
    CRON: {
        SCHEDULES: {
            RECENT_DATA: process.env.CRON_RECENT_DATA || '*/5 * * * *',        // Every 5 minutes
            FULL_DATA: process.env.CRON_FULL_DATA || '0 * * * *',              // Every hour
            EXTENDED_DATA: process.env.CRON_EXTENDED_DATA || '0 */12 * * *',    // Every 12 hours
            DAILY_DATA: process.env.CRON_DAILY_DATA || '0 6 * * *',            // Daily at 6 AM
            CLEANUP: process.env.CRON_CLEANUP || '0 2 * * 0'                   // Weekly on Sunday at 2 AM
        },
        TIMEZONE: process.env.CRON_TIMEZONE || 'UTC'
    },

    // Security Configuration
    SECURITY: {
        JWT: {
            SECRET: process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-this',
            EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
            ALGORITHM: 'HS256'
        },
        BCRYPT: {
            SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS) || 10
        },
        RATE_LIMITING: {
            WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW) || 900000, // 15 minutes
            MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX) || 100,
            SKIP_SUCCESSFUL_REQUESTS: process.env.RATE_LIMIT_SKIP_SUCCESS === 'true'
        },
        CORS: {
            ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',
            METHODS: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            ALLOWED_HEADERS: ['Content-Type', 'Authorization']
        }
    },

    // Logging Configuration
    LOGGING: {
        LEVEL: process.env.LOG_LEVEL || 'info',
        FORMAT: process.env.LOG_FORMAT || 'combined',
        FILE: {
            ENABLED: process.env.LOG_TO_FILE === 'true',
            PATH: process.env.LOG_FILE_PATH || './logs',
            MAX_SIZE: process.env.LOG_MAX_SIZE || '10m',
            MAX_FILES: process.env.LOG_MAX_FILES || '5d'
        },
        CATEGORIES: {
            API: process.env.LOG_API === 'true',
            WEBSOCKET: process.env.LOG_WEBSOCKET === 'true',
            DATABASE: process.env.LOG_DATABASE === 'true',
            SCHEDULER: process.env.LOG_SCHEDULER === 'true'
        }
    },

    // Performance Configuration
    PERFORMANCE: {
        CACHE: {
            ENABLED: process.env.CACHE_ENABLED !== 'false',
            TTL: parseInt(process.env.CACHE_TTL) || 300,        // 5 minutes
            MAX_SIZE: parseInt(process.env.CACHE_MAX_SIZE) || 1000
        },
        COMPRESSION: {
            ENABLED: process.env.COMPRESSION_ENABLED !== 'false',
            LEVEL: parseInt(process.env.COMPRESSION_LEVEL) || 6,
            THRESHOLD: parseInt(process.env.COMPRESSION_THRESHOLD) || 1024
        },
        CONNECTION_POOL: {
            MAX_CONNECTIONS: parseInt(process.env.DB_MAX_CONNECTIONS) || 10,
            IDLE_TIMEOUT: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000
        }
    },

    // Monitoring Configuration
    MONITORING: {
        HEALTH_CHECK: {
            ENABLED: process.env.HEALTH_CHECK_ENABLED !== 'false',
            INTERVAL: parseInt(process.env.HEALTH_CHECK_INTERVAL) || 30000,
            ENDPOINT: process.env.HEALTH_CHECK_ENDPOINT || '/health'
        },
        METRICS: {
            ENABLED: process.env.METRICS_ENABLED === 'true',
            PORT: parseInt(process.env.METRICS_PORT) || 9090,
            ENDPOINT: process.env.METRICS_ENDPOINT || '/metrics'
        }
    }
};

// Environment-specific overrides
if (SERVER_CONFIG.SERVER.ENV === 'production') {
    // Production overrides
    SERVER_CONFIG.LOGGING.LEVEL = 'warn';
    SERVER_CONFIG.DATABASE.MARKET_DATA.OPTIONS.verbose = null;
    SERVER_CONFIG.DATABASE.USER_DATA.OPTIONS.verbose = null;
    SERVER_CONFIG.PERFORMANCE.CACHE.ENABLED = true;
} else if (SERVER_CONFIG.SERVER.ENV === 'development') {
    // Development overrides
    SERVER_CONFIG.LOGGING.LEVEL = 'debug';
    SERVER_CONFIG.LOGGING.CATEGORIES.API = true;
    SERVER_CONFIG.LOGGING.CATEGORIES.WEBSOCKET = true;
}

// Utility functions
const getConfig = (path) => {
    const keys = path.split('.');
    let value = SERVER_CONFIG;
    
    for (const key of keys) {
        if (value && typeof value === 'object' && key in value) {
            value = value[key];
        } else {
            console.warn(`Server config path not found: ${path}`);
            return undefined;
        }
    }
    
    return value;
};

const isDevelopment = () => {
    return SERVER_CONFIG.SERVER.ENV === 'development';
};

const isProduction = () => {
    return SERVER_CONFIG.SERVER.ENV === 'production';
};

const getDbPath = (type) => {
    return getConfig(`DATABASE.${type.toUpperCase()}.PATH`);
};

const getCronSchedule = (jobName) => {
    return getConfig(`CRON.SCHEDULES.${jobName.toUpperCase()}`);
};

// Validation functions
const validateConfig = () => {
    const errors = [];
    
    // Required environment variables
    const required = [
        'JWT_SECRET'
    ];
    
    for (const env of required) {
        if (!process.env[env] && SERVER_CONFIG.SERVER.ENV === 'production') {
            errors.push(`Missing required environment variable: ${env}`);
        }
    }
    
    // Validate JWT secret in production
    if (SERVER_CONFIG.SERVER.ENV === 'production' && 
        SERVER_CONFIG.SECURITY.JWT.SECRET === 'your-super-secret-jwt-key-change-this') {
        errors.push('JWT_SECRET must be changed in production');
    }
    
    // Validate port ranges
    if (SERVER_CONFIG.SERVER.PORT < 1 || SERVER_CONFIG.SERVER.PORT > 65535) {
        errors.push('Invalid server port number');
    }
    
    if (errors.length > 0) {
        console.error('Configuration validation errors:');
        errors.forEach(error => console.error(`- ${error}`));
        
        if (SERVER_CONFIG.SERVER.ENV === 'production') {
            process.exit(1);
        }
    }
    
    return errors.length === 0;
};

// Initialize configuration
validateConfig();

module.exports = {
    SERVER_CONFIG,
    getConfig,
    isDevelopment,
    isProduction,
    getDbPath,
    getCronSchedule,
    validateConfig
};