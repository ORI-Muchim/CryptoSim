require('dotenv').config();
const express = require('express');
const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');
const cors = require('cors');
const axios = require('axios');
const WebSocket = require('ws');
const path = require('path');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const crypto = require('crypto');
const { validationRules, sanitizers } = require('./middleware/validation');
const { 
    pool,
    createUser, authenticateUser, getUserData, updateUserData, 
    saveChartSettings, getChartSettings, deleteChartSettings, 
    saveChatMessage, getChatHistory, 
    getRankings, getUserRanking, updateAccountType,
    getAlertSettings, updateAlertSettings,
    createStopOrder, getActiveStopOrders, cancelStopOrder, executeStopOrder,
    savePriceAlert, getUnacknowledgedAlerts, acknowledgeAlerts,
    // Social functions
    followUser, unfollowUser, isFollowing, getFollowing, getFollowers, 
    getFollowStats, getFollowedUserTransactions
} = require('./database');
const MarketDataScheduler = require('./scheduler');
const PerformanceMonitor = require('./monitoring/performance-monitor');
const AlertManager = require('./monitoring/alert-manager');
const logger = require('./utils/logger');
const swaggerConfig = require('./config/swagger-config');

// Standard API response utility
const createAPIResponse = {
    success: (data, message = null) => ({
        success: true,
        data,
        message,
        timestamp: new Date().toISOString()
    }),
    error: (message, errors = null, statusCode = 500) => ({
        success: false,
        error: message,
        errors,
        timestamp: new Date().toISOString(),
        statusCode
    }),
    paginated: (data, pagination, message = null) => ({
        success: true,
        data,
        pagination,
        message,
        timestamp: new Date().toISOString()
    })
};

const app = express();
const PORT = process.env.PORT || 3000;
const DEMO_MODE = process.env.DEMO_MODE === 'true' || false;
// Enhanced JWT secret security
const JWT_SECRET = (() => {
    const secret = process.env.JWT_SECRET;
    
    if (!secret) {
        if (process.env.NODE_ENV === 'production') {
            console.error('CRITICAL SECURITY ERROR: JWT_SECRET environment variable is required in production!');
            process.exit(1);
        } else {
            console.warn('WARNING: Using development JWT secret. Set JWT_SECRET environment variable for production!');
            return 'dev_secret_' + require('crypto').randomBytes(32).toString('hex');
        }
    }
    
    if (secret.length < 32) {
        console.error('SECURITY ERROR: JWT_SECRET must be at least 32 characters long!');
        process.exit(1);
    }
    
    return secret;
})();

// Rate limiting configuration - more flexible
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000, // 5 minutes (reduced from 15)
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 2000, // 2000 requests per 5 minutes (increased)
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Auth rate limiter (more flexible)
const authLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes (reduced from 15)
    max: 20, // 20 auth attempts per 5 minutes (increased from 5)
    message: 'Too many authentication attempts, please try again later.',
    skipSuccessfulRequests: true,
});

// Security middleware
// CSP configuration with route-specific overrides
const defaultCSP = {
    directives: {
        defaultSrc: ["'self'"],
        // Allow specific style sources (removing unsafe-inline for better security)
        styleSrc: [
            "'self'", 
            "https://fonts.googleapis.com", 
            "https://cdnjs.cloudflare.com",
            "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='", // Empty inline styles
            "'sha256-5o/xXiuiuwpezmuqlP2nTVguD0j4V0nkPsBTti+gmLQ='", // style="display:none"
            "'sha256-biLFinpqYMtWHmXfkA1BPeCY0/fNt46SAZ+BBk5YUog='", // style=""
            "'sha256-nlJqzRTYboExZzVD4DQxb+uOHpm0xUODsM+51NcB0tM='", // Dynamic styles
            "'sha256-UQd05PVutI5yWvpzVBsXVcrIZqvqRxJdE5AbYcL/rHA='", // Script-generated styles
            "'sha256-B04insvtmrN/tMV1Tl3SutYG3CpN7z2ZoZnPym8Ebz8='", // history.js and settings.js styles
            "'sha256-Q43oAi1FsW2BRoOHMdVoonS7w3dKu7LpOXFyqw8vcLo='", // Additional dynamic styles
            "'unsafe-hashes'", // Allow event handler styles
            process.env.NODE_ENV === 'development' ? "'unsafe-inline'" : null
        ].filter(Boolean),
        // Restrict script sources and remove unsafe-eval
        scriptSrc: [
            "'self'", 
            "https://unpkg.com", 
            "https://cdn.jsdelivr.net",
            "'sha256-9qIM/K9N6AqC1F+pyJsf+6EiujBTaKud/UephdAW7H4='", // Inline script hash
            process.env.NODE_ENV === 'development' ? "'unsafe-inline'" : null
        ].filter(Boolean),
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:", "https://cdnjs.cloudflare.com"],
        // Restrict image sources to specific domains
        imgSrc: [
            "'self'", 
            "data:", 
            "https://s2.coinmarketcap.com", // For crypto icons
            "https://www.okx.com",
            "blob:"
        ],
        // Restrict connection sources to necessary domains
        connectSrc: [
            "'self'", 
            "ws://localhost:*", 
            "wss://localhost:*",
            "https://www.okx.com", 
            "wss://ws.okx.com",
            "https://api.upbit.com"
        ],
        objectSrc: ["'none'"], // Prevent object/embed/applet
        baseUri: ["'self'"], // Prevent base tag injection
        formAction: ["'self'"], // Restrict form submissions
    }
};

// Swagger UI-specific CSP
const swaggerCSP = {
    directives: {
        ...defaultCSP.directives,
        styleSrc: [
            "'self'", 
            "https://fonts.googleapis.com", 
            "https://cdnjs.cloudflare.com",
            "'unsafe-inline'" // Swagger UI requires inline styles
        ],
        scriptSrc: [
            "'self'", 
            "https://unpkg.com", 
            "https://cdn.jsdelivr.net",
            "'unsafe-inline'" // Swagger UI requires inline scripts
        ]
    }
};

app.use(helmet({
    // Explicit security headers for better protection
    frameguard: { action: 'deny' }, // X-Frame-Options: DENY
    noSniff: true, // X-Content-Type-Options: nosniff
    xssFilter: { mode: 'block' }, // X-XSS-Protection: 1; mode=block
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    contentSecurityPolicy: defaultCSP
}));

