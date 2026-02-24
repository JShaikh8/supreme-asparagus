// backend/services/nba/MinutesProjectionEngine.js
/**
 * NBA Minutes Projection Engine
 *
 * Predicts player minutes for upcoming games using:
 * - Weighted rolling averages (last 3/5/10 games)
 * - Situational adjustments (back-to-back, rest, home/away)
 * - Injury impact (minute redistribution)
 * - Role-based consistency factors
 */

const NBAPlayerSeasonStats = require('../../models/NBAPlayerSeasonStats');
const NBAPlayerGameLog = require('../../models/NBAPlayerGameLog');
const NBAInjuryReport = require('../../models/NBAInjuryReport');
const NBAGame = require('../../models/NBAGame');
const logger = require('../../utils/logger');

class MinutesProjectionEngine {
  constructor() {
    // Weights for rolling averages
    this.weights = {
      last3: 0.40,   // Most recent games weighted highest
      last5: 0.30,
      last10: 0.20,
      season: 0.10
    };

    // Situational adjustment factors (in minutes)
    this.adjustments = {
      backToBack: -2.5,      // Players rest more on back-to-backs
      extraRest: {           // Days rest impact
        0: -2.0,             // Back-to-back
        1: -1.0,             // 1 day rest
        2: 0,                // Normal
        3: 1.0,              // Extra rest
        '4+': 1.5            // Extended rest
      },
      starterBonus: 1.0      // Starters more consistent
    };

    // Confidence thresholds
    this.confidenceLevels = {
      high: 0.85,      // 85%+ confidence
      medium: 0.70,    // 70-85% confidence
      low: 0.50        // 50-70% confidence
    };
  }

  /**
   * Project minutes for a player in an upcoming game
   *
   * @param {Object} params - Projection parameters
   * @param {Number} params.playerId - NBA player ID
   * @param {Number} params.teamId - Player's team ID
   * @param {String} params.season - Season (e.g., "2024-25")
   * @param {Boolean} params.isHome - Is this a home game?
   * @param {Number} params.daysRest - Days since last game
   * @param {Array} params.injuredTeammates - Array of injured teammate IDs
   * @param {Date} params.gameDate - Date of game we're projecting for (optional)
   * @param {Number} params.opponentId - Opponent team ID (optional, for future matchup analysis)
   * @returns {Promise<Object>} Projection result
   */
  async projectMinutes(params) {
    const {
      playerId,
      teamId,
      season,
      isHome,
      daysRest,
      injuredTeammates = [],
      gameDate = null,
      opponentId = null
    } = params;

    try {
      // Get player's season statistics
      const playerStats = await NBAPlayerSeasonStats.findOne({
        playerId,
        teamId,
        season
      });

      if (!playerStats) {
        return {
          success: false,
          error: 'Player stats not found',
          playerId,
          season
        };
      }

      // Check if player is injured (using game date if provided)
      const isInjured = await this.isPlayerInjured(playerId, teamId, gameDate);
      if (isInjured) {
        return {
          success: true,
          playerId,
          playerName: playerStats.playerName,
          projectedMinutes: 0,
          confidence: 1.0,
          status: 'OUT',
          reason: 'Injured',
          breakdown: {
            baselineMinutes: 0,
            adjustments: [],
            totalAdjustment: 0
          }
        };
      }

      // Calculate baseline minutes using weighted averages
      const baseline = this.calculateBaselineMinutes(playerStats, isHome);

      // Calculate situational adjustments
      const adjustments = this.calculateAdjustments({
        playerStats,
        isHome,
        daysRest,
        injuredTeammates
      });

      // Apply adjustments to baseline
      const projectedMinutes = Math.max(0, baseline + adjustments.total);

      // Calculate confidence score
      const confidence = this.calculateConfidence({
        playerStats,
        adjustments,
        daysRest
      });

      return {
        success: true,
        playerId,
        playerName: playerStats.playerName,
        teamTricode: playerStats.teamTricode,
        projectedMinutes: Math.round(projectedMinutes * 100) / 100,
        confidence: Math.round(confidence * 100) / 100,
        confidenceLevel: this.getConfidenceLevel(confidence),
        status: 'ACTIVE',
        breakdown: {
          baselineMinutes: Math.round(baseline * 100) / 100,
          adjustments: adjustments.details,
          totalAdjustment: Math.round(adjustments.total * 100) / 100,
          weights: this.weights
        },
        context: {
          isHome,
          daysRest,
          injuredTeammates: injuredTeammates.length,
          isStarter: playerStats.starterRate > 0.5,
          seasonAverage: playerStats.minutesPerGame
        }
      };

    } catch (error) {
      logger.error('Error projecting minutes:', error);
      return {
        success: false,
        error: error.message,
        playerId
      };
    }
  }

