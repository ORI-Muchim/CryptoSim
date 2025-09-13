/**
 * @fileoverview TypeScript-style JSDoc type definitions for the trading application
 * This file provides comprehensive type definitions for better code intelligence
 */

/**
 * @typedef {Object} User
 * @property {number} id - User ID
 * @property {string} username - Username (3-20 characters)
 * @property {string} password - Hashed password
 * @property {string} created_at - Account creation timestamp
 */

/**
 * @typedef {Object} UserData
 * @property {number} id - User data ID
 * @property {number} user_id - Associated user ID
 * @property {number} usd_balance - USD balance
 * @property {number} btc_balance - BTC balance
 * @property {Transaction[]} transactions - Array of transactions
 * @property {LeveragePosition[]} leverage_positions - Array of leverage positions
 * @property {string} timezone - User timezone
 * @property {string} role - User role ('user' or 'admin')
 * @property {string} updated_at - Last update timestamp
 * @property {string} member_since - Account creation date
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id - Transaction ID
 * @property {'buy'|'sell'|'close_long'|'close_short'} type - Transaction type
 * @property {string} market - Market pair (e.g., 'BTC/USDT')
 * @property {number} amount - Amount traded
 * @property {number} price - Price per unit
 * @property {number} total - Total transaction value
 * @property {number} fee - Transaction fee
 * @property {string} time - Transaction timestamp
 * @property {number} [leverage] - Leverage used (for leverage trades)
 * @property {number} [pnl] - Profit/Loss (for closing trades)
 * @property {number} [entryPrice] - Entry price (for closing trades)
 * @property {number} [exitPrice] - Exit price (for closing trades)
 */

/**
 * @typedef {Object} LeveragePosition
 * @property {string} id - Position ID
 * @property {'long'|'short'} type - Position type
 * @property {string} market - Market pair (e.g., 'BTC/USDT')
 * @property {number} size - Position size in USD
 * @property {number} leverage - Leverage multiplier (2-100)
 * @property {number} entryPrice - Entry price
 * @property {number} margin - Margin used
 * @property {number} openingFee - Fee paid when opening
 * @property {number} liquidationPrice - Liquidation price
 * @property {number} pnl - Current unrealized P&L
 * @property {number} pnlPercent - P&L percentage
 * @property {string} time - Position opening time
 */

/**
 * @typedef {Object} MarketData
 * @property {string} market - Market identifier (e.g., 'BTC-USDT')
 * @property {number} price - Current price
 * @property {number} change - 24h price change percentage
 * @property {number} volume - 24h volume
 * @property {number} high - 24h high price
 * @property {number} low - 24h low price
 */

/**
 * @typedef {Object} CandleData
 * @property {number} time - Unix timestamp
 * @property {number} open - Open price
 * @property {number} high - High price
 * @property {number} low - Low price
 * @property {number} close - Close price
 * @property {number} volume - Volume
 */

/**
 * @typedef {Object} OrderbookEntry
 * @property {number} price - Price level
 * @property {number} size - Size at this price level
 * @property {number} cumulative - Cumulative size
 */

/**
 * @typedef {Object} Orderbook
 * @property {OrderbookEntry[]} bids - Buy orders (highest to lowest)
 * @property {OrderbookEntry[]} asks - Sell orders (lowest to highest)
 */

/**
 * @typedef {Object} ChartSettings
 * @property {number} id - Settings ID
 * @property {number} user_id - User ID
 * @property {string} market - Market pair
 * @property {Object} indicators - Active indicators
 * @property {Object} indicator_settings - Indicator parameters
 * @property {Array} drawings - Chart drawings
 * @property {'candlestick'|'line'} chart_type - Chart type
 * @property {string} updated_at - Last update timestamp
 */

/**
 * @typedef {Object} ChatMessage
 * @property {number} id - Message ID
 * @property {number} user_id - Sender user ID
 * @property {string} username - Sender username
 * @property {string} message - Message content
 * @property {'message'|'trade_share'|'system'} message_type - Message type
 * @property {Object|null} metadata - Additional message data
 * @property {string} created_at - Message creation timestamp
 */

/**
 * @typedef {Object} APIResponse
 * @property {boolean} success - Whether the request was successful
 * @property {*} [data] - Response data (if successful)
 * @property {string} [error] - Error message (if failed)
 * @property {number} [code] - Error code (if failed)
 * @property {string} timestamp - Response timestamp
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} type - Error type
 * @property {string} msg - Error message
 * @property {string} path - Field path
 * @property {string} location - Error location
 * @property {*} value - Invalid value
 */

/**
 * @typedef {Object} TradingFees
 * @property {number} MAKER - Maker fee rate (0.001 = 0.1%)
 * @property {number} TAKER - Taker fee rate (0.0015 = 0.15%)
 * @property {number} LEVERAGE - Leverage fee rate (0.0005 = 0.05%)
 */

/**
 * @typedef {Object} SpotProfitData
 * @property {number} totalInvested - Total USD invested
 * @property {number} currentValue - Current USD value
 * @property {number} profitLoss - Profit/Loss in USD
 * @property {number} profitLossPercent - Profit/Loss percentage
 * @property {number} averagePrice - Average purchase price
 */

/**
 * @typedef {Object} TechnicalIndicatorData
 * @property {number} time - Timestamp
 * @property {number} value - Indicator value
 */

/**
 * @typedef {Object} BollingerBands
 * @property {TechnicalIndicatorData[]} upper - Upper band
 * @property {TechnicalIndicatorData[]} middle - Middle band (SMA)
 * @property {TechnicalIndicatorData[]} lower - Lower band
 */

// Export types for JSDoc reference
module.exports = {};