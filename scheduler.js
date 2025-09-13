const cron = require('node-cron');
const DataCollector = require('./data-collector');

class MarketDataScheduler {
    constructor(broadcastCallback = null) {
        this.collector = new DataCollector(broadcastCallback);
        this.jobs = [];
        this.markets = ['BTC-USDT', 'ETH-USDT'];
    }

    start() {
        console.log('Starting market data scheduler...');
        
        // 1분마다 최신 1분봉 데이터 수집 (실시간 거래량 업데이트용)
        this.jobs.push(cron.schedule('0 * * * * *', async () => {
            console.log('Running 1-minute candle update...');
            await this.collectLatestCandles();
        }));
        
        this.jobs.push(cron.schedule('0 */5 * * * *', async () => {
            console.log('Running 5-minute data collection...');
            await this.collectRecentData();
        }));

        this.jobs.push(cron.schedule('0 0 */1 * * *', async () => {
            console.log('Running hourly full data collection...');
            await this.collectFullData();
        }));

        this.jobs.push(cron.schedule('0 0 6 * * *', async () => {
            console.log('Running daily comprehensive data collection at 6 AM...');
            await this.collectComprehensiveData();
        }));

        this.jobs.push(cron.schedule('0 0 */12 * * *', async () => {
            console.log('Running 12-hour comprehensive data collection...');
            await this.collectComprehensiveData();
        }));

        console.log('Scheduler started successfully');
        console.log('- Every 10 seconds: Latest candle updates (real-time volume)');
        console.log('- Every 5 minutes: Recent data collection');
        console.log('- Every hour: Full data collection');
        console.log('- Every 12 hours: Comprehensive data collection');
        console.log('- Daily at 6 AM: Comprehensive historical data collection');
    }

    async collectLatestCandles() {
        // 1분마다 실행되는 최신 1분봉 업데이트 (거래량 실시간 반영)
        console.log('Collecting latest 1m candles...');
        
        for (const market of this.markets) {
            try {
                // 최근 3개 캔들 가져오기 (현재 진행중인 캔들 + 완료된 캔들 2개)
                const candles1m = await this.collector.fetchCandles(market, 1, 3);
                // fetchCandles 내부에서 이미 저장과 브로드캐스트가 처리됨
                await new Promise(resolve => setTimeout(resolve, 500)); // 적절한 딜레이
            } catch (error) {
                console.error(`Error collecting latest candles for ${market}:`, error.message);
            }
        }
        
        console.log('Latest candles collection completed');
    }
    
    async collectRecentData() {
        for (const market of this.markets) {
            try {
                // 1분봉 수집 제거 - collectLatestCandles()에서만 처리하여 중복 방지
                // const candles1m = await this.collector.fetchCandles(market, 1, 10);
                // if (candles1m.length > 0) {
                //     this.collector.saveCandles(candles1m, '1m');
                // }
                
                const candles5m = await this.collector.fetchCandles(market, 5, 10);
                if (candles5m.length > 0) {
                    this.collector.saveCandles(candles5m, '5m');
                }
                
                await new Promise(resolve => setTimeout(resolve, 1000));
            } catch (error) {
                console.error(`Error collecting recent data for ${market}:`, error.message);
            }
        }
    }

    async collectFullData() {
        for (const market of this.markets) {
            try {
                // 1분봉 제거하여 중복 브로드캐스트 방지 - collectLatestCandles()에서만 처리
                const timeframes = [5, 15, 30, 60]; // 1분봉 제거
                
                for (const unit of timeframes) {
                    const candles = await this.collector.fetchCandles(market, unit, 50);
                    if (candles.length > 0) {
                        // bar 정보를 명시적으로 전달
                        const barMap = { 1: '1m', 5: '5m', 15: '15m', 60: '1H', 240: '4H', 1440: '1D' };
                        const bar = barMap[unit] || '1m';
                        this.collector.saveCandles(candles, bar);
                    }
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } catch (error) {
                console.error(`Error collecting full data for ${market}:`, error.message);
            }
        }
    }

    async collectComprehensiveData() {
        for (const market of this.markets) {
            try {
                await this.collector.collectAllTimeframes(market);
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`Error collecting comprehensive data for ${market}:`, error.message);
            }
        }
    }

    async collectInitialData() {
        console.log('Collecting initial data for all markets...');
        await this.collectComprehensiveData();
        console.log('Initial data collection completed');
    }

    stop() {
        this.jobs.forEach(job => job.stop());
        this.collector.close();
        console.log('Scheduler stopped');
    }

    async getLatestData(instId = 'BTC-USDT', unit = 1, limit = 2000) {
        try {
            // Convert unit to bar format
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
            
            const storedData = await this.collector.getStoredCandles(instId, bar, Math.min(limit, 5000));
            
            if (storedData.length < Math.min(limit * 0.3, 100)) {
                // Only fetch from API if we have very little data (less than 30% requested or under 100)
                console.log(`Very low stored data for ${instId} ${bar} (${storedData.length}). Fetching from API...`);
                const apiLimit = Math.min(200, limit); // API max is 200
                const freshData = await this.collector.fetchCandles(instId, unit, apiLimit);
                if (freshData.length > 0) {
                    this.collector.saveCandles(freshData, bar);
                    // Combine with existing data and return the best we have
                    const combined = [...freshData, ...storedData];
                    const uniqueData = combined.filter((candle, index, arr) => 
                        arr.findIndex(c => c.timestamp === candle.timestamp) === index
                    );
                    return uniqueData.slice(0, limit);
                }
            }
            
            return storedData;
        } catch (error) {
            console.error('Error getting latest data:', error);
            const freshData = await this.collector.fetchCandles(instId, unit, limit);
            return freshData;
        }
    }

    async getAllStoredData(instId = 'BTC-USDT', unit = 1) {
        try {
            // Convert unit to bar format
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
            
            // Get ALL stored candles (up to 10000)
            const allData = await this.collector.getStoredCandles(instId, bar, 10000);
            console.log(`Retrieved ${allData.length} total candles from DB for ${instId} ${bar}`);
            return allData;
        } catch (error) {
            console.error('Error getting all stored data:', error);
            return [];
        }
    }
}

module.exports = MarketDataScheduler;