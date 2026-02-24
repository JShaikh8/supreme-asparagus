const mongoose = require('mongoose');

const nbaGameSchema = new mongoose.Schema({
  gameId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  gameDate: {
    type: Date,
    required: true,
    index: true
  },
  gameCode: String,
  gameStatus: {
    type: Number,
    required: true,
    index: true
  },
  gameStatusText: String,
  gameSequence: Number,
  gameDateTimeEst: Date,
  gameDateTimeUTC: Date,
  gameDateEst: String,
  gameTimeEst: String,
  day: String,
  monthNum: Number,
  weekNumber: Number,
  gameLabel: String,
  gameSubLabel: String,
  seriesText: String,
  arenaName: String,
  arenaCity: String,
  arenaState: String,
  isNeutral: Boolean,
  homeTeam: {
    teamId: Number,
    teamName: String,
    teamCity: String,
    teamTricode: String,
    teamSlug: String,
    wins: Number,
    losses: Number,
    score: Number,
    seed: Number
  },
  awayTeam: {
    teamId: Number,
    teamName: String,
    teamCity: String,
    teamTricode: String,
    teamSlug: String,
    wins: Number,
    losses: Number,
    score: Number,
    seed: Number
  },
  pointsLeaders: [{
    personId: Number,
    firstName: String,
    lastName: String,
    teamId: Number,
    teamCity: String,
    teamName: String,
    teamTricode: String,
    points: Number
  }],
  // Live game data from boxscore
  period: Number,
  periodType: String,
  gameClock: String,
  attendance: Number,
  sellout: String,
  officials: [{
    personId: Number,
    name: String,
    nameI: String,
    firstName: String,
    familyName: String,
    jerseyNum: String,
    assignment: String
  }],
  // Monitoring fields
  isMonitoring: {
    type: Boolean,
    default: false,
    index: true
  },
  isRefreshing: {
    type: Boolean,
    default: false,
    index: true
  },
  monitoringStartedAt: Date,
  gameFinishedAt: Date,
  lastPolledAt: Date,
  pollCount: {
    type: Number,
    default: 0
  },

  // Minutes projection fields
  season: {
    type: String,
    index: true
    // Format: "2023-24"
  },

  // Derived fields for analysis
  isHomeBackToBack: {
    type: Boolean,
    default: false
  },

  isAwayBackToBack: {
    type: Boolean,
    default: false
  },

  homeDaysRest: Number,
  awayDaysRest: Number,

  // Box score data processed flag
  boxscoreProcessed: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true
});

// Index for finding today's games
nbaGameSchema.index({ gameDate: 1, gameStatus: 1 });

// Index for finding monitored games
nbaGameSchema.index({ isMonitoring: 1, gameStatus: 1 });

