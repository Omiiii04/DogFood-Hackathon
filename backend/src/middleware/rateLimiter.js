const rateLimit = require('express-rate-limit');

/**
 * Token-bucket sliding window rate limiter implementation.
 * Combines token bucket burst control with a strict sliding window history.
 */
class TokenBucketSlidingWindowLimiter {
  constructor(options = {}) {
    this.windowMs = options.windowMs || 60 * 1000; // 1 minute
    this.maxRequests = options.maxRequests || 5; // max 5 requests per minute
    this.retryAfterSeconds = options.retryAfterSeconds || 60; // Retry-After: 60
    this.buckets = new Map();

    // Periodic sweep to prevent memory leaks from inactive IPs
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of this.buckets.entries()) {
        if (now - entry.lastSeen > this.windowMs * 2) {
          this.buckets.delete(ip);
        }
      }
    }, 2 * 60 * 1000);

    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  getClientIp(req) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ip = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : forwarded[0];
      if (ip) return ip;
    }
    return req.headers['x-real-ip'] || req.ip || req.socket?.remoteAddress || '127.0.0.1';
  }

  middleware() {
    const limiterMiddleware = (req, res, next) => {
      const ip = this.getClientIp(req);
      const now = Date.now();

      let entry = this.buckets.get(ip);
      if (!entry) {
        entry = {
          tokens: this.maxRequests,
          lastRefill: now,
          timestamps: [],
          lastSeen: now,
        };
        this.buckets.set(ip, entry);
      }

      entry.lastSeen = now;

      // 1. Refill tokens according to time passed
      const elapsed = now - entry.lastRefill;
      const tokensToAdd = (elapsed / this.windowMs) * this.maxRequests;
      entry.tokens = Math.min(this.maxRequests, entry.tokens + tokensToAdd);
      entry.lastRefill = now;

      // 2. Sliding window: purge timestamps older than windowMs
      entry.timestamps = entry.timestamps.filter((ts) => now - ts < this.windowMs);

      // 3. Evaluate limits: sliding window count or exhausted token bucket
      if (entry.timestamps.length >= this.maxRequests || entry.tokens < 1) {
        res.setHeader('Retry-After', String(this.retryAfterSeconds));
        return res.status(429).json({
          success: false,
          error: 'Too Many Requests',
          message: `Rate limit exceeded: Maximum ${this.maxRequests} votes per minute. Please try again later.`,
          statusCode: 429,
          retryAfter: this.retryAfterSeconds,
          timestamp: new Date().toISOString(),
        });
      }

      // 4. Consume token and record sliding window hit
      entry.tokens -= 1;
      entry.timestamps.push(now);

      res.setHeader('X-RateLimit-Limit', this.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, this.maxRequests - entry.timestamps.length));

      next();
    };

    limiterMiddleware.reset = () => {
      this.buckets.clear();
    };

    return limiterMiddleware;
  }

  reset() {
    this.buckets.clear();
  }
}

// Token-bucket sliding window rate limiter: max 5 vote requests per minute per IP
const voteLimiterInstance = new TokenBucketSlidingWindowLimiter({
  windowMs: 60 * 1000,
  maxRequests: 5,
  retryAfterSeconds: 60,
});

const voteRateLimiter = voteLimiterInstance.middleware();
voteRateLimiter.reset = () => voteLimiterInstance.reset();

// General API rate limiter: 100 requests per 1 minute window
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many requests from this IP, please try again after a minute.',
    statusCode: 429,
    timestamp: new Date().toISOString(),
  },
});

module.exports = {
  voteRateLimiter,
  apiRateLimiter,
  TokenBucketSlidingWindowLimiter,
};
