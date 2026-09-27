const errorHandler = (err, req, res, next) => {
  if (err.message && err.message.includes('CORS origin')) {
    return res.status(403).json({
      success: false,
      error: err.message,
      statusCode: 403,
      timestamp: new Date().toISOString(),
    });
  }

  console.error('[Application Error]:', err);

  const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : err.statusCode || 500;

  res.status(statusCode).json({
    success: false,
    error: err.message || 'Internal Server Error',
    statusCode: statusCode,
    timestamp: new Date().toISOString(),
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

const notFoundHandler = (req, res, next) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
    statusCode: 404,
    timestamp: new Date().toISOString(),
  });
};

module.exports = {
  errorHandler,
  notFoundHandler,
};
