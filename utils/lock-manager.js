/**
 * Lock Manager for handling race conditions in critical operations
 * Prevents concurrent access to resources that could cause data corruption
 */
class LockManager {
    constructor() {
        this.locks = new Map();
        this.lockTimeouts = new Map();
        this.defaultTimeout = 30000; // 30 seconds timeout
    }

    /**
     * Acquire a lock for a resource
     * @param {string} resource - Resource identifier
     * @param {number} timeout - Lock timeout in milliseconds
     * @returns {Promise<boolean>} - True if lock acquired, false if timeout
     */
    async acquireLock(resource, timeout = this.defaultTimeout) {
        return new Promise((resolve, reject) => {
            // Check if lock already exists
            if (this.locks.has(resource)) {
                // Wait for lock to be released or timeout
                const startTime = Date.now();
                const checkLock = () => {
                    if (!this.locks.has(resource)) {
                        this.locks.set(resource, { 
                            acquired: Date.now(),
                            timeout: timeout 
                        });
                        this.setLockTimeout(resource, timeout);
                        resolve(true);
                    } else if (Date.now() - startTime > timeout) {
                        resolve(false);
                    } else {
                        setTimeout(checkLock, 10); // Check every 10ms
                    }
                };
                checkLock();
            } else {
                // Acquire lock immediately
                this.locks.set(resource, { 
                    acquired: Date.now(),
                    timeout: timeout 
                });
                this.setLockTimeout(resource, timeout);
                resolve(true);
            }
        });
    }

    /**
     * Release a lock
     * @param {string} resource - Resource identifier
     */
    releaseLock(resource) {
        if (this.locks.has(resource)) {
            this.locks.delete(resource);
            
            // Clear timeout
            if (this.lockTimeouts.has(resource)) {
                clearTimeout(this.lockTimeouts.get(resource));
                this.lockTimeouts.delete(resource);
            }
        }
    }

    /**
     * Set automatic lock timeout
     * @param {string} resource 
     * @param {number} timeout 
     */
    setLockTimeout(resource, timeout) {
        if (this.lockTimeouts.has(resource)) {
            clearTimeout(this.lockTimeouts.get(resource));
        }

        const timeoutId = setTimeout(() => {
            console.warn(`Lock for resource ${resource} timed out and was automatically released`);
            this.releaseLock(resource);
        }, timeout);

        this.lockTimeouts.set(resource, timeoutId);
    }

    /**
     * Check if a resource is locked
     * @param {string} resource 
     * @returns {boolean}
     */
    isLocked(resource) {
        return this.locks.has(resource);
    }

    /**
     * Execute a function with exclusive access to a resource
     * @param {string} resource - Resource identifier
     * @param {Function} operation - Function to execute
     * @param {number} timeout - Lock timeout
     * @returns {Promise<any>} - Result of the operation
     */
    async withLock(resource, operation, timeout = this.defaultTimeout) {
        const lockAcquired = await this.acquireLock(resource, timeout);
        
        if (!lockAcquired) {
            throw new Error(`Failed to acquire lock for resource: ${resource} (timeout: ${timeout}ms)`);
        }

        try {
            return await operation();
        } finally {
            this.releaseLock(resource);
        }
    }

    /**
     * Clear all locks (use with caution)
     */
    clearAllLocks() {
        // Clear all timeouts
        for (const timeoutId of this.lockTimeouts.values()) {
            clearTimeout(timeoutId);
        }
        
        this.locks.clear();
        this.lockTimeouts.clear();
    }

    /**
     * Get lock statistics
     * @returns {object}
     */
    getStats() {
        const activeLocks = Array.from(this.locks.entries()).map(([resource, info]) => ({
            resource,
            acquired: new Date(info.acquired).toISOString(),
            age: Date.now() - info.acquired,
            timeout: info.timeout
        }));

        return {
            activeLockCount: this.locks.size,
            activeLocks,
            totalLockTimeouts: this.lockTimeouts.size
        };
    }
}

// Singleton instance
const lockManager = new LockManager();

module.exports = { LockManager, lockManager };