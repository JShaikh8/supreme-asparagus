// backend/routes/publicApi.js
// Public REST API for data retrieval with export support

const express = require('express');
const router = express.Router();
const path = require('path');
const Team = require('../models/Team');
const ScrapedData = require('../models/ScrapedData');
const ComparisonResult = require('../models/ComparisonResult');
const exportService = require('../services/exportService');

// Swagger UI for OpenAPI documentation
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const swaggerDocument = YAML.load(path.join(__dirname, '../docs/openapi.yaml'));

// Rate limiting middleware
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');
const limiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 requests per hour per IP
  message: { error: 'Too many requests, please try again later.' }
});

// Apply rate limiting to all routes
router.use(limiter);

// Swagger UI - OpenAPI documentation at /api/v1/swagger
router.use('/swagger', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'SportsData Pro API'
}));

// OpenAPI spec as JSON
router.get('/openapi.json', (req, res) => {
  res.json(swaggerDocument);
});

/**
 * GET /api/v1/teams
 * Get all teams with optional filters
 * Query params: league, conference, active, format (json|csv|xlsx)
 */
router.get('/teams', async (req, res) => {
  try {
    const { league, conference, active, format = 'json' } = req.query;

    const filter = {};
    if (league) filter.league = league;
    if (conference) filter.conference = conference;
    if (active !== undefined) filter.active = active === 'true';

    const teams = await Team.find(filter).sort({ teamName: 1 });

    // Handle export formats
    switch (format.toLowerCase()) {
      case 'csv':
        return exportService.toCSV(
          exportService.formatTeamsExport(teams),
          res,
          'teams'
        );
      case 'xlsx':
      case 'excel':
        return exportService.toExcel(
          exportService.formatTeamsExport(teams),
          res,
          'teams',
          { sheetName: 'Teams' }
        );
      default:
        return res.json({
          success: true,
          count: teams.length,
          data: teams
        });
    }
  } catch (error) {
    logger.error('Error fetching teams:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/teams/:teamId
 * Get specific team details
 */
router.get('/teams/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    const team = await Team.findOne({ teamId });

    if (!team) {
      return res.status(404).json({ error: 'Team not found' });
    }

    return res.json({
      success: true,
      data: team
    });
  } catch (error) {
    logger.error('Error fetching team:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/teams/:teamId/stats
 * Get stats for a specific team
 * Query params: sport, season, limit, format (json|csv|xlsx)
 */
router.get('/teams/:teamId/stats', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { sport, season, limit = 100, format = 'json' } = req.query;

    // Build filter - ONLY stats data
    const filter = { teamId, dataType: 'stats' };
    if (sport) filter.sport = sport;

    // Get stats from ScrapedData
    const stats = await ScrapedData.find(filter)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit));

    if (stats.length === 0) {
      return res.status(404).json({
        error: 'No stats found for this team',
        suggestion: 'Try fetching stats first from the admin panel'
      });
    }

    // Handle export formats
    switch (format.toLowerCase()) {
      case 'csv':
        return exportService.toCSV(
          exportService.formatTeamStatsExport(stats),
          res,
          `${teamId}_stats`
        );
      case 'xlsx':
      case 'excel':
        return exportService.toExcel(
          exportService.formatTeamStatsExport(stats),
          res,
          `${teamId}_stats`,
          { sheetName: 'Stats' }
        );
      default:
        return res.json({
          success: true,
          teamId,
          count: stats.length,
          data: stats
        });
    }
  } catch (error) {
    logger.error('Error fetching team stats:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/teams/:teamId/roster
 * Get roster for a specific team
 * Query params: sport, limit, format (json|csv|xlsx)
 */
router.get('/teams/:teamId/roster', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { sport, limit = 100, format = 'json' } = req.query;

    // Build filter - ONLY roster data
    const filter = { teamId, dataType: 'roster' };
    if (sport) filter.sport = sport;

    // Get roster from ScrapedData
    const roster = await ScrapedData.find(filter)
      .sort({ updatedAt: -1 })
      .limit(parseInt(limit));

    if (roster.length === 0) {
      return res.status(404).json({
        error: 'No roster found for this team',
        suggestion: 'Try fetching roster first from the admin panel'
      });
    }

    // Handle export formats
    switch (format.toLowerCase()) {
      case 'csv':
        return exportService.toCSV(
          exportService.formatTeamRosterExport(roster),
          res,
          `${teamId}_roster`
        );
      case 'xlsx':
      case 'excel':
        return exportService.toExcel(
          exportService.formatTeamRosterExport(roster),
          res,
          `${teamId}_roster`,
          { sheetName: 'Roster' }
        );
      default:
        return res.json({
          success: true,
          teamId,
          count: roster.length,
          data: roster
        });
    }
  } catch (error) {
    logger.error('Error fetching team roster:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/teams/:teamId/schedule
 * Get schedule for a specific team
 * Query params: sport, limit, format (json|csv|xlsx)
 */
router.get('/teams/:teamId/schedule', async (req, res) => {
  try {
    const { teamId } = req.params;
    const { sport, limit = 100, format = 'json' } = req.query;

    // Build filter - ONLY schedule data
    const filter = { teamId, dataType: 'schedule' };
    if (sport) filter.sport = sport;

    // Get schedule from ScrapedData
    const schedule = await ScrapedData.find(filter)
      .sort({ 'data.date': 1 }) // Sort by game date ascending
      .limit(parseInt(limit));

    if (schedule.length === 0) {
      return res.status(404).json({
        error: 'No schedule found for this team',
        suggestion: 'Try fetching schedule first from the admin panel'
      });
    }

    // Handle export formats
    switch (format.toLowerCase()) {
      case 'csv':
        return exportService.toCSV(
          exportService.formatTeamScheduleExport(schedule),
          res,
          `${teamId}_schedule`
        );
      case 'xlsx':
      case 'excel':
        return exportService.toExcel(
          exportService.formatTeamScheduleExport(schedule),
          res,
          `${teamId}_schedule`,
          { sheetName: 'Schedule' }
        );
      default:
        return res.json({
          success: true,
          teamId,
          count: schedule.length,
          data: schedule
        });
    }
  } catch (error) {
    logger.error('Error fetching team schedule:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/conferences/:conference/stats
 * Get aggregated stats for all teams in a conference
 * Query params: league, sport, format (json|csv|xlsx)
 */
router.get('/conferences/:conference/stats', async (req, res) => {
  try {
    const { conference } = req.params;
    const { league = 'NCAA', sport, format = 'json' } = req.query;

    // Get all teams in the conference
    const teams = await Team.find({ league, conference, active: true });

    if (teams.length === 0) {
      return res.status(404).json({ error: 'No teams found for this conference' });
    }

    const teamIds = teams.map(t => t.teamId);

    // Build filter
    const filter = { teamId: { $in: teamIds } };
    if (sport) filter.sport = sport;

    // Get stats for all teams in conference
    const stats = await ScrapedData.find(filter)
      .sort({ teamId: 1, updatedAt: -1 });

    if (stats.length === 0) {
      return res.status(404).json({
        error: 'No stats found for teams in this conference',
        teams: teamIds
      });
    }

    // Handle export formats
    switch (format.toLowerCase()) {
      case 'csv':
        return exportService.toCSV(
          exportService.formatTeamStatsExport(stats),
          res,
          `${conference}_stats`
        );
      case 'xlsx':
      case 'excel':
        return exportService.toExcel(
          exportService.formatTeamStatsExport(stats),
          res,
          `${conference}_stats`,
          { sheetName: conference }
        );
      default:
        return res.json({
          success: true,
          conference,
          teamsCount: teams.length,
          statsCount: stats.length,
          teams: teamIds,
          data: stats
        });
    }
  } catch (error) {
    logger.error('Error fetching conference stats:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/conferences/:conference/roster
 * Get aggregated roster for all teams in a conference
 * Query params: league, sport, format (json|csv|xlsx)
 */
router.get('/conferences/:conference/roster', async (req, res) => {
  try {
    const { conference } = req.params;
    const { league = 'NCAA', sport, format = 'json' } = req.query;

    // Get all teams in the conference
    const teams = await Team.find({ league, conference, active: true });

    if (teams.length === 0) {
      return res.status(404).json({ error: 'No teams found for this conference' });
    }

    const teamIds = teams.map(t => t.teamId);

    // Build filter - ONLY roster data
    const filter = { teamId: { $in: teamIds }, dataType: 'roster' };
    if (sport) filter.sport = sport;

    // Get rosters for all teams in conference
    const rosters = await ScrapedData.find(filter)
      .sort({ teamId: 1, updatedAt: -1 });

    if (rosters.length === 0) {
      return res.status(404).json({
        error: 'No roster data found for teams in this conference',
        teams: teamIds
      });
    }

    // Handle export formats
    switch (format.toLowerCase()) {
      case 'csv':
        return exportService.toCSV(
          exportService.formatTeamRosterExport(rosters),
          res,
          `${conference}_roster`
        );
      case 'xlsx':
      case 'excel':
        return exportService.toExcel(
          exportService.formatTeamRosterExport(rosters),
          res,
          `${conference}_roster`,
          { sheetName: conference }
        );
      default:
        return res.json({
          success: true,
          conference,
          teamsCount: teams.length,
          rosterCount: rosters.length,
          teams: teamIds,
          data: rosters
        });
    }
  } catch (error) {
    logger.error('Error fetching conference roster:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/comparisons
 * Get list of comparison results
 * Query params: teamId, limit, format (json|csv|xlsx)
 */
router.get('/comparisons', async (req, res) => {
  try {
    const { teamId, limit = 50, format = 'json' } = req.query;

    const filter = {};
    if (teamId) filter.teamId = teamId;

    const comparisons = await ComparisonResult.find(filter)
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    // Handle export formats
    switch (format.toLowerCase()) {
      case 'csv':
        const csvData = comparisons.map(c => ({
          'ID': c._id,
          'Team': c.teamId,
          'Module': c.moduleId,
          'Source': c.source,
          'Matches': c.matchCount,
          'Discrepancies': c.discrepancyCount,
          'Created': new Date(c.createdAt).toLocaleString()
        }));
        return exportService.toCSV(csvData, res, 'comparisons');
      case 'xlsx':
      case 'excel':
        const excelData = comparisons.map(c => ({
          'ID': c._id.toString(),
          'Team': c.teamId,
          'Module': c.moduleId,
          'Source': c.source,
          'Matches': c.matchCount,
          'Discrepancies': c.discrepancyCount,
          'Created': new Date(c.createdAt).toLocaleString()
        }));
        return exportService.toExcel(excelData, res, 'comparisons', { sheetName: 'Comparisons' });
      default:
        return res.json({
          success: true,
          count: comparisons.length,
          data: comparisons
        });
    }
  } catch (error) {
    logger.error('Error fetching comparisons:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/comparisons/:id
 * Get specific comparison result with full details
 * Query params: format (json|csv|xlsx)
 */
router.get('/comparisons/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'json' } = req.query;

    const comparison = await ComparisonResult.findById(id);

    if (!comparison) {
      return res.status(404).json({ error: 'Comparison not found' });
    }

    // Handle export formats
    switch (format.toLowerCase()) {
      case 'csv':
        // For CSV, export discrepancies only
        const csvData = comparison.discrepancies || [];
        return exportService.toCSV(csvData, res, `comparison_${id}`);
      case 'xlsx':
      case 'excel':
        // For Excel, create multiple sheets
        const sheets = exportService.formatComparisonExport(comparison);
        return exportService.toExcel(null, res, `comparison_${id}`, { sheets });
      default:
        return res.json({
          success: true,
          data: comparison
        });
    }
  } catch (error) {
    logger.error('Error fetching comparison:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/stats
 * Get stats summary grouped by team/module
 */
router.get('/stats', async (req, res) => {
  try {
    const stats = await ScrapedData.aggregate([
      {
        $group: {
          _id: {
            teamId: '$teamId',
            sport: '$sport',
            league: '$league'
          },
          count: { $sum: 1 },
          lastUpdated: { $max: '$updatedAt' }
        }
      },
      {
        $sort: { lastUpdated: -1 }
      },
      {
        $limit: 100
      }
    ]);

    return res.json({
      success: true,
      count: stats.length,
      data: stats
    });
  } catch (error) {
    logger.error('Error fetching stats summary:', error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/docs
 * Interactive API documentation
 */
router.get('/docs', (req, res) => {
  const host = req.get('host');
  const protocol = req.protocol;
  const baseUrl = `${protocol}://${host}/api/v1`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sports Data Platform API Documentation</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f7fa;
      padding: 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    header {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      padding: 2rem;
      border-radius: 10px;
      margin-bottom: 2rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    }
    h1 { font-size: 2.5rem; margin-bottom: 0.5rem; }
    .subtitle { font-size: 1.1rem; opacity: 0.9; }
    .endpoint-section {
      background: white;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.08);
    }
    .endpoint-header {
      display: flex;
      align-items: center;
      gap: 1rem;
      margin-bottom: 1rem;
    }
    .method {
      padding: 0.25rem 0.75rem;
      border-radius: 4px;
      font-weight: 600;
      font-size: 0.85rem;
      text-transform: uppercase;
    }
    .method-get { background: #e3f2fd; color: #1976d2; }
    .path {
      font-family: 'Courier New', monospace;
      font-size: 1.1rem;
      color: #2c3e50;
    }
    .description { color: #666; margin-bottom: 1rem; }
    .params {
      background: #f8f9fa;
      border-left: 3px solid #667eea;
      padding: 1rem;
      margin: 1rem 0;
      border-radius: 4px;
    }
    .params h4 { color: #667eea; margin-bottom: 0.5rem; }
    .param-list { list-style: none; }
    .param-list li {
      padding: 0.3rem 0;
      padding-left: 1rem;
      position: relative;
    }
    .param-list li:before {
      content: "•";
      position: absolute;
      left: 0;
      color: #667eea;
    }
    .param-name { font-family: monospace; color: #e83e8c; font-weight: 600; }
    .example {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 1rem;
      border-radius: 6px;
      font-family: 'Courier New', monospace;
      font-size: 0.9rem;
      overflow-x: auto;
      margin-top: 1rem;
    }
    .example a {
      color: #66d9ef;
      text-decoration: none;
      word-break: break-all;
    }
    .example a:hover { text-decoration: underline; }
    .section-title {
      font-size: 1.8rem;
      color: #2c3e50;
      margin: 2rem 0 1rem 0;
      padding-bottom: 0.5rem;
      border-bottom: 2px solid #667eea;
    }
    .format-badge {
      display: inline-block;
      background: #28a745;
      color: white;
      padding: 0.2rem 0.6rem;
      border-radius: 3px;
      font-size: 0.75rem;
      margin-left: 0.5rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>🏀 Sports Data Platform API</h1>
      <p class="subtitle">RESTful API for accessing team rosters, stats, and comparison data</p>
      <p style="margin-top: 1rem; font-size: 0.9rem;">Base URL: <code style="background: rgba(255,255,255,0.2); padding: 0.3rem 0.6rem; border-radius: 4px;">${baseUrl}</code></p>
    </header>

    <h2 class="section-title">Team Endpoints</h2>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/teams</span>
      </div>
      <p class="description">Get all teams with optional filters</p>
      <div class="params">
        <h4>Query Parameters (optional):</h4>
        <ul class="param-list">
          <li><span class="param-name">league</span> - Filter by league (NCAA, NFL, MLB, NBA)</li>
          <li><span class="param-name">conference</span> - Filter by conference (e.g., Big Ten, SEC)</li>
          <li><span class="param-name">active</span> - Filter by active status (true/false)</li>
          <li><span class="param-name">format</span> - Export format <span class="format-badge">json</span> <span class="format-badge">csv</span> <span class="format-badge">xlsx</span></li>
        </ul>
      </div>
      <div class="example">
        <a href="${baseUrl}/teams?league=NCAA&conference=Big%20Ten&format=json" target="_blank">${baseUrl}/teams?league=NCAA&conference=Big Ten</a>
      </div>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/teams/:teamId</span>
      </div>
      <p class="description">Get details for a specific team</p>
      <div class="example">
        <a href="${baseUrl}/teams/NCAA_NORTHWESTERN" target="_blank">${baseUrl}/teams/NCAA_NORTHWESTERN</a>
      </div>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/teams/:teamId/roster</span>
      </div>
      <p class="description">Get roster data for a specific team</p>
      <div class="params">
        <h4>Query Parameters:</h4>
        <ul class="param-list">
          <li><span class="param-name">sport</span> - Sport type (football, mensBasketball, womensBasketball)</li>
          <li><span class="param-name">limit</span> - Max records to return (default: 100)</li>
          <li><span class="param-name">format</span> - Export format <span class="format-badge">json</span> <span class="format-badge">csv</span> <span class="format-badge">xlsx</span></li>
        </ul>
      </div>
      <div class="example">
        <a href="${baseUrl}/teams/NCAA_NORTHWESTERN/roster?sport=football" target="_blank">${baseUrl}/teams/NCAA_NORTHWESTERN/roster?sport=football</a>
      </div>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/teams/:teamId/stats</span>
      </div>
      <p class="description">Get game statistics for a specific team</p>
      <div class="params">
        <h4>Query Parameters:</h4>
        <ul class="param-list">
          <li><span class="param-name">sport</span> - Sport type (football, mensBasketball, womensBasketball)</li>
          <li><span class="param-name">season</span> - Season year (e.g., 2024)</li>
          <li><span class="param-name">limit</span> - Max records to return (default: 100)</li>
          <li><span class="param-name">format</span> - Export format <span class="format-badge">json</span> <span class="format-badge">csv</span> <span class="format-badge">xlsx</span></li>
        </ul>
      </div>
      <div class="example">
        <a href="${baseUrl}/teams/NCAA_NORTHWESTERN/stats?sport=football" target="_blank">${baseUrl}/teams/NCAA_NORTHWESTERN/stats?sport=football</a>
      </div>
    </div>

    <h2 class="section-title">Conference Endpoints</h2>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/conferences/:conference/roster</span>
      </div>
      <p class="description">Get roster data for all teams in a conference</p>
      <div class="params">
        <h4>Query Parameters:</h4>
        <ul class="param-list">
          <li><span class="param-name">league</span> - League (default: NCAA)</li>
          <li><span class="param-name">sport</span> - Sport type (football, mensBasketball, womensBasketball)</li>
          <li><span class="param-name">format</span> - Export format <span class="format-badge">json</span> <span class="format-badge">csv</span> <span class="format-badge">xlsx</span></li>
        </ul>
      </div>
      <div class="example">
        <a href="${baseUrl}/conferences/Big%20Ten/roster?sport=football" target="_blank">${baseUrl}/conferences/Big Ten/roster?sport=football</a>
      </div>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/conferences/:conference/stats</span>
      </div>
      <p class="description">Get game statistics for all teams in a conference</p>
      <div class="params">
        <h4>Query Parameters:</h4>
        <ul class="param-list">
          <li><span class="param-name">league</span> - League (default: NCAA)</li>
          <li><span class="param-name">sport</span> - Sport type (football, mensBasketball, womensBasketball)</li>
          <li><span class="param-name">format</span> - Export format <span class="format-badge">json</span> <span class="format-badge">csv</span> <span class="format-badge">xlsx</span></li>
        </ul>
      </div>
      <div class="example">
        <a href="${baseUrl}/conferences/Big%20Ten/stats?sport=football" target="_blank">${baseUrl}/conferences/Big Ten/stats?sport=football</a>
      </div>
    </div>

    <h2 class="section-title">Comparison Endpoints</h2>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/comparisons</span>
      </div>
      <p class="description">Get list of comparison results</p>
      <div class="params">
        <h4>Query Parameters (optional):</h4>
        <ul class="param-list">
          <li><span class="param-name">teamId</span> - Filter by team ID</li>
          <li><span class="param-name">limit</span> - Max records to return (default: 50)</li>
          <li><span class="param-name">format</span> - Export format <span class="format-badge">json</span> <span class="format-badge">csv</span> <span class="format-badge">xlsx</span></li>
        </ul>
      </div>
      <div class="example">
        <a href="${baseUrl}/comparisons?limit=10" target="_blank">${baseUrl}/comparisons?limit=10</a>
      </div>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/comparisons/:id</span>
      </div>
      <p class="description">Get specific comparison result with full details</p>
      <div class="params">
        <h4>Query Parameters (optional):</h4>
        <ul class="param-list">
          <li><span class="param-name">format</span> - Export format <span class="format-badge">json</span> <span class="format-badge">csv</span> <span class="format-badge">xlsx</span></li>
        </ul>
      </div>
    </div>

    <h2 class="section-title">Data Summary Endpoint</h2>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/stats</span>
      </div>
      <p class="description">Get stats summary grouped by team/sport/league (max 100 results)</p>
      <div class="example">
        <a href="${baseUrl}/stats" target="_blank">${baseUrl}/stats</a>
      </div>
    </div>

    <h2 class="section-title">Internal API Endpoints</h2>
    <p style="color: #666; margin-bottom: 1.5rem;">These endpoints are available on the internal API (<code>/api</code>) used by the frontend application.</p>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/api/search</span>
      </div>
      <p class="description">Global search across teams, players, and schedule data</p>
      <div class="params">
        <h4>Query Parameters:</h4>
        <ul class="param-list">
          <li><span class="param-name">q</span> - Search query (required, 2-100 characters)</li>
          <li><span class="param-name">type</span> - Filter by type: all, teams, players, schedule (default: all)</li>
          <li><span class="param-name">limit</span> - Max results per category (default: 20, max: 50)</li>
        </ul>
      </div>
      <div class="example">
        <code>/api/search?q=Northwestern&type=all&limit=20</code>
      </div>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/api/search/quick</span>
      </div>
      <p class="description">Lightweight search for autocomplete suggestions (teams only)</p>
      <div class="params">
        <h4>Query Parameters:</h4>
        <ul class="param-list">
          <li><span class="param-name">q</span> - Search query (required, 1-50 characters)</li>
        </ul>
      </div>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method method-get">GET</span>
        <span class="path">/api/settings</span>
      </div>
      <p class="description">Get current application settings</p>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method" style="background: #fff3cd; color: #856404;">PUT</span>
        <span class="path">/api/settings</span>
      </div>
      <p class="description">Update application settings</p>
      <div class="params">
        <h4>Request Body:</h4>
        <ul class="param-list">
          <li><span class="param-name">requestTimeout</span> - Request timeout in seconds (5-300)</li>
          <li><span class="param-name">maxRetryAttempts</span> - Max retry attempts (0-10)</li>
          <li><span class="param-name">autoRefreshInterval</span> - Auto refresh in minutes (0, 30, 60, 180, 360)</li>
          <li><span class="param-name">dataRetentionPeriod</span> - Data retention in days (7, 30, 90, 365)</li>
          <li><span class="param-name">bulkFetchConcurrency</span> - Concurrent fetches (1-5)</li>
          <li><span class="param-name">bulkFetchDelay</span> - Delay between batches in ms (1000-10000)</li>
        </ul>
      </div>
    </div>

    <div class="endpoint-section">
      <div class="endpoint-header">
        <span class="method" style="background: #d4edda; color: #155724;">POST</span>
        <span class="path">/api/settings/reset</span>
      </div>
      <p class="description">Reset all settings to default values</p>
    </div>

    <div style="margin-top: 3rem; padding: 2rem; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.08);">
      <h3 style="color: #667eea; margin-bottom: 1rem;">Export Formats</h3>
      <p>All endpoints support multiple export formats via the <span class="param-name">format</span> query parameter:</p>
      <ul style="margin-top: 0.5rem; margin-left: 2rem;">
        <li><strong>JSON</strong> (default): Pretty-printed JSON response</li>
        <li><strong>CSV</strong>: Comma-separated values file download</li>
        <li><strong>XLSX</strong>: Excel spreadsheet with formatted headers and auto-filtered columns</li>
      </ul>
    </div>

    <div style="margin-top: 2rem; padding: 1rem; background: #fff3cd; border-left: 4px solid #ffc107; border-radius: 4px;">
      <strong>📌 Note:</strong> All endpoints are rate-limited to 100 requests per hour per IP address.
    </div>
  </div>
</body>
</html>
  `;

  res.send(html);
});

module.exports = router;
