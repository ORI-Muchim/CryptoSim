const request = require('supertest');
const jwt = require('jsonwebtoken');

describe('Extended API Integration Tests', () => {
  let app;
  let testUser = {
    username: `extended_user_${Date.now()}`,
    password: 'testPassword123'
  };
  let authToken;

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret-extended';
    process.env.PORT = '0';
    
    // Dynamic import to ensure environment variables are set
    const appModule = require('../server');
    app = appModule;
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Register test user
    const response = await request(app)
      .post('/api/register')
      .send(testUser);
    
    authToken = response.body.data.token;
  });

  describe('Market Data APIs', () => {
    describe('GET /api/markets', () => {
      it('should return standardized market data', async () => {
        const response = await request(app)
          .get('/api/markets')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body.data).toHaveProperty('BTC-USDT');
      });
    });

    describe('GET /api/price/:market', () => {
      it('should return price for BTC-USDT', async () => {
        const response = await request(app)
          .get('/api/price/BTC-USDT')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('last');
      });

      it('should handle invalid market gracefully', async () => {
        const response = await request(app)
          .get('/api/price/INVALID-MARKET')
          .expect(500);

        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error');
      });
    });

    describe('GET /api/history', () => {
      it('should return price history', async () => {
        const response = await request(app)
          .get('/api/history')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
      });
    });

    describe('GET /api/candles/:interval', () => {
      it('should return candle data for 1m interval', async () => {
        const response = await request(app)
          .get('/api/candles/1m?market=BTC-USDT&count=10')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toBeDefined();
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should handle different intervals', async () => {
        const intervals = ['1m', '5m', '1h', '1d'];
        
        for (const interval of intervals) {
          const response = await request(app)
            .get(`/api/candles/${interval}?market=BTC-USDT&count=5`)
            .expect(200);

          expect(response.body.success).toBe(true);
        }
      });
    });
  });

  describe('User Data APIs', () => {
    describe('GET /api/user/data', () => {
      it('should return user data with valid token', async () => {
        const response = await request(app)
          .get('/api/user/data')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toHaveProperty('usdBalance');
        expect(response.body.data).toHaveProperty('btcBalance');
        expect(response.body.data).toHaveProperty('transactions');
      });

      it('should reject request without token', async () => {
        const response = await request(app)
          .get('/api/user/data')
          .expect(401);

        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error', 'Authentication required');
      });

      it('should reject request with invalid token', async () => {
        const response = await request(app)
          .get('/api/user/data')
          .set('Authorization', 'Bearer invalid-token')
          .expect(403);

        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error', 'Invalid token');
      });
    });

    describe('POST /api/user/data', () => {
      it('should update user data successfully', async () => {
        const updateData = {
          usdBalance: 5000,
          btcBalance: 0.1,
          transactions: [{ type: 'buy', amount: 0.1, price: 50000 }],
          leveragePositions: [],
          timezone: 'America/New_York'
        };

        const response = await request(app)
          .post('/api/user/data')
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message', 'User data updated successfully');
      });

      it('should validate negative balances in database constraints', async () => {
        const invalidData = {
          usdBalance: -1000, // Should fail CHECK constraint
          btcBalance: 0.1
        };

        const response = await request(app)
          .post('/api/user/data')
          .set('Authorization', `Bearer ${authToken}`)
          .send(invalidData)
          .expect(500);

        expect(response.body).toHaveProperty('success', false);
      });
    });
  });

  describe('Chart Settings APIs', () => {
    const testMarket = 'BTC-USDT';
    const testSettings = {
      indicators: { ma: true, rsi: false },
      indicatorSettings: { ma: { period: 20 } },
      drawings: [{ type: 'trendline' }],
      chartType: 'candlestick'
    };

    describe('POST /api/chart/settings', () => {
      it('should save chart settings', async () => {
        const response = await request(app)
          .post('/api/chart/settings')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ market: testMarket, ...testSettings })
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
      });

      it('should require market parameter', async () => {
        const response = await request(app)
          .post('/api/chart/settings')
          .set('Authorization', `Bearer ${authToken}`)
          .send(testSettings)
          .expect(400);

        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error', 'Market is required');
      });
    });

    describe('GET /api/chart/settings/:market', () => {
      it('should retrieve saved chart settings', async () => {
        // First save settings
        await request(app)
          .post('/api/chart/settings')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ market: testMarket, ...testSettings });

        // Then retrieve them
        const response = await request(app)
          .get(`/api/chart/settings/${testMarket}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.indicators.ma).toBe(true);
      });

      it('should return null for non-existent settings', async () => {
        const response = await request(app)
          .get('/api/chart/settings/NONEXISTENT')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toBeNull();
      });
    });

    describe('DELETE /api/chart/settings/:market', () => {
      it('should delete chart settings', async () => {
        const deleteMarket = 'DELETE-TEST';
        
        // First save settings
        await request(app)
          .post('/api/chart/settings')
          .set('Authorization', `Bearer ${authToken}`)
          .send({ market: deleteMarket, ...testSettings });

        // Delete them
        const deleteResponse = await request(app)
          .delete(`/api/chart/settings/${deleteMarket}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(deleteResponse.body).toHaveProperty('success', true);

        // Verify they're gone
        const getResponse = await request(app)
          .get(`/api/chart/settings/${deleteMarket}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(getResponse.body.data).toBeNull();
      });
    });
  });

  describe('Monitoring APIs', () => {
    describe('GET /api/monitoring/status', () => {
      it('should return monitoring status', async () => {
        const response = await request(app)
          .get('/api/monitoring/status')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body.data).toBeDefined();
      });
    });

    describe('GET /api/monitoring/alerts', () => {
      it('should return active alerts', async () => {
        const response = await request(app)
          .get('/api/monitoring/alerts')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(Array.isArray(response.body.data)).toBe(true);
      });
    });

    describe('POST /api/monitoring/reset-counters', () => {
      it('should reset performance counters', async () => {
        const response = await request(app)
          .post('/api/monitoring/reset-counters')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('message', 'Counters reset successfully');
      });
    });
  });

  describe('Error Handling', () => {
    describe('404 Routes', () => {
      it('should return standardized 404 for non-existent API routes', async () => {
        const response = await request(app)
          .get('/api/nonexistent')
          .expect(404);

        expect(response.body).toHaveProperty('success', false);
        expect(response.body).toHaveProperty('error', 'API endpoint not found');
        expect(response.body).toHaveProperty('statusCode', 404);
      });
    });

    describe('Rate Limiting', () => {
      it('should apply rate limiting to auth endpoints', async () => {
        const requests = Array(6).fill().map(() =>
          request(app)
            .post('/api/login')
            .send({ username: 'test', password: 'test' })
        );

        const responses = await Promise.all(requests);
        const rateLimited = responses.filter(r => r.status === 429);
        expect(rateLimited.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Response Format Consistency', () => {
    it('should maintain consistent response format across all endpoints', async () => {
      const endpoints = [
        '/api/markets',
        '/api/history',
        '/api/monitoring/status'
      ];

      for (const endpoint of endpoints) {
        const response = await request(app).get(endpoint);
        
        expect(response.body).toHaveProperty('success');
        expect(response.body).toHaveProperty('timestamp');
        
        if (response.body.success) {
          expect(response.body).toHaveProperty('data');
        } else {
          expect(response.body).toHaveProperty('error');
        }
      }
    });
  });
});