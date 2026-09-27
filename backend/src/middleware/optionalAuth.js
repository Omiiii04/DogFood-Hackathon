const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Optional authentication middleware:
 * If a valid JWT token is present in Cookie or Authorization Bearer header,
 * populates req.user. If no token or invalid, quietly proceeds with req.user = null.
 */
module.exports = async (req, res, next) => {
  let token = null;

  if (req.cookies && req.cookies.jwt) {
    token = req.cookies.jwt;
  } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const secret = process.env.JWT_SECRET || 'raptors-offline-cryptographic-master-key-2026';
    const decoded = jwt.verify(token, secret);
    const user = await User.findById(decoded.userId).select('-passwordHash');
    if (user) {
      req.user = user;
    } else {
      req.user = null;
    }
  } catch (err) {
    // Silently continue without authenticated user on token errors
    req.user = null;
  }

  next();
};
