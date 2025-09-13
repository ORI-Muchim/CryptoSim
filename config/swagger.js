const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Bitcoin Trading Simulator API',
      version: '1.0.0',
      description: 'A comprehensive API for cryptocurrency trading simulation with real-time market data',
      contact: {
        name: 'API Support',
        email: 'support@tradingsim.com'
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
        url: 'https://api.tradingsim.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT authorization header using the Bearer scheme'
        }
      },
      schemas: {
        User: {
          type: 'object',
          required: ['username', 'password'],
          properties: {
            id: {
              type: 'integer',
              description: 'Unique user identifier'
            },
            username: {
              type: 'string',
              minLength: 3,
              maxLength: 20,
              pattern: '^[a-zA-Z0-9_]+$',
              description: 'Username (3-20 characters, alphanumeric and underscore only)'
            },
            password: {
              type: 'string',
              minLength: 8,
              pattern: '^(?=.*[A-Za-z])(?=.*\\d)',
              description: 'Password (minimum 8 characters, at least one letter and one number)'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation timestamp'
            }
          }
        },
        UserData: {
          type: 'object',
          properties: {
            usdBalance: {
              type: 'number',
              minimum: 0,
              description: 'USD balance in the account'
            },
            btcBalance: {
              type: 'number',
              minimum: 0,
              description: 'Bitcoin balance in the account'
            },
            transactions: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Transaction'
              },
              description: 'Array of user transactions'
            },
            leveragePositions: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/LeveragePosition'
              },
              description: 'Array of leverage trading positions'
            },
            timezone: {
              type: 'string',
              default: 'UTC',
              description: 'User timezone preference'
            }
          }
        },
        Transaction: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Transaction identifier'
            },
            type: {
              type: 'string',
              enum: ['buy', 'sell'],
              description: 'Transaction type'
            },
            amount: {
              type: 'number',
              minimum: 0,
              description: 'Amount of cryptocurrency'
            },
            price: {
              type: 'number',
              minimum: 0,
              description: 'Price per unit'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Transaction timestamp'
            },
            fee: {
              type: 'number',
              minimum: 0,
              description: 'Transaction fee'
            }
          }
        },
        LeveragePosition: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Position identifier'
            },
            type: {
              type: 'string',
              enum: ['long', 'short'],
              description: 'Position type'
            },
            leverage: {
              type: 'integer',
              minimum: 1,
              maximum: 100,
              description: 'Leverage multiplier'
            },
            amount: {
              type: 'number',
              minimum: 0,
              description: 'Position size'
            },
            entryPrice: {
              type: 'number',
              minimum: 0,
              description: 'Entry price'
            },
            currentPrice: {
              type: 'number',
              minimum: 0,
              description: 'Current market price'
            },
            pnl: {
              type: 'number',
              description: 'Profit and Loss'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Position open timestamp'
            }
          }
        },
        MarketPrice: {
          type: 'object',
          properties: {
            price: {
              type: 'number',
              minimum: 0,
              description: 'Current market price'
            },
            change: {
              type: 'number',
              description: '24h price change'
            },
            change_rate: {
              type: 'number',
              description: '24h price change rate'
            },
            high_price: {
              type: 'number',
              minimum: 0,
              description: '24h high price'
            },
            low_price: {
              type: 'number',
              minimum: 0,
              description: '24h low price'
            },
            volume: {
              type: 'number',
              minimum: 0,
              description: '24h trading volume'
            }
          }
        },
        Candle: {
          type: 'object',
          properties: {
            time: {
              type: 'integer',
              description: 'Timestamp in seconds'
            },
            open: {
              type: 'number',
              minimum: 0,
              description: 'Opening price'
            },
            high: {
              type: 'number',
              minimum: 0,
              description: 'Highest price'
            },
            low: {
              type: 'number',
              minimum: 0,
              description: 'Lowest price'
            },
            close: {
              type: 'number',
              minimum: 0,
              description: 'Closing price'
            },
            volume: {
              type: 'number',
              minimum: 0,
              description: 'Trading volume'
            }
          }
        },
        Orderbook: {
          type: 'object',
          properties: {
            bids: {
              type: 'array',
              items: {
                type: 'array',
                items: {
                  type: 'number'
                },
                minItems: 2,
                maxItems: 2
              },
              description: 'Array of bid orders [price, quantity]'
            },
            asks: {
              type: 'array',
              items: {
                type: 'array',
                items: {
                  type: 'number'
                },
                minItems: 2,
                maxItems: 2
              },
              description: 'Array of ask orders [price, quantity]'
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: {
                    type: 'string'
                  },
                  message: {
                    type: 'string'
                  }
                }
              },
              description: 'Validation errors'
            }
          }
        },
        AuthResponse: {
          type: 'object',
          properties: {
            token: {
              type: 'string',
              description: 'JWT authentication token'
            },
            username: {
              type: 'string',
              description: 'Username'
            }
          }
        },
        StandardAPIResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Operation success status'
            },
            data: {
              type: 'object',
              description: 'Response data'
            },
            message: {
              type: 'string',
              description: 'Success message'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp'
            }
          },
          required: ['success', 'timestamp']
        },
        StandardAPIError: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false,
              description: 'Operation success status (always false for errors)'
            },
            error: {
              type: 'string',
              description: 'Error message'
            },
            errors: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' }
                }
              },
              description: 'Detailed validation errors'
            },
            statusCode: {
              type: 'integer',
              description: 'HTTP status code'
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Error timestamp'
            }
          },
          required: ['success', 'error', 'timestamp']
        },
        ChartSettings: {
          type: 'object',
          properties: {
            indicators: {
              type: 'object',
              additionalProperties: {
                type: 'boolean'
              },
              description: 'Enabled indicators (ma, rsi, bollinger, etc.)'
            },
            indicatorSettings: {
              type: 'object',
              additionalProperties: {
                type: 'object'
              },
              description: 'Settings for each indicator'
            },
            drawings: {
              type: 'array',
              items: {
                type: 'object'
              },
              description: 'Chart drawings (trendlines, fibonacci, etc.)'
            },
            chartType: {
              type: 'string',
              enum: ['candlestick', 'line', 'area'],
              default: 'candlestick',
              description: 'Chart display type'
            }
          }
        },
        MonitoringStatus: {
          type: 'object',
          properties: {
            cpu: {
              type: 'object',
              properties: {
                usage: {
                  type: 'number',
                  description: 'CPU usage percentage'
                }
              }
            },
            memory: {
              type: 'object',
              properties: {
                usage: {
                  type: 'number',
                  description: 'Memory usage percentage'
                },
                used: {
                  type: 'number',
                  description: 'Used memory in bytes'
                },
                total: {
                  type: 'number',
                  description: 'Total memory in bytes'
                }
              }
            },
            requests: {
              type: 'object',
              properties: {
                total: {
                  type: 'integer',
                  description: 'Total request count'
                },
                successful: {
                  type: 'integer',
                  description: 'Successful request count'
                },
                failed: {
                  type: 'integer',
                  description: 'Failed request count'
                },
                avgResponseTime: {
                  type: 'number',
                  description: 'Average response time in ms'
                }
              }
            }
          }
        }
      }
    },
    responses: {
      UnauthorizedError: {
        description: 'Authentication required',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/StandardAPIError'
            },
            example: {
              success: false,
              error: 'Authentication required',
              statusCode: 401,
              timestamp: '2025-08-23T10:25:31.868Z'
            }
          }
        }
      },
      ForbiddenError: {
        description: 'Invalid token',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/StandardAPIError'
            },
            example: {
              success: false,
              error: 'Invalid token',
              statusCode: 403,
              timestamp: '2025-08-23T10:25:31.868Z'
            }
          }
        }
      },
      ValidationError: {
        description: 'Validation failed',
        content: {
          'application/json': {
            schema: {
              $ref: '#/components/schemas/StandardAPIError'
            },
            example: {
              success: false,
              error: 'Validation failed',
              errors: [
                {
                  field: 'username',
                  message: 'Username must be at least 3 characters'
                }
              ],
              statusCode: 400,
              timestamp: '2025-08-23T10:25:31.868Z'
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
  },
  apis: [
    './server.js',
    './docs/*.yaml'
  ],
};

const specs = swaggerJSDoc(options);

module.exports = {
  specs,
  swaggerUi,
  serve: swaggerUi.serve,
  setup: swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'Trading Simulator API Docs'
  })
};