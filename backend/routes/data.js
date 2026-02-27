// backend/routes/data.js
const express = require('express');
const router = express.Router();
const ScrapedData = require('../models/ScrapedData');
const Team = require('../models/Team');
const oracleService = require('../services/oracleService');
const logger = require('../utils/logger');

// Get scraped data with filters
router.get('/scraped', async (req, res) => {
  try {
    const {
      teamId,
      moduleId,
      sport,
      league,
      dataType,
      rosterType,
      season,
      limit = 100,
      skip = 0,
      sortBy = 'updatedAt',
      sortOrder = 'desc'
    } = req.query;

    // Build filter
    const filter = {};
    if (teamId) filter.teamId = teamId;
    if (moduleId) filter.moduleId = moduleId;
    if (sport) filter.sport = sport;
    if (league) filter.league = league;
    if (dataType) filter.dataType = dataType;

    // MLB roster-specific filters
    if (rosterType) filter['data.rosterType'] = rosterType;
    if (season) filter['data.season'] = parseInt(season);
    
    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
    
    const data = await ScrapedData.find(filter)
      .sort(sort)
      .skip(parseInt(skip))
      .limit(parseInt(limit));
    
    res.json(data);
  } catch (error) {
    logger.error('Error fetching scraped data:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Oracle MLB schedule data for a team (view-only, no comparison)
router.get('/oracle-schedule', async (req, res) => {
  try {
    if (process.env.ENABLE_INTERNAL_FEATURES !== 'true') {
      return res.status(403).json({ error: 'Oracle access requires internal features mode' });
    }

    const { teamId, season } = req.query;
    if (!teamId) return res.status(400).json({ error: 'teamId is required' });

    const team = await Team.findOne({ teamId });
    if (!team) return res.status(404).json({ error: 'Team not found' });

    const oracleTeamId = team.statsId;
    if (!oracleTeamId) return res.status(404).json({ error: 'Team has no statsId configured for Oracle' });

    const seasonYear = season || new Date().getFullYear();
    const seasonId = parseInt(`${seasonYear}07`);

    const games = await oracleService.getMLBSchedule(oracleTeamId, seasonId);

    // Wrap each game in { data: game } format to match ScheduleDataView expectations
    const wrapped = games.map(game => ({
      data: {
        ...game,
        gameTypeName: game.gameType // ScheduleDataView reads gameTypeName, Oracle returns gameType
      },
      teamId,
      moduleId: 'mlb_schedule',
      source: 'oracle'
    }));

    res.json(wrapped);
  } catch (error) {
    logger.error('Error fetching Oracle schedule:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all MLB rosters - deduped by player ID with roster types aggregated
router.get('/mlb-rosters-all', async (req, res) => {
  try {
    const { season } = req.query;
    const seasonFilter = season ? parseInt(season) : new Date().getFullYear();

    // Get all MLB roster data for the season
    const allData = await ScrapedData.find({
      moduleId: 'mlb_roster',
      'data.season': seasonFilter
    }).sort({ 'data.fullName': 1 });

    // Deduplicate by personId, aggregating roster types and teams
    const playerMap = new Map();

    for (const record of allData) {
      const player = record.data;
      const playerId = player.personId || player.mlbamId;

      if (!playerId) continue;

      if (playerMap.has(playerId)) {
        // Player already exists - add roster type and team if not already present
        const existing = playerMap.get(playerId);
        if (!existing.rosterTypes.includes(player.rosterType)) {
          existing.rosterTypes.push(player.rosterType);
        }
        if (!existing.teams.includes(player.teamId)) {
          existing.teams.push(player.teamId);
          existing.teamNames.push(player.teamName);
        }
      } else {
        // New player - create entry
        playerMap.set(playerId, {
          _id: record._id,
          data: {
            ...player,
            rosterTypes: [player.rosterType],
            teams: [player.teamId],
            teamNames: [player.teamName]
          },
          validation: record.validation,
          rosterTypes: [player.rosterType],
          teams: [player.teamId],
          teamNames: [player.teamName]
        });
      }
    }

    // Convert map to array and add aggregated fields to data
    const dedupedPlayers = Array.from(playerMap.values()).map(entry => ({
      ...entry,
      data: {
        ...entry.data,
        rosterTypesDisplay: entry.rosterTypes.join(', '),
        teamsDisplay: entry.teamNames.join(', ')
      }
    }));

    // Sort by name
    dedupedPlayers.sort((a, b) =>
      (a.data.fullName || '').localeCompare(b.data.fullName || '')
    );

    res.json({
      total: allData.length,
      unique: dedupedPlayers.length,
      season: seasonFilter,
      data: dedupedPlayers
    });
  } catch (error) {
    logger.error('Error fetching all MLB rosters:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get data statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await ScrapedData.aggregate([
      {
        $group: {
          _id: {
            teamId: '$teamId',
            moduleId: '$moduleId',
            league: '$league',
            sport: '$sport'
          },
          count: { $sum: 1 },
          lastUpdated: { $max: '$updatedAt' },
          validCount: {
            $sum: {
              $cond: ['$validation.isValid', 1, 0]
            }
          }
        }
      },
      {
        $sort: { lastUpdated: -1 }
      }
    ]);
    
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get summary by team
router.get('/summary/:teamId', async (req, res) => {
  try {
    const { teamId } = req.params;
    
    const summary = await ScrapedData.aggregate([
      { $match: { teamId } },
      {
        $group: {
          _id: {
            moduleId: '$moduleId',
            dataType: '$dataType'
          },
          count: { $sum: 1 },
          lastUpdated: { $max: '$updatedAt' },
          oldestData: { $min: '$updatedAt' }
        }
      }
    ]);
    
    res.json(summary);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete old data
router.delete('/cleanup', async (req, res) => {
  try {
    const { daysToKeep = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(daysToKeep));
    
    const result = await ScrapedData.deleteMany({
      updatedAt: { $lt: cutoffDate }
    });
    
    res.json({
      success: true,
      deleted: result.deletedCount,
      message: `Deleted ${result.deletedCount} records older than ${daysToKeep} days`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;