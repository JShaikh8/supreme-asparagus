# SportsData Pro - Backend API

Express.js REST API server for the SportsData Pro platform.

## Table of Contents

- [Quick Start](#quick-start)
- [Architecture](#architecture)
- [API Routes](#api-routes)
- [Models](#models)
- [Services](#services)
- [Modules (Scrapers)](#modules-scrapers)
- [Middleware](#middleware)
- [Constants](#constants)
- [Error Handling](#error-handling)

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration

# Development mode (with hot reload)
npm run dev

# Production mode
npm start
```

## Architecture

```
backend/
├── server.js               # Application entry point
├── routes/                 # API endpoint handlers
├── models/                 # Mongoose schemas
├── services/               # Business logic layer
├── modules/                # Data scraper modules
├── middleware/             # Express middleware
├── constants/              # Centralized constants
├── utils/                  # Utility functions
└── uploads/                # Temporary file storage
```

### Request Flow

```
Request → Middleware (validation) → Route Handler → Service → Model → MongoDB
                                                  ↓
                                            External APIs
                                         (Oracle, Stats API)
```

---

## API Routes

### Teams (`/api/teams`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| `GET` | `/` | List all teams | - |
| `GET` | `/:teamId` | Get team by ID | - |
| `POST` | `/` | Create new team | - |
| `PUT` | `/:teamId` | Update team | - |
| `DELETE` | `/:teamId` | Delete team | - |

**Query Parameters (GET /):**
- `league` - Filter by league (NCAA, NBA, MLB, NFL)
- `conference` - Filter by conference
- `active` - Filter by active status (true/false)

**Request Body (POST/PUT):**
```json
{
  "teamId": "NCAA_NORTHWESTERN",
  "teamName": "Northwestern Wildcats",
  "league": "NCAA",
  "baseUrl": "https://nusports.com",
  "conference": "Big Ten",
  "division": "West",
  "active": true,
  "scrapeType": "sidearm"
}
```

---

### Fetch (`/api/fetch`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/` | Fetch data for a team/module |
| `POST` | `/bulk` | Bulk fetch for multiple teams |
| `GET` | `/modules` | List available scraper modules |

**Request Body (POST /):**
```json
{
  "teamId": "NCAA_NORTHWESTERN",
  "moduleId": "ncaa-football-roster",
  "options": {
    "forceRefresh": false,
    "createBaseline": false
  }
}
```

**Request Body (POST /bulk):**
```json
{
  "teamIds": ["NCAA_NORTHWESTERN", "NCAA_OHIO_STATE"],
  "moduleId": "ncaa-football-roster",
  "concurrency": 3,
  "delayMs": 2000
}
```

---

### Comparison (`/api/comparison`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/` | Run comparison |
| `GET` | `/results` | Get comparison results |
| `GET` | `/results/:id` | Get specific result |
| `DELETE` | `/results/:id` | Delete result |

**Request Body (POST /):**
```json
{
  "teamId": "NCAA_NORTHWESTERN",
  "moduleId": "ncaa-football-roster",
  "source": "baseline"
}
```

**Comparison Sources:**
- `baseline` - Compare against saved baseline (always available)
- `oracle` - Compare against Oracle database (internal only)
- `api` - Compare against Stats API (internal only)

---

### Data (`/api/data`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Get scraped data with filters |
| `GET` | `/stats` | Get data statistics |
| `GET` | `/:teamId/:moduleId` | Get specific team/module data |

**Query Parameters:**
- `teamId` - Filter by team
- `moduleId` - Filter by module
- `dataType` - Filter by type (roster, schedule, stats)
- `limit` - Max results (default: 100)

---

### Mappings (`/api/mappings`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | List all mappings |
| `GET` | `/:id` | Get mapping by ID |
| `POST` | `/` | Create mapping |
| `PUT` | `/:id` | Update mapping |
| `DELETE` | `/:id` | Delete mapping |
| `POST` | `/apply` | Apply mappings to data |

**Mapping Types:**
- `equivalence` - Fields are equivalent (e.g., "firstName" = "first_name")
- `tolerance` - Numeric tolerance (e.g., height within 1 inch)
- `transformation` - Value transformation (e.g., uppercase)

---

### Search (`/api/search`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Full search across all data |
| `GET` | `/quick` | Quick search for autocomplete |

**Query Parameters (GET /):**
- `q` - Search query (required, 2-100 chars)
- `type` - Filter type (all, teams, players, schedule)
- `limit` - Max results (default: 20, max: 50)

**Response:**
```json
{
  "success": true,
  "query": "Northwestern",
  "teams": [...],
  "players": [...],
  "schedule": [...],
  "totalResults": 15
}
```

---

### Settings (`/api/settings`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Get current settings |
| `PUT` | `/` | Update settings |
| `POST` | `/reset` | Reset to defaults |

**Settings Schema:**
```json
{
  "requestTimeout": 30,
  "maxRetryAttempts": 3,
  "autoRefreshInterval": 60,
  "dataRetentionPeriod": 30,
  "bulkFetchConcurrency": 3,
  "bulkFetchDelay": 2000
}
```

---

### System (`/api/system`) - Internal Only

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check with MongoDB ping |
| `GET` | `/stats` | Database statistics (collections, sizes) |
| `GET` | `/connections` | Connection status (MongoDB, Oracle, Stats API) |
| `GET` | `/dashboard` | Visual health dashboard (HTML) |
| `GET` | `/oracle/test` | Test Oracle connection |

> **Note:** These routes require `ENABLE_INTERNAL_FEATURES=true`

**Health Dashboard:** The `/api/system/dashboard` endpoint provides a real-time visual dashboard showing:
- System status and uptime
- Memory usage
- MongoDB response time
- Database metrics and collection sizes
- Connection status for all services

---

### NBA (`/api/nba`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/schedule` | Get NBA schedule |
| `GET` | `/games/:gameId` | Get game details |
| `GET` | `/games/:gameId/boxscore` | Get boxscore |
| `GET` | `/games/:gameId/playbyplay` | Get play-by-play |
| `GET` | `/injuries` | Get injury reports |
| `POST` | `/fetch/schedule` | Fetch schedule from NBA API |
| `POST` | `/fetch/boxscore/:gameId` | Fetch boxscore |

**NBA Comparison Support:** NBA schedule and boxscore data can be compared against Oracle using the standard comparison endpoints with `moduleId: "nba-schedule"` or `moduleId: "nba-boxscore-fetch"`.

---

### Data Management (`/api/data-management`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/export` | Export all data |
| `POST` | `/import` | Import data from file |
| `POST` | `/clear-cache` | Clear old data |
| `POST` | `/danger-zone/reset-database` | Reset database |
| `POST` | `/danger-zone/delete-all-teams` | Delete all teams |
| `POST` | `/danger-zone/delete-all-data` | Delete all scraped data |

> **Note:** Danger zone operations require `DANGER_ZONE_PASSWORD`

---

### Public API (`/api/v1`)

Rate-limited (100 req/hour) public API with export support.

**API Documentation:**
- `/api/v1/docs` - Interactive HTML documentation
- `/api/v1/swagger` - Swagger UI with live testing
- `/api/v1/openapi.json` - Raw OpenAPI 3.0 specification

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/docs` | Interactive API documentation |
| `GET` | `/teams` | List teams |
| `GET` | `/teams/:teamId` | Get team |
| `GET` | `/teams/:teamId/roster` | Get roster |
| `GET` | `/teams/:teamId/stats` | Get stats |
| `GET` | `/teams/:teamId/schedule` | Get schedule |
| `GET` | `/conferences/:conference/roster` | Conference rosters |
| `GET` | `/conferences/:conference/stats` | Conference stats |
| `GET` | `/comparisons` | List comparisons |
| `GET` | `/comparisons/:id` | Get comparison |
| `GET` | `/stats` | Data summary |

**Export Format:** Add `?format=csv` or `?format=xlsx` to any endpoint.

---

## Models

### Team

```javascript
{
  teamId: String,          // Unique identifier (e.g., "NCAA_NORTHWESTERN")
  teamName: String,        // Display name
  teamNickname: String,    // Mascot/nickname
  teamAbbrev: String,      // Abbreviation
  league: String,          // NCAA, NBA, MLB, NFL
  conference: String,
  division: String,
  baseUrl: String,         // Team website URL
  logoUrl: String,
  active: Boolean,
  scrapeType: String,      // sidearm, presto, custom, mlb, nba
  sportsConfig: [{         // Per-sport configuration
    sport: String,
    rosterUrl: String,
    scheduleUrl: String,
    statsUrl: String
  }],
  statsId: String,         // Stats.com ID
  mlbId: String,           // MLB ID
  nbaTeamId: String        // NBA ID
}
```

### ScrapedData

```javascript
{
  teamId: String,
  moduleId: String,
  dataType: String,        // roster, schedule, stats
  sport: String,
  league: String,
  data: Mixed,             // Actual scraped data
  metadata: {
    source: String,
    scrapedAt: Date,
    recordCount: Number
  },
  cacheExpiry: Date
}
```

### ComparisonResult

```javascript
{
  teamId: String,
  moduleId: String,
  source: String,          // baseline, oracle, api
  sourceData: Array,
  targetData: Array,
  matches: Array,
  discrepancies: Array,
  matchCount: Number,
  discrepancyCount: Number,
  unmatchedSource: Array,
  unmatchedTarget: Array
}
```

### DataMapping

```javascript
{
  name: String,
  sourceField: String,
  targetField: String,
  mappingType: String,     // equivalence, tolerance, transformation
  tolerance: Number,
  transformation: String,
  bidirectional: Boolean,
  active: Boolean
}
```

### AppSettings

```javascript
{
  requestTimeout: Number,       // Default: 30 seconds
  maxRetryAttempts: Number,     // Default: 3
  autoRefreshInterval: Number,  // Default: 60 minutes
  dataRetentionPeriod: Number,  // Default: 30 days
  bulkFetchConcurrency: Number, // Default: 3
  bulkFetchDelay: Number        // Default: 2000ms
}
```

---

## Services

| Service | Purpose |
|---------|---------|
| `oracleService.js` | Oracle database queries |
| `bulkComparisonService.js` | Bulk comparison operations |
| `bulkFetchService.js` | Parallel data fetching |
| `mappingService.js` | Field mapping application |
| `exportService.js` | CSV/Excel export |
| `autoPopulateService.js` | Team metadata auto-population |
| `sidearmFetcher.js` | Sidearm CMS scraping |
| `sidearmDetector.js` | Sidearm platform detection |
| `nbaPlayByPlayService.js` | NBA play-by-play processing |
| `nbaMonitoringService.js` | Real-time NBA monitoring |
| `statsApiService.js` | Stats API integration |
| `fetchService.js` | Generic fetch operations |

---

## Modules (Scrapers)

Modules follow a consistent pattern using `BaseModule`:

```javascript
class MyModule extends BaseModule {
  constructor() {
    super('my-module', 'roster', 'football', 'NCAA');
  }

  async fetch(team, options) {
    // Scraping logic
    return { success: true, data: [...] };
  }
}
```

### Available Modules

| Module | Sport | Data Type | Source |
|--------|-------|-----------|--------|
| `ncaa-football-roster` | Football | Roster | Sidearm/Presto |
| `ncaa-football-schedule` | Football | Schedule | Sidearm/Presto |
| `ncaa-football-stats` | Football | Stats | Sidearm/Presto |
| `ncaa-basketball-roster` | Basketball | Roster | Sidearm/Presto |
| `ncaa-basketball-schedule` | Basketball | Schedule | Sidearm/Presto |
| `ncaa-basketball-stats` | Basketball | Stats | Sidearm/Presto |
| `ncaa-mens-basketball-schedule` | M. Basketball | Schedule | Sidearm |
| `ncaa-womens-basketball-schedule` | W. Basketball | Schedule | Sidearm |
| `nba-schedule` | NBA | Schedule | NBA API |
| `nba-schedule-fetch` | NBA | Schedule | NBA API |
| `nba-boxscore` | NBA | Boxscore | NBA API |
| `nba-boxscore-fetch` | NBA | Boxscore | NBA API |
| `mlb-roster` | MLB | Roster | MLB API |
| `espn-tv` | Multi | TV Data | ESPN |
| `cfb-tv` | CFB | TV Data | CFB Sites |

---

## Middleware

### Validation (`middleware/validation.js`)

Express-validator based validation for all routes:

- `validateCreateTeam` - Team creation
- `validateUpdateTeam` - Team updates
- `validateTeamIdParam` - Team ID parameter
- `validateTeamQuery` - Team query parameters
- `validateModuleFetch` - Fetch parameters
- `validateBulkFetch` - Bulk fetch parameters
- `validateComparison` - Comparison parameters
- `validateDangerZoneOperation` - Danger zone with password
- `sanitizeString` - NoSQL injection prevention

### Error Handler (`server.js`)

Global error handler with:
- Request context logging
- Development vs production responses
- Status code inference
- Stack trace capture

---

## Constants

Located in `constants/index.js`:

```javascript
// Leagues
LEAGUES: { NCAA, NFL, NBA, NHL, MLB, MILB }

// Sports
SPORTS: { FOOTBALL, MENS_BASKETBALL, WOMENS_BASKETBALL, BASEBALL }

// Data Types
DATA_TYPES: { ROSTER, SCHEDULE, STATS, BOXSCORE, PLAY_BY_PLAY }

// HTTP Status Codes
HTTP_STATUS: { OK, CREATED, BAD_REQUEST, NOT_FOUND, INTERNAL_ERROR }

// Error Messages
ERROR_MESSAGES: { TEAM_NOT_FOUND, VALIDATION_FAILED, ... }

// Rate Limits
RATE_LIMITS: { BULK_FETCH_DELAY_MS: 2000, REQUEST_TIMEOUT_MS: 30000 }

// Cache Durations
CACHE_DURATIONS: { NBA_SCHEDULE: 300000, DEFAULT: 86400000 }
```

---

## Error Handling

### Response Format

All error responses follow this format:

```json
{
  "success": false,
  "error": "Error message",
  "details": [...]  // Optional: validation errors
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 404 | Not Found |
| 500 | Internal Server Error |
| 503 | Service Unavailable (Oracle/API down) |

### Validation Errors

```json
{
  "success": false,
  "error": "Validation failed",
  "details": [
    {
      "field": "teamId",
      "message": "teamId is required",
      "value": null
    }
  ]
}
```

---

## Database Indexes

### Team Collection
- `{ league: 1, active: 1 }`
- `{ scrapeType: 1, subScrapeType: 1 }`
- `{ league: 1, conference: 1, active: 1 }`

### ScrapedData Collection
- `{ moduleId: 1, teamId: 1 }`
- `{ teamId: 1, dataType: 1 }`
- `{ cacheExpiry: 1 }`

### NBA Collections
- `{ gameId: 1 }` (unique)
- `{ gameDate: 1 }`
- `{ gameStatus: 1 }`

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 5000 | Server port |
| `MONGODB_URI` | Yes | - | MongoDB connection string |
| `NODE_ENV` | No | development | Environment |
| `CORS_ORIGINS` | No | localhost:3000 | Allowed CORS origins |
| `ENABLE_INTERNAL_FEATURES` | No | false | Enable Oracle/API access |
| `DANGER_ZONE_PASSWORD` | Yes | - | Danger zone protection |
| `ORACLE_USER` | No* | - | Oracle username |
| `ORACLE_PASSWORD` | No* | - | Oracle password |
| `ORACLE_CONNECTION_STRING` | No* | - | Oracle connection |
| `STATS_API_URL` | No* | - | Stats API URL |

*Required when `ENABLE_INTERNAL_FEATURES=true`

---

## Development

### Scripts

```bash
npm run dev      # Development with nodemon
npm start        # Production
npm test         # Run tests (not yet implemented)
```

### Logging

The application uses Winston for structured logging with custom convenience methods:

```javascript
const logger = require('./utils/logger');

logger.info('Message');           // General info
logger.debug('Debug message');    // Debug (development)
logger.warn('Warning');           // Warnings
logger.error('Error', { context });// Errors with context
logger.db('Database message');    // Database operations
logger.security('Security event');// Security-related
logger.logError(error, context);  // Error with stack trace
```

**Log Levels:** error, warn, info, http, verbose, debug, silly

**Environment Variables:**
- `LOG_LEVEL` - Set minimum log level (default: debug)
- `LOG_TO_FILE` - Enable file logging (default: false)
- `LOG_DIR` - Directory for log files (default: ./logs)

Console output uses emoji indicators:
- `✅` Success
- `❌` Error
- `📡` External API call
- `🔒` Security event
- `⚡` Performance
- `🗄️` Database
- `🔧` System
