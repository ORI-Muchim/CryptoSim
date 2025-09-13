const PerformanceMonitor = require('../monitoring/performance-monitor');
const EventEmitter = require('events');

describe('PerformanceMonitor', () => {
  let monitor;
  
  beforeEach(() => {
    monitor = new PerformanceMonitor({
      collectInterval: 100, // Fast interval for testing
      historySize: 10,
      enabled: false // Don't start automatically
    });
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  describe('Initialization', () => {
    it('should create monitor with default options', () => {
      const defaultMonitor = new PerformanceMonitor({ enabled: false });
      
      expect(defaultMonitor.options.collectInterval).toBe(5000);
      expect(defaultMonitor.options.historySize).toBe(1440);
      expect(defaultMonitor.options.enabled).toBe(false);
    });

    it('should inherit from EventEmitter', () => {
      expect(monitor instanceof EventEmitter).toBe(true);
    });

    it('should initialize metrics storage', () => {
      expect(monitor.metrics).toBeDefined();
      expect(monitor.metrics.system).toEqual([]);
      expect(monitor.metrics.application).toEqual([]);
      expect(monitor.counters).toBeDefined();
    });
  });

  describe('Metric Collection', () => {
    it('should collect system metrics', async () => {
      await monitor.collectSystemMetrics();
      
      expect(monitor.metrics.system).toHaveLength(1);
      const metric = monitor.metrics.system[0];
      
      expect(metric).toHaveProperty('timestamp');
      expect(metric).toHaveProperty('cpu');
      expect(metric).toHaveProperty('memory');
      expect(metric.cpu).toHaveProperty('usage');
      expect(metric.memory).toHaveProperty('total');
    });

    it('should collect application metrics', () => {
      monitor.collectApplicationMetrics();
      
      expect(monitor.metrics.application).toHaveLength(1);
      const metric = monitor.metrics.application[0];
      
      expect(metric).toHaveProperty('timestamp');
      expect(metric).toHaveProperty('process');
      expect(metric).toHaveProperty('requests');
    });

    it('should limit history size', () => {
      // Add more metrics than historySize
      for (let i = 0; i < 15; i++) {
        monitor.addMetric('system', { timestamp: Date.now(), test: i });
      }
      
      expect(monitor.metrics.system.length).toBeLessThanOrEqual(monitor.options.historySize);
    });
  });

  describe('Request Tracking', () => {
    it('should record API requests', () => {
      monitor.recordRequest(100, true);  // 100ms, success
      monitor.recordRequest(200, false); // 200ms, error
      
      expect(monitor.counters.requests.total).toBe(2);
      expect(monitor.counters.requests.success).toBe(1);
      expect(monitor.counters.requests.error).toBe(1);
      expect(monitor.counters.requests.responseTimeSum).toBe(300);
    });

    it('should calculate average response time', () => {
      monitor.recordRequest(100, true);
      monitor.recordRequest(200, true);
      
      const metrics = monitor.calculateRequestMetrics();
      expect(metrics.averageResponseTime).toBe(150);
      expect(metrics.successRate).toBe(100);
    });

    it('should calculate success rate', () => {
      monitor.recordRequest(100, true);
      monitor.recordRequest(200, false);
      
      const metrics = monitor.calculateRequestMetrics();
      expect(metrics.successRate).toBe(50);
    });
  });

  describe('WebSocket Tracking', () => {
    it('should record WebSocket events', () => {
      monitor.recordWebSocketEvent('connection', { count: 5 });
      monitor.recordWebSocketEvent('message');
      monitor.recordWebSocketEvent('error');
      
      expect(monitor.counters.websocket.connections).toBe(5);
      expect(monitor.counters.websocket.messages).toBe(1);
      expect(monitor.counters.websocket.errors).toBe(1);
    });
  });

  describe('Status and Export', () => {
    it('should return current status', () => {
      monitor.recordRequest(100, true);
      
      const status = monitor.getStatus();
      
      expect(status).toHaveProperty('timestamp');
      expect(status).toHaveProperty('uptime');
      expect(status).toHaveProperty('system');
      expect(status).toHaveProperty('requests');
      expect(status).toHaveProperty('websocket');
    });

    it('should export metrics in JSON format', () => {
      monitor.addMetric('system', { test: 'data' });
      
      const exported = monitor.exportMetrics('system', 'json');
      const parsed = JSON.parse(exported);
      
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0]).toHaveProperty('test', 'data');
    });

    it('should export metrics in CSV format', () => {
      monitor.addMetric('system', { 
        timestamp: 1000, 
        cpu: { usage: 50 }, 
        memory: { usage: 60 } 
      });
      
      const csv = monitor.exportMetrics('system', 'csv');
      
      expect(csv).toContain('timestamp,cpu_usage,memory_usage');
      expect(csv).toContain('1000,50,60');
    });
  });

  describe('Counter Management', () => {
    it('should reset counters', () => {
      monitor.recordRequest(100, true);
      monitor.recordWebSocketEvent('message');
      
      expect(monitor.counters.requests.total).toBe(1);
      expect(monitor.counters.websocket.messages).toBe(1);
      
      monitor.resetCounters();
      
      expect(monitor.counters.requests.total).toBe(0);
      expect(monitor.counters.websocket.messages).toBe(0);
    });
  });

  describe('Lifecycle', () => {
    it('should start and stop monitoring', (done) => {
      const testMonitor = new PerformanceMonitor({
        collectInterval: 50,
        enabled: false
      });
      
      testMonitor.start();
      
      setTimeout(() => {
        expect(testMonitor.metrics.system.length).toBeGreaterThan(0);
        testMonitor.stop();
        done();
      }, 100);
    });

    it('should emit metric events', (done) => {
      monitor.on('metric', (metric) => {
        expect(metric).toHaveProperty('type');
        expect(metric).toHaveProperty('data');
        done();
      });
      
      monitor.collectApplicationMetrics();
    });
  });

  describe('Error Handling', () => {
    it('should handle disk usage calculation errors gracefully', async () => {
      // Mock fs.promises.stat to throw error
      const originalStat = require('fs').promises.stat;
      require('fs').promises.stat = jest.fn().mockRejectedValue(new Error('Access denied'));
      
      await expect(monitor.collectSystemMetrics()).resolves.not.toThrow();
      
      // Restore original function
      require('fs').promises.stat = originalStat;
    });

    it('should handle CPU usage calculation errors gracefully', async () => {
      await expect(monitor.collectSystemMetrics()).resolves.not.toThrow();
    });
  });
});