// Enhanced CORS configuration with strict security
const corsOptions = {
    origin: function (origin, callback) {
        // Define allowed origins based on environment
        const allowedOrigins = process.env.NODE_ENV === 'production' 
            ? (process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [])
            : [
                'http://localhost:3000',
                'http://127.0.0.1:3000',
                'http://localhost:3001', // For development testing
            ];
        
        // Log CORS requests for monitoring (only in development)
        if (origin && process.env.NODE_ENV === 'development') {
            console.log(`CORS request from origin: ${origin}`);
        }
        
        // Allow requests with no origin (like same-origin requests)
        if (!origin) {
            return callback(null, true);
        }
        
        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked request from unauthorized origin: ${origin}`);
            callback(new Error(`CORS policy violation: Origin ${origin} is not allowed`));
        }
    },
    credentials: true,
    optionsSuccessStatus: 200,
    // Add additional security headers
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    maxAge: 86400, // Cache preflight response for 24 hours
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static('public'));

// Swagger documentation with relaxed CSP
const swaggerSpec = swaggerJSDoc(swaggerConfig);
app.use('/api-docs', 
    helmet({
        contentSecurityPolicy: swaggerCSP,
        frameguard: { action: 'deny' },
        noSniff: true,
        xssFilter: { mode: 'block' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' }
    }),
    swaggerUi.serve, 
    swaggerUi.setup(swaggerSpec)
);

// Apply rate limiting to API routes
app.use('/api/', limiter);


// Logging middleware
app.use((req, res, next) => {
    const startTime = Date.now();
    
    // Override res.end to capture response time
    const originalEnd = res.end;
    res.end = function(...args) {
        const responseTime = Date.now() - startTime;
        const success = res.statusCode < 400;
        
        // Log request
        logger.info('HTTP Request', {
            method: req.method,
            url: req.url,
            status: res.statusCode,
            responseTime: `${responseTime}ms`,
            ip: req.ip
        });
        
        // Record API request metrics
        if (performanceMonitor) {
            performanceMonitor.recordRequest(responseTime, success);
        }
        
        originalEnd.apply(this, args);
    };
    
    next();
});

// Clean URL routes
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/history', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'history.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'settings.html'));
});

app.get('/monitoring', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'monitoring.html'));
});

app.get('/social', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'social.html'));
});

// Legacy routes for backwards compatibility
app.get('/login.html', (req, res) => {
    res.redirect('/login');
});

app.get('/history.html', (req, res) => {
    res.redirect('/history');
});

app.get('/settings.html', (req, res) => {
    res.redirect('/settings');
});

app.get('/monitoring.html', (req, res) => {
    res.redirect('/monitoring');
});

app.get('/rankings.html', (req, res) => {
    res.redirect('/social');
});

app.get('/rankings', (req, res) => {
    res.redirect('/social');
});

app.get('/social.html', (req, res) => {
    res.redirect('/social');
});

// HTTP Server
const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`JWT Secret configured: ${JWT_SECRET ? 'Yes' : 'No'}`);
});

// WebSocket Server for market data (use noServer to handle upgrade manually)
const wss = new WebSocket.Server({ noServer: true });

// WebSocket Server for chat
const chatWss = new WebSocket.Server({ noServer: true });
const chatClients = new Map(); // Store authenticated chat clients

// OKX WebSocket Connection
let okxWs = null;
let okxWsPingInterval = null; // Track ping interval for cleanup
let currentPrice = 0;
let priceHistory = [];
let candleData = [];
let orderbook = { bids: [], asks: [] };
let marketPrices = {
    'BTC-USDT': { price: 0, change: 0, high: 0, low: 0, volume: 0, lastPrice: 0 },
    'ETH-USDT': { price: 0, change: 0, high: 0, low: 0, volume: 0, lastPrice: 0 }
};

// Price monitoring for alerts
const priceCheckInterval = 5000; // Check every 5 seconds
let priceMonitoringInterval = null;

// Price monitoring and alert system
async function checkPriceAlerts() {
    try {
        // Get all users with enabled alerts
        const usersResult = await pool.query(`
            SELECT u.id, u.username, als.*
            FROM users u
            JOIN alert_settings als ON u.id = als.user_id
            WHERE als.price_alert_enabled = true
        `);
        
        if (usersResult.rows.length === 0) return;
        
        // Check each market for price changes
        for (const [market, currentData] of Object.entries(marketPrices)) {
            if (currentData.price <= 0 || currentData.lastPrice <= 0) continue;
            
            const priceChange = Math.abs((currentData.price - currentData.lastPrice) / currentData.lastPrice) * 100;
            
            // Check each user's alert threshold
            for (const user of usersResult.rows) {
                if (priceChange >= user.price_alert_threshold) {
                    const alertType = currentData.price > currentData.lastPrice ? 'price_spike' : 'price_drop';
                    const changePercent = ((currentData.price - currentData.lastPrice) / currentData.lastPrice) * 100;
                    
                    // Create alert message
                    const message = `${market.replace('-', '/')} ${alertType === 'price_spike' ? '📈' : '📉'} ${changePercent.toFixed(2)}% - $${currentData.price.toFixed(2)}`;
                    
                    // Save alert to database
                    await savePriceAlert({
                        user_id: user.id,
                        market,
                        alert_type: alertType,
                        previous_price: currentData.lastPrice,
                        current_price: currentData.price,
                        change_percent: changePercent,
                        message
                    });
                    
                    // Send WebSocket alert to user if connected
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN && client.auth?.id === user.id) {
                            client.send(JSON.stringify({
                                type: 'price_alert',
                                market,
                                alertType,
                                message,
                                changePercent,
                                currentPrice: currentData.price,
                                previousPrice: currentData.lastPrice,
                                timestamp: new Date().toISOString()
                            }));
                        }
                    });
                    
                    logger.info('Price alert triggered', {
                        userId: user.id,
                        username: user.username,
                        market,
                        alertType,
                        changePercent,
                        currentPrice: currentData.price,
                        previousPrice: currentData.lastPrice
                    });
                }
            }
            
            // Update last price for next comparison
            marketPrices[market].lastPrice = currentData.price;
        }
        
        // Check and execute stop orders
        await checkStopOrders();
        
    } catch (error) {
        logger.error('Error checking price alerts:', { error: error.message, stack: error.stack });
    }
}

// Check and execute stop orders
async function checkStopOrders() {
    try {
        const stopOrdersResult = await pool.query(`
            SELECT so.*, u.username
            FROM stop_orders so
            JOIN users u ON so.user_id = u.id
            WHERE so.status = 'active'
        `);
        
        for (const order of stopOrdersResult.rows) {
            const marketKey = order.market.replace('/', '-');
            const currentPrice = marketPrices[marketKey]?.price;
            
            if (!currentPrice || currentPrice <= 0) continue;
            
            let shouldExecute = false;
            
            // Check if stop order should be triggered
            if (order.order_type === 'stop_loss') {
                if (order.position_type === 'long' && currentPrice <= order.trigger_price) {
                    shouldExecute = true;
                } else if (order.position_type === 'short' && currentPrice >= order.trigger_price) {
                    shouldExecute = true;
                }
            } else if (order.order_type === 'take_profit') {
                if (order.position_type === 'long' && currentPrice >= order.trigger_price) {
                    shouldExecute = true;
                } else if (order.position_type === 'short' && currentPrice <= order.trigger_price) {
                    shouldExecute = true;
                }
            }
            
            if (shouldExecute) {
                // Execute stop order
                const executedOrder = await executeStopOrder(order.id, currentPrice);
                
                if (executedOrder) {
                    // Create alert for executed stop order
                    const alertType = order.order_type === 'stop_loss' ? 'stop_loss' : 'take_profit';
                    const message = `${order.order_type === 'stop_loss' ? '🛑 Stop Loss' : '🎯 Take Profit'} executed for ${order.market} at $${currentPrice.toFixed(2)}`;
                    
                    await savePriceAlert({
                        user_id: order.user_id,
                        market: order.market,
                        alert_type: alertType,
                        previous_price: order.trigger_price,
                        current_price: currentPrice,
                        change_percent: ((currentPrice - order.trigger_price) / order.trigger_price) * 100,
                        message
                    });
                    
                    // Send WebSocket notification
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN && client.auth?.id === order.user_id) {
                            client.send(JSON.stringify({
                                type: 'stop_order_executed',
                                orderType: order.order_type,
                                market: order.market,
                                triggerPrice: order.trigger_price,
                                executionPrice: currentPrice,
                                message,
                                timestamp: new Date().toISOString()
                            }));
                        }
                    });
                    
                    logger.info('Stop order executed', {
                        orderId: order.id,
                        userId: order.user_id,
                        username: order.username,
                        orderType: order.order_type,
                        market: order.market,
                        triggerPrice: order.trigger_price,
                        executionPrice: currentPrice
                    });
                }
            }
        }
    } catch (error) {
        logger.error('Error checking stop orders:', { error: error.message });
    }
}

// Start price monitoring
function startPriceMonitoring() {
    if (priceMonitoringInterval) {
        clearInterval(priceMonitoringInterval);
    }
    
    priceMonitoringInterval = setInterval(checkPriceAlerts, priceCheckInterval);
    logger.info('Price monitoring started', { interval: priceCheckInterval });
}

// Stop price monitoring
function stopPriceMonitoring() {
    if (priceMonitoringInterval) {
        clearInterval(priceMonitoringInterval);
        priceMonitoringInterval = null;
    }
    logger.info('Price monitoring stopped');
}

function connectOKXWebSocket() {
    okxWs = new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
    
    okxWs.on('open', async () => {
        logger.info('Connected to OKX WebSocket');
        
        // Subscribe to BTC ticker data
        const btcTickerSubscribe = {
            op: 'subscribe',
            args: [{
                channel: 'tickers',
                instId: 'BTC-USDT'
            }]
        };
        okxWs.send(JSON.stringify(btcTickerSubscribe));
        
        // Subscribe to ETH ticker data
        const ethTickerSubscribe = {
            op: 'subscribe',
            args: [{
                channel: 'tickers',
                instId: 'ETH-USDT'
            }]
        };
        okxWs.send(JSON.stringify(ethTickerSubscribe));
        
        // Subscribe to orderbook data  
        const orderbookSubscribe = {
            op: 'subscribe',
            args: [{
                channel: 'books',
                instId: 'BTC-USDT'
            }]
        };
        okxWs.send(JSON.stringify(orderbookSubscribe));
        
        logger.info('Subscribed to BTC/ETH ticker, orderbook channels');
        
        // Start price monitoring system for alerts and stop orders
        startPriceMonitoring();
    });
    
    okxWs.on('message', (data) => {
        try {
            // Handle ping/pong messages
            const dataStr = data.toString();
            if (dataStr === 'pong') {
                return; // Skip pong messages silently
            }
            
            const message = JSON.parse(dataStr);
            
            if (message.data && message.data.length > 0) {
                const data = message.data[0];
                
                // Handle ticker data
                if (message.arg && message.arg.channel === 'tickers') {
                    const instId = message.arg.instId;
                    const price = parseFloat(data.last);
                    const open24h = parseFloat(data.open24h);
                    
                    // Calculate 24h change rate: (current - open) / open
                    const changeRate = open24h > 0 ? (price - open24h) / open24h : 0;
                    
                    
                    // Update market prices
                    marketPrices[instId] = {
                        price: price,
                        change: changeRate,
                        high: parseFloat(data.high24h),
                        low: parseFloat(data.low24h),
                        volume: parseFloat(data.vol24h)
                    };
                    
                    // For BTC, maintain backward compatibility
                    if (instId === 'BTC-USDT') {
                        currentPrice = price;
                        
                        // Add to price history
                        priceHistory.push({
                            time: new Date().toISOString(),
                            price: currentPrice,
                            volume: parseFloat(data.vol24h)
                        });
                        
                        // Keep only last 100 data points to prevent memory bloat
                        const MAX_PRICE_HISTORY = 100;
                        if (priceHistory.length > MAX_PRICE_HISTORY) {
                            priceHistory = priceHistory.slice(-MAX_PRICE_HISTORY);
                        }
                    }
                    
                    // Broadcast price update
                    broadcastToClients({
                        type: 'price_update',
                        instId: instId,
                        data: {
                            price: price,
                            change: price - open24h,
                            change_rate: changeRate,
                            high_price: parseFloat(data.high24h),
                            low_price: parseFloat(data.low24h),
                            volume: parseFloat(data.vol24h)
                        }
                    });
                }
                
                // Handle orderbook data
                else if (message.arg && message.arg.channel === 'books') {
                    // Only update if we have valid data
                    if (data.bids && data.asks && data.bids.length > 0 && data.asks.length > 0) {
                        orderbook = {
                            bids: data.bids.map(bid => [parseFloat(bid[0]), parseFloat(bid[1])]),
                            asks: data.asks.map(ask => [parseFloat(ask[0]), parseFloat(ask[1])])
                        };
                        
                        // Broadcast orderbook update
                        broadcastToClients({
                            type: 'orderbook_update',
                            data: orderbook
                        });
                    }
                }
                
                // Handle real-time candle data for multiple timeframes
                else if (message.arg && (message.arg.channel === 'candlesticks' || message.arg.channel === 'candle1m' || message.arg.channel === 'candle' || message.arg.channel === 'kline')) {
                    const instId = message.arg.instId;
                    const interval = message.arg.interval;
                    
                    // Map OKX interval to our interval format
                    const intervalMap = {
                        '1m': '1m',
                        '5m': '5m', 
                        '15m': '15m',
                        '1H': '1h',
                        '4H': '4h',
                        '1D': '1d'
                    };
                    
                    const mappedInterval = intervalMap[interval];
                    if (!mappedInterval) {
                        console.warn('Unknown candle interval:', interval);
                        return;
                    }
                    
                    const candleData = {
                        instId: instId,
                        time: Math.floor(parseInt(data[0]) / 1000), // Convert to seconds
                        open: parseFloat(data[1]),
                        high: parseFloat(data[2]),
                        low: parseFloat(data[3]),
                        close: parseFloat(data[4]),
                        volume: parseFloat(data[5]),
                        timestamp: parseInt(data[0])
                    };
                    
                    // Broadcast real-time candle update
                    broadcastToClients({
                        type: 'candle_update',
                        instId: instId,
                        interval: mappedInterval,
                        data: candleData
                    });
                    
                    // Store in database for future use (for main timeframes)
                    if (dataScheduler && dataScheduler.collector) {
                        const barMap = {
                            '1m': '1m',
                            '5m': '5m',
                            '15m': '15m', 
                            '1h': '1H',
                            '4h': '4H',
                            '1d': '1D'
                        };
                        
                        const bar = barMap[mappedInterval];
                        if (bar) {
                            dataScheduler.collector.saveCandles([{
                                instId: instId,
                                timestamp: candleData.timestamp,
                                open: candleData.open,
                                high: candleData.high,
                                low: candleData.low,
                                close: candleData.close,
                                volume: candleData.volume,
                                volCcy: 0,
                                bar: bar
                            }], bar);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error parsing OKX message:', error);
        }
    });
    
    okxWs.on('error', (error) => {
        logger.error('OKX WebSocket error:', error);
    });
    
    okxWs.on('close', (code, reason) => {
        logger.info(`OKX WebSocket disconnected (code: ${code}, reason: ${reason}). Reconnecting in 5 seconds...`);
        
        // Cleanup existing ping interval
        if (okxWsPingInterval) {
            clearInterval(okxWsPingInterval);
            okxWsPingInterval = null;
        }
        
        setTimeout(connectOKXWebSocket, 5000);
    });
    
    // Cleanup any existing ping interval before creating new one
    if (okxWsPingInterval) {
        clearInterval(okxWsPingInterval);
    }
    
    // Ping every 25 seconds to keep connection alive
    okxWsPingInterval = setInterval(() => {
        if (okxWs && okxWs.readyState === WebSocket.OPEN) {
            okxWs.send('ping');
        }
    }, 25000);
}

// Helper function to broadcast to all clients with optimizations
// Throttle broadcast failure logs to reduce spam
let lastBroadcastFailureLog = 0;
const BROADCAST_LOG_THROTTLE = 10000; // 10 seconds

function broadcastToClients(data) {
    let sentCount = 0;
    let totalClients = 0;
    let openClients = 0;
    let deadClients = [];
    
    // Pre-serialize data once instead of per client
    const serializedData = JSON.stringify(data);
    
    wss.clients.forEach(client => {
        totalClients++;
        if (client.readyState === WebSocket.OPEN) {
            openClients++;
            if (!client.isMonitoringClient) {
                try {
                    client.send(serializedData);
                    sentCount++;
                } catch (error) {
                    // Only log individual send errors occasionally
                    const now = Date.now();
                    if (now - lastBroadcastFailureLog > BROADCAST_LOG_THROTTLE) {
                        logger.warn('Failed to send message to client', error.message);
                        lastBroadcastFailureLog = now;
                    }
                    deadClients.push(client);
                }
            }
        } else if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
            deadClients.push(client);
        }
    });
    
    // Clean up dead connections to prevent memory leaks
    deadClients.forEach(client => {
        try {
            client.terminate();
        } catch (e) {
            // Ignore errors during cleanup
        }
    });
    
    // Throttle broadcast failure warnings to reduce log spam
    if (sentCount === 0 && openClients > 0) {
        const now = Date.now();
        if (now - lastBroadcastFailureLog > BROADCAST_LOG_THROTTLE) {
            logger.warn(`Failed to broadcast ${data.type} to ${openClients} clients (monitoring clients excluded)`);
            lastBroadcastFailureLog = now;
        }
    }
}

// Helper function to broadcast to monitoring dashboard clients
function broadcastToMonitoringClients(data) {
    const serializedData = JSON.stringify(data);
    let deadClients = [];
    
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.isMonitoringClient) {
            try {
                client.send(serializedData);
            } catch (error) {
                logger.warn('Failed to send monitoring data to client', error.message);
                deadClients.push(client);
            }
        } else if (client.readyState === WebSocket.CLOSED || client.readyState === WebSocket.CLOSING) {
            deadClients.push(client);
        }
    });
    
    // Clean up dead monitoring connections
    deadClients.forEach(client => {
        try {
            client.terminate();
        } catch (e) {
            // Ignore errors during cleanup
        }
    });
}

// Initialize performance monitoring
const performanceMonitor = new PerformanceMonitor({
    collectInterval: 5000,
    historySize: 1440,
    cpuThreshold: 80,
    memoryThreshold: 85,
    responseThreshold: 5000,
    errorThreshold: 95,  // Set very high to avoid false alerts
    connectionThreshold: 900,
    logPath: './logs/performance.log',
    enabled: true
});

// Initialize alert manager
const alertManager = new AlertManager({
    cpuWarning: 70,
    cpuCritical: 85,
    memoryWarning: 75,
    memoryCritical: 90,
    responseTimeWarning: 2000,
    responseTimeCritical: 5000,
    errorRateWarning: 5,
    errorRateCritical: 15,
    cooldownPeriod: 5 * 60 * 1000, // 5 minutes
    enableWebhookAlerts: process.env.WEBHOOK_URL ? true : false,
    webhookUrl: process.env.WEBHOOK_URL
});

// Reset counters to avoid initial false alerts
performanceMonitor.resetCounters();

// Listen to performance events (temporarily disabled to avoid spam)
// performanceMonitor.on('alert', (alert) => {
//     console.warn(`Performance Alert: ${alert.message}`);
//     // Broadcast alert to monitoring dashboard clients
//     broadcastToMonitoringClients({
//         type: 'performance_alert',
//         data: alert
//     });
// });

performanceMonitor.on('metric', (metric) => {
    // Check for alerts
    alertManager.checkMetrics(metric.data);
    
    // Broadcast metrics to monitoring dashboard clients
    broadcastToMonitoringClients({
        type: 'performance_metrics',
        data: metric.data
    });
});

// Start OKX WebSocket connection
connectOKXWebSocket();

// Initialize and start data scheduler with broadcast callback
const dataScheduler = new MarketDataScheduler(broadcastToClients);
dataScheduler.collectInitialData().then(() => {
    dataScheduler.start();
});

// API Endpoints

// Performance Monitoring API Endpoints
app.get('/api/monitoring/status', (req, res) => {
    try {
        const status = performanceMonitor.getStatus();
        res.json(createAPIResponse.success(status, 'Monitoring status retrieved successfully'));
    } catch (error) {
        console.error('Error getting monitoring status:', error);
        res.status(500).json(createAPIResponse.error('Failed to get monitoring status', null, 500));
    }
});

app.get('/api/monitoring/metrics/:type', (req, res) => {
    try {
        const { type } = req.params;
        const { startTime, endTime } = req.query;
        
        let metrics;
        if (startTime && endTime) {
            metrics = performanceMonitor.getMetricsRange(type, parseInt(startTime), parseInt(endTime));
        } else {
            metrics = performanceMonitor.metrics[type] || [];
        }
        
        res.json(createAPIResponse.success(metrics, 'Metrics retrieved successfully'));
    } catch (error) {
        console.error('Error getting metrics:', error);
        res.status(500).json(createAPIResponse.error('Failed to get metrics', null, 500));
    }
});

app.get('/api/monitoring/export/:type', (req, res) => {
    try {
        const { type } = req.params;
        const { format = 'json' } = req.query;
        
        const data = performanceMonitor.exportMetrics(type, format);
        
        if (format === 'csv') {
            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="${type}_metrics.csv"`);
        } else {
            res.setHeader('Content-Type', 'application/json');
        }
        
        res.send(data);
    } catch (error) {
        console.error('Error exporting metrics:', error);
        res.status(500).json(createAPIResponse.error('Failed to export metrics', null, 500));
    }
});

