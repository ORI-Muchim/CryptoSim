const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DataCollector {
    constructor(broadcastCallback = null) {
        this.dbPath = path.join(__dirname, 'market_data.db');
        this.broadcastCallback = broadcastCallback;
        this.initDatabase();
    }

    initDatabase() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Database connection error:', err);
            } else {
                console.log('Connected to market data database');
                this.createTables();
            }
        });
    }

    createTables() {
        // Create table only if it doesn't exist - preserves existing data
        const sql = `
            CREATE TABLE IF NOT EXISTS candles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                instId TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                open REAL NOT NULL,
                high REAL NOT NULL,
                low REAL NOT NULL,
                close REAL NOT NULL,
                volume REAL NOT NULL,
                volCcy REAL,
                bar TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(instId, timestamp, bar)
            );

            CREATE INDEX IF NOT EXISTS idx_instId_time ON candles(instId, timestamp);
            CREATE INDEX IF NOT EXISTS idx_bar ON candles(bar);
            CREATE INDEX IF NOT EXISTS idx_created_at ON candles(created_at);
        `;

        this.db.exec(sql, (err) => {
            if (err) {
                console.error('Error creating tables:', err);
            } else {
                console.log('Database tables initialized successfully');
                this.cleanOldData(); // Clean up old data periodically
            }
        });
    }

    // Data preservation - NO automatic deletion
    // All candle data is preserved permanently for historical analysis
    cleanOldData() {
        console.log('All candle data preserved permanently - no automatic cleanup');
        console.log('Historical data retention: ALL timeframes (1m, 3m, 5m, 10m, 15m, 30m, 1H, 4H, 1D) kept forever');
        
        // Optional: Add database optimization without deleting data
        this.optimizeDatabase();
    }
    
    // Optional database optimization (VACUUM, REINDEX) without data loss
    optimizeDatabase() {
        // Run VACUUM to reclaim disk space from deleted records (if any)
        this.db.run('VACUUM', (err) => {
            if (err) {
                console.error('Error running VACUUM:', err);
            } else {
                console.log('Database optimized successfully');
            }
        });
        
        // Rebuild indexes for better performance
        this.db.run('REINDEX', (err) => {
            if (err) {
                console.error('Error rebuilding indexes:', err);
            } else {
                console.log('Database indexes rebuilt successfully');
            }
        });
    }

    async fetchCandles(market = 'BTC-USDT', unit = 1, count = 300) {
        try {
            // Convert unit to OKX bar format
            let bar = '1m';
            switch(unit) {
                case 1: bar = '1m'; break;
                case 3: bar = '3m'; break;
                case 5: bar = '5m'; break;
                case 10: bar = '10m'; break;
                case 15: bar = '15m'; break;
                case 30: bar = '30m'; break;
                case 60: bar = '1H'; break;
                case 240: bar = '4H'; break;
                case 1440: bar = '1D'; break;
                default: bar = '1m';
            }
            
            const response = await axios.get(`https://www.okx.com/api/v5/market/history-candles`, {
                params: {
                    instId: market,
                    bar: bar,
                    limit: count
                }
            });
            
            // Return OKX native format with timestamp validation
            return response.data.data.reverse().map(candle => {
                const timestamp = parseInt(candle[0]);
                // Debug: 타임스탬프 검증
                const candleTime = new Date(timestamp);
                const now = new Date();
                const timeDiff = Math.abs(now.getTime() - timestamp) / (1000 * 60 * 60); // hours
                
                // Timestamp validation removed to reduce log spam
                
                return {
                    instId: market,
                    timestamp: timestamp,
                    open: parseFloat(candle[1]),
                    high: parseFloat(candle[2]),
                    low: parseFloat(candle[3]),
                    close: parseFloat(candle[4]),
                    volume: parseFloat(candle[5]),
                    volCcy: parseFloat(candle[6]) || 0,
                    bar: bar
                };
            });
        } catch (error) {
            console.error(`Error fetching ${unit}-minute candles for ${market}:`, error.message);
            return [];
        }
    }

    saveCandles(candles, bar) {
        if (!candles || candles.length === 0) return;
        
        // 🚨 실시간 거래량 업데이트를 위한 중복 브로드캐스트 방지 개선
        if (!this.lastBroadcast) this.lastBroadcast = {};
        if (!this.broadcastLock) this.broadcastLock = {};
        if (!this.lastBroadcastTime) this.lastBroadcastTime = {};
        
        const lastBroadcastKey = `${candles[0]?.instId}_${bar}`;
        const latestCandle = candles[candles.length - 1];
        const candleKey = `${latestCandle.timestamp}_${latestCandle.close}_${latestCandle.volume}`;
        const now = Date.now();
        
        // Remove debug logging to reduce log spam
        
        // 스마트 중복 방지: 
        // 1) 완전히 같은 데이터는 30초 이내 스킵
        // 2) 가격이나 거래량이 변했으면 즉시 브로드캐스트 허용
        const isSameData = this.lastBroadcast[lastBroadcastKey] === candleKey;
        const isRecentBroadcast = this.lastBroadcastTime[lastBroadcastKey] && (now - this.lastBroadcastTime[lastBroadcastKey] < 30000); // 30초
        
        // 완전히 같은 데이터이고 최근에 브로드캐스트했으면 스킵
        if (isSameData && isRecentBroadcast) {
            // Skip identical data broadcast within 30 seconds
            return;
        }
        
        // 가격이나 거래량이 변했으면 항상 브로드캐스트 허용
        if (!isSameData) {
            // Broadcasting updated candle data - data changed
        }
        
        // 브로드캐스트 락 체크
        if (this.broadcastLock[lastBroadcastKey]) {
            console.log('🔒 Broadcast locked for', lastBroadcastKey);
            return;
        }
        
        const stmt = this.db.prepare(`
            INSERT OR REPLACE INTO candles (
                instId, timestamp, open, high, low, close, volume, volCcy, bar
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        candles.forEach(candle => {
            stmt.run(
                candle.instId,
                candle.timestamp,
                candle.open,
                candle.high,
                candle.low,
                candle.close,
                candle.volume,
                candle.volCcy,
                candle.bar
            );
        });

        // 브로드캐스트 락 설정
        if (bar === '1m' && candles.length > 0 && this.broadcastCallback) {
            this.broadcastLock[lastBroadcastKey] = true;
        }
        
        stmt.finalize((err) => {
            if (err) {
                console.error('Error saving candles:', err);
                // 에러 시 락 해제
                if (this.broadcastLock) {
                    delete this.broadcastLock[lastBroadcastKey];
                }
            } else {
                // Reduced logging - only show important saves
                if (bar === '1m' || bar === '5m') {
                    console.log(`Saved ${candles.length} ${bar} candles`);
                }
                
                // 🚨 중복 브로드캐스트 방지: 1m 타임프레임만 브로드캐스트하고 추적
                if (bar === '1m' && candles.length > 0 && this.broadcastCallback) {
                    // 이미 브로드캐스트했으면 스킵 (중복 체크는 위에서 이미 완료)
                    const isSameDataAgain = this.lastBroadcast[lastBroadcastKey] === candleKey;
                    const isRecentBroadcastAgain = this.lastBroadcastTime[lastBroadcastKey] && (now - this.lastBroadcastTime[lastBroadcastKey] < 3000);
                    
                    if (isSameDataAgain && isRecentBroadcastAgain) {
                        // Skipping duplicate broadcast
                        delete this.broadcastLock[lastBroadcastKey]; // 락 해제
                        return;
                    }
                    
                    const candleData = {
                        instId: latestCandle.instId,
                        time: Math.floor(latestCandle.timestamp / 1000),
                        open: latestCandle.open,
                        high: latestCandle.high,
                        low: latestCandle.low,
                        close: latestCandle.close,
                        volume: latestCandle.volume, // 원본 거래량 유지 (OKX API 거래량은 이미 적절한 크기)
                        timestamp: latestCandle.timestamp
                    };
                    
                    const candleTime = new Date(latestCandle.timestamp);
                    console.log(`⚡ Broadcasting saved candle: ${latestCandle.instId} 1m - TIME:${candleTime.toISOString().slice(11,19)} O:${candleData.open} H:${candleData.high} L:${candleData.low} C:${candleData.close} V:${candleData.volume}`);
                    
                    try {
                        this.broadcastCallback({
                            type: 'candle_update',
                            instId: latestCandle.instId,
                            interval: '1m',
                            data: candleData
                        });
                        
                        // 브로드캐스트 추적 업데이트 (시간 포함)
                        this.lastBroadcast[lastBroadcastKey] = candleKey;
                        this.lastBroadcastTime[lastBroadcastKey] = now;
                        // Broadcast completed
                    } catch (error) {
                        console.error('Error calling broadcastCallback:', error);
                    }
                    
                    // 브로드캐스트 완료 후 락 해제
                    delete this.broadcastLock[lastBroadcastKey];
                } else {
                    // 1m이 아닌 경우 락 해제
                    if (this.broadcastLock) {
                        delete this.broadcastLock[lastBroadcastKey];
                    }
                }
            }
        });
    }

    async collectAllTimeframes(market = 'BTC-USDT') {
        // 🚨 1분봉 제거하여 중복 브로드캐스트 방지 - scheduler의 collectLatestCandles()에서만 처리
        const timeframes = [3, 5, 10, 15, 30, 60, 240]; // 1분봉 제거
        
        for (const unit of timeframes) {
            const candles = await this.fetchCandles(market, unit, 300);
            if (candles.length > 0) {
                this.saveCandles(candles, candles[0].bar);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    getStoredCandles(instId, bar, limit = 5000) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM candles 
                WHERE instId = ? AND bar = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `;
            
            this.db.all(sql, [instId, bar, limit], (err, rows) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    getLatestCandle(instId, bar) {
        return new Promise((resolve, reject) => {
            const sql = `
                SELECT * FROM candles 
                WHERE instId = ? AND bar = ?
                ORDER BY timestamp DESC
                LIMIT 1
            `;
            
            this.db.get(sql, [instId, bar], (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    close() {
        this.db.close();
    }
}

module.exports = DataCollector;