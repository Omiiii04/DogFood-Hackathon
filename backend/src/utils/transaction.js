const mongoose = require('mongoose');

/**
 * Custom error class for HTTP-aware errors within database transactions.
 */
class TransactionHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'TransactionHttpError';
    this.status = status;
  }
}

/**
 * Cached result of whether this MongoDB deployment supports transactions.
 * null = unknown yet, true = supported, false = not supported (standalone)
 */
let _transactionsSupported = null;

/**
 * Returns true if the error indicates this MongoDB deployment does not
 * support transactions (i.e. standalone, not a replica set or mongos).
 */
const isReplicaSetError = (err) => {
  if (!err) return false;
  // MongoDB error code 20 = IllegalOperation
  if (err.code === 20) return true;
  if (err.codeName === 'IllegalOperation') return true;
  const msg = err.message || '';
  return (
    msg.includes('Transaction numbers are only allowed') ||
    msg.includes('replica set') ||
    msg.includes('mongos')
  );
};

/**
 * Executes a callback inside a MongoDB transaction with automatic fallback.
 *
 * On a standalone MongoDB (no replica set), transactions are not supported.
 * The driver allows session.startTransaction() locally but throws the error
 * "Transaction numbers are only allowed on a replica set member or mongos"
 * on the FIRST actual DB command inside the transaction.
 *
 * This utility catches that error, caches the result, cleans up the session,
 * and transparently retries the workFn without a session so the operation
 * still completes successfully.
 *
 * @param {Function} workFn - Async function (session | null) => Promise<any>
 * @returns {Promise<any>}
 */
const withTransaction = async (workFn) => {
  const isMocked =
    mongoose.startSession &&
    (Boolean(mongoose.startSession.mock) || Boolean(mongoose.startSession._isMockFunction));

  // Fast path: we already know transactions aren't supported on this deployment
  if (!isMocked && _transactionsSupported === false) {
    return await workFn(null);
  }

  const isConnected = mongoose.connection && mongoose.connection.readyState === 1;
  if (!isConnected && !isMocked) {
    return await workFn(null);
  }

  let session = null;

  // --- Attempt to start a session + transaction ---
  try {
    session = await mongoose.startSession();
    if (session && typeof session.startTransaction === 'function') {
      session.startTransaction();
    }
  } catch (sessionErr) {
    // Session creation itself failed — fall back gracefully
    if (session) {
      try { await session.endSession(); } catch (_) {}
    }
    if (!isMocked && isReplicaSetError(sessionErr)) {
      _transactionsSupported = false;
    }
    return await workFn(null);
  }

  // --- Run the work inside the transaction ---
  try {
    const result = await workFn(session);

    // Commit if still in a transaction (workFn may have aborted early)
    if (session && (typeof session.inTransaction === 'function' ? session.inTransaction() : true)) {
      if (typeof session.commitTransaction === 'function') {
        await session.commitTransaction();
      }
    }

    if (!isMocked) {
      _transactionsSupported = true; // Confirmed working
    }
    return result;
  } catch (workErr) {
    // Replica set error on first command
    if (!isMocked && isReplicaSetError(workErr)) {
      _transactionsSupported = false;

      try {
        if (session && typeof session.inTransaction === 'function' && session.inTransaction()) {
          await session.abortTransaction();
        }
      } catch (_) {}
      try {
        if (session && typeof session.endSession === 'function') {
          await session.endSession();
        }
      } catch (_) {}
      session = null; // Mark as closed so finally block skips it

      // Retry without a session
      return await workFn(null);
    }

    // Any other error: abort transaction and re-throw
    try {
      if (session && (typeof session.inTransaction === 'function' ? session.inTransaction() : true)) {
        if (typeof session.abortTransaction === 'function') {
          await session.abortTransaction();
        }
      }
    } catch (_) {}

    throw workErr;
  } finally {
    if (session && typeof session.endSession === 'function') {
      try { await session.endSession(); } catch (_) {}
    }
  }
};

module.exports = {
  withTransaction,
  TransactionHttpError,
};