app.post('/api/monitoring/reset-counters', (req, res) => {
    try {
        performanceMonitor.resetCounters();
        res.json(createAPIResponse.success(null, 'Counters reset successfully'));
    } catch (error) {
        console.error('Error resetting counters:', error);
        res.status(500).json(createAPIResponse.error('Failed to reset counters', null, 500));
    }
});

/**
 * @swagger
 * /api/monitoring/alerts:
 *   get:
 *     tags:
 *       - Monitoring
 *     summary: Get active alerts
 *     description: Retrieve all currently active alerts
 *     responses:
 *       200:
 *         description: Active alerts retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   type:
 *                     type: string
 *                   severity:
 *                     type: string
 *                     enum: [warning, critical]
 *                   message:
 *                     type: string
 *                   value:
 *                     type: number
 *                   threshold:
 *                     type: number
 *                   timestamp:
 *                     type: string
 *                     format: date-time
 */
app.get('/api/monitoring/alerts', (req, res) => {
    try {
        const activeAlerts = alertManager.getActiveAlerts();
        res.json(createAPIResponse.success(activeAlerts, 'Active alerts retrieved successfully'));
    } catch (error) {
        logger.error('Error getting alerts:', error);
        res.status(500).json(createAPIResponse.error('Failed to get alerts', null, 500));
    }
});

