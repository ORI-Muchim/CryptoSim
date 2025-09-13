/**
 * Transaction Cache Manager for performance optimization
 * Maintains indexed transaction data to avoid O(n) operations
 */
class TransactionCache {
    constructor() {
        this.cache = new Map(); // Key: crypto symbol, Value: processed transaction data
        this.lastUpdate = new Map(); // Track last update time for each crypto
        this.isInitialized = false;
    }

    /**
     * Initialize cache with existing transactions
     * @param {Array} transactions - Array of transaction objects
     */
    initialize(transactions) {
        console.log('Initializing transaction cache...');
        this.cache.clear();
        this.lastUpdate.clear();
        
        if (!Array.isArray(transactions)) {
            transactions = [];
        }

        // Group transactions by crypto for efficient processing
        const groupedTransactions = this.groupTransactionsByCrypto(transactions);
        
        // Process each crypto's transactions
        for (const [crypto, txList] of groupedTransactions) {
            this.processTransactionsForCrypto(crypto, txList);
        }
        
        this.isInitialized = true;
        console.log(`Transaction cache initialized for ${this.cache.size} cryptos`);
    }

    /**
     * Group transactions by cryptocurrency
     * @param {Array} transactions 
     * @returns {Map}
     */
    groupTransactionsByCrypto(transactions) {
        const grouped = new Map();
        
        transactions.forEach(tx => {
            const crypto = this.extractCryptoFromTransaction(tx);
            if (!crypto) return;
            
            if (!grouped.has(crypto)) {
                grouped.set(crypto, []);
            }
            grouped.get(crypto).push(tx);
        });

        return grouped;
    }

    /**
     * Extract crypto symbol from transaction
     * @param {Object} tx - Transaction object
     * @returns {string|null}
     */
    extractCryptoFromTransaction(tx) {
        if (!tx.market) return null;
        
        // Handle different market formats: BTC/USDT, BTC-USDT
        const market = tx.market.replace('-', '/');
        const parts = market.split('/');
        return parts[0]; // Return base currency (BTC, ETH, etc.)
    }

    /**
     * Process transactions for a specific crypto
     * @param {string} crypto 
     * @param {Array} transactions 
     */
    processTransactionsForCrypto(crypto, transactions) {
        // Sort by timestamp for chronological processing
        const sortedTx = transactions
            .filter(tx => tx.type === 'buy' || tx.type === 'sell')
            .sort((a, b) => new Date(a.time) - new Date(b.time));

        let runningBalance = 0;
        let averageBuyPrice = 0;
        let totalBought = 0;
        let totalSold = 0;
        let totalFees = 0;

        // Process transactions chronologically
        sortedTx.forEach(tx => {
            const amount = parseFloat(tx.amount) || 0;
            const price = parseFloat(tx.price) || 0;
            const fee = parseFloat(tx.fee) || 0;

            totalFees += fee;

            if (tx.type === 'buy') {
                // Calculate weighted average buy price
                const oldBalance = runningBalance;
                const newBalance = runningBalance + amount;
                
                if (newBalance > 0) {
                    averageBuyPrice = ((oldBalance * averageBuyPrice) + (amount * price)) / newBalance;
                }
                
                runningBalance = newBalance;
                totalBought += amount;
            } else if (tx.type === 'sell') {
                runningBalance -= amount;
                totalSold += amount;
                
                // Reset average buy price if balance becomes zero or negative
                if (runningBalance <= 0) {
                    averageBuyPrice = 0;
                    runningBalance = 0;
                }
            }
        });

        // Cache the processed data
        this.cache.set(crypto, {
            balance: runningBalance,
            averageBuyPrice: averageBuyPrice,
            totalBought: totalBought,
            totalSold: totalSold,
            totalFees: totalFees,
            transactionCount: sortedTx.length,
            lastProcessed: Date.now()
        });

        this.lastUpdate.set(crypto, Date.now());
    }

    /**
     * Add new transaction and update cache
     * @param {Object} transaction 
     */
    addTransaction(transaction) {
        const crypto = this.extractCryptoFromTransaction(transaction);
        if (!crypto) return;

        // Get existing data or create new entry
        let data = this.cache.get(crypto) || {
            balance: 0,
            averageBuyPrice: 0,
            totalBought: 0,
            totalSold: 0,
            totalFees: 0,
            transactionCount: 0,
            lastProcessed: Date.now()
        };

        const amount = parseFloat(transaction.amount) || 0;
        const price = parseFloat(transaction.price) || 0;
        const fee = parseFloat(transaction.fee) || 0;

        data.totalFees += fee;
        data.transactionCount++;

        if (transaction.type === 'buy') {
            const oldBalance = data.balance;
            const newBalance = data.balance + amount;
            
            if (newBalance > 0) {
                data.averageBuyPrice = ((oldBalance * data.averageBuyPrice) + (amount * price)) / newBalance;
            }
            
            data.balance = newBalance;
            data.totalBought += amount;
        } else if (transaction.type === 'sell') {
            data.balance -= amount;
            data.totalSold += amount;
            
            if (data.balance <= 0) {
                data.averageBuyPrice = 0;
                data.balance = 0;
            }
        }

        data.lastProcessed = Date.now();
        this.cache.set(crypto, data);
        this.lastUpdate.set(crypto, Date.now());
    }

    /**
     * Get processed data for a crypto
     * @param {string} crypto 
     * @returns {Object|null}
     */
    getData(crypto) {
        return this.cache.get(crypto) || null;
    }

    /**
     * Check if cache needs refresh for a crypto
     * @param {string} crypto 
     * @param {number} maxAge - Maximum age in milliseconds
     * @returns {boolean}
     */
    needsRefresh(crypto, maxAge = 60000) { // 1 minute default
        const lastUpdate = this.lastUpdate.get(crypto);
        if (!lastUpdate) return true;
        
        return (Date.now() - lastUpdate) > maxAge;
    }

    /**
     * Clear cache for specific crypto
     * @param {string} crypto 
     */
    clearCrypto(crypto) {
        this.cache.delete(crypto);
        this.lastUpdate.delete(crypto);
    }

    /**
     * Clear all cache
     */
    clearAll() {
        this.cache.clear();
        this.lastUpdate.clear();
        this.isInitialized = false;
    }

    /**
     * Get cache statistics
     * @returns {Object}
     */
    getStats() {
        return {
            cachedCryptos: this.cache.size,
            isInitialized: this.isInitialized,
            totalTransactions: Array.from(this.cache.values())
                .reduce((sum, data) => sum + data.transactionCount, 0),
            memoryUsage: this.cache.size * 200 // Rough estimate in bytes
        };
    }
}

// Singleton instance
const transactionCache = new TransactionCache();

module.exports = { TransactionCache, transactionCache };