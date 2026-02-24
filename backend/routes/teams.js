// backend/routes/teams.js
const express = require('express');
const router = express.Router();
const Team = require('../models/Team');
const {
  validateCreateTeam,
  validateUpdateTeam,
  validateTeamIdParam,
  validateTeamQuery
} = require('../middleware/validation');
const {
  TEAM_FIELDS,
  HTTP_STATUS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} = require('../constants');
const logger = require('../utils/logger');

// Use constants for allowed fields
const ALLOWED_FIELDS = TEAM_FIELDS.ALLOWED;

// Helper: Extract only allowed fields from request body
function filterAllowedFields(body, allowedFields = ALLOWED_FIELDS) {
  const filtered = {};
  allowedFields.forEach(field => {
    if (body.hasOwnProperty(field)) {
      filtered[field] = body[field];
    }
  });
  return filtered;
}

// Helper: Validate required fields
function validateRequiredFields(data) {
  const errors = [];

  if (!data.teamId) {
    errors.push('teamId is required');
  }
  if (!data.teamName) {
    errors.push('teamName is required');
  }
  if (!data.league) {
    errors.push('league is required');
  }
  if (!data.baseUrl) {
    errors.push('baseUrl is required');
  }

  return errors;
}

// GET all teams
router.get('/', validateTeamQuery, async (req, res) => {
  try {
    const { league, conference, active } = req.query;
    const filter = {};
    if (league) filter.league = league;
    if (conference) filter.conference = conference;
    if (active !== undefined) filter.active = active === 'true';

    const teams = await Team.find(filter).sort({ teamName: 1 });
    res.json({
      success: true,
      count: teams.length,
      teams
    });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// GET single team by teamId
router.get('/:teamId', validateTeamIdParam, async (req, res) => {
  try {
    const team = await Team.findOne({ teamId: req.params.teamId });
    if (!team) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: ERROR_MESSAGES.TEAM_NOT_FOUND });
    }
    res.json({ success: true, team });
  } catch (error) {
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

// POST create new team
router.post('/', validateCreateTeam, async (req, res) => {
  try {
    // Filter to only allowed fields
    const teamData = filterAllowedFields(req.body);

    // Validate required fields
    const validationErrors = validateRequiredFields(teamData);
    if (validationErrors.length > 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: ERROR_MESSAGES.VALIDATION_FAILED,
        details: validationErrors
      });
    }

    const team = new Team(teamData);
    await team.save();

    res.status(HTTP_STATUS.CREATED).json({ success: true, team });
  } catch (error) {
    logger.error('Error creating team:', error.message);
    res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, error: error.message });
  }
});

// PUT update team by teamId
router.put('/:teamId', validateUpdateTeam, async (req, res) => {
  try {
    // Filter to only allowed fields (excluding teamId which shouldn't be updated)
    const allowedUpdateFields = ALLOWED_FIELDS.filter(f => f !== 'teamId');
    const updates = filterAllowedFields(req.body, allowedUpdateFields);

    // Check if there are any valid fields to update
    if (Object.keys(updates).length === 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'No valid fields to update'
      });
    }

    const team = await Team.findOneAndUpdate(
      { teamId: req.params.teamId },
      updates,
      { new: true, runValidators: true }
    );

    if (!team) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: ERROR_MESSAGES.TEAM_NOT_FOUND });
    }

    res.json({ success: true, team });
  } catch (error) {
    logger.error('Error updating team:', error.message);
    res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, error: error.message });
  }
});

// DELETE team by teamId
router.delete('/:teamId', validateTeamIdParam, async (req, res) => {
  try {
    const team = await Team.findOneAndDelete({ teamId: req.params.teamId });
    if (!team) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: ERROR_MESSAGES.TEAM_NOT_FOUND });
    }
    res.json({ success: true, message: SUCCESS_MESSAGES.TEAM_DELETED });
  } catch (error) {
    logger.error('Error deleting team:', error.message);
    res.status(HTTP_STATUS.INTERNAL_ERROR).json({ success: false, error: error.message });
  }
});

module.exports = router;