/**
 * @swagger
 * /api/monitoring/alerts/history:
 *   get:
 *     tags:
 *       - Monitoring
 *     summary: Get alert history
 *     description: Retrieve historical alert data
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *         description: Maximum number of alerts to return
 *     responses:
 *       200:
 *         description: Alert history retrieved successfully
 */
app.get('/api/monitoring/alerts/history', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 100;
        const history = alertManager.getAlertHistory(limit);
        res.json(createAPIResponse.success(history, 'Alert history retrieved successfully'));
    } catch (error) {
        logger.error('Error getting alert history:', error);
        res.status(500).json(createAPIResponse.error('Failed to get alert history', null, 500));
    }
});

/**
 * @swagger
 * /api/monitoring/alerts/stats:
 *   get:
 *     tags:
 *       - Monitoring
 *     summary: Get alert statistics
 *     description: Retrieve alert statistics and metrics
 *     responses:
 *       200:
 *         description: Alert statistics retrieved successfully
 */
app.get('/api/monitoring/alerts/stats', (req, res) => {
    try {
        const stats = alertManager.getAlertStats();
        res.json(createAPIResponse.success(stats, 'Alert statistics retrieved successfully'));
    } catch (error) {
        logger.error('Error getting alert stats:', error);
        res.status(500).json(createAPIResponse.error('Failed to get alert stats', null, 500));
    }
});


// Serve 404 page
app.get('/404.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', '404.html'));
});

/**
 * @swagger
 * /api/markets:
 *   get:
 *     tags:
 *       - Market Data
 *     summary: Get all market prices
 *     description: Retrieve current prices for all available markets
 *     responses:
 *       200:
 *         description: Market prices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardAPIResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       additionalProperties:
 *                         $ref: '#/components/schemas/MarketPrice'
 *             example:
 *               success: true
 *               message: "Market prices retrieved successfully"
 *               timestamp: "2025-08-23T10:25:31.868Z"
 *               data:
 *                 BTC-USDT:
 *                   price: 45000
 *                   change: 500
 *                   change_rate: 0.011
 *                   high_price: 46000
 *                   low_price: 44000
 *                   volume: 1500000
 */
/**
 * @swagger
 * /api/markets:
 *   get:
 *     summary: Get all market prices
 *     description: Retrieve current prices for all supported cryptocurrency markets
 *     tags: [Markets]
 *     responses:
 *       200:
 *         description: Market prices retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *             example:
 *               success: true
 *               data:
 *                 BTC-USDT:
 *                   price: 45000.00
 *                   change: 0.025
 *                   volume: 1500000
 *                   high_price: 46000
 *                   low_price: 44000
 *               message: "Market prices retrieved successfully"
 */
app.get('/api/markets', (req, res) => {
    res.json(createAPIResponse.success(marketPrices, 'Market prices retrieved successfully'));
});

/**
 * @swagger
 * /api/price/{market}:
 *   get:
 *     tags:
 *       - Market Data
 *     summary: Get price for specific market
 *     description: Retrieve current price data for a specific trading pair
 *     parameters:
 *       - in: path
 *         name: market
 *         schema:
 *           type: string
 *           default: BTC-USDT
 *         description: Trading pair (e.g., BTC-USDT, ETH-USDT)
 *     responses:
 *       200:
 *         description: Price data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardAPIResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/MarketPrice'
 *       500:
 *         description: Failed to fetch price
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardAPIError'
 */
// Get current price for specific market
app.get('/api/price/:market?', async (req, res) => {
    try {
        const market = req.params.market || 'BTC-USDT';
        const response = await axios.get(`https://www.okx.com/api/v5/market/ticker?instId=${market}`);
        res.json(createAPIResponse.success(response.data.data[0], 'Price data retrieved successfully'));
    } catch (error) {
        res.status(500).json(createAPIResponse.error('Failed to fetch price', null, 500));
    }
});

// Get price history
app.get('/api/history', (req, res) => {
    res.json(createAPIResponse.success(priceHistory, 'Price history retrieved successfully'));
});

// Get order book
app.get('/api/orderbook/:market?', async (req, res) => {
    try {
        const market = req.params.market || 'BTC-USDT';
        const response = await axios.get(`https://www.okx.com/api/v5/market/books?instId=${market}&sz=400`);
        res.json(createAPIResponse.success(response.data.data[0], 'Order book retrieved successfully'));
    } catch (error) {
        res.status(500).json(createAPIResponse.error('Failed to fetch orderbook', null, 500));
    }
});

/**
 * @swagger
 * /api/candles/{interval}:
 *   get:
 *     summary: Get historical candle data
 *     description: Retrieve candlestick data for chart visualization
 *     tags: [Markets]
 *     parameters:
 *       - in: path
 *         name: interval
 *         required: true
 *         schema:
 *           type: string
 *           enum: [1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d]
 *         description: Candle interval
 *       - in: query
 *         name: market
 *         schema:
 *           type: string
 *           default: BTC-USDT
 *         description: Trading pair
 *       - in: query
 *         name: count
 *         schema:
 *           type: integer
 *           default: 2000
 *         description: Number of candles to retrieve
 *     responses:
 *       200:
 *         description: Candle data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/APIResponse'
 *             example:
 *               success: true
 *               data:
 *                 - time: 1640995200
 *                   open: 45000.00
 *                   high: 45500.00
 *                   low: 44800.00
 *                   close: 45200.00
 *                   volume: 125.5
 */
