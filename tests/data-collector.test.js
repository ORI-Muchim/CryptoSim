const DataCollector = require('../data-collector');
const axios = require('axios');

// Mock axios for API calls
jest.mock('axios');
const mockedAxios = axios;

describe('DataCollector', () => {
  let dataCollector;

  beforeEach(() => {
    dataCollector = new DataCollector();
    // Wait for database initialization
    return new Promise(resolve => setTimeout(resolve, 100));
  });

  afterEach(() => {
    if (dataCollector && dataCollector.db) {
      dataCollector.close();
    }
    jest.clearAllMocks();
  });

  describe('Database Initialization', () => {
    it('should initialize database and create tables', async () => {
      expect(dataCollector.db).toBeDefined();
      
      // Test if candles table exists by trying to query it
      return new Promise((resolve, reject) => {
        dataCollector.db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='candles'", (err, row) => {
          if (err) reject(err);
          expect(row).toBeDefined();
          expect(row.name).toBe('candles');
          resolve();
        });
      });
    });

    it('should create proper indexes', async () => {
      return new Promise((resolve, reject) => {
        dataCollector.db.all("SELECT name FROM sqlite_master WHERE type='index'", (err, rows) => {
          if (err) reject(err);
          
          const indexNames = rows.map(row => row.name);
          expect(indexNames).toContain('idx_instId_time');
          expect(indexNames).toContain('idx_bar');
          expect(indexNames).toContain('idx_created_at');
          resolve();
        });
      });
    });
  });

  describe('fetchCandles', () => {
    beforeEach(() => {
      // Mock successful API response
      mockedAxios.get.mockResolvedValue({
        data: {
          data: [
            ['1640995200000', '50000', '51000', '49000', '50500', '100', '5050000'],
            ['1640995260000', '50500', '51500', '50000', '51000', '150', '7650000']
          ]
        }
      });
    });

    it('should fetch candles successfully', async () => {
      const candles = await dataCollector.fetchCandles('BTC-USDT', 1, 2);
      
      expect(candles).toHaveLength(2);
      expect(candles[0]).toEqual({
        instId: 'BTC-USDT',
        timestamp: 1640995200000,
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 100,
        volCcy: 5050000,
        bar: '1m'
      });
    });

    it('should convert different time units correctly', async () => {
      await dataCollector.fetchCandles('BTC-USDT', 60, 1); // 1 hour
      
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://www.okx.com/api/v5/market/history-candles',
        {
          params: {
            instId: 'BTC-USDT',
            bar: '1H',
            limit: 1
          }
        }
      );
    });

    it('should handle API errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));
      
      const candles = await dataCollector.fetchCandles('BTC-USDT', 1, 1);
      
      expect(candles).toEqual([]);
    });

    it('should use correct bar formats for different timeframes', async () => {
      const testCases = [
        { unit: 1, expectedBar: '1m' },
        { unit: 5, expectedBar: '5m' },
        { unit: 60, expectedBar: '1H' },
        { unit: 240, expectedBar: '4H' },
        { unit: 1440, expectedBar: '1D' }
      ];

      for (const testCase of testCases) {
        await dataCollector.fetchCandles('BTC-USDT', testCase.unit, 1);
        
        expect(mockedAxios.get).toHaveBeenCalledWith(
          'https://www.okx.com/api/v5/market/history-candles',
          expect.objectContaining({
            params: expect.objectContaining({
              bar: testCase.expectedBar
            })
          })
        );
      }
    });
  });

  describe('saveCandles', () => {
    it('should save candles to database', async () => {
      const testCandles = [
        {
          instId: 'BTC-USDT',
          timestamp: 1640995200000,
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          volCcy: 5050000,
          bar: '1m'
        }
      ];
      
      // Save candles
      dataCollector.saveCandles(testCandles, '1m');
      
      // Wait for async database operation
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify candles were saved
      return new Promise((resolve, reject) => {
        dataCollector.db.get(
          'SELECT * FROM candles WHERE instId = ? AND timestamp = ?',
          ['BTC-USDT', 1640995200000],
          (err, row) => {
            if (err) reject(err);
            
            expect(row).toBeDefined();
            expect(row.instId).toBe('BTC-USDT');
            expect(row.open).toBe(50000);
            expect(row.high).toBe(51000);
            expect(row.close).toBe(50500);
            resolve();
          }
        );
      });
    });

    it('should handle duplicate timestamps with REPLACE', async () => {
      const testCandle = {
        instId: 'BTC-USDT',
        timestamp: 1640995200000,
        open: 50000,
        high: 51000,
        low: 49000,
        close: 50500,
        volume: 100,
        volCcy: 5050000,
        bar: '1m'
      };
      
      // Save same candle twice with different close price
      dataCollector.saveCandles([testCandle], '1m');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      testCandle.close = 51000;
      dataCollector.saveCandles([testCandle], '1m');
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify only one record exists with updated close price
      return new Promise((resolve, reject) => {
        dataCollector.db.all(
          'SELECT * FROM candles WHERE instId = ? AND timestamp = ?',
          ['BTC-USDT', 1640995200000],
          (err, rows) => {
            if (err) reject(err);
            
            expect(rows).toHaveLength(1);
            expect(rows[0].close).toBe(51000);
            resolve();
          }
        );
      });
    });
  });

  describe('getStoredCandles', () => {
    beforeEach(async () => {
      // Insert test data
      const testCandles = [
        {
          instId: 'BTC-USDT',
          timestamp: 1640995200000,
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          volCcy: 5050000,
          bar: '1m'
        },
        {
          instId: 'BTC-USDT',
          timestamp: 1640995260000,
          open: 50500,
          high: 52000,
          low: 50000,
          close: 51500,
          volume: 150,
          volCcy: 7725000,
          bar: '1m'
        }
      ];
      
      dataCollector.saveCandles(testCandles, '1m');
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    it('should retrieve stored candles', async () => {
      const candles = await dataCollector.getStoredCandles('BTC-USDT', '1m', 10);
      
      expect(candles).toHaveLength(2);
      expect(candles[0].instId).toBe('BTC-USDT');
      expect(candles[0].bar).toBe('1m');
    });

    it('should respect limit parameter', async () => {
      const candles = await dataCollector.getStoredCandles('BTC-USDT', '1m', 1);
      
      expect(candles).toHaveLength(1);
    });

    it('should return empty array for non-existent data', async () => {
      const candles = await dataCollector.getStoredCandles('ETH-USDT', '5m', 10);
      
      expect(candles).toEqual([]);
    });
  });

  describe('cleanOldData', () => {
    it('should preserve long-term data (1H, 4H, 1D)', async () => {
      // This test verifies that the cleanOldData method doesn't delete important timeframes
      const longTermCandles = [
        {
          instId: 'BTC-USDT',
          timestamp: Date.now() - (40 * 24 * 60 * 60 * 1000), // 40 days ago
          open: 50000,
          high: 51000,
          low: 49000,
          close: 50500,
          volume: 100,
          volCcy: 5050000,
          bar: '1H'
        },
        {
          instId: 'BTC-USDT',
          timestamp: Date.now() - (100 * 24 * 60 * 60 * 1000), // 100 days ago
          open: 45000,
          high: 46000,
          low: 44000,
          close: 45500,
          volume: 200,
          volCcy: 9100000,
          bar: '1D'
        }
      ];
      
      dataCollector.saveCandles(longTermCandles, longTermCandles[0].bar);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      dataCollector.cleanOldData();
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Verify long-term data still exists
      const hourlyCandles = await dataCollector.getStoredCandles('BTC-USDT', '1H', 10);
      const dailyCandles = await dataCollector.getStoredCandles('BTC-USDT', '1D', 10);
      
      expect(hourlyCandles).toHaveLength(1);
      expect(dailyCandles).toHaveLength(1);
    });
  });
});