// frontend/src/components/fetch/index.js
//
// FetchDashboard Component Structure Documentation
// =================================================
//
// The FetchDashboard.js file contains components for data collection
// (scraping) from various sports data sources.
//
// COMPONENT HIERARCHY:
//
// FetchDashboard (main) - Lines 44-1399
// ├── Module selection and team filtering
// ├── Fetch execution logic
// ├── Data view management
// └── Bulk fetch operations
//
// PlayerCard - Lines 1400-1516
// ├── Individual player display
// └── Validation status indicators
//
// PlayerTable - Lines 1517-1603
// ├── Roster table display
// └── Sortable columns
//
// StatsGameDisplay - Lines 1604-1791
// ├── Football game stats container
// └── Category tabs
//
// GameStatsExpanded - Lines 1792-1882
// ├── Expanded game view
// └── Category navigation
//
// === FOOTBALL STAT TABLES ===
//
// PassingStatsTable - Lines 1883-1919
// RushingStatsTable - Lines 1920-1955
// ReceivingStatsTable - Lines 1956-1991
// KickingStatsTable - Lines 1992-2085
// PuntingStatsTable - Lines 2086-2120
// ReturnsStatsTable - Lines 2121-2248
// DefenseStatsTable - Lines 2249-2295
// MiscStatsTable - Lines 2296-2391
//
// === BASKETBALL COMPONENTS ===
//
// BasketballStatsGameDisplay - Lines 2392-2550
// ├── Basketball game stats container
// └── Game navigation
//
// BasketballGameStatsExpanded - Lines 2551-2595
// ├── Expanded basketball game view
// └── Player stats section
//
// BasketballPlayerStatsTable - Lines 2596-2651
// ├── Basketball player stats table
// └── Standard stat columns
//
// === NBA COMPONENTS ===
//
// NBABoxscoreDisplay - Lines 2652-2814
// ├── NBA boxscore container
// └── Home/Away team tabs
//
// NBABoxscoreExpanded - Lines 2815-2833
// └── Expanded NBA boxscore
//
// NBAPlayerStatsTable - Lines 2834-2889
// └── NBA player stats table
//
// === SCHEDULE COMPONENT ===
//
// ScheduleTable - Lines 2890-end
// ├── Schedule display table
// ├── Sport-specific columns
// └── Date/time formatting
//
// REFACTORING NOTES:
// - Sport-specific stat tables could be extracted to separate files
// - Consider creating a StatTable factory component
// - PlayerCard and PlayerTable are good extraction candidates
// - Schedule components could be shared with NBASchedule

export { default } from '../FetchDashboard';
