# NBA Minutes Projection System

## Overview

This system collects historical NBA game data (2021-2024 seasons) to build a comprehensive minutes projection model. The goal is to accurately predict player minutes on a nightly basis based on:

- **Historical minutes patterns** (season avg, last 3/5/10 games)
- **Game context** (home/away, back-to-back, days rest)
- **Injury reports** (who's out, minutes redistribution)
- **Opponent matchups** (pace, defensive ratings)
- **Situational factors** (starter/bench role, recent trends)

---

## What's Included

### **Data Models** (`backend/models/`)
- `NBAGame.js` - Game schedules and metadata (extended existing model)
- `NBAPlayerGameLog.js` - Player minutes and box score stats per game
- `NBAPlayerSeasonStats.js` - Rolling averages and season statistics
- `NBAInjuryReport.js` - Historical and current injury data

### **Utilities** (`backend/utils/nba/`)
- `parseMinutes.js` - Parse NBA API's ISO 8601 duration format (PT36M34S � 36.57)
- `rateLimiter.js` - Rate limiting and retry logic for API calls
- `seasonHelper.js` - Season formatting, date ranges, back-to-back detection

### **Data Collection Scripts** (`backend/scripts/nba/`)
1. `scrape-historical-schedules.js` - Fetch all games from 2021-2024
2. `scrape-historical-boxscores.js` - Extract player minutes from box scores
3. `import-injury-excel.js` - Import your historical injury Excel data
4. `calculate-rolling-averages.js` - Compute last 3/5/10 game averages

---

## Prerequisites

### **1. MongoDB Storage**
You'll need to upgrade your MongoDB Atlas tier:
- **Current:** Free tier (512 MB)
- **Required:** M10 tier (10 GB) - **$57/month**
- **Estimated data size:** ~2 GB for 4 seasons

**To upgrade:**
1. Go to [MongoDB Atlas](https://cloud.mongodb.com/)
2. Select your cluster
3. Click "Edit Configuration"
4. Choose M10 tier
5. Apply changes

### **2. Dependencies**
Already installed in your `package.json`:
- `axios` - HTTP requests
- `mongoose` - MongoDB ORM
- `dotenv` - Environment variables
- `xlsx` - Excel file parsing (for injury import)

---

## Setup Instructions

### **Step 1: Pull Latest Code**
```bash
git pull origin main
```

### **Step 2: Install Dependencies** (if needed)
```bash
cd /path/to/supreme-broccoli
npm install
```

### **Step 3: Verify Environment**
Make sure your `.env` file has:
```env
MONGODB_URI=mongodb+srv://your-connection-string
```

---

## Data Collection Workflow

### **<� Complete Pipeline (Recommended)**

Run these scripts in order to collect all historical data:

#### **1. Scrape NBA Schedules (All Seasons)**
```bash
node backend/scripts/nba/scrape-historical-schedules.js
# Or scrape a specific season (including current 2025-26)
node backend/scripts/nba/scrape-historical-schedules.js --season=2025-26
```

**What it does:**
- Fetches games from specified seasons (default: 2021-25, or use --season=2025-26)
- Saves ~4,920 games to `NBAGame` collection
- Estimated time: **5-10 minutes**

**Output:**
```
=� Scraping NBA schedules for seasons: 2021-22, 2022-23, 2023-24, 2024-25

=� Processing 2021-22 season...
   Saved 1,230 games for 2021-22

=� Processing 2022-23 season...
   Saved 1,230 games for 2022-23

...

=� SCRAPING SUMMARY
Total games found:    4,920
Successfully saved:   4,920
Errors:               0
```

---


---

#### **2. Scrape Historical Box Scores (Player Minutes)**
```bash
node backend/scripts/nba/scrape-historical-boxscores.js
```

**What it does:**
- Fetches box scores for all final games
- Extracts player minutes (parses `PT36M34S` � `36.57`)
- Saves ~127,920 player game logs
- Auto-captures injury status (DNP, OUT, etc.)
- Estimated time: **2-3 hours** (rate limited to 2 req/sec)

**Output:**
```
=� Scraping NBA box scores for player minutes

[1/4920] Processing 0022100539 (NOP @ MIL) on 2022-01-01...
     Saved 26 player logs

[2/4920] Processing 0022100540 (SAS @ DET) on 2022-01-01...
     Saved 26 player logs

    =� Progress: 50/4920 games, 1,300 player logs

...

=� BOX SCORE SCRAPING SUMMARY
Games processed:      4,920
Player logs saved:    127,920
Errors:               0
```

**Resume if interrupted:**
```bash
node backend/scripts/nba/scrape-historical-boxscores.js --resume
```

**Scrape current season (2025-26) box scores:**
```bash
node backend/scripts/nba/scrape-historical-boxscores.js --season=2025-26
```
*Note: This will only process completed games. Run periodically throughout the season as more games finish.*

---

#### **3. Import Historical Injury Data (Your Excel File)**
```bash
node backend/scripts/nba/import-injury-excel.js /path/to/your/injuries.xlsx
```

**What it does:**
- Reads your Excel file (PLAYER, STATUS, REASON, TEAM, GAME, DATE)
- Matches player names to IDs from game logs
- Saves to `NBAInjuryReport` collection
- Estimated time: **1-2 minutes**

**Excel format expected:**
| PLAYER | STATUS | REASON | TEAM | GAME | DATE |
|--------|--------|--------|------|------|------|
| Achiuwa, Precious | Out | Injury/Illness - Left Hamstring; Strained | New York Knicks | NYK@BOS | 10/22/2024 |

**Output:**
```
=� Importing injury data from Excel file

=� Reading Excel file...
 Found 1,250 rows in Excel file

= Connecting to MongoDB...
 Connected to MongoDB

    Processed 100/1,250 rows...
    Processed 200/1,250 rows...

=� IMPORT SUMMARY
Total rows:           1,250
Successfully imported: 1,180
Skipped:              60
Errors:               10
```

---

#### **4. Calculate Rolling Averages**
```bash
node backend/scripts/nba/calculate-rolling-averages.js
```

**What it does:**
- Computes last 3/5/10/15/20 game averages for each player
- Calculates home/away, starter/bench splits
- Computes minutes distribution, consistency metrics
- Saves to `NBAPlayerSeasonStats` collection
- Estimated time: **10-15 minutes**

**Output:**
```
=� Calculating rolling averages and season statistics

=� Found 1,800 player-season combinations to process

[1/1800] Stephen Curry (2023-24)...
[2/1800] LeBron James (2023-24)...

    =� Progress: 50/1800 processed

...

=� ROLLING AVERAGES CALCULATION SUMMARY
Player-seasons processed: 1,800
Errors:                   0
```

---

## Single Season Options

### **Scrape Only 2023-24 Season** (Faster for testing)
```bash
# Schedule
node backend/scripts/nba/scrape-historical-schedules.js --season=2023-24

# Box scores
node backend/scripts/nba/scrape-historical-boxscores.js --season=2023-24

# Rolling averages
node backend/scripts/nba/calculate-rolling-averages.js --season=2023-24
```

### **Scrape Date Range**
```bash
node backend/scripts/nba/scrape-historical-schedules.js --from=2022-23 --to=2023-24
```

### **Limit Games (Testing)**
```bash
node backend/scripts/nba/scrape-historical-boxscores.js --limit=100
```

---

## Data Verification

### **Check Data Collection Progress**

**Connect to MongoDB:**
```bash
mongosh "your-mongodb-connection-string"
```

**Check counts:**
```javascript
use sports-data

// Games
db.nbagames.countDocuments()
// Expected: ~4,920 (all seasons) or ~1,230 (single season)

// Player game logs
db.nbaplayergamelogs.countDocuments()
// Expected: ~127,920 (all seasons)

// Season stats
db.nbaplayerseasonstats.countDocuments()
// Expected: ~1,800 player-seasons

// Injury reports
db.nbainjuryreports.countDocuments()
// Expected: ~50,000+ (from box scores + Excel import)
```

**Sample queries:**
```javascript
// Stephen Curry's 2023-24 game logs
db.nbaplayergamelogs.find({
  playerId: 201939,
  season: "2023-24"
}).sort({ gameDate: -1 }).limit(5)

// Last 10 games minutes for LeBron
db.nbaplayergamelogs.find({
  playerId: 2544,
  played: true
}).sort({ gameDate: -1 }).limit(10).forEach(g => {
  print(g.gameDate + ": " + g.minutes + " min")
})

// Season stats for all Lakers
db.nbaplayerseasonstats.find({
  teamTricode: "LAL",
  season: "2023-24"
}).sort({ minutesPerGame: -1 })
```

---

## Data Structure Reference

### **NBAPlayerGameLog** (Most Important!)
```javascript
{
  gameLogId: "0022400919_201939",
  gameId: "0022400919",
  playerId: 201939,
  playerName: "Stephen Curry",
  teamTricode: "GSW",
  gameDate: ISODate("2025-03-08"),
  season: "2024-25",

  minutes: 33.45,          // <� TARGET VARIABLE
  minutesRaw: "PT33M26.99S",

  isStarter: true,
  isBackToBack: false,
  daysRest: 2,

  points: 32,
  assists: 4,
  rebounds: 3,
  // ... more stats

  teammatesOut: [
    { playerId: 1630228, playerName: "Jonathan Kuminga", averageMinutes: 0 }
  ]
}
```

### **NBAPlayerSeasonStats** (For Projections)
```javascript
{
  statsId: "201939_2023-24",
  playerId: 201939,
  playerName: "Stephen Curry",
  season: "2023-24",

  minutesPerGame: 34.2,

  last3Games: {
    minutes: 35.8,
    minutesStdDev: 2.1
  },

  last10Games: {
    minutes: 33.7
  },

  homeSplits: { minutes: 34.8 },
  awaySplits: { minutes: 33.6 },

  backToBackSplits: { minutes: 31.2 },
  restedSplits: { minutes: 35.1 }
}
```

---

## Troubleshooting

### **Rate Limit Errors**
If you see `429 Too Many Requests`:
```javascript
// Edit rateLimiter.js
const rateLimiter = new RateLimiter(1); // Slow down to 1 req/sec
```

### **MongoDB Connection Timeout**
```bash
# Increase timeout in .env
MONGODB_TIMEOUT=30000
```

### **Out of Memory (Large Datasets)**
```bash
# Increase Node memory limit
node --max-old-space-size=4096 backend/scripts/nba/scrape-historical-boxscores.js
```

### **Player Name Not Found (Injury Import)**
- Check Excel file formatting
- Ensure names match "Last, First" format
- Script will skip unmatched players and log warnings

---

## Next Steps

After data collection is complete:

1. ** Verify data** using MongoDB queries above
2. **>� Build baseline algorithm** (weighted averages)
3. **=� Backtest on 2023-24 season** (measure MAE)
4. **> Train ML model** (XGBoost/LightGBM in Python)
5. **=� Build API endpoints** for daily projections
6. **=� Build React frontend** to display projections

---

## Estimated Timeline

| Task | Time |
|------|------|
| Scrape schedules (all seasons) | 5-10 min |
| Scrape box scores (all seasons) | 2-3 hours |
| Import injury Excel | 1-2 min |
| Calculate rolling averages | 10-15 min |
| **Total data collection** | **~3 hours** |

**Run overnight or during work hours - scripts are fully automated!**

---

## Data Sources

### **APIs Used**
- **Schedules (All Seasons):** `https://data.nba.com/data/10s/v2015/json/mobile_teams/nba/{year}/league/00_full_schedule.json`

- **Box Scores:** `https://cdn.nba.com/static/json/liveData/boxscore/boxscore_{gameId}.json`
- **Play-by-Play:** `https://cdn.nba.com/static/json/liveData/playbyplay/playbyplay_{gameId}.json` (Phase 2)

All NBA APIs are free and publicly accessible.

---

## Support

If you encounter issues:
1. Check MongoDB connection string in `.env`
2. Verify MongoDB tier is M10 (10GB)
3. Check script output for specific error messages
4. Use `--resume` flag to continue interrupted scrapes

---

## Storage Estimates

| Collection | Documents | Size |
|------------|-----------|------|
| NBAGame | ~4,920 | ~10 MB |
| NBAPlayerGameLog | ~127,920 | ~380 MB |
| NBAPlayerSeasonStats | ~1,800 | ~9 MB |
| NBAInjuryReport | ~50,000 | ~100 MB |
| **Total** | **~184,640** | **~500 MB** |

**MongoDB M10 (10GB) tier is sufficient for this data.**

---

**Ready to start? Run the first script:**
```bash
node backend/scripts/nba/scrape-historical-schedules.js
```

Good luck! <�=�
