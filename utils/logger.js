const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Define log levels
const levels = {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4,
};

// Define log colors
const colors = {
    error: 'red',
    warn: 'yellow',
    info: 'green',
    http: 'magenta',
    debug: 'white',
};

// Tell winston about the colors
winston.addColors(colors);

// Define log format
const format = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
);

// Define console format (colorized and simple)
const consoleFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.colorize({ all: true }),
    winston.format.printf(
        (info) => {
            const { timestamp, level, message, ...args } = info;
            const ts = timestamp.slice(0, 19).replace('T', ' ');
            
            // Format additional arguments if present
            const argsString = Object.keys(args).length ? 
                JSON.stringify(args, null, 2) : '';
            
            return `${ts} [${level}]: ${message} ${argsString}`;
        }
    )
);

// Define which transports to use
const transports = [];

// Console transport (always enabled in development)
if (process.env.NODE_ENV !== 'production') {
    transports.push(
        new winston.transports.Console({
            format: consoleFormat,
            level: process.env.LOG_LEVEL || 'debug',
        })
    );
} else {
    // In production, only log warn and above to console
    transports.push(
        new winston.transports.Console({
            format: consoleFormat,
            level: 'warn',
        })
    );
}

// File transports
transports.push(
    // Log all levels to combined.log
    new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: format,
        level: process.env.LOG_LEVEL || 'info',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
    }),
    // Log only errors to error.log
    new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        format: format,
        level: 'error',
        maxsize: 5242880, // 5MB
        maxFiles: 5,
    })
);

// Create the logger
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels,
    format,
    transports,
    exitOnError: false, // Do not exit on handled exceptions
});

// Create a stream object for morgan middleware
logger.stream = {
    write: function(message, encoding) {
        // Remove newline character at the end
        logger.http(message.trim());
    },
};

// Export logger instance
module.exports = logger;

// Log unhandled exceptions and rejections to separate files
if (process.env.NODE_ENV === 'production') {
    logger.exceptions.handle(
        new winston.transports.File({
            filename: path.join(logsDir, 'exceptions.log'),
            maxsize: 5242880,
            maxFiles: 5,
        })
    );

    logger.rejections.handle(
        new winston.transports.File({
            filename: path.join(logsDir, 'rejections.log'),
            maxsize: 5242880,
            maxFiles: 5,
        })
    );
}

// Export additional utilities
module.exports.logError = (error, context = '') => {
    logger.error(`${context ? `[${context}] ` : ''}${error.message}`, {
        stack: error.stack,
        code: error.code,
        ...error
    });
};

module.exports.logRequest = (req, res, responseTime) => {
    const message = `${req.method} ${req.originalUrl}`;
    const meta = {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        responseTime: `${responseTime}ms`,
        ip: req.ip || req.connection.remoteAddress,
        userAgent: req.get('user-agent'),
    };

    if (res.statusCode >= 400) {
        logger.warn(message, meta);
    } else {
        logger.http(message, meta);
    }
};

module.exports.logWebSocketEvent = (event, data = {}) => {
    logger.info(`WebSocket Event: ${event}`, data);
};

module.exports.logDatabaseQuery = (query, params = [], duration = null) => {
    const meta = {
        query: query.substring(0, 200), // Limit query length in logs
        params: params.length > 0 ? params : undefined,
        duration: duration ? `${duration}ms` : undefined,
    };
    
    logger.debug('Database Query', meta);
};