  /**
   * Calculate baseline minutes using weighted rolling averages
   */
  calculateBaselineMinutes(playerStats, isHome) {
    const {
      minutesPerGame,
      last3Games,
      last5Games,
      last10Games,
      homeSplits,
      awaySplits
    } = playerStats;

    // Use home/away split as base if available and significant sample
    let base = isHome ?
      (homeSplits?.minutes || minutesPerGame) :
      (awaySplits?.minutes || minutesPerGame);

    // If we don't have enough rolling average data, use base
    if (!last3Games || !last5Games || !last10Games) {
      return base;
    }

    // Weighted average calculation
    const weightedAvg =
      (last3Games.minutes * this.weights.last3) +
      (last5Games.minutes * this.weights.last5) +
      (last10Games.minutes * this.weights.last10) +
      (base * this.weights.season);

    return weightedAvg;
  }

  /**
   * Calculate all situational adjustments
   */
  calculateAdjustments({ playerStats, isHome, daysRest, injuredTeammates }) {
    const adjustmentDetails = [];
    let totalAdjustment = 0;

    // 1. Back-to-back adjustment
    if (daysRest === 0) {
      const b2bAdjust = this.adjustments.backToBack;

      // Use actual back-to-back performance if available
      if (playerStats.backToBackSplits?.minutes) {
        const b2bDiff = playerStats.backToBackSplits.minutes - playerStats.minutesPerGame;
        totalAdjustment += b2bDiff;
        adjustmentDetails.push({
          type: 'back_to_back',
          value: Math.round(b2bDiff * 100) / 100,
          reason: 'Player averages fewer minutes on back-to-backs'
        });
      } else {
        totalAdjustment += b2bAdjust;
        adjustmentDetails.push({
          type: 'back_to_back',
          value: b2bAdjust,
          reason: 'Typical back-to-back reduction'
        });
      }
    }

    // 2. Days rest adjustment
    if (daysRest >= 3) {
      const restAdjust = daysRest >= 4 ?
        this.adjustments.extraRest['4+'] :
        this.adjustments.extraRest[3];

      totalAdjustment += restAdjust;
      adjustmentDetails.push({
        type: 'extra_rest',
        value: restAdjust,
        reason: `${daysRest} days rest - players typically play more`
      });
    }

    // 3. Starter consistency bonus
    if (playerStats.starterRate > 0.8) {
      const starterAdjust = this.adjustments.starterBonus;
      totalAdjustment += starterAdjust;
      adjustmentDetails.push({
        type: 'starter_bonus',
        value: starterAdjust,
        reason: 'Regular starter - more predictable minutes'
      });
    }

    // 4. Injury impact - minute redistribution
    if (injuredTeammates && injuredTeammates.length > 0) {
      const injuryBoost = this.calculateInjuryImpact(
        playerStats,
        injuredTeammates.length
      );

      if (injuryBoost > 0) {
        totalAdjustment += injuryBoost;
        adjustmentDetails.push({
          type: 'injury_opportunity',
          value: Math.round(injuryBoost * 100) / 100,
          reason: `${injuredTeammates.length} teammate(s) out - increased opportunity`
        });
      }
    }

    return {
      total: totalAdjustment,
      details: adjustmentDetails
    };
  }

  /**
   * Calculate minute boost from injured teammates
   * Estimates minute redistribution based on role
   */
  calculateInjuryImpact(playerStats, numInjured) {
    // Estimate: Each injured rotation player = ~30 minutes to redistribute
    // Distributed among 8-9 active rotation players
    const minutesPerInjury = 30 / 8;

    // Role-based share
    let share = 1.0;

    if (playerStats.starterRate > 0.5) {
      share = 1.5; // Starters get more of the redistribution
    } else if (playerStats.minutesPerGame < 15) {
      share = 0.5; // Deep bench gets less
    }

    return minutesPerInjury * numInjured * share;
  }

