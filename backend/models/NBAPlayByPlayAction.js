const mongoose = require('mongoose');
const logger = require('../utils/logger');

const editHistorySchema = new mongoose.Schema({
  editedAt: {
    type: Date,
    required: true
  },
  oldDescription: String,
  newDescription: String,
  oldData: mongoose.Schema.Types.Mixed,
  newData: mongoose.Schema.Types.Mixed,
  timeDiff: Number, // seconds between timeActual and edited
  fieldsChanged: [String] // array of field names that changed
}, {
  _id: false,
  timestamps: false
});

const nbaPlayByPlayActionSchema = new mongoose.Schema({
  gameId: {
    type: String,
    required: true,
    index: true
  },
  actionNumber: {
    type: Number,
    required: true
  },
  clock: String,
  timeActual: Date,
  edited: Date,
  period: {
    type: Number,
    required: true,
    index: true
  },
  periodType: String,
  teamId: Number,
  teamTricode: String,
  actionType: {
    type: String,
    required: true
  },
  subType: String,
  descriptor: String,
  qualifiers: [String],
  personId: Number,
  playerName: String,
  playerNameI: String,
  x: Number,
  y: Number,
  area: String,
  areaDetail: String,
  side: String,
  shotDistance: Number,
  possession: Number,
  scoreHome: String,
  scoreAway: String,
  officialId: Number,
  orderNumber: Number,
  isTargetScoreLastPeriod: Boolean,
  xLegacy: Number,
  yLegacy: Number,
  isFieldGoal: Number,
  shotResult: String,
  pointsTotal: Number,
  description: {
    type: String,
    required: true
  },
  personIdsFilter: [Number],
  foulPersonalTotal: Number,
  foulTechnicalTotal: Number,
  foulDrawnPlayerName: String,
  foulDrawnPersonId: Number,
  jumpBallRecoveredName: String,
  jumpBallRecoverdPersonId: Number,
  jumpBallWonPlayerName: String,
  jumpBallWonPersonId: Number,
  jumpBallLostPlayerName: String,
  jumpBallLostPersonId: Number,
  assistPlayerNameInitial: String,
  assistPersonId: Number,
  assistTotal: Number,
  blockPlayerName: String,
  blockPersonId: Number,
  stealPlayerName: String,
  stealPersonId: Number,
  turnoverTotal: Number,
  reboundTotal: Number,
  reboundDefensiveTotal: Number,
  reboundOffensiveTotal: Number,
  // Edit tracking
  initialEditedTimestamp: Date, // The 'edited' value when we FIRST saw this action
  editHistory: [editHistorySchema],
  hasSignificantEdit: {
    type: Boolean,
    default: false,
    index: true
  },
  lastEditTimeDiff: Number, // Most recent time diff in seconds
  editCount: {
    type: Number,
    default: 0
  }, // Track how many times this action has been edited
  // Deletion tracking
  isDeleted: {
    type: Boolean,
    default: false,
    index: true
  },
  deletedAt: Date,
  // Review tracking for live monitoring
  reviewStatus: {
    type: String,
    enum: ['unreviewed', 'approved', 'flagged'],
    default: 'unreviewed',
    index: true
  },
  reviewedAt: Date,
  reviewNote: String,
  reviewTags: [String], // Quick tags like "Check video", "Timing off", "Wrong player"
  flagPriority: {
    type: String,
    enum: ['minor', 'major'],
    default: 'minor'
  }, // Yellow (minor) or Red (major) flag
  wasReEditedAfterApproval: {
    type: Boolean,
    default: false
  }, // Track if approved play was edited again
  rawData: mongoose.Schema.Types.Mixed // Store full API response for reference
}, {
  timestamps: true
});

// Compound index for finding actions by game and action number
nbaPlayByPlayActionSchema.index({ gameId: 1, actionNumber: 1 }, { unique: true });

// Index for finding edited actions
nbaPlayByPlayActionSchema.index({ gameId: 1, hasSignificantEdit: 1 });

// Index for finding actions by period
nbaPlayByPlayActionSchema.index({ gameId: 1, period: 1, orderNumber: 1 });

// Index for review queries (finding unreviewed edited actions)
nbaPlayByPlayActionSchema.index({ gameId: 1, reviewStatus: 1, hasSignificantEdit: 1 });

// Method to calculate time difference between actual and edited
nbaPlayByPlayActionSchema.methods.calculateEditTimeDiff = function() {
  if (!this.timeActual || !this.edited) {
    return 0;
  }
  const actual = new Date(this.timeActual);
  const edit = new Date(this.edited);
  return Math.abs((edit - actual) / 1000); // Return seconds
};

