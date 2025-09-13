const WebSocket = require('ws');
const logger = require('./logger');

class WebSocketManager {
    constructor(url, options = {}) {
        this.url = url;
        this.options = options;
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = options.maxReconnectAttempts || 10;
        this.reconnectDelay = options.reconnectDelay || 1000;
        this.maxReconnectDelay = options.maxReconnectDelay || 30000;
        this.reconnectDecay = options.reconnectDecay || 1.5;
        this.isIntentionallyClosed = false;
        this.eventHandlers = {};
        this.pingInterval = null;
        this.pingTimeout = options.pingTimeout || 25000;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            logger.warn('WebSocket already connected');
            return;
        }

        this.isIntentionallyClosed = false;
        
        try {
            this.ws = new WebSocket(this.url);
            this.setupEventHandlers();
            this.setupPingPong();
        } catch (error) {
            logger.error('WebSocket connection error:', error);
            this.scheduleReconnect();
        }
    }

    setupEventHandlers() {
        this.ws.on('open', () => {
            logger.info(`WebSocket connected to ${this.url}`);
            this.reconnectAttempts = 0;
            
            if (this.eventHandlers.open) {
                this.eventHandlers.open();
            }
        });

        this.ws.on('message', (data) => {
            // Handle ping/pong
            if (data.toString() === 'pong') {
                return;
            }
            
            if (this.eventHandlers.message) {
                this.eventHandlers.message(data);
            }
        });

        this.ws.on('error', (error) => {
            logger.error('WebSocket error:', error);
            
            if (this.eventHandlers.error) {
                this.eventHandlers.error(error);
            }
        });

        this.ws.on('close', (code, reason) => {
            logger.info(`WebSocket closed. Code: ${code}, Reason: ${reason}`);
            this.clearPingPong();
            
            if (this.eventHandlers.close) {
                this.eventHandlers.close(code, reason);
            }
            
            if (!this.isIntentionallyClosed) {
                this.scheduleReconnect();
            }
        });
    }

    setupPingPong() {
        // Clear existing interval if any
        this.clearPingPong();
        
        // Setup ping interval
        this.pingInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('ping');
            }
        }, this.pingTimeout);
    }

    clearPingPong() {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }
    }

    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error(`Max reconnection attempts (${this.maxReconnectAttempts}) reached`);
            
            if (this.eventHandlers.maxReconnectAttemptsReached) {
                this.eventHandlers.maxReconnectAttemptsReached();
            }
            return;
        }

        this.reconnectAttempts++;
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
            this.reconnectDelay * Math.pow(this.reconnectDecay, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );
        
        logger.info(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
        
        setTimeout(() => {
            logger.info(`Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            this.connect();
        }, delay);
    }

    send(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            logger.error('WebSocket is not connected');
            return false;
        }

        try {
            if (typeof data === 'object') {
                this.ws.send(JSON.stringify(data));
            } else {
                this.ws.send(data);
            }
            return true;
        } catch (error) {
            logger.error('Error sending WebSocket message:', error);
            return false;
        }
    }

    close() {
        this.isIntentionallyClosed = true;
        this.clearPingPong();
        
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    on(event, handler) {
        this.eventHandlers[event] = handler;
    }

    off(event) {
        delete this.eventHandlers[event];
    }

    getState() {
        if (!this.ws) {
            return WebSocket.CLOSED;
        }
        return this.ws.readyState;
    }

    isConnected() {
        return this.ws && this.ws.readyState === WebSocket.OPEN;
    }

    resetReconnectAttempts() {
        this.reconnectAttempts = 0;
    }
}

module.exports = WebSocketManager;