const EventEmitter = require('events');
const logger = require('../utils/logger');

class AlertManager extends EventEmitter {
    constructor(options = {}) {
        super();
        this.config = {
            // CPU thresholds
            cpuWarning: options.cpuWarning || 70,
            cpuCritical: options.cpuCritical || 85,
            
            // Memory thresholds
            memoryWarning: options.memoryWarning || 75,
            memoryCritical: options.memoryCritical || 90,
            
            // Response time thresholds (ms)
            responseTimeWarning: options.responseTimeWarning || 2000,
            responseTimeCritical: options.responseTimeCritical || 5000,
            
            // Error rate thresholds (%)
            errorRateWarning: options.errorRateWarning || 5,
            errorRateCritical: options.errorRateCritical || 15,
            
            // WebSocket connection thresholds
            wsConnectionWarning: options.wsConnectionWarning || 1000,
            wsConnectionCritical: options.wsConnectionCritical || 1500,
            
            // Alert cooldown period (ms)
            cooldownPeriod: options.cooldownPeriod || 5 * 60 * 1000, // 5 minutes
            
            // Enable/disable specific alerts
            enableEmailAlerts: options.enableEmailAlerts || false,
            enableSlackAlerts: options.enableSlackAlerts || false,
            enableWebhookAlerts: options.enableWebhookAlerts || false,
            
            // Webhook URL for custom integrations
            webhookUrl: options.webhookUrl || null
        };
        
        this.activeAlerts = new Map(); // Track active alerts
        this.alertHistory = []; // Keep history of alerts
        this.maxHistorySize = 1000;
        
        this.setupDefaultHandlers();
    }
    
    setupDefaultHandlers() {
        // Log all alerts
        this.on('alert', (alert) => {
            logger.warn('ALERT TRIGGERED', {
                type: alert.type,
                severity: alert.severity,
                message: alert.message,
                value: alert.value,
                threshold: alert.threshold,
                timestamp: alert.timestamp
            });
            
            this.addToHistory(alert);
        });
        
        // Handle critical alerts
        this.on('critical', (alert) => {
            logger.error('CRITICAL ALERT', alert);
            
            // Send notifications for critical alerts
            this.sendNotifications(alert);
        });
        
        // Handle alert resolution
        this.on('resolved', (alert) => {
            logger.info('ALERT RESOLVED', {
                type: alert.type,
                duration: alert.duration,
                message: alert.resolvedMessage
            });
            
            this.addToHistory(alert);
        });
    }
    
    checkMetrics(metrics) {
        const now = Date.now();
        const alerts = [];
        
        // CPU Usage Alert
        if (metrics.cpu && metrics.cpu.usage !== undefined) {
            const cpuUsage = metrics.cpu.usage;
            
            if (cpuUsage >= this.config.cpuCritical) {
                alerts.push(this.createAlert('cpu', 'critical', cpuUsage, this.config.cpuCritical, 
                    `Critical CPU usage: ${cpuUsage.toFixed(1)}%`));
            } else if (cpuUsage >= this.config.cpuWarning) {
                alerts.push(this.createAlert('cpu', 'warning', cpuUsage, this.config.cpuWarning, 
                    `High CPU usage: ${cpuUsage.toFixed(1)}%`));
            } else {
                this.resolveAlert('cpu');
            }
        }
        
        // Memory Usage Alert
        if (metrics.memory && metrics.memory.usage !== undefined) {
            const memoryUsage = metrics.memory.usage;
            
            if (memoryUsage >= this.config.memoryCritical) {
                alerts.push(this.createAlert('memory', 'critical', memoryUsage, this.config.memoryCritical,
                    `Critical memory usage: ${memoryUsage.toFixed(1)}%`));
            } else if (memoryUsage >= this.config.memoryWarning) {
                alerts.push(this.createAlert('memory', 'warning', memoryUsage, this.config.memoryWarning,
                    `High memory usage: ${memoryUsage.toFixed(1)}%`));
            } else {
                this.resolveAlert('memory');
            }
        }
        
        // Response Time Alert
        if (metrics.requests && metrics.requests.avgResponseTime !== undefined) {
            const avgResponseTime = metrics.requests.avgResponseTime;
            
            if (avgResponseTime >= this.config.responseTimeCritical) {
                alerts.push(this.createAlert('response_time', 'critical', avgResponseTime, this.config.responseTimeCritical,
                    `Critical response time: ${avgResponseTime.toFixed(0)}ms`));
            } else if (avgResponseTime >= this.config.responseTimeWarning) {
                alerts.push(this.createAlert('response_time', 'warning', avgResponseTime, this.config.responseTimeWarning,
                    `Slow response time: ${avgResponseTime.toFixed(0)}ms`));
            } else {
                this.resolveAlert('response_time');
            }
        }
        
        // Error Rate Alert
        if (metrics.requests && metrics.requests.total > 0) {
            const errorRate = (metrics.requests.failed / metrics.requests.total) * 100;
            
            if (errorRate >= this.config.errorRateCritical) {
                alerts.push(this.createAlert('error_rate', 'critical', errorRate, this.config.errorRateCritical,
                    `Critical error rate: ${errorRate.toFixed(1)}%`));
            } else if (errorRate >= this.config.errorRateWarning) {
                alerts.push(this.createAlert('error_rate', 'warning', errorRate, this.config.errorRateWarning,
                    `High error rate: ${errorRate.toFixed(1)}%`));
            } else {
                this.resolveAlert('error_rate');
            }
        }
        
        // WebSocket Connections Alert
        if (metrics.websocket && metrics.websocket.connections !== undefined) {
            const connections = metrics.websocket.connections;
            
            if (connections >= this.config.wsConnectionCritical) {
                alerts.push(this.createAlert('websocket', 'critical', connections, this.config.wsConnectionCritical,
                    `Critical WebSocket connections: ${connections}`));
            } else if (connections >= this.config.wsConnectionWarning) {
                alerts.push(this.createAlert('websocket', 'warning', connections, this.config.wsConnectionWarning,
                    `High WebSocket connections: ${connections}`));
            } else {
                this.resolveAlert('websocket');
            }
        }
        
        // Process alerts
        alerts.forEach(alert => this.processAlert(alert));
        
        return alerts;
    }
    