// Helper method to check if description change is only a cascading assist/stat number
// Returns true if the only change is a number in parentheses (e.g., "Smith Assist (2)" -> "Smith Assist (1)")
nbaPlayByPlayActionSchema.methods.isCascadingStatChange = function(oldDesc, newDesc) {
  if (!oldDesc || !newDesc || oldDesc === newDesc) {
    return false;
  }

  // Remove numbers in parentheses at the end of descriptions
  // Examples: "Smith Assist (2)" -> "Smith Assist", "Jones 3PT (5)" -> "Jones 3PT"
  const removeStatNumbers = (desc) => {
    return desc.replace(/\s*\(\d+\)$/g, '').trim();
  };

  const normalizedOld = removeStatNumbers(oldDesc);
  const normalizedNew = removeStatNumbers(newDesc);

  // If descriptions are identical after removing stat numbers, this is just cascading
  return normalizedOld === normalizedNew;
};

// Method to check if edit is significant
// NEW LOGIC (per user request):
//   1) Must have old data (we've seen this action before)
//   2) >= 20 seconds between play time and edit time
//   3) Description must have changed
//   4) NOT a substitution (we don't care about sub edits)
//   5) NOT a cascading stat change (e.g., assist numbers updating)
nbaPlayByPlayActionSchema.methods.isEditSignificant = function(oldData, newData) {
  // Must have old data - we only flag changes we actually observe
  if (!oldData || !oldData.description) {
    return false;
  }

  // IGNORE ALL SUBSTITUTIONS - we don't care about these
  if (newData.actionType === 'substitution' || oldData.actionType === 'substitution') {
    return false;
  }

  // Must meet 20 second time threshold
  const timeDiff = this.calculateEditTimeDiff();
  if (timeDiff < 20) {
    return false;
  }

  // Description must have changed
  if (oldData.description === newData.description) {
    return false;
  }

  // Ignore cascading stat changes (e.g., assist numbers updating after earlier edit)
  if (this.isCascadingStatChange(oldData.description, newData.description)) {
    logger.debug(`⏭️  Action ${this.actionNumber}: Cascading stat change, ignoring ("${oldData.description}" -> "${newData.description}")`);
    return false;
  }

  // This is a real, significant edit
  return true;
};

// Method to add edit history entry
nbaPlayByPlayActionSchema.methods.addEditHistory = function(oldData, newData, fieldsChanged) {
  const timeDiff = this.calculateEditTimeDiff();

  this.editHistory.push({
    editedAt: new Date(),
    oldDescription: oldData.description,
    newDescription: newData.description,
    oldData: oldData,
    newData: newData,
    timeDiff: timeDiff,
    fieldsChanged: fieldsChanged
  });

  this.lastEditTimeDiff = timeDiff;
  this.hasSignificantEdit = this.isEditSignificant(oldData, newData);
};

