// backend/routes/system.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const logger = require('../utils/logger');

// Get system statistics
router.get('/stats', async (req, res) => {
    try {
      const db = mongoose.connection.db;
      
      if (!db) {
        return res.status(503).json({ error: 'Database not connected' });
      }
      
      // Get all collections
      const collections = await db.listCollections().toArray();
      const collectionNames = collections.map(c => c.name);
      
      // Get detailed stats for each collection using different approach
      const collectionStats = await Promise.all(
        collectionNames.map(async (name) => {
          try {
            const collection = db.collection(name);
            const count = await collection.countDocuments();
            
            // Get a sample document to estimate average size
            let avgSize = 0;
            let totalSize = 0;
            
            if (count > 0) {
              // Get sample documents to estimate size
              const sample = await collection.find({}).limit(10).toArray();
              if (sample.length > 0) {
                const sampleSize = sample.reduce((acc, doc) => {
                  return acc + JSON.stringify(doc).length;
                }, 0);
                avgSize = Math.round(sampleSize / sample.length);
                totalSize = avgSize * count;
              }
            }
            
            // Try to get collection stats (might fail on some MongoDB versions)
            let stats = null;
            try {
              stats = await collection.stats();
            } catch (statsError) {
              logger.debug(`Could not get stats for ${name}, using estimates`);
            }
            
            return {
              name,
              count: count,
              size: stats?.size || totalSize,
              avgObjSize: stats?.avgObjSize || avgSize,
              storageSize: stats?.storageSize || totalSize,
              indexes: stats?.nindexes || 1
            };
          } catch (err) {
            logger.error(`Error getting stats for collection ${name}:`, err);
            return {
              name,
              count: 0,
              size: 0,
              avgObjSize: 0,
              storageSize: 0,
              indexes: 0
            };
          }
        })
      );
      
      // Calculate totals
      const totalSize = collectionStats.reduce((acc, col) => acc + col.size, 0);
      const totalDocs = collectionStats.reduce((acc, col) => acc + col.count, 0);
      const totalStorageSize = collectionStats.reduce((acc, col) => acc + col.storageSize, 0);
      
      // Try to get database stats
      let dbStats = null;
      try {
        dbStats = await db.stats();
      } catch (error) {
        logger.debug('Could not get database stats, using collection totals');
      }
      
      res.json({
        database: {
          name: db.databaseName,
          sizeOnDisk: dbStats?.dataSize || totalSize,
          storageSize: dbStats?.storageSize || totalStorageSize,
          collections: collectionNames.length,
          documents: totalDocs,
          avgObjSize: totalDocs > 0 ? Math.round(totalSize / totalDocs) : 0,
          indexes: dbStats?.indexes || collectionNames.length
        },
        collections: collectionStats,
        summary: {
          totalCollections: collectionNames.length,
          totalDocuments: totalDocs,
          totalDataSize: totalSize,
          totalStorageSize: totalStorageSize,
          formattedSize: formatBytes(totalSize),
          formattedStorageSize: formatBytes(totalStorageSize)
        }
      });
    } catch (error) {
      logger.error('Error getting system stats:', error);
      res.status(500).json({ 
        error: error.message,
        summary: {
          totalCollections: 0,
          totalDocuments: 0,
          totalDataSize: 0,
          totalStorageSize: 0,
          formattedSize: '0 KB',
          formattedStorageSize: '0 KB'
        }
      });
    }
  });

// Health check endpoint
router.get('/health', async (req, res) => {
  try {
    const checks = {
      api: 'online',
      mongodb: 'checking',
      oracle: 'checking',
      timestamp: new Date().toISOString()
    };
    
    // Check MongoDB
    if (mongoose.connection.readyState === 1) {
      checks.mongodb = 'connected';
      
      // Get MongoDB ping
      const start = Date.now();
      await mongoose.connection.db.admin().ping();
      checks.mongodbResponseTime = Date.now() - start;
    } else {
      checks.mongodb = 'disconnected';
    }
    
    // Check Oracle if configured
    checks.oracle = process.env.ORACLE_CONNECTION ? 'configured' : 'not_configured';
    
    // Overall status
    checks.status = checks.mongodb === 'connected' ? 'healthy' : 'degraded';
    
    res.json(checks);
  } catch (error) {
    res.status(503).json({ 
      status: 'unhealthy',
      error: error.message 
    });
  }
});

