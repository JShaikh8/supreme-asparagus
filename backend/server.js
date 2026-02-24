// backend/server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

// Structured logging
const logger = require('./utils/logger');

// Process-level error handlers - catch unhandled errors before they crash the server
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason: reason instanceof Error ? reason.message : reason,
    stack: reason instanceof Error ? reason.stack : undefined
  });
  // Don't exit in development, but exit in production to trigger restart
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    message: error.message,
    stack: error.stack
  });
  // Always exit on uncaught exceptions - state may be corrupted
  process.exit(1);
});

// Graceful shutdown handler
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  mongoose.connection.close(false).then(() => {
    logger.info('MongoDB connection closed');
    process.exit(0);
  });
});

// Environment validation - runs before anything else
const { validateAndStart } = require('./utils/envValidation');
validateAndStart();

const app = express();

// CORS origins from environment variable (comma-separated) or defaults
const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'https://supreme-broccoli-frontend.onrender.com'];

// Middleware - CORS BEFORE helmet!
app.use(cors({
  origin: corsOrigins,
  credentials: true
}));

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

app.use(express.json());

// Request logging middleware
app.use(logger.requestLogger);

// Pretty-print JSON responses for better readability
app.set('json spaces', 2);

// Import routes
const teamRoutes = require('./routes/teams');
const fetchRoutes = require('./routes/fetch');
const autoPopulateRoutes = require('./routes/autoPopulate');
const dataRoutes = require('./routes/data');
const bulkFetchRoutes = require('./routes/bulk-fetch');
const mappingRoutes = require('./routes/mappings');
const dataManagementRoutes = require('./routes/dataManagement');
const nbaRoutes = require('./routes/nba');
const publicApiRoutes = require('./routes/publicApi');
const comparisonRoutes = require('./routes/comparison');
const bulkComparisonRoutes = require('./routes/bulkComparison');
const systemRoutes = require('./routes/system');
const settingsRoutes = require('./routes/settings');
const searchRoutes = require('./routes/search');

// Check if internal features are enabled (Oracle/Stats API access)
const enableInternalFeatures = process.env.ENABLE_INTERNAL_FEATURES === 'true';

if (enableInternalFeatures) {
  logger.security('Internal features ENABLED (Oracle/Stats API access)');
} else {
  logger.info('Internal features DISABLED (Baseline comparisons only)');
}

// Basic test route
app.get('/', (req, res) => {
  res.json({ message: 'Sports Data Platform API is running!' });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date()
  });
});

// API Routes - Public (always available)
app.use('/api/v1', publicApiRoutes); // Public REST API with export support
app.use('/api/teams', teamRoutes);
app.use('/api/fetch', fetchRoutes);
app.use('/api/auto-populate', autoPopulateRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/bulk-fetch', bulkFetchRoutes);
app.use('/api/mappings', mappingRoutes);
app.use('/api/data-management', dataManagementRoutes);
app.use('/api/nba', nbaRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/search', searchRoutes);

// Comparison routes (always loaded, but source-gated internally)
// - Baseline comparisons: Always allowed
// - Oracle/API comparisons: Only when ENABLE_INTERNAL_FEATURES=true
app.use('/api/comparison', comparisonRoutes);
app.use('/api/bulk-comparison', bulkComparisonRoutes);

// System routes (health, stats, dashboard - always available)
app.use('/api/system', systemRoutes);

// Uploads directory creation (use absolute path)
const fs = require('fs');
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// MongoDB connection and server startup
const PORT = process.env.PORT || 5000;

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    logger.db('MongoDB connected');

    // Ensure database indexes are optimized
    const { ensureIndexes } = require('./utils/dbIndexes');
    const indexResult = await ensureIndexes();
    if (indexResult.success && indexResult.results.created.length > 0) {
      logger.info(`Created ${indexResult.results.created.length} new indexes`);
    }

    // Start NBA monitoring service after DB connection
    const nbaMonitoringService = require('./services/nbaMonitoringService');
    nbaMonitoringService.start()
      .then(() => logger.info('NBA Monitoring Service started', { service: 'nba-monitoring' }))
      .catch(err => logger.logError(err, { context: 'NBA monitoring startup' }));

    // Start server only after successful DB connection
    app.listen(PORT, () => {
      logger.startupBanner(PORT, {
        corsOrigins,
        internalFeatures: enableInternalFeatures
      });
    });
  })
  .catch(err => {
    logger.logError(err, { context: 'MongoDB connection' });
    logger.error('Failed to connect to MongoDB. Server will not start.');
    process.exit(1);
  });

// 404 handler for unmatched routes
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Global error handler middleware - must be last
app.use((err, req, res, next) => {
  // Log error with structured logging
  logger.logError(err, {
    path: req.path,
    method: req.method,
    body: req.body
  });

  // Determine status code
  const statusCode = err.status || err.statusCode || 500;

  // Send error response
  res.status(statusCode).json({
    success: false,
    error: statusCode === 500 ? 'Internal Server Error' : err.message,
    // Only include details in development
    ...(process.env.NODE_ENV === 'development' && {
      message: err.message,
      stack: err.stack
    })
  });
});