  /**
   * Calculate confidence score (0-1)
   * Based on consistency and data quality
   */
  calculateConfidence({ playerStats, adjustments, daysRest }) {
    let confidence = 0.75; // Start at 75% base confidence

    // Factor 1: Consistency (low std dev = higher confidence)
    if (playerStats.last10Games?.minutesStdDev) {
      const stdDev = playerStats.last10Games.minutesStdDev;
      if (stdDev < 3) {
        confidence += 0.15; // Very consistent
      } else if (stdDev < 5) {
        confidence += 0.08; // Moderately consistent
      } else if (stdDev > 8) {
        confidence -= 0.10; // High variance
      }
    }

    // Factor 2: Starter status (more predictable)
    if (playerStats.starterRate > 0.8) {
      confidence += 0.10;
    } else if (playerStats.starterRate < 0.2) {
      confidence -= 0.15; // Bench players less predictable
    }

    // Factor 3: Sample size
    if (playerStats.gamesPlayed < 5) {
      confidence -= 0.20; // Not enough data
    } else if (playerStats.gamesPlayed > 20) {
      confidence += 0.05; // Good sample size
    }

    // Factor 4: Recent DNPs lower confidence
    if (playerStats.dnpRate > 0.2) {
      confidence -= 0.15; // Player sometimes doesn't play
    }

    // Factor 5: Back-to-back situations are less predictable
    if (daysRest === 0) {
      confidence -= 0.05;
    }

    // Clamp between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Get confidence level label
   */
  getConfidenceLevel(confidence) {
    if (confidence >= this.confidenceLevels.high) return 'HIGH';
    if (confidence >= this.confidenceLevels.medium) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Check if player is currently injured
   * @param {Number} playerId - Player ID
   * @param {Number} teamId - Team ID
   * @param {Date} gameDate - Date of the game we're projecting for (optional)
   * @returns {Promise<Boolean>} True if player is injured
   */
  async isPlayerInjured(playerId, teamId, gameDate = null) {
    const query = {
      playerId,
      teamId,
      isActive: true,
      status: { $in: ['Out', 'Doubtful'] }
    };

    // If projecting for a specific game date, only look at injuries before that date
    if (gameDate) {
      query.gameDate = { $lte: gameDate };
    }

    // Get the most recent injury report for this player
    const injury = await NBAInjuryReport.findOne(query)
      .sort({ gameDate: -1, reportDate: -1 });

    return !!injury;
  }

  /**
   * Project minutes for entire team
   */
  async projectTeamMinutes(teamId, season, gameContext) {
    try {
      // Get all active players for the team
      const playerStats = await NBAPlayerSeasonStats.find({
        teamId,
        season,
        gamesPlayed: { $gt: 0 }
      }).sort({ minutesPerGame: -1 });

      // Get injured players for this specific game date
      // If gameDate is provided, only look at injuries from before that date
      const injuryQuery = {
        teamId,
        isActive: true,
        status: { $in: ['Out', 'Doubtful'] }
      };

      if (gameContext.gameDate) {
        injuryQuery.gameDate = { $lte: gameContext.gameDate };
      }

      // Get distinct player IDs (avoid counting same player multiple times)
      const injuredPlayerIds = await NBAInjuryReport.distinct('playerId', injuryQuery);

      // Project for each player
      const projections = [];
      for (const player of playerStats) {
        const projection = await this.projectMinutes({
          playerId: player.playerId,
          teamId,
          season,
          isHome: gameContext.isHome,
          daysRest: gameContext.daysRest,
          gameDate: gameContext.gameDate,
          injuredTeammates: injuredPlayerIds.filter(id => id !== player.playerId),
          opponentId: gameContext.opponentId
        });

        if (projection.success) {
          projections.push(projection);
        }
      }

      // Sort by projected minutes (highest first)
      projections.sort((a, b) => b.projectedMinutes - a.projectedMinutes);

      // Calculate total projected minutes
      const totalMinutes = projections
        .filter(p => p.status === 'ACTIVE')
        .reduce((sum, p) => sum + p.projectedMinutes, 0);

      return {
        success: true,
        teamId,
        season,
        gameContext,
        projections,
        summary: {
          totalProjectedMinutes: Math.round(totalMinutes),
          activePlayers: projections.filter(p => p.status === 'ACTIVE').length,
          injuredPlayers: projections.filter(p => p.status === 'OUT').length,
          averageConfidence: Math.round(
            projections.reduce((sum, p) => sum + p.confidence, 0) / projections.length * 100
          ) / 100
        }
      };

    } catch (error) {
      logger.error('Error projecting team minutes:', error);
      return {
        success: false,
        error: error.message,
        teamId
      };
    }
  }
}

module.exports = new MinutesProjectionEngine();
