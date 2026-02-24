// backend/routes/search.js
const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const ScrapedData = require('../models/ScrapedData');
const { query, validationResult } = require('express-validator');
const { HTTP_STATUS, ERROR_MESSAGES } = require('../constants');
const logger = require('../utils/logger');

// Validation middleware
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      error: ERROR_MESSAGES.VALIDATION_FAILED,
      details: errors.array()
    });
  }
  next();
};

// Search validation
const validateSearch = [
  query('q')
    .trim()
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Search query must be between 2 and 100 characters'),
  query('type')
    .optional()
    .isIn(['all', 'teams', 'players', 'schedule'])
    .withMessage('Type must be one of: all, teams, players, schedule'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  handleValidationErrors
];

// GET search across teams and data
router.get('/', validateSearch, async (req, res) => {
  try {
    const { q, type = 'all', limit = 20 } = req.query;
    const searchRegex = new RegExp(q, 'i');
    const maxResults = parseInt(limit);

    const results = {
      query: q,
      teams: [],
      players: [],
      schedule: [],
      totalResults: 0
    };

    // Search teams
    if (type === 'all' || type === 'teams') {
      const teams = await Team.find({
        $or: [
          { teamId: searchRegex },
          { teamName: searchRegex },
          { teamNickname: searchRegex },
          { teamAbbrev: searchRegex },
          { conference: searchRegex },
          { division: searchRegex }
        ]
      })
        .limit(maxResults)
        .select('teamId teamName teamNickname teamAbbrev league conference division logoUrl')
        .lean();

      results.teams = teams.map(team => ({
        ...team,
        type: 'team',
        displayName: team.teamName,
        subtitle: `${team.league} - ${team.conference || 'N/A'}`
      }));
    }

    // Search players (roster data)
    if (type === 'all' || type === 'players') {
      const playerData = await ScrapedData.find({
        dataType: 'roster',
        $or: [
          { 'data.name': searchRegex },
          { 'data.firstName': searchRegex },
          { 'data.lastName': searchRegex },
          { 'data.jersey': q } // Exact match for jersey number
        ]
      })
        .limit(maxResults)
        .select('teamId moduleId data.name data.firstName data.lastName data.position data.jersey data.class data.height data.weight')
        .lean();

      results.players = playerData.map(player => ({
        teamId: player.teamId,
        moduleId: player.moduleId,
        name: player.data?.name || `${player.data?.firstName || ''} ${player.data?.lastName || ''}`.trim(),
        position: player.data?.position,
        jersey: player.data?.jersey,
        class: player.data?.class,
        height: player.data?.height,
        weight: player.data?.weight,
        type: 'player',
        displayName: player.data?.name || `${player.data?.firstName || ''} ${player.data?.lastName || ''}`.trim(),
        subtitle: `#${player.data?.jersey || 'N/A'} ${player.data?.position || ''} - ${player.teamId}`
      }));
    }

    // Search schedule (game data)
    if (type === 'all' || type === 'schedule') {
      const scheduleData = await ScrapedData.find({
        dataType: 'schedule',
        $or: [
          { 'data.opponent': searchRegex },
          { 'data.opponentName': searchRegex },
          { 'data.venue': searchRegex },
          { 'data.location': searchRegex }
        ]
      })
        .limit(maxResults)
        .select('teamId moduleId data.date data.opponent data.opponentName data.venue data.location data.time data.tv')
        .lean();

      results.schedule = scheduleData.map(game => ({
        teamId: game.teamId,
        moduleId: game.moduleId,
        date: game.data?.date,
        opponent: game.data?.opponentName || game.data?.opponent,
        venue: game.data?.venue || game.data?.location,
        time: game.data?.time,
        tv: game.data?.tv,
        type: 'schedule',
        displayName: `vs ${game.data?.opponentName || game.data?.opponent}`,
        subtitle: `${game.data?.date || 'TBD'} - ${game.teamId}`
      }));
    }

    results.totalResults = results.teams.length + results.players.length + results.schedule.length;

    res.json({
      success: true,
      ...results
    });

  } catch (error) {
    logger.error('Search error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: error.message
    });
  }
});

// GET quick search (lightweight, for autocomplete)
router.get('/quick', [
  query('q')
    .trim()
    .notEmpty()
    .withMessage('Search query is required')
    .isLength({ min: 1, max: 50 })
    .withMessage('Search query must be between 1 and 50 characters'),
  handleValidationErrors
], async (req, res) => {
  try {
    const { q } = req.query;
    const searchRegex = new RegExp(q, 'i');

    // Quick search only in teams for autocomplete
    const teams = await Team.find({
      $or: [
        { teamName: searchRegex },
        { teamNickname: searchRegex },
        { teamAbbrev: searchRegex }
      ]
    })
      .limit(8)
      .select('teamId teamName teamAbbrev league')
      .lean();

    const suggestions = teams.map(team => ({
      id: team.teamId,
      label: team.teamName,
      sublabel: team.league,
      type: 'team'
    }));

    res.json({
      success: true,
      suggestions
    });

  } catch (error) {
    logger.error('Quick search error:', error);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
