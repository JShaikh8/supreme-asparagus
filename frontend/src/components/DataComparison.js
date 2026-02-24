// frontend/src/components/DataComparison.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useModal } from '../contexts/ModalContext';
import { useToast } from '../contexts/ToastContext';
import {
  Search,
  Loader2,
  BarChart3,
  ArrowLeftRight,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Check,
  X,
  Zap,
  MapPin,
  Hash,
  Scale,
  Calendar,
  Ruler,
  Link2,
  Globe,
  Building,
  Activity,
  Trophy,
  User,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Filter,
  Info,
  AlertCircle,
  Database,
  TrendingUp,
  Users,
  FileText,
  Shield,
  Plus,
  UserPlus,
  RefreshCw,
  Download,
  Tv
} from 'lucide-react';
import MappingModal from './MappingModal';
import ApiEndpointDisplay from './ApiEndpointDisplay';
import {
  exportToCSV,
  exportToExcel,
  exportAllGamesToCSV,
  exportAllGamesToExcel,
  exportBulkComparisonToCSV,
  exportBulkComparisonToExcel
} from '../utils/exportUtils';
// NOTE: No import of DataComparison.css - uses App.css styles

// Calculate the correct default season based on current date.
// College sports seasons span two years (e.g., 2025-26 basketball season).
// The Oracle database stores seasons by their starting year (2025 for 2025-26).
// - Jan-June: Use previous year (we're in the second half of that season)
// - July-Dec: Use current year (new season starting or about to start)
const getDefaultSeason = () => {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed (0=Jan, 11=Dec)
  const year = now.getFullYear();
  return (month >= 0 && month <= 5) ? year - 1 : year;
};

