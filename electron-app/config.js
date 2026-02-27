// electron-app/config.js
// Configuration for SportsData Pro Desktop

module.exports = {
  // MongoDB Connection (hardcoded - shared by all users)
  mongodb: {
    uri: process.env.MONGODB_URI || 'mongodb+srv://jalalbuilds_db_user:ETqJ5LcP9rALQAJT@matas-cluster.hnzyfsu.mongodb.net/sports-data?retryWrites=true&w=majority&appName=matas-cluster'
  },

  // Oracle Database Connection (pre-filled, users only enter username/password)
  oracle: {
    connectString: process.env.ORACLE_CONNECT_STRING || 'exadata2-cluster.stats.com:1521/bladerac_usr.stats.com'
    // Username and password provided by user at login
  },

  // Stats API Configuration (internal VPN-required API - no key needed)
  statsApi: {
    baseUrl: process.env.STATS_API_URL || 'https://prod.origin.api.stats.com'
    // No API key required - works when user is on VPN
  },

  // Express Server Configuration
  server: {
    port: parseInt(process.env.PORT || '5000'),
    host: 'localhost'
  },

  // Application Settings
  app: {
    name: 'SportsData Pro Desktop',
    version: '1.0.0',
    autoUpdateEnabled: false, // Disabled - enable later with GitHub token
    // Development mode flag
    isDev: process.env.NODE_ENV === 'development'
  }
};
