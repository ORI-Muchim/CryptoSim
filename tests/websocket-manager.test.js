const WebSocketManager = require('../utils/websocket-manager');
const WebSocket = require('ws');

// Mock WebSocket
jest.mock('ws');

describe('WebSocketManager', () => {
  let wsManager;
  let mockWs;
  
  beforeEach(() => {
    // Create mock WebSocket instance
    mockWs = {
      readyState: WebSocket.OPEN,
      send: jest.fn(),
      close: jest.fn(),
      on: jest.fn(),
      addEventListener: jest.fn()
    };
    
    // Mock WebSocket constructor
    WebSocket.mockImplementation(() => mockWs);
    WebSocket.OPEN = 1;
    WebSocket.CLOSED = 3;
    
    wsManager = new WebSocketManager('ws://localhost:8080', {
      maxReconnectAttempts: 3,
      reconnectDelay: 100
    });
  });
  
  afterEach(() => {
    if (wsManager) {
      wsManager.close();
    }
    jest.clearAllMocks();
    jest.clearAllTimers();
  });
  
  describe('Constructor', () => {
    it('should initialize with default options', () => {
      const manager = new WebSocketManager('ws://test.com');
      
      expect(manager.url).toBe('ws://test.com');
      expect(manager.maxReconnectAttempts).toBe(10);
      expect(manager.reconnectDelay).toBe(1000);
    });
    
    it('should initialize with custom options', () => {
      const options = {
        maxReconnectAttempts: 5,
        reconnectDelay: 2000,
        maxReconnectDelay: 60000
      };
      
      const manager = new WebSocketManager('ws://test.com', options);
      
      expect(manager.maxReconnectAttempts).toBe(5);
      expect(manager.reconnectDelay).toBe(2000);
      expect(manager.maxReconnectDelay).toBe(60000);
    });
  });
  
  describe('connect', () => {
    it('should create WebSocket connection', () => {
      wsManager.connect();
      
      expect(WebSocket).toHaveBeenCalledWith('ws://localhost:8080');
      expect(mockWs.on).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockWs.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
    
    it('should not create new connection if already connected', () => {
      wsManager.ws = mockWs;
      wsManager.connect();
      
      expect(WebSocket).not.toHaveBeenCalled();
    });
    
    it('should set up ping/pong mechanism', () => {
      jest.useFakeTimers();
      
      wsManager.connect();
      
      // Fast-forward time to trigger ping
      jest.advanceTimersByTime(25000);
      
      expect(mockWs.send).toHaveBeenCalledWith('ping');
      
      jest.useRealTimers();
    });
  });
  
  describe('send', () => {
    beforeEach(() => {
      wsManager.ws = mockWs;
    });
    
    it('should send string message', () => {
      const result = wsManager.send('test message');
      
      expect(mockWs.send).toHaveBeenCalledWith('test message');
      expect(result).toBe(true);
    });
    
    it('should send JSON object', () => {
      const data = { type: 'test', message: 'hello' };
      const result = wsManager.send(data);
      
      expect(mockWs.send).toHaveBeenCalledWith(JSON.stringify(data));
      expect(result).toBe(true);
    });
    
    it('should return false if not connected', () => {
      mockWs.readyState = WebSocket.CLOSED;
      
      const result = wsManager.send('test');
      
      expect(result).toBe(false);
      expect(mockWs.send).not.toHaveBeenCalled();
    });
    
    it('should handle send errors', () => {
      mockWs.send.mockImplementation(() => {
        throw new Error('Send error');
      });
      
      const result = wsManager.send('test');
      
      expect(result).toBe(false);
    });
  });
  
  describe('Event Handling', () => {
    it('should register and call event handlers', () => {
      const openHandler = jest.fn();
      const messageHandler = jest.fn();
      
      wsManager.on('open', openHandler);
      wsManager.on('message', messageHandler);
      
      wsManager.connect();
      
      // Simulate WebSocket events
      const onOpenCall = mockWs.on.mock.calls.find(call => call[0] === 'open');
      const onMessageCall = mockWs.on.mock.calls.find(call => call[0] === 'message');
      
      onOpenCall[1](); // Trigger open event
      onMessageCall[1]('test message'); // Trigger message event
      
      expect(openHandler).toHaveBeenCalled();
      expect(messageHandler).toHaveBeenCalledWith('test message');
    });
    
    it('should ignore pong messages', () => {
      const messageHandler = jest.fn();
      wsManager.on('message', messageHandler);
      
      wsManager.connect();
      
      const onMessageCall = mockWs.on.mock.calls.find(call => call[0] === 'message');
      onMessageCall[1]('pong'); // Send pong message
      
      expect(messageHandler).not.toHaveBeenCalled();
    });
  });
  
  describe('Reconnection Logic', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });
    
    afterEach(() => {
      jest.useRealTimers();
    });
    
    it('should attempt reconnection on close', () => {
      wsManager.connect();
      
      // Simulate connection close
      const onCloseCall = mockWs.on.mock.calls.find(call => call[0] === 'close');
      onCloseCall[1](1000, 'Normal closure');
      
      // Fast-forward time to trigger reconnection
      jest.advanceTimersByTime(100);
      
      expect(WebSocket).toHaveBeenCalledTimes(2); // Initial + reconnect
    });
    
    it('should use exponential backoff for reconnection delay', () => {
      wsManager.reconnectAttempts = 2;
      
      const delay = wsManager.reconnectDelay * Math.pow(wsManager.reconnectDecay, 1);
      
      wsManager.scheduleReconnect();
      
      jest.advanceTimersByTime(delay - 1);
      expect(WebSocket).toHaveBeenCalledTimes(0);
      
      jest.advanceTimersByTime(1);
      expect(WebSocket).toHaveBeenCalledTimes(1);
    });
    
    it('should stop reconnecting after max attempts', () => {
      const maxReconnectHandler = jest.fn();
      wsManager.on('maxReconnectAttemptsReached', maxReconnectHandler);
      
      wsManager.reconnectAttempts = 3; // At max
      wsManager.scheduleReconnect();
      
      expect(maxReconnectHandler).toHaveBeenCalled();
      expect(WebSocket).not.toHaveBeenCalled();
    });
    
    it('should not reconnect if intentionally closed', () => {
      wsManager.connect();
      wsManager.close(); // Intentional close
      
      // Simulate close event
      const onCloseCall = mockWs.on.mock.calls.find(call => call[0] === 'close');
      onCloseCall[1](1000, 'Normal closure');
      
      jest.advanceTimersByTime(1000);
      
      expect(WebSocket).toHaveBeenCalledTimes(1); // Only initial connection
    });
  });
  
  describe('State Management', () => {
    it('should report correct connection state', () => {
      expect(wsManager.getState()).toBe(WebSocket.CLOSED);
      
      wsManager.ws = mockWs;
      expect(wsManager.getState()).toBe(WebSocket.OPEN);
    });
    
    it('should report connection status', () => {
      // Initially no connection
      expect(wsManager.isConnected()).toBe(false);
      
      // With mock WebSocket
      wsManager.ws = mockWs;
      expect(wsManager.isConnected()).toBe(true);
      
      // When closed
      mockWs.readyState = WebSocket.CLOSED;
      expect(wsManager.isConnected()).toBe(false);
    });
    
    it('should reset reconnect attempts on successful connection', () => {
      wsManager.reconnectAttempts = 5;
      wsManager.connect();
      
      // Simulate successful connection
      const onOpenCall = mockWs.on.mock.calls.find(call => call[0] === 'open');
      onOpenCall[1]();
      
      expect(wsManager.reconnectAttempts).toBe(0);
    });
  });
  
  describe('cleanup', () => {
    it('should close connection and clear intervals', () => {
      jest.useFakeTimers();
      
      wsManager.connect();
      wsManager.close();
      
      expect(wsManager.isIntentionallyClosed).toBe(true);
      expect(mockWs.close).toHaveBeenCalled();
      expect(wsManager.pingInterval).toBeNull();
      
      jest.useRealTimers();
    });
    
    it('should remove event handlers', () => {
      const handler = jest.fn();
      
      wsManager.on('test', handler);
      expect(wsManager.eventHandlers.test).toBe(handler);
      
      wsManager.off('test');
      expect(wsManager.eventHandlers.test).toBeUndefined();
    });
  });
});