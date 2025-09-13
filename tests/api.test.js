const request = require('supertest');
const jwt = require('jsonwebtoken');

// We need to create a test version of our app
// First, let's create a separate test app file
describe('API Integration Tests', () => {
  let app;
  let server;
  let testUser = {
    username: `testuser_${Date.now()}`,
    password: 'testPassword123'
  };
  let authToken;

  beforeAll(async () => {
    // Import app after setting test environment
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'test-secret';
    process.env.PORT = '0';
    
    // Dynamic import to ensure environment variables are set
    const appModule = require('../server');
    app = appModule;
    
    // Wait for server to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    if (server) {
      server.close();
    }
  });

  describe('Authentication Endpoints', () => {
    describe('POST /api/register', () => {
      it('should register a new user successfully', async () => {
        const response = await request(app)
          .post('/api/register')
          .send(testUser)
          .expect(200);

        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('username', testUser.username);
        expect(typeof response.body.token).toBe('string');
        
        // Store token for future tests
        authToken = response.body.token;
      });

      it('should reject registration with invalid data', async () => {
        const invalidUsers = [
          { username: 'ab', password: 'test123' }, // Username too short
          { username: 'validuser', password: '123' }, // Password too short
          { username: 'invalid-user!', password: 'test123' }, // Invalid characters
          { username: 'validuser', password: 'onlyletters' }, // No numbers
          { username: '', password: 'test123' }, // Empty username
          { username: 'validuser', password: '' }, // Empty password
        ];

        for (const invalidUser of invalidUsers) {
          const response = await request(app)
            .post('/api/register')
            .send(invalidUser)
            .expect(400);

          expect(response.body).toHaveProperty('errors');
          expect(Array.isArray(response.body.errors)).toBe(true);
        }
      });

      it('should reject duplicate username', async () => {
        await request(app)
          .post('/api/register')
          .send(testUser)
          .expect(400);
      });

      it('should apply rate limiting', async () => {
        const newUser = {
          username: `ratetest_${Date.now()}`,
          password: 'test123'
        };

        // Make multiple requests rapidly
        const requests = Array(6).fill().map(() =>
          request(app)
            .post('/api/register')
            .send({ ...newUser, username: `${newUser.username}_${Math.random()}` })
        );

        const responses = await Promise.all(requests);
        
        // At least one should be rate limited
        const rateLimitedResponses = responses.filter(r => r.status === 429);
        expect(rateLimitedResponses.length).toBeGreaterThan(0);
      });
    });

    describe('POST /api/login', () => {
      it('should login with valid credentials', async () => {
        const response = await request(app)
          .post('/api/login')
          .send(testUser)
          .expect(200);

        expect(response.body).toHaveProperty('token');
        expect(response.body).toHaveProperty('username', testUser.username);
      });

      it('should reject invalid credentials', async () => {
        await request(app)
          .post('/api/login')
          .send({
            username: testUser.username,
            password: 'wrongpassword'
          })
          .expect(401);
      });

      it('should reject login with missing data', async () => {
        const response = await request(app)
          .post('/api/login')
          .send({ username: testUser.username })
          .expect(400);

        expect(response.body).toHaveProperty('errors');
      });

      it('should reject non-existent user', async () => {
        await request(app)
          .post('/api/login')
          .send({
            username: 'nonexistentuser',
            password: 'test123'
          })
          .expect(401);
      });
    });
  });

  describe('Protected Endpoints', () => {
    describe('GET /api/user/data', () => {
      it('should return user data with valid token', async () => {
        const response = await request(app)
          .get('/api/user/data')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body).toHaveProperty('usdBalance');
        expect(response.body).toHaveProperty('btcBalance');
        expect(response.body).toHaveProperty('transactions');
        expect(response.body).toHaveProperty('leveragePositions');
        expect(response.body.usdBalance).toBe(10000); // Default balance
      });

      it('should reject request without token', async () => {
        await request(app)
          .get('/api/user/data')
          .expect(401);
      });

      it('should reject request with invalid token', async () => {
        await request(app)
          .get('/api/user/data')
          .set('Authorization', 'Bearer invalidtoken')
          .expect(403);
      });

      it('should reject request with expired token', async () => {
        const expiredToken = jwt.sign(
          { id: 999, username: 'test' },
          process.env.JWT_SECRET,
          { expiresIn: '-1h' } // Expired 1 hour ago
        );

        await request(app)
          .get('/api/user/data')
          .set('Authorization', `Bearer ${expiredToken}`)
          .expect(403);
      });
    });

    describe('POST /api/user/data', () => {
      it('should update user data successfully', async () => {
        const updateData = {
          usdBalance: 5000,
          btcBalance: 0.5,
          transactions: [{ type: 'buy', amount: 0.5, price: 50000 }],
          leveragePositions: [],
          timezone: 'Asia/Seoul'
        };

        await request(app)
          .post('/api/user/data')
          .set('Authorization', `Bearer ${authToken}`)
          .send(updateData)
          .expect(200);

        // Verify data was updated
        const response = await request(app)
          .get('/api/user/data')
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.usdBalance).toBe(5000);
        expect(response.body.btcBalance).toBe(0.5);
        expect(response.body.timezone).toBe('Asia/Seoul');
      });
    });
  });

  describe('Market Data Endpoints', () => {
    describe('GET /api/markets', () => {
      it('should return market data', async () => {
        const response = await request(app)
          .get('/api/markets')
          .expect(200);

        expect(typeof response.body).toBe('object');
        // Market data structure depends on real-time data, so we just check it's an object
      });
    });

    describe('GET /api/price', () => {
      it('should return price data', async () => {
        const response = await request(app)
          .get('/api/price')
          .expect(200);

        expect(response.body).toHaveProperty('data');
        expect(Array.isArray(response.body.data)).toBe(true);
      });

      it('should handle specific market parameter', async () => {
        await request(app)
          .get('/api/price/ETH-USDT')
          .expect(200);
      });
    });

    describe('GET /api/history', () => {
      it('should return price history', async () => {
        const response = await request(app)
          .get('/api/history')
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('GET /api/candles/:interval', () => {
      it('should return candle data for valid intervals', async () => {
        const validIntervals = ['1m', '5m', '15m', '1h', '4h', '1d'];
        
        for (const interval of validIntervals) {
          const response = await request(app)
            .get(`/api/candles/${interval}`)
            .query({ market: 'BTC-USDT', count: 10 })
            .expect(200);

          expect(Array.isArray(response.body)).toBe(true);
        }
      });

      it('should handle query parameters', async () => {
        const response = await request(app)
          .get('/api/candles/1h')
          .query({
            market: 'ETH-USDT',
            count: 50
          })
          .expect(200);

        expect(Array.isArray(response.body)).toBe(true);
      });
    });

    describe('GET /api/orderbook', () => {
      it('should return orderbook data', async () => {
        const response = await request(app)
          .get('/api/orderbook')
          .expect(200);

        expect(response.body).toHaveProperty('data');
      });

      it('should handle market parameter', async () => {
        await request(app)
          .get('/api/orderbook/ETH-USDT')
          .expect(200);
      });
    });
  });

  describe('Monitoring Endpoints', () => {
    describe('GET /api/monitoring/status', () => {
      it('should return monitoring status', async () => {
        const response = await request(app)
          .get('/api/monitoring/status')
          .expect(200);

        expect(typeof response.body).toBe('object');
      });
    });

    describe('GET /api/monitoring/metrics/:type', () => {
      it('should return metrics for valid types', async () => {
        const validTypes = ['cpu', 'memory', 'requests'];
        
        for (const type of validTypes) {
          await request(app)
            .get(`/api/monitoring/metrics/${type}`)
            .expect(200);
        }
      });
    });

    describe('POST /api/monitoring/reset-counters', () => {
      it('should reset monitoring counters', async () => {
        const response = await request(app)
          .post('/api/monitoring/reset-counters')
          .expect(200);

        expect(response.body).toHaveProperty('success', true);
      });
    });
  });

  describe('Error Handling', () => {
    it('should return 404 for non-existent routes', async () => {
      await request(app)
        .get('/api/nonexistent')
        .expect(404);
    });

    it('should handle malformed JSON', async () => {
      await request(app)
        .post('/api/login')
        .send('invalid json')
        .set('Content-Type', 'application/json')
        .expect(400);
    });
  });

  describe('Security Headers', () => {
    it('should include security headers', async () => {
      const response = await request(app)
        .get('/api/markets')
        .expect(200);

      // Check for Helmet.js security headers
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-content-type-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
    });

    it('should include CORS headers', async () => {
      const response = await request(app)
        .options('/api/markets')
        .set('Origin', 'http://localhost:3000')
        .expect(200);

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });
});