app.get('/api/candles/:interval', async (req, res) => {
    try {
        const { interval } = req.params;
        const limit = parseInt(req.query.count) || 2000; // Request more historical data
        let market = req.query.market || 'BTC-USDT';
        
        // Convert market format for OKX API
        if (market === 'BTC-USDT' || market === 'ETH-USDT') {
            // Use OKX format directly
        } else {
            // Convert from frontend format if needed
            market = market.replace('/', '-');
        }
        
        let unit = 1;
        let bar = '1m';
        switch(interval) {
            case '1m':
                unit = 1;
                bar = '1m';
                break;
            case '3m':
                unit = 3;
                bar = '3m';
                break;
            case '5m':
                unit = 5;
                bar = '5m';
                break;
            case '10m':
                unit = 10;
                bar = '10m';
                break;
            case '15m':
                unit = 15;
                bar = '15m';
                break;
            case '30m':
                unit = 30;
                bar = '30m';
                break;
            case '1h':
                unit = 60;
                bar = '1H';
                break;
            case '4h':
                unit = 240;
                bar = '4H';
                break;
            case '1d':
                unit = 1440;
                bar = '1D';
                break;
            default:
                unit = 1;
                bar = '1m';
        }
        
        // Step 1: Get database data (skip aggregation for long timeframes due to insufficient data)
        let dbCandles = [];
        
        // For 1D and 4H, skip DB aggregation and use API data only (insufficient 1m data for aggregation)
        const skipDBForLongTimeframes = ['1d', '4h'].includes(interval);
        
        if (!skipDBForLongTimeframes) {
            try {
                // Get ALL candles from DB (up to 10000)
                const allDbCandles = await dataScheduler.getAllStoredData(market, unit);
                
                if (allDbCandles && allDbCandles.length > 0) {
                    dbCandles = allDbCandles
                        .map(candle => ({
                            time: Math.floor(candle.timestamp / 1000),
                            open: parseFloat(candle.open),
                            high: parseFloat(candle.high),
                            low: parseFloat(candle.low),
                            close: parseFloat(candle.close),
                            volume: parseFloat(candle.volume)
                        }))
                        .filter(candle => !isNaN(candle.time) && !isNaN(candle.open) && !isNaN(candle.high) && !isNaN(candle.low) && !isNaN(candle.close) && !isNaN(candle.volume))
                        .sort((a, b) => a.time - b.time); // Sort by time ascending
                    
                    console.log(`Processed ${dbCandles.length} valid candles from DB for ${market} ${interval}`);
                }
            } catch (dbError) {
                logger.debug('Database fetch error:', dbError.message);
            }
        } else {
            console.log(`Skipping DB aggregation for ${interval} due to insufficient 1m data, using API only`);
        }
        
        // Step 2: Get more historical data from API (multiple requests if needed)
        let apiCandles = [];
        try {
            // Calculate how many API requests we need (max 200 per request)
            const requestsNeeded = Math.ceil(limit / 200);
            const maxRequests = Math.min(requestsNeeded, 5); // Limit to 5 requests (1000 candles)
            
            console.log(`Will fetch up to ${maxRequests * 200} candles from API for ${market} ${interval}`);
            
            for (let i = 0; i < maxRequests; i++) {
                try {
                    // For subsequent requests, we need to specify 'after' parameter
                    let endpoint = `https://www.okx.com/api/v5/market/history-candles?instId=${market}&bar=${bar}&limit=200`;
                    
                    if (apiCandles.length > 0) {
                        // Get older data by using the timestamp of the oldest candle
                        const oldestTime = apiCandles[0].time * 1000;
                        endpoint += `&after=${oldestTime}`;
                    }
                    
                    const response = await axios.get(endpoint);
                    
                    if (response.data && response.data.data && response.data.data.length > 0) {
                        const newCandles = response.data.data.reverse().map(candle => ({
                            time: Math.floor(parseInt(candle[0]) / 1000),
                            open: parseFloat(candle[1]),
                            high: parseFloat(candle[2]),
                            low: parseFloat(candle[3]),
                            close: parseFloat(candle[4]),
                            volume: parseFloat(candle[5])
                        }));
                        
                        // Prepend older candles to the beginning
                        apiCandles = [...newCandles, ...apiCandles];
                        
                        console.log(`Fetched batch ${i + 1}: ${newCandles.length} candles`);
                        
                        // If we got less than 200, no more data available
                        if (newCandles.length < 200) {
                            break;
                        }
                        
                        // Small delay between requests to avoid rate limiting
                        if (i < maxRequests - 1) {
                            await new Promise(resolve => setTimeout(resolve, 100));
                        }
                    } else {
                        break;
                    }
                } catch (batchError) {
                    console.log(`Batch ${i + 1} failed:`, batchError.message);
                    break;
                }
            }
            
            console.log(`Total fetched: ${apiCandles.length} candles from OKX API for ${market} ${interval}`);
            
        } catch (apiError) {
            logger.debug('API fetch error (using DB only):', apiError.message);
        }
        
        // Step 3: Merge data - combine historical API data with recent DB data
        let mergedCandles = [];
        
        if (apiCandles.length > 0 && dbCandles.length > 0) {
            // Find the overlap point
            const earliestDbTime = dbCandles[0].time;
            const latestDbTime = dbCandles[dbCandles.length - 1].time;
            
            // Get older API candles (before DB data)
            const olderApiCandles = apiCandles.filter(c => c.time < earliestDbTime);
            
            // Get newer API candles (after DB data) 
            const newerApiCandles = apiCandles.filter(c => c.time > latestDbTime);
            
            // Merge: older API data + DB data + newer API data
            mergedCandles = [...olderApiCandles, ...dbCandles, ...newerApiCandles];
            
            console.log(`Merged: ${olderApiCandles.length} older API + ${dbCandles.length} DB + ${newerApiCandles.length} newer API = ${mergedCandles.length} total`);
            
            // Save both older and newer candles to database for future use
            if (dataScheduler && dataScheduler.collector) {
                const allNewCandles = [...olderApiCandles, ...newerApiCandles];
                if (allNewCandles.length > 0) {
                    const candlesToSave = allNewCandles.map(c => ({
                        instId: market,
                        timestamp: c.time * 1000,
                        open: c.open,
                        high: c.high,
                        low: c.low,
                        close: c.close,
                        volume: c.volume,
                        volCcy: 0,
                        bar: bar
                    }));
                    dataScheduler.collector.saveCandles(candlesToSave, bar);
                    console.log(`Saved ${candlesToSave.length} candles to DB (${olderApiCandles.length} older + ${newerApiCandles.length} newer)`);
                }
            }
        } else if (dbCandles.length > 0) {
            // Only DB data available
            mergedCandles = dbCandles;
            console.log(`Using ${dbCandles.length} candles from DB only`);
        } else if (apiCandles.length > 0) {
            // Only API data available
            mergedCandles = apiCandles;
            console.log(`Using ${apiCandles.length} candles from API only`);
        }
        
        // Sort and send final result
        mergedCandles.sort((a, b) => a.time - b.time);
        
        // Limit response size to prevent memory issues
        const MAX_CANDLES_RESPONSE = 5000;
        if (mergedCandles.length > MAX_CANDLES_RESPONSE) {
            mergedCandles = mergedCandles.slice(-MAX_CANDLES_RESPONSE);
            logger.warn(`Candle response truncated from ${mergedCandles.length} to ${MAX_CANDLES_RESPONSE} points`);
        }
        
        res.json(createAPIResponse.success(mergedCandles, `Candle data retrieved successfully (${mergedCandles.length} points)`));
    } catch (error) {
        console.error('Failed to fetch candles:', error);
        res.status(500).json(createAPIResponse.error('Failed to fetch candle data', null, 500));
    }
});

// Delete all market data endpoint (admin only)
app.delete('/api/candles/all', async (req, res) => {
    try {
        const { pool } = require('./database');
        await pool.query('TRUNCATE TABLE candles RESTART IDENTITY;');
        
        console.log('All market data deleted successfully');
        res.json(createAPIResponse.success(null, 'All market data deleted successfully'));
    } catch (error) {
        console.error('Failed to delete market data:', error);
        res.status(500).json(createAPIResponse.error('Failed to delete market data', null, 500));
    }
});

// Authentication middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json(createAPIResponse.error('Authentication required', null, 401));
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json(createAPIResponse.error('Invalid token', null, 403));
        req.user = user;
        next();
    });
};

/**
 * @swagger
 * /api/register:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: Register a new user
 *     description: Create a new user account with username and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 minLength: 3
 *                 maxLength: 20
 *                 pattern: '^[a-zA-Z0-9_]+$'
 *                 example: 'testuser123'
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 pattern: '^(?=.*[A-Za-z])(?=.*\d)'
 *                 example: 'password123'
 *     responses:
 *       200:
 *         description: User registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error or username already exists
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       429:
 *         description: Too many registration attempts
 */
// User registration with validation
app.post('/api/register', 
    authLimiter,
    ...validationRules.register,
    async (req, res) => {
        try {
            // Validation is handled by middleware
            const { username, password } = req.body;
            
            const userId = await createUser(username, password);
            const token = jwt.sign({ id: userId, username }, JWT_SECRET, { expiresIn: '7d' });
            
            logger.info(`New user registered: ${username}`);
            res.json({ success: true, token, username, message: 'User registered successfully', timestamp: new Date().toISOString() });
        } catch (error) {
            if (error.code === 'SQLITE_CONSTRAINT') {
                res.status(400).json(createAPIResponse.error('This username is already taken', null, 400));
            } else {
                logger.error('Registration error:', error);
                res.status(500).json(createAPIResponse.error('Registration failed. Please try again later', null, 500));
            }
        }
    }
);

