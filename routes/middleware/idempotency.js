/**
 * Idempotency Middleware
 * ─────────────────────────────────────────────────────────────────────────────
 * Prevents duplicate write operations (e.g. double-click, network retry).
 *
 * Usage:
 *   const idempotency = require('../middleware/idempotency');
 *   router.post('/some/endpoint', idempotency(), async (req, res) => { ... });
 *
 * Client must send header:  X-Idempotency-Key: <uuid>
 * Or in body:               { idempotency_key: '<uuid>' }
 *
 * First request  → processes normally, caches response for TTL duration.
 * Repeat request → returns cached response (status 200) with header
 *                  X-Idempotent-Replayed: true
 */

const store = new Map(); // key → { status, body, expireAt }

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Cleanup expired entries every 2 minutes
setInterval(() => {
    const now = Date.now();
    for (const [key, val] of store) {
        if (val.expireAt <= now) store.delete(key);
    }
}, 2 * 60 * 1000);

/**
 * @param {number} ttlMs - Time-to-live in milliseconds (default 5 min)
 */
function idempotency(ttlMs = DEFAULT_TTL_MS) {
    return (req, res, next) => {
        // Extract key from header or body
        const key =
            req.headers['x-idempotency-key'] ||
            req.body?.idempotency_key ||
            null;

        if (!key) {
            // No key provided — pass through (no idempotency protection)
            return next();
        }

        const cached = store.get(key);

        if (cached && cached.expireAt > Date.now()) {
            // ✅ Duplicate — return cached response
            res.setHeader('X-Idempotent-Replayed', 'true');
            return res.status(cached.status).json(cached.body);
        }

        // Not seen before — intercept res.json to cache the response
        const originalJson = res.json.bind(res);
        res.json = (body) => {
            store.set(key, {
                status: res.statusCode || 200,
                body,
                expireAt: Date.now() + ttlMs
            });
            return originalJson(body);
        };

        next();
    };
}

module.exports = idempotency;
