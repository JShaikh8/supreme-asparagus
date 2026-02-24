# SportsData Pro

A comprehensive sports data management platform for collecting, comparing, and analyzing team rosters, schedules, and statistics across multiple leagues (NCAA, NBA, MLB, NFL).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        SportsData Pro                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────┐     ┌─────────────────┐                   │
│  │   Web App       │     │  Electron App   │                   │
│  │   (React)       │     │  (Desktop)      │                   │
│  │                 │     │                 │                   │
│  │ - Baseline      │     │ - All features  │                   │
│  │   comparisons   │     │ - Oracle access │                   │
│  │ - Public API    │     │ - Stats API     │                   │
│  └────────┬────────┘     └────────┬────────┘                   │
│           │                       │                             │
│           └───────────┬───────────┘                             │
│                       ▼                                         │
│           ┌─────────────────────┐                               │
│           │   Express Backend   │                               │
│           │   (Node.js API)     │                               │
│           └──────────┬──────────┘                               │
│                      │                                          │
│      ┌───────────────┼───────────────┐                          │
│      ▼               ▼               ▼                          │
│ ┌─────────┐   ┌───────────┐   ┌───────────┐                    │
│ │ MongoDB │   │  Oracle   │   │ Stats API │                    │
│ │ (Data)  │   │ (Compare) │   │ (Compare) │                    │
│ └─────────┘   └───────────┘   └───────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Dual-Mode Architecture

| Feature | Web App | Electron App |
|---------|---------|--------------|
| Team Management | Yes | Yes |
| Data Collection (Scraping) | Yes | Yes |
| Baseline Comparisons | Yes | Yes |
| Oracle Comparisons | No | Yes |
| Stats API Comparisons | No | Yes |
| Field Mappings | Yes | Yes |
| Search | Yes | Yes |
| Export (CSV, Excel, JSON) | Yes | Yes |

## Project Structure

```
sports-data-platform/
├── backend/                 # Express.js API server
│   ├── routes/              # API endpoints (14 route files)
│   ├── models/              # Mongoose schemas (16 models)
│   ├── services/            # Business logic (13 services)
│   ├── modules/             # Data scrapers (21 modules)
│   ├── middleware/          # Validation, error handling
│   ├── constants/           # Centralized constants
│   └── utils/               # Utility functions
├── frontend/                # React web application
│   ├── src/
│   │   ├── components/      # React components (18 components)
│   │   ├── context/         # React context providers
│   │   └── utils/           # Frontend utilities
│   └── public/
├── electron-app/            # Desktop application
│   ├── backend/             # Embedded backend copy
│   └── main.js              # Electron main process
└── README.md                # This file
```

## Features

### Data Collection
- **NCAA Football**: Rosters, schedules, stats from Sidearm/Presto sites
- **NCAA Basketball**: Men's and women's rosters, schedules, stats
- **NCAA Baseball**: Schedules from Sidearm sites
- **NBA**: Schedules, boxscores, play-by-play, injury reports
- **MLB**: Rosters and schedules from official sources
- **ESPN**: College football, men's and women's basketball schedules
- **Bulk Operations**: Fetch multiple teams with rate limiting

### Data Comparison
- **Baseline Comparison**: Compare current scraped data against saved baselines
- **Oracle Comparison**: Compare against Oracle database (internal only)
- **Stats API Comparison**: Compare against Stats.com API (internal only)
- **Field Mapping**: Map equivalent fields between sources
- **Discrepancy Detection**: Automatic detection of data differences
- **Bulk Comparison**: Compare multiple teams at once with progress tracking
- **Results Split**: Automatic separation of "with data" vs "no data" results

### Team Management
- CRUD operations for teams
- Auto-populate metadata from team websites
- Sport-specific configurations
- Conference and division organization

### Search
- Global search across teams, players, and schedules
- Quick search for autocomplete
- Filter by type (teams, players, schedule)

### Export
- JSON, CSV, and Excel export formats
- Team data, rosters, schedules, comparisons
- Conference-wide data aggregation

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- npm or yarn

### Backend Setup

```bash
cd backend
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your values:
# - MONGODB_URI: Your MongoDB connection string
# - DANGER_ZONE_PASSWORD: Password for destructive operations
# - CORS_ORIGINS: Allowed frontend origins

npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install

# Optional: Copy environment template
cp .env.example .env.local

npm start
```

### Electron App Setup

See [electron-app/README.md](electron-app/README.md) for detailed instructions.

## Environment Variables

### Backend (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port (default: 5000) |
| `MONGODB_URI` | Yes | MongoDB connection string |
| `NODE_ENV` | No | Environment (development/production) |
| `CORS_ORIGINS` | No | Comma-separated allowed origins |
| `ENABLE_INTERNAL_FEATURES` | No | Enable Oracle/API access (default: false) |
| `DANGER_ZONE_PASSWORD` | Yes | Password for destructive operations |
| `ORACLE_USER` | No* | Oracle username (*required for internal features) |
| `ORACLE_PASSWORD` | No* | Oracle password |
| `ORACLE_CONNECTION_STRING` | No* | Oracle connection string |
| `STATS_API_URL` | No* | Stats API base URL |