/**
 * @swagger
 * /api/login:
 *   post:
 *     tags:
 *       - Authentication
 *     summary: User login
 *     description: Authenticate user with username and password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - password
 *             properties:
 *               username:
 *                 type: string
 *                 example: 'testuser123'
 *               password:
 *                 type: string
 *                 example: 'password123'
 *     responses:
 *       200:
 *         description: Login successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AuthResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid credentials
 *       429:
 *         description: Too many login attempts
 */
// User login with validation
app.post('/api/login',
    authLimiter,
    ...validationRules.login,
    async (req, res) => {
        try {
            // Validation is handled by middleware
            const { username, password } = req.body;
            
            const user = await authenticateUser(username, password);
            
            if (!user) {
                logger.warn(`Failed login attempt for username: ${username}`);
                return res.status(401).json(createAPIResponse.error('Incorrect username or password', null, 401));
            }
            
            const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
            logger.info(`User logged in: ${username}`);
            res.json({ success: true, token, username: user.username, message: 'Login successful', timestamp: new Date().toISOString() });
        } catch (error) {
            logger.error('Login error:', error);
            res.status(500).json(createAPIResponse.error('Login failed. Please try again later', null, 500));
        }
    }
);

/**
 * @swagger
 * /api/user/data:
 *   get:
 *     tags:
 *       - User Data
 *     summary: Get user data
 *     description: Retrieve user's trading data including balances and transactions
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UserData'
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Invalid token
 *       404:
 *         description: User data not found
 */
// Get user data
app.get('/api/user/data', authenticateToken, async (req, res) => {
    try {
        const userData = await getUserData(req.user.id);
        
        if (!userData) {
            return res.status(404).json(createAPIResponse.error('User data not found', null, 404));
        }
        
        const responseData = {
            id: req.user.id,
            username: req.user.username,
            usdBalance: userData.usd_balance,
            btcBalance: userData.btc_balance,
            transactions: userData.transactions,
            leveragePositions: userData.leverage_positions,
            timezone: userData.timezone || 'UTC',
            memberSince: userData.member_since,
            role: userData.role || 'user'
        };
        res.json(createAPIResponse.success(responseData, 'User data retrieved successfully'));
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json(createAPIResponse.error('Failed to fetch user data', null, 500));
    }
});

// Update user data
app.post('/api/user/data', authenticateToken, async (req, res) => {
    try {
        await updateUserData(req.user.id, req.body);
        res.json(createAPIResponse.success(null, 'User data updated successfully'));
    } catch (error) {
        console.error('Error updating user data:', error);
        res.status(500).json(createAPIResponse.error('Failed to update user data', null, 500));
    }
});

/**
 * @swagger
 * /api/rankings:
 *   get:
 *     tags:
 *       - Rankings
 *     summary: Get investment rankings
 *     description: Retrieve top performing users (excludes demo accounts)
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Number of rankings to return
 *     responses:
 *       200:
 *         description: Rankings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardAPIResponse'
 *       500:
 *         description: Server error
 */
// Get investment rankings
app.get('/api/rankings', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const rankings = await getRankings(limit);
        
        res.json(createAPIResponse.success({
            rankings,
            totalUsers: rankings.length,
            lastUpdated: new Date().toISOString()
        }, 'Rankings retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching rankings:', { error: error.message, stack: error.stack });
        res.status(500).json(createAPIResponse.error('Failed to fetch rankings', null, 500));
    }
});

/**
 * @swagger
 * /api/rankings/user/{userId}:
 *   get:
 *     tags:
 *       - Rankings
 *     summary: Get specific user ranking
 *     description: Get ranking information for a specific user
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID to get ranking for
 *     responses:
 *       200:
 *         description: User ranking retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardAPIResponse'
 *       404:
 *         description: User not found or user is demo account
 *       500:
 *         description: Server error
 */
// Get specific user ranking
app.get('/api/rankings/user/:userId', async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        if (!userId || userId <= 0) {
            return res.status(400).json(createAPIResponse.error('Invalid user ID', null, 400));
        }
        
        const userRanking = await getUserRanking(userId);
        
        if (!userRanking) {
            return res.status(404).json(createAPIResponse.error('User not found or user is demo account', null, 404));
        }
        
        res.json(createAPIResponse.success(userRanking, 'User ranking retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching user ranking:', { userId: req.params.userId, error: error.message, stack: error.stack });
        res.status(500).json(createAPIResponse.error('Failed to fetch user ranking', null, 500));
    }
});

/**
 * @swagger
 * /api/account/type:
 *   post:
 *     tags:
 *       - Account
 *     summary: Update account type
 *     description: Update user account type (real/demo)
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               accountType:
 *                 type: string
 *                 enum: ['real', 'demo']
 *                 description: Account type
 *             required:
 *               - accountType
 *     responses:
 *       200:
 *         description: Account type updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardAPIResponse'
 *       400:
 *         description: Invalid account type
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Server error
 */
// Update account type
app.post('/api/account/type', authenticateToken, async (req, res) => {
    try {
        const { accountType } = req.body;
        
        if (!accountType || !['real', 'demo'].includes(accountType)) {
            return res.status(400).json(createAPIResponse.error('Invalid account type. Must be "real" or "demo"', null, 400));
        }
        
        await updateAccountType(req.user.id, accountType);
        
        res.json(createAPIResponse.success(
            { accountType }, 
            `Account type updated to ${accountType} successfully`
        ));
    } catch (error) {
        logger.error('Error updating account type:', { userId: req.user.id, accountType: req.body.accountType, error: error.message, stack: error.stack });
        res.status(500).json(createAPIResponse.error('Failed to update account type', null, 500));
    }
});

// ==================== ALERT & STOP ORDER ENDPOINTS ====================

/**
 * @swagger
 * /api/alerts/settings:
 *   get:
 *     tags:
 *       - Alerts
 *     summary: Get alert settings
 *     description: Get user's alert notification settings
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Alert settings retrieved successfully
 *       401:
 *         description: Authentication required
 */
app.get('/api/alerts/settings', authenticateToken, async (req, res) => {
    try {
        const settings = await getAlertSettings(req.user.id);
        res.json(createAPIResponse.success(settings, 'Alert settings retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching alert settings:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to fetch alert settings', null, 500));
    }
});

/**
 * @swagger
 * /api/alerts/settings:
 *   post:
 *     tags:
 *       - Alerts
 *     summary: Update alert settings
 *     description: Update user's alert notification settings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               price_alert_enabled:
 *                 type: boolean
 *               price_alert_threshold:
 *                 type: number
 *                 minimum: 0.1
 *                 maximum: 10
 *               email_alerts:
 *                 type: boolean
 *               browser_alerts:
 *                 type: boolean
 *               sound_enabled:
 *                 type: boolean
 */
app.post('/api/alerts/settings', authenticateToken, async (req, res) => {
    try {
        await updateAlertSettings(req.user.id, req.body);
        res.json(createAPIResponse.success(null, 'Alert settings updated successfully'));
    } catch (error) {
        logger.error('Error updating alert settings:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to update alert settings', null, 500));
    }
});

/**
 * @swagger
 * /api/stop-orders:
 *   post:
 *     tags:
 *       - Stop Orders
 *     summary: Create stop loss or take profit order
 *     security:
 *       - bearerAuth: []
 */
app.post('/api/stop-orders', authenticateToken, async (req, res) => {
    try {
        const orderData = {
            user_id: req.user.id,
            ...req.body
        };
        
        const orderId = await createStopOrder(orderData);
        res.json(createAPIResponse.success({ orderId }, 'Stop order created successfully'));
    } catch (error) {
        logger.error('Error creating stop order:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to create stop order', null, 500));
    }
});

/**
 * @swagger
 * /api/stop-orders:
 *   get:
 *     tags:
 *       - Stop Orders
 *     summary: Get active stop orders
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/stop-orders', authenticateToken, async (req, res) => {
    try {
        const { market } = req.query;
        const orders = await getActiveStopOrders(req.user.id, market);
        res.json(createAPIResponse.success(orders, 'Stop orders retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching stop orders:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to fetch stop orders', null, 500));
    }
});

/**
 * @swagger
 * /api/stop-orders/{orderId}:
 *   delete:
 *     tags:
 *       - Stop Orders
 *     summary: Cancel stop order
 *     security:
 *       - bearerAuth: []
 */
