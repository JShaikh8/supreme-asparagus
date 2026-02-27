// electron-app/server.js
// Express server running inside Electron

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

// Environment variables are loaded by main.js before this module is required
const config = require('./config');

// IMPORTANT: Set mongoose options BEFORE any models are loaded
mongoose.set('bufferCommands', false);
mongoose.set('bufferTimeoutMS', 30000);

const app = express();

// Middleware
app.use(helmet({
  contentSecurityPolicy: false // Disable for Electron
}));
app.use(cors());
app.use(express.json());

// Pretty-print JSON responses for better readability
app.set('json spaces', 2);

// Basic test route
app.get('/', (req, res) => {
  res.json({
    message: 'SportsData Pro Desktop API is running!',
    version: config.app.version
  });
});

// Health check route
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    oracle: process.env.ORACLE_USER ? 'Configured' : 'Not Configured',
    timestamp: new Date()
  });
});

// Uploads directory creation
// Use userData path for packaged apps (can't write inside asar)
const fs = require('fs');
const uploadsDir = process.env.USER_DATA_PATH
  ? path.join(process.env.USER_DATA_PATH, 'uploads')
  : path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)){
    fs.mkdirSync(uploadsDir, { recursive: true });
}
console.log(`📁 Uploads directory: ${uploadsDir}`);

// Connect to MongoDB and start server
async function startServer() {
  try {
    // Connect to MongoDB FIRST
    await mongoose.connect(config.mongodb.uri, {
      serverSelectionTimeoutMS: 30000,
      socketTimeoutMS: 45000,
    });

    console.log('✅ MongoDB connected successfully');
    console.log(`📊 Connected to database: ${mongoose.connection.name}`);

    // Handle MongoDB connection events
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err.message);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });

    // NOW load routes AFTER MongoDB is connected
    // This ensures models are created with an active connection
    console.log('📡 Loading API routes...');

    // Backend folder is copied into electron-app during prebuild
    // So it's always at ./backend relative to server.js
    const teamRoutes = require('./backend/routes/teams');
    const fetchRoutes = require('./backend/routes/fetch');
    const autoPopulateRoutes = require('./backend/routes/autoPopulate');
    const dataRoutes = require('./backend/routes/data');
    const bulkFetchRoutes = require('./backend/routes/bulk-fetch');
    const comparisonRoutes = require('./backend/routes/comparison');
    const bulkComparisonRoutes = require('./backend/routes/bulkComparison');
    const mappingRoutes = require('./backend/routes/mappings');
    const systemRoutes = require('./backend/routes/system');
    const dataManagementRoutes = require('./backend/routes/dataManagement');
    const nbaRoutes = require('./backend/routes/nba');
    const publicApiRoutes = require('./backend/routes/publicApi');

    // Register API routes
    app.use('/api/v1', publicApiRoutes); // Public REST API with export support
    app.use('/api/teams', teamRoutes);
    app.use('/api/fetch', fetchRoutes);
    app.use('/api/auto-populate', autoPopulateRoutes);
    app.use('/api/data', dataRoutes);
    app.use('/api/bulk-fetch', bulkFetchRoutes);
    app.use('/api/comparison', comparisonRoutes);
    app.use('/api/bulk-comparison', bulkComparisonRoutes);
    app.use('/api/mappings', mappingRoutes);
    app.use('/api/system', systemRoutes);
    app.use('/api/data-management', dataManagementRoutes);
    app.use('/api/nba', nbaRoutes);
    console.log('✅ API routes loaded');

    // Start server AFTER MongoDB is connected AND routes are loaded
    const server = app.listen(config.server.port, config.server.host, () => {
      console.log(`🚀 Express server running on http://${config.server.host}:${config.server.port}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${config.server.port} is already in use`);
        // DON'T call process.exit in Electron - throw error instead
        throw new Error(`Port ${config.server.port} is already in use. Please close other instances of the app.`);
      } else {
        console.error('❌ Server error:', error);
        throw error;
      }
    });

    // Export server instance for cleanup
    module.exports = server;

  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    console.error('Connection string:', config.mongodb.uri.replace(/:[^:@]+@/, ':****@')); // Hide password
    console.error('Make sure:');
    console.error('1. Your IP is whitelisted on MongoDB Atlas (0.0.0.0/0)');
    console.error('2. Your connection string is correct');
    console.error('3. You have internet connection');
    // DON'T call process.exit in Electron - throw error instead so main.js can catch it
    throw new Error(`MongoDB connection failed: ${err.message}`);
  }
}

// Start the server
startServer();
