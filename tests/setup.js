// Test setup file
const path = require('path');
const fs = require('fs');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.PORT = '0'; // Use random available port
process.env.LOG_LEVEL = 'error'; // Reduce logging noise in tests

// Create test databases in memory or temp directory
const testDbPath = path.join(__dirname, 'test_trading.db');
const testMarketDbPath = path.join(__dirname, 'test_market_data.db');

process.env.DB_PATH = testDbPath;
process.env.MARKET_DB_PATH = testMarketDbPath;

// Global test setup
beforeAll(() => {
  // Any global setup here
  console.log('🧪 Starting test suite...');
});

// Global test teardown
afterAll(async () => {
  // Clean up test databases
  try {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    if (fs.existsSync(testMarketDbPath)) {
      fs.unlinkSync(testMarketDbPath);
    }
    console.log('🧹 Test cleanup completed');
  } catch (error) {
    console.error('Error during test cleanup:', error);
  }
});

// Global error handling for tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Extend Jest matchers if needed
expect.extend({
  toBeWithinRange(received, floor, ceiling) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () => `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () => `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
});