// Method to update from API data and detect changes
nbaPlayByPlayActionSchema.methods.updateFromApiData = function(apiAction) {
  // Track if this is the first time seeing this action
  const isFirstSeen = !this.initialEditedTimestamp;

  // Store current state before updating
  const oldData = {
    description: this.description,
    clock: this.clock,
    scoreHome: this.scoreHome,
    scoreAway: this.scoreAway,
    actionType: this.actionType,
    subType: this.subType,
    personId: this.personId,
    shotResult: this.shotResult,
    edited: this.edited
  };

  const fieldsChanged = [];

  // Update all fields from API
  this.clock = apiAction.clock;
  this.timeActual = apiAction.timeActual ? new Date(apiAction.timeActual) : null;
  this.edited = apiAction.edited ? new Date(apiAction.edited) : null;
  this.period = apiAction.period;
  this.periodType = apiAction.periodType;
  this.teamId = apiAction.teamId;
  this.teamTricode = apiAction.teamTricode;
  this.actionType = apiAction.actionType;
  this.subType = apiAction.subType;
  this.descriptor = apiAction.descriptor;
  this.qualifiers = apiAction.qualifiers || [];
  this.personId = apiAction.personId;
  this.playerName = apiAction.playerName;
  this.playerNameI = apiAction.playerNameI;
  this.x = apiAction.x;
  this.y = apiAction.y;
  this.area = apiAction.area;
  this.areaDetail = apiAction.areaDetail;
  this.side = apiAction.side;
  this.shotDistance = apiAction.shotDistance;
  this.possession = apiAction.possession;
  this.scoreHome = apiAction.scoreHome;
  this.scoreAway = apiAction.scoreAway;
  this.officialId = apiAction.officialId;
  this.orderNumber = apiAction.orderNumber;
  this.isTargetScoreLastPeriod = apiAction.isTargetScoreLastPeriod;
  this.xLegacy = apiAction.xLegacy;
  this.yLegacy = apiAction.yLegacy;
  this.isFieldGoal = apiAction.isFieldGoal;
  this.shotResult = apiAction.shotResult;
  this.pointsTotal = apiAction.pointsTotal;
  this.description = apiAction.description;
  this.personIdsFilter = apiAction.personIdsFilter || [];

  // Additional fields
  this.foulPersonalTotal = apiAction.foulPersonalTotal;
  this.foulTechnicalTotal = apiAction.foulTechnicalTotal;
  this.foulDrawnPlayerName = apiAction.foulDrawnPlayerName;
  this.foulDrawnPersonId = apiAction.foulDrawnPersonId;
  this.jumpBallRecoveredName = apiAction.jumpBallRecoveredName;
  this.jumpBallRecoverdPersonId = apiAction.jumpBallRecoverdPersonId;
  this.jumpBallWonPlayerName = apiAction.jumpBallWonPlayerName;
  this.jumpBallWonPersonId = apiAction.jumpBallWonPersonId;
  this.jumpBallLostPlayerName = apiAction.jumpBallLostPlayerName;
  this.jumpBallLostPersonId = apiAction.jumpBallLostPersonId;
  this.assistPlayerNameInitial = apiAction.assistPlayerNameInitial;
  this.assistPersonId = apiAction.assistPersonId;
  this.assistTotal = apiAction.assistTotal;
  this.blockPlayerName = apiAction.blockPlayerName;
  this.blockPersonId = apiAction.blockPersonId;
  this.stealPlayerName = apiAction.stealPlayerName;
  this.stealPersonId = apiAction.stealPersonId;
  this.turnoverTotal = apiAction.turnoverTotal;
  this.reboundTotal = apiAction.reboundTotal;
  this.reboundDefensiveTotal = apiAction.reboundDefensiveTotal;
  this.reboundOffensiveTotal = apiAction.reboundOffensiveTotal;

  this.rawData = apiAction;

  // FIRST TIME SEEING THIS ACTION
  if (isFirstSeen) {
    // Save the initial edited timestamp - this is our baseline
    this.initialEditedTimestamp = this.edited;
    // Don't flag anything on first sight
    return false;
  }

  // EXISTING ACTION - Check if it was edited AFTER we started monitoring
  const initialEditTime = this.initialEditedTimestamp ? new Date(this.initialEditedTimestamp).getTime() : 0;
  const currentEditTime = this.edited ? new Date(this.edited).getTime() : 0;

  // If edited timestamp changed, NBA edited it after we started monitoring
  if (currentEditTime !== initialEditTime && currentEditTime > initialEditTime) {
    // FIRST: Check if this meets our minimum time threshold (20 seconds)
    const timeDiffSeconds = this.calculateEditTimeDiff();
    if (timeDiffSeconds < 20) {
      // Edit happened too quickly (< 20s), ignore it
      logger.debug(`⏭️  Action ${apiAction.actionNumber}: Edit too quick (${timeDiffSeconds.toFixed(1)}s), ignoring`);
      return false;
    }

    // Detect what changed
    if (oldData.description !== this.description) fieldsChanged.push('description');
    if (oldData.clock !== this.clock) fieldsChanged.push('clock');
    if (oldData.scoreHome !== this.scoreHome) fieldsChanged.push('scoreHome');
    if (oldData.scoreAway !== this.scoreAway) fieldsChanged.push('scoreAway');
    if (oldData.actionType !== this.actionType) fieldsChanged.push('actionType');
    if (oldData.subType !== this.subType) fieldsChanged.push('subType');
    if (oldData.personId !== this.personId) fieldsChanged.push('personId');
    if (oldData.shotResult !== this.shotResult) fieldsChanged.push('shotResult');
    fieldsChanged.push('edited');

    // Create newData object for comparison
    const newData = {
      description: this.description,
      clock: this.clock,
      scoreHome: this.scoreHome,
      scoreAway: this.scoreAway,
      actionType: this.actionType,
      subType: this.subType,
      personId: this.personId,
      shotResult: this.shotResult,
      edited: this.edited
    };

    // Check if this is a significant edit
    if (fieldsChanged.length > 0 && this.isEditSignificant(oldData, newData)) {
      this.addEditHistory(oldData, newData, fieldsChanged);

      // Increment edit count
      this.editCount = (this.editCount || 0) + 1;

      // If this was previously approved, flag it for re-review
      if (this.reviewStatus === 'approved') {
        this.wasReEditedAfterApproval = true;
        this.reviewStatus = 'unreviewed';
      }

      logger.debug(`🚨 Action ${apiAction.actionNumber}: SIGNIFICANT EDIT detected (${timeDiffSeconds.toFixed(1)}s): "${oldData.description}" -> "${this.description}"`);
      return true;
    }

    // Changes detected but not significant (e.g., only clock/score changed, or description unchanged)
    if (fieldsChanged.length > 0) {
      logger.debug(`⏭️  Action ${apiAction.actionNumber}: Changes detected but not significant - fields: [${fieldsChanged.join(', ')}]`);
    }
  }

  return false;
};

const NBAPlayByPlayAction = mongoose.model('NBAPlayByPlayAction', nbaPlayByPlayActionSchema);

module.exports = NBAPlayByPlayAction;
