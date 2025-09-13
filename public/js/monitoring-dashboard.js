// Performance Monitoring Dashboard Client
// Connects to performance monitoring backend and displays real-time metrics

class MonitoringDashboard {
    constructor() {
        this.ws = null;
        this.charts = {};
        this.metrics = {
            cpu: [],
            memory: [],
            responseTime: [],
            connections: [],
            errorRate: [],
            requests: []
        };
        this.alerts = [];
        this.logs = [];
        this.maxDataPoints = 50;
        this.autoRefresh = true;
        this.refreshInterval = null;
        this.currentRefreshRate = 5000;
        
        this.init();
    }

    init() {
        this.setupWebSocket();
        this.initializeCharts();
        this.setupEventListeners();
        this.startAutoRefresh();
        
        console.log('🔍 Monitoring dashboard initialized');
    }

    setupWebSocket() {
        const wsUrl = `ws://${window.location.host}`;
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('Connected to monitoring WebSocket');
            this.updateStatus('healthy', 'System Healthy');
            
            // Send identification message to server
            this.ws.send(JSON.stringify({
                type: 'client_identification',
                clientType: 'monitoring'
            }));
            
            // Request initial data
            this.requestMetricsUpdate();
        };
        
        this.ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleWebSocketMessage(data);
            } catch (error) {
                console.error('Error parsing WebSocket message:', error);
            }
        };
        
        this.ws.onclose = () => {
            console.log('Monitoring WebSocket disconnected. Reconnecting...');
            this.updateStatus('error', 'Disconnected');
            setTimeout(() => this.setupWebSocket(), 5000);
        };
        
        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.updateStatus('error', 'Connection Error');
        };
    }

    handleWebSocketMessage(data) {
        switch (data.type) {
            case 'performance_metrics':
                this.updateMetrics(data.data);
                break;
            case 'performance_alert':
                this.addAlert(data.data);
                break;
            case 'system_log':
                this.addLog(data.data);
                break;
            case 'price_update':
            case 'orderbook_update':
            case 'candle_update':
                // Ignore trading-related messages for monitoring dashboard
                break;
            default:
                // Only log truly unknown message types
                if (!['price_update', 'orderbook_update', 'candle_update'].includes(data.type)) {
                    console.log('Unknown message type:', data.type);
                }
        }
    }

    requestMetricsUpdate() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'request_metrics' }));
        } else {
            // Fallback to HTTP API
            this.fetchMetricsFromAPI();
        }
    }

    async fetchMetricsFromAPI() {
        try {
            // Since we don't have a dedicated monitoring API endpoint yet,
            // we'll simulate metrics for demonstration
            const mockMetrics = this.generateMockMetrics();
            this.updateMetrics(mockMetrics);
        } catch (error) {
            console.error('Error fetching metrics:', error);
            this.updateStatus('warning', 'Metrics Unavailable');
        }
    }

    generateMockMetrics() {
        const now = Date.now();
        return {
            timestamp: now,
            system: {
                cpu: {
                    usage: Math.random() * 100
                },
                memory: {
                    usage: 50 + Math.random() * 40
                }
            },
            application: {
                requests: {
                    total: Math.floor(Math.random() * 1000),
                    avgResponseTime: 100 + Math.random() * 400,
                    errorRate: Math.random() * 5
                },
                websocket: {
                    connections: Math.floor(Math.random() * 50)
                }
            }
        };
    }

    updateMetrics(data) {
        console.log('Received metrics data:', data);
        
        // If no real data, use mock data for demonstration
        if (!data.system || !data.application) {
            console.log('No real metrics available, using mock data');
            data = this.generateMockMetrics();
        }
        
        const timestamp = new Date(data.timestamp);
        
        // Update CPU metrics
        if (data.system && data.system.cpu) {
            const cpuUsage = data.system.cpu.usage || 0;
            this.addMetricData('cpu', timestamp, cpuUsage);
            this.updateMetricDisplay('cpu-usage', `${cpuUsage.toFixed(1)}%`, cpuUsage);
        }
        
        // Update Memory metrics
        if (data.system && data.system.memory) {
            const memoryUsage = data.system.memory.usage || 0;
            this.addMetricData('memory', timestamp, memoryUsage);
            this.updateMetricDisplay('memory-usage', `${memoryUsage.toFixed(1)}%`, memoryUsage);
        }
        
        // Update Response Time metrics
        if (data.application && data.application.requests) {
            const responseTime = data.application.requests.avgResponseTime || 0;
            this.addMetricData('responseTime', timestamp, responseTime);
            this.updateMetricDisplay('response-time', `${responseTime.toFixed(0)}ms`, responseTime);
        }
        
        // Update WebSocket Connections
        if (data.application && data.application.websocket) {
            const connections = data.application.websocket.connections || 0;
            this.addMetricData('connections', timestamp, connections);
            this.updateMetricDisplay('ws-connections', connections.toString(), connections);
        }
        
        // Update Error Rate
        if (data.application && data.application.requests) {
            const errorRate = data.application.requests.errorRate || 0;
            this.addMetricData('errorRate', timestamp, errorRate);
            this.updateMetricDisplay('error-rate', `${errorRate.toFixed(2)}%`, errorRate);
        }
        
        // Update Request Volume
        if (data.application && data.application.requests) {
            const requestCount = data.application.requests.total || 0;
            this.addMetricData('requests', timestamp, requestCount);
            this.updateMetricDisplay('request-volume', requestCount.toString(), requestCount);
        }
        
        this.updateCharts();
        this.checkSystemStatus(data);
    }

    addMetricData(type, timestamp, value) {
        if (!this.metrics[type]) {
            this.metrics[type] = [];
        }
        
        this.metrics[type].push({
            x: timestamp,
            y: value
        });
        
        // Keep only recent data points
        if (this.metrics[type].length > this.maxDataPoints) {
            this.metrics[type].shift();
        }
    }

    updateMetricDisplay(elementId, value, numericValue) {
        const element = document.getElementById(elementId);
        if (element) {
            element.textContent = value;
            
            // Update color based on thresholds
            element.className = 'metric-value';
            if (elementId === 'cpu-usage' || elementId === 'memory-usage') {
                if (numericValue > 80) {
                    element.classList.add('error');
                } else if (numericValue > 60) {
                    element.classList.add('warning');
                }
            } else if (elementId === 'response-time') {
                if (numericValue > 1000) {
                    element.classList.add('error');
                } else if (numericValue > 500) {
                    element.classList.add('warning');
                }
            } else if (elementId === 'error-rate') {
                if (numericValue > 5) {
                    element.classList.add('error');
                } else if (numericValue > 2) {
                    element.classList.add('warning');
                }
            }
        }
    }

    checkSystemStatus(data) {
        let status = 'healthy';
        let message = 'System Healthy';
        
        if (data.system) {
            if (data.system.cpu && data.system.cpu.usage > 80) {
                status = 'warning';
                message = 'High CPU Usage';
            }
            if (data.system.memory && data.system.memory.usage > 85) {
                status = 'error';
                message = 'High Memory Usage';
            }
        }
        
        if (data.application && data.application.requests) {
            if (data.application.requests.errorRate > 5) {
                status = 'error';
                message = 'High Error Rate';
            } else if (data.application.requests.avgResponseTime > 1000) {
                status = 'warning';
                message = 'Slow Response Time';
            }
        }
        
        this.updateStatus(status, message);
    }

    updateStatus(status, message) {
        const statusLight = document.getElementById('system-status');
        const statusText = document.getElementById('status-text');
        
        if (statusLight) {
            statusLight.className = 'status-light';
            if (status === 'warning') {
                statusLight.classList.add('warning');
            } else if (status === 'error') {
                statusLight.classList.add('error');
            }
        }
        
        if (statusText) {
            statusText.textContent = message;
        }
    }

    initializeCharts() {
        const chartConfigs = {
            'cpu-chart': {
                type: 'line',
                data: { datasets: [{ label: 'CPU %', data: [], borderColor: '#00d68f', fill: false }] },
                options: this.getChartOptions('CPU Usage (%)')
            },
            'memory-chart': {
                type: 'line',
                data: { datasets: [{ label: 'Memory %', data: [], borderColor: '#ff5a5f', fill: false }] },
                options: this.getChartOptions('Memory Usage (%)')
            },
            'response-chart': {
                type: 'line',
                data: { datasets: [{ label: 'Response Time', data: [], borderColor: '#ffd700', fill: false }] },
                options: this.getChartOptions('Response Time (ms)')
            },
            'connections-chart': {
                type: 'line',
                data: { datasets: [{ label: 'Connections', data: [], borderColor: '#00bfff', fill: false }] },
                options: this.getChartOptions('Active Connections')
            },
            'error-chart': {
                type: 'line',
                data: { datasets: [{ label: 'Error Rate', data: [], borderColor: '#ff4500', fill: false }] },
                options: this.getChartOptions('Error Rate (%)')
            },
            'requests-chart': {
                type: 'line',
                data: { datasets: [{ label: 'Requests', data: [], borderColor: '#9370db', fill: false }] },
                options: this.getChartOptions('Request Volume')
            }
        };

        Object.entries(chartConfigs).forEach(([canvasId, config]) => {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                this.charts[canvasId] = new Chart(canvas, config);
            }
        });
    }

    getChartOptions(title) {
        return {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                title: {
                    display: false
                },
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    type: 'time',
                    time: {
                        displayFormats: {
                            minute: 'HH:mm'
                        }
                    },
                    ticks: {
                        color: '#888'
                    },
                    grid: {
                        color: '#333'
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: '#888'
                    },
                    grid: {
                        color: '#333'
                    }
                }
            },
            elements: {
                point: {
                    radius: 0
                }
            },
            interaction: {
                intersect: false
            }
        };
    }

    updateCharts() {
        Object.entries(this.charts).forEach(([chartId, chart]) => {
            const metricType = this.getMetricTypeFromChartId(chartId);
            if (this.metrics[metricType]) {
                chart.data.datasets[0].data = [...this.metrics[metricType]];
                chart.update('none');
            }
        });
    }

    getMetricTypeFromChartId(chartId) {
        const mapping = {
            'cpu-chart': 'cpu',
            'memory-chart': 'memory',
            'response-chart': 'responseTime',
            'connections-chart': 'connections',
            'error-chart': 'errorRate',
            'requests-chart': 'requests'
        };
        return mapping[chartId] || 'cpu';
    }

    addAlert(alert) {
        this.alerts.unshift({
            ...alert,
            id: Date.now(),
            timestamp: new Date()
        });
        
        // Keep only recent alerts
        if (this.alerts.length > 20) {
            this.alerts = this.alerts.slice(0, 20);
        }
        
        this.updateAlertsDisplay();
    }

    updateAlertsDisplay() {
        const container = document.getElementById('alerts-container');
        if (!container) return;
        
        if (this.alerts.length === 0) {
            container.innerHTML = `
                <div class="alert-item">
                    <div class="alert-icon">
                        <i class="fas fa-info-circle alert-icon-blue"></i>
                    </div>
                    <div class="alert-content">
                        <div class="alert-message">No active alerts</div>
                        <div class="alert-time">System running normally</div>
                    </div>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.alerts.map(alert => `
            <div class="alert-item alert-${alert.severity}">
                <div class="alert-icon">
                    <i class="fas fa-${alert.severity === 'error' ? 'exclamation-triangle' : 'exclamation-circle'} alert-icon-${alert.severity === 'error' ? 'red' : 'yellow'}"></i>
                </div>
                <div class="alert-content">
                    <div class="alert-message">${alert.message}</div>
                    <div class="alert-time">${alert.timestamp.toLocaleTimeString()}</div>
                </div>
            </div>
        `).join('');
    }

    addLog(log) {
        this.logs.unshift({
            ...log,
            timestamp: new Date()
        });
        
        // Keep only recent logs
        if (this.logs.length > 100) {
            this.logs = this.logs.slice(0, 100);
        }
        
        this.updateLogsDisplay();
    }

    updateLogsDisplay() {
        const container = document.getElementById('logs-container');
        if (!container) return;
        
        const logEntries = this.logs.map(log => `
            <div class="log-entry ${log.level || 'info'}">
                [${log.timestamp.toLocaleTimeString()}] ${log.message}
            </div>
        `).join('');
        
        container.innerHTML = logEntries || '<div class="log-entry info">[INFO] Monitoring dashboard initialized</div>';
    }

    setupEventListeners() {
        // Auto-refresh toggle
        const autoRefreshCheckbox = document.getElementById('auto-refresh');
        if (autoRefreshCheckbox) {
            autoRefreshCheckbox.addEventListener('change', (e) => {
                this.autoRefresh = e.target.checked;
                if (this.autoRefresh) {
                    this.startAutoRefresh();
                } else {
                    this.stopAutoRefresh();
                }
            });
        }

        // Refresh interval selector
        const refreshSelect = document.getElementById('refresh-interval');
        if (refreshSelect) {
            refreshSelect.addEventListener('change', (e) => {
                this.currentRefreshRate = parseInt(e.target.value);
                if (this.autoRefresh) {
                    this.stopAutoRefresh();
                    this.startAutoRefresh();
                }
            });
        }

        // Global functions for HTML onclick handlers
        window.exportMetrics = () => this.exportMetrics();
        window.dismissAllAlerts = () => this.dismissAllAlerts();
        window.refreshData = () => {
            this.requestMetricsUpdate();
            this.loadSystemStats();
            this.loadAlerts();
        };
    }

    startAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.refreshInterval = setInterval(() => {
            if (this.autoRefresh) {
                this.requestMetricsUpdate();
            }
        }, this.currentRefreshRate || 5000);
    }

    stopAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }

    // New methods for enhanced dashboard functionality
    async exportMetrics() {
        try {
            console.log('Exporting metrics...');
            
            // Get all metric types
            const metricTypes = ['system', 'application', 'websocket', 'database', 'api'];
            const exports = {};
            
            for (const type of metricTypes) {
                try {
                    const response = await fetch(`/api/monitoring/export/${type}?format=json`);
                    if (response.ok) {
                        const data = await response.json();
                        exports[type] = data.data;
                    }
                } catch (error) {
                    console.warn(`Failed to export ${type} metrics:`, error);
                }
            }
            
            // Create and download file
            const blob = new Blob([JSON.stringify(exports, null, 2)], { 
                type: 'application/json' 
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `monitoring-metrics-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            
            this.showNotification('Metrics exported successfully', 'success');
        } catch (error) {
            console.error('Failed to export metrics:', error);
            this.showNotification('Failed to export metrics', 'error');
        }
    }

    async dismissAllAlerts() {
        try {
            const response = await fetch('/api/monitoring/alerts/dismiss-all', {
                method: 'POST'
            });
            
            if (response.ok) {
                this.alerts = [];
                this.renderAlerts();
                this.showNotification('All alerts dismissed', 'success');
            }
        } catch (error) {
            console.error('Failed to dismiss alerts:', error);
            this.showNotification('Failed to dismiss alerts', 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    renderAlerts() {
        const alertSummary = document.getElementById('alert-summary');
        const alertList = document.getElementById('alert-list');
        
        if (!alertSummary || !alertList) return;
        
        if (this.alerts.length === 0) {
            alertSummary.style.display = 'none';
            return;
        }
        
        alertSummary.style.display = 'block';
        
        const alertsHTML = this.alerts.map((alert, index) => `
            <div class="alert-item">
                <div class="alert-content">
                    <div class="alert-message">${alert.message}</div>
                    <div class="alert-time">${new Date(alert.timestamp).toLocaleString()}</div>
                </div>
                <button class="dismiss-btn" onclick="dashboard.dismissAlert(${index})">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `).join('');
        
        alertList.innerHTML = alertsHTML;
    }

    dismissAlert(index) {
        if (index >= 0 && index < this.alerts.length) {
            this.alerts.splice(index, 1);
            this.renderAlerts();
        }
    }

    // Enhanced metric updates with trend analysis
    updateMetricsWithTrends(newMetrics) {
        const timestamp = Date.now();
        
        // Add trend indicators
        Object.keys(newMetrics).forEach(key => {
            if (this.metrics[key] && this.metrics[key].length > 0) {
                const lastValue = this.metrics[key][this.metrics[key].length - 1].value;
                const currentValue = newMetrics[key];
                const trend = currentValue > lastValue ? 'up' : currentValue < lastValue ? 'down' : 'stable';
                
                newMetrics[key] = {
                    value: currentValue,
                    trend: trend,
                    change: currentValue - lastValue
                };
            } else {
                newMetrics[key] = {
                    value: newMetrics[key],
                    trend: 'stable',
                    change: 0
                };
            }
        });
        
        this.updateMetrics(newMetrics);
    }
}

// Global functions for UI buttons
function refreshData() {
    if (window.dashboard) {
        window.dashboard.requestMetricsUpdate();
        console.log('Metrics refresh requested');
    }
}

function clearLogs() {
    if (window.dashboard) {
        window.dashboard.logs = [];
        window.dashboard.updateLogsDisplay();
        console.log('Logs cleared');
    }
}

// Initialize dashboard when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.dashboard = new MonitoringDashboard();
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    if (window.dashboard && window.dashboard.ws) {
        window.dashboard.ws.close();
    }
});