// Get connection status for all services
router.get('/connections', async (req, res) => {
  try {
    const connections = {
      mongodb: {
        status: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        host: mongoose.connection.host || 'localhost',
        port: mongoose.connection.port || 27017,
        database: mongoose.connection.name || 'sportsdata'
      },
      backend: {
        status: 'online',
        url: req.protocol + '://' + req.get('host'),
        uptime: process.uptime(),
        memory: process.memoryUsage()
      },
      oracle: {
        status: process.env.ORACLE_CONNECTION ? 'configured' : 'not_configured',
        database: process.env.ORACLE_DATABASE || 'N/A'
      },
      statsApi: {
        status: 'configured',
        url: process.env.STATS_API_URL || 'N/A',
        version: 'v2.0'
      }
    };
    
    res.json(connections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/debug', async (req, res) => {
    try {
      const db = mongoose.connection.db;
      
      // Get all collections
      const collections = await db.listCollections().toArray();
      
      // Get counts for each collection
      const details = await Promise.all(
        collections.map(async (col) => {
          const count = await db.collection(col.name).countDocuments();
          return { name: col.name, count };
        })
      );
      
      // Also get data from mongoose models
      const ScrapedData = require('../models/ScrapedData');
      const Team = require('../models/Team');
      
      const scrapedCount = await ScrapedData.countDocuments();
      const teamCount = await Team.countDocuments();
      
      res.json({
        mongooseConnection: mongoose.connection.readyState,
        databaseName: db.databaseName,
        collections: details,
        modelCounts: {
          scrapedData: scrapedCount,
          teams: teamCount
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message, stack: error.stack });
    }
  });

// Utility function to format bytes
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Health Check Dashboard - Visual status page
router.get('/dashboard', async (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SportsData Pro - Health Dashboard</title>
  <meta http-equiv="refresh" content="30">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      min-height: 100vh;
      padding: 2rem;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;
      padding-bottom: 1rem;
      border-bottom: 1px solid #334155;
    }
    h1 { font-size: 1.75rem; color: #f8fafc; }
    .refresh-info { color: #64748b; font-size: 0.875rem; }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.5rem;
      margin-bottom: 2rem;
    }
    .status-card {
      background: #1e293b;
      border-radius: 12px;
      padding: 1.5rem;
      border: 1px solid #334155;
    }
    .card-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 1rem;
    }
    .card-title { font-size: 1rem; color: #94a3b8; }
    .status-badge {
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
    }
    .status-healthy { background: #065f46; color: #34d399; }
    .status-degraded { background: #78350f; color: #fbbf24; }
    .status-unhealthy { background: #7f1d1d; color: #f87171; }
    .status-unknown { background: #374151; color: #9ca3af; }
    .card-value {
      font-size: 2rem;
      font-weight: 700;
      color: #f8fafc;
      margin-bottom: 0.5rem;
    }
    .card-detail { color: #64748b; font-size: 0.875rem; }
    .metrics-section {
      background: #1e293b;
      border-radius: 12px;
      padding: 1.5rem;
      border: 1px solid #334155;
      margin-bottom: 2rem;
    }
    .section-title {
      font-size: 1.125rem;
      color: #f8fafc;
      margin-bottom: 1rem;
      padding-bottom: 0.5rem;
      border-bottom: 1px solid #334155;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
    }
    .metric {
      background: #0f172a;
      padding: 1rem;
      border-radius: 8px;
    }
    .metric-label { color: #64748b; font-size: 0.75rem; margin-bottom: 0.25rem; }
    .metric-value { color: #f8fafc; font-size: 1.25rem; font-weight: 600; }
    .collections-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    .collections-table th,
    .collections-table td {
      padding: 0.75rem;
      text-align: left;
      border-bottom: 1px solid #334155;
    }
    .collections-table th {
      color: #64748b;
      font-weight: 500;
      font-size: 0.75rem;
      text-transform: uppercase;
    }
    .collections-table td { color: #e2e8f0; }
    .collections-table tr:hover { background: #334155; }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 3rem;
      color: #64748b;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #334155;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 1rem;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .footer {
      text-align: center;
      color: #64748b;
      font-size: 0.75rem;
      padding-top: 1rem;
      border-top: 1px solid #334155;
    }
    .footer a { color: #3b82f6; text-decoration: none; }
    .footer a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>SportsData Pro - Health Dashboard</h1>
      <div class="refresh-info">Auto-refreshes every 30 seconds</div>
    </header>

    <div id="dashboard">
      <div class="loading">
        <div class="spinner"></div>
        <span>Loading health data...</span>
      </div>
    </div>

    <div class="footer">
      <p>
        <a href="${baseUrl}/api/v1/docs">API Documentation</a> |
        <a href="${baseUrl}/api/v1/swagger">Swagger UI</a> |
        <a href="${baseUrl}/api/system/health">Health JSON</a>
      </p>
    </div>
  </div>

  <script>
    async function loadDashboard() {
      try {
        const [healthRes, statsRes, connectionsRes] = await Promise.all([
          fetch('${baseUrl}/api/system/health').then(r => r.json()).catch(() => ({ status: 'error' })),
          fetch('${baseUrl}/api/system/stats').then(r => r.json()).catch(() => ({ summary: {} })),
          fetch('${baseUrl}/api/system/connections').then(r => r.json()).catch(() => ({}))
        ]);

        const statusClass = {
          healthy: 'status-healthy',
          degraded: 'status-degraded',
          unhealthy: 'status-unhealthy'
        }[healthRes.status] || 'status-unknown';

        const uptime = connectionsRes.backend?.uptime || 0;
        const uptimeStr = formatUptime(uptime);
        const memory = connectionsRes.backend?.memory || {};
        const memoryMB = Math.round((memory.heapUsed || 0) / 1024 / 1024);

        document.getElementById('dashboard').innerHTML = \`
          <div class="status-grid">
            <div class="status-card">
              <div class="card-header">
                <span class="card-title">System Status</span>
                <span class="status-badge \${statusClass}">\${healthRes.status || 'Unknown'}</span>
              </div>
              <div class="card-value">\${healthRes.mongodb === 'connected' ? 'Online' : 'Offline'}</div>
              <div class="card-detail">MongoDB: \${healthRes.mongodb || 'Unknown'}</div>
            </div>

            <div class="status-card">
              <div class="card-header">
                <span class="card-title">Uptime</span>
              </div>
              <div class="card-value">\${uptimeStr}</div>
              <div class="card-detail">Since last restart</div>
            </div>

            <div class="status-card">
              <div class="card-header">
                <span class="card-title">Memory Usage</span>
              </div>
              <div class="card-value">\${memoryMB} MB</div>
              <div class="card-detail">Heap used</div>
            </div>

            <div class="status-card">
              <div class="card-header">
                <span class="card-title">Response Time</span>
              </div>
              <div class="card-value">\${healthRes.mongodbResponseTime || 0} ms</div>
              <div class="card-detail">MongoDB ping</div>
            </div>
          </div>

          <div class="metrics-section">
            <h2 class="section-title">Database Metrics</h2>
            <div class="metrics-grid">
              <div class="metric">
                <div class="metric-label">Total Documents</div>
                <div class="metric-value">\${(statsRes.summary?.totalDocuments || 0).toLocaleString()}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Collections</div>
                <div class="metric-value">\${statsRes.summary?.totalCollections || 0}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Data Size</div>
                <div class="metric-value">\${statsRes.summary?.formattedSize || '0 KB'}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Storage Size</div>
                <div class="metric-value">\${statsRes.summary?.formattedStorageSize || '0 KB'}</div>
              </div>
            </div>
          </div>

          <div class="metrics-section">
            <h2 class="section-title">Collections</h2>
            <table class="collections-table">
              <thead>
                <tr>
                  <th>Collection</th>
                  <th>Documents</th>
                  <th>Size</th>
                  <th>Indexes</th>
                </tr>
              </thead>
              <tbody>
                \${(statsRes.collections || []).map(col => \`
                  <tr>
                    <td>\${col.name}</td>
                    <td>\${col.count.toLocaleString()}</td>
                    <td>\${formatBytes(col.size)}</td>
                    <td>\${col.indexes}</td>
                  </tr>
                \`).join('')}
              </tbody>
            </table>
          </div>

          <div class="metrics-section">
            <h2 class="section-title">Connections</h2>
            <div class="metrics-grid">
              <div class="metric">
                <div class="metric-label">MongoDB Host</div>
                <div class="metric-value" style="font-size: 1rem;">\${connectionsRes.mongodb?.host || 'N/A'}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Database</div>
                <div class="metric-value" style="font-size: 1rem;">\${connectionsRes.mongodb?.database || 'N/A'}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Oracle</div>
                <div class="metric-value" style="font-size: 1rem;">\${connectionsRes.oracle?.status || 'N/A'}</div>
              </div>
              <div class="metric">
                <div class="metric-label">Stats API</div>
                <div class="metric-value" style="font-size: 1rem;">\${connectionsRes.statsApi?.status || 'N/A'}</div>
              </div>
            </div>
          </div>
        \`;
      } catch (error) {
        document.getElementById('dashboard').innerHTML = \`
          <div class="status-card">
            <div class="card-header">
              <span class="card-title">Error</span>
              <span class="status-badge status-unhealthy">Error</span>
            </div>
            <div class="card-detail">\${error.message}</div>
          </div>
        \`;
      }
    }

    function formatUptime(seconds) {
      const days = Math.floor(seconds / 86400);
      const hours = Math.floor((seconds % 86400) / 3600);
      const mins = Math.floor((seconds % 3600) / 60);
      if (days > 0) return days + 'd ' + hours + 'h';
      if (hours > 0) return hours + 'h ' + mins + 'm';
      return mins + 'm';
    }

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB', 'GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    loadDashboard();
  </script>
</body>
</html>
`;

  res.send(html);
});

module.exports = router;