// Method to parse ISO 8601 duration to readable game clock
nbaGameSchema.methods.parseGameClock = function(isoDuration) {
  if (!isoDuration) return '';

  // Parse PT01M51.00S format
  const match = isoDuration.match(/PT(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?/);
  if (!match) return isoDuration; // Return as-is if can't parse

  const minutes = parseInt(match[1] || 0);
  const seconds = Math.floor(parseFloat(match[2] || 0));

  // Format as M:SS (e.g., "1:51" or "10:23")
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

// Method to check if monitoring should stop (20 minutes after final)
nbaGameSchema.methods.shouldStopMonitoring = function() {
  if (this.gameStatus === 3 && this.gameFinishedAt) {
    const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000);
    return this.gameFinishedAt < twentyMinutesAgo;
  }
  return false;
};

// Method to update game from API data
nbaGameSchema.methods.updateFromApiData = function(gameData) {
  this.gameCode = gameData.gameCode;
  this.gameStatus = gameData.gameStatus;
  this.gameStatusText = gameData.gameStatusText;
  this.gameSequence = gameData.gameSequence;

  if (gameData.gameDateTimeEst) {
    this.gameDateTimeEst = new Date(gameData.gameDateTimeEst);
  }
  if (gameData.gameDateTimeUTC) {
    this.gameDateTimeUTC = new Date(gameData.gameDateTimeUTC);
  }

  this.gameDateEst = gameData.gameDateEst;
  this.gameTimeEst = gameData.gameTimeEst;
  this.day = gameData.day;
  this.monthNum = gameData.monthNum;
  this.weekNumber = gameData.weekNumber;
  this.gameLabel = gameData.gameLabel;
  this.gameSubLabel = gameData.gameSubLabel;
  this.seriesText = gameData.seriesText;
  this.arenaName = gameData.arenaName;
  this.arenaCity = gameData.arenaCity;
  this.arenaState = gameData.arenaState;
  this.isNeutral = gameData.isNeutral;

  // Update team data
  if (gameData.homeTeam) {
    this.homeTeam = {
      teamId: gameData.homeTeam.teamId,
      teamName: gameData.homeTeam.teamName,
      teamCity: gameData.homeTeam.teamCity,
      teamTricode: gameData.homeTeam.teamTricode,
      teamSlug: gameData.homeTeam.teamSlug,
      wins: gameData.homeTeam.wins,
      losses: gameData.homeTeam.losses,
      score: gameData.homeTeam.score,
      seed: gameData.homeTeam.seed
    };
  }

  if (gameData.awayTeam) {
    this.awayTeam = {
      teamId: gameData.awayTeam.teamId,
      teamName: gameData.awayTeam.teamName,
      teamCity: gameData.awayTeam.teamCity,
      teamTricode: gameData.awayTeam.teamTricode,
      teamSlug: gameData.awayTeam.teamSlug,
      wins: gameData.awayTeam.wins,
      losses: gameData.awayTeam.losses,
      score: gameData.awayTeam.score,
      seed: gameData.awayTeam.seed
    };
  }

  if (gameData.pointsLeaders) {
    this.pointsLeaders = gameData.pointsLeaders;
  }

  // Track when game goes final
  if (this.gameStatus === 3 && !this.gameFinishedAt) {
    this.gameFinishedAt = new Date();
  }
};

// Method to update game from boxscore data
nbaGameSchema.methods.updateFromBoxscore = function(boxscoreData) {
  if (!boxscoreData || !boxscoreData.game) {
    return;
  }

  const game = boxscoreData.game;

  // Update period and game clock
  if (game.period !== undefined) {
    this.period = game.period;
  }
  if (game.periodType) {
    this.periodType = game.periodType;
  }
  if (game.gameClock) {
    // Parse ISO 8601 duration format (PT01M51.00S) to readable format (1:51)
    this.gameClock = this.parseGameClock(game.gameClock);
  }

  // Update game status
  if (game.gameStatus !== undefined) {
    this.gameStatus = game.gameStatus;
  }
  if (game.gameStatusText) {
    this.gameStatusText = game.gameStatusText;
  }

  // Update scores from boxscore (more accurate than schedule)
  if (game.homeTeam && game.homeTeam.score !== undefined) {
    if (!this.homeTeam) this.homeTeam = {};
    this.homeTeam.score = game.homeTeam.score;
  }
  if (game.awayTeam && game.awayTeam.score !== undefined) {
    if (!this.awayTeam) this.awayTeam = {};
    this.awayTeam.score = game.awayTeam.score;
  }

  // Update arena info
  if (game.arena) {
    if (game.arena.arenaName) this.arenaName = game.arena.arenaName;
    if (game.arena.arenaCity) this.arenaCity = game.arena.arenaCity;
    if (game.arena.arenaState) this.arenaState = game.arena.arenaState;
    if (game.arena.arenaAttendance !== undefined) {
      this.attendance = game.arena.arenaAttendance;
    }
  }

  // Update officials
  if (game.officials && Array.isArray(game.officials)) {
    this.officials = game.officials.map(official => ({
      personId: official.personId,
      name: official.name,
      nameI: official.nameI,
      firstName: official.firstName,
      familyName: official.familyName,
      jerseyNum: official.jerseyNum,
      assignment: official.assignment
    }));
  }

  // Track when game goes final
  if (this.gameStatus === 3 && !this.gameFinishedAt) {
    this.gameFinishedAt = new Date();
  }
};

const NBAGame = mongoose.model('NBAGame', nbaGameSchema);

module.exports = NBAGame;
