const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'CryptoSim API',
        version: '1.0.0',
        description: 'Cryptocurrency Trading Simulator API Documentation',
        contact: {
            name: 'CryptoSim Team',
            email: 'support@cryptosim.com'
        },
        license: {
            name: 'MIT',
            url: 'https://opensource.org/licenses/MIT'
        }
    },
    servers: [
        {
            url: 'http://localhost:3000',
            description: 'Development server'
        },
        {
            url: 'https://api.cryptosim.com',
            description: 'Production server'
        }
    ],
    components: {
        securitySchemes: {
            bearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT'
            }
        },
        schemas: {
            User: {
                type: 'object',
                properties: {
                    id: { type: 'integer', example: 1 },
                    username: { type: 'string', example: 'johndoe' },
                    created_at: { type: 'string', format: 'date-time' }
                }
            },
            UserData: {
                type: 'object',
                properties: {
                    user_id: { type: 'integer', example: 1 },
                    usd_balance: { type: 'number', example: 10000.00 },
                    btc_balance: { type: 'number', example: 0.5 },
                    eth_balance: { type: 'number', example: 5.0 },
                    transactions: { type: 'array', items: { $ref: '#/components/schemas/Transaction' } },
                    leverage_positions: { type: 'array', items: { $ref: '#/components/schemas/Position' } },
                    timezone: { type: 'string', example: 'UTC' }
                }
            },
            Transaction: {
                type: 'object',
                properties: {
                    id: { type: 'string', example: 'tx_123' },
                    type: { type: 'string', enum: ['buy', 'sell'], example: 'buy' },
                    market: { type: 'string', example: 'BTC/USDT' },
                    amount: { type: 'number', example: 0.1 },
                    price: { type: 'number', example: 45000.00 },
                    fee: { type: 'number', example: 4.5 },
                    time: { type: 'string', format: 'date-time' },
                    total: { type: 'number', example: 4504.5 }
                }
            },
            Position: {
                type: 'object',
                properties: {
                    id: { type: 'string', example: 'pos_123' },
                    type: { type: 'string', enum: ['long', 'short'], example: 'long' },
                    market: { type: 'string', example: 'BTC/USDT' },
                    size: { type: 'number', example: 1000 },
                    leverage: { type: 'integer', example: 10 },
                    entryPrice: { type: 'number', example: 45000.00 },
                    openingFee: { type: 'number', example: 0.5 },
                    time: { type: 'string', format: 'date-time' },
                    unrealizedPnl: { type: 'number', example: 150.00 }
                }
            },
            MarketData: {
                type: 'object',
                properties: {
                    market: { type: 'string', example: 'BTC-USDT' },
                    price: { type: 'number', example: 45000.00 },
                    change: { type: 'number', example: 0.025 },
                    volume: { type: 'number', example: 1500000000 },
                    high: { type: 'number', example: 46000.00 },
                    low: { type: 'number', example: 44000.00 }
                }
            },
            Candle: {
                type: 'object',
                properties: {
                    time: { type: 'integer', example: 1640995200 },
                    open: { type: 'number', example: 45000.00 },
                    high: { type: 'number', example: 45500.00 },
                    low: { type: 'number', example: 44800.00 },
                    close: { type: 'number', example: 45200.00 },
                    volume: { type: 'number', example: 125.5 }
                }
            },
            APIResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                    message: { type: 'string', example: 'Operation completed successfully' },
                    timestamp: { type: 'string', format: 'date-time' }
                }
            },
            Error: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string', example: 'Invalid request parameters' },
                    code: { type: 'integer', example: 400 },
                    timestamp: { type: 'string', format: 'date-time' }
                }
            },
            AuthResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
                    user: {
                        type: 'object',
                        properties: {
                            id: { type: 'integer', example: 1 },
                            username: { type: 'string', example: 'johndoe' }
                        }
                    },
                    message: { type: 'string', example: 'Authentication successful' },
                    timestamp: { type: 'string', format: 'date-time' }
                }
            },
            StandardAPIResponse: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: true },
                    data: { type: 'object' },
                    message: { type: 'string', example: 'Operation completed successfully' },
                    timestamp: { type: 'string', format: 'date-time' }
                }
            },
            StandardAPIError: {
                type: 'object',
                properties: {
                    success: { type: 'boolean', example: false },
                    error: { type: 'string', example: 'Operation failed' },
                    code: { type: 'integer', example: 500 },
                    timestamp: { type: 'string', format: 'date-time' }
                }
            },
            MarketPrice: {
                type: 'object',
                properties: {
                    market: { type: 'string', example: 'BTC-USDT' },
                    price: { type: 'number', example: 45000.00 },
                    change: { type: 'number', example: 0.025 },
                    volume: { type: 'number', example: 1500000000 },
                    high: { type: 'number', example: 46000.00 },
                    low: { type: 'number', example: 44000.00 },
                    timestamp: { type: 'string', format: 'date-time' }
                }
            }
        },
        responses: {
            UnauthorizedError: {
                description: 'Authentication required',
                content: {
                    'application/json': {
                        schema: {
                            type: 'object',
                            properties: {
                                success: { type: 'boolean', example: false },
                                error: { type: 'string', example: 'Authentication required' },
                                code: { type: 'integer', example: 401 },
                                timestamp: { type: 'string', format: 'date-time' }
                            }
                        }
                    }
                }
            }
        }
    },
    security: [
        {
            bearerAuth: []
        }
    ]
};

const options = {
    definition: swaggerDefinition,
    apis: ['./server.js', './routes/*.js'] // 경로를 실제 API 파일들로 수정
};

module.exports = options;