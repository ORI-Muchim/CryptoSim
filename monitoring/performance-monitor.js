// Performance Monitoring System
// Collects and tracks various performance metrics

const EventEmitter = require('events');
const os = require('os');
const fs = require('fs').promises;
const path = require('path');

class PerformanceMonitor extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.options = {
            collectInterval: options.collectInterval || 5000,    // 5 seconds
            historySize: options.historySize || 1440,           // 12 hours at 30s intervals
            alertThresholds: {
                cpuUsage: options.cpuThreshold || 80,           // 80%
                memoryUsage: options.memoryThreshold || 85,     // 85%
                diskUsage: options.diskThreshold || 90,         // 90%
                responseTime: options.responseThreshold || 5000, // 5 seconds
                errorRate: options.errorThreshold || 5,         // 5%
                activeConnections: options.connectionThreshold || 900 // 90% of max
            },
            logPath: options.logPath || './logs/performance.log',
            enabled: options.enabled !== false
        };

        // Metrics storage
        this.metrics = {
            system: [],
            application: [],
            websocket: [],
            database: [],
            api: []
        };

        // Performance counters
        this.counters = {
            requests: {
                total: 0,
                success: 0,
                error: 0,
                responseTimeSum: 0
            },
            websocket: {
                connections: 0,
                messages: 0,
                errors: 0
            },
            database: {
                queries: 0,
                errors: 0,
                responseTimeSum: 0
            }
        };

        // Start monitoring if enabled
        if (this.options.enabled) {
            this.start();
        }
    }

    // Start performance monitoring
    start() {
        console.log('Performance monitoring started');
        
        this.collectInterval = setInterval(() => {
            this.collectSystemMetrics();
            this.collectApplicationMetrics();
            this.checkAlerts();
        }, this.options.collectInterval);

        // Collect initial baseline
        this.collectSystemMetrics();
        this.collectApplicationMetrics();
    }

    // Stop performance monitoring
    stop() {
        if (this.collectInterval) {
            clearInterval(this.collectInterval);
            this.collectInterval = null;
        }
        console.log('Performance monitoring stopped');
    }

    // Collect system-level metrics
    async collectSystemMetrics() {
        const timestamp = Date.now();
        
        try {
            // CPU metrics
            const cpus = os.cpus();
            const cpuUsage = await this.getCpuUsage();
            
            // Memory metrics
            const totalMemory = os.totalmem();
            const freeMemory = os.freemem();
            const usedMemory = totalMemory - freeMemory;
            const memoryUsage = (usedMemory / totalMemory) * 100;
            
            // Disk usage (for the current directory)
            const diskUsage = await this.getDiskUsage();
            
            // Network metrics
            const networkInterfaces = os.networkInterfaces();
            
            // System load
            const loadAverage = os.loadavg();
            
            const systemMetrics = {
                timestamp,
                cpu: {
                    usage: cpuUsage,
                    cores: cpus.length,
                    loadAverage: loadAverage
                },
                memory: {
                    total: totalMemory,
                    used: usedMemory,
                    free: freeMemory,
                    usage: memoryUsage
                },
                disk: diskUsage,
                uptime: os.uptime(),
                hostname: os.hostname(),
                platform: os.platform()
            };

            this.addMetric('system', systemMetrics);
            
        } catch (error) {
            console.error('Error collecting system metrics:', error);
        }
    }

    // Collect application-specific metrics
    collectApplicationMetrics() {
        const timestamp = Date.now();
        
        try {
            // Node.js process metrics
            const processMemory = process.memoryUsage();
            const processUptime = process.uptime();
            
            // Request metrics
            const requestMetrics = this.calculateRequestMetrics();
            
            // WebSocket metrics
            const wsMetrics = this.getWebSocketMetrics();
            
            // Database metrics
            const dbMetrics = this.getDatabaseMetrics();
            
            const appMetrics = {
                timestamp,
                process: {
                    memory: processMemory,
                    uptime: processUptime,
                    pid: process.pid,
                    version: process.version
                },
                requests: requestMetrics,
                websocket: wsMetrics,
                database: dbMetrics
            };

            this.addMetric('application', appMetrics);
            
        } catch (error) {
            console.error('Error collecting application metrics:', error);
        }
    }

    // Get CPU usage percentage
    getCpuUsage() {
        return new Promise((resolve) => {
            const startMeasures = os.cpus();
            
            setTimeout(() => {
                const endMeasures = os.cpus();
                let totalIdle = 0;
                let totalTick = 0;
                
                for (let i = 0; i < startMeasures.length; i++) {
                    const startMeasure = startMeasures[i];
                    const endMeasure = endMeasures[i];
                    
                    const startTotal = Object.values(startMeasure.times).reduce((a, b) => a + b, 0);
                    const endTotal = Object.values(endMeasure.times).reduce((a, b) => a + b, 0);
                    
                    const idle = endMeasure.times.idle - startMeasure.times.idle;
                    const total = endTotal - startTotal;
                    
                    totalIdle += idle;
                    totalTick += total;
                }
                
                const cpuUsage = 100 - (totalIdle / totalTick * 100);
                resolve(Math.round(cpuUsage * 100) / 100);
            }, 100);
        });
    }

    // Get disk usage
    async getDiskUsage() {
        try {
            const stats = await fs.stat('./');
            // This is a simplified version - in production, you'd use a proper disk usage library
            return {
                used: 0,
                total: 0,
                usage: 0
            };
        } catch (error) {
            return {
                used: 0,
                total: 0,
                usage: 0,
                error: error.message
            };
        }
    }

    // Calculate request metrics
    calculateRequestMetrics() {
        const { requests } = this.counters;
        
        const avgResponseTime = requests.total > 0 ? 
            requests.responseTimeSum / requests.total : 0;
        
        const errorRate = requests.total > 0 ? 
            (requests.error / requests.total) * 100 : 0;
        
        return {
            total: requests.total,
            success: requests.success,
            error: requests.error,
            errorRate: Math.round(errorRate * 100) / 100,
            avgResponseTime: Math.round(avgResponseTime * 100) / 100
        };
    }

    // Get WebSocket metrics
    getWebSocketMetrics() {
        const { websocket } = this.counters;
        
        return {
            connections: websocket.connections,
            messages: websocket.messages,
            errors: websocket.errors
        };
    }

    // Get database metrics
    getDatabaseMetrics() {
        const { database } = this.counters;
        
        const avgResponseTime = database.queries > 0 ? 
            database.responseTimeSum / database.queries : 0;
        
        return {
            queries: database.queries,
            errors: database.errors,
            avgResponseTime: Math.round(avgResponseTime * 100) / 100
        };
    }

    // Add metric to history
    addMetric(type, metric) {
        if (!this.metrics[type]) {
            this.metrics[type] = [];
        }
        
        this.metrics[type].push(metric);
        
        // Keep only recent history
        if (this.metrics[type].length > this.options.historySize) {
            this.metrics[type] = this.metrics[type].slice(-this.options.historySize);
        }
        
        // Emit metric event
        this.emit('metric', { type, data: metric });
    }

    // Check alert thresholds
    checkAlerts() {
        const latestSystem = this.getLatestMetric('system');
        const latestApp = this.getLatestMetric('application');
        
        if (!latestSystem || !latestApp) return;
        
        const alerts = [];
        
        // CPU usage alert
        if (latestSystem.cpu.usage > this.options.alertThresholds.cpuUsage) {
            alerts.push({
                type: 'cpu_high',
                severity: 'warning',
                message: `High CPU usage: ${latestSystem.cpu.usage.toFixed(2)}%`,
                value: latestSystem.cpu.usage,
                threshold: this.options.alertThresholds.cpuUsage,
                timestamp: Date.now()
            });
        }
        
        // Memory usage alert
        if (latestSystem.memory.usage > this.options.alertThresholds.memoryUsage) {
            alerts.push({
                type: 'memory_high',
                severity: 'warning',
                message: `High memory usage: ${latestSystem.memory.usage.toFixed(2)}%`,
                value: latestSystem.memory.usage,
                threshold: this.options.alertThresholds.memoryUsage,
                timestamp: Date.now()
            });
        }
        
        // Response time alert
        if (latestApp.requests.avgResponseTime > this.options.alertThresholds.responseTime) {
            alerts.push({
                type: 'response_time_high',
                severity: 'warning',
                message: `High response time: ${latestApp.requests.avgResponseTime.toFixed(2)}ms`,
                value: latestApp.requests.avgResponseTime,
                threshold: this.options.alertThresholds.responseTime,
                timestamp: Date.now()
            });
        }
        
        // Error rate alert
        if (latestApp.requests.errorRate > this.options.alertThresholds.errorRate) {
            alerts.push({
                type: 'error_rate_high',
                severity: 'error',
                message: `High error rate: ${latestApp.requests.errorRate.toFixed(2)}%`,
                value: latestApp.requests.errorRate,
                threshold: this.options.alertThresholds.errorRate,
                timestamp: Date.now()
            });
        }
        
        // Emit alerts
        alerts.forEach(alert => {
            this.emit('alert', alert);
            this.logAlert(alert);
        });
    }

    // Log alert to file
    async logAlert(alert) {
        try {
            const logDir = path.dirname(this.options.logPath);
            await fs.mkdir(logDir, { recursive: true });
            
            const logEntry = `${new Date(alert.timestamp).toISOString()} [${alert.severity.toUpperCase()}] ${alert.type}: ${alert.message}\n`;
            await fs.appendFile(this.options.logPath, logEntry);
        } catch (error) {
            console.error('Error logging alert:', error);
        }
    }

    // Record API request
    recordRequest(responseTime, success = true) {
        this.counters.requests.total++;
        this.counters.requests.responseTimeSum += responseTime;
        
        if (success) {
            this.counters.requests.success++;
        } else {
            this.counters.requests.error++;
        }
    }

    // Record WebSocket event
    recordWebSocketEvent(type, data = {}) {
        switch (type) {
            case 'connection':
                this.counters.websocket.connections = data.count || 0;
                break;
            case 'message':
                this.counters.websocket.messages++;
                break;
            case 'error':
                this.counters.websocket.errors++;
                break;
        }
    }

    // Record database query
    recordDatabaseQuery(responseTime, success = true) {
        this.counters.database.queries++;
        this.counters.database.responseTimeSum += responseTime;
        
        if (!success) {
            this.counters.database.errors++;
        }
    }

    // Get latest metric
    getLatestMetric(type) {
        const metrics = this.metrics[type];
        return metrics && metrics.length > 0 ? metrics[metrics.length - 1] : null;
    }

    // Get metrics for a time range
    getMetricsRange(type, startTime, endTime) {
        const metrics = this.metrics[type] || [];
        return metrics.filter(metric => 
            metric.timestamp >= startTime && metric.timestamp <= endTime
        );
    }

    // Get current status summary
    getStatus() {
        const latestSystem = this.getLatestMetric('system');
        const latestApp = this.getLatestMetric('application');
        
        return {
            system: latestSystem,
            application: latestApp,
            counters: { ...this.counters },
            uptime: process.uptime(),
            timestamp: Date.now()
        };
    }

    // Export metrics data
    exportMetrics(type, format = 'json') {
        const data = this.metrics[type] || [];
        
        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
            // Simple CSV export - could be enhanced
            if (data.length === 0) return '';
            
            const headers = Object.keys(data[0]).join(',');
            const rows = data.map(item => 
                Object.values(item).map(val => 
                    typeof val === 'object' ? JSON.stringify(val) : val
                ).join(',')
            );
            
            return [headers, ...rows].join('\n');
        }
        
        return data;
    }

    // Reset counters
    resetCounters() {
        this.counters = {
            requests: {
                total: 0,
                success: 0,
                error: 0,
                responseTimeSum: 0
            },
            websocket: {
                connections: 0,
                messages: 0,
                errors: 0
            },
            database: {
                queries: 0,
                errors: 0,
                responseTimeSum: 0
            }
        };
    }
}

module.exports = PerformanceMonitor;