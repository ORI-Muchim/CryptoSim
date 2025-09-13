const { body, query, param, validationResult } = require('express-validator');
const logger = require('../utils/logger');

// Supported markets
const SUPPORTED_MARKETS = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT'];

// Validation middleware
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        logger.warn('Validation failed', { 
            errors: errors.array(),
            path: req.path,
            ip: req.ip
        });
        
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array(),
            timestamp: new Date().toISOString()
        });
    }
    next();
};

// Common validation rules
const commonValidations = {
    // Market validation
    market: body('market')
        .isString()
        .isIn(SUPPORTED_MARKETS)
        .withMessage(`Market must be one of: ${SUPPORTED_MARKETS.join(', ')}`),
    
    // Amount validations
    amount: body('amount')
        .isFloat({ min: 0.0001, max: 1000 })
        .withMessage('Amount must be between 0.0001 and 1000'),
    
    leverage: body('leverage')
        .isInt({ min: 2, max: 100 })
        .withMessage('Leverage must be between 2x and 100x'),
    
    // Price validation
    price: body('price')
        .isFloat({ min: 0.01 })
        .withMessage('Price must be greater than 0.01'),
    
    // User credentials
    username: body('username')
        .isLength({ min: 3, max: 20 })
        .matches(/^[a-zA-Z0-9_]+$/)
        .withMessage('Username must be 3-20 characters, alphanumeric and underscore only'),
    
    password: body('password')
        .isLength({ min: 6, max: 100 })
        .withMessage('Password must be 6-100 characters'),
    
    // Position types
    positionType: body('type')
        .isIn(['long', 'short'])
        .withMessage('Position type must be long or short'),
    
    // Percentage for partial closes
    percentage: body('percentage')
        .isFloat({ min: 1, max: 100 })
        .withMessage('Percentage must be between 1 and 100'),
    
    // Chat message
    message: body('message')
        .isLength({ min: 1, max: 500 })
        .trim()
        .escape()
        .withMessage('Message must be 1-500 characters'),
    
    // Timezone
    timezone: body('timezone')
        .isString()
        .isLength({ max: 50 })
        .withMessage('Invalid timezone format'),
    
    // Query parameters
    queryMarket: query('market')
        .optional()
        .isIn(SUPPORTED_MARKETS)
        .withMessage(`Market must be one of: ${SUPPORTED_MARKETS.join(', ')}`),
    
    queryLimit: query('limit')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Limit must be between 1 and 1000'),
    
    // URL parameters
    paramMarket: param('market')
        .isIn(SUPPORTED_MARKETS.map(m => m.replace('/', '-'))) // BTC-USDT format
        .withMessage('Invalid market parameter')
};

// Validation rule sets for different endpoints
const validationRules = {
    // Authentication
    register: [
        commonValidations.username,
        commonValidations.password,
        handleValidationErrors
    ],
    
    login: [
        commonValidations.username,
        commonValidations.password,
        handleValidationErrors
    ],
    
    // Trading
    spotTrade: [
        commonValidations.market,
        commonValidations.amount,
        body('type').isIn(['buy', 'sell']).withMessage('Type must be buy or sell'),
        handleValidationErrors
    ],
    
    leverageTrade: [
        commonValidations.market,
        commonValidations.amount,
        commonValidations.leverage,
        commonValidations.positionType,
        handleValidationErrors
    ],
    
    closePosition: [
        body('positionId').isString().notEmpty().withMessage('Position ID is required'),
        commonValidations.percentage.optional(),
        handleValidationErrors
    ],
    
    limitOrder: [
        commonValidations.market,
        commonValidations.amount,
        commonValidations.price,
        body('type').isIn(['buy', 'sell']).withMessage('Type must be buy or sell'),
        handleValidationErrors
    ],
    
    // Market data
    marketPrice: [
        commonValidations.paramMarket,
        handleValidationErrors
    ],
    
    candles: [
        commonValidations.paramMarket,
        query('interval')
            .optional()
            .isIn(['1m', '5m', '15m', '30m', '1h', '4h', '1d'])
            .withMessage('Invalid interval'),
        commonValidations.queryLimit,
        handleValidationErrors
    ],
    
    // Chart settings
    chartSettings: [
        commonValidations.market,
        body('indicators').optional().isObject().withMessage('Indicators must be an object'),
        body('indicatorSettings').optional().isObject().withMessage('Indicator settings must be an object'),
        body('drawings').optional().isArray().withMessage('Drawings must be an array'),
        body('chartType').optional().isIn(['candlestick', 'line']).withMessage('Chart type must be candlestick or line'),
        handleValidationErrors
    ],
    
    // User settings
    userSettings: [
        commonValidations.timezone,
        body('audioEnabled').optional().isBoolean().withMessage('Audio enabled must be boolean'),
        handleValidationErrors
    ],
    
    // Chat
    chatMessage: [
        commonValidations.message,
        body('messageType')
            .optional()
            .isIn(['message', 'trade_share', 'system'])
            .withMessage('Invalid message type'),
        handleValidationErrors
    ]
};

// Custom sanitization functions
const sanitizers = {
    // Sanitize market format (convert BTC/USDT to BTC-USDT for URLs)
    marketToUrl: (market) => {
        return market.replace('/', '-');
    },
    
    // Sanitize market format (convert BTC-USDT to BTC/USDT)
    urlToMarket: (market) => {
        return market.replace('-', '/');
    },
    
    // Ensure numeric precision
    ensureNumeric: (value, defaultValue = 0, precision = 8) => {
        const num = Number(value);
        if (!Number.isFinite(num)) return defaultValue;
        return Number(num.toFixed(precision));
    },
    
    // Sanitize string input
    sanitizeString: (str, maxLength = 255) => {
        if (typeof str !== 'string') return '';
        return str.trim().substring(0, maxLength);
    }
};

// Rate limiting validation (additional layer)
const rateLimitValidation = {
    // More strict limits for trading operations
    trading: {
        windowMs: 60 * 1000, // 1 minute
        max: 10, // 10 trades per minute
        message: 'Too many trading requests, please slow down'
    },
    
    // Chat rate limiting
    chat: {
        windowMs: 60 * 1000, // 1 minute
        max: 20, // 20 messages per minute
        message: 'Too many chat messages, please slow down'
    },
    
    // General API rate limiting
    general: {
        windowMs: 60 * 1000, // 1 minute
        max: 100, // 100 requests per minute
        message: 'Too many requests, please try again later'
    }
};

module.exports = {
    validationRules,
    handleValidationErrors,
    commonValidations,
    sanitizers,
    rateLimitValidation,
    SUPPORTED_MARKETS
};