    createAlert(type, severity, value, threshold, message) {
        return {
            type,
            severity,
            value,
            threshold,
            message,
            timestamp: new Date().toISOString(),
            id: `${type}_${severity}_${Date.now()}`
        };
    }
    
    processAlert(alert) {
        const alertKey = `${alert.type}_${alert.severity}`;
        const existingAlert = this.activeAlerts.get(alertKey);
        
        // Check cooldown period
        if (existingAlert && (Date.now() - existingAlert.lastTriggered) < this.config.cooldownPeriod) {
            return; // Skip if in cooldown period
        }
        
        // Update or create active alert
        this.activeAlerts.set(alertKey, {
            ...alert,
            count: existingAlert ? existingAlert.count + 1 : 1,
            firstTriggered: existingAlert ? existingAlert.firstTriggered : Date.now(),
            lastTriggered: Date.now()
        });
        
        // Emit alert event
        this.emit('alert', alert);
        
        // Emit severity-specific event
        this.emit(alert.severity, alert);
    }
    
    resolveAlert(type) {
        const warningKey = `${type}_warning`;
        const criticalKey = `${type}_critical`;
        
        [warningKey, criticalKey].forEach(key => {
            const activeAlert = this.activeAlerts.get(key);
            if (activeAlert) {
                const resolvedAlert = {
                    ...activeAlert,
                    resolvedAt: new Date().toISOString(),
                    duration: Date.now() - activeAlert.firstTriggered,
                    resolvedMessage: `${activeAlert.type} alert resolved`,
                    resolved: true
                };
                
                this.activeAlerts.delete(key);
                this.emit('resolved', resolvedAlert);
            }
        });
    }
    
    addToHistory(alert) {
        this.alertHistory.unshift(alert);
        
        // Keep history size under limit
        if (this.alertHistory.length > this.maxHistorySize) {
            this.alertHistory.splice(this.maxHistorySize);
        }
    }
    
    async sendNotifications(alert) {
        const promises = [];
        
        // Webhook notification
        if (this.config.enableWebhookAlerts && this.config.webhookUrl) {
            promises.push(this.sendWebhookNotification(alert));
        }
        
        // Email notification (placeholder)
        if (this.config.enableEmailAlerts) {
            promises.push(this.sendEmailNotification(alert));
        }
        
        // Slack notification (placeholder)
        if (this.config.enableSlackAlerts) {
            promises.push(this.sendSlackNotification(alert));
        }
        
        try {
            await Promise.allSettled(promises);
        } catch (error) {
            logger.error('Error sending notifications:', error);
        }
    }
    
    async sendWebhookNotification(alert) {
        if (!this.config.webhookUrl) return;
        
        try {
            const axios = require('axios');
            await axios.post(this.config.webhookUrl, {
                alert: alert,
                service: 'Trading Simulator',
                timestamp: new Date().toISOString()
            }, {
                timeout: 5000
            });
            
            logger.info('Webhook notification sent successfully');
        } catch (error) {
            logger.error('Failed to send webhook notification:', error.message);
        }
    }
    
    async sendEmailNotification(alert) {
        // Placeholder for email notification
        logger.info('Email notification would be sent:', alert.message);
    }
    
    async sendSlackNotification(alert) {
        // Placeholder for Slack notification
        logger.info('Slack notification would be sent:', alert.message);
    }
    
    getActiveAlerts() {
        return Array.from(this.activeAlerts.values());
    }
    
    getAlertHistory(limit = 100) {
        return this.alertHistory.slice(0, limit);
    }
    
    getAlertStats() {
        const stats = {
            activeAlerts: this.activeAlerts.size,
            totalAlerts: this.alertHistory.length,
            alertsByType: {},
            alertsBySeverity: { warning: 0, critical: 0 }
        };
        
        // Count alerts by type and severity
        this.alertHistory.forEach(alert => {
            stats.alertsByType[alert.type] = (stats.alertsByType[alert.type] || 0) + 1;
            if (alert.severity) {
                stats.alertsBySeverity[alert.severity]++;
            }
        });
        
        return stats;
    }
    
    clearHistory() {
        this.alertHistory = [];
        logger.info('Alert history cleared');
    }
    
    updateConfig(newConfig) {
        Object.assign(this.config, newConfig);
        logger.info('Alert manager configuration updated');
    }
}

module.exports = AlertManager;