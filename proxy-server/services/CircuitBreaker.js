const logger = require('./logger');

class CircuitBreaker {
    constructor(options = {}) {
        this.failureThreshold = options.failureThreshold || 3; // Max failures before "tripping"
        this.recoveryTimeout = options.recoveryTimeout || 30000; // Time to wait before retrying (30s)
        this.stats = new Map(); // Stores health for each URL
    }

    // Check if a server is allowed to receive a request
    canRequest(url) {
        const state = this.getOrInitState(url);
        if (state.status === 'OPEN') {
            const now = Date.now();
            if (now - state.lastFailureTime > this.recoveryTimeout) {
                state.status = 'HALF_OPEN'; // Attempt a "test" request
                logger.warn(`Circuit HALF_OPEN for ${url}. Testing server health...`);
                return true;
            }
            return false; // Fuse is tripped; stop wasting resources
        }
        return true; // CLOSED (Healthy) or HALF_OPEN (Testing)
    }

    recordSuccess(url) {
        this.stats.set(url, { status: 'CLOSED', failures: 0, lastFailureTime: null });
        logger.info(`Circuit CLOSED for ${url}. Server is healthy.`);
    }

    recordFailure(url) {
        const state = this.getOrInitState(url);
        state.failures++;
        state.lastFailureTime = Date.now();

        if (state.failures >= this.failureThreshold) {
            state.status = 'OPEN';
            logger.error(`🚨 CIRCUIT TRIPPED for ${url}. Server is OFFLINE. Resources diverted.`);
        }
        this.stats.set(url, state);
    }

    getOrInitState(url) {
        return this.stats.get(url) || { status: 'CLOSED', failures: 0, lastFailureTime: null };
    }
}

module.exports = new CircuitBreaker();