app.delete('/api/stop-orders/:orderId', authenticateToken, async (req, res) => {
    try {
        const orderId = parseInt(req.params.orderId);
        const success = await cancelStopOrder(orderId, req.user.id);
        
        if (success) {
            res.json(createAPIResponse.success(null, 'Stop order cancelled successfully'));
        } else {
            res.status(404).json(createAPIResponse.error('Stop order not found', null, 404));
        }
    } catch (error) {
        logger.error('Error cancelling stop order:', { orderId: req.params.orderId, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to cancel stop order', null, 500));
    }
});

/**
 * @swagger
 * /api/alerts/unacknowledged:
 *   get:
 *     tags:
 *       - Alerts
 *     summary: Get unacknowledged alerts
 *     security:
 *       - bearerAuth: []
 */
app.get('/api/alerts/unacknowledged', authenticateToken, async (req, res) => {
    try {
        const alerts = await getUnacknowledgedAlerts(req.user.id);
        res.json(createAPIResponse.success(alerts, 'Alerts retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching alerts:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to fetch alerts', null, 500));
    }
});

/**
 * @swagger
 * /api/alerts/acknowledge:
 *   post:
 *     tags:
 *       - Alerts
 *     summary: Acknowledge alerts
 *     security:
 *       - bearerAuth: []
 */
app.post('/api/alerts/acknowledge', authenticateToken, async (req, res) => {
    try {
        const { alertIds } = req.body;
        await acknowledgeAlerts(req.user.id, alertIds);
        res.json(createAPIResponse.success(null, 'Alerts acknowledged successfully'));
    } catch (error) {
        logger.error('Error acknowledging alerts:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to acknowledge alerts', null, 500));
    }
});

/**
 * @swagger
 * /api/chart/settings:
 *   post:
 *     tags:
 *       - Chart Settings
 *     summary: Save chart settings
 *     description: Save user's chart configuration including indicators and drawings
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - market
 *             properties:
 *               market:
 *                 type: string
 *                 example: "BTC-USDT"
 *                 description: Trading pair
 *               indicators:
 *                 type: object
 *                 additionalProperties:
 *                   type: boolean
 *                 example: {"ma": true, "rsi": false}
 *               indicatorSettings:
 *                 type: object
 *                 additionalProperties:
 *                   type: object
 *                 example: {"ma": {"period": 20}}
 *               drawings:
 *                 type: array
 *                 items:
 *                   type: object
 *                 example: [{"type": "trendline", "points": [1, 2]}]
 *               chartType:
 *                 type: string
 *                 enum: [candlestick, line, area]
 *                 default: candlestick
 *     responses:
 *       200:
 *         description: Chart settings saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/StandardAPIResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: "null"
 *       400:
 *         description: Market is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardAPIError'
 *       401:
 *         $ref: '#/components/responses/UnauthorizedError'
 *       500:
 *         description: Failed to save chart settings
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/StandardAPIError'
 */
// Chart settings APIs
// Save chart settings
app.post('/api/chart/settings', authenticateToken, async (req, res) => {
    try {
        const { market, indicators, indicatorSettings, drawings, chartType } = req.body;
        
        if (!market) {
            return res.status(400).json(createAPIResponse.error('Market is required', null, 400));
        }

        await saveChartSettings(req.user.id, market, {
            indicators,
            indicatorSettings,
            drawings,
            chartType
        });
        
        res.json(createAPIResponse.success(null, 'User data updated successfully'));
    } catch (error) {
        console.error('Error saving chart settings:', error);
        res.status(500).json(createAPIResponse.error('Failed to save chart settings', null, 500));
    }
});

// Get chart settings
app.get('/api/chart/settings/:market', authenticateToken, async (req, res) => {
    try {
        const { market } = req.params;
        const settings = await getChartSettings(req.user.id, market);
        
        res.json(createAPIResponse.success(settings || null, 'Chart settings retrieved successfully'));
    } catch (error) {
        console.error('Error getting chart settings:', error);
        res.status(500).json(createAPIResponse.error('Failed to get chart settings', null, 500));
    }
});

// Delete chart settings
app.delete('/api/chart/settings/:market', authenticateToken, async (req, res) => {
    try {
        const { market } = req.params;
        await deleteChartSettings(req.user.id, market);
        
        res.json(createAPIResponse.success(null, 'User data updated successfully'));
    } catch (error) {
        console.error('Error deleting chart settings:', error);
        res.status(500).json(createAPIResponse.error('Failed to delete chart settings', null, 500));
    }
});

// Helper function to verify JWT from WebSocket request
function verifyWebSocketAuth(request) {
    try {
        // Extract token from query string or authorization header
        const url = new URL(request.url, `http://${request.headers.host}`);
        const token = url.searchParams.get('token') || 
                     request.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return null;
        }
        
        const decoded = jwt.verify(token, JWT_SECRET);
        return decoded;
    } catch (error) {
        logger.warn('WebSocket authentication failed', { error: error.message });
        return null;
    }
}

// Handle WebSocket upgrade with authentication
server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
    logger.info('WebSocket upgrade request', { pathname, url: request.url });
    
    // Verify authentication for protected WebSocket endpoints
    if (pathname === '/chat') {
        logger.info('Chat WebSocket upgrade attempt');
        const auth = verifyWebSocketAuth(request);
        if (!auth) {
            logger.warn('Chat WebSocket authentication failed');
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
            return;
        }
        
        logger.info('Chat WebSocket authentication successful', { userId: auth.id, username: auth.username });
        chatWss.handleUpgrade(request, socket, head, (ws) => {
            ws.auth = auth; // Attach auth info to WebSocket
            chatWss.emit('connection', ws, request);
        });
    } else {
        logger.debug('Market data WebSocket upgrade');
        // Market data WebSocket (public, but can add rate limiting)
        wss.handleUpgrade(request, socket, head, (ws) => {
            wss.emit('connection', ws, request);
        });
    }
});

// Chat WebSocket connection handler
chatWss.on('connection', (ws) => {
    // Authentication already verified in upgrade handler
    const userId = ws.auth?.id;
    const username = ws.auth?.username;
    const isAuthenticated = true;
    
    // Store client immediately
    if (userId && username) {
        chatClients.set(ws, { userId, username });
        logger.info('Chat WebSocket client connected', { userId, username });
    }
    
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'auth') {
                // Auth already handled in upgrade, send success response
                if (ws.auth) {
                    try {
                        // Send chat history
                        const history = await getChatHistory(50);
                        ws.send(JSON.stringify({
                            type: 'history',
                            messages: history.map(msg => ({
                                ...msg,
                                timestamp: msg.created_at,
                                // Ensure metadata is parsed if it's a string
                                metadata: typeof msg.metadata === 'string' ? 
                                    JSON.parse(msg.metadata) : msg.metadata
                            }))
                        }));
                        
                        // Send online count
                        broadcastOnlineCount();
                        
                        // Only notify if this is actually a new connection (not a reconnection)
                        const existingConnections = Array.from(chatClients.values()).filter(client => client.username === username);
                        if (existingConnections.length <= 1) {
                            broadcastSystemMessage(`${username} joined the chat`);
                        }
                        
                    } catch (error) {
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Failed to load chat history'
                        }));
                        logger.error('Chat history error', { error: error.message });
                    }
                }
            } else if (isAuthenticated) {
                // Handle authenticated messages
                if (data.type === 'message') {
                    // Save to database
                    const savedMessage = await saveChatMessage(
                        userId,
                        username,
                        data.message,
                        'message'
                    );
                    
                    // Broadcast to all clients
                    broadcastChatMessage({
                        type: 'message',
                        username: username,
                        message: data.message,
                        timestamp: savedMessage.created_at
                    });
                    
                } else if (data.type === 'trade_share') {
                    // Save trade share to database
                    const metadata = {
                        tradeType: data.tradeType,
                        leverage: data.leverage,
                        entryPrice: data.entryPrice,
                        exitPrice: data.exitPrice,
                        pnl: data.pnl
                    };
                    
                    const savedMessage = await saveChatMessage(
                        userId,
                        username,
                        data.message,
                        'trade_share',
                        metadata
                    );
                    
                    // Broadcast trade share
                    broadcastChatMessage({
                        type: 'trade_share',
                        username: username,
                        message: data.message,
                        ...metadata,
                        timestamp: savedMessage.created_at
                    });
                }
            }
        } catch (error) {
            logger.error('Chat message error:', error);
        }
    });
    
    ws.on('close', () => {
        if (isAuthenticated && username) {
            chatClients.delete(ws);
            broadcastOnlineCount();
            broadcastSystemMessage(`${username} left the chat`);
        }
    });
    
    ws.on('error', (error) => {
        logger.error('Chat WebSocket error:', error);
    });
});

// Broadcast functions for chat
function broadcastChatMessage(data) {
    const message = JSON.stringify(data);
    chatClients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

function broadcastSystemMessage(text) {
    const message = JSON.stringify({
        type: 'system',
        message: text
    });
    chatClients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

function broadcastOnlineCount() {
    const count = chatClients.size;
    logger.info('Broadcasting online count', { count, clientsSize: chatClients.size });
    const message = JSON.stringify({
        type: 'online_count',
        count: count
    });
    chatClients.forEach((client, ws) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
        }
    });
}

