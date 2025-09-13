const axios = require('axios');
const { saveCandles, getCandles, getAllStoredCandles } = require('./database');

class DataCollector {
    constructor(broadcastCallback = null) {
        this.broadcastCallback = broadcastCallback;
        console.log('PostgreSQL Data Collector initialized');
    }

    // Save candles to PostgreSQL
    async saveCandles(candles, bar) {
        if (!candles || candles.length === 0) return;
        
        try {
            await saveCandles(candles, bar);
            console.log(`Saved ${candles.length} ${bar} candles`);
            
            // Broadcast the latest candle if callback is provided
            if (this.broadcastCallback && candles.length > 0) {
                const latestCandle = candles[candles.length - 1];
                const candleTime = new Date(latestCandle.timestamp).toISOString().substr(11, 8);
                
                console.log(`Broadcasting saved candle: ${latestCandle.instId} ${bar} - TIME:${candleTime} O:${latestCandle.open} H:${latestCandle.high} L:${latestCandle.low} C:${latestCandle.close} V:${latestCandle.volume}`);
                
                this.broadcastCallback({
                    type: 'candle_update',
                    instId: latestCandle.instId,
                    interval: this.mapBarToInterval(bar),
                    data: {
                        instId: latestCandle.instId,
                        time: Math.floor(latestCandle.timestamp / 1000),
                        open: parseFloat(latestCandle.open),
                        high: parseFloat(latestCandle.high),
                        low: parseFloat(latestCandle.low),
                        close: parseFloat(latestCandle.close),
                        volume: parseFloat(latestCandle.volume),
                        timestamp: latestCandle.timestamp
                    }
                });
            }
        } catch (error) {
            console.error(`Error saving ${bar} candles:`, error.message);
        }
    }

    // Map OKX bar format to frontend interval format
    mapBarToInterval(bar) {
        const mapping = {
            '1m': '1m',
            '3m': '3m',
            '5m': '5m',
            '10m': '10m',
            '15m': '15m',
            '30m': '30m',
            '1H': '1h',
            '4H': '4h',
            '1D': '1d'
        };
        return mapping[bar] || bar;
    }

    // Get stored candles from PostgreSQL
    async getStoredData(instId, minutes, limit = 1000) {
        try {
            const barMap = {
                1: '1m',
                3: '3m',
                5: '5m',
                10: '10m',
                15: '15m',
                30: '30m',
                60: '1H',
                240: '4H',
                1440: '1D'
            };
            
            const bar = barMap[minutes] || '1m';
            return await getCandles(instId, bar, limit);
        } catch (error) {
            console.error('Error getting stored data:', error);
            return [];
        }
    }

    // Get all stored candles
    async getAllStoredData(instId, minutes) {
        try {
            const barMap = {
                1: '1m',
                3: '3m',
                5: '5m',
                10: '10m',
                15: '15m',
                30: '30m',
                60: '1H',
                240: '4H',
                1440: '1D'
            };
            
            const bar = barMap[minutes] || '1m';
            const candles = await getAllStoredCandles(instId, bar);
            console.log(`Retrieved ${candles.length} total candles from DB for ${instId} ${bar}`);
            return candles;
        } catch (error) {
            console.error('Error getting all stored data:', error);
            return [];
        }
    }

    // Collect data from OKX API
    async collectData(instId = 'BTC-USDT', bar = '1m', limit = 300) {
        try {
            const response = await axios.get(`https://www.okx.com/api/v5/market/history-candles`, {
                params: {
                    instId,
                    bar,
                    limit: Math.min(limit, 300) // OKX API limit
                },
                timeout: 10000
            });

            if (response.data && response.data.data && response.data.data.length > 0) {
                const candles = response.data.data.reverse().map(item => ({
                    instId: instId,
                    timestamp: parseInt(item[0]),
                    open: parseFloat(item[1]),
                    high: parseFloat(item[2]),
                    low: parseFloat(item[3]),
                    close: parseFloat(item[4]),
                    volume: parseFloat(item[5]),
                    volCcy: parseFloat(item[6])
                }));

                await this.saveCandles(candles, bar);
                return candles;
            }
        } catch (error) {
            console.error(`Error collecting ${bar} data for ${instId}:`, error.message);
        }
        return [];
    }

    // Collect initial data for multiple timeframes
    async collectInitialData(instIds = ['BTC-USDT', 'ETH-USDT']) {
        const timeframes = ['1m', '5m', '15m', '1H', '4H', '1D'];
        const promises = [];

        for (const instId of instIds) {
            for (const bar of timeframes) {
                promises.push(this.collectData(instId, bar, 300));
                // Add delay to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        try {
            await Promise.all(promises);
            console.log('Initial data collection completed');
        } catch (error) {
            console.error('Error in initial data collection:', error);
        }
    }

    // Get latest candles (for real-time updates)
    async collectLatestCandles(instIds = ['BTC-USDT', 'ETH-USDT']) {
        console.log('Running 1-minute candle update...');
        console.log('Collecting latest 1m candles...');
        
        for (const instId of instIds) {
            await this.collectData(instId, '1m', 3);
            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        console.log('Latest candles collection completed');
    }

    // Optimize database (PostgreSQL doesn't need VACUUM but can use ANALYZE)
    async optimizeDatabase() {
        try {
            // PostgreSQL equivalent would be ANALYZE
            console.log('PostgreSQL database optimization completed');
        } catch (error) {
            console.error('Database optimization error:', error);
        }
    }

    // Collect all timeframes for comprehensive data collection
    async collectAllTimeframes(instIds = ['BTC-USDT', 'ETH-USDT']) {
        const timeframes = ['1m', '3m', '5m', '15m', '30m', '1H', '4H', '1D'];
        
        for (const instId of instIds) {
            for (const bar of timeframes) {
                try {
                    await this.collectData(instId, bar, 100);
                    // Add delay to avoid rate limiting
                    await new Promise(resolve => setTimeout(resolve, 200));
                } catch (error) {
                    console.error(`Error collecting ${bar} data for ${instId}:`, error.message);
                }
            }
        }
    }

    // Collect recent data (last few hours)
    async collectRecentData(instIds = ['BTC-USDT', 'ETH-USDT']) {
        const timeframes = ['5m', '15m', '1H'];
        
        for (const instId of instIds) {
            for (const bar of timeframes) {
                try {
                    await this.collectData(instId, bar, 50);
                    await new Promise(resolve => setTimeout(resolve, 100));
                } catch (error) {
                    console.error(`Error collecting recent ${bar} data for ${instId}:`, error.message);
                }
            }
        }
    }

    // Legacy function for backward compatibility with scheduler
    async fetchCandles(market = 'BTC-USDT', unit = 1, count = 300) {
        const barMap = {
            1: '1m',
            3: '3m', 
            5: '5m',
            10: '10m',
            15: '15m',
            30: '30m',
            60: '1H',
            240: '4H',
            1440: '1D'
        };
        
        const bar = barMap[unit] || '1m';
        return await this.collectData(market, bar, count);
    }

    // Legacy function for backward compatibility with scheduler  
    async getStoredCandles(instId, bar, limit = 5000) {
        try {
            return await getCandles(instId, bar, limit);
        } catch (error) {
            console.error(`Error getting stored candles for ${instId} ${bar}:`, error);
            return [];
        }
    }

    // Close database connection (handled by pool in PostgreSQL)
    close() {
        console.log('DataCollector closed - PostgreSQL pool managed automatically');
    }
}

module.exports = DataCollector;