function DataComparison({ teams }) {
  const { showAlert } = useModal();
  // Mode: 'single' or 'bulk'
  const [comparisonMode, setComparisonMode] = useState('single');

  // Check if internal features (Oracle/API) are enabled
  const enableInternalFeatures = process.env.REACT_APP_ENABLE_INTERNAL_FEATURES === 'true';

  // Single Comparison States
  const [singleComparisonLeague, setSingleComparisonLeague] = useState('');
  const [singleComparisonConference, setSingleComparisonConference] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [comparisonSource, setComparisonSource] = useState(enableInternalFeatures ? 'oracle' : 'baseline');
  const [season, setSeason] = useState(getDefaultSeason());
  const [scheduleStartDate, setScheduleStartDate] = useState(() => {
    // Default to today's date in YYYY-MM-DD format
    const today = new Date();
    return today.toISOString().split('T')[0];
  });
  const [loading, setLoading] = useState(false);
  const [comparisonResult, setComparisonResult] = useState(null);
  const [sourceData, setSourceData] = useState(null);
  const [scrapedData, setScrapedData] = useState(null);
  const [viewMode, setViewMode] = useState('summary'); // summary, sideBySide, discrepancies

  // Bulk Comparison States
  const [bulkFilters, setBulkFilters] = useState({
    league: '',
    conference: '',
    division: '',
    teams: [],
    modules: [],
    source: enableInternalFeatures ? 'oracle' : 'baseline',
    season: getDefaultSeason(),
    targetDate: new Date().toISOString().split('T')[0], // Default to today's date for stats modules
    startDate: new Date().toISOString().split('T')[0], // Default to today's date for schedule modules
    endDate: '' // Optional end date for date range (ESPN modules)
  });
  const [bulkJob, setBulkJob] = useState(null);
  const [bulkJobStatus, setBulkJobStatus] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

  // Player Mapping States
  const [showPlayerMappingModal, setShowPlayerMappingModal] = useState(false);
  const [playerMappingData, setPlayerMappingData] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [creatingMapping, setCreatingMapping] = useState(false);

  // Stats comparison (for game-by-game stats)
  const [availableGames, setAvailableGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState('');

  // Schedule comparison - ignored games (for filtering out future tournament games)
  // Stored in MongoDB instead of localStorage for persistence across sessions
  const [ignoredGames, setIgnoredGames] = useState(new Set());

  // Load ignored games from MongoDB when team or module changes
  useEffect(() => {
    const loadIgnoredGames = async () => {
      if (!selectedTeam || !selectedModule || !selectedModule.includes('_schedule')) {
        setIgnoredGames(new Set());
        return;
      }

      try {
        const response = await axios.get(
          `/comparison/ignored-games/${selectedTeam}/${selectedModule}`
        );

        if (response.data && response.data.success) {
          setIgnoredGames(new Set(response.data.ignoredGames || []));
        } else {
          console.error('Failed to load ignored games');
          setIgnoredGames(new Set());
        }
      } catch (error) {
        console.error('Error loading ignored games:', error);
        setIgnoredGames(new Set());
      }
    };

    loadIgnoredGames();
  }, [selectedTeam, selectedModule]);
  const [loadingGames, setLoadingGames] = useState(false);
  const [compareAllGames, setCompareAllGames] = useState(false);
  const [allGamesResults, setAllGamesResults] = useState(null); // Store results for all games

  const allModules = [
    { value: 'ncaa_football_roster', label: 'Football Roster', league: 'NCAA' },
    { value: 'ncaa_football_schedule', label: 'Football Schedule', league: 'NCAA' },
    { value: 'ncaa_football_stats', label: 'Football Stats (Game-by-Game)', league: 'NCAA' },
    { value: 'ncaa_mensBasketball_roster', label: "Men's Basketball Roster", league: 'NCAA' },
    { value: 'ncaa_mensBasketball_schedule', label: "Men's Basketball Schedule", league: 'NCAA' },
    { value: 'ncaa_mensBasketball_stats', label: "Men's Basketball Stats (Game-by-Game)", league: 'NCAA' },
    { value: 'ncaa_womensBasketball_roster', label: "Women's Basketball Roster", league: 'NCAA' },
    { value: 'ncaa_womensBasketball_schedule', label: "Women's Basketball Schedule", league: 'NCAA' },
    { value: 'ncaa_womensBasketball_stats', label: "Women's Basketball Stats (Game-by-Game)", league: 'NCAA' },
    { value: 'ncaa_baseball_schedule', label: 'Baseball Schedule', league: 'NCAA' },
    { value: 'nba_schedule', label: 'NBA Schedule', league: 'NBA' },
    { value: 'nba_boxscore', label: 'NBA Boxscore', league: 'NBA' },
    // MLB modules
    { value: 'mlb_schedule', label: 'MLB Schedule', league: 'MLB' },
    { value: 'mlb_roster', label: 'MLB Roster', league: 'MLB' },
    // ESPN modules - compare ESPN data against Oracle
    { value: 'espn_ncaa_mbb_schedule', label: "ESPN: Men's Basketball Schedule", league: 'NCAA' },
    { value: 'espn_ncaa_wbb_schedule', label: "ESPN: Women's Basketball Schedule", league: 'NCAA' },
    { value: 'espn_ncaa_cfb_schedule', label: "ESPN: Football Schedule", league: 'NCAA' }
  ];

  // Helper function to check if module is an ESPN module
  const isEspnModule = (moduleId) => {
    return moduleId?.startsWith('espn_');
  };

  // Helper function to check if a module is a stats-type module
  const isStatsTypeModule = (moduleId) => {
    if (!moduleId) return false;
    return moduleId.includes('_stats') || moduleId.includes('boxscore');
  };

  // Computed values for current module type
  const isScheduleComparison = selectedModule.includes('_schedule') || selectedModule.includes('schedule');
  const isStatsComparison = isStatsTypeModule(selectedModule);

  // Get unique leagues from teams
  const leagues = [...new Set(teams.map(t => t.league))].sort();

  // Filter modules based on selected league
  const getModulesForLeague = (league) => {
    if (!league) return [];
    return allModules.filter(mod => mod.league === league);
  };

  // Get unique conferences based on selected league
  const getConferencesForLeague = (league) => {
    if (!league) return [];
    const conferencesSet = new Set(
      teams
        .filter(t => t.league === league && t.conference)
        .map(t => t.conference)
    );
    return [...conferencesSet].sort();
  };

  const availableConferences = getConferencesForLeague(singleComparisonLeague);

  const getTeamDisplayName = (team) => {
    if (!team) return '';
    return `${team.teamName}${team.teamNickname ? ` ${team.teamNickname}` : ''}`;
  };

  // Fetch available games for stats comparison
  const fetchGamesForTeam = async (teamId, moduleId) => {
    if (!teamId || !moduleId || !isStatsTypeModule(moduleId)) return;

    setLoadingGames(true);
    try {
      const response = await axios.get(`/comparison/games/${teamId}`, {
        params: { moduleId }
      });
      setAvailableGames(response.data.games || []);
      setSelectedGame(''); // Reset selected game
    } catch (error) {
      console.error('Error fetching games:', error);
      setAvailableGames([]);
    } finally {
      setLoadingGames(false);
    }
  };

  // Fetch games when team/module changes and it's a stats module
  useEffect(() => {
    if (selectedTeam && selectedModule && isStatsTypeModule(selectedModule)) {
      fetchGamesForTeam(selectedTeam, selectedModule);
    } else {
      setAvailableGames([]);
      setSelectedGame('');
    }
  }, [selectedTeam, selectedModule]);

  const handleCompare = async () => {
    if (!selectedTeam || !selectedModule) {
      await showAlert('Please select a team and module', 'Validation Error', 'warning');
      return;
    }

    // Check if this is a stats module
    const isStatsModule = isStatsTypeModule(selectedModule);

    // Handle "Compare All Games" mode
    if (isStatsModule && compareAllGames) {
      setLoading(true);
      try {
        const comparisonResponse = await axios.post('/comparison/compare-all-games', {
          teamId: selectedTeam,
          moduleId: selectedModule,
          source: comparisonSource
        });
        setAllGamesResults(comparisonResponse.data);
        setComparisonResult(null); // Clear single comparison result
        setViewMode('statsByCategory'); // Switch to stats view to show AllGamesView
      } catch (error) {
        console.error('Error comparing all games:', error);
        await showAlert(`Error comparing all games: ${error.response?.data?.error || error.message}`, 'Error', 'error');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isStatsModule && !selectedGame) {
      await showAlert('Please select a game to compare', 'Validation Error', 'warning');
      return;
    }

    setLoading(true);
    setAllGamesResults(null); // Clear all games results when doing single comparison
    try {
      if (isStatsModule) {
        // Stats comparison - use selectedGame which is the matchKey
        const comparisonResponse = await axios.post('/comparison/compare-stats', {
          matchKey: selectedGame,
          source: comparisonSource,
          moduleId: selectedModule,
          teamId: selectedTeam
        });

        // TEMPORARY: Log discrepancies for debugging
        console.log('=== COMPARISON RESULT ===');
        console.log('Total matches:', comparisonResponse.data.comparison.matches.length);
        console.log('Matches with discrepancies:', comparisonResponse.data.comparison.summary.matchesWithDiscrepancies);
        console.log('Discrepancies details:');
        comparisonResponse.data.comparison.discrepancies.forEach((disc, idx) => {
          console.log(`  ${idx + 1}. ${disc.player} (#${disc.jersey}):`);
          disc.discrepancies.forEach(d => {
            console.log(`    - ${d.category}.${d.stat}: Oracle=${d.source}, Sidearm=${d.scraped}`);
          });
        });
        console.log('\nMissing in Oracle (Sidearm only):');
        comparisonResponse.data.comparison.missingInSource.forEach((player, idx) => {
          console.log(`  ${idx + 1}. ${player.player} (#${player.jersey})`);
        });
        console.log('\nMissing in Sidearm (Oracle only):');
        comparisonResponse.data.comparison.missingInScraped.forEach((player, idx) => {
          console.log(`  ${idx + 1}. ${player.player} (#${player.jersey})`);
        });
        console.log('========================');

        setComparisonResult(comparisonResponse.data.comparison);
        // For stats: set full player lists for mapping modal
        setScrapedData(comparisonResponse.data.scrapedGame.players || []);
        setSourceData(comparisonResponse.data.oracleStats || []);
      } else if (isEspnModule(selectedModule)) {
        // ESPN Schedule comparison - uses dedicated ESPN endpoint
        const team = teams.find(t => t.teamId === selectedTeam);
        if (!team?.espnId) {
          await showAlert(`Team ${selectedTeam} does not have an ESPN ID configured. Please add the ESPN ID in Team Management.`, 'Configuration Error', 'warning');
          setLoading(false);
          return;
        }

        const requestBody = {
          teamId: selectedTeam,
          moduleId: selectedModule,
          source: comparisonSource,
          season
        };

        if (scheduleStartDate) {
          requestBody.startDate = scheduleStartDate;
        }

        const comparisonResponse = await axios.post('/comparison/espn/compare', requestBody);

        setComparisonResult(comparisonResponse.data.comparison);

        // Fetch ESPN scraped data for TV mapping dropdown
        const scrapedResponse = await axios.get('/data/scraped', {
          params: {
            teamId: selectedTeam,
            moduleId: selectedModule,
            limit: 500
          }
        });
        setScrapedData(scrapedResponse.data);
        setSourceData([]);
      } else {
        // Roster or Schedule comparison
        const requestBody = {
          teamId: selectedTeam,
          moduleId: selectedModule,
          source: comparisonSource,
          season
        };

        // Add startDate for schedule comparisons
        if (selectedModule.includes('_schedule') && scheduleStartDate) {
          requestBody.startDate = scheduleStartDate;
        }

        const comparisonResponse = await axios.post('/comparison/compare', requestBody);

        setComparisonResult(comparisonResponse.data.comparison);

        // Get detailed data for side-by-side view
        // For schedule comparisons, we don't need roster data
        const isScheduleComparison = selectedModule.includes('_schedule') || selectedModule.includes('schedule');

        if (isScheduleComparison) {
          // For schedule comparisons, just get scraped schedule data
          const scrapedResponse = await axios.get('/data/scraped', {
            params: {
              teamId: selectedTeam,
              moduleId: selectedModule,
              limit: 500
            }
          });
          setScrapedData(scrapedResponse.data);
          setSourceData([]); // No source data needed for schedule side-by-side
        } else {
          // For roster comparisons, get both scraped and source roster data
          const [scrapedResponse, sourceResponse] = await Promise.all([
            axios.get('/data/scraped', {
              params: {
                teamId: selectedTeam,
                moduleId: selectedModule,
                limit: 500
              }
            }),
            axios.get(`/comparison/${comparisonSource}/roster/${selectedTeam}`, {
              params: {
                season,
                // IMPORTANT: Check womensBasketball BEFORE mensBasketball (substring issue)
                sport: selectedModule.includes('football') ? 'football' :
                       selectedModule.includes('womensBasketball') ? 'womensBasketball' : 'mensBasketball'
              }
            })
          ]);

          setScrapedData(scrapedResponse.data);
          setSourceData(sourceResponse.data.data);
        }
      }
    } catch (error) {
      console.error('Comparison error:', error);
      await showAlert('Error performing comparison: ' + (error.response?.data?.error || error.message), 'Error', 'error');
    } finally {
      setLoading(false);
    }
  };

  const clearComparison = () => {
    setComparisonResult(null);
    setSourceData(null);
    setScrapedData(null);
    setAllGamesResults(null);
    setViewMode('summary');
    setIgnoredGames(new Set()); // Reset ignored games
  };

  // Schedule comparison - handle ignoring/unignoring games
  const handleToggleIgnoreGame = async (gameDate, opponent = null) => {
    if (!selectedTeam || !selectedModule) {
      console.error('Cannot toggle ignore: team or module not selected');
      return;
    }

    const isCurrentlyIgnored = ignoredGames.has(gameDate);

    try {
      if (isCurrentlyIgnored) {
        // Remove from ignored list
        const response = await axios.delete('/comparison/ignored-games', {
          data: {
            teamId: selectedTeam,
            moduleId: selectedModule,
            gameDate
          }
        });

        if (response.data && response.data.success) {
          setIgnoredGames(prev => {
            const newSet = new Set(prev);
            newSet.delete(gameDate);
            return newSet;
          });
        } else {
          console.error('Failed to remove ignored game');
        }
      } else {
        // Add to ignored list
        const response = await axios.post('/comparison/ignored-games', {
          teamId: selectedTeam,
          moduleId: selectedModule,
          gameDate,
          opponent,
          reason: 'Future tournament game'
        });

        if (response.data && response.data.success) {
          setIgnoredGames(prev => {
            const newSet = new Set(prev);
            newSet.add(gameDate);
            return newSet;
          });
        } else {
          console.error('Failed to add ignored game');
        }
      }
    } catch (error) {
      console.error('Error toggling ignored game:', error);
    }
  };

  // Bulk Comparison Functions
  const handleBulkCompare = async () => {
    // Validate filters
    if (!bulkFilters.league && bulkFilters.teams.length === 0) {
      await showAlert('Please select a league or specific teams', 'Validation Error', 'warning');
      return;
    }

    if (bulkFilters.modules.length === 0) {
      await showAlert('Please select at least one module', 'Validation Error', 'warning');
      return;
    }

    setLoading(true);
    try {
      // Build request payload - all modules (including ESPN) use the standard bulk comparison system
      const requestPayload = {
        league: bulkFilters.league || undefined,
        conference: bulkFilters.conference || undefined,
        division: bulkFilters.division || undefined,
        teams: bulkFilters.teams.length > 0 ? bulkFilters.teams : undefined,
        modules: bulkFilters.modules,
        source: bulkFilters.source,
        season: bulkFilters.season
      };

      // Only send date filters if relevant modules are selected
      const hasScheduleModules = bulkFilters.modules.some(m => m.includes('_schedule') || m.includes('schedule'));
      const hasStatsModules = bulkFilters.modules.some(m => isStatsTypeModule(m));
      const hasESPNModules = bulkFilters.modules.some(m => m.startsWith('espn_'));

      if (hasScheduleModules && bulkFilters.startDate) {
        requestPayload.startDate = bulkFilters.startDate;
      }
      if (hasStatsModules && bulkFilters.targetDate) {
        requestPayload.targetDate = bulkFilters.targetDate;
      }
      // Include endDate for ESPN modules (date range filtering)
      if (hasESPNModules && bulkFilters.endDate) {
        requestPayload.endDate = bulkFilters.endDate;
      }

      console.log('🔍 Bulk comparison request payload:', requestPayload);
      console.log('📅 Dates being sent - startDate:', requestPayload.startDate, 'endDate:', requestPayload.endDate);

      const response = await axios.post('/bulk-comparison/run', requestPayload);

      setBulkJob(response.data);

      // Start polling for job status
      const interval = setInterval(async () => {
        try {
          const statusResponse = await axios.get(`/bulk-comparison/status/${response.data.jobId}`);
          setBulkJobStatus(statusResponse.data.job);

          // Stop polling if job is complete, failed, or cancelled
          if (['completed', 'failed', 'cancelled'].includes(statusResponse.data.job.status)) {
            clearInterval(interval);
            setPollingInterval(null);
            setLoading(false);
          }
        } catch (error) {
          console.error('Error polling job status:', error);
        }
      }, 2000); // Poll every 2 seconds

      setPollingInterval(interval);
    } catch (error) {
      console.error('Bulk comparison error:', error);
      await showAlert('Error starting bulk comparison: ' + (error.response?.data?.error || error.message), 'Error', 'error');
      setLoading(false);
    }
  };

  const cancelBulkJob = async () => {
    if (!bulkJob?.jobId) return;

    try {
      await axios.delete(`/bulk-comparison/cancel/${bulkJob.jobId}`);
      if (pollingInterval) {
        clearInterval(pollingInterval);
        setPollingInterval(null);
      }
      setLoading(false);
    } catch (error) {
      console.error('Error cancelling job:', error);
      await showAlert('Error cancelling job: ' + error.message, 'Error', 'error');
    }
  };

  const clearBulkJob = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
    setBulkJob(null);
    setBulkJobStatus(null);
    setLoading(false);
  };

  // Cleanup polling on unmount
  React.useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Handle clicking on a player to map them
  const handlePlayerClick = (player, isMissingInScraped, availableScrapedPlayers, availableSourcePlayers) => {
    const isStatsModule = selectedModule && isStatsTypeModule(selectedModule);

    // Use provided player arrays if available, otherwise fall back to state
    const scrapedPlayersList = availableScrapedPlayers || scrapedData;
    const sourcePlayersList = availableSourcePlayers || sourceData;

    console.log('=== PLAYER MAPPING DEBUG ===');
    console.log('Player clicked:', player);
    console.log('isMissingInScraped:', isMissingInScraped);
    console.log('isStatsModule:', isStatsModule);
    console.log('scrapedPlayersList length:', scrapedPlayersList?.length || 0);
    console.log('sourcePlayersList length:', sourcePlayersList?.length || 0);

    // Determine which list to show (opposite of where player is missing)
    let availablePlayers;
    if (isStatsModule) {
      // For stats comparison: scrapedData and sourceData are already player arrays
      availablePlayers = isMissingInScraped ? scrapedPlayersList : sourcePlayersList;
    } else {
      // For roster comparison: data is wrapped in { data: ... }
      availablePlayers = isMissingInScraped ? scrapedPlayersList : sourcePlayersList;
    }

    console.log('availablePlayers length:', availablePlayers?.length || 0);
    console.log('availablePlayers sample:', availablePlayers?.[0]);
    console.log('========================');

    setPlayerMappingData({
      unmatchedPlayer: player,
      isMissingInScraped,
      availablePlayers: availablePlayers || [],
      selectedMatch: null
    });
    setShowPlayerMappingModal(true);
    setSearchTerm('');
  };

  // Create player name mapping
  const createPlayerMapping = async (scopeLevel) => {
    if (!playerMappingData?.selectedMatch) {
      await showAlert('Please select a player to map to', 'Validation Error', 'warning');
      return;
    }

    setCreatingMapping(true);
    try {
      const team = teams.find(t => t.teamId === selectedTeam);
      const { unmatchedPlayer, selectedMatch, isMissingInScraped } = playerMappingData;
      
      // Get the player data correctly based on data structure
      const selectedPlayerData = selectedMatch.data || selectedMatch;
      const isStatsModule = selectedModule && isStatsTypeModule(selectedModule);

      // Determine primary and equivalent names based on source (include playerName for NBA boxscore)
      const primaryName = isMissingInScraped ?
        (unmatchedPlayer.player || unmatchedPlayer.displayName || unmatchedPlayer.playerName || unmatchedPlayer.fullName) :
        (selectedPlayerData.displayName || selectedPlayerData.player || selectedPlayerData.playerName || selectedPlayerData.fullName || `${selectedPlayerData.firstName} ${selectedPlayerData.lastName}`);

      const equivalentName = isMissingInScraped ?
        (selectedPlayerData.displayName || selectedPlayerData.player || selectedPlayerData.playerName || selectedPlayerData.fullName || `${selectedPlayerData.firstName} ${selectedPlayerData.lastName}`) :
        (unmatchedPlayer.player || unmatchedPlayer.displayName || unmatchedPlayer.playerName || unmatchedPlayer.fullName);

      // Extract sport from moduleId - IMPORTANT: Check womensBasketball BEFORE mensBasketball
      const getSportFromModule = (moduleId) => {
        if (!moduleId) return undefined;
        if (moduleId.includes('nba_') || moduleId.startsWith('nba')) return 'nba';  // NBA modules
        if (moduleId.includes('football')) return 'football';
        if (moduleId.includes('womensBasketball')) return 'womensBasketball';  // Check this FIRST
        if (moduleId.includes('mensBasketball')) return 'mensBasketball';
        if (moduleId.includes('baseball')) return 'baseball';
        return undefined;
      };

      const extractedSport = getSportFromModule(selectedModule);
      console.log('Creating mapping with:', {
        scopeLevel,
        selectedModule,
        extractedSport,
        league: team?.league,
        teamId: team?.teamId
      });

      // Validate that we have the required scope information
      if (scopeLevel === 'sport' && !extractedSport) {
        await showAlert('Cannot create sport-level mapping: Unable to determine sport from module. Please ensure a module is selected.', 'Validation Error', 'error');
        setCreatingMapping(false);
        return;
      }

      if (scopeLevel === 'team' && !team?.teamId) {
        await showAlert('Cannot create team-level mapping: Team ID is missing.', 'Validation Error', 'error');
        setCreatingMapping(false);
        return;
      }

      // Build scope object without undefined values
      const scope = {
        level: scopeLevel
      };

      // Only add fields if they have values
      if ((scopeLevel === 'league' || scopeLevel === 'sport' || scopeLevel === 'team') && team?.league) {
        scope.league = team.league;
      }

      if ((scopeLevel === 'sport' || scopeLevel === 'team') && extractedSport) {
        scope.sport = extractedSport;
      }

      if (scopeLevel === 'team' && team?.teamId) {
        scope.teamId = team.teamId;
      }

      if (primaryName) {
        scope.playerName = primaryName;
      }

      const payload = {
        mappingType: 'equivalence',
        fieldType: 'name',
        scope,
        rules: {
          primaryValue: primaryName,
          equivalents: [equivalentName],
          caseSensitive: false
        },
        appliesTo: {
          scraped: true,
          api: comparisonSource === 'api',
          oracle: comparisonSource === 'oracle'
        },
        notes: `Player name mapping: "${primaryName}" = "${equivalentName}" (created from comparison)`
      };

      console.log('Final payload scope:', JSON.stringify(payload.scope, null, 2));

      await axios.post('/mappings/create', payload);

      await showAlert(`Player mapping created successfully!\n\n"${primaryName}" will now be recognized as "${equivalentName}" for ${scopeLevel} scope.`, 'Success', 'success');
      setShowPlayerMappingModal(false);
      setPlayerMappingData(null);

      // Don't auto-refresh - let user make multiple changes before manually re-running
      // handleCompare();
    } catch (error) {
      await showAlert('Error creating player mapping: ' + error.message, 'Error', 'error');
    } finally {
      setCreatingMapping(false);
    }
  };

  const createPlayerIgnore = async (scopeLevel) => {
    if (!playerMappingData?.unmatchedPlayer) {
      await showAlert('No player selected to ignore', 'Validation Error', 'warning');
      return;
    }

    setCreatingMapping(true);
    try {
      const team = teams.find(t => t.teamId === selectedTeam);
      const { unmatchedPlayer } = playerMappingData;

      const isStatsModule = selectedModule && isStatsTypeModule(selectedModule);

      // Get player name
      const playerName = unmatchedPlayer.player || unmatchedPlayer.displayName || unmatchedPlayer.fullName;

      // Extract sport from moduleId - IMPORTANT: Check womensBasketball BEFORE mensBasketball
      const getSportFromModule = (moduleId) => {
        if (!moduleId) return undefined;
        if (moduleId.includes('football')) return 'football';
        if (moduleId.includes('womensBasketball')) return 'womensBasketball';  // Check this FIRST
        if (moduleId.includes('mensBasketball')) return 'mensBasketball';
        if (moduleId.includes('baseball')) return 'baseball';
        return undefined;
      };

      const extractedSport = getSportFromModule(selectedModule);
      console.log('Creating ignore mapping with:', {
        scopeLevel,
        selectedModule,
        extractedSport,
        league: team?.league,
        teamId: team?.teamId,
        playerName
      });

      // Validate that we have the required scope information
      if (scopeLevel === 'sport' && !extractedSport) {
        await showAlert('Cannot create sport-level ignore: Unable to determine sport from module. Please ensure a module is selected.', 'Validation Error', 'error');
        setCreatingMapping(false);
        return;
      }

      if (scopeLevel === 'team' && !team?.teamId) {
        await showAlert('Cannot create team-level ignore: Team ID is missing.', 'Validation Error', 'error');
        setCreatingMapping(false);
        return;
      }

      // Build scope object without undefined values
      const scope = {
        level: scopeLevel
      };

      // Only add fields if they have values
      if ((scopeLevel === 'league' || scopeLevel === 'sport' || scopeLevel === 'team') && team?.league) {
        scope.league = team.league;
      }

      if ((scopeLevel === 'sport' || scopeLevel === 'team') && extractedSport) {
        scope.sport = extractedSport;
      }

      if (scopeLevel === 'team' && team?.teamId) {
        scope.teamId = team.teamId;
      }

      if (playerName) {
        scope.playerName = playerName;
      }

      const payload = {
        mappingType: 'ignore',
        fieldType: 'name',
        scope,
        rules: {
          primaryValue: playerName
        },
        appliesTo: {
          scraped: true,
          api: comparisonSource === 'api',
          oracle: comparisonSource === 'oracle'
        },
        notes: `Player ignore: "${playerName}" (created from comparison)`
      };

      console.log('Final ignore payload scope:', JSON.stringify(payload.scope, null, 2));

      await axios.post('/mappings/create', payload);

      await showAlert(`Player "${playerName}" will now be ignored for ${scopeLevel} scope.`, 'Success', 'success');
      setShowPlayerMappingModal(false);
      setPlayerMappingData(null);

      // Don't auto-refresh - let user make multiple changes before manually re-running
      // handleCompare();
    } catch (error) {
      await showAlert('Error creating player ignore: ' + error.message, 'Error', 'error');
    } finally {
      setCreatingMapping(false);
    }
  };

  // Player Mapping Modal Component
  const PlayerMappingModal = () => {
    if (!showPlayerMappingModal || !playerMappingData) return null;

    const { unmatchedPlayer, isMissingInScraped, availablePlayers, selectedMatch } = playerMappingData;
    
    // Filter available players based on search
    const filteredPlayers = availablePlayers.filter(player => {
      if (!searchTerm) return true;
      const playerData = player.data || player;
      // Include playerName for NBA boxscore format
      const playerName = playerData.displayName || playerData.player || playerData.playerName || playerData.fullName ||
                        `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim();
      return playerName.toLowerCase().includes(searchTerm.toLowerCase());
    });

    return (
      <div className="modal-overlay">
        <div className="modal-content player-mapping-modal">
          <div className="modal-header">
            <h3>
              <UserPlus className="inline-icon" />
              Map Player Names
            </h3>
            <button 
              className="close-btn"
              onClick={() => setShowPlayerMappingModal(false)}
            >
              <X size={20} />
            </button>
          </div>

          <div className="mapping-info">
            <div className="unmatched-player">
              <h4>Unmatched Player ({isMissingInScraped ? comparisonSource.toUpperCase() : 'Scraped'})</h4>
              <div className="player-card selected">
                <div className="player-details">
                  <span className="player-name">
                    {unmatchedPlayer.player || unmatchedPlayer.displayName}
                  </span>
                  <div className="player-meta">
                    {unmatchedPlayer.jersey && (
                      <span className="badge jersey">#{unmatchedPlayer.jersey}</span>
                    )}
                    {unmatchedPlayer.position && (
                      <span className="badge position">{unmatchedPlayer.position}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <ArrowLeftRight className="mapping-arrow" size={24} />

            <div className="available-players">
              <h4>Select Matching Player ({isMissingInScraped ? 'Scraped' : comparisonSource.toUpperCase()})</h4>
              
              <div className="search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search players..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  autoFocus
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="players-list">
                {filteredPlayers.length > 0 ? (
                  filteredPlayers.map((player, idx) => {
                    // Handle both scraped data format and source data format
                    const playerData = player.data || player;
                    // Include playerName for NBA boxscore format
                    const playerName = playerData.displayName || playerData.player || playerData.playerName || playerData.fullName ||
                                      `${playerData.firstName || ''} ${playerData.lastName || ''}`.trim();
                    const isSelected = selectedMatch === player;
                    
                    return (
                      <div 
                        key={idx}
                        className={`player-card ${isSelected ? 'selected' : ''}`}
                        onClick={() => setPlayerMappingData({
                          ...playerMappingData,
                          selectedMatch: player
                        })}
                      >
                        <div className="player-details">
                          <span className="player-name">{playerName}</span>
                          <div className="player-meta">
                            {playerData.jersey && (
                              <span className="badge jersey">#{playerData.jersey}</span>
                            )}
                            {playerData.position && (
                              <span className="badge position">{playerData.position}</span>
                            )}
                            {playerData.year && (
                              <span className="badge year">{playerData.year}</span>
                            )}
                          </div>
                        </div>
                        {isSelected && <Check className="selected-icon" size={20} />}
                      </div>
                    );
                  })
                ) : (
                  <div className="no-players">
                    No players found matching "{searchTerm}"
                  </div>
                )}
              </div>
            </div>
          </div>

          {selectedMatch && (
            <div className="mapping-preview">
              <h4>Mapping Preview</h4>
              <div className="preview-box">
                <span className="mapping-from">
                  {unmatchedPlayer.player || unmatchedPlayer.displayName || unmatchedPlayer.playerName}
                </span>
                <ArrowLeftRight size={16} />
                <span className="mapping-to">
                  {(selectedMatch.data || selectedMatch).displayName ||
                   (selectedMatch.data || selectedMatch).player ||
                   (selectedMatch.data || selectedMatch).playerName ||
                   `${(selectedMatch.data || selectedMatch).firstName || ''} ${(selectedMatch.data || selectedMatch).lastName || ''}`}
                </span>
              </div>
            </div>
          )}

          <div className="scope-selection">
            <h4>Select Mapping Scope</h4>
            <div className="scope-buttons">
              <button
                className="btn-scope team"
                onClick={() => createPlayerMapping('team')}
                disabled={!selectedMatch || creatingMapping}
              >
                <Building size={16} />
                Team Level
                <span className="scope-desc">Only for this team</span>
              </button>
              <button
                className="btn-scope sport"
                onClick={() => createPlayerMapping('sport')}
                disabled={!selectedMatch || creatingMapping}
              >
                <Activity size={16} />
                Sport Level
                <span className="scope-desc">All teams in this sport</span>
              </button>
              <button
                className="btn-scope global"
                onClick={() => createPlayerMapping('global')}
                disabled={!selectedMatch || creatingMapping}
              >
                <Globe size={16} />
                Global
                <span className="scope-desc">All comparisons</span>
              </button>
            </div>
          </div>

          <div className="scope-divider">
            <span>OR</span>
          </div>

          <div className="scope-selection ignore-section">
            <h4>Ignore This Player</h4>
            <div className="scope-buttons">
              <button
                className="btn-scope team btn-ignore"
                onClick={() => createPlayerIgnore('team')}
                disabled={creatingMapping}
              >
                <Building size={16} />
                Team Level
                <span className="scope-desc">Ignore for this team only</span>
              </button>
              <button
                className="btn-scope sport btn-ignore"
                onClick={() => createPlayerIgnore('sport')}
                disabled={creatingMapping}
              >
                <Activity size={16} />
                Sport Level
                <span className="scope-desc">Ignore for all teams in this sport</span>
              </button>
              <button
                className="btn-scope global btn-ignore"
                onClick={() => createPlayerIgnore('global')}
                disabled={creatingMapping}
              >
                <Globe size={16} />
                Global
                <span className="scope-desc">Ignore in all comparisons</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="data-comparison">
      <div className="comparison-header">
        <h2><Database className="inline-icon" /> Data Comparison Tool</h2>
        <p>Compare scraped data with Oracle database or Stats API</p>

        {/* Mode Toggle */}
        <div className="mode-toggle">
          <button
            className={`mode-btn ${comparisonMode === 'single' ? 'active' : ''}`}
            onClick={() => {
              setComparisonMode('single');
              clearBulkJob();
            }}
          >
            <User size={16} />
            Single Team
          </button>
          <button
            className={`mode-btn ${comparisonMode === 'bulk' ? 'active' : ''}`}
            onClick={() => {
              setComparisonMode('bulk');
              clearComparison();
            }}
          >
            <Users size={16} />
            Bulk Comparison
          </button>
        </div>
      </div>

      {comparisonMode === 'single' ? (
        <>
          <div className="comparison-controls">
        <div className="control-row">
          <div className="control-group">
            <label><Trophy size={14} /> League</label>
            <select
              value={singleComparisonLeague}
              onChange={(e) => {
                const newLeague = e.target.value;
                setSingleComparisonLeague(newLeague);
                setSingleComparisonConference(''); // Reset conference when league changes
                setSelectedTeam('');
                setSelectedModule('');
                // Pro leagues (MLB, NBA) use current year; college uses cross-year logic
                if (newLeague === 'MLB' || newLeague === 'NBA') {
                  setSeason(new Date().getFullYear());
                } else if (newLeague) {
                  setSeason(getDefaultSeason());
                }
                clearComparison();
              }}
            >
              <option value="">All Leagues</option>
              {leagues.map(league => (
                <option key={league} value={league}>{league}</option>
              ))}
            </select>
          </div>

          {/* Conference filter - optional, only shown when league is selected */}
          {singleComparisonLeague && availableConferences.length > 0 && (
            <div className="control-group">
              <label><Building size={14} /> Conference (Optional)</label>
              <select
                value={singleComparisonConference}
                onChange={(e) => {
                  setSingleComparisonConference(e.target.value);
                  setSelectedTeam('');
                  clearComparison();
                }}
              >
                <option value="">All Conferences</option>
                {availableConferences.map(conference => (
                  <option key={conference} value={conference}>{conference}</option>
                ))}
              </select>
            </div>
          )}

          <div className="control-group">
            <label><Users size={14} /> Team</label>
            <select value={selectedTeam} onChange={(e) => {
              setSelectedTeam(e.target.value);
              clearComparison();
            }}>
              <option value="">Select team...</option>
              {teams
                .filter(t => {
                  // Must have statsId
                  if (!t.statsId) return false;
                  // Filter by league if selected
                  if (singleComparisonLeague && t.league !== singleComparisonLeague) return false;
                  // Filter by conference if selected
                  if (singleComparisonConference && t.conference !== singleComparisonConference) return false;
                  return true;
                })
                .map(team => (
                  <option key={team.teamId} value={team.teamId}>
                    {getTeamDisplayName(team)} (Stats ID: {team.statsId})
                  </option>
                ))}
            </select>
          </div>

          <div className="control-group">
            <label><Activity size={14} /> Module</label>
            <select
              value={selectedModule}
              onChange={(e) => {
                setSelectedModule(e.target.value);
                clearComparison();
              }}
              disabled={!singleComparisonLeague}
            >
              <option value="">
                {!singleComparisonLeague ? 'Select a league first...' : 'Select module...'}
              </option>
              {getModulesForLeague(singleComparisonLeague).map(mod => (
                <option key={mod.value} value={mod.value}>{mod.label}</option>
              ))}
            </select>
          </div>

          {/* Stats-specific fields - Game selector */}
          {selectedModule && isStatsTypeModule(selectedModule) && (
            <div className="control-group">
              <label><Calendar size={14} /> Select Game</label>
              {loadingGames ? (
                <div style={{ padding: '8px', color: '#718096', fontSize: '14px' }}>
                  <Loader2 size={14} className="spinner" style={{ display: 'inline-block', marginRight: '8px' }} />
                  Loading games...
                </div>
              ) : availableGames.length === 0 ? (
                <div style={{ padding: '8px', color: '#718096', fontSize: '14px' }}>
                  No games found. Fetch stats for this team first.
                </div>
              ) : (
                <>
                  <select
                    value={selectedGame}
                    onChange={(e) => {
                      setSelectedGame(e.target.value);
                      clearComparison();
                    }}
                  >
                    <option value="">Select a game...</option>
                    {availableGames.map(game => (
                      <option key={game.matchKey} value={game.matchKey}>
                        {game.date} - {game.isHome ? 'vs' : '@'} {game.opponent} ({game.score})
                      </option>
                    ))}
                  </select>
                  <small style={{ color: '#718096', fontSize: '11px', marginTop: '4px', display: 'block' }}>
                    {availableGames.length} game{availableGames.length !== 1 ? 's' : ''} available
                  </small>

                  {/* Compare All Games Checkbox */}
                  <div style={{ marginTop: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input
                      type="checkbox"
                      id="compareAllGames"
                      checked={compareAllGames}
                      onChange={(e) => {
                        setCompareAllGames(e.target.checked);
                        if (e.target.checked) {
                          setSelectedGame(''); // Clear selected game when comparing all
                        }
                        clearComparison();
                      }}
                      style={{ cursor: 'pointer' }}
                    />
                    <label
                      htmlFor="compareAllGames"
                      style={{ cursor: 'pointer', fontSize: '13px', margin: 0 }}
                    >
                      Compare All Games
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          <div className="control-group">
            <label><Database size={14} /> Compare With</label>
            <select value={comparisonSource} onChange={(e) => {
              setComparisonSource(e.target.value);
              clearComparison();
            }}>
              {enableInternalFeatures && <option value="api">Stats API</option>}
              {enableInternalFeatures && <option value="oracle">Oracle Database</option>}
              <option value="baseline">Last Fetched Data</option>
            </select>
          </div>

          <div className="control-group">
            <label><Calendar size={14} /> Season</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={() => { const s = Number(season) - 1; if (s >= 2020) { setSeason(s); clearComparison(); } }}
                disabled={Number(season) <= 2020}
                style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: Number(season) <= 2020 ? 'not-allowed' : 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', opacity: Number(season) <= 2020 ? 0.4 : 1 }}
                title="Previous season"
              >
                <ChevronDown size={16} />
              </button>
              <span style={{ fontWeight: 600, fontSize: '15px', minWidth: '44px', textAlign: 'center' }}>{season}</span>
              <button
                onClick={() => { const s = Number(season) + 1; if (s <= new Date().getFullYear() + 1) { setSeason(s); clearComparison(); } }}
                disabled={Number(season) >= new Date().getFullYear() + 1}
                style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: Number(season) >= new Date().getFullYear() + 1 ? 'not-allowed' : 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', opacity: Number(season) >= new Date().getFullYear() + 1 ? 0.4 : 1 }}
                title="Next season"
              >
                <ChevronUp size={16} />
              </button>
            </div>
          </div>

          {/* Show date picker for schedule comparisons */}
          {selectedModule.includes('_schedule') && (
            <div className="control-group">
              <label><Calendar size={14} /> Start Date</label>
              <input
                type="date"
                value={scheduleStartDate}
                onChange={(e) => {
                  setScheduleStartDate(e.target.value);
                  clearComparison();
                }}
                placeholder="Show games on/after this date"
                style={{ padding: '8px', fontSize: '14px' }}
              />
              <small style={{ color: '#666', fontSize: '12px', marginTop: '4px', display: 'block' }}>
                Defaults to today - only games on/after this date will be compared
              </small>
            </div>
          )}

          {/* ESPN Module Info */}
          {isEspnModule(selectedModule) && (
            <div style={{
              padding: '0.75rem 1rem',
              backgroundColor: '#fff3cd',
              border: '1px solid #ffc107',
              borderRadius: '8px',
              marginBottom: '1rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                <Info size={16} style={{ color: '#856404' }} />
                <strong style={{ color: '#856404' }}>ESPN Comparison</strong>
              </div>
              <small style={{ color: '#856404', display: 'block' }}>
                Compares ESPN schedule data against Oracle. Make sure you've fetched ESPN data first via Bulk Fetch → ESPN.
                {(() => {
                  const team = teams.find(t => t.teamId === selectedTeam);
                  if (team && !team.espnId) {
                    return <span style={{ color: '#dc3545', display: 'block', marginTop: '0.25rem' }}>
                      ⚠️ This team does not have an ESPN ID configured!
                    </span>;
                  }
                  if (team?.espnId) {
                    return <span style={{ display: 'block', marginTop: '0.25rem' }}>
                      ESPN ID: {team.espnId}
                    </span>;
                  }
                  return null;
                })()}
              </small>
            </div>
          )}

          <button 
            className="btn-primary"
            onClick={handleCompare}
            disabled={loading || !selectedTeam || !selectedModule}
          >
            {loading ? (
              <>
                <Loader2 size={16} className="spinner" />
                Comparing...
              </>
            ) : (
              <>
                <Search size={16} />
                Compare Data
              </>
            )}
          </button>
        </div>
      </div>

      {(comparisonResult || allGamesResults) && (
        <>
          <div className="view-mode-tabs">
            {/* Only show Summary for single comparisons */}
            {comparisonResult && (
              <button
                className={viewMode === 'summary' ? 'active' : ''}
                onClick={() => setViewMode('summary')}
              >
                <BarChart3 size={16} />
                Summary
              </button>
            )}

            {/* Only show side-by-side for roster comparisons (single comparison only) */}
            {!isStatsTypeModule(selectedModule) && comparisonResult && (
              <>
                <button
                  className={viewMode === 'sideBySide' ? 'active' : ''}
                  onClick={() => setViewMode('sideBySide')}
                >
                  <ArrowLeftRight size={16} />
                  Side by Side
                </button>
                <button
                  className={viewMode === 'discrepancies' ? 'active' : ''}
                  onClick={() => setViewMode('discrepancies')}
                >
                  <AlertTriangle size={16} />
                  Discrepancies
                </button>
              </>
            )}

            {/* For stats, show category view */}
            {isStatsTypeModule(selectedModule) && (
              <button
                className={viewMode === 'statsByCategory' ? 'active' : ''}
                onClick={() => setViewMode('statsByCategory')}
              >
                <Activity size={16} />
                Stats by Category
              </button>
            )}
          </div>

          {/* API Endpoint Display for Comparison Results */}
          {comparisonResult?._id && (
            <ApiEndpointDisplay
              comparisonId={comparisonResult._id}
              type="comparison"
            />
          )}

          {viewMode === 'summary' && comparisonResult && (
            <ComparisonSummary
              comparison={comparisonResult}
              source={comparisonSource}
              team={teams.find(t => t.teamId === selectedTeam)}
              onPlayerClick={handlePlayerClick}
              isStatsComparison={isStatsTypeModule(selectedModule)}
              isScheduleComparison={selectedModule.includes('_schedule')}
              ignoredGames={ignoredGames}
              handleToggleIgnoreGame={handleToggleIgnoreGame}
            />
          )}

          {viewMode === 'sideBySide' && !isStatsTypeModule(selectedModule) && (
            <SideBySideView
              scrapedData={scrapedData}
              sourceData={sourceData}
              source={comparisonSource}
              comparisonResult={comparisonResult}
              isScheduleComparison={selectedModule.includes('_schedule')}
              selectedModule={selectedModule}
              ignoredGames={ignoredGames}
            />
          )}

          {viewMode === 'statsByCategory' && isStatsTypeModule(selectedModule) && (
            allGamesResults ? (
              <AllGamesView
                allGamesResults={allGamesResults}
                source={comparisonSource}
                team={teams.find(t => t.teamId === selectedTeam)}
                selectedModule={selectedModule}
                onPlayerClick={handlePlayerClick}
                sourceData={sourceData}
                scrapedData={scrapedData}
              />
            ) : (
              <StatsByCategoryView
                comparison={comparisonResult}
                source={comparisonSource}
                team={teams.find(t => t.teamId === selectedTeam)}
                selectedModule={selectedModule}
                onPlayerClick={handlePlayerClick}
                sourceData={sourceData}
                scrapedData={scrapedData}
              />
            )
          )}

          {viewMode === 'discrepancies' && !isStatsTypeModule(selectedModule) && (
            <DiscrepanciesView
              comparison={comparisonResult}
              team={teams.find(t => t.teamId === selectedTeam)}
              source={comparisonSource}
              isScheduleComparison={selectedModule.includes('_schedule')}
              sourceData={sourceData}
              scrapedData={scrapedData}
            />
          )}
        </>
      )}

      {!comparisonResult && !allGamesResults && !loading && (
        <div className="empty-comparison">
          <Search size={48} className="empty-icon" />
          <h3>No Comparison Yet</h3>
          <p>Select a team and module, then click Compare Data to see how your scraped data matches against {comparisonSource === 'api' ? 'Stats API' : 'Oracle database'}.</p>
        </div>
      )}
        </>
      ) : (
        /* Bulk Comparison UI */
        <BulkComparisonView
          teams={teams}
          bulkFilters={bulkFilters}
          setBulkFilters={setBulkFilters}
          handleBulkCompare={handleBulkCompare}
          loading={loading}
          bulkJob={bulkJob}
          bulkJobStatus={bulkJobStatus}
          cancelBulkJob={cancelBulkJob}
          clearBulkJob={clearBulkJob}
          enableInternalFeatures={enableInternalFeatures}
        />
      )}

      {/* Player Mapping Modal */}
      <PlayerMappingModal />
    </div>
  );
}

function ComparisonSummary({ comparison, source, team, onPlayerClick, isStatsComparison, isScheduleComparison, ignoredGames, handleToggleIgnoreGame }) {
  const getStatusColor = (percentage) => {
    if (percentage >= 90) return 'success';
    if (percentage >= 70) return 'warning';
    return 'error';
  };

  const getTeamDisplayName = () => {
    if (!team) return '';
    return `${team.teamName}${team.teamNickname ? ` ${team.teamNickname}` : ''}`;
  };

  const getStatusIcon = (percentage) => {
    if (percentage >= 90) return <CheckCircle size={20} className="status-icon-success" />;
    if (percentage >= 70) return <AlertTriangle size={20} className="status-icon-warning" />;
    return <XCircle size={20} className="status-icon-error" />;
  };

  const getModuleName = () => {
    if (isScheduleComparison) return 'Schedule Comparison';
    if (isStatsComparison) return 'Stats Comparison';
    return 'Roster Comparison';
  };

  const getEntityType = () => {
    if (isScheduleComparison) return 'game';
    if (isStatsComparison) return 'player';
    return 'player';
  };

  const getEntityTypePlural = () => {
    if (isScheduleComparison) return 'games';
    if (isStatsComparison) return 'players';
    return 'players';
  };

  const handleExportCSV = () => {
    const metadata = {
      teamName: getTeamDisplayName(),
      moduleName: getModuleName(),
      comparisonDate: new Date().toLocaleString(),
      source: source === 'api' ? 'Stats API' : 'Oracle Database'
    };
    exportToCSV(comparison, metadata);
  };

  const handleExportExcel = () => {
    const metadata = {
      teamName: getTeamDisplayName(),
      moduleName: getModuleName(),
      comparisonDate: new Date().toLocaleString(),
      source: source === 'api' ? 'Stats API' : 'Oracle Database'
    };
    exportToExcel(comparison, metadata);
  };

  return (
    <div className="comparison-summary">
      <div className="summary-header">
        <div className="summary-title">
          <h3>{getTeamDisplayName()}</h3>
          <div className="summary-subtitle">
            <span className="source-badge">{source === 'api' ? 'Stats API' : 'Oracle Database'}</span>
            <span className="match-status">
              {getStatusIcon(comparison.matchPercentage)}
              <span>Overall Match: {comparison.matchPercentage}%</span>
            </span>
          </div>
        </div>
        <div className="export-buttons">
          <button className="btn-secondary btn-small" onClick={handleExportCSV} title="Export to CSV">
            <Download size={16} />
            CSV
          </button>
          <button className="btn-secondary btn-small" onClick={handleExportExcel} title="Export to Excel">
            <Download size={16} />
            Excel
          </button>
        </div>
      </div>

      <div className="summary-grid">
        <div className={`metric-card large ${getStatusColor(comparison.matchPercentage)}`}>
          <div className="metric-icon">{getStatusIcon(comparison.matchPercentage)}</div>
          <div className="metric-content">
            <div className="metric-value">{comparison.matchPercentage}%</div>
            <div className="metric-label">Match Rate</div>
            <div className="metric-sublabel">Based on {isScheduleComparison ? 'game dates' : 'player names'}</div>
          </div>
        </div>

        <div className="metric-card">
          <div className="metric-header">
            <span className="metric-title">{isScheduleComparison ? 'Game Counts' : 'Player Counts'}</span>
          </div>
          <div className="metric-rows">
            <div className="metric-row">
              <span className="row-label">Scraped {isScheduleComparison ? 'Schedule' : 'Roster'}:</span>
              <span className="row-value">{comparison.totalScraped}</span>
            </div>
            <div className="metric-row">
              <span className="row-label">{source === 'api' ? 'API' : 'Oracle'} {isScheduleComparison ? 'Schedule' : 'Roster'}:</span>
              <span className="row-value">{comparison.totalSource}</span>
            </div>
            <div className="metric-row diff">
              <span className="row-label">Difference:</span>
              <span className="row-value">
                {Math.abs(comparison.totalScraped - comparison.totalSource)}
              </span>
            </div>
          </div>
        </div>

        {comparison.summary && (
          <div className="metric-card">
            <div className="metric-header">
              <span className="metric-title">Match Details</span>
            </div>
            <div className="metric-rows">
              <div className="metric-row success">
                <span className="row-label">
                  <Check size={14} className="inline-icon-small" />
                  Perfect Matches:
                </span>
                <span className="row-value">{comparison.summary.perfectMatches}</span>
              </div>
              <div className="metric-row warning">
                <span className="row-label">
                  <Zap size={14} className="inline-icon-small" />
                  With Issues:
                </span>
                <span className="row-value">
                  {isScheduleComparison
                    ? comparison.summary.gamesWithDiscrepancies
                    : comparison.summary.matchesWithDiscrepancies}
                </span>
              </div>
              <div className="metric-row error">
                <span className="row-label">
                  <X size={14} className="inline-icon-small" />
                  Not Matched:
                </span>
                <span className="row-value">
                  {isScheduleComparison
                    ? (comparison.summary.uniqueToScraped - (comparison.missingInSource?.filter(item => ignoredGames.has(item.date)).length || 0)) + comparison.summary.uniqueToSource
                    : comparison.summary.uniqueToScraped + comparison.summary.uniqueToSource
                  }
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Visual Progress Bar */}
      <div className="comparison-breakdown">
        <h4>Data Coverage Breakdown</h4>
        <div className="breakdown-bar">
          <div 
            className="bar-segment perfect"
            style={{ width: `${(comparison.summary?.perfectMatches / comparison.totalSource) * 100}%` }}
            title={`Perfect Matches: ${comparison.summary?.perfectMatches}`}
          >
            {comparison.summary?.perfectMatches > 0 && comparison.summary.perfectMatches}
          </div>
          <div
            className="bar-segment issues"
            style={{ width: `${((isScheduleComparison ? comparison.summary?.gamesWithDiscrepancies : comparison.summary?.matchesWithDiscrepancies) / comparison.totalSource) * 100}%` }}
            title={`With Issues: ${isScheduleComparison ? comparison.summary?.gamesWithDiscrepancies : comparison.summary?.matchesWithDiscrepancies}`}
          >
            {isScheduleComparison
              ? (comparison.summary?.gamesWithDiscrepancies > 0 && comparison.summary.gamesWithDiscrepancies)
              : (comparison.summary?.matchesWithDiscrepancies > 0 && comparison.summary.matchesWithDiscrepancies)}
          </div>
          <div 
            className="bar-segment missing"
            style={{ width: `${(comparison.missingInScraped.length / comparison.totalSource) * 100}%` }}
            title={`Missing: ${comparison.missingInScraped.length}`}
          >
            {comparison.missingInScraped.length > 0 && comparison.missingInScraped.length}
          </div>
        </div>
        <div className="breakdown-legend">
          <span><span className="dot perfect"></span>Perfect Match</span>
          <span><span className="dot issues"></span>Has Discrepancies</span>
          <span><span className="dot missing"></span>Missing in Scraped</span>
        </div>
      </div>

      {/* Missing Items Lists - Players or Games */}
      <div className="missing-players-grid">
        <div className="missing-section">
          <div className="section-header">
            <h4>Not Found in Scraped Data</h4>
            <span className="count-badge error">
              {comparison.missingInScraped?.filter(p => !p.isIgnored).length || 0}
            </span>
          </div>
          {comparison.missingInScraped?.length > 0 ? (
            <div className="player-list">
              {comparison.missingInScraped.slice(0, 10).map((item, index) => (
                <div
                  key={index}
                  className={isScheduleComparison ? "player-row" : "player-row clickable"}
                  onClick={isScheduleComparison ? undefined : () => onPlayerClick(item, true)}
                  title={isScheduleComparison ? undefined : "Click to map this player"}
                >
                  {isScheduleComparison ? (
                    <>
                      <span className="player-name">
                        <Calendar size={14} style={{marginRight: '6px'}} />
                        {item.date}
                      </span>
                      <div className="player-meta">
                        {item.game?.opponent && <span className="badge">{item.game.opponent}</span>}
                        {item.game?.locationIndicator && <span className="badge">{item.game.locationIndicator}</span>}
                        {item.game?.venue && <span className="badge venue">{item.game.venue}</span>}
                        {item.game?.tv && <span className="badge tv">{item.game.tv}</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="player-name">
                        {item.player || item.displayName}
                        {item.isIgnored ? (
                          <span className="badge badge-ignored" title="This player is ignored via mapping">Ignored</span>
                        ) : (
                          <Link2 className="map-icon" size={14} />
                        )}
                      </span>
                      <div className="player-meta">
                        {item.jersey && <span className="badge jersey">#{item.jersey}</span>}
                        {item.position && <span className="badge position">{item.position}</span>}
                      </div>
                    </>
                  )}
                </div>
              ))}
              {comparison.missingInScraped.length > 10 && (
                <div className="more-indicator">
                  <Plus size={14} />
                  {comparison.missingInScraped.length - 10} more
                </div>
              )}
            </div>
          ) : (
            <div className="empty-message success">
              <CheckCircle size={20} />
              <span>All {source} {getEntityTypePlural()} found in scraped data</span>
            </div>
          )}
        </div>

        <div className="missing-section">
          <div className="section-header">
            <h4>Not Found in {source === 'api' ? 'API' : 'Oracle'}</h4>
            <span className="count-badge warning">
              {isScheduleComparison
                ? (comparison.missingInSource?.filter(item => !ignoredGames.has(item.date)).length || 0)
                : (comparison.missingInSource?.filter(p => !p.isIgnored).length || 0)
              }
            </span>
          </div>
          {comparison.missingInSource?.length > 0 ? (
            <div className="player-list">
              {comparison.missingInSource.slice(0, 10).map((item, index) => {
                const isIgnored = isScheduleComparison && ignoredGames.has(item.date);
                return (
                  <div
                    key={index}
                    className={isScheduleComparison ? `player-row clickable ${isIgnored ? 'ignored-game' : ''}` : "player-row clickable"}
                    onClick={isScheduleComparison ? () => handleToggleIgnoreGame(item.date, item.game?.opponent) : () => onPlayerClick(item, false)}
                    title={isScheduleComparison ? (isIgnored ? "Click to unignore this game" : "Click to ignore this game") : "Click to map this player"}
                  >
                    {isScheduleComparison ? (
                      <>
                        <span className="player-name">
                          <Calendar size={14} style={{marginRight: '6px'}} />
                          {item.date}
                          {isIgnored && <span style={{marginLeft: '8px', fontSize: '0.85em', opacity: 0.7}}>(Ignored)</span>}
                        </span>
                        <div className="player-meta">
                          {item.game?.opponent && <span className="badge">{item.game.opponent}</span>}
                          {item.game?.locationIndicator && <span className="badge">{item.game.locationIndicator}</span>}
                          {item.game?.venue && <span className="badge venue">{item.game.venue}</span>}
                          {item.game?.tv && <span className="badge tv">{item.game.tv}</span>}
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="player-name">
                          {item.displayName || item.player || `${item.firstName || ''} ${item.lastName || ''}`}
                          {item.isIgnored ? (
                            <span className="badge badge-ignored" title="This player is ignored via mapping">Ignored</span>
                          ) : (
                            <Link2 className="map-icon" size={14} />
                          )}
                        </span>
                        <div className="player-meta">
                          {item.jersey && <span className="badge jersey">#{item.jersey}</span>}
                          {item.position && <span className="badge position">{item.position}</span>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {comparison.missingInSource.length > 10 && (
                <div className="more-indicator">
                  <Plus size={14} />
                  {comparison.missingInSource.length - 10} more
                </div>
              )}
            </div>
          ) : (
            <div className="empty-message success">
              <CheckCircle size={20} />
              <span>All scraped {getEntityTypePlural()} found in {source}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Side by Side View Component - FIXED WITH PROPER MAPPING SUPPORT
function SideBySideView({ scrapedData, sourceData, source, comparisonResult, isScheduleComparison, selectedModule, ignoredGames, issuesOnly }) {
  const [filter, setFilter] = useState('');
  const leftTableRef = React.useRef(null);
  const rightTableRef = React.useRef(null);
  const [alignedData, setAlignedData] = useState([]);

  // Helper function to check if module is an ESPN module
  const isEspnModule = (moduleId) => {
    return moduleId?.startsWith('espn_');
  };

  // Normalize name for matching
  const normalizeName = (name) => {
    if (!name) return '';
    return name.toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/jr\.?|sr\.?|ii|iii|iv/gi, '')
      .trim();
  };

  // Create aligned data structure WITH PROPER MAPPING SUPPORT
  const createAlignedData = React.useCallback(() => {
    // Skip player alignment for schedule comparisons
    if (isScheduleComparison) return [];

    if (!scrapedData || !sourceData || !comparisonResult) return [];

    console.log('Creating aligned data with:', {
      scrapedDataCount: scrapedData.length,
      sourceDataCount: sourceData.length,
      comparisonResult
    });
    
    const aligned = [];
    const processedScraped = new Set();
    const processedSource = new Set();
    const ignoredPlayers = new Set();

    // Build set of ignored players from comparison result
    if (comparisonResult.missingInSource && Array.isArray(comparisonResult.missingInSource)) {
      comparisonResult.missingInSource.forEach(player => {
        if (player.isIgnored) {
          const playerName = player.displayName || player.player ||
            `${player.firstName || ''} ${player.lastName || ''}`.trim();
          ignoredPlayers.add(normalizeName(playerName));
        }
      });
    }

    if (comparisonResult.missingInScraped && Array.isArray(comparisonResult.missingInScraped)) {
      comparisonResult.missingInScraped.forEach(player => {
        if (player.isIgnored) {
          const playerName = player.player || player.displayName ||
            `${player.firstName || ''} ${player.lastName || ''}`.trim();
          ignoredPlayers.add(normalizeName(playerName));
        }
      });
    }

    // Build lookup maps for scraped data
    const scrapedByOriginalName = new Map();
    const scrapedByNormalizedName = new Map();
    
    scrapedData.forEach(item => {
      const originalName = item.data?.displayName || 
        `${item.data?.firstName || ''} ${item.data?.lastName || ''}`.trim();
      const normalizedName = normalizeName(originalName);
      
      if (originalName) {
        scrapedByOriginalName.set(originalName, item);
      }
      if (normalizedName) {
        scrapedByNormalizedName.set(normalizedName, item);
      }
    });
    
    // Build lookup maps for source data
    const sourceByOriginalName = new Map();
    const sourceByNormalizedName = new Map();
    
    sourceData.forEach(player => {
      const originalName = player.displayName || player.player ||
        `${player.firstName || ''} ${player.lastName || ''}`.trim();
      const normalizedName = normalizeName(originalName);
      
      if (originalName) {
        sourceByOriginalName.set(originalName, player);
      }
      if (normalizedName) {
        sourceByNormalizedName.set(normalizedName, player);
      }
    });
    
    // Process matches from comparison result first
    // These matches were already identified by the backend with name mappings applied
    if (comparisonResult.matches && Array.isArray(comparisonResult.matches)) {
      console.log('Processing matches:', comparisonResult.matches.length);
      
      comparisonResult.matches.forEach((match, index) => {
        const mappedFields = match.mappedFields || {};
        let scrapedItem = null;
        let sourcePlayer = null;
        
        // Now we have both scrapedName and player (source name) from backend!
        const scrapedName = match.scrapedName;
        const sourceName = match.player;
        
        // Find scraped player using the scrapedName from the match
        if (scrapedName) {
          scrapedItem = scrapedByOriginalName.get(scrapedName) || 
                       scrapedByNormalizedName.get(normalizeName(scrapedName));
          
          // If still not found, search through all scraped players
          if (!scrapedItem) {
            for (const item of scrapedData) {
              const itemName = item.data?.displayName || 
                `${item.data?.firstName || ''} ${item.data?.lastName || ''}`.trim();
              if (itemName === scrapedName || normalizeName(itemName) === normalizeName(scrapedName)) {
                scrapedItem = item;
                break;
              }
            }
          }
        }
        
        // Find source player using the player name from the match
        if (sourceName) {
          sourcePlayer = sourceByOriginalName.get(sourceName) || 
                        sourceByNormalizedName.get(normalizeName(sourceName));
          
          // If still not found, search through all source players
          if (!sourcePlayer) {
            for (const player of sourceData) {
              const playerName = player.displayName || player.player ||
                `${player.firstName || ''} ${player.lastName || ''}`.trim();
              if (playerName === sourceName || normalizeName(playerName) === normalizeName(sourceName)) {
                sourcePlayer = player;
                break;
              }
            }
          }
        }
        
        // Fallback: Try using jersey numbers if we still haven't found the players
        if (!scrapedItem && match.scrapedJersey !== undefined) {
          scrapedItem = scrapedData.find(item => item.data?.jersey === match.scrapedJersey);
        }
        
        if (!sourcePlayer && match.sourceJersey !== undefined) {
          sourcePlayer = sourceData.find(player => player.jersey === match.sourceJersey);
        }
        
        // Last resort: if we have discrepancies, use them to identify the players
        if ((!scrapedItem || !sourcePlayer) && match.discrepancies && match.discrepancies.length > 0) {
          // Try to find scraped player by matching discrepancy values
          if (!scrapedItem) {
            scrapedItem = scrapedData.find(item => {
              return match.discrepancies.every(d => {
                if (d.scraped === null || d.scraped === undefined) return true;
                const itemValue = item.data[d.field];
                if (itemValue === null || itemValue === undefined) return false;
                return itemValue.toString() === d.scraped.toString();
              });
            });
          }
          
          // Try to find source player by matching discrepancy values
          if (!sourcePlayer) {
            sourcePlayer = sourceData.find(player => {
              return match.discrepancies.every(d => {
                if (d.source === null || d.source === undefined) return true;
                const fieldName = d.field === 'position' ? ['position', 'positionAbbr'] : [d.field];
                const playerValue = fieldName.map(f => player[f]).find(v => v !== undefined);
                if (playerValue === null || playerValue === undefined) return false;
                return playerValue.toString() === d.source.toString();
              });
            });
          }
        }
        
        if (scrapedItem || sourcePlayer) {
          const scrapedOriginalName = scrapedItem?.data?.displayName || 
            `${scrapedItem?.data?.firstName || ''} ${scrapedItem?.data?.lastName || ''}`.trim();
          const sourceOriginalName = sourcePlayer?.displayName || sourcePlayer?.player ||
            `${sourcePlayer?.firstName || ''} ${sourcePlayer?.lastName || ''}`.trim();
          
          // Mark as processed
          if (scrapedOriginalName) processedScraped.add(scrapedOriginalName);
          if (sourceOriginalName) processedSource.add(sourceOriginalName);
          
          // Check if names are different but matched (indicates name mapping)
          if (scrapedOriginalName && sourceOriginalName && 
              normalizeName(scrapedOriginalName) !== normalizeName(sourceOriginalName)) {
            mappedFields.name = true;
          }
          
          aligned.push({
            scraped: scrapedItem,
            source: sourcePlayer,
            playerName: scrapedOriginalName || sourceOriginalName || match.player || 'Unknown Player',
            normalizedName: normalizeName(scrapedOriginalName || sourceOriginalName || match.player),
            mappings: mappedFields
          });
          
          console.log(`Match ${index}:`, {
            playerName: scrapedOriginalName || sourceOriginalName || match.player,
            hasMappings: Object.keys(mappedFields).length > 0,
            mappings: mappedFields
          });
        }
      });
    }
    
    // Process players missing in source
    if (comparisonResult.missingInSource && Array.isArray(comparisonResult.missingInSource)) {
      console.log('Processing missing in source:', comparisonResult.missingInSource.length);

      comparisonResult.missingInSource.forEach(missingPlayer => {
        // Skip ignored players in side-by-side view
        if (missingPlayer.isIgnored) {
          console.log(`Skipping ignored player in side-by-side: ${missingPlayer.player}`);
          return;
        }

        const playerName = missingPlayer.displayName || missingPlayer.player ||
          `${missingPlayer.firstName || ''} ${missingPlayer.lastName || ''}`.trim();

        if (!processedScraped.has(playerName)) {
          let scrapedItem = scrapedByOriginalName.get(playerName) ||
                           scrapedByNormalizedName.get(normalizeName(playerName));

          if (scrapedItem) {
            processedScraped.add(playerName);
            aligned.push({
              scraped: scrapedItem,
              source: null,
              playerName: playerName,
              normalizedName: normalizeName(playerName),
              mappings: {}
            });
          }
        }
      });
    }
    
    // Process players missing in scraped
    if (comparisonResult.missingInScraped && Array.isArray(comparisonResult.missingInScraped)) {
      console.log('Processing missing in scraped:', comparisonResult.missingInScraped.length);

      comparisonResult.missingInScraped.forEach(missingPlayer => {
        // Skip ignored players in side-by-side view
        if (missingPlayer.isIgnored) {
          console.log(`Skipping ignored player in side-by-side: ${missingPlayer.player}`);
          return;
        }

        const playerName = missingPlayer.player || missingPlayer.displayName ||
          `${missingPlayer.firstName || ''} ${missingPlayer.lastName || ''}`.trim();

        if (!processedSource.has(playerName)) {
          let sourcePlayer = sourceByOriginalName.get(playerName) ||
                            sourceByNormalizedName.get(normalizeName(playerName));

          if (sourcePlayer) {
            processedSource.add(playerName);
            aligned.push({
              scraped: null,
              source: sourcePlayer,
              playerName: playerName,
              normalizedName: normalizeName(playerName),
              mappings: {}
            });
          }
        }
      });
    }
    
    // Add any remaining unprocessed players (but skip ignored ones)
    scrapedData.forEach(item => {
      const playerName = item.data?.displayName ||
        `${item.data?.firstName || ''} ${item.data?.lastName || ''}`.trim();
      const normalizedPlayerName = normalizeName(playerName);

      // Skip if already processed or if ignored
      if (!processedScraped.has(playerName) && !ignoredPlayers.has(normalizedPlayerName)) {
        console.log('Adding unprocessed scraped player:', playerName);
        aligned.push({
          scraped: item,
          source: null,
          playerName: playerName,
          normalizedName: normalizedPlayerName,
          mappings: {}
        });
      } else if (ignoredPlayers.has(normalizedPlayerName)) {
        console.log('Skipping ignored unprocessed scraped player:', playerName);
      }
    });

    sourceData.forEach(player => {
      const playerName = player.displayName || player.player ||
        `${player.firstName || ''} ${player.lastName || ''}`.trim();
      const normalizedPlayerName = normalizeName(playerName);

      // Skip if already processed or if ignored
      if (!processedSource.has(playerName) && !ignoredPlayers.has(normalizedPlayerName)) {
        console.log('Adding unprocessed source player:', playerName);
        aligned.push({
          scraped: null,
          source: player,
          playerName: playerName,
          normalizedName: normalizedPlayerName,
          mappings: {}
        });
      } else if (ignoredPlayers.has(normalizedPlayerName)) {
        console.log('Skipping ignored unprocessed source player:', playerName);
      }
    });
    
    // Sort by player name
    aligned.sort((a, b) => (a.playerName || '').localeCompare(b.playerName || ''));
    
    console.log('Final aligned data:', {
      total: aligned.length,
      withMappings: aligned.filter(a => Object.keys(a.mappings).length > 0).length,
      mappedFields: comparisonResult.mappedFields
    });
    
    return aligned;
  }, [scrapedData, sourceData, comparisonResult, isScheduleComparison]);

  // Update aligned data when source data changes
  React.useEffect(() => {
    setAlignedData(createAlignedData());
  }, [createAlignedData]);

  // Synchronize row heights after render
  React.useEffect(() => {
    const syncRowHeights = () => {
      if (!leftTableRef.current || !rightTableRef.current) return;
      
      const leftRows = leftTableRef.current.querySelectorAll('tbody tr');
      const rightRows = rightTableRef.current.querySelectorAll('tbody tr');
      
      // Reset heights first
      leftRows.forEach(row => {
        row.style.height = '';
      });
      rightRows.forEach(row => {
        row.style.height = '';
      });
      
      // Measure and apply max height
      leftRows.forEach((leftRow, index) => {
        if (rightRows[index]) {
          const leftHeight = leftRow.getBoundingClientRect().height;
          const rightHeight = rightRows[index].getBoundingClientRect().height;
          const maxHeight = Math.max(leftHeight, rightHeight);
          
          leftRow.style.height = `${maxHeight}px`;
          rightRows[index].style.height = `${maxHeight}px`;
        }
      });
    };
    
    // Sync heights after a small delay to ensure rendering is complete
    const timeoutId = setTimeout(syncRowHeights, 100);
    
    // Re-sync on window resize
    window.addEventListener('resize', syncRowHeights);
    
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', syncRowHeights);
    };
  }, [alignedData, filter]);

  // Check if two values are different
  const isDifferent = (val1, val2, field) => {
    if (!val1 || !val2) return false;
    
    if (field === 'height') {
      const normalizeHeight = (height) => {
        const heightStr = height.toString().trim();
        
        if (/^\d+$/.test(heightStr)) {
          return parseInt(heightStr);
        }
        
        const match = heightStr.match(/(\d+)['\-](\d+)/);
        if (match) {
          return parseInt(match[1]) * 12 + parseInt(match[2]);
        }
        
        return null;
      };
      
      const h1 = normalizeHeight(val1);
      const h2 = normalizeHeight(val2);
      
      if (h1 === null || h2 === null) return val1.toString() !== val2.toString();
      
      return Math.abs(h1 - h2) > 1;
    }
    
    if (field === 'weight') {
      const weight1 = parseInt(val1);
      const weight2 = parseInt(val2);
      return Math.abs(weight1 - weight2) > 5;
    }
    
    if (field === 'position') {
      return val1.toString().toUpperCase() !== val2.toString().toUpperCase();
    }
    
    if (field === 'year' || field === 'eligibility') {
      return val1.toString().toLowerCase() !== val2.toString().toLowerCase();
    }
    
    return val1.toString() !== val2.toString();
  };

  const isMapped = (playerMappings, field) => {
    return playerMappings && playerMappings[field] === true;
  };

  const getCellClass = (scraped, source, field, playerMappings) => {
    if (!scraped || !source) return '';
    
    const different = isDifferent(scraped, source, field);
    if (!different) return '';
    
    if (isMapped(playerMappings, field)) {
      return 'mapped';
    }
    
    return 'different';
  };

  // Synchronized scrolling
  const handleScroll = (scrolledTable, otherTable) => {
    if (otherTable.current && scrolledTable.current) {
      otherTable.current.scrollTop = scrolledTable.current.scrollTop;
    }
  };
  
  // Filter aligned data
  const filteredData = filter ? alignedData.filter(row => {
    const searchTerm = filter.toLowerCase();
    return row.playerName?.toLowerCase().includes(searchTerm) ||
           row.scraped?.data?.jersey?.toString().includes(searchTerm) ||
           row.source?.jersey?.toString().includes(searchTerm) ||
           row.scraped?.data?.position?.toLowerCase().includes(searchTerm) ||
           row.source?.position?.toLowerCase().includes(searchTerm);
  }) : alignedData;

  // Early return AFTER all hooks
  if (!scrapedData || !sourceData) {
    return <div className="loading-message">Loading data...</div>;
  }

  // Schedule comparison view - side-by-side tables
  if (isScheduleComparison) {
    // Check if this is NBA (hide Location and Conference columns for NBA)
    const isNBA = selectedModule?.includes('nba');
    const isMLB = selectedModule?.includes('mlb');
    const isProSport = isNBA || isMLB; // Pro sports: hide Location, Conf columns
    // ESPN modules now use team-specific endpoint with full data (neutralSite, venue, location, conference)
    const isESPN = isEspnModule(selectedModule);

    // Helper to format date as M/D for MLB (single-year season)
    const formatShortDate = (dateStr) => {
      if (!dateStr) return '-';
      if (isMLB) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          return `${parseInt(parts[1])}/${parseInt(parts[2])}`;
        }
      }
      return dateStr;
    };

    // Build aligned schedule data similar to roster
    const allGames = [];
    const processedDates = new Set();

    // Add matched games
    if (comparisonResult?.matches) {
      comparisonResult.matches.forEach(match => {
        allGames.push({
          date: match.date,
          scraped: match.scraped,
          source: match.source,
          mappedFields: match.mappedFields || {}, // Track which fields are mapped
          status: 'matched'
        });
        processedDates.add(match.date);
      });
    }

    // Add games with discrepancies
    if (comparisonResult?.discrepancies) {
      comparisonResult.discrepancies.forEach(item => {
        if (!processedDates.has(item.date)) {
          allGames.push({
            date: item.date,
            scraped: item.scraped,
            source: item.source,
            status: 'discrepancy',
            discrepancies: item.discrepancies,
            mappedFields: item.mappedFields || {} // Track which fields are mapped
          });
          processedDates.add(item.date);
        }
      });
    }

    // Add missing in scraped (Oracle only)
    if (comparisonResult?.missingInScraped) {
      comparisonResult.missingInScraped.forEach(item => {
        allGames.push({
          date: item.date,
          scraped: null,
          source: item.game,
          status: 'missing-scraped'
        });
      });
    }

    // Add missing in source (Sidearm only) - but filter out ignored games
    if (comparisonResult?.missingInSource) {
      comparisonResult.missingInSource.forEach(item => {
        // Skip ignored games from the side-by-side view
        if (!ignoredGames.has(item.date)) {
          allGames.push({
            date: item.date,
            scraped: item.game,
            source: null,
            status: 'missing-source'
          });
        }
      });
    }

    // Sort by date
    allGames.sort((a, b) => new Date(a.date) - new Date(b.date));

    // When issuesOnly is set, filter out perfect matches (bulk schedule view)
    const displayGames = issuesOnly
      ? allGames.filter(g => g.status !== 'matched')
      : allGames;

    const getCellClass = (scrapedVal, sourceVal, field, discrepancies, mappedFields) => {
      // FIRST check for discrepancies - this takes priority regardless of empty values
      const hasDiff = discrepancies?.some(d => d.field === field);
      if (hasDiff) {
        return 'different';
      }

      // For fields where one side is empty and the other isn't, skip styling
      // (unless there's an explicit discrepancy checked above)
      if (!scrapedVal || !sourceVal) return '';

      // If no discrepancies but field is mapped, show as mapped (blue)
      if (mappedFields && mappedFields[field]) {
        return 'mapped';
      }

      return '';
    };

    // Helper to render TV cell content with per-broadcaster color coding
    const renderTvCell = (tvString, otherTvString, discrepancies, mappedFields) => {
      if (!tvString) return '-';

      // If no discrepancies at all for TV, just show plain text
      const hasTvDisc = discrepancies?.some(d => d.field === 'tv');
      const hasTvMapped = mappedFields?.tv;

      if (!hasTvDisc && !hasTvMapped) return tvString;

      // Get the individual broadcasters
      const broadcasters = tvString.split(',').map(b => b.trim()).filter(Boolean);
      const otherBroadcasters = (otherTvString || '').split(',').map(b => b.trim()).filter(Boolean);

      // Build sets for quick lookup
      const otherSet = new Set(otherBroadcasters.map(b => b.toLowerCase()));
      const tvDiscs = (discrepancies || []).filter(d => d.field === 'tv');
      const discBroadcasters = new Set(tvDiscs.map(d => (d.broadcaster || d.scraped || d.source || '').toLowerCase()));
      const mappedItems = mappedFields?.tvMappedItems || [];
      const mappedBroadcasters = new Set(mappedItems.flatMap(m => [
        (m.scraped || '').toLowerCase(),
        (m.source || '').toLowerCase()
      ]));

      return (
        <span>
          {broadcasters.map((b, i) => {
            const bLower = b.toLowerCase();
            const isDirectMatch = otherSet.has(bLower);
            const isMapped = mappedBroadcasters.has(bLower);
            const isDiscrepancy = discBroadcasters.has(bLower);

            let className = '';
            if (isDiscrepancy) {
              className = 'tv-broadcaster-unmatched';
            } else if (isMapped) {
              className = 'tv-broadcaster-mapped';
            }
            // Direct matches have no special class (default text color)

            return (
              <span key={b}>
                {i > 0 && ', '}
                <span className={className}>{b}</span>
              </span>
            );
          })}
        </span>
      );
    };

    if (issuesOnly && displayGames.length === 0) {
      return (
        <div className="expanded-details-empty">
          <CheckCircle size={20} />
          <span>No schedule discrepancies - all games match perfectly</span>
        </div>
      );
    }

    return (
      <div className="side-by-side-container">
        <div className="side-by-side-header">
          <h3>Schedule Comparison{issuesOnly ? ` — ${displayGames.length} game${displayGames.length !== 1 ? 's' : ''} with issues` : ''}</h3>
        </div>

        <div className="aligned-comparison">
          <div className="comparison-column">
            <div className="column-header">
              <h3>Scraped Data ({comparisonResult?.totalScraped || 0} games)</h3>
            </div>
            <div
              className="aligned-table-wrapper"
              ref={leftTableRef}
              onScroll={() => handleScroll(leftTableRef, rightTableRef)}
            >
              <table className="aligned-table">
                <thead>
                  <tr>
                    <th style={{ width: isMLB ? '7%' : '9%' }}>Date</th>
                    <th style={{ width: '6%' }}>Time</th>
                    <th style={{ width: isMLB ? '20%' : '15%' }}>Opponent</th>
                    {isESPN && <th style={{ width: '10%' }}>Nickname</th>}
                    {!isMLB && <th style={{ width: '5%' }}>Loc</th>}
                    {!isMLB && <th style={{ width: '5%' }}>H/A</th>}
                    <th style={{ width: isESPN ? '14%' : isMLB ? '22%' : '17%' }}>Venue</th>
                    {!isProSport && <th style={{ width: isESPN ? '11%' : '14%' }}>Location</th>}
                    <th style={{ width: isMLB ? '15%' : '10%' }}>TV</th>
                    {!isProSport && <th style={{ width: '8%' }}>Conf</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayGames.map((game, index) => {
                    const scraped = game.scraped;
                    const source = game.source;

                    return (
                      <tr key={index} className={!scraped ? 'missing-row' : ''} data-row-index={index}>
                        <td><div className="cell-content">{formatShortDate(scraped?.gameDate || scraped?.date) || '-'}</div></td>
                        <td className={getCellClass(scraped?.time24 || scraped?.time, source?.time24 || source?.time, 'time', game.discrepancies, game.mappedFields)}>
                          <div className="cell-content">{scraped?.time24 || scraped?.time || '-'}</div>
                        </td>
                        <td className={getCellClass(scraped?.opponent, source?.opponentName || source?.opponent, 'opponent', game.discrepancies, game.mappedFields)}>
                          <div className="cell-content">
                            {scraped?.opponent || '-'}
                            {scraped?.tournament && (
                              <Trophy size={14} style={{ marginLeft: '4px', display: 'inline', verticalAlign: 'middle', color: '#f59e0b' }} />
                            )}
                          </div>
                        </td>
                        {isESPN && (
                          <td>
                            <div className="cell-content">{scraped?.opponentNickname || '-'}</div>
                          </td>
                        )}
                        {!isMLB && (
                          <td className={getCellClass(scraped?.locationIndicator, source?.locationIndicator, 'locationIndicator', game.discrepancies, game.mappedFields)}>
                            <div className="cell-content">{scraped?.locationIndicator || '-'}</div>
                          </td>
                        )}
                        {!isMLB && (
                          <td className={scraped?.locationIndicator === 'N' ? getCellClass(
                            scraped?.neutralHometeam ? 'H' : 'A',
                            source?.isHome ? 'H' : 'A',
                            'neutralHomeAway',
                            game.discrepancies,
                            game.mappedFields
                          ) : ''}>
                            <div className="cell-content">
                              {scraped?.locationIndicator === 'N' ? (scraped?.neutralHometeam ? 'H' : 'A') : '-'}
                            </div>
                          </td>
                        )}
                        <td className={getCellClass(scraped?.venue, source?.venue, 'venue', game.discrepancies, game.mappedFields)}>
                          <div className="cell-content">{scraped?.venue || '-'}</div>
                        </td>
                        {!isProSport && (
                          <td className={getCellClass(scraped?.location, source?.location, 'location', game.discrepancies, game.mappedFields)}>
                            <div className="cell-content">{scraped?.location || '-'}</div>
                          </td>
                        )}
                        <td className={getCellClass(scraped?.tv, source?.tv, 'tv', game.discrepancies, game.mappedFields)}>
                          <div className="cell-content">{renderTvCell(scraped?.tv, source?.tv, game.discrepancies, game.mappedFields)}</div>
                        </td>
                        {!isProSport && (
                          <td className={getCellClass(scraped?.isConferenceGame, source?.isConferenceGame, 'isConferenceGame', game.discrepancies, game.mappedFields)}>
                            <div className="cell-content">{scraped?.isConferenceGame ? 'Yes' : scraped ? 'No' : '-'}</div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="comparison-column">
            <div className="column-header">
              <h3>{source === 'oracle' ? 'Oracle' : 'Baseline'} Data ({comparisonResult?.totalSource || 0} games)</h3>
            </div>
            <div
              className="aligned-table-wrapper"
              ref={rightTableRef}
              onScroll={() => handleScroll(rightTableRef, leftTableRef)}
            >
              <table className="aligned-table">
                <thead>
                  <tr>
                    <th style={{ width: isMLB ? '7%' : '9%' }}>Date</th>
                    <th style={{ width: '6%' }}>Time</th>
                    <th style={{ width: isMLB ? '25%' : '12%' }}>Opponent</th>
                    {!isMLB && <th style={{ width: '10%' }}>Nickname</th>}
                    {!isMLB && <th style={{ width: '5%' }}>Loc</th>}
                    {!isMLB && <th style={{ width: '5%' }}>H/A</th>}
                    <th style={{ width: isMLB ? '22%' : '15%' }}>Venue</th>
                    {!isProSport && <th style={{ width: '13%' }}>Location</th>}
                    <th style={{ width: isMLB ? '15%' : '9%' }}>TV</th>
                    {!isProSport && <th style={{ width: '6%' }}>Conf</th>}
                  </tr>
                </thead>
                <tbody>
                  {displayGames.map((game, index) => {
                    const scraped = game.scraped;
                    const source = game.source;

                    return (
                      <tr key={index} className={!source ? 'missing-row' : ''} data-row-index={index}>
                        <td><div className="cell-content">{formatShortDate(source?.gameDate || source?.date) || '-'}</div></td>
                        <td className={getCellClass(scraped?.time24 || scraped?.time, source?.time24 || source?.time, 'time', game.discrepancies, game.mappedFields)}>
                          <div className="cell-content">{source?.time24 || source?.time || '-'}</div>
                        </td>
                        <td className={getCellClass(scraped?.opponent, source?.opponentName || source?.opponent, 'opponent', game.discrepancies, game.mappedFields)}>
                          <div className="cell-content">{source?.opponentName || source?.opponent || '-'}</div>
                        </td>
                        {!isMLB && (
                          <td>
                            <div className="cell-content">{source?.opponentNickname || '-'}</div>
                          </td>
                        )}
                        {!isMLB && (
                          <td className={getCellClass(scraped?.locationIndicator, source?.locationIndicator, 'locationIndicator', game.discrepancies, game.mappedFields)}>
                            <div className="cell-content">{source?.locationIndicator || '-'}</div>
                          </td>
                        )}
                        {!isMLB && (
                          <td className={source?.locationIndicator === 'N' ? getCellClass(
                            scraped?.neutralHometeam ? 'H' : 'A',
                            source?.isHome ? 'H' : 'A',
                            'neutralHomeAway',
                            game.discrepancies,
                            game.mappedFields
                          ) : ''}>
                            <div className="cell-content">
                              {source?.locationIndicator === 'N' ? (source?.isHome ? 'H' : 'A') : '-'}
                            </div>
                          </td>
                        )}
                        <td className={getCellClass(scraped?.venue, source?.venue, 'venue', game.discrepancies, game.mappedFields)}>
                          <div className="cell-content">{source?.venue || '-'}</div>
                        </td>
                        {!isProSport && (
                          <td className={getCellClass(scraped?.location, source?.location, 'location', game.discrepancies, game.mappedFields)}>
                            <div className="cell-content">{source?.location || '-'}</div>
                          </td>
                        )}
                        <td className={getCellClass(scraped?.tv, source?.tv, 'tv', game.discrepancies, game.mappedFields)}>
                          <div className="cell-content">{renderTvCell(source?.tv, scraped?.tv, game.discrepancies, game.mappedFields)}</div>
                        </td>
                        {!isProSport && (
                          <td className={getCellClass(scraped?.isConferenceGame, source?.isConferenceGame, 'isConferenceGame', game.discrepancies, game.mappedFields)}>
                            <div className="cell-content">{source?.isConferenceGame ? 'Yes' : source ? 'No' : '-'}</div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Player comparison view (roster)
  return (
    <div className="side-by-side-container">
      <div className="side-by-side-header">
        <div className="filter-input-wrapper">
          <Search size={18} className="filter-icon" />
          <input
            type="text"
            placeholder="Filter players..."
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="filter-input"
          />
        </div>
        <div className="comparison-legend">
          <span className="legend-item">
            <span className="legend-color different"></span> Data Mismatch
          </span>
          <span className="legend-item">
            <span className="legend-color mapped"></span> Mapped Difference
          </span>
          <span className="legend-item">
            <span className="legend-color missing"></span> Missing Player
          </span>
        </div>
      </div>
      
      <div className="aligned-comparison">
        <div className="comparison-column">
          <div className="column-header">
            <h3>Scraped Data ({scrapedData.length} players)</h3>
          </div>
          <div 
            className="aligned-table-wrapper"
            ref={leftTableRef}
            onScroll={() => handleScroll(leftTableRef, rightTableRef)}
          >
            <table className="aligned-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Jersey</th>
                  <th style={{ width: '30%' }}>Name</th>
                  <th style={{ width: '20%' }}>Position</th>
                  <th style={{ width: '15%' }}>Year</th>
                  <th style={{ width: '15%' }}>Height</th>
                  <th style={{ width: '15%' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => {
                  const scraped = row.scraped?.data;
                  const source = row.source;
                  const playerMappings = row.mappings;
                  
                  return (
                    <tr key={index} className={!scraped ? 'missing-row' : ''} data-row-index={index}>
                      <td className={getCellClass(scraped?.jersey, source?.jersey, 'jersey', playerMappings)}>
                        <div className="cell-content">{scraped?.jersey || '-'}</div>
                      </td>
                      <td className={isMapped(playerMappings, 'name') ? 'name-cell mapped' : 'name-cell'}>
                        <div className="cell-content">
                          {scraped ? (scraped.displayName || `${scraped.firstName || ''} ${scraped.lastName || ''}`) : '-'}
                        </div>
                      </td>
                      <td className={getCellClass(scraped?.position, source?.position || source?.positionAbbr, 'position', playerMappings)}>
                        <div className="cell-content">{scraped?.position || '-'}</div>
                      </td>
                      <td className={getCellClass(scraped?.year, source?.year || source?.eligibility, 'year', playerMappings)}>
                        <div className="cell-content">{scraped?.year || '-'}</div>
                      </td>
                      <td className={getCellClass(scraped?.height, source?.height, 'height', playerMappings)}>
                        <div className="cell-content">{scraped?.height || '-'}</div>
                      </td>
                      <td className={getCellClass(scraped?.weight, source?.weight, 'weight', playerMappings)}>
                        <div className="cell-content">{scraped?.weight ? `${scraped.weight} lbs` : '-'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="comparison-column">
          <div className="column-header">
            <h3>{source === 'api' ? 'Stats API' : 'Oracle'} Data ({sourceData.length} players)</h3>
          </div>
          <div 
            className="aligned-table-wrapper"
            ref={rightTableRef}
            onScroll={() => handleScroll(rightTableRef, leftTableRef)}
          >
            <table className="aligned-table">
              <thead>
                <tr>
                  <th style={{ width: '60px' }}>Jersey</th>
                  <th style={{ width: '30%' }}>Name</th>
                  <th style={{ width: '20%' }}>Position</th>
                  <th style={{ width: '15%' }}>Year</th>
                  <th style={{ width: '15%' }}>Height</th>
                  <th style={{ width: '15%' }}>Weight</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row, index) => {
                  const scraped = row.scraped?.data;
                  const source = row.source;
                  const playerMappings = row.mappings;
                  
                  return (
                    <tr key={index} className={!source ? 'missing-row' : ''} data-row-index={index}>
                      <td className={getCellClass(scraped?.jersey, source?.jersey, 'jersey', playerMappings)}>
                        <div className="cell-content">{source?.jersey || '-'}</div>
                      </td>
                      <td className={isMapped(playerMappings, 'name') ? 'name-cell mapped' : 'name-cell'}>
                        <div className="cell-content">
                          {source ? (source.displayName || source.player || `${source.firstName || ''} ${source.lastName || ''}`) : '-'}
                        </div>
                      </td>
                      <td className={getCellClass(scraped?.position, source?.position || source?.positionAbbr, 'position', playerMappings)}>
                        <div className="cell-content">{source?.position || source?.positionAbbr || '-'}</div>
                      </td>
                      <td className={getCellClass(scraped?.year, source?.year || source?.eligibility, 'year', playerMappings)}>
                        <div className="cell-content">{source?.year || source?.eligibility || '-'}</div>
                      </td>
                      <td className={getCellClass(scraped?.height, source?.height, 'height', playerMappings)}>
                        <div className="cell-content">{source?.height || '-'}</div>
                      </td>
                      <td className={getCellClass(scraped?.weight, source?.weight, 'weight', playerMappings)}>
                        <div className="cell-content">{source?.weight ? `${source.weight} lbs` : '-'}</div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// Discrepancies View Component with Mapping Creation
function DiscrepanciesView({ comparison, team, source, isScheduleComparison, sourceData, scrapedData }) {
  const toast = useToast();
  const [filter, setFilter] = useState('all'); // all, jersey, position, weight, year (for players) or opponent, tv, venue, etc. (for schedules)
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [mappingData, setMappingData] = useState(null);
  const [tvMappingSelections, setTvMappingSelections] = useState({}); // Track TV mapping selections by oracle value
  const [savingTvMapping, setSavingTvMapping] = useState(null); // Track which TV mapping is being saved
  const [savedTvMappings, setSavedTvMappings] = useState({}); // Track successfully saved mappings { oracleValue: scrapedValue }

  // Collect all unique scraped TV values for dropdown options
  // scrapedData is an array of ScrapedData documents, each with a .data property containing the actual game data
  const allScrapedTvOptions = React.useMemo(() => {
    if (!isScheduleComparison || !scrapedData) return [];
    const tvSet = new Set();
    scrapedData.forEach(item => {
      const game = item.data || item;
      if (game.tvArray) {
        game.tvArray.forEach(tv => tvSet.add(tv));
      } else if (game.tv) {
        game.tv.split(',').map(t => t.trim()).filter(Boolean).forEach(tv => tvSet.add(tv));
      }
    });
    return [...tvSet].sort();
  }, [isScheduleComparison, scrapedData]);

  // Collect all unique source (Oracle) TV values for dropdown options
  const allSourceTvOptions = React.useMemo(() => {
    if (!isScheduleComparison || !sourceData) return [];
    const tvSet = new Set();
    const items = Array.isArray(sourceData) ? sourceData : [];
    items.forEach(item => {
      const game = item.data || item;
      if (game.tvArray) {
        game.tvArray.forEach(tv => tvSet.add(tv));
      } else if (game.tv) {
        game.tv.split(',').map(t => t.trim()).filter(Boolean).forEach(tv => tvSet.add(tv));
      }
    });
    return [...tvSet].sort();
  }, [isScheduleComparison, sourceData]);

  if (!comparison.discrepancies || comparison.discrepancies.length === 0) {
    return (
      <div className="no-discrepancies">
        <div className="success-animation">
          <CheckCircle size={64} className="success-icon" />
        </div>
        <h3>Perfect Data Match!</h3>
        <p>All matched {isScheduleComparison ? 'games' : 'players'} have consistent data across both sources.</p>
      </div>
    );
  }

  const getFieldLabel = (field) => {
    if (isScheduleComparison) {
      const scheduleLabels = {
        opponent: 'Opponent',
        locationIndicator: 'Location',
        venue: 'Venue',
        tv: 'TV Network',
        isConferenceGame: 'Conference Game',
        time: 'Game Time',
        location: 'Stadium Location'
      };
      return scheduleLabels[field] || field;
    }

    const labels = {
      jersey: 'Jersey Number',
      position: 'Position',
      weight: 'Weight',
      year: 'Year/Class',
      height: 'Height'
    };
    return labels[field] || field;
  };

  const getFieldIcon = (field) => {
    if (isScheduleComparison) {
      const scheduleIcons = {
        opponent: <User size={16} />,
        locationIndicator: <MapPin size={16} />,
        venue: <Building size={16} />,
        tv: <Activity size={16} />,
        isConferenceGame: <Trophy size={16} />,
        time: <Calendar size={16} />,
        location: <Globe size={16} />
      };
      return scheduleIcons[field] || <Info size={16} />;
    }

    const iconComponents = {
      jersey: <Hash size={16} />,
      position: <MapPin size={16} />,
      weight: <Scale size={16} />,
      year: <Calendar size={16} />,
      height: <Ruler size={16} />
    };
    return iconComponents[field] || <Info size={16} />;
  };

  // Filter discrepancies
  const filteredDiscrepancies = filter === 'all'
    ? comparison.discrepancies
    : comparison.discrepancies.filter(item =>
        item.discrepancies.some(d => d.field === filter)
      );

  // Count discrepancies by type - dynamically based on what discrepancies actually exist
  const discrepancyCounts = {};

  comparison.discrepancies.forEach(item => {
    item.discrepancies.forEach(d => {
      if (d.field) {
        discrepancyCounts[d.field] = (discrepancyCounts[d.field] || 0) + 1;
      }
    });
  });

  const toggleExpanded = (index) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedItems(newExpanded);
  };

  const handleCreateMapping = (discrepancy, playerName) => {
    // Determine mapping type based on field
    let mappingType = 'equivalence';
    let rules = {};

    if (discrepancy.field === 'weight' || discrepancy.field === 'height') {
      mappingType = 'tolerance';
      const val1 = parseFloat(discrepancy.scraped);
      const val2 = parseFloat(discrepancy.source);
      rules = {
        tolerance: Math.abs(val1 - val2),
        toleranceType: 'absolute'
      };
    } else {
      rules = {
        primaryValue: discrepancy.source,
        equivalents: [discrepancy.scraped],
        caseSensitive: false
      };
    }

    // Format data for MappingModal component
    const initialData = {
      fieldType: discrepancy.field,
      mappingType,
      rules,
      scope: {
        level: 'team',
        teamId: team.teamId,
        league: team.league,
        sport: team.sport
      }
    };

    setMappingData(initialData);
    setShowMappingModal(true);
  };

  const handleMappingSaved = () => {
    // Close modal - don't refresh, let user make multiple changes
    setShowMappingModal(false);
    setMappingData(null);
    // Removed window.location.reload() - user can manually re-run comparison when ready
  };

  // Handle TV mapping selection change
  const handleTvMappingSelect = (broadcasterKey, selectedValue) => {
    setTvMappingSelections(prev => ({
      ...prev,
      [broadcasterKey]: selectedValue
    }));
  };

  // Save a single TV mapping (equivalence or ignore)
  const handleSaveTvMapping = async (broadcasterKey) => {
    const selectedValue = tvMappingSelections[broadcasterKey];
    if (!selectedValue) return;

    const isIgnore = selectedValue === 'IGNORE';

    setSavingTvMapping(broadcasterKey);
    try {
      if (isIgnore) {
        await axios.post('/mappings/create', {
          mappingType: 'ignore',
          fieldType: 'tv',
          scope: {
            level: 'league',
            league: team?.league || 'MLB'
          },
          rules: {
            primaryValue: broadcasterKey,
            caseSensitive: false,
            ignoreReason: `Ignored TV broadcaster: ${broadcasterKey}`
          },
          appliesTo: { scraped: true, api: true, oracle: true },
          notes: `TV broadcaster ignored: ${broadcasterKey}`
        });
        toast.success(`Ignoring "${broadcasterKey}" in TV comparisons`);
      } else {
        await axios.post('/mappings/create', {
          mappingType: 'equivalence',
          fieldType: 'tv',
          scope: {
            level: 'league',
            league: team?.league || 'MLB'
          },
          rules: {
            primaryValue: broadcasterKey,
            equivalents: [selectedValue],
            caseSensitive: false
          },
          appliesTo: { scraped: true, api: true, oracle: true },
          notes: `TV broadcaster mapping: ${broadcasterKey} = ${selectedValue}`
        });
        toast.success(`Mapped "${broadcasterKey}" → "${selectedValue}"`);
      }

      // Track the saved mapping to show success state
      setSavedTvMappings(prev => ({
        ...prev,
        [broadcasterKey]: selectedValue
      }));

      // Clear the selection after successful save
      setTvMappingSelections(prev => {
        const updated = { ...prev };
        delete updated[broadcasterKey];
        return updated;
      });
    } catch (error) {
      console.error('Error saving TV mapping:', error);
      toast.error('Failed to save TV mapping: ' + (error.response?.data?.error || error.message));
    } finally {
      setSavingTvMapping(null);
    }
  };

  return (
    <>
      <div className="discrepancies-view">
        <div className="discrepancies-header">
          <div className="header-content">
            <h3>Data Discrepancies Analysis</h3>
            <p>{comparison.discrepancies.length} {isScheduleComparison ? 'games have' : 'players have'} mismatched data</p>
          </div>

          <div className="filter-buttons">
            <button 
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All ({comparison.discrepancies.length})
            </button>
            {Object.entries(discrepancyCounts).map(([field, count]) => (
              count > 0 && (
                <button 
                  key={field}
                  className={filter === field ? 'active' : ''}
                  onClick={() => setFilter(field)}
                >
                  {getFieldIcon(field)}
                  <span>{getFieldLabel(field)} ({count})</span>
                </button>
              )
            ))}
          </div>
        </div>

        <div className="discrepancy-cards">
          {filteredDiscrepancies.map((item, index) => (
            <div 
              key={index} 
              className={`discrepancy-card ${expandedItems.has(index) ? 'expanded' : ''}`}
            >
              <div
                className="card-header"
                onClick={() => toggleExpanded(index)}
              >
                <div className="player-info">
                  {isScheduleComparison ? (
                    <>
                      <span className="player-name">
                        <Calendar size={16} style={{marginRight: '6px', display: 'inline-block', verticalAlign: 'middle'}} />
                        {item.date}
                      </span>
                      {item.scraped?.opponent && (
                        <span className="badge" style={{marginLeft: '8px'}}>vs {item.scraped.opponent}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="player-name">{item.player}</span>
                      {item.sourceJersey && item.scrapedJersey && (
                        <div className="jersey-badges">
                          <span className="badge scraped">#{item.scrapedJersey}</span>
                          {item.sourceJersey !== item.scrapedJersey && (
                            <>
                              <span className="arrow">→</span>
                              <span className="badge source">#{item.sourceJersey}</span>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
                <div className="discrepancy-summary">
                  <span className="issue-count">
                    {item.discrepancies.length} issue{item.discrepancies.length > 1 ? 's' : ''}
                  </span>
                  <span className="expand-icon">
                    {expandedItems.has(index) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                </div>
              </div>
              
              {expandedItems.has(index) && (
                <div className="card-content">
                  <div className="discrepancy-grid">
                    {item.discrepancies.map((disc, idx) => (
                      <div key={idx} className="discrepancy-item">
                        <div className="field-header">
                          <span className="field-icon">{getFieldIcon(disc.field)}</span>
                          <span className="field-label">{getFieldLabel(disc.field)}</span>
                          {/* Show different UI for TV fields vs other fields */}
                          {disc.field !== 'tv' && (
                            <button
                              className="btn-create-mapping"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCreateMapping(disc, item.player);
                              }}
                              title="Create mapping to resolve this discrepancy"
                            >
                              <Link2 size={14} />
                              Map
                            </button>
                          )}
                        </div>
                        <div className="value-comparison">
                          <div className="value-box scraped">
                            <span className="source-label">Scraped</span>
                            <span className="value">{disc.scraped || 'N/A'}</span>
                          </div>
                          <div className="versus">≠</div>
                          <div className="value-box source">
                            <span className="source-label">{source === 'api' ? 'API' : 'Oracle'}</span>
                            <span className="value">{disc.source || 'N/A'}</span>
                          </div>
                        </div>
                        {/* TV Mapping inline dropdown - handles both scraped-only and source-only broadcasters */}
                        {disc.field === 'tv' && isScheduleComparison && (() => {
                          // Determine which broadcaster needs mapping
                          // If scraped has a value but source doesn't, the scraped broadcaster is unmatched
                          // If source has a value but scraped doesn't, the source broadcaster is unmatched
                          const unmatchedBroadcaster = disc.broadcaster || disc.source || disc.scraped;
                          const isScrapedOnly = disc.scraped && !disc.source;
                          const isSourceOnly = disc.source && !disc.scraped;
                          const dropdownOptions = isScrapedOnly ? allSourceTvOptions : allScrapedTvOptions;
                          const dropdownLabel = isScrapedOnly ? `Map "${disc.scraped}" to:` : `Map "${disc.source}" to:`;
                          const dropdownPlaceholder = isScrapedOnly ? '-- Select Oracle TV --' : '-- Select scraped TV --';
                          const mapKey = unmatchedBroadcaster;

                          if (!mapKey) return null;

                          return (
                            <div className={`tv-mapping-inline ${savedTvMappings[mapKey] ? 'success' : ''}`}>
                              {savedTvMappings[mapKey] ? (
                                <div className="tv-mapping-row">
                                  <Check size={16} className="success-icon" />
                                  <span className="tv-mapping-label success">
                                    {savedTvMappings[mapKey] === 'IGNORE'
                                      ? `Ignoring "${mapKey}"`
                                      : `Mapped "${mapKey}" → "${savedTvMappings[mapKey]}"`}
                                  </span>
                                </div>
                              ) : (
                                <div className="tv-mapping-row">
                                  <span className="tv-mapping-label">
                                    {dropdownLabel}
                                  </span>
                                  <select
                                    className="tv-mapping-select"
                                    value={tvMappingSelections[mapKey] || ''}
                                    onChange={(e) => handleTvMappingSelect(mapKey, e.target.value)}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <option value="">{dropdownPlaceholder}</option>
                                    <option value="IGNORE">IGNORE (Skip in comparison)</option>
                                    {dropdownOptions.map(opt => (
                                      <option key={opt} value={opt}>{opt}</option>
                                    ))}
                                  </select>
                                  <button
                                    className="btn-primary btn-sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSaveTvMapping(mapKey);
                                    }}
                                    disabled={!tvMappingSelections[mapKey] || savingTvMapping === mapKey}
                                  >
                                    {savingTvMapping === mapKey ? (
                                      <Loader2 size={14} className="spinner" />
                                    ) : (
                                      <>
                                        <Link2 size={14} />
                                        {tvMappingSelections[mapKey] === 'IGNORE' ? 'Ignore' : 'Map'}
                                      </>
                                    )}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Mapping Creation Modal */}
      <MappingModal
        isOpen={showMappingModal}
        onClose={() => setShowMappingModal(false)}
        onSave={handleMappingSaved}
        initialData={mappingData}
        teams={[team]}
      />
    </>
  );
}

// Bulk Comparison View Component
function BulkComparisonView({
  teams,
  bulkFilters,
  setBulkFilters,
  handleBulkCompare,
  loading,
  bulkJob,
  bulkJobStatus,
  cancelBulkJob,
  clearBulkJob,
  enableInternalFeatures
}) {
  const allModules = [
    { value: 'ncaa_football_roster', label: 'Football Roster', league: 'NCAA' },
    { value: 'ncaa_football_schedule', label: 'Football Schedule', league: 'NCAA' },
    { value: 'ncaa_football_stats', label: 'Football Stats (Game-by-Game)', league: 'NCAA' },
    { value: 'ncaa_mensBasketball_roster', label: "Men's Basketball Roster", league: 'NCAA' },
    { value: 'ncaa_mensBasketball_schedule', label: "Men's Basketball Schedule", league: 'NCAA' },
    { value: 'ncaa_mensBasketball_stats', label: "Men's Basketball Stats (Game-by-Game)", league: 'NCAA' },
    { value: 'ncaa_womensBasketball_roster', label: "Women's Basketball Roster", league: 'NCAA' },
    { value: 'ncaa_womensBasketball_schedule', label: "Women's Basketball Schedule", league: 'NCAA' },
    { value: 'ncaa_womensBasketball_stats', label: "Women's Basketball Stats (Game-by-Game)", league: 'NCAA' },
    { value: 'ncaa_baseball_schedule', label: 'Baseball Schedule', league: 'NCAA' },
    { value: 'nba_schedule', label: 'NBA Schedule', league: 'NBA' },
    { value: 'nba_boxscore', label: 'NBA Boxscore', league: 'NBA' },
    { value: 'mlb_schedule', label: 'MLB Schedule', league: 'MLB' },
    { value: 'mlb_roster', label: 'MLB Roster', league: 'MLB' }
  ];

  // ESPN modules for bulk comparison (uses different endpoint)
  const espnModules = [
    { value: 'espn_ncaa_mbb_schedule', label: "ESPN: Men's Basketball Schedule", league: 'NCAA' },
    { value: 'espn_ncaa_wbb_schedule', label: "ESPN: Women's Basketball Schedule", league: 'NCAA' },
    { value: 'espn_ncaa_cfb_schedule', label: "ESPN: Football Schedule", league: 'NCAA' }
  ];

  // Filter modules based on selected league
  const getModulesForLeague = (league) => {
    if (!league) return [];
    return allModules.filter(mod => mod.league === league);
  };

  const leagues = [...new Set(teams.map(t => t.league))].filter(Boolean).sort();
  const conferences = [...new Set(teams.filter(t => !bulkFilters.league || t.league === bulkFilters.league).map(t => t.conference))].filter(Boolean).sort();
  const divisions = [...new Set(teams.filter(t => !bulkFilters.league || t.league === bulkFilters.league).map(t => t.division))].filter(Boolean).sort();

  const toggleModule = (moduleValue) => {
    setBulkFilters(prev => ({
      ...prev,
      modules: prev.modules.includes(moduleValue)
        ? prev.modules.filter(m => m !== moduleValue)
        : [...prev.modules, moduleValue]
    }));
  };

  return (
    <div className="bulk-comparison-view">
      {!bulkJobStatus ? (
        <>
          <div className="bulk-controls">
            <h3>Select Teams and Modules</h3>

            <div className="control-row">
              <div className="control-group">
                <label><Building size={14} /> League</label>
                <select
                  value={bulkFilters.league}
                  onChange={(e) => {
                    const newLeague = e.target.value;
                    const newSeason = (newLeague === 'MLB' || newLeague === 'NBA') ? new Date().getFullYear() : getDefaultSeason();
                    setBulkFilters({ ...bulkFilters, league: newLeague, conference: '', division: '', teams: [], modules: [], season: newSeason });
                  }}
                >
                  <option value="">All Leagues</option>
                  {leagues.map(league => (
                    <option key={league} value={league}>{league}</option>
                  ))}
                </select>
              </div>

              {/* Only show conference/division for NCAA - NBA/MLB don't use these */}
              {bulkFilters.league && bulkFilters.league !== 'NBA' && bulkFilters.league !== 'MLB' && (
                <>
                  <div className="control-group">
                    <label><Trophy size={14} /> Conference</label>
                    <select
                      value={bulkFilters.conference}
                      onChange={(e) => setBulkFilters({ ...bulkFilters, conference: e.target.value })}
                    >
                      <option value="">All Conferences</option>
                      {conferences.map(conf => (
                        <option key={conf} value={conf}>{conf}</option>
                      ))}
                    </select>
                  </div>

                  <div className="control-group">
                    <label><Shield size={14} /> Division</label>
                    <select
                      value={bulkFilters.division}
                      onChange={(e) => setBulkFilters({ ...bulkFilters, division: e.target.value })}
                    >
                      <option value="">All Divisions</option>
                      {divisions.map(div => (
                        <option key={div} value={div}>{div}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>

            <div className="control-row">
              <div className="control-group">
                <label><Database size={14} /> Compare With</label>
                <select
                  value={bulkFilters.source}
                  onChange={(e) => setBulkFilters({ ...bulkFilters, source: e.target.value })}
                >
                  {enableInternalFeatures && <option value="oracle">Oracle Database</option>}
                  {enableInternalFeatures && <option value="api">Stats API</option>}
                  <option value="baseline">Last Fetched Data</option>
                </select>
              </div>

              <div className="control-group">
                <label><Calendar size={14} /> Season</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <button
                    onClick={() => { const s = bulkFilters.season - 1; if (s >= 2020) setBulkFilters({ ...bulkFilters, season: s }); }}
                    disabled={bulkFilters.season <= 2020}
                    style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: bulkFilters.season <= 2020 ? 'not-allowed' : 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', opacity: bulkFilters.season <= 2020 ? 0.4 : 1 }}
                    title="Previous season"
                  >
                    <ChevronDown size={16} />
                  </button>
                  <span style={{ fontWeight: 600, fontSize: '15px', minWidth: '44px', textAlign: 'center' }}>{bulkFilters.season}</span>
                  <button
                    onClick={() => { const s = bulkFilters.season + 1; if (s <= new Date().getFullYear() + 1) setBulkFilters({ ...bulkFilters, season: s }); }}
                    disabled={bulkFilters.season >= new Date().getFullYear() + 1}
                    style={{ background: 'none', border: '1px solid #ccc', borderRadius: '4px', cursor: bulkFilters.season >= new Date().getFullYear() + 1 ? 'not-allowed' : 'pointer', padding: '4px 6px', display: 'flex', alignItems: 'center', opacity: bulkFilters.season >= new Date().getFullYear() + 1 ? 0.4 : 1 }}
                    title="Next season"
                  >
                    <ChevronUp size={16} />
                  </button>
                </div>
              </div>

            </div>

            <div className="module-selection">
              <label><Activity size={14} /> Modules to Compare</label>
              {!bulkFilters.league ? (
                <div style={{ padding: '1rem', color: '#6c757d', fontSize: '0.9rem', fontStyle: 'italic' }}>
                  Please select a league first to see available modules
                </div>
              ) : getModulesForLeague(bulkFilters.league).length === 0 ? (
                <div style={{ padding: '1rem', color: '#6c757d', fontSize: '0.9rem', fontStyle: 'italic' }}>
                  No modules available for {bulkFilters.league}
                </div>
              ) : (
                <div className="module-checkboxes">
                  {getModulesForLeague(bulkFilters.league).map(mod => (
                    <label key={mod.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={bulkFilters.modules.includes(mod.value)}
                        onChange={() => toggleModule(mod.value)}
                      />
                      {mod.label}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* ESPN Modules Section - only show for NCAA */}
            {bulkFilters.league === 'NCAA' && (
              <div className="module-selection" style={{ marginTop: '1rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Tv size={14} />
                  ESPN Modules (Where to Watch)
                </label>
                <div className="module-checkboxes">
                  {espnModules.map(mod => (
                    <label key={mod.value} className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={bulkFilters.modules.includes(mod.value)}
                        onChange={() => toggleModule(mod.value)}
                      />
                      {mod.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Show date picker if stats, schedule, or boxscore modules are selected */}
            {(bulkFilters.modules.some(m => m.includes('stats') || m.includes('schedule') || m.includes('boxscore'))) && (
              <div className="control-group" style={{
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                border: '1px solid #e9ecef'
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  color: '#495057'
                }}>
                  <Calendar size={16} />
                  {bulkFilters.modules.some(m => m.includes('schedule')) ? 'Start Date' : 'Start Date (Optional)'}
                </label>
                <div style={{ fontSize: '0.85em', color: '#6c757d', marginBottom: '0.75rem' }}>
                  {bulkFilters.modules.some(m => m.includes('schedule'))
                    ? 'Compares games on/after this date (defaults to today if not specified)'
                    : bulkFilters.modules.some(m => m.includes('boxscore'))
                      ? 'Compares boxscores for games on/after this date (leave empty for all games)'
                      : 'Compare only games played on this specific date'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="date"
                    value={bulkFilters.targetDate}
                    onChange={(e) => setBulkFilters({ ...bulkFilters, targetDate: e.target.value, startDate: e.target.value })}
                    style={{
                      padding: '0.625rem 0.75rem',
                      border: '2px solid #ced4da',
                      borderRadius: '6px',
                      fontSize: '0.95rem',
                      flex: '1',
                      maxWidth: '220px',
                      transition: 'border-color 0.15s ease-in-out',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#0d6efd'}
                    onBlur={(e) => e.target.style.borderColor = '#ced4da'}
                  />
                  {bulkFilters.targetDate && (
                    <button
                      className="btn-link"
                      onClick={() => setBulkFilters({ ...bulkFilters, targetDate: '', startDate: '' })}
                      style={{
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <X size={14} />
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Show end date picker for ESPN modules */}
            {bulkFilters.modules.some(m => m.startsWith('espn_')) && (
              <div className="control-group" style={{
                marginTop: '1rem',
                padding: '1rem',
                backgroundColor: '#fff3cd',
                borderRadius: '8px',
                border: '1px solid #ffc107'
              }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  marginBottom: '0.5rem',
                  fontWeight: '500',
                  color: '#856404'
                }}>
                  <Calendar size={16} />
                  End Date (Optional)
                </label>
                <div style={{ fontSize: '0.85em', color: '#856404', marginBottom: '0.75rem' }}>
                  For ESPN modules: limits comparison to games on or before this date
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="date"
                    value={bulkFilters.endDate}
                    onChange={(e) => setBulkFilters({ ...bulkFilters, endDate: e.target.value })}
                    style={{
                      padding: '0.625rem 0.75rem',
                      border: '2px solid #ffc107',
                      borderRadius: '6px',
                      fontSize: '0.95rem',
                      flex: '1',
                      maxWidth: '220px',
                      transition: 'border-color 0.15s ease-in-out',
                      outline: 'none'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#ffca2c'}
                    onBlur={(e) => e.target.style.borderColor = '#ffc107'}
                  />
                  {bulkFilters.endDate && (
                    <button
                      className="btn-link"
                      onClick={() => setBulkFilters({ ...bulkFilters, endDate: '' })}
                      style={{
                        padding: '0.5rem 0.75rem',
                        fontSize: '0.875rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem'
                      }}
                    >
                      <X size={14} />
                      Clear
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="bulk-actions">
              <button
                className="btn-primary large"
                onClick={handleBulkCompare}
                disabled={loading || bulkFilters.modules.length === 0}
              >
                {loading ? (
                  <>
                    <Loader2 size={20} className="spinner" />
                    Starting Bulk Comparison...
                  </>
                ) : (
                  <>
                    <Search size={20} />
                    Run Bulk Comparison
                  </>
                )}
              </button>
            </div>

            {bulkJob && !bulkJobStatus && (
              <div className="job-info">
                <Info className="inline-icon" />
                <p>Job created: {bulkJob.totalOperations} comparisons across {bulkJob.teams} teams</p>
                <p>Estimated time: ~{Math.ceil(bulkJob.estimatedSeconds / 60)} minutes</p>
              </div>
            )}
          </div>
        </>
      ) : (
        <BulkComparisonResults
          bulkJobStatus={bulkJobStatus}
          cancelBulkJob={cancelBulkJob}
          clearBulkJob={clearBulkJob}
          loading={loading}
          teams={teams}
        />
      )}
    </div>
  );
}

// Bulk Comparison Results Component
function BulkComparisonResults({ bulkJobStatus, cancelBulkJob, clearBulkJob, loading, teams }) {
  const [expandedRows, setExpandedRows] = React.useState(new Set());
  const [expandedNoDataRows, setExpandedNoDataRows] = React.useState(new Set());

  // Separate results into "with data" and "no data" categories
  const results = bulkJobStatus.results || [];

  // A result has data if it has scraped or source data to compare
  const resultsWithData = results.filter(r => {
    if (r.status === 'failed') return true; // Keep failed results in main table
    const totalScraped = r.summary?.totalScraped || 0;
    const totalSource = r.summary?.totalSource || 0;
    return totalScraped > 0 || totalSource > 0;
  });

  const resultsWithNoData = results.filter(r => {
    if (r.status === 'failed') return false; // Failed results go to main table
    const totalScraped = r.summary?.totalScraped || 0;
    const totalSource = r.summary?.totalSource || 0;
    return totalScraped === 0 && totalSource === 0;
  });

  // Recalculate summary only from results with actual data
  const calculatedSummary = React.useMemo(() => {
    const successful = resultsWithData.filter(r => r.status === 'success');
    if (successful.length === 0) {
      return {
        totalComparisons: 0,
        averageMatchPercentage: 0,
        totalDiscrepancies: 0,
        totalMissingInScraped: 0,
        totalMissingInSource: 0
      };
    }

    const totalMatchPercentage = successful.reduce((sum, r) => sum + (r.summary?.matchPercentage || 0), 0);
    const totalDiscrepancies = successful.reduce((sum, r) => sum + (r.summary?.matchesWithDiscrepancies || 0), 0);
    const totalMissingInScraped = successful.reduce((sum, r) => sum + (r.summary?.missingInScraped || 0), 0);
    const totalMissingInSource = successful.reduce((sum, r) => sum + (r.summary?.missingInSource || 0), 0);

    return {
      totalComparisons: successful.length,
      averageMatchPercentage: Math.round(totalMatchPercentage / successful.length),
      totalDiscrepancies,
      totalMissingInScraped,
      totalMissingInSource
    };
  }, [resultsWithData]);

  const handleExportCSV = () => {
    const metadata = {
      league: bulkJobStatus.filters?.league,
      sport: bulkJobStatus.filters?.sport,
      comparisonDate: new Date().toLocaleString(),
      source: bulkJobStatus.filters?.source === 'api' ? 'Stats API' : 'Oracle Database'
    };
    exportBulkComparisonToCSV(bulkJobStatus, metadata);
  };

  const handleExportExcel = () => {
    const metadata = {
      league: bulkJobStatus.filters?.league,
      sport: bulkJobStatus.filters?.sport,
      comparisonDate: new Date().toLocaleString(),
      source: bulkJobStatus.filters?.source === 'api' ? 'Stats API' : 'Oracle Database'
    };
    exportBulkComparisonToExcel(bulkJobStatus, metadata);
  };

  const getStatusColor = (percentage) => {
    if (percentage >= 90) return 'success';
    if (percentage >= 70) return 'warning';
    return 'error';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle size={20} className="status-success" />;
      case 'failed':
        return <XCircle size={20} className="status-error" />;
      case 'cancelled':
        return <AlertCircle size={20} className="status-warning" />;
      case 'running':
        return <Loader2 size={20} className="spinner status-running" />;
      default:
        return <Activity size={20} />;
    }
  };

  const toggleRow = (index) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedRows(newExpanded);
  };

  const toggleNoDataRow = (index) => {
    const newExpanded = new Set(expandedNoDataRows);
    if (newExpanded.has(index)) {
      newExpanded.delete(index);
    } else {
      newExpanded.add(index);
    }
    setExpandedNoDataRows(newExpanded);
  };

  const progress = bulkJobStatus?.progress;
  const progressPercentage = progress?.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;

  return (
    <div className="bulk-results">
      {/* Status Header - Clean and Minimal */}
      <div className="bulk-status-header">
        <div className="status-header-left">
          {getStatusIcon(bulkJobStatus.status)}
          <div className="status-header-text">
            <h3>Bulk Comparison</h3>
            <span className={`status-chip status-${bulkJobStatus.status}`}>
              {bulkJobStatus.status}
            </span>
          </div>
        </div>
        <div className="status-header-actions">
          {bulkJobStatus.status === 'running' && (
            <button className="btn-cancel" onClick={cancelBulkJob}>
              <X size={16} />
              Cancel Job
            </button>
          )}
          {['completed', 'failed', 'cancelled'].includes(bulkJobStatus.status) && (
            <>
              <button className="btn-secondary btn-small" onClick={handleExportCSV} title="Export to CSV">
                <Download size={16} />
                CSV
              </button>
              <button className="btn-secondary btn-small" onClick={handleExportExcel} title="Export to Excel">
                <Download size={16} />
                Excel
              </button>
              <button className="btn-new-comparison" onClick={clearBulkJob}>
                <Plus size={16} />
                New Comparison
              </button>
            </>
          )}
        </div>
      </div>

      {/* Running Status - Progress Bar */}
      {bulkJobStatus.status === 'running' && progress && (
        <div className="bulk-progress-container">
          <div className="progress-header-row">
            <span className="progress-label">Progress</span>
            <span className="progress-percentage">{progressPercentage}%</span>
          </div>
          <div className="progress-bar-modern">
            <div
              className="progress-bar-fill"
              style={{ width: `${progressPercentage}%` }}
            >
              <span className="progress-bar-text">{progress.completed} / {progress.total}</span>
            </div>
          </div>
          {progress.currentTeam && (
            <div className="current-operation">
              <div className="current-team-badge">
                <RefreshCw size={16} className="spinning" />
                <span>Processing: <strong>{progress.currentTeam}</strong></span>
              </div>
              {progress.currentModule && (
                <div className="current-module">Module: {progress.currentModule}</div>
              )}
            </div>
          )}
          <div className="progress-footer-row">
            {progress.failed > 0 && (
              <span className="failed-count">{progress.failed} failed</span>
            )}
          </div>
        </div>
      )}

      {/* Overall Summary - Compact Stats Bar (only from results with data) */}
      {(bulkJobStatus.overallSummary || calculatedSummary.totalComparisons > 0) && (
        <div className="bulk-summary-grid">
          <div className="summary-card primary-card">
            <div className="card-icon-wrapper success">
              <CheckCircle size={16} />
            </div>
            <div className="card-content">
              <div className="card-value">{calculatedSummary.averageMatchPercentage}%</div>
              <div className="card-label">Match Rate</div>
              <div className="card-sublabel">
                ({calculatedSummary.totalComparisons} comparisons{resultsWithNoData.length > 0 && `, ${resultsWithNoData.length} no data`})
              </div>
            </div>
          </div>

          <div className="summary-card">
            <div className="card-icon-wrapper warning">
              <AlertTriangle size={16} />
            </div>
            <div className="card-content">
              <div className="card-value">{calculatedSummary.totalDiscrepancies}</div>
              <div className="card-label">Discrepancies</div>
            </div>
          </div>

          <div className="summary-card">
            <div className="card-icon-wrapper error">
              <XCircle size={16} />
            </div>
            <div className="card-content">
              <div className="card-value">{calculatedSummary.totalMissingInScraped}</div>
              <div className="card-label">Missing (Scraped)</div>
            </div>
          </div>

          <div className="summary-card">
            <div className="card-icon-wrapper error">
              <AlertCircle size={16} />
            </div>
            <div className="card-content">
              <div className="card-value">{calculatedSummary.totalMissingInSource}</div>
              <div className="card-label">Missing (Source)</div>
            </div>
          </div>
        </div>
      )}

      {/* Table 1: Results with Data */}
      {resultsWithData.length > 0 && (
        <div className="results-table-container">
          <h4>Comparison Results ({resultsWithData.length})</h4>
          <table className="results-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Module</th>
                <th>Status</th>
                <th>Match %</th>
                <th>Perfect</th>
                <th>Issues</th>
                <th>Missing (Scraped)</th>
                <th>Missing (Source)</th>
              </tr>
            </thead>
            <tbody>
              {resultsWithData.map((result, index) => {
                // Use totalDifferences if available (includes missing players), otherwise fall back to matchesWithDiscrepancies
                const hasDetails = (result.summary?.totalDifferences || result.summary?.matchesWithDiscrepancies) > 0;

                return (
                <React.Fragment key={index}>
                  <tr
                    className={`${result.status === 'failed' ? 'row-error' : ''} ${hasDetails ? 'clickable-row' : ''} ${expandedRows.has(index) ? 'expanded' : ''}`}
                    onClick={() => hasDetails && toggleRow(index)}
                    style={{ cursor: hasDetails ? 'pointer' : 'default' }}
                  >
                    <td>
                      {hasDetails && (
                        expandedRows.has(index) ?
                          <ChevronDown size={16} className="expand-icon" /> :
                          <ChevronRight size={16} className="expand-icon" />
                      )}
                      {result.teamName}
                    </td>
                    <td>{result.module}</td>
                    <td>
                      <span className={`status-badge ${result.status}`}>
                        {result.status === 'success' ? (
                          <Check size={14} />
                        ) : (
                          <X size={14} />
                        )}
                        {result.status}
                      </span>
                    </td>
                    {result.status === 'success' ? (
                      <>
                        <td>
                          <span className={`match-percentage ${getStatusColor(result.summary?.matchPercentage || 0)}`}>
                            {result.summary?.matchPercentage || 0}%
                          </span>
                        </td>
                        <td>{result.summary?.perfectMatches || 0}</td>
                        <td>{result.summary?.matchesWithDiscrepancies || 0}</td>
                        <td>{result.summary?.missingInScraped || 0}</td>
                        <td>{result.summary?.missingInSource || 0}</td>
                      </>
                    ) : (
                      <td colSpan="5" className="error-cell">
                        <AlertTriangle size={14} />
                        {result.error || 'Unknown error'}
                      </td>
                    )}
                  </tr>
                  {expandedRows.has(index) && result.comparisonResultId && (
                    <tr className="expanded-row">
                      <td colSpan="8">
                        <ExpandedComparisonDetails
                          comparisonResultId={String(result.comparisonResultId)}
                          teamId={result.teamId}
                          league={bulkJobStatus?.filters?.league || ''}
                          teams={teams}
                          moduleId={result.module}
                          season={bulkJobStatus?.filters?.season}
                          startDate={bulkJobStatus?.filters?.startDate}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Table 2: Results with No Data */}
      {resultsWithNoData.length > 0 && (
        <div className="results-table-container no-data-table">
          <h4>No Data to Compare ({resultsWithNoData.length})</h4>
          <p className="no-data-description">These teams/games had no scraped or source data available for comparison.</p>
          <table className="results-table">
            <thead>
              <tr>
                <th>Team</th>
                <th>Module</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {resultsWithNoData.map((result, index) => (
                <tr key={index} className="no-data-row">
                  <td>{result.teamName}</td>
                  <td>{result.module}</td>
                  <td>
                    <span className="status-badge no-data">
                      <AlertCircle size={14} />
                      No Data
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Expanded Stats Details Component (for game-by-game stats comparisons)
function ExpandedStatsDetails({ comparisonData, sport }) {
  const [expandedGames, setExpandedGames] = React.useState(new Set());

  const toggleGame = (gameId) => {
    const newExpanded = new Set(expandedGames);
    if (newExpanded.has(gameId)) {
      newExpanded.delete(gameId);
    } else {
      newExpanded.add(gameId);
    }
    setExpandedGames(newExpanded);
  };

  const formatStatValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'object') {
      // Handle nested stats like fieldGoals: { made: 5, attempts: 10 }
      if (value.made !== undefined && value.attempts !== undefined) {
        return `${value.made}/${value.attempts}`;
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  // Get value from nested object (e.g., 'fieldGoals.made')
  const getNestedValue = (obj, path) => {
    if (!obj || !path) return undefined;
    const parts = path.split('.');
    let value = obj;
    for (const part of parts) {
      if (value && typeof value === 'object') {
        value = value[part];
      } else {
        return undefined;
      }
    }
    return value;
  };

  // Check if a stat has a discrepancy for this player
  const getStatDiscrepancy = (player, statPath) => {
    if (!player.statDiffs) return null;

    // Find matching stat diff
    return player.statDiffs.find(sd => {
      // Handle both simple stats (minutesPlayed) and nested (fieldGoals.made)
      if (sd.stat === statPath) return true;
      if (sd.category) {
        // Nested stat like category='fieldGoals', stat='made'
        const nestedPath = sd.stat ? `${sd.category}.${sd.stat}` : sd.category;
        return nestedPath === statPath;
      }
      return false;
    });
  };

  // Define stats columns based on sport
  const isFootball = sport === 'football';
  const isNBA = sport === 'nba';

  // Helper to render a football stat cell with discrepancy highlighting
  const renderFootballStatCell = (player, category, stat) => {
    // Check if this specific stat has a discrepancy
    const discrepancy = player.statDiffs?.find(sd =>
      sd.category === category && sd.stat === stat
    );

    const cellStyle = {
      padding: '0.5rem',
      textAlign: 'center',
      backgroundColor: discrepancy ? '#fee2e2' : 'white'
    };

    if (discrepancy) {
      // For discrepancies, values are in the statDiff object
      return (
        <td key={stat} style={cellStyle}>
          <span style={{ color: '#ef4444' }}>
            {discrepancy.oracle !== undefined && discrepancy.oracle !== null ? discrepancy.oracle : '-'}/{discrepancy.sidearm !== undefined && discrepancy.sidearm !== null ? discrepancy.sidearm : '-'}
          </span>
        </td>
      );
    }

    // For non-discrepancies or missing players, show the available stats
    // - For players missing from Oracle: show sidearmStats
    // - For players missing from Sidearm: show oracleStats
    // - For matched players: show sidearmStats (they should match)
    let value;
    if (player.missingFrom === 'sidearm') {
      value = player.oracleStats?.[category]?.[stat];
    } else {
      value = player.sidearmStats?.[category]?.[stat];
    }
    return (
      <td key={stat} style={cellStyle}>
        {value !== undefined && value !== null ? value : '-'}
      </td>
    );
  };

  // Render football category table
  const renderFootballCategoryTable = (game, category, stats, labels) => {
    // Only show players with discrepancies in this specific category
    const playersWithDiscrepanciesInCategory = game.playerDiscrepancies?.filter(p => {
      // Check if this player has any stat discrepancies in this category
      const hasDiscrep = p.statDiffs?.some(sd => sd.category === category);
      if (hasDiscrep) {
        console.log(`Player ${p.player} has discrepancy in ${category}:`, p.statDiffs.filter(sd => sd.category === category));
      }
      return hasDiscrep;
    }) || [];

    // Also check missing players with stats in this category
    const missingInOracleWithStats = game.missingInOracle?.filter(p => {
      return p.stats && p.stats[category] && Object.values(p.stats[category]).some(val => val !== 0 && val !== null && val !== undefined && val !== '');
    }) || [];

    const missingInSidearmWithStats = game.missingInSidearm?.filter(p => {
      return p.stats && p.stats[category] && Object.values(p.stats[category]).some(val => val !== 0 && val !== null && val !== undefined && val !== '');
    }) || [];

    // Combine all players for this category
    const allPlayersInCategory = [
      ...playersWithDiscrepanciesInCategory,
      ...missingInOracleWithStats.map(p => ({
        player: p.player,
        jersey: p.jersey,
        sidearmStats: p.stats,
        oracleStats: {},
        statDiffs: [],
        missingFrom: 'oracle'
      })),
      ...missingInSidearmWithStats.map(p => ({
        player: p.player,
        jersey: p.jersey,
        oracleStats: p.stats,
        sidearmStats: {},
        statDiffs: [],
        missingFrom: 'sidearm'
      }))
    ];

    console.log(`Category ${category}: ${playersWithDiscrepanciesInCategory.length} with discreps, ${missingInOracleWithStats.length} missing in Oracle, ${missingInSidearmWithStats.length} missing in Sidearm`);

    if (allPlayersInCategory.length === 0) return null;

    return (
      <div key={category} style={{ marginBottom: '1.5rem' }}>
        <div style={{
          fontSize: '0.9rem',
          fontWeight: '700',
          color: '#374151',
          marginBottom: '0.5rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em'
        }}>
          {category}
        </div>
        <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
          <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', position: 'sticky', left: 0, backgroundColor: '#f9fafb', zIndex: 2, minWidth: '120px', color: '#374151' }}>Player</th>
                {labels.map((label, idx) => (
                  <th key={idx} style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '600', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 1, color: '#374151' }}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allPlayersInCategory.map((player, pidx) => {
                const rowStyle = {
                  borderBottom: '1px solid #e5e7eb'
                };

                if (player.missingFrom === 'oracle') {
                  rowStyle.backgroundColor = '#fef3c7'; // Yellow - missing from Oracle
                } else if (player.missingFrom === 'sidearm') {
                  rowStyle.backgroundColor = '#fed7aa'; // Orange - missing from Sidearm
                }

                return (
                  <tr key={pidx} style={rowStyle}>
                    <td style={{
                      padding: '0.5rem',
                      fontWeight: '500',
                      position: 'sticky',
                      left: 0,
                      backgroundColor: rowStyle.backgroundColor || 'white',
                      zIndex: 1
                    }}>
                      {player.player}
                      <span style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                        #{player.jersey}
                      </span>
                      {player.missingFrom && (
                        <span style={{ marginLeft: '8px', fontSize: '0.7rem', color: '#92400e', fontWeight: '600' }}>
                          ({player.missingFrom === 'oracle' ? 'Not in Oracle' : 'Not in Sidearm'})
                        </span>
                      )}
                    </td>
                    {stats.map(stat => renderFootballStatCell(player, category, stat))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // Basketball stats table columns (for non-football sports)
  const basketballStatsColumns = [
    { key: 'minutesPlayed', label: 'MIN' },
    { key: 'fieldGoals.made', label: 'FGM' },
    { key: 'fieldGoals.attempts', label: 'FGA' },
    { key: 'threePointers.made', label: '3PM' },
    { key: 'threePointers.attempts', label: '3PA' },
    { key: 'freeThrows.made', label: 'FTM' },
    { key: 'freeThrows.attempts', label: 'FTA' },
    { key: 'rebounds.offensive', label: 'OR' },
    { key: 'rebounds.defensive', label: 'DR' },
    { key: 'rebounds.total', label: 'REB' },
    { key: 'assists', label: 'AST' },
    { key: 'turnovers', label: 'TO' },
    { key: 'steals', label: 'STL' },
    { key: 'blocks', label: 'BLK' },
    { key: 'fouls', label: 'PF' },
    { key: 'points', label: 'PTS' }
  ];

  return (
    <div className="expanded-details">
      <h5>Game-by-Game Breakdown</h5>

      {comparisonData.gameDetails.map((game, idx) => (
        <div key={idx} className="discrepancy-breakdown" style={{ marginTop: idx > 0 ? '1rem' : '0' }}>
          <div className="field-discrepancy-group">
            <div
              className="field-header-mini clickable"
              onClick={() => game.issues > 0 && toggleGame(game.gameId)}
              style={{ cursor: game.issues > 0 ? 'pointer' : 'default' }}
            >
              {game.issues > 0 && (
                expandedGames.has(game.gameId) ?
                  <ChevronDown size={16} /> :
                  <ChevronRight size={16} />
              )}
              {game.issues === 0 && <CheckCircle size={16} style={{ color: '#22c55e' }} />}
              <strong>{game.date || game.gameDate} - {game.isHome === false ? '@' : 'vs'} {game.opponent || 'Unknown'}</strong>
              {game.issues > 0 ? (
                <span className="count-badge" style={{ backgroundColor: '#ef4444', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
                  {game.issues} issue{game.issues !== 1 ? 's' : ''}
                </span>
              ) : (
                <span className="count-badge" style={{ backgroundColor: '#22c55e', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>Perfect</span>
              )}
              <span className="match-percentage" style={{ marginLeft: 'auto', fontSize: '0.85rem', fontWeight: '600', color: game.matchPercentage === 100 ? '#22c55e' : game.matchPercentage >= 90 ? '#f59e0b' : '#ef4444' }}>
                {game.matchPercentage}%
              </span>
            </div>

            {expandedGames.has(game.gameId) && (
              <div className="discrepancy-list">
                {/* Player Discrepancies - Render based on sport */}
                {isFootball ? (
                  // Football: Render category tables (matching single comparison view)
                  <div>
                    {renderFootballCategoryTable(game, 'passing', ['completions', 'attempts', 'yards', 'tds', 'ints', 'long', 'sacks'], ['Comp', 'Att', 'Yds', 'TD', 'INT', 'Long', 'Sack'])}
                    {renderFootballCategoryTable(game, 'rushing', ['attempts', 'yards', 'tds', 'long'], ['Att', 'Yds', 'TD', 'Long'])}
                    {renderFootballCategoryTable(game, 'receiving', ['receptions', 'yards', 'tds', 'long'], ['Rec', 'Yds', 'TD', 'Long'])}
                    {renderFootballCategoryTable(game, 'punting', ['punts', 'yards', 'long'], ['Punts', 'Yds', 'Long'])}
                    {renderFootballCategoryTable(game, 'returns', ['puntReturns', 'puntReturnYards', 'kickReturns', 'kickReturnYards', 'interceptions', 'interceptionYards'], ['PR', 'PR Yds', 'KR', 'KR Yds', 'INT', 'INT Yds'])}
                  </div>
                ) : isNBA ? (
                  // NBA Boxscore: Show player stat discrepancies in table format (like NCAA basketball)
                  <div>
                    {/* Define NBA stats columns */}
                    {(() => {
                      const nbaStatsColumns = [
                        { key: 'minutes', label: 'MIN' },
                        { key: 'points', label: 'PTS' },
                        { key: 'fieldGoalsMade', label: 'FGM' },
                        { key: 'fieldGoalsAttempted', label: 'FGA' },
                        { key: 'threePointersMade', label: '3PM' },
                        { key: 'threePointersAttempted', label: '3PA' },
                        { key: 'freeThrowsMade', label: 'FTM' },
                        { key: 'freeThrowsAttempted', label: 'FTA' },
                        { key: 'offensiveRebounds', label: 'OREB' },
                        { key: 'defensiveRebounds', label: 'DREB' },
                        { key: 'rebounds', label: 'REB' },
                        { key: 'assists', label: 'AST' },
                        { key: 'steals', label: 'STL' },
                        { key: 'blocks', label: 'BLK' },
                        { key: 'turnovers', label: 'TO' },
                        { key: 'personalFouls', label: 'PF' },
                        { key: 'plusMinusPoints', label: '+/-' }
                      ];

                      // Helper to get NBA stat discrepancy
                      // Note: Data may come as statDiscrepancies or statDiffs depending on source
                      const getNBAStatDiscrepancy = (player, statKey) => {
                        const discrepancies = player.statDiscrepancies || player.statDiffs;
                        if (!discrepancies) {
                          return null;
                        }
                        // Field name may be 'field' or 'stat' depending on data source
                        return discrepancies.find(sd => sd.field === statKey || sd.stat === statKey);
                      };

                      return (
                        <>
                          {/* Players with stat discrepancies */}
                          {game.playerDiscrepancies && game.playerDiscrepancies.length > 0 && (
                            <div style={{ marginBottom: '1rem' }}>
                              <div style={{
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                color: '#6b7280',
                                marginBottom: '0.5rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem'
                              }}>
                                <AlertTriangle size={14} />
                                Stat Discrepancies ({game.playerDiscrepancies.length} player{game.playerDiscrepancies.length !== 1 ? 's' : ''})
                              </div>
                              <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                                <table style={{
                                  width: '100%',
                                  fontSize: '0.8rem',
                                  borderCollapse: 'collapse'
                                }}>
                                  <thead>
                                    <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                                      <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', position: 'sticky', left: 0, top: 0, backgroundColor: '#f9fafb', zIndex: 2, minWidth: '140px', color: '#374151' }}>Player</th>
                                      {nbaStatsColumns.map(col => (
                                        <th key={col.key} style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '600', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 1, color: '#374151' }}>
                                          {col.label}
                                        </th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {game.playerDiscrepancies.map((player, pidx) => {
                                      // Get stats from both sources
                                      const scrapedStats = player.scrapedStats || {};
                                      const oracleStats = player.oracleStats || {};

                                      return (
                                        <tr key={pidx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                          <td style={{
                                            padding: '0.5rem',
                                            fontWeight: '500',
                                            position: 'sticky',
                                            left: 0,
                                            backgroundColor: 'white',
                                            zIndex: 1
                                          }}>
                                            {player.player || player.scrapedName}
                                            {player.team && (
                                              <span style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                                                ({player.team})
                                              </span>
                                            )}
                                          </td>
                                          {nbaStatsColumns.map(col => {
                                            const discrepancy = getNBAStatDiscrepancy(player, col.key);
                                            const hasIssue = !!discrepancy;
                                            // Get value from scraped stats (fallback to oracle if not present)
                                            const scrapedValue = scrapedStats[col.key];
                                            const oracleValue = oracleStats[col.key];

                                            return (
                                              <td
                                                key={col.key}
                                                style={{
                                                  padding: '0.5rem',
                                                  textAlign: 'center',
                                                  backgroundColor: hasIssue ? '#fee2e2' : 'transparent',
                                                  fontWeight: hasIssue ? '600' : '400',
                                                  color: hasIssue ? '#dc2626' : '#374151'
                                                }}
                                                title={hasIssue ? `Oracle: ${discrepancy.oracle ?? discrepancy.source ?? '-'} vs NBA: ${discrepancy.sidearm ?? discrepancy.scraped ?? '-'}` : ''}
                                              >
                                                {hasIssue ? (
                                                  // Show Oracle/NBA format for discrepancies
                                                  // Backend uses oracle/sidearm, fallback to source/scraped for compatibility
                                                  `${discrepancy.oracle ?? discrepancy.source ?? '-'}/${discrepancy.sidearm ?? discrepancy.scraped ?? '-'}`
                                                ) : (
                                                  // Show the matching value (use scraped as primary)
                                                  scrapedValue ?? oracleValue ?? '-'
                                                )}
                                              </td>
                                            );
                                          })}
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                          {/* Missing in Oracle (Sidearm only) */}
                          {(() => {
                            // Support both field names for backwards compatibility
                            const missingInOracleData = game.missingInOracleList || game.missingInOracle || [];
                            return missingInOracleData.length > 0 && (
                              <div style={{ marginBottom: '1rem' }}>
                                <div style={{
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  color: '#f59e0b',
                                  marginBottom: '0.5rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem'
                                }}>
                                  <AlertTriangle size={14} />
                                  Missing in Oracle ({missingInOracleData.length} player{missingInOracleData.length !== 1 ? 's' : ''})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  {missingInOracleData.map((player, pidx) => (
                                    <span key={pidx} style={{
                                      backgroundColor: '#fef3c7',
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.8rem',
                                      border: '1px solid #fcd34d'
                                    }}>
                                      {player.player} {player.team && `(${player.team})`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Missing in NBA (Oracle only) */}
                          {(() => {
                            // Support both field names for backwards compatibility
                            const missingInNBAData = game.missingInSidearmList || game.missingInSidearm || [];
                            return missingInNBAData.length > 0 && (
                              <div style={{ marginBottom: '1rem' }}>
                                <div style={{
                                  fontSize: '0.85rem',
                                  fontWeight: '600',
                                  color: '#ef4444',
                                  marginBottom: '0.5rem',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '0.5rem'
                                }}>
                                  <AlertCircle size={14} />
                                  Missing in NBA ({missingInNBAData.length} player{missingInNBAData.length !== 1 ? 's' : ''})
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  {missingInNBAData.map((player, pidx) => (
                                    <span key={pidx} style={{
                                      backgroundColor: '#fee2e2',
                                      padding: '0.25rem 0.5rem',
                                      borderRadius: '4px',
                                      fontSize: '0.8rem',
                                      border: '1px solid #fecaca'
                                    }}>
                                      {player.player} {player.team && `(${player.team})`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {/* Show message if no specific issues */}
                          {(() => {
                            const missingInOracleData = game.missingInOracleList || game.missingInOracle || [];
                            const missingInNBAData = game.missingInSidearmList || game.missingInSidearm || [];
                            return (!game.playerDiscrepancies || game.playerDiscrepancies.length === 0) &&
                              missingInOracleData.length === 0 &&
                              missingInNBAData.length === 0 && (
                                <div style={{ color: '#6b7280', fontStyle: 'italic', padding: '1rem' }}>
                                  No detailed discrepancy data available for this game.
                                </div>
                              );
                          })()}
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  // Basketball: Single table with all stats
                  game.playerDiscrepancies && game.playerDiscrepancies.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{
                        fontSize: '0.85rem',
                        fontWeight: '600',
                        color: '#6b7280',
                        marginBottom: '0.5rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <AlertTriangle size={14} />
                        Stat Discrepancies ({game.playerDiscrepancies.length} player{game.playerDiscrepancies.length !== 1 ? 's' : ''})
                      </div>
                      <div style={{ overflowX: 'auto', backgroundColor: 'white', borderRadius: '6px', border: '1px solid #e5e7eb' }}>
                        <table style={{
                          width: '100%',
                          fontSize: '0.8rem',
                          borderCollapse: 'collapse'
                        }}>
                          <thead>
                            <tr style={{ backgroundColor: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                              <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', position: 'sticky', left: 0, top: 0, backgroundColor: '#f9fafb', zIndex: 2, minWidth: '120px', color: '#374151' }}>Player</th>
                              {basketballStatsColumns.map(col => (
                                <th key={col.key} style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '600', whiteSpace: 'nowrap', position: 'sticky', top: 0, backgroundColor: '#f9fafb', zIndex: 1, color: '#374151' }}>
                                  {col.label}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {game.playerDiscrepancies.map((player, pidx) => {
                              // Use sidearm stats as the base (showing what we scraped)
                              const playerStats = player.sidearmStats || {};

                              return (
                                <tr key={pidx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                  <td style={{
                                    padding: '0.5rem',
                                    fontWeight: '500',
                                    position: 'sticky',
                                    left: 0,
                                    backgroundColor: 'white',
                                    zIndex: 1
                                  }}>
                                    {player.player}
                                    <span style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: '0.25rem' }}>
                                      #{player.jersey}
                                    </span>
                                  </td>
                                  {basketballStatsColumns.map(col => {
                                    const discrepancy = getStatDiscrepancy(player, col.key);
                                    const hasIssue = !!discrepancy;
                                    const cellValue = getNestedValue(playerStats, col.key);

                                    return (
                                      <td
                                        key={col.key}
                                        style={{
                                          padding: '0.5rem',
                                          textAlign: 'center',
                                          backgroundColor: hasIssue ? '#fee2e2' : 'transparent',
                                          fontWeight: hasIssue ? '600' : '400',
                                          color: hasIssue ? '#dc2626' : '#374151'
                                        }}
                                        title={hasIssue ? `Oracle: ${formatStatValue(discrepancy.oracle)} ← → Sidearm: ${formatStatValue(discrepancy.sidearm)}` : ''}
                                      >
                                        {hasIssue ? (
                                          `${formatStatValue(discrepancy.oracle)}/${formatStatValue(discrepancy.sidearm)}`
                                        ) : (
                                          formatStatValue(cellValue) || '-'
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )
                )}

                {/* Missing in Oracle - Show with stats for basketball */}
                {game.missingInOracle && game.missingInOracle.length > 0 && !isFootball && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: '#92400e',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <AlertTriangle size={14} />
                      Missing in Oracle ({game.missingInOracle.length}) - Sidearm stats shown
                    </div>
                    <div style={{ overflowX: 'auto', backgroundColor: '#fef3c7', borderRadius: '6px', border: '1px solid #f59e0b' }}>
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#fde68a', borderBottom: '2px solid #f59e0b' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', position: 'sticky', left: 0, backgroundColor: '#fde68a', zIndex: 2, minWidth: '120px', color: '#92400e' }}>Player</th>
                            {basketballStatsColumns.map(col => (
                              <th key={col.key} style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '600', whiteSpace: 'nowrap', color: '#92400e' }}>
                                {col.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {game.missingInOracle.map((player, pidx) => (
                            <tr key={pidx} style={{ borderBottom: '1px solid #fcd34d' }}>
                              <td style={{ padding: '0.5rem', fontWeight: '500', position: 'sticky', left: 0, backgroundColor: '#fef3c7', zIndex: 1 }}>
                                {player.player}
                                <span style={{ color: '#92400e', fontSize: '0.75rem', marginLeft: '0.25rem' }}>#{player.jersey}</span>
                              </td>
                              {basketballStatsColumns.map(col => (
                                <td key={col.key} style={{ padding: '0.5rem', textAlign: 'center', color: '#78350f' }}>
                                  {formatStatValue(getNestedValue(player.stats || {}, col.key)) || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Missing in Oracle - Simple list for football (already shown in category tables) */}
                {game.missingInOracle && game.missingInOracle.length > 0 && isFootball && (
                  <div style={{ marginBottom: '1rem' }}>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: '#92400e',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <AlertTriangle size={14} />
                      Missing in Oracle ({game.missingInOracle.length}) - See stats in tables above
                    </div>
                    <div className="scrollable-issue-list" style={{ backgroundColor: '#fef3c7', padding: '0.5rem', borderRadius: '6px' }}>
                      {game.missingInOracle.map((player, pidx) => (
                        <div key={pidx} className="discrepancy-item-mini">
                          <span className="player-name-mini">{player.player}</span>
                          <span style={{ fontSize: '0.85rem', color: '#92400e' }}>#{player.jersey}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Missing in Sidearm - Show with stats for basketball */}
                {game.missingInSidearm && game.missingInSidearm.length > 0 && !isFootball && (
                  <div>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: '#c2410c',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <AlertTriangle size={14} />
                      Missing in Sidearm ({game.missingInSidearm.length}) - Oracle stats shown
                    </div>
                    <div style={{ overflowX: 'auto', backgroundColor: '#fed7aa', borderRadius: '6px', border: '1px solid #ea580c' }}>
                      <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ backgroundColor: '#fdba74', borderBottom: '2px solid #ea580c' }}>
                            <th style={{ padding: '0.5rem', textAlign: 'left', fontWeight: '600', position: 'sticky', left: 0, backgroundColor: '#fdba74', zIndex: 2, minWidth: '120px', color: '#c2410c' }}>Player</th>
                            {basketballStatsColumns.map(col => (
                              <th key={col.key} style={{ padding: '0.5rem', textAlign: 'center', fontWeight: '600', whiteSpace: 'nowrap', color: '#c2410c' }}>
                                {col.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {game.missingInSidearm.map((player, pidx) => (
                            <tr key={pidx} style={{ borderBottom: '1px solid #fb923c' }}>
                              <td style={{ padding: '0.5rem', fontWeight: '500', position: 'sticky', left: 0, backgroundColor: '#fed7aa', zIndex: 1 }}>
                                {player.player}
                                <span style={{ color: '#c2410c', fontSize: '0.75rem', marginLeft: '0.25rem' }}>#{player.jersey}</span>
                              </td>
                              {basketballStatsColumns.map(col => (
                                <td key={col.key} style={{ padding: '0.5rem', textAlign: 'center', color: '#9a3412' }}>
                                  {formatStatValue(getNestedValue(player.stats || {}, col.key)) || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Missing in Sidearm - Simple list for football (already shown in category tables) */}
                {game.missingInSidearm && game.missingInSidearm.length > 0 && isFootball && (
                  <div>
                    <div style={{
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: '#c2410c',
                      marginBottom: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem'
                    }}>
                      <AlertTriangle size={14} />
                      Missing in Sidearm ({game.missingInSidearm.length}) - See stats in tables above
                    </div>
                    <div className="scrollable-issue-list" style={{ backgroundColor: '#fed7aa', padding: '0.5rem', borderRadius: '6px' }}>
                      {game.missingInSidearm.map((player, pidx) => (
                        <div key={pidx} className="discrepancy-item-mini">
                          <span className="player-name-mini">{player.player}</span>
                          <span style={{ fontSize: '0.85rem', color: '#c2410c' }}>#{player.jersey}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Expanded Comparison Details Component
function ExpandedComparisonDetails({ comparisonResultId, teamId, league, teams = [], moduleId, season, startDate }) {
  const { showAlert } = useModal();
  const [comparisonData, setComparisonData] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [showMappingModal, setShowMappingModal] = React.useState(false);
  const [selectedIssue, setSelectedIssue] = React.useState(null);
  const [showPlayerMappingModal, setShowPlayerMappingModal] = React.useState(false);
  const [playerMappingData, setPlayerMappingData] = React.useState(null);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [creatingMapping, setCreatingMapping] = React.useState(false);

  // Schedule-specific state
  const isScheduleModule = moduleId?.includes('schedule');
  const [scheduleViewMode, setScheduleViewMode] = React.useState('sideBySide');
  const [liveComparison, setLiveComparison] = React.useState(null);
  const [liveScrapedData, setLiveScrapedData] = React.useState(null);
  const [ignoredGames, setIgnoredGames] = React.useState(new Set());

  // Extract sport from moduleId
  const getSportFromModuleId = (modId) => {
    if (!modId) return null;
    if (modId.startsWith('mlb_') || modId === 'mlb') return 'mlb';
    if (modId.startsWith('nba_') || modId === 'nba') return 'nba';
    if (modId.includes('football')) return 'football';
    if (modId.includes('womensBasketball')) return 'womensBasketball';
    if (modId.includes('mensBasketball')) return 'mensBasketball';
    if (modId.includes('baseball')) return 'baseball';
    return null;
  };

  // Transform stored comparison result (differences array) into the structured
  // format that SideBySideView/DiscrepanciesView expect
  const transformStoredResult = (storedData) => {
    const gameDiscrepancies = {};
    const missingInScraped = [];
    const missingInSource = [];

    (storedData.differences || []).forEach(diff => {
      if (diff.type === 'field_mismatch') {
        const date = diff.matchKey;
        if (!gameDiscrepancies[date]) {
          gameDiscrepancies[date] = {
            date,
            scraped: diff.scraped,
            source: diff.source,
            discrepancies: [],
            mappedFields: diff.mappedFields || {}
          };
        }
        gameDiscrepancies[date].discrepancies.push({
          field: diff.field,
          scraped: diff.webValue,
          source: diff.oracleValue,
          broadcaster: diff.broadcaster
        });
      } else if (diff.type === 'missing_in_web') {
        missingInScraped.push({
          date: diff.matchKey,
          game: diff.oracleValue,
          isIgnored: diff.isIgnored
        });
      } else if (diff.type === 'missing_in_oracle') {
        missingInSource.push({
          date: diff.matchKey,
          game: diff.webValue,
          isIgnored: diff.isIgnored
        });
      }
    });

    const summary = storedData.summary || {};
    return {
      matches: [], // Not needed — issuesOnly filters these out
      discrepancies: Object.values(gameDiscrepancies),
      missingInScraped,
      missingInSource,
      totalScraped: summary.totalScraped || 0,
      totalSource: summary.totalSource || 0,
      matchPercentage: summary.matchPercentage || 0,
      summary: {
        perfectMatches: summary.perfectMatches || 0,
        matchesWithDiscrepancies: summary.matchesWithDiscrepancies || 0,
        gamesWithDiscrepancies: summary.matchesWithDiscrepancies || 0,
        uniqueToScraped: summary.missingInSource || 0,
        uniqueToSource: summary.missingInScraped || 0,
        missingInScraped: summary.missingInScraped || 0,
        missingInSource: summary.missingInSource || 0
      }
    };
  };

  // Schedule: fetch stored result + scraped data + ignored games (all fast, no Oracle re-query)
  React.useEffect(() => {
    if (!isScheduleModule) return;

    const fetchScheduleData = async () => {
      try {
        const [storedResponse, scrapedResponse, ignoredResponse] = await Promise.all([
          axios.get(`/comparison/results/${comparisonResultId}`),
          axios.get('/data/scraped', {
            params: { teamId, moduleId, limit: 500 }
          }),
          axios.get(`/comparison/ignored-games/${teamId}/${moduleId}`).catch(() => ({ data: { ignoredGames: [] } }))
        ]);

        setLiveComparison(transformStoredResult(storedResponse.data));
        setLiveScrapedData(scrapedResponse.data);
        if (ignoredResponse.data?.success) {
          setIgnoredGames(new Set(ignoredResponse.data.ignoredGames || []));
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching schedule comparison:', error);
        setLoading(false);
      }
    };

    fetchScheduleData();
  }, [isScheduleModule, comparisonResultId, teamId, moduleId]);

  // Non-schedule: fetch stored comparison result
  React.useEffect(() => {
    if (isScheduleModule) return;

    const fetchComparisonDetails = async () => {
      try {
        const response = await axios.get(`/comparison/results/${comparisonResultId}`);
        setComparisonData(response.data);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching comparison details:', error);
        setLoading(false);
      }
    };

    fetchComparisonDetails();
  }, [isScheduleModule, comparisonResultId]);

  if (loading) {
    return (
      <div className="expanded-details-loading">
        <Loader2 size={20} className="spinner" />
        <span>Loading details...</span>
      </div>
    );
  }

  // --- Schedule branch: render SideBySideView / DiscrepanciesView ---
  if (isScheduleModule) {
    if (!liveComparison) {
      return (
        <div className="expanded-details-empty">
          <Info size={20} />
          <span>No schedule comparison data available</span>
        </div>
      );
    }

    const team = teams.find(t => t.teamId === teamId);

    return (
      <div className="expanded-details expanded-schedule-details">
        <div className="expanded-schedule-tabs">
          <button
            className={scheduleViewMode === 'sideBySide' ? 'active' : ''}
            onClick={() => setScheduleViewMode('sideBySide')}
          >
            <ArrowLeftRight size={16} />
            Side by Side
          </button>
          <button
            className={scheduleViewMode === 'discrepancies' ? 'active' : ''}
            onClick={() => setScheduleViewMode('discrepancies')}
          >
            <AlertTriangle size={16} />
            Discrepancies
            {liveComparison.summary && (liveComparison.summary.matchesWithDiscrepancies > 0 || liveComparison.summary.missingInScraped > 0 || liveComparison.summary.missingInSource > 0) && (
              <span className="tab-count">
                {(liveComparison.summary.matchesWithDiscrepancies || 0) + (liveComparison.summary.missingInScraped || 0) + (liveComparison.summary.missingInSource || 0)}
              </span>
            )}
          </button>
        </div>

        {scheduleViewMode === 'sideBySide' && (
          <SideBySideView
            scrapedData={liveScrapedData}
            sourceData={[]}
            source="oracle"
            comparisonResult={liveComparison}
            isScheduleComparison={true}
            selectedModule={moduleId}
            ignoredGames={ignoredGames}
            issuesOnly={true}
          />
        )}

        {scheduleViewMode === 'discrepancies' && (
          <DiscrepanciesView
            comparison={liveComparison}
            team={team}
            source="oracle"
            isScheduleComparison={true}
            sourceData={[]}
            scrapedData={liveScrapedData}
          />
        )}
      </div>
    );
  }

  // --- Non-schedule branch: existing roster/stats logic ---
  if (!comparisonData) {
    return (
      <div className="expanded-details-empty">
        <Info size={20} />
        <span>No detailed data available - comparison result not found</span>
      </div>
    );
  }

  // Check if this is a stats module (has gameDetails)
  if (comparisonData.gameDetails && comparisonData.gameDetails.length > 0) {
    const sport = getSportFromModuleId(comparisonData.moduleId);
    return <ExpandedStatsDetails comparisonData={comparisonData} sport={sport} />;
  }

  if (!comparisonData.differences || comparisonData.differences.length === 0) {
    return (
      <div className="expanded-details-empty">
        <CheckCircle size={20} />
        <span>No discrepancies found</span>
      </div>
    );
  }

  // Group discrepancies by type (roster only)
  const discrepanciesByField = {};
  const missingInWeb = [];
  const missingInOracle = [];

  comparisonData.differences.forEach(diff => {
    if (diff.type === 'field_mismatch') {
      if (!discrepanciesByField[diff.field]) {
        discrepanciesByField[diff.field] = [];
      }
      discrepanciesByField[diff.field].push(diff);
    } else if (diff.type === 'missing_in_web') {
      missingInWeb.push(diff);
    } else if (diff.type === 'missing_in_oracle') {
      missingInOracle.push(diff);
    }
  });

  const getFieldIcon = (field) => {
    const icons = {
      jersey: <Hash size={16} />,
      position: <MapPin size={16} />,
      weight: <Scale size={16} />,
      year: <Calendar size={16} />,
      height: <Ruler size={16} />
    };
    return icons[field] || <Info size={16} />;
  };

  const getFieldLabel = (field) => {
    const labels = {
      jersey: 'Jersey Number',
      position: 'Position',
      weight: 'Weight',
      year: 'Year/Class',
      height: 'Height'
    };
    return labels[field] || field;
  };

  const handleIssueClick = (diff, field) => {
    // For missing players, use simplified ignore modal
    if (diff.type === 'missing_in_web' || diff.type === 'missing_in_oracle') {
      const isMissingInScraped = diff.type === 'missing_in_web';

      setPlayerMappingData({
        unmatchedPlayer: isMissingInScraped ? diff.oracleValue : diff.webValue,
        isMissingInScraped,
        diffType: diff.type,
        matchKey: diff.matchKey
      });
      setShowPlayerMappingModal(true);
      return;
    }

    // For field mismatches, use Field Mapping Modal
    const sport = getSportFromModuleId(comparisonData?.moduleId);
    const isTvField = (field || diff.field) === 'tv';

    // TV mappings at league level; other fields at team level
    const initialData = {
      fieldType: field || diff.field || 'name',
      scope: {
        level: isTvField ? 'league' : 'team',
        teamId: isTvField ? undefined : teamId,
        league: league,
        sport: sport
      }
    };

    // For TV with only one side having a value, default to ignore
    const broadcasterValue = diff.broadcaster || diff.oracleValue || diff.webValue;
    if (isTvField && (!diff.oracleValue || !diff.webValue)) {
      initialData.mappingType = 'ignore';
      initialData.rules = {
        primaryValue: broadcasterValue,
        caseSensitive: false,
        ignoreReason: `Ignored TV broadcaster: ${broadcasterValue}`
      };
    } else {
      initialData.mappingType = 'equivalence';
      initialData.rules = {
        primaryValue: diff.oracleValue || '',
        equivalents: [diff.webValue || ''],
        caseSensitive: false
      };
    }

    setSelectedIssue(initialData);
    setShowMappingModal(true);
  };

  const createPlayerIgnoreMapping = async (scopeLevel) => {
    if (!playerMappingData) return;

    setCreatingMapping(true);
    try {
      const team = teams.find(t => t.teamId === teamId);
      const { unmatchedPlayer, diffType, matchKey } = playerMappingData;

      const playerName = unmatchedPlayer.player || unmatchedPlayer.displayName || matchKey;

      // Extract sport from moduleId
      const sport = getSportFromModuleId(comparisonData?.moduleId);

      const payload = {
        mappingType: 'ignore',
        fieldType: 'name',
        scope: {
          level: scopeLevel,
          league: (scopeLevel === 'league' || scopeLevel === 'sport' || scopeLevel === 'team') ?
            team?.league : undefined,
          sport: (scopeLevel === 'sport' || scopeLevel === 'team') ?
            sport : undefined,
          teamId: scopeLevel === 'team' ? teamId : undefined
        },
        rules: {
          ignoreReason: `Player "${playerName}" is ${diffType === 'missing_in_web' ? 'missing in web data' : 'missing in Oracle'} - marked to ignore`,
          primaryValue: playerName
        },
        appliesTo: {
          scraped: true,
          api: true,
          oracle: true
        },
        notes: `Ignore mapping created from bulk comparison for missing player`
      };

      // Clean scope
      const cleanedPayload = {
        ...payload,
        scope: {
          level: payload.scope.level
        }
      };
      if (payload.scope.league) cleanedPayload.scope.league = payload.scope.league;
      if (payload.scope.sport) cleanedPayload.scope.sport = payload.scope.sport;
      if (payload.scope.teamId) cleanedPayload.scope.teamId = payload.scope.teamId;

      await axios.post('/mappings/create', cleanedPayload);
      await showAlert(`Player "${playerName}" marked to ignore at ${scopeLevel} level!`, 'Success', 'success');
      setShowPlayerMappingModal(false);
      setPlayerMappingData(null);
    } catch (error) {
      console.error('Error creating ignore mapping:', error);
      await showAlert('Failed to create mapping: ' + (error.response?.data?.error || error.message), 'Error', 'error');
    } finally {
      setCreatingMapping(false);
    }
  };

  const openFullComparison = async () => {
    setShowPlayerMappingModal(false);
    await showAlert(`To perform detailed player mapping, please use Single Team comparison mode for this team.\n\nYou can switch modes using the toggle at the top of the page.`, 'Info', 'info');
  };

  const handleMappingSaved = () => {
    // Close modal and optionally refresh data
    setShowMappingModal(false);
    setSelectedIssue(null);
  };

  return (
    <div className="expanded-details">
      <h5>Discrepancy Breakdown</h5>

      {/* Roster Field Mismatches */}
      {Object.keys(discrepanciesByField).length > 0 && (
        <div className="discrepancy-breakdown">
          {Object.entries(discrepanciesByField).map(([field, discrepancies]) => (
            <div key={field} className="field-discrepancy-group">
              <div className="field-header-mini">
                {getFieldIcon(field)}
                <strong>{getFieldLabel(field)}</strong>
                <span className="count-badge">{discrepancies.length}</span>
              </div>
              <div className="discrepancy-list scrollable-issue-list">
                {discrepancies.map((disc, idx) => (
                  <div
                    key={idx}
                    className="discrepancy-item-mini clickable"
                    onClick={() => handleIssueClick(disc, field)}
                    title="Click to create mapping for this issue"
                  >
                    <span className="player-name-mini">{disc.matchKey}</span>
                    <div className="value-diff">
                      <span className="scraped-value">{disc.webValue}</span>
                      <span className="arrow">→</span>
                      <span className="source-value">{disc.oracleValue}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Missing in Web (roster only) */}
      {missingInWeb.length > 0 && (
        <div className="discrepancy-breakdown" style={{ marginTop: '1rem' }}>
          <div className="field-discrepancy-group">
            <div className="field-header-mini">
              <AlertTriangle size={16} />
              <strong>Missing in Web Data</strong>
              <span className="count-badge">{missingInWeb.filter(d => !d.isIgnored).length}</span>
            </div>
            <div className="discrepancy-list scrollable-issue-list">
              {missingInWeb.map((disc, idx) => {
                const game = disc.oracleValue;
                return (
                  <div
                    key={idx}
                    className="discrepancy-item-mini clickable"
                    onClick={() => handleIssueClick(disc, 'name')}
                    title="Click to create mapping for this issue"
                  >
                    <span className="player-name-mini">
                      {disc.matchKey}
                      {disc.isIgnored && (
                        <span className="badge badge-ignored" style={{ marginLeft: '8px' }} title="This player is ignored via mapping">
                          Ignored
                        </span>
                      )}
                    </span>
                    <div className="value-diff">
                      <span className="source-value">
                        {game?.jersey && `#${game.jersey} `}
                        {game?.position || 'No position'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Missing in Oracle (roster only) */}
      {missingInOracle.length > 0 && (
        <div className="discrepancy-breakdown" style={{ marginTop: '1rem' }}>
          <div className="field-discrepancy-group">
            <div className="field-header-mini">
              <AlertTriangle size={16} />
              <strong>Missing in Oracle</strong>
              <span className="count-badge">{missingInOracle.filter(d => !d.isIgnored).length}</span>
            </div>
            <div className="discrepancy-list scrollable-issue-list">
              {missingInOracle.map((disc, idx) => {
                const game = disc.webValue;
                return (
                  <div
                    key={idx}
                    className="discrepancy-item-mini clickable"
                    onClick={() => handleIssueClick(disc, 'name')}
                    title="Click to create mapping for this issue"
                  >
                    <span className="player-name-mini">
                      {disc.matchKey}
                      {disc.isIgnored && (
                        <span className="badge badge-ignored" style={{ marginLeft: '8px' }} title="This player is ignored via mapping">
                          Ignored
                        </span>
                      )}
                    </span>
                    <div className="value-diff">
                      <span className="scraped-value">
                        {game?.jersey && `#${game.jersey} `}
                        {game?.position || 'No position'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* No Issues */}
      {Object.keys(discrepanciesByField).length === 0 &&
       missingInWeb.filter(d => !d.isIgnored).length === 0 &&
       missingInOracle.filter(d => !d.isIgnored).length === 0 && (
        <div className="no-discrepancies-mini">
          <CheckCircle size={16} />
          <span>All matched players have consistent data</span>
        </div>
      )}

      <MappingModal
        isOpen={showMappingModal}
        onClose={() => setShowMappingModal(false)}
        onSave={handleMappingSaved}
        initialData={selectedIssue}
        teams={teams}
      />

      {/* Ignore Player Modal - Simplified for bulk comparison */}
      {showPlayerMappingModal && playerMappingData && (
        <div className="modal-overlay">
          <div className="modal-content player-mapping-modal">
            <div className="modal-header">
              <h3>
                <AlertTriangle className="inline-icon" />
                Ignore Missing Player
              </h3>
              <button
                className="close-btn"
                onClick={() => setShowPlayerMappingModal(false)}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem' }}>
              <div className="unmatched-player" style={{ marginBottom: '1.5rem' }}>
                <h4>Missing Player ({playerMappingData.isMissingInScraped ? 'In Oracle, not in web data' : 'In web data, not in Oracle'})</h4>
                <div className="player-card selected">
                  <div className="player-details">
                    <span className="player-name">
                      {playerMappingData.unmatchedPlayer.player || playerMappingData.unmatchedPlayer.displayName || playerMappingData.matchKey}
                    </span>
                    <div className="player-meta">
                      {playerMappingData.unmatchedPlayer.jersey && (
                        <span className="badge jersey">#{playerMappingData.unmatchedPlayer.jersey}</span>
                      )}
                      {playerMappingData.unmatchedPlayer.position && (
                        <span className="badge position">{playerMappingData.unmatchedPlayer.position}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <p style={{ color: '#6b7280', marginBottom: '1.5rem' }}>
                This player will be marked as "ignore" so it won't show as a discrepancy in future comparisons.
              </p>
            </div>

            <div className="scope-selection">
              <h4>Select Ignore Scope</h4>
              <div className="scope-buttons">
                <button
                  className="btn-scope team"
                  onClick={() => createPlayerIgnoreMapping('team')}
                  disabled={creatingMapping}
                >
                  <Building size={16} />
                  Team Level
                  <span className="scope-desc">Only for this team</span>
                </button>
                <button
                  className="btn-scope sport"
                  onClick={() => createPlayerIgnoreMapping('sport')}
                  disabled={creatingMapping}
                >
                  <Activity size={16} />
                  Sport Level
                  <span className="scope-desc">All teams in this sport</span>
                </button>
                <button
                  className="btn-scope global"
                  onClick={() => createPlayerIgnoreMapping('global')}
                  disabled={creatingMapping}
                >
                  <Globe size={16} />
                  Global
                  <span className="scope-desc">All comparisons</span>
                </button>
              </div>

              <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid #e5e7eb' }}>
                <p style={{ fontSize: '0.875rem', color: '#6b7280', marginBottom: '1rem' }}>
                  Need to map this player to another name instead?
                </p>
                <button
                  className="btn-secondary"
                  onClick={openFullComparison}
                  style={{ width: '100%' }}
                >
                  <ArrowLeftRight size={16} />
                  Open Full Comparison for this Team
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Stats by Category View - for game stats comparison
function StatsByCategoryView({
  comparison,
  source,
  team,
  selectedModule,
  onPlayerClick,
  sourceData,
  scrapedData
}) {
  if (!comparison || !comparison.matches) {
    return <div>No stats comparison data available</div>;
  }

  // Helper to get all players (matched + missing)
  const getAllPlayers = () => {
    const allPlayers = [
      ...comparison.matches,
      ...(comparison.missingInSource || []).map(p => ({ ...p, missingFrom: 'oracle' })),
      ...(comparison.missingInScraped || []).map(p => ({ ...p, missingFrom: 'sidearm' }))
    ];
    return allPlayers;
  };

  // Handle click on missing player to open mapping modal
  const handleMissingPlayerClick = (player) => {
    if (!player.missingFrom) return; // Only clickable for missing players

    const isMissingInScraped = player.missingFrom === 'sidearm'; // Missing from Sidearm means it's in Oracle but not Sidearm

    // For stats comparison, we need to extract just the player info
    const playerInfo = {
      player: player.player,
      jersey: player.jersey,
      position: player.position
    };

    if (onPlayerClick) {
      // Pass the player arrays so modal can show available players
      onPlayerClick(playerInfo, isMissingInScraped, scrapedData, sourceData);
    }
  };

  // Helper to check if all stats in a category are zero
  const hasNonZeroStats = (player, category) => {
    const oracleStats = player.oracleStats?.[category];
    const sidearmStats = player.sidearmStats?.[category];

    if (!oracleStats && !sidearmStats) {
      return false;
    }

    // Check if any stat has a non-zero value
    const checkNonZero = (statsObj) => {
      if (!statsObj) return false;
      return Object.values(statsObj).some(val => val && val !== 0);
    };

    return checkNonZero(oracleStats) || checkNonZero(sidearmStats);
  };

  // Helper to get stat value from full stats
  const getStatValue = (player, category, statName) => {
    const oracleStats = player.oracleStats?.[category];
    const sidearmStats = player.sidearmStats?.[category];

    if (!oracleStats && !sidearmStats) {
      return null; // Neither source has this stat category
    }

    const oracleVal = oracleStats?.[statName];
    const sidearmVal = sidearmStats?.[statName];

    // If both are null/undefined, return null
    if ((oracleVal === null || oracleVal === undefined) && (sidearmVal === null || sidearmVal === undefined)) {
      return null;
    }

    return {
      oracle: oracleVal ?? 0,
      sidearm: sidearmVal ?? 0,
      hasDiff: (oracleVal ?? 0) !== (sidearmVal ?? 0)
    };
  };

  // Render a stat cell with red highlighting if different
  const renderStatCell = (statValue) => {
    if (!statValue) {
      return <td style={{ padding: '10px', textAlign: 'center', color: '#cbd5e0' }}>-</td>;
    }

    if (statValue.hasDiff) {
      return (
        <td style={{
          padding: '10px',
          textAlign: 'center',
          backgroundColor: '#fee2e2',
          fontWeight: '600',
          fontSize: '13px',
          color: '#991b1b'
        }}>
          {statValue.oracle}/{statValue.sidearm}
        </td>
      );
    }

    return (
      <td style={{ padding: '10px', textAlign: 'center', fontSize: '13px' }}>
        {statValue.oracle}
      </td>
    );
  };

  // Passing stats table - completions, attempts, yards, td, int, long, sack
  const renderPassingTable = () => {
    // Show all players (matched + missing) who have passing stats with non-zero values
    const allPlayers = getAllPlayers();
    const passingPlayers = allPlayers.filter(m =>
      hasNonZeroStats(m, 'passing')
    );

    if (passingPlayers.length === 0) {
      return <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>No passing stats found</div>;
    }

    const stats = ['completions', 'attempts', 'yards', 'tds', 'ints', 'long', 'sacks'];
    const labels = ['Comp', 'Att', 'Yds', 'TD', 'INT', 'Long', 'Sack'];

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', minWidth: '150px' }}>Player</th>
              {labels.map((label, idx) => (
                <th key={idx} style={{ padding: '10px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {passingPlayers.map((player, idx) => {
              const rowStyle = {
                borderBottom: '1px solid #e2e8f0'
              };

              // Highlight row if player is missing from one source
              if (player.missingFrom === 'oracle') {
                rowStyle.backgroundColor = '#fef3c7'; // Yellow - missing from Oracle
                rowStyle.cursor = 'pointer';
              } else if (player.missingFrom === 'sidearm') {
                rowStyle.backgroundColor = '#fed7aa'; // Orange - missing from Sidearm
                rowStyle.cursor = 'pointer';
              }

              return (
                <tr
                  key={idx}
                  style={rowStyle}
                  onClick={() => player.missingFrom && handleMissingPlayerClick(player)}
                  title={player.missingFrom ? 'Click to create player name mapping' : ''}
                >
                  <td style={{ padding: '10px 12px', fontWeight: '500' }}>
                    {player.player}
                    {player.missingFrom && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', fontWeight: '600' }}>
                        ({player.missingFrom === 'oracle' ? 'Not in Oracle' : 'Not in Sidearm'})
                      </span>
                    )}
                  </td>
                  {stats.map((stat, statIdx) => (
                    <React.Fragment key={statIdx}>{renderStatCell(getStatValue(player, 'passing', stat))}</React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Rushing stats table - attempts, yards, td, long
  const renderRushingTable = () => {
    // Show all players (matched + missing) who have rushing stats with non-zero values
    const allPlayers = getAllPlayers();
    const rushingPlayers = allPlayers.filter(m =>
      hasNonZeroStats(m, 'rushing')
    );

    if (rushingPlayers.length === 0) {
      return <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>No rushing stats found</div>;
    }

    const stats = ['attempts', 'yards', 'tds', 'long'];
    const labels = ['Att', 'Yds', 'TD', 'Long'];

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', minWidth: '150px' }}>Player</th>
              {labels.map((label, idx) => (
                <th key={idx} style={{ padding: '10px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rushingPlayers.map((player, idx) => {
              const rowStyle = {
                borderBottom: '1px solid #e2e8f0'
              };

              if (player.missingFrom === 'oracle') {
                rowStyle.backgroundColor = '#fef3c7';
                rowStyle.cursor = 'pointer';
              } else if (player.missingFrom === 'sidearm') {
                rowStyle.backgroundColor = '#fed7aa';
                rowStyle.cursor = 'pointer';
              }

              return (
                <tr
                  key={idx}
                  style={rowStyle}
                  onClick={() => player.missingFrom && handleMissingPlayerClick(player)}
                  title={player.missingFrom ? 'Click to create player name mapping' : ''}
                >
                  <td style={{ padding: '10px 12px', fontWeight: '500' }}>
                    {player.player}
                    {player.missingFrom && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', fontWeight: '600' }}>
                        ({player.missingFrom === 'oracle' ? 'Not in Oracle' : 'Not in Sidearm'})
                      </span>
                    )}
                  </td>
                  {stats.map((stat, statIdx) => (
                    <React.Fragment key={statIdx}>{renderStatCell(getStatValue(player, 'rushing', stat))}</React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Receiving stats table - receptions, yards, td, long
  const renderReceivingTable = () => {
    // Show all players (matched + missing) who have receiving stats with non-zero values
    const allPlayers = getAllPlayers();
    const receivingPlayers = allPlayers.filter(m =>
      hasNonZeroStats(m, 'receiving')
    );

    if (receivingPlayers.length === 0) {
      return <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>No receiving stats found</div>;
    }

    const stats = ['receptions', 'yards', 'tds', 'long'];
    const labels = ['Rec', 'Yds', 'TD', 'Long'];

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', minWidth: '150px' }}>Player</th>
              {labels.map((label, idx) => (
                <th key={idx} style={{ padding: '10px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {receivingPlayers.map((player, idx) => {
              const rowStyle = {
                borderBottom: '1px solid #e2e8f0'
              };

              if (player.missingFrom === 'oracle') {
                rowStyle.backgroundColor = '#fef3c7';
                rowStyle.cursor = 'pointer';
              } else if (player.missingFrom === 'sidearm') {
                rowStyle.backgroundColor = '#fed7aa';
                rowStyle.cursor = 'pointer';
              }

              return (
                <tr
                  key={idx}
                  style={rowStyle}
                  onClick={() => player.missingFrom && handleMissingPlayerClick(player)}
                  title={player.missingFrom ? 'Click to create player name mapping' : ''}
                >
                  <td style={{ padding: '10px 12px', fontWeight: '500' }}>
                    {player.player}
                    {player.missingFrom && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', fontWeight: '600' }}>
                        ({player.missingFrom === 'oracle' ? 'Not in Oracle' : 'Not in Sidearm'})
                      </span>
                    )}
                  </td>
                  {stats.map((stat, statIdx) => (
                    <React.Fragment key={statIdx}>{renderStatCell(getStatValue(player, 'receiving', stat))}</React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Punting stats table - punts, yards, long
  const renderPuntingTable = () => {
    // Show all players (matched + missing) who have punting stats with non-zero values
    const allPlayers = getAllPlayers();
    const puntingPlayers = allPlayers.filter(m =>
      hasNonZeroStats(m, 'punting')
    );

    if (puntingPlayers.length === 0) {
      return <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>No punting stats found</div>;
    }

    const stats = ['punts', 'yards', 'long'];
    const labels = ['Punts', 'Yds', 'Long'];

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', minWidth: '150px' }}>Player</th>
              {labels.map((label, idx) => (
                <th key={idx} style={{ padding: '10px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {puntingPlayers.map((player, idx) => {
              const rowStyle = {
                borderBottom: '1px solid #e2e8f0'
              };

              if (player.missingFrom === 'oracle') {
                rowStyle.backgroundColor = '#fef3c7';
                rowStyle.cursor = 'pointer';
              } else if (player.missingFrom === 'sidearm') {
                rowStyle.backgroundColor = '#fed7aa';
                rowStyle.cursor = 'pointer';
              }

              return (
                <tr
                  key={idx}
                  style={rowStyle}
                  onClick={() => player.missingFrom && handleMissingPlayerClick(player)}
                  title={player.missingFrom ? 'Click to create player name mapping' : ''}
                >
                  <td style={{ padding: '10px 12px', fontWeight: '500' }}>
                    {player.player}
                    {player.missingFrom && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', fontWeight: '600' }}>
                        ({player.missingFrom === 'oracle' ? 'Not in Oracle' : 'Not in Sidearm'})
                      </span>
                    )}
                  </td>
                  {stats.map((stat, statIdx) => (
                    <React.Fragment key={statIdx}>{renderStatCell(getStatValue(player, 'punting', stat))}</React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Returns stats table - punt/kick/int returns, yards, long
  const renderReturnsTable = () => {
    // Show all players (matched + missing) who have returns stats with non-zero values
    const allPlayers = getAllPlayers();
    const returnsPlayers = allPlayers.filter(m =>
      hasNonZeroStats(m, 'returns')
    );

    if (returnsPlayers.length === 0) {
      return <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>No returns stats found</div>;
    }

    const stats = ['puntReturns', 'puntReturnYards', 'puntReturnLong', 'kickReturns', 'kickReturnYards', 'kickReturnLong', 'interceptions', 'interceptionYards', 'interceptionLong'];
    const labels = ['PR', 'PR Yds', 'PR Long', 'KR', 'KR Yds', 'KR Long', 'INT', 'INT Yds', 'INT Long'];

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', minWidth: '150px' }}>Player</th>
              {labels.map((label, idx) => (
                <th key={idx} style={{ padding: '10px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {returnsPlayers.map((player, idx) => {
              const rowStyle = {
                borderBottom: '1px solid #e2e8f0'
              };

              if (player.missingFrom === 'oracle') {
                rowStyle.backgroundColor = '#fef3c7';
                rowStyle.cursor = 'pointer';
              } else if (player.missingFrom === 'sidearm') {
                rowStyle.backgroundColor = '#fed7aa';
                rowStyle.cursor = 'pointer';
              }

              return (
                <tr
                  key={idx}
                  style={rowStyle}
                  onClick={() => player.missingFrom && handleMissingPlayerClick(player)}
                  title={player.missingFrom ? 'Click to create player name mapping' : ''}
                >
                  <td style={{ padding: '10px 12px', fontWeight: '500' }}>
                    {player.player}
                    {player.missingFrom && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', fontWeight: '600' }}>
                        ({player.missingFrom === 'oracle' ? 'Not in Oracle' : 'Not in Sidearm'})
                      </span>
                    )}
                  </td>
                  {stats.map((stat, statIdx) => (
                    <React.Fragment key={statIdx}>{renderStatCell(getStatValue(player, 'returns', stat))}</React.Fragment>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // ===== BASKETBALL STAT TABLE =====

  // Basketball stats table - all stats in one table like football
  const renderBasketballStatsTable = () => {
    const allPlayers = getAllPlayers();
    const basketballPlayers = allPlayers.filter(m =>
      hasNonZeroStats(m, 'fieldGoals') || hasNonZeroStats(m, 'threePointers') ||
      hasNonZeroStats(m, 'freeThrows') || hasNonZeroStats(m, 'rebounds') ||
      (m.sidearmStats?.points > 0) || (m.oracleStats?.points > 0) ||
      (m.sidearmStats?.assists > 0) || (m.oracleStats?.assists > 0) ||
      (m.sidearmStats?.minutesPlayed > 0) || (m.oracleStats?.minutesPlayed > 0)
    );

    if (basketballPlayers.length === 0) {
      return <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>No basketball stats found</div>;
    }

    const stats = ['minutesPlayed', 'fieldGoals.made', 'fieldGoals.attempts', 'threePointers.made', 'threePointers.attempts',
                   'freeThrows.made', 'freeThrows.attempts', 'rebounds.offensive', 'rebounds.defensive', 'rebounds.total',
                   'assists', 'turnovers', 'steals', 'blocks', 'fouls', 'points'];
    const labels = ['MIN', 'FGM', 'FGA', '3PM', '3PA', 'FTM', 'FTA', 'OR', 'DR', 'REB', 'AST', 'TO', 'STL', 'BLK', 'PF', 'PTS'];

    return (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: '600', minWidth: '150px' }}>Player</th>
              {labels.map((label, idx) => (
                <th key={idx} style={{ padding: '10px', textAlign: 'center', fontWeight: '600', fontSize: '13px' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {basketballPlayers.map((player, idx) => {
              const rowStyle = {
                borderBottom: '1px solid #e2e8f0'
              };

              if (player.missingFrom === 'oracle') {
                rowStyle.backgroundColor = '#fef3c7';
                rowStyle.cursor = 'pointer';
              } else if (player.missingFrom === 'sidearm') {
                rowStyle.backgroundColor = '#fed7aa';
                rowStyle.cursor = 'pointer';
              }

              return (
                <tr
                  key={idx}
                  style={rowStyle}
                  onClick={() => player.missingFrom && handleMissingPlayerClick(player)}
                  title={player.missingFrom ? 'Click to create player name mapping' : ''}
                >
                  <td style={{ padding: '10px 12px', fontWeight: '500' }}>
                    {player.player}
                    {player.missingFrom && (
                      <span style={{ marginLeft: '8px', fontSize: '11px', color: '#92400e', fontWeight: '600' }}>
                        ({player.missingFrom === 'oracle' ? 'Not in Oracle' : 'Not in Sidearm'})
                      </span>
                    )}
                  </td>
                  {stats.map((stat, statIdx) => {
                    // Parse stat path to get category and statName
                    let statValue;
                    if (stat.includes('.')) {
                      // Nested stat like 'fieldGoals.made'
                      const [category, statName] = stat.split('.');
                      statValue = getStatValue(player, category, statName);
                    } else {
                      // Top-level stat like 'points', 'assists', 'minutesPlayed'
                      const oracleVal = player.oracleStats?.[stat];
                      const sidearmVal = player.sidearmStats?.[stat];

                      if ((oracleVal === null || oracleVal === undefined) && (sidearmVal === null || sidearmVal === undefined)) {
                        statValue = null;
                      } else {
                        statValue = {
                          oracle: oracleVal ?? 0,
                          sidearm: sidearmVal ?? 0,
                          hasDiff: (oracleVal ?? 0) !== (sidearmVal ?? 0)
                        };
                      }
                    }

                    return (
                      <React.Fragment key={statIdx}>{renderStatCell(statValue)}</React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  // Detect if this is basketball (NCAA or NBA)
  const isBasketball = selectedModule && (selectedModule.includes('mensBasketball') || selectedModule.includes('womensBasketball'));
  const isNBABoxscore = selectedModule === 'nba_boxscore';

  // NBA Boxscore view - shows players grouped by team in standard NBA boxscore format
  const renderNBABoxscoreView = () => {
    const allPlayers = getAllPlayers();

    // Separate players by team
    const homePlayers = allPlayers.filter(p => {
      const team = p.oracleStats?.team || p.scrapedStats?.team || p.team;
      return team === 'home';
    });
    const awayPlayers = allPlayers.filter(p => {
      const team = p.oracleStats?.team || p.scrapedStats?.team || p.team;
      return team === 'away';
    });

    // Helper to get stat value comparing oracle vs scraped
    const getNBAStat = (player, field) => {
      const oracleVal = player.oracleStats?.[field];
      const scrapedVal = player.scrapedStats?.[field];

      // Check if this stat has a discrepancy
      const hasDiscrepancy = player.statDiscrepancies?.some(d => d.field === field);

      if (oracleVal === undefined && scrapedVal === undefined) {
        return { value: '-', hasDiscrepancy: false };
      }

      if (hasDiscrepancy) {
        return {
          value: `${oracleVal ?? '-'}/${scrapedVal ?? '-'}`,
          hasDiscrepancy: true,
          oracle: oracleVal,
          scraped: scrapedVal
        };
      }

      return { value: oracleVal ?? scrapedVal ?? '-', hasDiscrepancy: false };
    };

    // Render a team's boxscore table
    const renderTeamBoxscore = (players, teamLabel) => {
      if (players.length === 0) {
        return <div style={{ padding: '20px', textAlign: 'center', color: '#718096' }}>No {teamLabel} players found</div>;
      }

      const statColumns = [
        { key: 'minutes', label: 'MIN' },
        { key: 'points', label: 'PTS' },
        { key: 'fieldGoalsMade', label: 'FGM' },
        { key: 'fieldGoalsAttempted', label: 'FGA' },
        { key: 'threePointersMade', label: '3PM' },
        { key: 'threePointersAttempted', label: '3PA' },
        { key: 'freeThrowsMade', label: 'FTM' },
        { key: 'freeThrowsAttempted', label: 'FTA' },
        { key: 'offensiveRebounds', label: 'OREB' },
        { key: 'defensiveRebounds', label: 'DREB' },
        { key: 'rebounds', label: 'REB' },
        { key: 'assists', label: 'AST' },
        { key: 'steals', label: 'STL' },
        { key: 'blocks', label: 'BLK' },
        { key: 'turnovers', label: 'TO' },
        { key: 'personalFouls', label: 'PF' },
        { key: 'plusMinusPoints', label: '+/-' }
      ];

      return (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ backgroundColor: '#f7fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: '600', minWidth: '150px', position: 'sticky', left: 0, backgroundColor: '#f7fafc' }}>Player</th>
                {statColumns.map(col => (
                  <th key={col.key} style={{ padding: '8px 6px', textAlign: 'center', fontWeight: '600', fontSize: '11px', minWidth: '45px' }}>{col.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {players.map((player, idx) => {
                const rowStyle = {
                  borderBottom: '1px solid #e2e8f0'
                };

                // Highlight missing players
                if (player.missingFrom === 'oracle') {
                  rowStyle.backgroundColor = '#fef3c7';
                  rowStyle.cursor = 'pointer';
                } else if (player.missingFrom === 'sidearm') {
                  rowStyle.backgroundColor = '#fed7aa';
                  rowStyle.cursor = 'pointer';
                }

                return (
                  <tr
                    key={idx}
                    style={rowStyle}
                    onClick={() => player.missingFrom && handleMissingPlayerClick(player)}
                    title={player.missingFrom ? 'Click to create player name mapping' : ''}
                  >
                    <td style={{ padding: '8px 12px', fontWeight: '500', position: 'sticky', left: 0, backgroundColor: player.missingFrom ? (player.missingFrom === 'oracle' ? '#fef3c7' : '#fed7aa') : 'white' }}>
                      {player.player || player.scrapedStats?.playerName || player.oracleStats?.playerName}
                      {player.missingFrom && (
                        <span style={{ marginLeft: '6px', fontSize: '10px', color: '#92400e', fontWeight: '600' }}>
                          ({player.missingFrom === 'oracle' ? 'Not in Oracle' : 'Not in Sidearm'})
                        </span>
                      )}
                    </td>
                    {statColumns.map(col => {
                      const stat = getNBAStat(player, col.key);
                      return (
                        <td
                          key={col.key}
                          style={{
                            padding: '8px 6px',
                            textAlign: 'center',
                            backgroundColor: stat.hasDiscrepancy ? '#fee2e2' : 'transparent',
                            color: stat.hasDiscrepancy ? '#991b1b' : 'inherit',
                            fontWeight: stat.hasDiscrepancy ? '600' : 'normal'
                          }}
                          title={stat.hasDiscrepancy ? `Oracle: ${stat.oracle}, Scraped: ${stat.scraped}` : ''}
                        >
                          {stat.value}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      );
    };

    return (
      <>
        {/* Away Team */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{
            padding: '12px 16px',
            backgroundColor: '#6366f1',
            color: 'white',
            margin: '0',
            borderRadius: '8px 8px 0 0',
            fontSize: '16px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            Away Team ({awayPlayers.length} players)
          </h3>
          <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
            {renderTeamBoxscore(awayPlayers, 'away')}
          </div>
        </div>

        {/* Home Team */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{
            padding: '12px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            margin: '0',
            borderRadius: '8px 8px 0 0',
            fontSize: '16px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            Home Team ({homePlayers.length} players)
          </h3>
          <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
            {renderTeamBoxscore(homePlayers, 'home')}
          </div>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: '20px',
          padding: '12px 16px',
          backgroundColor: '#f7fafc',
          borderRadius: '8px',
          fontSize: '12px',
          color: '#4a5568'
        }}>
          <strong>Legend:</strong>
          <span style={{ marginLeft: '16px', backgroundColor: '#fee2e2', padding: '2px 8px', borderRadius: '4px', color: '#991b1b' }}>Red cells</span> = Oracle/Scraped values differ
          <span style={{ marginLeft: '16px', backgroundColor: '#fef3c7', padding: '2px 8px', borderRadius: '4px' }}>Yellow rows</span> = Missing from Oracle
          <span style={{ marginLeft: '16px', backgroundColor: '#fed7aa', padding: '2px 8px', borderRadius: '4px' }}>Orange rows</span> = Missing from Scraped
        </div>
      </>
    );
  };

  return (
    <div className="stats-by-category-view" style={{ marginTop: '20px' }}>
      {isNBABoxscore ? (
        // NBA Boxscore View - standard basketball boxscore format
        renderNBABoxscoreView()
      ) : isBasketball ? (
        // NCAA Basketball Stats View
        <div className="stat-category-section" style={{ marginBottom: '30px' }}>
          <h3 style={{
            padding: '12px 16px',
            backgroundColor: '#3b82f6',
            color: 'white',
            margin: '0',
            borderRadius: '8px 8px 0 0',
            fontSize: '16px',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <TrendingUp size={18} />
            Basketball Stats
          </h3>
          <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
            {renderBasketballStatsTable()}
          </div>
        </div>
      ) : (
        // Football Stats View (original)
        <>
      {/* Passing Stats */}
      <div className="stat-category-section" style={{ marginBottom: '30px' }}>
        <h3 style={{
          padding: '12px 16px',
          backgroundColor: '#3b82f6',
          color: 'white',
          margin: '0',
          borderRadius: '8px 8px 0 0',
          fontSize: '16px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <TrendingUp size={18} />
          Passing Stats
        </h3>
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          {renderPassingTable()}
        </div>
      </div>

      {/* Rushing Stats */}
      <div className="stat-category-section" style={{ marginBottom: '30px' }}>
        <h3 style={{
          padding: '12px 16px',
          backgroundColor: '#10b981',
          color: 'white',
          margin: '0',
          borderRadius: '8px 8px 0 0',
          fontSize: '16px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Activity size={18} />
          Rushing Stats
        </h3>
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          {renderRushingTable()}
        </div>
      </div>

      {/* Receiving Stats */}
      <div className="stat-category-section" style={{ marginBottom: '30px' }}>
        <h3 style={{
          padding: '12px 16px',
          backgroundColor: '#f59e0b',
          color: 'white',
          margin: '0',
          borderRadius: '8px 8px 0 0',
          fontSize: '16px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Users size={18} />
          Receiving Stats
        </h3>
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          {renderReceivingTable()}
        </div>
      </div>

      {/* Punting Stats */}
      <div className="stat-category-section" style={{ marginBottom: '30px' }}>
        <h3 style={{
          padding: '12px 16px',
          backgroundColor: '#8b5cf6',
          color: 'white',
          margin: '0',
          borderRadius: '8px 8px 0 0',
          fontSize: '16px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <Activity size={18} />
          Punting Stats
        </h3>
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          {renderPuntingTable()}
        </div>
      </div>

      {/* Returns Stats */}
      <div className="stat-category-section" style={{ marginBottom: '30px' }}>
        <h3 style={{
          padding: '12px 16px',
          backgroundColor: '#ef4444',
          color: 'white',
          margin: '0',
          borderRadius: '8px 8px 0 0',
          fontSize: '16px',
          fontWeight: '600',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          <TrendingUp size={18} />
          Returns Stats
        </h3>
        <div style={{ border: '1px solid #e2e8f0', borderTop: 'none', borderRadius: '0 0 8px 8px' }}>
          {renderReturnsTable()}
        </div>
      </div>
        </>
      )}
    </div>
  );
}

// AllGamesView Component - Shows expandable cards for each game comparison
function AllGamesView({
  allGamesResults,
  source,
  team,
  selectedModule,
  onPlayerClick,
  sourceData,
  scrapedData
}) {
  const [expandedGames, setExpandedGames] = useState(new Set());

  const toggleGame = (gameId) => {
    const newExpanded = new Set(expandedGames);
    if (newExpanded.has(gameId)) {
      newExpanded.delete(gameId);
    } else {
      newExpanded.add(gameId);
    }
    setExpandedGames(newExpanded);
  };

  const handleExportCSV = () => {
    const metadata = {
      teamName: team?.teamName || 'Team',
      comparisonDate: new Date().toLocaleString(),
      source: source === 'api' ? 'Stats API' : 'Oracle Database'
    };
    exportAllGamesToCSV(allGamesResults, metadata);
  };

  const handleExportExcel = () => {
    const metadata = {
      teamName: team?.teamName || 'Team',
      comparisonDate: new Date().toLocaleString(),
      source: source === 'api' ? 'Stats API' : 'Oracle Database'
    };
    exportAllGamesToExcel(allGamesResults, metadata);
  };

  if (!allGamesResults || allGamesResults.length === 0) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#718096' }}>
        <p>No game comparisons available</p>
      </div>
    );
  }

  // Sort games by date (earliest first)
  const sortedGames = [...allGamesResults].sort((a, b) => {
    return new Date(a.date) - new Date(b.date);
  });

  // Calculate aggregate statistics
  const stats = {
    totalGames: sortedGames.length,
    gamesWithIssues: 0,
    perfectGames: 0,
    totalIssues: 0,
    totalPlayers: 0,
    avgMatchPercentage: 0
  };

  sortedGames.forEach(game => {
    const issues = game.comparison.summary?.totalStatDiscrepancies || 0;
    stats.totalIssues += issues;
    stats.totalPlayers += game.comparison.totalScraped || 0;
    stats.avgMatchPercentage += game.comparison.matchPercentage || 0;

    if (issues > 0) {
      stats.gamesWithIssues++;
    } else {
      stats.perfectGames++;
    }
  });

  stats.avgMatchPercentage = stats.totalGames > 0
    ? Math.round(stats.avgMatchPercentage / stats.totalGames)
    : 0;

  return (
    <div style={{ marginTop: '20px' }}>
      {/* Aggregate Statistics Header */}
      <div style={{
        marginBottom: '20px',
        padding: '20px',
        backgroundColor: 'white',
        borderRadius: '8px',
        border: '1px solid #e2e8f0',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: '600' }}>
              All Games Comparison
            </h3>
            <p style={{ margin: '0', color: '#718096', fontSize: '14px' }}>
              {team?.teamName || 'Selected team'} - {stats.totalGames} game{stats.totalGames !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                className="btn-secondary btn-small"
                onClick={handleExportCSV}
                title="Export to CSV"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '14px'
                }}
              >
                <Download size={16} />
                CSV
              </button>
              <button
                className="btn-secondary btn-small"
                onClick={handleExportExcel}
                title="Export to Excel"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 16px',
                  fontSize: '14px'
                }}
              >
                <Download size={16} />
                Excel
              </button>
            </div>
            <div style={{
              fontSize: '32px',
              fontWeight: '700',
              color: stats.avgMatchPercentage === 100 ? '#10b981' : stats.avgMatchPercentage >= 90 ? '#f59e0b' : '#ef4444'
            }}>
              {stats.avgMatchPercentage}%
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '16px'
        }}>
          <div style={{
            padding: '12px',
            backgroundColor: '#f0fdf4',
            borderRadius: '6px',
            border: '1px solid #bbf7d0'
          }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#10b981', marginBottom: '4px' }}>
              {stats.perfectGames}
            </div>
            <div style={{ fontSize: '12px', color: '#166534', fontWeight: '500' }}>
              Perfect Match{stats.perfectGames !== 1 ? 'es' : ''}
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: stats.gamesWithIssues > 0 ? '#fef2f2' : '#f7fafc',
            borderRadius: '6px',
            border: `1px solid ${stats.gamesWithIssues > 0 ? '#fecaca' : '#e2e8f0'}`
          }}>
            <div style={{
              fontSize: '24px',
              fontWeight: '700',
              color: stats.gamesWithIssues > 0 ? '#ef4444' : '#718096',
              marginBottom: '4px'
            }}>
              {stats.gamesWithIssues}
            </div>
            <div style={{
              fontSize: '12px',
              color: stats.gamesWithIssues > 0 ? '#991b1b' : '#4a5568',
              fontWeight: '500'
            }}>
              Game{stats.gamesWithIssues !== 1 ? 's' : ''} with Issues
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: '#fef3c7',
            borderRadius: '6px',
            border: '1px solid #fde68a'
          }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#f59e0b', marginBottom: '4px' }}>
              {stats.totalIssues}
            </div>
            <div style={{ fontSize: '12px', color: '#92400e', fontWeight: '500' }}>
              Total Issue{stats.totalIssues !== 1 ? 's' : ''}
            </div>
          </div>

          <div style={{
            padding: '12px',
            backgroundColor: '#eff6ff',
            borderRadius: '6px',
            border: '1px solid #dbeafe'
          }}>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#3b82f6', marginBottom: '4px' }}>
              {stats.totalPlayers}
            </div>
            <div style={{ fontSize: '12px', color: '#1e40af', fontWeight: '500' }}>
              Total Players
            </div>
          </div>
        </div>
      </div>

      {/* Individual Game Cards */}
      {sortedGames.map((gameResult, idx) => {
        const isExpanded = expandedGames.has(gameResult.gameId);
        const comparison = gameResult.comparison;

        // Calculate summary stats
        // For stats comparison, use statDiscrepancies (not issues which is for roster comparison)
        const totalIssues = comparison.summary?.totalStatDiscrepancies || 0;
        const matchPercentage = comparison.matchPercentage || 0;

        return (
          <div
            key={gameResult.gameId}
            style={{
              marginBottom: '16px',
              border: totalIssues > 0 ? '1px solid #fca5a5' : '1px solid #e2e8f0',
              borderRadius: '8px',
              overflow: 'hidden',
              backgroundColor: 'white',
              boxShadow: totalIssues > 0
                ? '0 0 20px rgba(239, 68, 68, 0.4), 0 0 40px rgba(239, 68, 68, 0.2)'
                : 'none',
              transition: 'box-shadow 0.3s ease'
            }}
          >
            {/* Card Header - Always visible */}
            <div
              onClick={() => toggleGame(gameResult.gameId)}
              style={{
                padding: '16px 20px',
                cursor: 'pointer',
                backgroundColor: isExpanded ? '#f7fafc' : 'white',
                borderBottom: isExpanded ? '1px solid #e2e8f0' : 'none',
                transition: 'background-color 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ flex: 1 }}>
                  {/* Game Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                    <Calendar size={16} style={{ color: '#718096' }} />
                    <span style={{ fontWeight: '600', fontSize: '15px' }}>
                      {gameResult.date} vs {gameResult.opponent}
                    </span>
                    {gameResult.score && (
                      <span style={{
                        fontSize: '14px',
                        color: '#718096',
                        padding: '2px 8px',
                        backgroundColor: '#e2e8f0',
                        borderRadius: '4px'
                      }}>
                        {gameResult.score}
                      </span>
                    )}
                  </div>

                  {/* Summary Stats */}
                  <div style={{ display: 'flex', gap: '24px', fontSize: '13px', color: '#4a5568' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Users size={14} />
                      <span>
                        {comparison.totalScraped} Scraped / {comparison.totalSource} {source === 'oracle' ? 'Oracle' : 'API'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle size={14} style={{ color: matchPercentage === 100 ? '#10b981' : '#f59e0b' }} />
                      <span>{matchPercentage}% Match</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={14} style={{ color: totalIssues > 0 ? '#ef4444' : '#10b981' }} />
                      <span>{totalIssues} Issue{totalIssues !== 1 ? 's' : ''}</span>
                    </div>
                  </div>
                </div>

                {/* Expand/Collapse Icon */}
                <div style={{ marginLeft: '12px' }}>
                  {isExpanded ? (
                    <ChevronUp size={20} style={{ color: '#718096' }} />
                  ) : (
                    <ChevronDown size={20} style={{ color: '#718096' }} />
                  )}
                </div>
              </div>
            </div>

            {/* Card Body - Expandable stats view */}
            {isExpanded && (
              <div style={{ padding: '20px' }}>
                <StatsByCategoryView
                  comparison={comparison}
                  source={source}
                  team={team}
                  selectedModule={selectedModule}
                  onPlayerClick={onPlayerClick}
                  sourceData={gameResult.oracleStats || sourceData}
                  scrapedData={gameResult.scrapedPlayers || scrapedData}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default DataComparison;