### Frontend (.env.local)

| Variable | Required | Description |
|----------|----------|-------------|
| `REACT_APP_API_URL` | No | Backend API URL (default: http://localhost:5000) |
| `REACT_APP_ENABLE_INTERNAL_FEATURES` | No | Show internal features in UI |

## API Documentation

### Internal API (`/api`)

Used by the frontend application.

| Endpoint | Description |
|----------|-------------|
| `/api/teams` | Team CRUD operations |
| `/api/fetch` | Data collection/scraping |
| `/api/comparison` | Data comparison operations |
| `/api/data` | Data retrieval |
| `/api/mappings` | Field mapping configuration |
| `/api/search` | Global search |
| `/api/settings` | Application settings |
| `/api/system` | System status (internal only) |
| `/api/nba` | NBA-specific endpoints |
| `/api/data-management` | Import/export, danger zone |

### Public API (`/api/v1`)

Rate-limited REST API for data retrieval with export support.

**Interactive Documentation**: Visit `/api/v1/docs` when the server is running.

| Endpoint | Description |
|----------|-------------|
| `GET /api/v1/teams` | List teams with filters |
| `GET /api/v1/teams/:teamId` | Get team details |
| `GET /api/v1/teams/:teamId/roster` | Get team roster |
| `GET /api/v1/teams/:teamId/stats` | Get team stats |
| `GET /api/v1/teams/:teamId/schedule` | Get team schedule |
| `GET /api/v1/conferences/:conference/roster` | Conference rosters |
| `GET /api/v1/conferences/:conference/stats` | Conference stats |
| `GET /api/v1/comparisons` | List comparisons |
| `GET /api/v1/comparisons/:id` | Get comparison details |

**Export Formats**: All endpoints support `?format=json|csv|xlsx`

## Data Models

### Core Models
- **Team**: Team configuration, metadata, sport configs
- **ScrapedData**: Collected data from various sources
- **ScrapedDataHistory**: Historical baselines for comparison
- **ComparisonResult**: Comparison operation results
- **DataMapping**: Field mapping rules

### NBA Models
- **NBAGame**: Game data with teams, scores, status
- **NBAPlayByPlayAction**: Play-by-play event data
- **NBAPlayerGameLog**: Per-game player statistics
- **NBAPlayerSeasonStats**: Season aggregates
- **NBAInjuryReport**: Injury tracking

### Supporting Models
- **AppSettings**: Application configuration
- **MappingRule**: Individual mapping rules
- **FetchJob**: Fetch operation tracking

## Scraper Modules

| Module | Sport | Data Type |
|--------|-------|-----------|
| `ncaa-football-roster` | NCAA Football | Roster |
| `ncaa-football-schedule` | NCAA Football | Schedule |
| `ncaa-football-stats` | NCAA Football | Stats |
| `ncaa-basketball-roster` | NCAA Basketball | Roster |
| `ncaa-basketball-schedule` | NCAA Basketball | Schedule |
| `ncaa-basketball-stats` | NCAA Basketball | Stats |
| `ncaa-mens-basketball-schedule` | NCAA M. Basketball | Schedule |
| `ncaa-womens-basketball-schedule` | NCAA W. Basketball | Schedule |
| `ncaa-baseball-schedule` | NCAA Baseball | Schedule |
| `espn-ncaa-cfb-schedule` | NCAA Football (ESPN) | Schedule |
| `espn-ncaa-mbb-schedule` | NCAA M. Basketball (ESPN) | Schedule |
| `espn-ncaa-wbb-schedule` | NCAA W. Basketball (ESPN) | Schedule |
| `nba-schedule` | NBA | Schedule |
| `nba-boxscore` | NBA | Boxscore |
| `nba-schedule-fetch` | NBA | Schedule (fetch) |
| `nba-boxscore-fetch` | NBA | Boxscore (fetch) |
| `mlb-roster` | MLB | Roster |
| `mlb-schedule` | MLB | Schedule |
| `mlb-schedule-fetch` | MLB | Schedule (fetch) |
| `espn-tv` | Multi | TV Data |
| `cfb-tv` | CFB | TV Data |

## Development

### Running in Development

```bash
# Terminal 1: Backend
cd backend
npm run dev

# Terminal 2: Frontend
cd frontend
npm start
```

### Building for Production

```bash
# Backend
cd backend
npm start

# Frontend
cd frontend
npm run build
```

### Electron Development

```bash
cd electron-app
npm run dev        # Development mode
npm run build      # Build installer
```

## Deployment

### Web Deployment (Render.com)

The application is configured for deployment on Render:
- Backend: Web Service with Node.js
- Frontend: Static Site with React build

### Desktop Distribution

Electron app builds installers for:
- Windows (NSIS installer)
- macOS (DMG)
- Linux (AppImage)

See [electron-app/README.md](electron-app/README.md) for build instructions.

## Related Documentation

- [Backend API Documentation](backend/README.md)
- [Electron App Setup](electron-app/README.md)
- [NBA Minutes Projection](NBA_MINUTES_PROJECTION_README.md)
- [Interactive API Docs](/api/v1/docs) (when server is running)

## License

Internal use only.
