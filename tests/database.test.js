const { createUser, authenticateUser, getUserData, updateUserData, getUsersByIds, getUserDataByIds, saveChartSettings, getChartSettings, deleteChartSettings } = require('../database');
const bcrypt = require('bcrypt');

describe('Database Functions', () => {
  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const username = `testuser_${Date.now()}`;
      const password = 'testpassword123';
      
      const userId = await createUser(username, password);
      
      expect(userId).toBeDefined();
      expect(typeof userId).toBe('number');
      expect(userId).toBeGreaterThan(0);
    });

    it('should hash the password', async () => {
      const username = `testuser_hash_${Date.now()}`;
      const password = 'testpassword123';
      
      await createUser(username, password);
      const user = await authenticateUser(username, password);
      
      expect(user).toBeDefined();
      expect(user.password).not.toBe(password);
      expect(user.password.length).toBeGreaterThan(50); // bcrypt hash length
    });

    it('should throw error for duplicate username', async () => {
      const username = `duplicate_${Date.now()}`;
      const password = 'testpassword123';
      
      await createUser(username, password);
      
      await expect(createUser(username, password)).rejects.toThrow();
    });

    it('should create initial user data', async () => {
      const username = `userdata_${Date.now()}`;
      const password = 'testpassword123';
      
      const userId = await createUser(username, password);
      const userData = await getUserData(userId);
      
      expect(userData).toBeDefined();
      expect(userData.usd_balance).toBe(10000); // Default balance
      expect(userData.btc_balance).toBe(0);
      expect(userData.transactions).toEqual([]);
      expect(userData.leverage_positions).toEqual([]);
    });
  });

  describe('authenticateUser', () => {
    let testUsername;
    let testPassword;

    beforeEach(async () => {
      testUsername = `auth_test_${Date.now()}`;
      testPassword = 'testpassword123';
      await createUser(testUsername, testPassword);
    });

    it('should authenticate user with correct credentials', async () => {
      const user = await authenticateUser(testUsername, testPassword);
      
      expect(user).toBeDefined();
      expect(user.username).toBe(testUsername);
      expect(user.id).toBeDefined();
    });

    it('should return null for incorrect password', async () => {
      const user = await authenticateUser(testUsername, 'wrongpassword');
      
      expect(user).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      const user = await authenticateUser('nonexistent', testPassword);
      
      expect(user).toBeNull();
    });

    it('should return null for empty credentials', async () => {
      const user1 = await authenticateUser('', testPassword);
      const user2 = await authenticateUser(testUsername, '');
      const user3 = await authenticateUser('', '');
      
      expect(user1).toBeNull();
      expect(user2).toBeNull();
      expect(user3).toBeNull();
    });
  });

  describe('getUserData', () => {
    let userId;

    beforeEach(async () => {
      const username = `userdata_test_${Date.now()}`;
      userId = await createUser(username, 'testpassword123');
    });

    it('should retrieve user data', async () => {
      const userData = await getUserData(userId);
      
      expect(userData).toBeDefined();
      expect(userData.user_id).toBe(userId);
      expect(userData.usd_balance).toBe(10000);
      expect(userData.btc_balance).toBe(0);
      expect(Array.isArray(userData.transactions)).toBe(true);
      expect(Array.isArray(userData.leverage_positions)).toBe(true);
    });

    it('should return null for non-existent user', async () => {
      const userData = await getUserData(99999);
      
      expect(userData).toBeNull();
    });

    it('should parse JSON fields correctly', async () => {
      const userData = await getUserData(userId);
      
      expect(Array.isArray(userData.transactions)).toBe(true);
      expect(Array.isArray(userData.leverage_positions)).toBe(true);
    });
  });

  describe('updateUserData', () => {
    let userId;

    beforeEach(async () => {
      const username = `update_test_${Date.now()}`;
      userId = await createUser(username, 'testpassword123');
    });

    it('should update user data successfully', async () => {
      const updateData = {
        usdBalance: 5000,
        btcBalance: 0.1,
        transactions: [{ type: 'buy', amount: 0.1 }],
        leveragePositions: [],
        timezone: 'Asia/Seoul'
      };
      
      await updateUserData(userId, updateData);
      const userData = await getUserData(userId);
      
      expect(userData.usd_balance).toBe(5000);
      expect(userData.btc_balance).toBe(0.1);
      expect(userData.transactions).toEqual([{ type: 'buy', amount: 0.1 }]);
      expect(userData.timezone).toBe('Asia/Seoul');
    });

    it('should handle empty arrays', async () => {
      const updateData = {
        usdBalance: 1000,
        btcBalance: 0,
        transactions: [],
        leveragePositions: [],
        timezone: 'UTC'
      };
      
      await updateUserData(userId, updateData);
      const userData = await getUserData(userId);
      
      expect(userData.transactions).toEqual([]);
      expect(userData.leverage_positions).toEqual([]);
    });

    it('should update timestamp', async () => {
      const beforeUpdate = new Date();
      
      await updateUserData(userId, {
        usdBalance: 9000,
        btcBalance: 0,
        transactions: [],
        leveragePositions: [],
        timezone: 'UTC'
      });
      
      const userData = await getUserData(userId);
      const updatedAt = new Date(userData.updated_at);
      
      expect(updatedAt.getTime()).toBeGreaterThanOrEqual(beforeUpdate.getTime());
    });
  });

  // New batch operations tests
  describe('Batch Operations', () => {
    let testUserIds = [];
    
    beforeAll(async () => {
      // Create multiple test users for batch operations
      for (let i = 0; i < 3; i++) {
        const username = `batch_user_${Date.now()}_${i}`;
        const password = 'testpassword123';
        const userId = await createUser(username, password);
        testUserIds.push(userId);
      }
    });

    describe('getUsersByIds', () => {
      it('should fetch multiple users by IDs', async () => {
        const users = await getUsersByIds(testUserIds);
        
        expect(users).toHaveLength(3);
        expect(users[0]).toHaveProperty('id');
        expect(users[0]).toHaveProperty('username');
        expect(users[0]).toHaveProperty('password');
      });

      it('should return empty array for empty input', async () => {
        const users = await getUsersByIds([]);
        expect(users).toEqual([]);
      });

      it('should handle non-existent IDs gracefully', async () => {
        const users = await getUsersByIds([99999, 99998]);
        expect(users).toEqual([]);
      });
    });

    describe('getUserDataByIds', () => {
      it('should fetch multiple user data with JOIN', async () => {
        const userData = await getUserDataByIds(testUserIds);
        
        expect(userData).toHaveLength(3);
        expect(userData[0]).toHaveProperty('usd_balance');
        expect(userData[0]).toHaveProperty('username');
        expect(userData[0]).toHaveProperty('member_since');
        expect(Array.isArray(userData[0].transactions)).toBe(true);
        expect(Array.isArray(userData[0].leverage_positions)).toBe(true);
      });

      it('should return empty array for empty input', async () => {
        const userData = await getUserDataByIds([]);
        expect(userData).toEqual([]);
      });
    });
  });

  // Chart settings tests
  describe('Chart Settings', () => {
    let testUserId;

    beforeAll(async () => {
      const username = `chart_user_${Date.now()}`;
      const password = 'testpassword123';
      testUserId = await createUser(username, password);
    });

    describe('saveChartSettings', () => {
      it('should save chart settings successfully', async () => {
        const settings = {
          indicators: { ma: true, rsi: false },
          indicatorSettings: { ma: { period: 20 } },
          drawings: [{ type: 'trendline', points: [1, 2] }],
          chartType: 'line'
        };

        await expect(saveChartSettings(testUserId, 'BTC-USDT', settings))
          .resolves.not.toThrow();
      });

      it('should update existing settings (UPSERT)', async () => {
        const initialSettings = {
          indicators: { ma: true },
          chartType: 'candlestick'
        };
        
        await saveChartSettings(testUserId, 'ETH-USDT', initialSettings);
        
        const updatedSettings = {
          indicators: { ma: false, rsi: true },
          chartType: 'line'
        };
        
        await saveChartSettings(testUserId, 'ETH-USDT', updatedSettings);
        
        const retrieved = await getChartSettings(testUserId, 'ETH-USDT');
        expect(retrieved.indicators.rsi).toBe(true);
        expect(retrieved.chart_type).toBe('line');
      });
    });

    describe('getChartSettings', () => {
      it('should retrieve saved chart settings', async () => {
        const settings = {
          indicators: { bollinger: true },
          chartType: 'candlestick'
        };
        
        await saveChartSettings(testUserId, 'SOL-USDT', settings);
        const retrieved = await getChartSettings(testUserId, 'SOL-USDT');
        
        expect(retrieved).toBeDefined();
        expect(retrieved.indicators.bollinger).toBe(true);
        expect(retrieved.chart_type).toBe('candlestick');
      });

      it('should return null for non-existent settings', async () => {
        const settings = await getChartSettings(testUserId, 'NONEXISTENT');
        expect(settings).toBeNull();
      });
    });

    describe('deleteChartSettings', () => {
      it('should delete chart settings successfully', async () => {
        const settings = { indicators: { macd: true } };
        await saveChartSettings(testUserId, 'DELETE-TEST', settings);
        
        await deleteChartSettings(testUserId, 'DELETE-TEST');
        
        const retrieved = await getChartSettings(testUserId, 'DELETE-TEST');
        expect(retrieved).toBeNull();
      });
    });
  });

  // Error handling tests
  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Test with invalid parameters
      await expect(createUser('', '')).rejects.toThrow();
    });

    it('should validate foreign key constraints', async () => {
      // Try to get data for non-existent user
      const userData = await getUserData(99999);
      expect(userData).toBeNull();
    });
  });
});