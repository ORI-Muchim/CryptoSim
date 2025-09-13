module.exports = {
  // Test environment
  testEnvironment: 'node',
  
  // Test file patterns
  testMatch: [
    '**/tests/**/*.test.js',
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  
  // Coverage settings
  collectCoverage: true,
  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'server.js',
    'database.js',
    'data-collector.js',
    'scheduler.js',
    'utils/**/*.js',
    'monitoring/**/*.js',
    '!utils/logger.js', // Exclude logger from coverage
    '!node_modules/**',
    '!coverage/**',
    '!jest.config.js'
  ],
  
  // Coverage thresholds
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  
  // Setup and teardown
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  
  // Test timeout
  testTimeout: 10000,
  
  // Mock settings
  clearMocks: true,
  restoreMocks: true,
  
  // Verbose output
  verbose: true,
  
  // Exit on first test failure (for CI)
  bail: process.env.NODE_ENV === 'test' && process.env.CI ? 1 : 0,
};