// WebSocket connection handler for market data
wss.on('connection', (ws, req) => {
    // Initially assume it's a trading client
    ws.isMonitoringClient = false;
    
    logger.debug('New WebSocket client connected');
    
    // Send current price immediately (will be ignored by monitoring clients)
    if (currentPrice > 0) {
        ws.send(JSON.stringify({
            type: 'price_update',
            data: { price: currentPrice }
        }));
    }
    
    // Handle all client messages
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            if (data.type === 'client_identification' && data.clientType === 'monitoring') {
                // Convert to monitoring client
                ws.isMonitoringClient = true;
                logger.debug('Client identified as monitoring dashboard');
                
                // Send current performance status
                const status = performanceMonitor.getStatus();
                ws.send(JSON.stringify({
                    type: 'performance_metrics',
                    data: status
                }));
            } else if (data.type === 'request_metrics' && ws.isMonitoringClient) {
                // Handle metrics request from monitoring client
                const currentStatus = performanceMonitor.getStatus();
                ws.send(JSON.stringify({
                    type: 'performance_metrics',
                    data: currentStatus
                }));
            }
        } catch (error) {
            console.error('Error handling client message:', error);
        }
    });
    
    // Update WebSocket connection count for monitoring
    performanceMonitor.recordWebSocketEvent('connection', { 
        count: Array.from(wss.clients).filter(client => !client.isMonitoringClient).length 
    });
    
    ws.on('close', () => {
        if (ws.isMonitoringClient) {
            logger.debug('Monitoring client disconnected');
        } else {
            logger.debug('Trading client disconnected');
        }
        
        // Update connection count
        performanceMonitor.recordWebSocketEvent('connection', { 
            count: Array.from(wss.clients).filter(client => !client.isMonitoringClient).length 
        });
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        performanceMonitor.recordWebSocketEvent('error');
    });
});

// Global error handler
app.use((err, req, res, next) => {
    logger.error('Unhandled error:', err);
    
    // Don't leak error details in production
    const message = process.env.NODE_ENV === 'production' 
        ? 'Internal Server Error' 
        : err.message;
    
    res.status(err.status || 500).json({
        error: message,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
    });
});

// ==================== SOCIAL ENDPOINTS ====================

/**
 * @swagger
 * /api/social/follow:
 *   post:
 *     tags:
 *       - Social
 *     summary: Follow a user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID of user to follow
 *             required:
 *               - userId
 *     responses:
 *       200:
 *         description: User followed successfully
 *       400:
 *         description: Invalid user ID or cannot follow yourself
 *       401:
 *         description: Authentication required
 */
app.post('/api/social/follow', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId || userId <= 0) {
            return res.status(400).json(createAPIResponse.error('Invalid user ID', null, 400));
        }
        
        if (userId === req.user.id) {
            return res.status(400).json(createAPIResponse.error('Cannot follow yourself', null, 400));
        }
        
        await followUser(req.user.id, userId);
        res.json(createAPIResponse.success(null, 'User followed successfully'));
    } catch (error) {
        if (error.message === 'Already following this user') {
            return res.status(400).json(createAPIResponse.error(error.message, null, 400));
        }
        if (error.message === 'Cannot follow yourself') {
            return res.status(400).json(createAPIResponse.error(error.message, null, 400));
        }
        logger.error('Error following user:', { userId: req.user.id, followUserId: req.body.userId, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to follow user', null, 500));
    }
});

/**
 * @swagger
 * /api/social/unfollow:
 *   post:
 *     tags:
 *       - Social
 *     summary: Unfollow a user
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: integer
 *                 description: ID of user to unfollow
 *             required:
 *               - userId
 *     responses:
 *       200:
 *         description: User unfollowed successfully
 *       400:
 *         description: Invalid user ID
 *       401:
 *         description: Authentication required
 */
app.post('/api/social/unfollow', authenticateToken, async (req, res) => {
    try {
        const { userId } = req.body;
        
        if (!userId || userId <= 0) {
            return res.status(400).json(createAPIResponse.error('Invalid user ID', null, 400));
        }
        
        const success = await unfollowUser(req.user.id, userId);
        
        if (!success) {
            return res.status(404).json(createAPIResponse.error('User not found in following list', null, 404));
        }
        
        res.json(createAPIResponse.success(null, 'User unfollowed successfully'));
    } catch (error) {
        logger.error('Error unfollowing user:', { userId: req.user.id, unfollowUserId: req.body.userId, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to unfollow user', null, 500));
    }
});

/**
 * @swagger
 * /api/social/following:
 *   get:
 *     tags:
 *       - Social
 *     summary: Get users you are following
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of users to return
 *     responses:
 *       200:
 *         description: Following list retrieved successfully
 *       401:
 *         description: Authentication required
 */
app.get('/api/social/following', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const following = await getFollowing(req.user.id, limit);
        
        res.json(createAPIResponse.success(following, 'Following list retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching following list:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to fetch following list', null, 500));
    }
});

/**
 * @swagger
 * /api/social/followers:
 *   get:
 *     tags:
 *       - Social
 *     summary: Get your followers
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *         description: Maximum number of users to return
 *     responses:
 *       200:
 *         description: Followers list retrieved successfully
 *       401:
 *         description: Authentication required
 */
app.get('/api/social/followers', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const followers = await getFollowers(req.user.id, limit);
        
        res.json(createAPIResponse.success(followers, 'Followers list retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching followers list:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to fetch followers list', null, 500));
    }
});

/**
 * @swagger
 * /api/social/stats:
 *   get:
 *     tags:
 *       - Social
 *     summary: Get follow statistics
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Follow statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     following:
 *                       type: integer
 *                     followers:
 *                       type: integer
 *       401:
 *         description: Authentication required
 */
app.get('/api/social/stats', authenticateToken, async (req, res) => {
    try {
        const stats = await getFollowStats(req.user.id);
        res.json(createAPIResponse.success(stats, 'Follow statistics retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching follow stats:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to fetch follow statistics', null, 500));
    }
});

/**
 * @swagger
 * /api/social/is-following/{userId}:
 *   get:
 *     tags:
 *       - Social
 *     summary: Check if you are following a user
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of user to check
 *     responses:
 *       200:
 *         description: Follow status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     isFollowing:
 *                       type: boolean
 *       400:
 *         description: Invalid user ID
 *       401:
 *         description: Authentication required
 */
app.get('/api/social/is-following/:userId', authenticateToken, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId);
        
        if (!userId || userId <= 0) {
            return res.status(400).json(createAPIResponse.error('Invalid user ID', null, 400));
        }
        
        const isFollowingUser = await isFollowing(req.user.id, userId);
        res.json(createAPIResponse.success({ isFollowing: isFollowingUser }, 'Follow status retrieved successfully'));
    } catch (error) {
        logger.error('Error checking follow status:', { userId: req.user.id, checkUserId: req.params.userId, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to check follow status', null, 500));
    }
});

/**
 * @swagger
 * /api/social/activities:
 *   get:
 *     tags:
 *       - Social
 *     summary: Get trading activities from followed users
 *     description: Get recent trading activities from users you follow (10-minute delay for privacy)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of activities to return
 *     responses:
 *       200:
 *         description: Trading activities retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       username:
 *                         type: string
 *                       user_id:
 *                         type: integer
 *                       transaction:
 *                         type: object
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Authentication required
 */
app.get('/api/social/activities', authenticateToken, async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 50);
        const activities = await getFollowedUserTransactions(req.user.id, limit);
        
        res.json(createAPIResponse.success(activities, 'Trading activities retrieved successfully'));
    } catch (error) {
        logger.error('Error fetching trading activities:', { userId: req.user.id, error: error.message });
        res.status(500).json(createAPIResponse.error('Failed to fetch trading activities', null, 500));
    }
});

// Handle 404 - Serve HTML for browser requests, JSON for API requests
app.use((req, res) => {
    // Check if request is for an API endpoint
    if (req.path.startsWith('/api/')) {
        res.status(404).json(createAPIResponse.error('API endpoint not found', null, 404));
    } 
    // Check if request accepts HTML (browser request)
    else if (req.accepts('html')) {
        res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
    } 
    // Default to JSON response
    else {
        res.status(404).json(createAPIResponse.error('Route not found', null, 404));
    }
});

// Real-time candle updates are now handled directly through OKX WebSocket
// No need for additional polling-based broadcast system

// Graceful shutdown
process.on('SIGINT', () => {
    logger.info('Shutting down gracefully...');
    
    // Close WebSocket connections
    wss.clients.forEach((client) => {
        client.close();
    });
    
    if (okxWs) {
        okxWs.close();
    }
    
    // Cleanup ping interval
    if (okxWsPingInterval) {
        clearInterval(okxWsPingInterval);
        okxWsPingInterval = null;
    }
    
    // Stop price monitoring
    stopPriceMonitoring();
    
    dataScheduler.stop();
    performanceMonitor.stop();
    
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
    
    // Force close after 10 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});
