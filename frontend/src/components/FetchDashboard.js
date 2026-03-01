// frontend/src/components/FetchDashboard.js
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useModal } from '../contexts/ModalContext';
import FetchHistory from './FetchHistory';
import ApiEndpointDisplay from './ApiEndpointDisplay';
import {
  RefreshCw,
  FolderOpen,
  History,
  Download,
  Search,
  Users,
  Package,
  Calendar,
  Trophy,
  Building2,
  Grid3x3,
  List,
  CheckCircle,
  AlertCircle,
  XCircle,
  X,
  Loader2,
  Play,
  ChevronRight,
  ChevronDown,
  Clock,
  MapPin,
  Ruler,
  Weight,
  GraduationCap,
  Home,
  School,
  Target,
  RotateCcw,
  Activity,
  TrendingUp,
  Zap,
  Shield,
  MoreHorizontal
} from 'lucide-react';

function FetchDashboard({ teams }) {
  const { showAlert } = useModal();
  // Fetch mode: 'single' or 'bulk'
  const [fetchMode, setFetchMode] = useState('single');
  
  // Single fetch state
  const [singleFetchLeague, setSingleFetchLeague] = useState('');
  const [singleFetchConference, setSingleFetchConference] = useState('');
  const [selectedTeam, setSelectedTeam] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  
  // Bulk fetch state
  const [selectedLeague, setSelectedLeague] = useState('');
  const [selectedConference, setSelectedConference] = useState('');
  const [selectedDivision, setSelectedDivision] = useState('');
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [selectedModules, setSelectedModules] = useState([]);
  
  // Common state
  const [fetchedData, setFetchedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState('table'); // CHANGED: Default to 'table' instead of 'cards'
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  
  // Bulk fetch job tracking
  const [currentJob, setCurrentJob] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [recentJobs, setRecentJobs] = useState([]);

  // MLB specific
  const [selectedSeason, setSelectedSeason] = useState(new Date().getFullYear());
  const [selectedRosterType, setSelectedRosterType] = useState('active');
  const [playerLookupId, setPlayerLookupId] = useState('');
  const [playerLookupData, setPlayerLookupData] = useState(null);
  const [playerLookupLoading, setPlayerLookupLoading] = useState(false);

  // NBA Schedule - date range with defaults (Oct 1 - June 30)
  const [nbaScheduleStartDate, setNbaScheduleStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 9, 1).toISOString().slice(0, 10); // Oct 1
  });
  const [nbaScheduleEndDate, setNbaScheduleEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear() + 1, 5, 30).toISOString().slice(0, 10); // June 30
  });

  // NBA Boxscore - date range with defaults (Oct 22, 2025 - today)
  const [nbaBoxscoreStartDate, setNbaBoxscoreStartDate] = useState('2025-10-22');
  const [nbaBoxscoreEndDate, setNbaBoxscoreEndDate] = useState(new Date().toISOString().slice(0, 10));

  // NBA Bulk Fetch - date range with defaults (season start - today)
  const [nbaBulkStartDate, setNbaBulkStartDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 9, 22).toISOString().slice(0, 10); // Oct 22 (season start)
  });
  const [nbaBulkEndDate, setNbaBulkEndDate] = useState(new Date().toISOString().slice(0, 10));

  // MLB Schedule - date range with defaults (today - end of season Oct 31)
  const [mlbScheduleStartDate, setMlbScheduleStartDate] = useState(() => {
    return new Date().toISOString().slice(0, 10); // Today
  });
  const [mlbScheduleEndDate, setMlbScheduleEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 9, 31).toISOString().slice(0, 10); // Oct 31 (end of season)
  });

  // MLB Bulk Fetch - date range with defaults (today - end of season)
  const [mlbBulkStartDate, setMlbBulkStartDate] = useState(() => {
    return new Date().toISOString().slice(0, 10); // Today
  });
  const [mlbBulkEndDate, setMlbBulkEndDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), 9, 31).toISOString().slice(0, 10); // Oct 31 (end of season)
  });

  // MLB Bulk Fetch - roster types multi-select (defaults to active)
  const [mlbBulkRosterTypes, setMlbBulkRosterTypes] = useState(['active']);

  // MLB Bulk Fetch - season selection
  const [mlbBulkSeason, setMlbBulkSeason] = useState(new Date().getFullYear());

  // ESPN Fetch - week range for NCAA basketball season
  // The scoreboard API uses week numbers (1-20+) for the season
  const [espnStartWeek, setEspnStartWeek] = useState(1);
  const [espnEndWeek, setEspnEndWeek] = useState(20);
  const [selectedEspnModule, setSelectedEspnModule] = useState('');
  const [espnFetchStatus, setEspnFetchStatus] = useState(null); // { status: 'running'|'completed'|'failed', message: string }

  // Date filtering for bulk operations
  const [targetDate, setTargetDate] = useState('');

  // Baseline creation option (default OFF for performance)
  const [createBaseline, setCreateBaseline] = useState(false);

  // Force refresh option to bypass cache (default OFF)
  const [forceRefresh, setForceRefresh] = useState(false);

  // Get unique values for filters
  const leagues = [...new Set(teams.map(t => t.league))].sort();
  const conferences = [...new Set(teams.filter(t => t.league === selectedLeague).map(t => t.conference))].filter(Boolean).sort();
  const divisions = [...new Set(teams.filter(t => t.league === selectedLeague && (!selectedConference || t.conference === selectedConference)).map(t => t.division))].filter(Boolean).sort();

  // Single fetch conferences
  const singleFetchConferences = [...new Set(teams.filter(t => t.league === singleFetchLeague).map(t => t.conference))].filter(Boolean).sort();
  
  // MLB roster types
  const mlbRosterTypes = [
    { value: 'active', label: 'Active Roster' },
    { value: '40man', label: '40-Man Roster' },
    { value: 'fullSeason', label: 'Full Season Roster' },
    { value: 'fullRoster', label: 'Full Roster' },
    { value: 'nonRosterInvitees', label: 'Non-Roster Invitees' },
    { value: 'allTime', label: 'All-Time Roster' },
    { value: 'depthChart', label: 'Depth Chart' },
    { value: 'gameday', label: 'Gameday Roster' },
    { value: 'coach', label: 'Coaching Staff' }
  ];

  // Helper function to get team display name
  const getTeamDisplayName = (team) => {
    if (!team) return '';
    return `${team.teamName}${team.teamNickname ? ` ${team.teamNickname}` : ''}`;
  };

  // Get filtered teams based on selections
  const getFilteredTeams = () => {
    return teams.filter(team => {
      if (selectedLeague && team.league !== selectedLeague) return false;
      if (selectedConference && team.conference !== selectedConference) return false;
      if (selectedDivision && team.division !== selectedDivision) return false;
      return true;
    });
  };

  // Available modules based on league
  const getAvailableModulesForLeague = () => {
    const modules = [];

    if (selectedLeague === 'NCAA') {
      modules.push(
        { value: 'ncaa_football_roster', label: 'Football Roster' },
        { value: 'ncaa_football_schedule', label: 'Football Schedule' },
        { value: 'ncaa_football_stats', label: 'Football Stats' },
        { value: 'ncaa_mensBasketball_roster', label: "Men's Basketball Roster" },
        { value: 'ncaa_mensBasketball_schedule', label: "Men's Basketball Schedule" },
        { value: 'ncaa_mensBasketball_stats', label: "Men's Basketball Stats" },
        { value: 'ncaa_womensBasketball_roster', label: "Women's Basketball Roster" },
        { value: 'ncaa_womensBasketball_schedule', label: "Women's Basketball Schedule" },
        { value: 'ncaa_womensBasketball_stats', label: "Women's Basketball Stats" },
        { value: 'ncaa_baseball_schedule', label: 'Baseball Schedule' }
      );
    } else if (selectedLeague === 'MLB' || selectedLeague === 'MILB') {
      modules.push(
        { value: 'mlb_roster', label: 'Baseball Roster' },
        { value: 'mlb_schedule', label: 'Baseball Schedule' }
      );
    } else if (selectedLeague === 'NBA') {
      modules.push(
        { value: 'nba_schedule', label: 'NBA Schedule' },
        { value: 'nba_boxscore', label: 'NBA Boxscore' }
      );
    }

    return modules;
  };

  // Available modules for single team
  const getAvailableModulesForTeam = () => {
    if (!selectedTeam) return [];

    const team = teams.find(t => t.teamId === selectedTeam);
    if (!team) return [];

    const modules = [];

    if (team.league === 'NCAA') {
      modules.push(
        { value: 'ncaa_football_roster', label: 'Football Roster' },
        { value: 'ncaa_football_schedule', label: 'Football Schedule' },
        { value: 'ncaa_football_stats', label: 'Football Stats' },
        { value: 'ncaa_mensBasketball_roster', label: "Men's Basketball Roster" },
        { value: 'ncaa_mensBasketball_schedule', label: "Men's Basketball Schedule" },
        { value: 'ncaa_mensBasketball_stats', label: "Men's Basketball Stats" },
        { value: 'ncaa_womensBasketball_roster', label: "Women's Basketball Roster" },
        { value: 'ncaa_womensBasketball_schedule', label: "Women's Basketball Schedule" },
        { value: 'ncaa_womensBasketball_stats', label: "Women's Basketball Stats" },
        { value: 'ncaa_baseball_schedule', label: 'Baseball Schedule' }
      );
      // Add ESPN modules if team has ESPN ID configured
      if (team.espnId) {
        modules.push(
          { value: 'espn_ncaa_mbb_schedule', label: "ESPN Men's Basketball Schedule" },
          { value: 'espn_ncaa_wbb_schedule', label: "ESPN Women's Basketball Schedule" },
          { value: 'espn_ncaa_cfb_schedule', label: "ESPN Football Schedule" }
        );
      }
    } else if (team.league === 'MLB' || team.league === 'MILB') {
      modules.push(
        { value: 'mlb_roster', label: 'Baseball Roster' },
        { value: 'mlb_schedule', label: 'Baseball Schedule' }
      );
    } else if (team.league === 'NBA') {
      modules.push(
        { value: 'nba_schedule', label: 'NBA Schedule' },
        { value: 'nba_boxscore', label: 'NBA Boxscore' }
      );
    }

    return modules;
  };

  // Load recent jobs on mount
  useEffect(() => {
    loadRecentJobs();
  }, []);

  // Poll job status when a job is running
  useEffect(() => {
    if (currentJob && jobStatus?.status === 'running') {
      const interval = setInterval(() => {
        checkJobStatus(currentJob);
      }, 2000);
      
      return () => clearInterval(interval);
    }
  }, [currentJob, jobStatus?.status]);

  const loadRecentJobs = async () => {
    try {
      const response = await axios.get('/bulk-fetch/recent');
      setRecentJobs(response.data);
    } catch (error) {
      console.error('Error loading recent jobs:', error);
    }
  };

  const checkJobStatus = async (jobId) => {
    try {
      const response = await axios.get(`/bulk-fetch/status/${jobId}`);
      setJobStatus(response.data);
      
      if (response.data.status === 'completed' || response.data.status === 'failed') {
        setCurrentJob(null);
        loadRecentJobs();
        
        if (response.data.status === 'completed') {
          await showAlert(`Bulk fetch completed! ${response.data.progress.completed} successful, ${response.data.progress.failed} failed.`, 'Success', 'success');
        }
      }
    } catch (error) {
      console.error('Error checking job status:', error);
    }
  };

  // Save to history
  const saveFetchToHistory = (teamId, moduleId, count, success, error = null) => {
    const team = teams.find(t => t.teamId === teamId);
    const historyItem = {
      id: Date.now(),
      teamId,
      teamName: team ? getTeamDisplayName(team) : teamId,
      moduleId,
      count,
      status: success ? 'success' : 'failed',
      error,
      timestamp: new Date().toISOString()
    };
    
    const existingHistory = JSON.parse(localStorage.getItem('singleFetchHistory') || '[]');
    const newHistory = [historyItem, ...existingHistory].slice(0, 100);
    localStorage.setItem('singleFetchHistory', JSON.stringify(newHistory));
  };

  // Single fetch
  const handleSingleFetch = async () => {
    if (!selectedTeam || !selectedModule) {
      await showAlert('Please select both a team and a module', 'Notice', 'info');
      return;
    }

    setLoading(true);
    setError(null);
    setFetchedData([]);
    setViewMode('table'); // ADDED: Reset to table view on new fetch
    setAllRostersMode(false); // Reset all rosters mode
    setAllRostersStats(null);

    try {
      let response;

      if (selectedModule === 'mlb_roster') {
        response = await axios.post(`/fetch/mlb/roster/${selectedTeam}`, {
          season: selectedSeason,
          rosterType: selectedRosterType,
          createBaseline,
          forceRefresh
        });
      } else {
        const requestBody = {
          teamId: selectedTeam,
          createBaseline,
          forceRefresh
        };

        // Include date range for NBA modules with appropriate defaults
        if (selectedModule === 'nba_schedule') {
          requestBody.startDate = nbaScheduleStartDate;
          requestBody.endDate = nbaScheduleEndDate;
        } else if (selectedModule === 'nba_boxscore') {
          requestBody.startDate = nbaBoxscoreStartDate;
          requestBody.endDate = nbaBoxscoreEndDate;
        } else if (selectedModule === 'mlb_schedule') {
          requestBody.startDate = mlbScheduleStartDate;
          requestBody.endDate = mlbScheduleEndDate;
        }

        response = await axios.post(`/fetch/module/${selectedModule}`, requestBody);
      }

      if (response.data.success) {
        setFetchedData(response.data.data);
        saveFetchToHistory(
          selectedTeam, 
          selectedModule, 
          response.data.count || response.data.data.length,
          true
        );
      } else {
        throw new Error(response.data.error || 'Fetch failed');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      saveFetchToHistory(selectedTeam, selectedModule, 0, false, errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Load existing data
  const handleLoadExisting = async () => {
    if (!selectedTeam || !selectedModule) {
      await showAlert('Please select both a team and a module', 'Notice', 'info');
      return;
    }

    setLoading(true);
    setError(null);
    setViewMode('table'); // ADDED: Reset to table view on load existing
    setAllRostersMode(false); // Reset all rosters mode
    setAllRostersStats(null);

    try {
      // Determine sort order based on module type
      // Schedule modules should sort by date ascending (upcoming first)
      const isScheduleModule = selectedModule.includes('schedule');

      // Build query params
      const queryParams = {
        teamId: selectedTeam,
        moduleId: selectedModule,
        limit: 500,
        sortBy: isScheduleModule ? 'data.date' : 'updatedAt',
        sortOrder: isScheduleModule ? 'asc' : 'desc'
      };

      // Add MLB roster-specific filters
      if (selectedModule === 'mlb_roster') {
        queryParams.rosterType = selectedRosterType;
        queryParams.season = selectedSeason;
      }

      const response = await axios.get('/data/scraped', {
        params: queryParams
      });

      setFetchedData(response.data);
      
      if (response.data.length === 0) {
        await showAlert('No existing data found for this team/module combination', 'Notice', 'info');
      } else {
        saveFetchToHistory(
          selectedTeam,
          selectedModule,
          response.data.length,
          true
        );
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
      saveFetchToHistory(selectedTeam, selectedModule, 0, false, errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Load Oracle MLB schedule data
  const handleLoadOracle = async () => {
    if (!selectedTeam || !selectedModule) {
      await showAlert('Please select both a team and a module', 'Notice', 'info');
      return;
    }

    setLoading(true);
    setError(null);
    setViewMode('table');
    setAllRostersMode(false);
    setAllRostersStats(null);

    try {
      const response = await axios.get('/data/oracle-schedule', {
        params: {
          teamId: selectedTeam,
          season: selectedSeason
        }
      });

      setFetchedData(response.data);

      if (response.data.length === 0) {
        await showAlert('No Oracle schedule data found for this team/season', 'Notice', 'info');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // MLB Player Lookup by person ID
  const handlePlayerLookup = async () => {
    if (!playerLookupId.trim()) return;
    setPlayerLookupLoading(true);
    setPlayerLookupData(null);
    setError(null);
    try {
      const response = await axios.get(`/fetch/mlb/player/${playerLookupId.trim()}`);
      setPlayerLookupData(response.data);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
    } finally {
      setPlayerLookupLoading(false);
    }
  };

  // Load all MLB rosters (deduped by player ID)
  const [allRostersMode, setAllRostersMode] = useState(false);
  const [allRostersStats, setAllRostersStats] = useState(null);

  const handleLoadAllMLBRosters = async () => {
    setLoading(true);
    setError(null);
    setViewMode('table');
    setAllRostersMode(true);

    try {
      const response = await axios.get('/data/mlb-rosters-all', {
        params: { season: selectedSeason }
      });

      setFetchedData(response.data.data);
      setAllRostersStats({
        total: response.data.total,
        unique: response.data.unique,
        season: response.data.season
      });

      if (response.data.data.length === 0) {
        await showAlert('No MLB roster data found. Run a bulk fetch first.', 'Notice', 'info');
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message;
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  // Bulk fetch
  const handleBulkFetch = async () => {
    if (!selectedLeague) {
      await showAlert('Please select at least a league', 'Notice', 'info');
      return;
    }
    
    const teamsToFetch = selectedTeams.length > 0 ? selectedTeams : getFilteredTeams().map(t => t.teamId);
    const modulesToFetch = selectedModules.length > 0 ? selectedModules : [];
    
    if (teamsToFetch.length === 0) {
      await showAlert('No teams match your filters', 'Notice', 'info');
      return;
    }
    
    setLoading(true);
    setError(null);

    try {
      // Determine date range based on league
      let startDate, endDate;
      if (selectedLeague === 'NBA') {
        startDate = nbaBulkStartDate;
        endDate = nbaBulkEndDate;
      } else if (selectedLeague === 'MLB' || selectedLeague === 'MILB') {
        startDate = mlbBulkStartDate;
        endDate = mlbBulkEndDate;
      }

      const requestPayload = {
        league: selectedLeague,
        conference: selectedConference || undefined,
        division: selectedDivision || undefined,
        teams: selectedTeams.length > 0 ? selectedTeams : undefined,
        modules: modulesToFetch,
        targetDate: targetDate || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        createBaseline,
        forceRefresh,
        // MLB-specific options for roster fetching
        rosterTypes: (selectedLeague === 'MLB' || selectedLeague === 'MILB') ? mlbBulkRosterTypes : undefined,
        season: (selectedLeague === 'MLB' || selectedLeague === 'MILB') ? mlbBulkSeason : undefined
      };

      const createResponse = await axios.post('/bulk-fetch/create', requestPayload);
      
      const { jobId, estimatedSeconds, totalOperations, teams: eligibleTeams, teamsFiltered } = createResponse.data;

      const minutes = Math.ceil(estimatedSeconds / 60);

      let confirmMessage = `This will fetch data for ${eligibleTeams} eligible team${eligibleTeams !== 1 ? 's' : ''} with ${modulesToFetch.length || 'all'} modules.\n`;
      if (teamsFiltered > 0) {
        confirmMessage += `(${teamsFiltered} team${teamsFiltered !== 1 ? 's' : ''} filtered out - missing required sport configuration)\n`;
      }
      // Show roster types for MLB
      if ((selectedLeague === 'MLB' || selectedLeague === 'MILB') && mlbBulkRosterTypes.length > 0) {
        confirmMessage += `Roster types: ${mlbBulkRosterTypes.join(', ')}\n`;
        confirmMessage += `Season: ${mlbBulkSeason}\n`;
      }
      confirmMessage += `Total operations: ${totalOperations}\n` +
        `Estimated time: ${minutes} minutes\n\n` +
        `Continue?`;

      const confirmed = window.confirm(confirmMessage);
      
      if (!confirmed) {
        setLoading(false);
        return;
      }
      
      await axios.post(`/bulk-fetch/start/${jobId}`);
      
      setCurrentJob(jobId);
      setShowProgressModal(true);
      checkJobStatus(jobId);
      
    } catch (error) {
      setError(error.response?.data?.error || error.message);
    } finally {
      setLoading(false);
    }
  };

  // Cancel job
  const handleCancelJob = async () => {
    if (!currentJob) return;

    try {
      await axios.post(`/bulk-fetch/cancel/${currentJob}`);
      setCurrentJob(null);
      setShowProgressModal(false);
      await showAlert('Job cancelled', 'Notice', 'info');
    } catch (error) {
      await showAlert('Error cancelling job: ' + error.message, 'Error', 'error');
    }
  };

  // ESPN modules list
  const espnModules = [
    { value: 'espn_ncaa_mbb_schedule', label: "NCAA Men's Basketball Schedule" },
    { value: 'espn_ncaa_wbb_schedule', label: "NCAA Women's Basketball Schedule" },
    { value: 'espn_ncaa_cfb_schedule', label: "NCAA Football Schedule" },
    // Future modules can be added here:
    // { value: 'espn_nba_schedule', label: "NBA Schedule" },
    // { value: 'espn_wnba_schedule', label: "WNBA Schedule" },
  ];

  // ESPN fetch handler
  const handleEspnFetch = async () => {
    if (!selectedEspnModule) {
      await showAlert('Please select an ESPN module', 'Notice', 'info');
      return;
    }

    if (!espnStartWeek || !espnEndWeek) {
      await showAlert('Please select both start and end weeks', 'Notice', 'info');
      return;
    }

    if (espnStartWeek > espnEndWeek) {
      await showAlert('Start week must be less than or equal to end week', 'Notice', 'info');
      return;
    }

    setLoading(true);
    setEspnFetchStatus({ status: 'running', message: `Fetching weeks ${espnStartWeek} to ${espnEndWeek}...` });

    try {
      const response = await axios.post('/fetch/espn/schedule', {
        moduleId: selectedEspnModule,
        startWeek: espnStartWeek,
        endWeek: espnEndWeek,
        createBaseline
      });

      const { weeksProcessed, totalEventsFound, totalGamesMatched, totalGamesSaved } = response.data;

      setEspnFetchStatus({
        status: 'completed',
        message: `Processed ${weeksProcessed} weeks. Found ${totalEventsFound} events. Saved ${totalGamesSaved} games for your teams.`
      });

      await showAlert(
        `ESPN bulk fetch completed!\n\nWeeks processed: ${weeksProcessed}\nTotal events found: ${totalEventsFound}\nGames matched to your teams: ${totalGamesMatched}\nGames saved: ${totalGamesSaved}`,
        'Success',
        'success'
      );

    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message;
      setEspnFetchStatus({ status: 'failed', message: errorMessage });
      await showAlert('ESPN fetch failed: ' + errorMessage, 'Error', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Export data
  const handleExport = () => {
    if (filteredData.length === 0) return;
    
    const team = teams.find(t => t.teamId === selectedTeam);
    const teamName = team ? getTeamDisplayName(team).replace(/\s+/g, '_') : selectedTeam;
    
    const exportData = filteredData.map(item => item.data);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${teamName}_${selectedModule}_${Date.now()}.json`;
    a.click();
  };

  // Get unique positions from fetched data (for roster) or locations (for schedule)
  const isScheduleModule = selectedModule?.includes('schedule');
  const positions = isScheduleModule ? [] : [...new Set(fetchedData.map(item =>
    item.data?.position || item.data?.positionName
  ).filter(Boolean))].sort();

  const locations = isScheduleModule ? [...new Set(fetchedData.map(item => {
    const loc = item.data?.locationIndicator;
    if (loc === 'H') return 'Home';
    if (loc === 'A') return 'Away';
    if (loc === 'N') return 'Neutral';
    return null;
  }).filter(Boolean))].sort() : [];

  // Filter data based on search and filters
  const filteredData = fetchedData.filter(item => {
    const data = item.data;

    if (isScheduleModule) {
      // Schedule filtering
      const matchesSearch = !searchTerm ||
        data.opponent?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        data.venue?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        data.location?.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesLocation = !filterPosition ||
        (filterPosition === 'Home' && data.locationIndicator === 'H') ||
        (filterPosition === 'Away' && data.locationIndicator === 'A') ||
        (filterPosition === 'Neutral' && data.locationIndicator === 'N');

      return matchesSearch && matchesLocation;
    } else {
      // Player/roster filtering
      const matchesSearch = !searchTerm ||
        data.displayName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        data.fullName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        data.jerseyNumber?.includes(searchTerm) ||
        data.jersey?.includes(searchTerm);

      const matchesPosition = !filterPosition ||
        data.position === filterPosition ||
        data.positionName === filterPosition;

      return matchesSearch && matchesPosition;
    }
  });

  // Format date
  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="fetch-dashboard">
      <div className="dashboard-header">
        <h2>Data Fetch Center</h2>
        <div className="header-actions">
          <button 
            className="btn-secondary"
            onClick={() => setShowHistoryModal(true)}
          >
            <History size={16} />
            View History
          </button>
          <div className="mode-toggle">
            <button 
              className={`btn-secondary ${fetchMode === 'single' ? 'active' : ''}`}
              onClick={() => setFetchMode('single')}
            >
              Single Fetch
            </button>
            <button 
              className={`btn-secondary ${fetchMode === 'bulk' ? 'active' : ''}`}
              onClick={() => setFetchMode('bulk')}
            >
              Bulk Fetch
            </button>
          </div>
        </div>
      </div>

      {/* Single Fetch Mode */}
      {fetchMode === 'single' && (
        <div className="fetch-controls">
          <div className="control-group">
            <label><Trophy size={14} /> League</label>
            <select
              value={singleFetchLeague}
              onChange={(e) => {
                setSingleFetchLeague(e.target.value);
                setSingleFetchConference('');
                setSelectedTeam('');
                setSelectedModule('');
                setFetchedData([]);
                setError(null);
              }}
            >
              <option value="">All Leagues</option>
              {leagues.map(league => (
                <option key={league} value={league}>{league}</option>
              ))}
            </select>
          </div>

          {singleFetchLeague === 'NCAA' && singleFetchConferences.length > 0 && (
            <div className="control-group">
              <label><Building2 size={14} /> Conference (Optional)</label>
              <select
                value={singleFetchConference}
                onChange={(e) => {
                  setSingleFetchConference(e.target.value);
                  setSelectedTeam('');
                  setSelectedModule('');
                  setFetchedData([]);
                  setError(null);
                }}
              >
                <option value="">All Conferences</option>
                {singleFetchConferences.map(conf => (
                  <option key={conf} value={conf}>{conf}</option>
                ))}
              </select>
            </div>
          )}

          <div className="control-group">
            <label><Users size={14} /> Team</label>
            <select
              value={selectedTeam}
              onChange={(e) => {
                setSelectedTeam(e.target.value);
                setSelectedModule('');
                setFetchedData([]);
                setError(null);
              }}
            >
              <option value="">Select a team...</option>
              {teams
                .filter(team => {
                  if (singleFetchLeague && team.league !== singleFetchLeague) return false;
                  if (singleFetchConference && team.conference !== singleFetchConference) return false;
                  return true;
                })
                .map(team => (
                  <option key={team.teamId} value={team.teamId}>
                    {getTeamDisplayName(team)} ({team.league})
                  </option>
                ))}
            </select>
          </div>

          <div className="control-group">
            <label><Package size={14} /> Module</label>
            <select 
              value={selectedModule} 
              onChange={(e) => {
                setSelectedModule(e.target.value);
                setFetchedData([]);
                setError(null);
              }}
              disabled={!selectedTeam}
            >
              <option value="">Select a module...</option>
              {getAvailableModulesForTeam().map(module => (
                <option key={module.value} value={module.value}>
                  {module.label}
                </option>
              ))}
            </select>
          </div>

          {/* MLB-specific controls */}
          {selectedModule === 'mlb_roster' && (
            <>
              <div className="control-group">
                <label><Calendar size={14} /> Season</label>
                <select
                  value={selectedSeason}
                  onChange={(e) => setSelectedSeason(e.target.value)}
                >
                  {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - i).map(year => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="control-group">
                <label><Trophy size={14} /> Roster Type</label>
                <select
                  value={selectedRosterType}
                  onChange={(e) => setSelectedRosterType(e.target.value)}
                >
                  {mlbRosterTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          {/* NBA Schedule - date range controls */}
          {selectedModule === 'nba_schedule' && (
            <>
              <div className="control-group">
                <label><Calendar size={14} /> Start Date</label>
                <input
                  type="date"
                  value={nbaScheduleStartDate}
                  onChange={(e) => setNbaScheduleStartDate(e.target.value)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    border: '2px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    width: '100%'
                  }}
                />
              </div>

              <div className="control-group">
                <label><Calendar size={14} /> End Date</label>
                <input
                  type="date"
                  value={nbaScheduleEndDate}
                  onChange={(e) => setNbaScheduleEndDate(e.target.value)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    border: '2px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    width: '100%'
                  }}
                />
              </div>
            </>
          )}

          {/* NBA Boxscore - date range controls */}
          {selectedModule === 'nba_boxscore' && (
            <>
              <div className="control-group">
                <label><Calendar size={14} /> Start Date</label>
                <input
                  type="date"
                  value={nbaBoxscoreStartDate}
                  onChange={(e) => setNbaBoxscoreStartDate(e.target.value)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    border: '2px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    width: '100%'
                  }}
                />
              </div>

              <div className="control-group">
                <label><Calendar size={14} /> End Date</label>
                <input
                  type="date"
                  value={nbaBoxscoreEndDate}
                  onChange={(e) => setNbaBoxscoreEndDate(e.target.value)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    border: '2px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    width: '100%'
                  }}
                />
              </div>
            </>
          )}

          {/* MLB Schedule - date range controls */}
          {selectedModule === 'mlb_schedule' && (
            <>
              <div className="control-group">
                <label><Calendar size={14} /> Start Date</label>
                <input
                  type="date"
                  value={mlbScheduleStartDate}
                  onChange={(e) => setMlbScheduleStartDate(e.target.value)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    border: '2px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    width: '100%'
                  }}
                />
              </div>

              <div className="control-group">
                <label><Calendar size={14} /> End Date</label>
                <input
                  type="date"
                  value={mlbScheduleEndDate}
                  onChange={(e) => setMlbScheduleEndDate(e.target.value)}
                  style={{
                    padding: '0.625rem 0.75rem',
                    border: '2px solid #ced4da',
                    borderRadius: '6px',
                    fontSize: '0.95rem',
                    width: '100%'
                  }}
                />
              </div>
            </>
          )}

          {/* Baseline, Force Refresh, Action Buttons */}
          {(<>
          <div className="control-group" style={{
            marginTop: '1.5rem',
            padding: '0.75rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px',
            border: '1px solid #dee2e6'
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}>
              <input
                type="checkbox"
                checked={createBaseline}
                onChange={(e) => setCreateBaseline(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Create Baseline (for comparison)
            </label>
            <small style={{ display: 'block', marginTop: '0.25rem', color: '#6c757d', marginLeft: '1.5rem' }}>
              Save current data before fetching new data (slower but enables comparison)
            </small>
          </div>

          <div style={{ marginBottom: '1rem' }}>
            <label style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              cursor: 'pointer',
              fontWeight: '500'
            }}>
              <input
                type="checkbox"
                checked={forceRefresh}
                onChange={(e) => setForceRefresh(e.target.checked)}
                style={{ cursor: 'pointer' }}
              />
              Force New Fetch (bypass cache)
            </label>
            <small style={{ display: 'block', marginTop: '0.25rem', color: '#6c757d', marginLeft: '1.5rem' }}>
              Ignore cached data and fetch fresh data from source
            </small>
          </div>

          <div className="control-actions">
            <button 
              className="btn-primary"
              onClick={handleSingleFetch}
              disabled={loading || !selectedTeam || !selectedModule}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  Fetching...
                </>
              ) : (
                <>
                  <RefreshCw size={16} />
                  Fetch New Data
                </>
              )}
            </button>
            
            <button 
              className="btn-secondary"
              onClick={handleLoadExisting}
              disabled={loading || !selectedTeam || !selectedModule}
            >
              {loading ? (
                <>
                  <Loader2 size={16} className="spinner" />
                  Loading...
                </>
              ) : (
                <>
                  <FolderOpen size={16} />
                  Load Existing
                </>
              )}
            </button>

            {/* Load Oracle Schedule - only for MLB schedule module */}
            {selectedModule === 'mlb_schedule' && (
              <button
                className="btn-secondary"
                onClick={handleLoadOracle}
                disabled={loading || !selectedTeam}
                style={{
                  backgroundColor: '#fff3e0',
                  borderColor: '#e65100',
                  color: '#e65100'
                }}
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    Loading Oracle...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Load Oracle
                  </>
                )}
              </button>
            )}

            {/* MLB Player Lookup */}
            {(singleFetchLeague === 'MLB' || singleFetchLeague === 'MILB') && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginLeft: '8px' }}>
                <input
                  type="text"
                  placeholder="MLB Person ID"
                  value={playerLookupId}
                  onChange={(e) => setPlayerLookupId(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePlayerLookup()}
                  style={{
                    width: '140px',
                    padding: '8px 10px',
                    border: '2px solid #e65100',
                    borderRadius: '6px',
                    fontSize: '0.9rem',
                    backgroundColor: '#fff3e0',
                    color: '#333'
                  }}
                />
                <button
                  className="btn-secondary"
                  onClick={handlePlayerLookup}
                  disabled={playerLookupLoading || !playerLookupId.trim()}
                  style={{
                    backgroundColor: '#fff3e0',
                    borderColor: '#e65100',
                    color: '#e65100',
                    padding: '8px 12px'
                  }}
                >
                  {playerLookupLoading ? (
                    <Loader2 size={16} className="spinner" />
                  ) : (
                    <>
                      <Search size={16} />
                      Player Lookup
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
          </>)}
        </div>
      )}

      {/* Player Lookup Results */}
      {playerLookupData && (
        <div style={{
          margin: '1.5rem 0',
          padding: '2rem',
          backgroundColor: '#fff',
          borderRadius: '10px',
          border: '2px solid #1565c0',
          color: '#222'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '2px solid #1565c0', paddingBottom: '1rem' }}>
            <h2 style={{ margin: 0, fontSize: '1.5rem', color: '#1565c0' }}>
              {playerLookupData.fullName}
              {playerLookupData.primaryNumber && <span style={{ color: '#666', marginLeft: '10px' }}>#{playerLookupData.primaryNumber}</span>}
            </h2>
            <button
              onClick={() => setPlayerLookupData(null)}
              style={{ background: '#f5f5f5', border: '1px solid #ccc', borderRadius: '4px', color: '#666', cursor: 'pointer', padding: '4px 8px' }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.75rem', marginBottom: '2rem', fontSize: '1rem', lineHeight: '1.8' }}>
            <div><strong style={{ color: '#1565c0' }}>Position:</strong> {playerLookupData.primaryPosition?.name} ({playerLookupData.primaryPosition?.abbreviation})</div>
            <div><strong style={{ color: '#1565c0' }}>Bats/Throws:</strong> {playerLookupData.batSide?.description} / {playerLookupData.pitchHand?.description}</div>
            <div><strong style={{ color: '#1565c0' }}>Height/Weight:</strong> {playerLookupData.height}, {playerLookupData.weight} lbs</div>
            <div><strong style={{ color: '#1565c0' }}>Age:</strong> {playerLookupData.currentAge}</div>
            <div><strong style={{ color: '#1565c0' }}>Birth Date:</strong> {playerLookupData.birthDate}</div>
            <div><strong style={{ color: '#1565c0' }}>Birthplace:</strong> {[playerLookupData.birthCity, playerLookupData.birthStateProvince, playerLookupData.birthCountry].filter(Boolean).join(', ')}</div>
            <div><strong style={{ color: '#1565c0' }}>MLB Debut:</strong> {playerLookupData.mlbDebutDate || 'N/A'}</div>
            {playerLookupData.pronunciation && <div><strong style={{ color: '#1565c0' }}>Pronunciation:</strong> {playerLookupData.pronunciation}</div>}
            <div><strong style={{ color: '#1565c0' }}>Active:</strong> {playerLookupData.active ? 'Yes' : 'No'}</div>
            <div>
              <strong style={{ color: '#1565c0' }}>MLB ID:</strong> {playerLookupData.id}
              {(() => {
                const bisRef = playerLookupData.xrefIds?.find(x => x.xrefType === 'bis');
                return bisRef ? <span style={{ marginLeft: '20px' }}><strong style={{ color: '#1565c0' }}>BIS ID:</strong> {bisRef.xrefId}</span> : null;
              })()}
            </div>
          </div>

          {/* Transactions */}
          {playerLookupData.transactions && playerLookupData.transactions.length > 0 && (
            <div>
              <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1.1rem', color: '#1565c0' }}>Transaction History ({playerLookupData.transactions.length})</h3>
              <div style={{ maxHeight: '500px', overflowY: 'auto', borderRadius: '6px', border: '1px solid #ddd' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#e3f2fd' }}>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#1565c0', borderBottom: '2px solid #1565c0' }}>Date</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#1565c0', borderBottom: '2px solid #1565c0' }}>Type</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontWeight: '600', color: '#1565c0', borderBottom: '2px solid #1565c0' }}>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...playerLookupData.transactions].sort((a, b) => new Date(b.date) - new Date(a.date)).map((t, i) => (
                      <tr key={t.id || i} style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#f8f9fa', borderBottom: '1px solid #eee' }}>
                        <td style={{ whiteSpace: 'nowrap', padding: '10px 14px', color: '#333' }}>{t.date}</td>
                        <td style={{ whiteSpace: 'nowrap', padding: '10px 14px', color: '#555', fontWeight: '500' }}>{t.typeDesc}</td>
                        <td style={{ padding: '10px 14px', color: '#333' }}>{t.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bulk Fetch Mode */}
      {fetchMode === 'bulk' && (
        <div className="bulk-fetch-section">
          <div className="bulk-filters">
            <div className="filter-row">
              <div className="control-group">
                <label><Trophy size={14} /> League / Source *</label>
                <select
                  value={selectedLeague}
                  onChange={(e) => {
                    setSelectedLeague(e.target.value);
                    setSelectedConference('');
                    setSelectedDivision('');
                    setSelectedTeams([]);
                    setSelectedModules([]);
                    setSelectedEspnModule('');
                  }}
                >
                  <option value="">Select league...</option>
                  {leagues.map(league => (
                    <option key={league} value={league}>{league}</option>
                  ))}
                  <option value="ESPN">ESPN (All Games by Date)</option>
                </select>
              </div>

              {selectedLeague === 'NCAA' && (
                <>
                  <div className="control-group">
                    <label><Building2 size={14} /> Conference (Optional)</label>
                    <select 
                      value={selectedConference} 
                      onChange={(e) => {
                        setSelectedConference(e.target.value);
                        setSelectedDivision('');
                        setSelectedTeams([]);
                      }}
                    >
                      <option value="">All Conferences</option>
                      {conferences.map(conf => (
                        <option key={conf} value={conf}>{conf}</option>
                      ))}
                    </select>
                  </div>

                  <div className="control-group">
                    <label>Division (Optional)</label>
                    <select 
                      value={selectedDivision} 
                      onChange={(e) => {
                        setSelectedDivision(e.target.value);
                        setSelectedTeams([]);
                      }}
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

            {/* ESPN-specific UI */}
            {selectedLeague === 'ESPN' && (
              <div className="espn-fetch-section" style={{
                marginTop: '1.5rem',
                padding: '1.5rem',
                backgroundColor: '#fff8e6',
                borderRadius: '12px',
                border: '2px solid #ffc107'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '8px',
                    backgroundColor: '#ffc107',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#000'
                  }}>
                    <Calendar size={20} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#856404' }}>ESPN Schedule Bulk Fetch</h3>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#997404' }}>
                      Fetch all games from ESPN scoreboard by week (matches to your teams)
                    </p>
                  </div>
                </div>

                <div className="control-group" style={{ marginBottom: '1rem' }}>
                  <label style={{ fontWeight: '500', color: '#856404' }}>ESPN Module *</label>
                  <select
                    value={selectedEspnModule}
                    onChange={(e) => setSelectedEspnModule(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '2px solid #ffc107',
                      borderRadius: '8px',
                      fontSize: '1rem',
                      backgroundColor: 'white'
                    }}
                  >
                    <option value="">Select ESPN module...</option>
                    {espnModules.map(module => (
                      <option key={module.value} value={module.value}>{module.label}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                  <div className="control-group" style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ fontWeight: '500', color: '#856404' }}>Start Week *</label>
                    <select
                      value={espnStartWeek}
                      onChange={(e) => setEspnStartWeek(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '2px solid #ffc107',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        backgroundColor: 'white'
                      }}
                    >
                      {Array.from({ length: 25 }, (_, i) => i + 1).map(week => (
                        <option key={week} value={week}>Week {week}</option>
                      ))}
                    </select>
                  </div>
                  <div className="control-group" style={{ flex: 1, minWidth: '150px' }}>
                    <label style={{ fontWeight: '500', color: '#856404' }}>End Week *</label>
                    <select
                      value={espnEndWeek}
                      onChange={(e) => setEspnEndWeek(parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        border: '2px solid #ffc107',
                        borderRadius: '8px',
                        fontSize: '1rem',
                        backgroundColor: 'white'
                      }}
                    >
                      {Array.from({ length: 25 }, (_, i) => i + 1).map(week => (
                        <option key={week} value={week}>Week {week}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{
                  padding: '0.75rem',
                  backgroundColor: 'rgba(255, 193, 7, 0.2)',
                  borderRadius: '6px',
                  marginBottom: '1rem'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '500',
                    color: '#856404'
                  }}>
                    <input
                      type="checkbox"
                      checked={createBaseline}
                      onChange={(e) => setCreateBaseline(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Create Baseline (for comparison)
                  </label>
                </div>

                {espnFetchStatus && (
                  <div style={{
                    padding: '0.75rem',
                    borderRadius: '6px',
                    marginBottom: '1rem',
                    backgroundColor: espnFetchStatus.status === 'completed' ? '#d4edda' :
                                     espnFetchStatus.status === 'failed' ? '#f8d7da' : '#cce5ff',
                    color: espnFetchStatus.status === 'completed' ? '#155724' :
                           espnFetchStatus.status === 'failed' ? '#721c24' : '#004085'
                  }}>
                    {espnFetchStatus.status === 'running' && <Loader2 size={14} className="spinner" style={{ marginRight: '0.5rem' }} />}
                    {espnFetchStatus.message}
                  </div>
                )}

                <button
                  className="btn-primary btn-large"
                  onClick={handleEspnFetch}
                  disabled={loading || !selectedEspnModule}
                  style={{
                    width: '100%',
                    backgroundColor: '#ffc107',
                    borderColor: '#ffc107',
                    color: '#000'
                  }}
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="spinner" />
                      Fetching ESPN Data...
                    </>
                  ) : (
                    <>
                      <Play size={16} />
                      Fetch ESPN Schedule
                    </>
                  )}
                </button>

                <p style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#997404', textAlign: 'center' }}>
                  Fetches games for selected weeks and saves only games involving your teams.
                  <br />Existing ESPN data for this module will be replaced.
                </p>
              </div>
            )}

            {selectedLeague && selectedLeague !== 'ESPN' && (
              <>
                <div className="selection-info">
                  <p>{getFilteredTeams().length} teams match your filters</p>
                </div>

                <div className="multi-select-section">
                  <div className="multi-select-group">
                    <label>
                      Teams (Optional - leave empty for all)
                      <button 
                        className="btn-link"
                        onClick={() => {
                          const allTeamIds = getFilteredTeams().map(t => t.teamId);
                          setSelectedTeams(selectedTeams.length === allTeamIds.length ? [] : allTeamIds);
                        }}
                      >
                        {selectedTeams.length === getFilteredTeams().length ? 'Deselect All' : 'Select All'}
                      </button>
                    </label>
                    <div className="checkbox-grid">
                      {getFilteredTeams().map(team => (
                        <label key={team.teamId} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedTeams.includes(team.teamId)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTeams([...selectedTeams, team.teamId]);
                              } else {
                                setSelectedTeams(selectedTeams.filter(id => id !== team.teamId));
                              }
                            }}
                          />
                          {getTeamDisplayName(team)}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="multi-select-group">
                    <label>
                      Modules (Optional - leave empty for all available)
                      <button 
                        className="btn-link"
                        onClick={() => {
                          const allModules = getAvailableModulesForLeague().map(m => m.value);
                          setSelectedModules(selectedModules.length === allModules.length ? [] : allModules);
                        }}
                      >
                        {selectedModules.length === getAvailableModulesForLeague().length ? 'Deselect All' : 'Select All'}
                      </button>
                    </label>
                    <div className="checkbox-grid">
                      {getAvailableModulesForLeague().map(module => (
                        <label key={module.value} className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={selectedModules.includes(module.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedModules([...selectedModules, module.value]);
                              } else {
                                setSelectedModules(selectedModules.filter(m => m !== module.value));
                              }
                            }}
                          />
                          {module.label}
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                {/* NBA Date Range - show when NBA league is selected */}
                {selectedLeague === 'NBA' && (
                  <div className="control-group" style={{
                    marginTop: '1.5rem',
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
                      Date Range for NBA Data
                    </label>
                    <div style={{ fontSize: '0.85em', color: '#856404', marginBottom: '0.75rem' }}>
                      Specify the date range for fetching NBA schedule and boxscore data.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#856404' }}>From:</span>
                        <input
                          type="date"
                          value={nbaBulkStartDate}
                          onChange={(e) => setNbaBulkStartDate(e.target.value)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            border: '2px solid #ffc107',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            backgroundColor: 'white'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#856404' }}>To:</span>
                        <input
                          type="date"
                          value={nbaBulkEndDate}
                          onChange={(e) => setNbaBulkEndDate(e.target.value)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            border: '2px solid #ffc107',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            backgroundColor: 'white'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* MLB Date Range - show when schedule module is selected OR no modules selected */}
                {(selectedLeague === 'MLB' || selectedLeague === 'MILB') &&
                 (selectedModules.length === 0 || selectedModules.includes('mlb_schedule')) && (
                  <div className="control-group" style={{
                    marginTop: '1.5rem',
                    padding: '1rem',
                    backgroundColor: '#d4edda',
                    borderRadius: '8px',
                    border: '1px solid #28a745'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      fontWeight: '500',
                      color: '#155724'
                    }}>
                      <Calendar size={16} />
                      Date Range for MLB Schedule
                    </label>
                    <div style={{ fontSize: '0.85em', color: '#155724', marginBottom: '0.75rem' }}>
                      Specify the date range for fetching MLB schedule data. Defaults to today through end of season.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#155724' }}>From:</span>
                        <input
                          type="date"
                          value={mlbBulkStartDate}
                          onChange={(e) => setMlbBulkStartDate(e.target.value)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            border: '2px solid #28a745',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            backgroundColor: 'white'
                          }}
                        />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#155724' }}>To:</span>
                        <input
                          type="date"
                          value={mlbBulkEndDate}
                          onChange={(e) => setMlbBulkEndDate(e.target.value)}
                          style={{
                            padding: '0.5rem 0.75rem',
                            border: '2px solid #28a745',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            backgroundColor: 'white'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* MLB Roster Types Multi-Select - show when roster module is selected OR no modules selected */}
                {(selectedLeague === 'MLB' || selectedLeague === 'MILB') &&
                 (selectedModules.length === 0 || selectedModules.includes('mlb_roster')) && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '1rem',
                    backgroundColor: '#e8f5e9',
                    borderRadius: '8px',
                    border: '2px solid #4caf50'
                  }}>
                    <label style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: '0.5rem',
                      fontWeight: '500',
                      color: '#2e7d32'
                    }}>
                      <Users size={16} />
                      Roster Types to Fetch
                    </label>
                    <div style={{ fontSize: '0.85em', color: '#2e7d32', marginBottom: '0.75rem' }}>
                      Select which roster types to fetch. Multiple selections will fetch each type for all teams.
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                      {mlbRosterTypes.map(type => (
                        <label
                          key={type.value}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.375rem',
                            padding: '0.5rem 0.75rem',
                            backgroundColor: mlbBulkRosterTypes.includes(type.value) ? '#4caf50' : 'white',
                            color: mlbBulkRosterTypes.includes(type.value) ? 'white' : '#333',
                            border: '2px solid #4caf50',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: mlbBulkRosterTypes.includes(type.value) ? '600' : '400',
                            transition: 'all 0.2s ease'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={mlbBulkRosterTypes.includes(type.value)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setMlbBulkRosterTypes([...mlbBulkRosterTypes, type.value]);
                              } else {
                                setMlbBulkRosterTypes(mlbBulkRosterTypes.filter(t => t !== type.value));
                              }
                            }}
                            style={{ display: 'none' }}
                          />
                          {mlbBulkRosterTypes.includes(type.value) && <CheckCircle size={14} />}
                          {type.label}
                        </label>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '0.9rem', color: '#2e7d32' }}>Season:</span>
                        <select
                          value={mlbBulkSeason}
                          onChange={(e) => setMlbBulkSeason(parseInt(e.target.value))}
                          style={{
                            padding: '0.5rem 0.75rem',
                            border: '2px solid #4caf50',
                            borderRadius: '6px',
                            fontSize: '0.9rem',
                            backgroundColor: 'white'
                          }}
                        >
                          {Array.from({ length: 7 }, (_, i) => new Date().getFullYear() - i).map(year => (
                            <option key={year} value={year}>{year}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={() => setMlbBulkRosterTypes(['active', '40man', 'fullRoster'])}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#e3f2fd',
                          color: '#1565c0',
                          border: '1px solid #90caf9',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Select Common
                      </button>
                      <button
                        onClick={() => setMlbBulkRosterTypes(mlbRosterTypes.map(t => t.value))}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#fff3e0',
                          color: '#e65100',
                          border: '1px solid #ffcc80',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setMlbBulkRosterTypes([])}
                        style={{
                          padding: '0.375rem 0.75rem',
                          fontSize: '0.8rem',
                          backgroundColor: '#ffebee',
                          color: '#c62828',
                          border: '1px solid #ef9a9a',
                          borderRadius: '4px',
                          cursor: 'pointer'
                        }}
                      >
                        Clear All
                      </button>
                    </div>
                    {mlbBulkRosterTypes.length === 0 && (
                      <div style={{ marginTop: '0.5rem', color: '#c62828', fontSize: '0.85rem' }}>
                        ⚠️ Please select at least one roster type
                      </div>
                    )}
                    {mlbBulkRosterTypes.length > 0 && (
                      <div style={{ marginTop: '0.75rem', padding: '0.5rem 0.75rem', backgroundColor: '#fff', borderRadius: '4px', border: '1px solid #4caf50' }}>
                        <strong style={{ color: '#2e7d32' }}>Will fetch {mlbBulkRosterTypes.length} roster type(s):</strong>{' '}
                        <span style={{ color: '#333' }}>
                          {mlbBulkRosterTypes.map(t => mlbRosterTypes.find(rt => rt.value === t)?.label || t).join(', ')}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* Only show date picker if stats modules are selected */}
                {selectedModules.some(m => m.includes('stats')) && (
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
                      Target Date (Optional)
                    </label>
                    <div style={{ fontSize: '0.85em', color: '#6c757d', marginBottom: '0.75rem' }}>
                      Filter to only fetch games played on this specific date. Cache will be bypassed.
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <input
                        type="date"
                        value={targetDate}
                        onChange={(e) => setTargetDate(e.target.value)}
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
                      {targetDate && (
                        <button
                          className="btn-link"
                          onClick={() => setTargetDate('')}
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

                {/* Baseline Creation Option for Bulk Fetch */}
                <div className="control-group" style={{
                  marginTop: '1.5rem',
                  padding: '0.75rem',
                  backgroundColor: '#f8f9fa',
                  borderRadius: '6px',
                  border: '1px solid #dee2e6'
                }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}>
                    <input
                      type="checkbox"
                      checked={createBaseline}
                      onChange={(e) => setCreateBaseline(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Create Baseline (for comparison)
                  </label>
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#6c757d', marginLeft: '1.5rem' }}>
                    Save current data before fetching new data (slower but enables comparison)
                  </small>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    cursor: 'pointer',
                    fontWeight: '500'
                  }}>
                    <input
                      type="checkbox"
                      checked={forceRefresh}
                      onChange={(e) => setForceRefresh(e.target.checked)}
                      style={{ cursor: 'pointer' }}
                    />
                    Force New Fetch (bypass cache)
                  </label>
                  <small style={{ display: 'block', marginTop: '0.25rem', color: '#6c757d', marginLeft: '1.5rem' }}>
                    Ignore cached data and fetch fresh data from source
                  </small>
                </div>

                <div className="bulk-actions">
                  <button 
                    className="btn-primary btn-large"
                    onClick={handleBulkFetch}
                    disabled={loading || !selectedLeague}
                  >
                    {loading ? (
                      <>
                        <Loader2 size={16} className="spinner" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Play size={16} />
                        Start Bulk Fetch
                      </>
                    )}
                  </button>
                  <p className="help-text">
                    {selectedTeams.length > 0 ? selectedTeams.length : getFilteredTeams().length} teams × 
                    {selectedModules.length > 0 ? selectedModules.length : getAvailableModulesForLeague().length} modules = 
                    {(selectedTeams.length > 0 ? selectedTeams.length : getFilteredTeams().length) * 
                     (selectedModules.length > 0 ? selectedModules.length : getAvailableModulesForLeague().length)} operations
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Recent Jobs */}
          <div className="recent-jobs">
            <h3>Recent Bulk Jobs</h3>
            <div className="jobs-list">
              {recentJobs.length === 0 ? (
                <p>No recent jobs</p>
              ) : (
                recentJobs.map(job => (
                  <div key={job.jobId} className={`job-item ${job.status}`}>
                    <div className="job-header">
                      <span className="job-league">{job.filters.league}</span>
                      {job.filters.conference && <span className="job-conference">{job.filters.conference}</span>}
                      <span className={`job-status ${job.status}`}>{job.status}</span>
                    </div>
                    <div className="job-progress">
                      {job.status === 'running' && (
                        <div className="progress-bar">
                          <div 
                            className="progress-fill"
                            style={{ width: `${(job.progress.completed / job.progress.total) * 100}%` }}
                          />
                        </div>
                      )}
                      <span className="progress-text">
                        {job.progress.completed}/{job.progress.total} operations
                        {job.progress.failed > 0 && ` (${job.progress.failed} failed)`}
                      </span>
                    </div>
                    <div className="job-time">
                      {formatDate(job.createdAt)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Progress Modal */}
      {showProgressModal && jobStatus && (
        <div className="modal-backdrop" onClick={() => setShowProgressModal(false)}>
          <div className="progress-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Bulk Fetch Progress</h3>
              <button
                className="modal-close"
                onClick={() => setShowProgressModal(false)}
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body">
              <div className="progress-stats">
                <div className="stat">
                  <span className="stat-label">Status:</span>
                  <span className={`stat-value ${jobStatus.status}`}>{jobStatus.status}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Progress:</span>
                  <span className="stat-value">
                    {jobStatus.progress.completed} / {jobStatus.progress.total}
                  </span>
                </div>
                {jobStatus.progress.failed > 0 && (
                  <div className="stat">
                    <span className="stat-label">Failed:</span>
                    <span className="stat-value error">{jobStatus.progress.failed}</span>
                  </div>
                )}
              </div>

              {jobStatus.progress.currentTeam && jobStatus.status === 'processing' && (
                <div className="current-operation">
                  <div className="current-team-badge">
                    <RefreshCw size={16} className="spinning" />
                    <span>Processing: <strong>{jobStatus.progress.currentTeam}</strong></span>
                  </div>
                  {jobStatus.progress.currentModule && (
                    <div className="current-module">Module: {jobStatus.progress.currentModule}</div>
                  )}
                </div>
              )}

              <div className="progress-info">
                <span className="progress-label">
                  {jobStatus.status === 'completed' ? 'Completed' : 'Processing teams...'}
                </span>
                <span className="progress-percentage">
                  {Math.round((jobStatus.progress.completed / jobStatus.progress.total) * 100)}%
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-bar-fill"
                  style={{
                    width: `${(jobStatus.progress.completed / jobStatus.progress.total) * 100}%`
                  }}
                />
              </div>

              <div className="results-list">
                <h4>Results:</h4>
                <div className="results-scroll">
                  {jobStatus.results?.slice(-10).map((result, index) => (
                    <div key={index} className={`result-item ${result.status}`}>
                      <span className="result-team">{result.teamName}</span>
                      <span className="result-module">{result.module}</span>
                      {result.status === 'success' ? (
                        <span className="result-count">
                          <CheckCircle size={14} /> {result.count} items
                        </span>
                      ) : (
                        <span className="result-error">
                          <XCircle size={14} /> {result.error}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="modal-footer">
              {jobStatus.status === 'running' && (
                <button 
                  className="btn-danger"
                  onClick={handleCancelJob}
                >
                  Cancel Job
                </button>
              )}
              <button 
                className="btn-secondary"
                onClick={() => setShowProgressModal(false)}
              >
                {jobStatus.status === 'running' ? 'Hide' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <AlertCircle size={16} /> Error: {error}
        </div>
      )}

      {/* Data Display (for single fetch) */}
      {fetchMode === 'single' && fetchedData.length > 0 && (
        <>
          <div className="data-controls">
            <div className="data-info">
              <h3>
                {filteredData.length} of {fetchedData.length} {selectedModule?.includes('schedule') ? 'Games' : 'Players'}
                {fetchedData[0]?.source?.fetchedAt && (
                  <span className="fetch-time">
                    Last fetched: {formatDate(fetchedData[0].source.fetchedAt)}
                  </span>
                )}
              </h3>
            </div>
            
            <div className="data-filters">
              <div className="search-input-wrapper">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder={isScheduleModule ? "Search opponents, venues..." : "Search players..."}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="search-input"
                />
              </div>

              {positions.length > 0 && (
                <select
                  value={filterPosition}
                  onChange={(e) => setFilterPosition(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Positions</option>
                  {positions.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              )}

              {locations.length > 0 && (
                <select
                  value={filterPosition}
                  onChange={(e) => setFilterPosition(e.target.value)}
                  className="filter-select"
                >
                  <option value="">All Locations</option>
                  {locations.map(loc => (
                    <option key={loc} value={loc}>{loc}</option>
                  ))}
                </select>
              )}
              
              <div className="view-toggle">
                <button
                  className={`view-btn ${viewMode === 'cards' ? 'active' : ''}`}
                  onClick={() => setViewMode('cards')}
                >
                  <Grid3x3 size={16} />
                  Cards
                </button>
                <button
                  className={`view-btn ${viewMode === 'table' ? 'active' : ''}`}
                  onClick={() => setViewMode('table')}
                >
                  <List size={16} />
                  Table
                </button>
              </div>
            </div>
          </div>

          {/* Last Fetched Timestamp */}
          {filteredData.length > 0 && filteredData[0].source?.fetchedAt && (
            <div style={{
              background: '#f0f4ff',
              border: '1px solid #d0d9ff',
              borderRadius: '8px',
              padding: '0.75rem 1rem',
              marginTop: '1rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontSize: '0.9rem',
              color: '#4a5568'
            }}>
              <Clock size={16} style={{ color: '#667eea' }} />
              <span>
                Last updated: <strong>{new Date(filteredData[0].source.fetchedAt).toLocaleString()}</strong>
                {' '}({(() => {
                  const fetchTime = new Date(filteredData[0].source.fetchedAt);
                  const now = new Date();
                  const diffMs = now - fetchTime;
                  const diffMins = Math.floor(diffMs / 60000);
                  const diffHours = Math.floor(diffMins / 60);
                  const diffDays = Math.floor(diffHours / 24);

                  if (diffMins < 1) return 'just now';
                  if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
                  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
                  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
                })()})
              </span>
            </div>
          )}

          {/* API Endpoint Display */}
          {selectedTeam && selectedModule && (
            <ApiEndpointDisplay
              teamId={selectedTeam}
              type="team"
              sport={selectedModule.includes('football') ? 'football' :
                     selectedModule.includes('mensBasketball') ? 'mensBasketball' :
                     selectedModule.includes('womensBasketball') ? 'womensBasketball' : null}
              dataType={selectedModule.includes('roster') ? 'roster' :
                       selectedModule.includes('schedule') ? 'schedule' :
                       selectedModule.includes('stats') ? 'stats' : 'roster'}
            />
          )}

          {selectedModule === 'ncaa_football_stats' ? (
  <StatsGameDisplay data={filteredData} viewMode={viewMode} sport="football" />
) : selectedModule === 'ncaa_mensBasketball_stats' || selectedModule === 'ncaa_womensBasketball_stats' ? (
  <BasketballStatsGameDisplay data={filteredData} viewMode={viewMode} />
) : selectedModule === 'nba_boxscore' ? (
  <NBABoxscoreDisplay data={filteredData} viewMode={viewMode} />
) : selectedModule?.includes('schedule') ? (
  <ScheduleTable data={filteredData} sport={selectedModule.includes('football') ? 'football' : 'basketball'} moduleId={selectedModule} />
) : (
  <>
    {viewMode === 'cards' ? (
      <div className="player-cards-grid">
        {filteredData.map((item, index) => (
          <PlayerCard key={item._id || index} player={item.data} validation={item.validation} />
        ))}
      </div>
    ) : (
      <PlayerTable data={filteredData} moduleId={selectedModule} allRostersMode={allRostersMode} allRostersStats={allRostersStats} />
    )}
  </>
)}
        </>
      )}

      {/* History Modal */}
      <FetchHistory 
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
      />
    </div>
  );
}

// IMPROVED Player Card Component with Better Design
function PlayerCard({ player, validation }) {
  return (
    <div className="player-card-modern">
      {/* Validation Badge */}
      {validation && !validation.isValid && (
        <div className="validation-badge error" title={validation.errors.join(', ')}>
          <AlertCircle size={14} />
          Invalid
        </div>
      )}
      
      {/* Card Header with Jersey */}
      <div className="card-header-modern">
        <div className="jersey-circle">
          <span className="jersey-number">{player.jersey || player.jerseyNumber || '?'}</span>
        </div>
        <div className="player-name-section">
          <h3 className="player-name">{player.fullName || player.displayName || 'Unknown Player'}</h3>
          {player.abbreviatedName && player.abbreviatedName !== player.fullName && (
            <div className="abbreviated-name-display">
              ({player.abbreviatedName}) #{player.jersey || player.jerseyNumber || '?'}
            </div>
          )}
          {player.position && (
            <span className="position-badge">
              <MapPin size={12} />
              {player.position}
            </span>
          )}
        </div>
      </div>
      
      {/* Player Details Grid */}
      <div className="player-details-grid">
        {player.year && (
          <div className="detail-item-modern">
            <GraduationCap size={16} className="detail-icon" />
            <div className="detail-content">
              <span className="detail-label">Year</span>
              <span className="detail-value">{player.year}</span>
            </div>
          </div>
        )}
        
        {player.height && (
          <div className="detail-item-modern">
            <Ruler size={16} className="detail-icon" />
            <div className="detail-content">
              <span className="detail-label">Height</span>
              <span className="detail-value">{player.height}</span>
            </div>
          </div>
        )}
        
        {player.weight && (
          <div className="detail-item-modern">
            <Weight size={16} className="detail-icon" />
            <div className="detail-content">
              <span className="detail-label">Weight</span>
              <span className="detail-value">{player.weight} lbs</span>
            </div>
          </div>
        )}
        
        {player.hometown && (
          <div className="detail-item-modern">
            <Home size={16} className="detail-icon" />
            <div className="detail-content">
              <span className="detail-label">Hometown</span>
              <span className="detail-value">{player.hometown}</span>
            </div>
          </div>
        )}
        
        {player.highSchool && (
          <div className="detail-item-modern full-width">
            <School size={16} className="detail-icon" />
            <div className="detail-content">
              <span className="detail-label">High School</span>
              <span className="detail-value">{player.highSchool}</span>
            </div>
          </div>
        )}
        
        {player.birthDate && (
          <div className="detail-item-modern">
            <Calendar size={16} className="detail-icon" />
            <div className="detail-content">
              <span className="detail-label">Birth Date</span>
              <span className="detail-value">{player.birthDate}</span>
            </div>
          </div>
        )}
        
        {player.mlbDebutDate && (
          <div className="detail-item-modern">
            <Trophy size={16} className="detail-icon" />
            <div className="detail-content">
              <span className="detail-label">MLB Debut</span>
              <span className="detail-value">{player.mlbDebutDate}</span>
            </div>
          </div>
        )}
      </div>
      
      {/* Validation Status Footer */}
      {validation?.isValid && (
        <div className="card-footer-modern">
          <CheckCircle size={14} className="valid-icon" />
          <span>Valid Data</span>
        </div>
      )}
    </div>
  );
}

// Player Table Component with sorting and filtering
function PlayerTable({ data, moduleId, allRostersMode = false, allRostersStats = null }) {
  const [sortColumn, setSortColumn] = useState('fullName');
  const [sortDirection, setSortDirection] = useState('asc');
  const [filterText, setFilterText] = useState('');
  const [filterPosition, setFilterPosition] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTeam, setFilterTeam] = useState('');
  const [filterRosterType, setFilterRosterType] = useState('');

  if (data.length === 0) return null;

  // Detect MLB based on moduleId or allRostersMode
  const isMLB = moduleId?.includes('mlb') || allRostersMode;

  // Get unique positions and statuses for filter dropdowns
  const positions = [...new Set(data.map(item => item.data?.position).filter(Boolean))].sort();
  const statuses = isMLB ? [...new Set(data.map(item => item.data?.statusDescription || item.data?.status).filter(Boolean))].sort() : [];

  // Get unique teams and roster types for all rosters mode
  const teams = allRostersMode ? [...new Set(data.flatMap(item => item.data?.teamNames || [item.data?.teamName]).filter(Boolean))].sort() : [];
  const rosterTypes = allRostersMode ? [...new Set(data.flatMap(item => item.data?.rosterTypes || [item.data?.rosterType]).filter(Boolean))].sort() : [];

  // Filter data
  const filteredData = data.filter(item => {
    const player = item.data;
    const searchLower = filterText.toLowerCase();

    // Text search - match name, jersey, position, team name
    const matchesSearch = !filterText ||
      (player.fullName || '').toLowerCase().includes(searchLower) ||
      (player.displayName || '').toLowerCase().includes(searchLower) ||
      String(player.jersey || player.jerseyNumber || '').includes(searchLower) ||
      (player.position || '').toLowerCase().includes(searchLower) ||
      (player.ebisId || '').toString().includes(searchLower) ||
      (player.personId || '').toString().includes(searchLower) ||
      (player.teamName || '').toLowerCase().includes(searchLower) ||
      (player.teamsDisplay || '').toLowerCase().includes(searchLower);

    // Position filter
    const matchesPosition = !filterPosition || player.position === filterPosition;

    // Status filter (MLB only)
    const matchesStatus = !filterStatus ||
      player.statusDescription === filterStatus ||
      player.status === filterStatus;

    // Team filter (all rosters mode)
    const matchesTeam = !filterTeam ||
      (player.teamNames || []).includes(filterTeam) ||
      player.teamName === filterTeam;

    // Roster type filter (all rosters mode)
    const matchesRosterType = !filterRosterType ||
      (player.rosterTypes || []).includes(filterRosterType) ||
      player.rosterType === filterRosterType;

    return matchesSearch && matchesPosition && matchesStatus && matchesTeam && matchesRosterType;
  });

  // Sort data
  const sortedData = [...filteredData].sort((a, b) => {
    const playerA = a.data;
    const playerB = b.data;

    let valA, valB;

    switch (sortColumn) {
      case 'jersey':
        valA = parseInt(playerA.jersey || playerA.jerseyNumber) || 999;
        valB = parseInt(playerB.jersey || playerB.jerseyNumber) || 999;
        break;
      case 'fullName':
        valA = (playerA.fullName || playerA.displayName || '').toLowerCase();
        valB = (playerB.fullName || playerB.displayName || '').toLowerCase();
        break;
      case 'position':
        valA = (playerA.position || '').toLowerCase();
        valB = (playerB.position || '').toLowerCase();
        break;
      case 'status':
        valA = (playerA.statusDescription || playerA.status || '').toLowerCase();
        valB = (playerB.statusDescription || playerB.status || '').toLowerCase();
        break;
      case 'year':
        valA = playerA.year || '';
        valB = playerB.year || '';
        break;
      case 'ebisId':
        valA = parseInt(playerA.ebisId) || 0;
        valB = parseInt(playerB.ebisId) || 0;
        break;
      case 'mlbId':
        valA = parseInt(playerA.personId || playerA.mlbamId) || 0;
        valB = parseInt(playerB.personId || playerB.mlbamId) || 0;
        break;
      default:
        valA = playerA[sortColumn] || '';
        valB = playerB[sortColumn] || '';
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  // Handle header click for sorting
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  // Sortable header component
  const SortableHeader = ({ column, children }) => (
    <th
      onClick={() => handleSort(column)}
      style={{ cursor: 'pointer', userSelect: 'none' }}
      title={`Sort by ${children}`}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {children}
        {sortColumn === column && (
          <span style={{ fontSize: '0.8em' }}>
            {sortDirection === 'asc' ? '▲' : '▼'}
          </span>
        )}
      </div>
    </th>
  );

  return (
    <div className="table-container">
      {/* Filter controls */}
      <div style={{
        display: 'flex',
        gap: '1rem',
        marginBottom: '1rem',
        padding: '0.75rem',
        backgroundColor: '#f8f9fa',
        borderRadius: '8px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Search size={16} style={{ color: '#6c757d' }} />
          <input
            type="text"
            placeholder="Search by name, number, ID..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '0.9rem',
              width: '220px'
            }}
          />
        </div>

        <select
          value={filterPosition}
          onChange={(e) => setFilterPosition(e.target.value)}
          style={{
            padding: '0.5rem 0.75rem',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '0.9rem'
          }}
        >
          <option value="">All Positions</option>
          {positions.map(pos => (
            <option key={pos} value={pos}>{pos}</option>
          ))}
        </select>

        {isMLB && statuses.length > 0 && (
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '0.9rem'
            }}
          >
            <option value="">All Statuses</option>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        )}

        {/* Team filter for all rosters mode */}
        {allRostersMode && teams.length > 0 && (
          <select
            value={filterTeam}
            onChange={(e) => setFilterTeam(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #1976d2',
              borderRadius: '4px',
              fontSize: '0.9rem',
              backgroundColor: filterTeam ? '#e3f2fd' : 'white'
            }}
          >
            <option value="">All Teams</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        )}

        {/* Roster type filter for all rosters mode */}
        {allRostersMode && rosterTypes.length > 0 && (
          <select
            value={filterRosterType}
            onChange={(e) => setFilterRosterType(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              border: '1px solid #4caf50',
              borderRadius: '4px',
              fontSize: '0.9rem',
              backgroundColor: filterRosterType ? '#e8f5e9' : 'white'
            }}
          >
            <option value="">All Roster Types</option>
            {rosterTypes.map(rt => (
              <option key={rt} value={rt}>{rt}</option>
            ))}
          </select>
        )}

        <span style={{ color: '#6c757d', fontSize: '0.9rem', marginLeft: 'auto' }}>
          Showing {sortedData.length} of {data.length} {allRostersMode ? 'unique players' : 'players'}
          {allRostersStats && ` (${allRostersStats.total} total records)`}
        </span>

        {(filterText || filterPosition || filterStatus || filterTeam || filterRosterType) && (
          <button
            onClick={() => {
              setFilterText('');
              setFilterPosition('');
              setFilterStatus('');
              setFilterTeam('');
              setFilterRosterType('');
            }}
            style={{
              padding: '0.375rem 0.75rem',
              fontSize: '0.85rem',
              backgroundColor: '#fff',
              border: '1px solid #dc3545',
              borderRadius: '4px',
              color: '#dc3545',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}
          >
            <X size={14} />
            Clear Filters
          </button>
        )}
      </div>

      <table className="player-table">
        <thead>
          <tr>
            <SortableHeader column="jersey">Jersey</SortableHeader>
            <SortableHeader column="fullName">Name</SortableHeader>
            <SortableHeader column="position">Position</SortableHeader>
            {isMLB ? (
              <>
                {allRostersMode && <th>Team(s)</th>}
                {allRostersMode && <th>Roster Type(s)</th>}
                <th>Bats/Throws</th>
                <th>Height/Weight</th>
                {!allRostersMode && <th>Birth Date</th>}
                {!allRostersMode && <th>Birthplace</th>}
                {!allRostersMode && <th>MLB Debut</th>}
                <SortableHeader column="status">Status</SortableHeader>
                <SortableHeader column="ebisId">EBIS ID</SortableHeader>
                <SortableHeader column="mlbId">MLB ID</SortableHeader>
              </>
            ) : (
              <>
                <SortableHeader column="year">Year</SortableHeader>
                <th>Height</th>
                <th>Weight</th>
                <th>Hometown</th>
                <th>High School</th>
              </>
            )}
            <th>Valid</th>
          </tr>
        </thead>
        <tbody>
          {sortedData.map((item, index) => {
            const player = item.data;
            return (
              <tr key={item._id || index}>
                <td className="jersey-cell">
                  {player.jersey || player.jerseyNumber || '-'}
                </td>
                <td className="name-cell">
                  <strong>{player.fullName || player.displayName}</strong>
                  {player.abbreviatedName && player.abbreviatedName !== player.fullName && (
                    <div style={{fontSize: '0.85em', color: '#666'}}>
                      ({player.abbreviatedName})
                    </div>
                  )}
                </td>
                <td>{player.position || '-'}</td>
                {isMLB ? (
                  <>
                    {allRostersMode && (
                      <td style={{ fontSize: '0.85em', maxWidth: '150px' }}>
                        {player.teamsDisplay || player.teamName || '-'}
                      </td>
                    )}
                    {allRostersMode && (
                      <td style={{ fontSize: '0.85em' }}>
                        {player.rosterTypesDisplay || player.rosterType || '-'}
                      </td>
                    )}
                    <td>
                      {player.batSide || '-'}/{player.pitchHand || '-'}
                    </td>
                    <td>
                      {player.height || '-'} / {player.weight ? `${player.weight} lbs` : '-'}
                    </td>
                    {!allRostersMode && <td>{player.birthDate || '-'}</td>}
                    {!allRostersMode && (
                      <td>
                        {player.birthCity || player.birthStateProvince || player.birthCountry ? (
                          <span title={`${player.birthCity || ''}, ${player.birthStateProvince || ''} ${player.birthCountry || ''}`}>
                            {player.birthCity || ''}{player.birthStateProvince ? `, ${player.birthStateProvince}` : ''}
                          </span>
                        ) : '-'}
                      </td>
                    )}
                    {!allRostersMode && <td>{player.mlbDebutDate || '-'}</td>}
                    <td>
                      {player.is40Man ? (
                        <span className="status-badge active" title="40-Man Roster">40M</span>
                      ) : player.statusDescription ? (
                        <span className="status-badge" title={player.statusDescription}>{player.status || '-'}</span>
                      ) : '-'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                      {player.ebisId || '-'}
                    </td>
                    <td style={{ fontFamily: 'monospace', fontSize: '0.85em' }}>
                      {player.personId || player.mlbamId || '-'}
                    </td>
                  </>
                ) : (
                  <>
                    <td>{player.year || '-'}</td>
                    <td>{player.height || '-'}</td>
                    <td>{player.weight ? `${player.weight} lbs` : '-'}</td>
                    <td>{player.hometown || '-'}</td>
                    <td>{player.highSchool || '-'}</td>
                  </>
                )}
                <td>
                  {item.validation?.isValid ? (
                    <span className="valid-indicator">
                      <CheckCircle size={16} className="status-icon-success" />
                    </span>
                  ) : (
                    <span className="invalid-indicator" title={item.validation?.errors.join(', ')}>
                      <AlertCircle size={16} className="status-icon-error" />
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Stats Game View Component for FetchDashboard
function StatsGameDisplay({ data, viewMode }) {
  const [expandedGames, setExpandedGames] = useState(new Set());
  const [selectedCategory, setSelectedCategory] = useState({});

  const toggleGame = (gameId) => {
    const newExpanded = new Set(expandedGames);
    if (newExpanded.has(gameId)) {
      newExpanded.delete(gameId);
    } else {
      newExpanded.add(gameId);
    }
    setExpandedGames(newExpanded);
  };

  const setCategory = (gameId, category) => {
    setSelectedCategory({ ...selectedCategory, [gameId]: category });
  };

  const categories = [
    { key: 'passing', label: 'Passing', icon: Activity },
    { key: 'rushing', label: 'Rushing', icon: TrendingUp },
    { key: 'receiving', label: 'Receiving', icon: Users },
    { key: 'kicking', label: 'Kicking', icon: Target },
    { key: 'punting', label: 'Punting', icon: Zap },
    { key: 'returns', label: 'Returns', icon: RotateCcw },
    { key: 'defense', label: 'Defense', icon: Shield },
    { key: 'misc', label: 'Misc', icon: MoreHorizontal }
  ];

  if (viewMode === 'table') {
    // Table view - show all games in a summary table
    return (
      <div className="stats-table-view">
        <table className="stats-summary-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Matchup</th>
              <th>Score</th>
              <th>Result</th>
              <th>Location</th>
              <th>Attendance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const game = item.data;
              const teamWon = game.teamInfo.thisTeamIsHomeTeam ? 
                (game.teamInfo.homeScore > game.teamInfo.visitorScore) :
                (game.teamInfo.visitorScore > game.teamInfo.homeScore);
              const isExpanded = expandedGames.has(game.gameId);

              return (
                <React.Fragment key={game.gameId}>
                  <tr 
                    className="stats-table-row clickable"
                    onClick={() => toggleGame(game.gameId)}
                  >
                    <td>
                      <Calendar size={14} className="inline-icon" />
                      {game.gameInfo.date}
                    </td>
                    <td className="matchup-cell">
                      <strong>{game.teamInfo.homeName}</strong> vs <strong>{game.teamInfo.visitorName}</strong>
                    </td>
                    <td className="score-cell">
                      <span className={game.teamInfo.homeScore > game.teamInfo.visitorScore ? 'winner-score' : ''}>
                        {game.teamInfo.homeScore}
                      </span>
                      {' - '}
                      <span className={game.teamInfo.visitorScore > game.teamInfo.homeScore ? 'winner-score' : ''}>
                        {game.teamInfo.visitorScore}
                      </span>
                    </td>
                    <td>
                      <span className={`result-badge-small ${teamWon ? 'win' : 'loss'}`}>
                        {teamWon ? 'W' : 'L'}
                      </span>
                    </td>
                    <td>
                      <MapPin size={14} className="inline-icon" />
                      {game.gameInfo.location}
                    </td>
                    <td>
                      {game.gameInfo.attendance ? (
                        <>
                          <Users size={14} className="inline-icon" />
                          {game.gameInfo.attendance.toLocaleString()}
                        </>
                      ) : '-'}
                    </td>
                    <td>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="expanded-stats-row">
                      <td colSpan="7">
                        <GameStatsExpanded 
                          game={game} 
                          selectedCategory={selectedCategory}
                          setCategory={setCategory}
                          categories={categories}
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
    );
  }

  // Card view (default)
  return (
    <div className="stats-games-container">
      <h3 className="stats-section-title">Game Statistics ({data.length} games)</h3>
      {data.map((item) => {
        const game = item.data;
        const isExpanded = expandedGames.has(game.gameId);
        const activeCategory = selectedCategory[game.gameId] || 'passing';
        
        const teamWon = game.teamInfo.thisTeamIsHomeTeam ? 
          (game.teamInfo.homeScore > game.teamInfo.visitorScore) :
          (game.teamInfo.visitorScore > game.teamInfo.homeScore);

        return (
          <div key={game.gameId} className="stats-game-card">
            <div className="stats-game-header" onClick={() => toggleGame(game.gameId)}>
              <div className="game-matchup">
                <div className="team-score home">
                  <span className="team-name">{game.teamInfo.homeName}</span>
                  <span className={`score ${game.teamInfo.homeScore > game.teamInfo.visitorScore ? 'winner' : ''}`}>
                    {game.teamInfo.homeScore}
                  </span>
                </div>
                <div className="vs">vs</div>
                <div className="team-score away">
                  <span className={`score ${game.teamInfo.visitorScore > game.teamInfo.homeScore ? 'winner' : ''}`}>
                    {game.teamInfo.visitorScore}
                  </span>
                  <span className="team-name">{game.teamInfo.visitorName}</span>
                </div>
              </div>

              <div className="game-info">
                <span className="game-date">
                  <Calendar size={14} />
                  {game.gameInfo.date}
                </span>
                <span className="game-location">
                  <MapPin size={14} />
                  {game.gameInfo.location}
                </span>
                {game.gameInfo.attendance && (
                  <span className="attendance">
                    <Users size={14} />
                    {game.gameInfo.attendance.toLocaleString()}
                  </span>
                )}
                <span className={`result-badge ${teamWon ? 'win' : 'loss'}`}>
                  {teamWon ? 'W' : 'L'}
                </span>
              </div>

              <ChevronDown className={`expand-icon ${isExpanded ? 'expanded' : ''}`} size={20} />
            </div>

            {isExpanded && (
              <GameStatsExpanded 
                game={game} 
                selectedCategory={selectedCategory}
                setCategory={setCategory}
                categories={categories}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Extracted expanded game stats component
function GameStatsExpanded({ game, selectedCategory, setCategory, categories }) {
  const activeCategory = selectedCategory[game.gameId] || 'passing';

  return (
    <div className="stats-game-body">
      {/* Line Scores */}
      {game.teamInfo?.lineScores?.home?.length > 0 && (
        <div className="line-scores">
          <table className="line-score-table">
            <thead>
              <tr>
                <th>Team</th>
                {game.teamInfo.lineScores.home.map((_, idx) => (
                  <th key={idx}>{idx + 1}</th>
                ))}
                <th>Final</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{game.teamInfo.homeName}</td>
                {game.teamInfo.lineScores.home.map((score, idx) => (
                  <td key={idx}>{score}</td>
                ))}
                <td><strong>{game.teamInfo.homeScore}</strong></td>
              </tr>
              <tr>
                <td>{game.teamInfo.visitorName}</td>
                {game.teamInfo.lineScores.visitor.map((score, idx) => (
                  <td key={idx}>{score}</td>
                ))}
                <td><strong>{game.teamInfo.visitorScore}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Category Tabs */}
      <div className="stat-categories">
        {categories.map(cat => {
          const IconComponent = cat.icon;
          const hasPlayers = cat.key === 'returns' ?
  game.players.some(p => p.puntReturns || p.kickoffReturns || p.interceptionReturns) :
  cat.key === 'misc' ?
    game.players.some(p => p.fumbles || p.scoring) :
    game.players.some(p => p[cat.key]);
          
          if (!hasPlayers) return null;

          const count = cat.key === 'returns' ?
  game.players.filter(p => p.puntReturns || p.kickoffReturns || p.interceptionReturns).length :
  cat.key === 'misc' ?
    game.players.filter(p => p.fumbles || p.scoring).length :
    game.players.filter(p => p[cat.key]).length;

          return (
            <button
              key={cat.key}
              className={`stat-category-btn ${activeCategory === cat.key ? 'active' : ''}`}
              onClick={() => setCategory(game.gameId, cat.key)}
            >
              <IconComponent size={16} />
              {cat.label}
              <span className="player-count">({count})</span>
            </button>
          );
        })}
      </div>

      {/* Player Stats */}
      <div className="player-stats-container">
        {activeCategory === 'passing' && <PassingStatsTable players={game.players.filter(p => p.passing)} />}
        {activeCategory === 'rushing' && <RushingStatsTable players={game.players.filter(p => p.rushing)} />}
        {activeCategory === 'receiving' && <ReceivingStatsTable players={game.players.filter(p => p.receiving)} />}
        {activeCategory === 'kicking' && <KickingStatsTable players={game.players.filter(p => p.kicking)} />}
        {activeCategory === 'punting' && <PuntingStatsTable players={game.players.filter(p => p.punting)} />}
        {activeCategory === 'returns' && (
          <ReturnsStatsTable players={game.players.filter(p => 
            p.puntReturns || p.kickoffReturns || p.interceptionReturns
          )
        } />
        )}
        {activeCategory === 'defense' && <DefenseStatsTable players={game.players.filter(p => p.defense)} />}     {/* NEW */}
        {activeCategory === 'misc' && <MiscStatsTable players={game.players.filter(p => p.fumbles || p.scoring)} />}  {/* NEW */}
      </div>
    </div>
  );
}

// Stat Table Components
function PassingStatsTable({ players }) {
  if (players.length === 0) return <div className="no-stats">No passing stats</div>;
  return (
    <table className="player-stats-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>CMP</th>
          <th>ATT</th>
          <th>YDS</th>
          <th>TD</th>
          <th>INT</th>
          <th>LNG</th>
          <th>SCK</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => (
          <tr key={i}>
            <td className="player-name">
              <strong>{p.fullName}</strong>
              <span className="jersey">#{p.jersey}</span>
            </td>
            <td>{p.passing.completions}</td>
            <td>{p.passing.attempts}</td>
            <td>{p.passing.yards}</td>
            <td>{p.passing.tds}</td>
            <td>{p.passing.ints}</td>
            <td>{p.passing.long}</td>
            <td>{p.passing.sacks}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RushingStatsTable({ players }) {
  if (players.length === 0) return <div className="no-stats">No rushing stats</div>;
  return (
    <table className="player-stats-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>ATT</th>
          <th>YDS</th>
          <th>AVG</th>
          <th>TD</th>
          <th>LNG</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => {
          const avg = p.rushing.attempts > 0 ? (p.rushing.yards / p.rushing.attempts).toFixed(1) : '0.0';
          return (
            <tr key={i}>
              <td className="player-name">
                <strong>{p.fullName}</strong>
                <span className="jersey">#{p.jersey}</span>
              </td>
              <td>{p.rushing.attempts}</td>
              <td>{p.rushing.yards}</td>
              <td>{avg}</td>
              <td>{p.rushing.tds}</td>
              <td>{p.rushing.long}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function ReceivingStatsTable({ players }) {
  if (players.length === 0) return <div className="no-stats">No receiving stats</div>;
  return (
    <table className="player-stats-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>REC</th>
          <th>YDS</th>
          <th>AVG</th>
          <th>TD</th>
          <th>LNG</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => {
          const avg = p.receiving.receptions > 0 ? (p.receiving.yards / p.receiving.receptions).toFixed(1) : '0.0';
          return (
            <tr key={i}>
              <td className="player-name">
                <strong>{p.fullName}</strong>
                <span className="jersey">#{p.jersey}</span>
              </td>
              <td>{p.receiving.receptions}</td>
              <td>{p.receiving.yards}</td>
              <td>{avg}</td>
              <td>{p.receiving.tds}</td>
              <td>{p.receiving.long}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function KickingStatsTable({ players }) {
  if (players.length === 0) return <div className="no-stats">No kicking stats</div>;
  
  // Separate players with field goal/XP stats from those with only kickoff stats
  const playersWithFG = players.filter(p => 
    p.kicking.fgMade > 0 || p.kicking.fgAttempts > 0 || 
    p.kicking.xpMade > 0 || p.kicking.xpAttempts > 0
  );
  
  const playersWithKickoffs = players.filter(p => 
    p.kicking.kickoffs > 0 || p.kicking.kickoffYards > 0
  );
  
  return (
    <div className="kicking-container">
      {/* Field Goals & Extra Points Section */}
      {playersWithFG.length > 0 && (
        <div className="kicking-section">
          <h4>Field Goals & Extra Points</h4>
          <table className="player-stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th title="Field Goals Made">FG</th>
                <th title="Field Goal Attempts">FGA</th>
                <th title="Field Goal Percentage">PCT</th>
                <th title="Longest Field Goal">LNG</th>
                <th title="Extra Points Made">XP</th>
                <th title="Extra Point Attempts">XPA</th>
              </tr>
            </thead>
            <tbody>
              {playersWithFG.map((p, i) => {
                const pct = p.kicking.fgAttempts > 0 ? ((p.kicking.fgMade / p.kicking.fgAttempts) * 100).toFixed(0) : '0';
                return (
                  <tr key={i}>
                    <td className="player-name">
                      <strong>{p.fullName}</strong>
                      <span className="jersey">#{p.jersey}</span>
                    </td>
                    <td>{p.kicking.fgMade}</td>
                    <td>{p.kicking.fgAttempts}</td>
                    <td>{pct}%</td>
                    <td>{p.kicking.fgLong}</td>
                    <td>{p.scoring.patKicksMade}</td>
                    <td>{p.scoring.patKicksAtt}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Kickoffs Section */}
      {playersWithKickoffs.length > 0 && (
        <div className="kicking-section">
          <h4>Kickoffs</h4>
          <table className="player-stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th title="Number of Kickoffs">NO</th>
                <th title="Kickoff Yards">YDS</th>
                <th title="Average Yards per Kickoff">AVG</th>
                <th title="Touchbacks">TB</th>
                <th title="Out of Bounds">OB</th>
              </tr>
            </thead>
            <tbody>
              {playersWithKickoffs.map((p, i) => {
                const avg = p.kicking.kickoffs > 0 ? (p.kicking.kickoffYards / p.kicking.kickoffs).toFixed(1) : '0.0';
                return (
                  <tr key={i}>
                    <td className="player-name">
                      <strong>{p.fullName}</strong>
                      <span className="jersey">#{p.jersey}</span>
                    </td>
                    <td>{p.kicking.kickoffs}</td>
                    <td>{p.kicking.kickoffYards}</td>
                    <td>{avg}</td>
                    <td>{p.kicking.kickoffTouchbacks || 0}</td>
                    <td>{p.kicking.kickoffOutOfBounds || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PuntingStatsTable({ players }) {
  if (players.length === 0) return <div className="no-stats">No punting stats</div>;
  return (
    <table className="player-stats-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>PUNTS</th>
          <th>YDS</th>
          <th>AVG</th>
          <th>LNG</th>
          <th>IN20</th>
          <th>TB</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => (
          <tr key={i}>
            <td className="player-name">
              <strong>{p.fullName}</strong>
              <span className="jersey">#{p.jersey}</span>
            </td>
            <td>{p.punting.punts}</td>
            <td>{p.punting.yards}</td>
            <td>{p.punting.average.toFixed(1)}</td>
            <td>{p.punting.long}</td>
            <td>{p.punting.inside20}</td>
            <td>{p.punting.touchbacks}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReturnsStatsTable({ players }) {
  if (players.length === 0) return <div className="no-stats">No return stats</div>;
  
  // Filter players for each type of return
  // A player should appear if they have the stat object AND have more than 0 returns
  const puntReturners = players.filter(p => 
    p.puntReturns && 
    (p.puntReturns.returns > 0 || p.puntReturns.yards > 0)
  );
  
  const kickoffReturners = players.filter(p => 
    p.kickoffReturns && 
    (p.kickoffReturns.returns > 0 || p.kickoffReturns.yards > 0)
  );
  
  const intReturners = players.filter(p => 
    p.interceptionReturns && 
    (p.interceptionReturns.returns > 0 || p.interceptionReturns.yards > 0)
  );

  // If no one has any actual return stats, show no stats message
  if (puntReturners.length === 0 && kickoffReturners.length === 0 && intReturners.length === 0) {
    return <div className="no-stats">No return stats</div>;
  }

  return (
    <div className="returns-container">
      {puntReturners.length > 0 && (
        <div className="return-section">
          <h4>Punt Returns</h4>
          <table className="player-stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>RET</th>
                <th>YDS</th>
                <th>AVG</th>
                <th>TD</th>
                <th>LNG</th>
              </tr>
            </thead>
            <tbody>
              {puntReturners.map((p, i) => (
                <tr key={i}>
                  <td className="player-name">
                    <strong>{p.fullName}</strong>
                    <span className="jersey">#{p.jersey}</span>
                  </td>
                  <td>{p.puntReturns.returns}</td>
                  <td>{p.puntReturns.yards}</td>
                  <td>{p.puntReturns.average > 0 ? p.puntReturns.average.toFixed(1) : '0.0'}</td>
                  <td>{p.puntReturns.tds}</td>
                  <td>{p.puntReturns.long}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {kickoffReturners.length > 0 && (
        <div className="return-section">
          <h4>Kickoff Returns</h4>
          <table className="player-stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>RET</th>
                <th>YDS</th>
                <th>AVG</th>
                <th>TD</th>
                <th>LNG</th>
              </tr>
            </thead>
            <tbody>
              {kickoffReturners.map((p, i) => (
                <tr key={i}>
                  <td className="player-name">
                    <strong>{p.fullName}</strong>
                    <span className="jersey">#{p.jersey}</span>
                  </td>
                  <td>{p.kickoffReturns.returns}</td>
                  <td>{p.kickoffReturns.yards}</td>
                  <td>{p.kickoffReturns.average > 0 ? p.kickoffReturns.average.toFixed(1) : '0.0'}</td>
                  <td>{p.kickoffReturns.tds}</td>
                  <td>{p.kickoffReturns.long}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {intReturners.length > 0 && (
        <div className="return-section">
          <h4>Interception Returns</h4>
          <table className="player-stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>INT</th>
                <th>YDS</th>
                <th>TD</th>
                <th>LNG</th>
              </tr>
            </thead>
            <tbody>
              {intReturners.map((p, i) => (
                <tr key={i}>
                  <td className="player-name">
                    <strong>{p.fullName}</strong>
                    <span className="jersey">#{p.jersey}</span>
                  </td>
                  <td>{p.interceptionReturns.returns}</td>
                  <td>{p.interceptionReturns.yards}</td>
                  <td>{p.interceptionReturns.tds}</td>
                  <td>{p.interceptionReturns.long}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Defense Stats Table Component
function DefenseStatsTable({ players }) {
  if (players.length === 0) return <div className="no-stats">No defensive stats</div>;
  
  return (
    <table className="player-stats-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>TOT</th>
          <th>SOLO</th>
          <th>AST</th>
          <th>TFL</th>
          <th>SACKS</th>
          <th>INT</th>
          <th>PBU</th>
          <th>FF</th>
          <th>FR</th>
          <th>QBH</th>
          <th>BLK</th>
        </tr>
      </thead>
      <tbody>
        {players.map((p, i) => (
          <tr key={i}>
            <td className="player-name">
              <strong>{p.fullName}</strong>
              <span className="jersey">#{p.jersey}</span>
            </td>
            <td>{p.defense.tacklesTotal}</td>
            <td>{p.defense.tacklesUnassisted}</td>
            <td>{p.defense.tacklesAssisted}</td>
            <td>{p.defense.tacklesForLossTotal > 0 ? p.defense.tacklesForLossTotal.toFixed(1) : '0'}</td>
            <td>{p.defense.sacks > 0 ? p.defense.sacks.toFixed(1) : '0'}</td>
            <td>{p.defense.interceptions}</td>
            <td>{p.defense.passBreakups}</td>
            <td>{p.defense.fumblesForced}</td>
            <td>{p.defense.fumblesRecovered}</td>
            <td>{p.defense.qbHurries}</td>
            <td>{p.defense.blockedKicks}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Misc Stats Table Component (Fumbles & Scoring)
function MiscStatsTable({ players }) {
  if (players.length === 0) return <div className="no-stats">No miscellaneous stats</div>;
  
  const playersWithFumbles = players.filter(p => p.fumbles);
  const playersWithScoring = players.filter(p => p.scoring);
  
  if (playersWithFumbles.length === 0 && playersWithScoring.length === 0) {
    return <div className="no-stats">No miscellaneous stats</div>;
  }
  
  return (
    <div className="misc-container">
      {playersWithFumbles.length > 0 && (
        <div className="misc-section">
          <h4>Fumbles</h4>
          <table className="player-stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th title="Fumbles">FUM</th>
                <th title="Fumbles Lost">LOST</th>
              </tr>
            </thead>
            <tbody>
              {playersWithFumbles.map((p, i) => (
                <tr key={i}>
                  <td className="player-name">
                    <strong>{p.fullName}</strong>
                    <span className="jersey">#{p.jersey}</span>
                  </td>
                  <td>{p.fumbles.fumbles}</td>
                  <td>{p.fumbles.fumblesLost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {playersWithScoring.length > 0 && (
        <div className="misc-section">
          <h4>Scoring Summary</h4>
          <table className="player-stats-table">
            <thead>
              <tr>
                <th>Player</th>
                <th title="Touchdowns">TD</th>
                <th title="Field Goals">FG</th>
                <th title="Safeties">SAF</th>
                <th title="PAT Kicks Made/Attempted">PAT (KICK)</th>
                <th title="PAT Rushes Made/Attempted">PAT (RUSH)</th>
                <th title="PAT Receptions">PAT (REC)</th>
                <th title="PAT Passes Made/Attempted">PAT (PASS)</th>
              </tr>
            </thead>
            <tbody>
              {playersWithScoring.map((p, i) => (
                <tr key={i}>
                  <td className="player-name">
                    <strong>{p.fullName}</strong>
                    <span className="jersey">#{p.jersey}</span>
                  </td>
                  <td>{p.scoring.touchdowns}</td>
                  <td>{p.scoring.fieldGoals}</td>
                  <td>{p.scoring.safeties}</td>
                  <td>
                    {p.scoring.patKicksMade > 0 || p.scoring.patKicksAtt > 0
                      ? `${p.scoring.patKicksMade}/${p.scoring.patKicksAtt}`
                      : '-'}
                  </td>
                  <td>
                    {p.scoring.patRushesMade > 0 || p.scoring.patRushesAtt > 0
                      ? `${p.scoring.patRushesMade}/${p.scoring.patRushesAtt}`
                      : '-'}
                  </td>
                  <td>
                    {p.scoring.patReceptions > 0
                      ? p.scoring.patReceptions
                      : '-'}
                  </td>
                  <td>
                    {p.scoring.patPassesMade > 0 || p.scoring.patPassesAtt > 0
                      ? `${p.scoring.patPassesMade}/${p.scoring.patPassesAtt}`
                      : '-'}
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

// Basketball Stats Game Display Component
function BasketballStatsGameDisplay({ data, viewMode }) {
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

  if (viewMode === 'table') {
    // Table view - show all games in a summary table
    return (
      <div className="stats-table-view">
        <table className="stats-summary-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Matchup</th>
              <th>Score</th>
              <th>Result</th>
              <th>Location</th>
              <th>Attendance</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {data.map((item) => {
              const game = item.data;
              const teamWon = game.teamInfo.thisTeamIsHomeTeam ?
                (game.teamInfo.homeScore > game.teamInfo.visitorScore) :
                (game.teamInfo.visitorScore > game.teamInfo.homeScore);
              const isExpanded = expandedGames.has(game.gameId);

              return (
                <React.Fragment key={game.gameId}>
                  <tr
                    className="stats-table-row clickable"
                    onClick={() => toggleGame(game.gameId)}
                  >
                    <td>
                      <Calendar size={14} className="inline-icon" />
                      {game.gameInfo.date}
                    </td>
                    <td className="matchup-cell">
                      <strong>{game.teamInfo.homeName}</strong> vs <strong>{game.teamInfo.visitorName}</strong>
                    </td>
                    <td className="score-cell">
                      <span className={game.teamInfo.homeScore > game.teamInfo.visitorScore ? 'winner-score' : ''}>
                        {game.teamInfo.homeScore}
                      </span>
                      {' - '}
                      <span className={game.teamInfo.visitorScore > game.teamInfo.homeScore ? 'winner-score' : ''}>
                        {game.teamInfo.visitorScore}
                      </span>
                    </td>
                    <td>
                      <span className={`result-badge-small ${teamWon ? 'win' : 'loss'}`}>
                        {teamWon ? 'W' : 'L'}
                      </span>
                    </td>
                    <td>
                      <MapPin size={14} className="inline-icon" />
                      {game.gameInfo.location}
                    </td>
                    <td>
                      {game.gameInfo.attendance ? (
                        <>
                          <Users size={14} className="inline-icon" />
                          {game.gameInfo.attendance.toLocaleString()}
                        </>
                      ) : '-'}
                    </td>
                    <td>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="expanded-stats-row">
                      <td colSpan="7">
                        <BasketballGameStatsExpanded game={game} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Card view (default)
  return (
    <div className="stats-games-container">
      <h3 className="stats-section-title">Game Statistics ({data.length} games)</h3>
      {data.map((item) => {
        const game = item.data;
        const isExpanded = expandedGames.has(game.gameId);

        const teamWon = game.teamInfo.thisTeamIsHomeTeam ?
          (game.teamInfo.homeScore > game.teamInfo.visitorScore) :
          (game.teamInfo.visitorScore > game.teamInfo.homeScore);

        return (
          <div key={game.gameId} className="stats-game-card">
            <div className="stats-game-header" onClick={() => toggleGame(game.gameId)}>
              <div className="game-matchup">
                <div className="team-score home">
                  <span className="team-name">{game.teamInfo.homeName}</span>
                  <span className={`score ${game.teamInfo.homeScore > game.teamInfo.visitorScore ? 'winner' : ''}`}>
                    {game.teamInfo.homeScore}
                  </span>
                </div>
                <div className="vs">vs</div>
                <div className="team-score away">
                  <span className={`score ${game.teamInfo.visitorScore > game.teamInfo.homeScore ? 'winner' : ''}`}>
                    {game.teamInfo.visitorScore}
                  </span>
                  <span className="team-name">{game.teamInfo.visitorName}</span>
                </div>
              </div>

              <div className="game-info">
                <span className="game-date">
                  <Calendar size={14} />
                  {game.gameInfo.date}
                </span>
                <span className="game-location">
                  <MapPin size={14} />
                  {game.gameInfo.location}
                </span>
                {game.gameInfo.attendance && (
                  <span className="attendance">
                    <Users size={14} />
                    {game.gameInfo.attendance.toLocaleString()}
                  </span>
                )}
                <span className={`result-badge ${teamWon ? 'win' : 'loss'}`}>
                  {teamWon ? 'W' : 'L'}
                </span>
              </div>

              <ChevronDown className={`expand-icon ${isExpanded ? 'expanded' : ''}`} size={20} />
            </div>

            {isExpanded && <BasketballGameStatsExpanded game={game} />}
          </div>
        );
      })}
    </div>
  );
}

// Basketball Expanded Stats Component
function BasketballGameStatsExpanded({ game }) {
  return (
    <div className="stats-game-body">
      {/* Line Scores */}
      {game.teamInfo?.lineScores?.home?.length > 0 && (
        <div className="line-scores">
          <table className="line-score-table">
            <thead>
              <tr>
                <th>Team</th>
                {game.teamInfo.lineScores.home.map((_, idx) => (
                  <th key={idx}>{game.teamInfo.periodLabel} {idx + 1}</th>
                ))}
                <th>Final</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{game.teamInfo.homeName}</td>
                {game.teamInfo.lineScores.home.map((score, idx) => (
                  <td key={idx}>{score}</td>
                ))}
                <td><strong>{game.teamInfo.homeScore}</strong></td>
              </tr>
              <tr>
                <td>{game.teamInfo.visitorName}</td>
                {game.teamInfo.lineScores.visitor.map((score, idx) => (
                  <td key={idx}>{score}</td>
                ))}
                <td><strong>{game.teamInfo.visitorScore}</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Player Stats */}
      <div className="player-stats-container">
        <BasketballPlayerStatsTable players={game.players} />
      </div>
    </div>
  );
}

// Basketball Player Stats Table
function BasketballPlayerStatsTable({ players }) {
  if (!players || players.length === 0) return <div className="no-stats">No player stats</div>;

  // Filter out players with no stats (like TEAM)
  const activePlayers = players.filter(p => p.points > 0 || p.fieldGoals?.attempts > 0 || p.minutesPlayed !== '0:00');

  if (activePlayers.length === 0) return <div className="no-stats">No player stats</div>;

  return (
    <table className="player-stats-table">
      <thead>
        <tr>
          <th>Player</th>
          <th>MIN</th>
          <th title="Field Goals">FG</th>
          <th title="Three Pointers">3PT</th>
          <th title="Free Throws">FT</th>
          <th title="Offensive Rebounds">OR</th>
          <th title="Defensive Rebounds">DR</th>
          <th title="Total Rebounds">REB</th>
          <th>AST</th>
          <th>TO</th>
          <th>STL</th>
          <th>BLK</th>
          <th>PF</th>
          <th>PTS</th>
        </tr>
      </thead>
      <tbody>
        {activePlayers.map((p, i) => (
          <tr key={i}>
            <td className="player-name">
              <strong>{p.fullName}</strong>
              <span className="jersey">#{p.jersey}</span>
            </td>
            <td>{p.minutesPlayed}</td>
            <td>{p.fieldGoals?.made || 0}-{p.fieldGoals?.attempts || 0}</td>
            <td>{p.threePointers?.made || 0}-{p.threePointers?.attempts || 0}</td>
            <td>{p.freeThrows?.made || 0}-{p.freeThrows?.attempts || 0}</td>
            <td>{p.rebounds?.offensive || 0}</td>
            <td>{p.rebounds?.defensive || 0}</td>
            <td><strong>{p.rebounds?.total || 0}</strong></td>
            <td>{p.assists || 0}</td>
            <td>{p.turnovers || 0}</td>
            <td>{p.steals || 0}</td>
            <td>{p.blocks || 0}</td>
            <td>{p.fouls || 0}</td>
            <td><strong>{p.points || 0}</strong></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// NBA Boxscore Display Component
function NBABoxscoreDisplay({ data, viewMode }) {
  const [expandedGames, setExpandedGames] = useState(new Set());

  // Group player records by gameId
  const gamesByGameId = useMemo(() => {
    const grouped = {};
    data.forEach(item => {
      const gameId = item.data.gameId;
      if (!grouped[gameId]) {
        grouped[gameId] = {
          gameId,
          gameDate: item.data.gameDate,
          homeTeamName: item.data.teamName === item.data.homeTeamName ? item.data.teamName : null,
          awayTeamName: item.data.teamName === item.data.awayTeamName ? item.data.teamName : null,
          homePlayers: [],
          awayPlayers: []
        };
      }

      // Add player to appropriate team
      if (item.data.team === 'home') {
        grouped[gameId].homePlayers.push(item.data);
        grouped[gameId].homeTeamName = item.data.teamName;
      } else {
        grouped[gameId].awayPlayers.push(item.data);
        grouped[gameId].awayTeamName = item.data.teamName;
      }
    });

    // Sort players within each team by playerOrder to maintain PDF order
    Object.values(grouped).forEach(game => {
      game.homePlayers.sort((a, b) => (a.playerOrder || 0) - (b.playerOrder || 0));
      game.awayPlayers.sort((a, b) => (a.playerOrder || 0) - (b.playerOrder || 0));
    });

    return Object.values(grouped);
  }, [data]);

  const toggleGame = (gameId) => {
    const newExpanded = new Set(expandedGames);
    if (newExpanded.has(gameId)) {
      newExpanded.delete(gameId);
    } else {
      newExpanded.add(gameId);
    }
    setExpandedGames(newExpanded);
  };

  const calculateTeamTotal = (players) => {
    return players.reduce((sum, p) => sum + (p.points || 0), 0);
  };

  if (viewMode === 'table') {
    return (
      <div className="stats-table-view">
        <table className="stats-summary-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Matchup</th>
              <th>Score</th>
              <th>Players</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {gamesByGameId.map((game) => {
              const isExpanded = expandedGames.has(game.gameId);
              const homeTotal = calculateTeamTotal(game.homePlayers);
              const awayTotal = calculateTeamTotal(game.awayPlayers);

              return (
                <React.Fragment key={game.gameId}>
                  <tr
                    className="stats-table-row clickable"
                    onClick={() => toggleGame(game.gameId)}
                  >
                    <td>
                      <Calendar size={14} className="inline-icon" />
                      {new Date(game.gameDate).toLocaleDateString()}
                    </td>
                    <td className="matchup-cell">
                      <strong>{game.awayTeamName}</strong> @ <strong>{game.homeTeamName}</strong>
                    </td>
                    <td className="score-cell">
                      <span className={awayTotal > homeTotal ? 'winner-score' : ''}>
                        {awayTotal}
                      </span>
                      {' - '}
                      <span className={homeTotal > awayTotal ? 'winner-score' : ''}>
                        {homeTotal}
                      </span>
                    </td>
                    <td>
                      {game.homePlayers.length + game.awayPlayers.length} players
                    </td>
                    <td>
                      {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="expanded-stats-row">
                      <td colSpan="5">
                        <NBABoxscoreExpanded game={game} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  // Card view
  return (
    <div className="stats-games-container">
      <h3 className="stats-section-title">NBA Boxscores ({gamesByGameId.length} games)</h3>
      {gamesByGameId.map((game) => {
        const isExpanded = expandedGames.has(game.gameId);
        const homeTotal = calculateTeamTotal(game.homePlayers);
        const awayTotal = calculateTeamTotal(game.awayPlayers);

        return (
          <div key={game.gameId} className="stats-game-card">
            <div className="stats-game-header" onClick={() => toggleGame(game.gameId)}>
              <div className="game-matchup">
                <div className="team-score away">
                  <span className="team-name">{game.awayTeamName}</span>
                  <span className={`score ${awayTotal > homeTotal ? 'winner' : ''}`}>
                    {awayTotal}
                  </span>
                </div>
                <div className="vs">@</div>
                <div className="team-score home">
                  <span className={`score ${homeTotal > awayTotal ? 'winner' : ''}`}>
                    {homeTotal}
                  </span>
                  <span className="team-name">{game.homeTeamName}</span>
                </div>
              </div>

              <div className="game-info">
                <span className="game-date">
                  <Calendar size={14} />
                  {new Date(game.gameDate).toLocaleDateString()}
                </span>
              </div>

              <ChevronDown className={`expand-icon ${isExpanded ? 'expanded' : ''}`} size={20} />
            </div>

            {isExpanded && <NBABoxscoreExpanded game={game} />}
          </div>
        );
      })}
    </div>
  );
}

// NBA Boxscore Expanded Component
function NBABoxscoreExpanded({ game }) {
  return (
    <div className="stats-game-body">
      {/* Away Team Stats */}
      <div className="team-stats-section">
        <h4 className="team-stats-title">{game.awayTeamName} (Away)</h4>
        <NBAPlayerStatsTable players={game.awayPlayers} />
      </div>

      {/* Home Team Stats */}
      <div className="team-stats-section" style={{ marginTop: '2rem' }}>
        <h4 className="team-stats-title">{game.homeTeamName} (Home)</h4>
        <NBAPlayerStatsTable players={game.homePlayers} />
      </div>
    </div>
  );
}

// NBA Player Stats Table
function NBAPlayerStatsTable({ players }) {
  if (!players || players.length === 0) return <div className="no-stats">No player stats</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="player-stats-table">
        <thead>
          <tr>
            <th>Player</th>
            <th>POS</th>
            <th>MIN</th>
            <th title="Field Goals Made/Attempted">FG</th>
            <th title="Three Pointers Made/Attempted">3PT</th>
            <th title="Free Throws Made/Attempted">FT</th>
            <th title="Offensive Rebounds">OREB</th>
            <th title="Defensive Rebounds">DREB</th>
            <th title="Total Rebounds">REB</th>
            <th title="Assists">AST</th>
            <th title="Steals">STL</th>
            <th title="Blocks">BLK</th>
            <th title="Turnovers">TO</th>
            <th title="Personal Fouls">PF</th>
            <th title="+/-">+/-</th>
            <th title="Points">PTS</th>
          </tr>
        </thead>
        <tbody>
          {players.map((player, idx) => (
            <tr key={idx}>
              <td className="player-name-cell">
                <strong>#{player.jerseyNum}</strong> {player.playerName}
              </td>
              <td>{player.position || '-'}</td>
              <td>{player.minutes}</td>
              <td>{player.fieldGoalsMade}-{player.fieldGoalsAttempted}</td>
              <td>{player.threePointersMade}-{player.threePointersAttempted}</td>
              <td>{player.freeThrowsMade}-{player.freeThrowsAttempted}</td>
              <td>{player.offensiveRebounds}</td>
              <td>{player.defensiveRebounds}</td>
              <td><strong>{player.rebounds}</strong></td>
              <td>{player.assists}</td>
              <td>{player.steals}</td>
              <td>{player.blocks}</td>
              <td>{player.turnovers}</td>
              <td>{player.personalFouls}</td>
              <td>{player.plusMinusPoints > 0 ? `+${player.plusMinusPoints}` : player.plusMinusPoints}</td>
              <td><strong>{player.points}</strong></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Schedule Table Component - Display schedule data
function ScheduleTable({ data, sport, moduleId }) {
  if (data.length === 0) return null;

  // Check if this is NBA or MLB (hide conference and tournament columns for these leagues)
  const isNBA = moduleId?.includes('nba');
  const isMLB = moduleId?.includes('mlb');

  const formatGameDate = (dateString) => {
    if (!dateString) return 'TBD';

    // Handle both ISO timestamp (2025-11-25T19:00:00) and date-only (2025-11-25) formats
    // Extract just the date part (first 10 characters) to avoid timezone issues
    const datePart = dateString.substring(0, 10);
    const [year, month, day] = datePart.split('-').map(Number);

    if (isNaN(year) || isNaN(month) || isNaN(day)) {
      return 'TBD';
    }

    const date = new Date(year, month - 1, day); // month is 0-indexed

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const formatGameTime = (timeString) => {
    if (!timeString) return '';
    return timeString;
  };

  return (
    <div className="table-container">
      <table className="player-table schedule-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Time</th>
            <th>Opponent</th>
            <th>Home/Away</th>
            {isMLB && <th>Game Type</th>}
            {isMLB && <th>Day/Night</th>}
            {isMLB && <th>DH</th>}
            <th>Venue</th>
            {!isNBA && !isMLB && <th>Location</th>}
            <th>Result</th>
            <th>TV</th>
            {sport === 'basketball' && !isNBA && <th>Conference</th>}
            {!isNBA && !isMLB && <th>Tournament</th>}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            const game = item.data;
            const isUpcoming = game.status === 'A';
            const isHome = game.isHome || game.locationIndicator === 'H';
            const isAway = game.isAway || game.locationIndicator === 'A';
            const isNeutral = game.isNeutral || game.locationIndicator === 'N';

            return (
              <tr key={game.gameId || index} className={isUpcoming ? 'upcoming-game' : 'completed-game'}>
                <td className="game-date">
                  <Calendar size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                  {formatGameDate(game.date)}
                </td>
                <td className="game-time">{formatGameTime(game.time)}</td>
                <td className="opponent-name">
                  <strong>{game.opponent}</strong>
                  {game.isConferenceGame && (
                    <span className="conference-badge" title="Conference Game">
                      CONF
                    </span>
                  )}
                </td>
                <td className="home-away">
                  {isNeutral ? (
                    <div>
                      <span className="location-badge neutral">NEUTRAL</span>
                      {game.neutralHometeam !== undefined && (
                        <div className="neutral-designation">
                          {game.neutralHometeam ? '(Home Team)' : '(Away Team)'}
                        </div>
                      )}
                    </div>
                  ) : isHome ? (
                    <span className="location-badge home">HOME</span>
                  ) : (
                    <span className="location-badge away">AWAY</span>
                  )}
                </td>
                {isMLB && (
                  <td className="game-type">
                    {game.gameTypeName ? (
                      <span className={`game-type-badge ${game.gameType === 'S' ? 'spring' : game.gameType === 'R' ? 'regular' : 'postseason'}`}>
                        {game.gameTypeName}
                      </span>
                    ) : '-'}
                  </td>
                )}
                {isMLB && (
                  <td className="day-night">
                    {game.dayNight ? (
                      <span className={`day-night-badge ${game.dayNight?.toLowerCase() === 'day' ? 'day' : 'night'}`}>
                        {game.dayNight === 'day' || game.dayNight === 'Day' ? '☀️ Day' : '🌙 Night'}
                      </span>
                    ) : '-'}
                  </td>
                )}
                {isMLB && (
                  <td className="doubleheader">
                    {game.doubleHeader ? (
                      <span className={`doubleheader-badge ${game.doubleHeaderType === 'Split' ? 'split' : ''}`} title={`Game ${game.gameNumber || 1} of ${game.doubleHeaderType || 'doubleheader'}`}>
                        {game.doubleHeaderType === 'Split' ? `Split DH${game.gameNumber || 1}` : `DH${game.gameNumber || 1}`}
                      </span>
                    ) : '-'}
                  </td>
                )}
                <td className="venue">{game.venue || '-'}</td>
                {!isNBA && !isMLB && <td className="city-location">{game.location || '-'}</td>}
                <td className="result">
                  {game.result ? (
                    <span className={`result-badge ${game.resultStatus === 'W' ? 'win' : 'loss'}`}>
                      {game.result}
                    </span>
                  ) : (
                    <span className="result-pending">-</span>
                  )}
                </td>
                <td className="tv-network">
                  {game.tv ? (
                    <span className="tv-badge">{game.tv}</span>
                  ) : (
                    '-'
                  )}
                </td>
                {sport === 'basketball' && !isNBA && (
                  <td className="conference-info">
                    {game.conferenceAbbrev || game.conference || '-'}
                  </td>
                )}
                {!isNBA && !isMLB && (
                  <td className="tournament">
                    {game.tournament ? (
                      <span className="tournament-name" title={game.tournament}>
                        🏆 {game.tournament}
                      </span>
                    ) : (
                      '-'
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      <style jsx>{`
        .schedule-table {
          font-size: 0.9rem;
        }

        .schedule-table th {
          background: #f7fafc;
          font-weight: 600;
          text-transform: uppercase;
          font-size: 0.75rem;
          letter-spacing: 0.05em;
          color: #4a5568;
          padding: 0.75rem 0.5rem;
        }

        .schedule-table td {
          padding: 0.75rem 0.5rem;
          vertical-align: middle;
        }

        .upcoming-game {
          background: #fff;
        }

        .completed-game {
          background: #fafafa;
        }

        .game-date {
          white-space: nowrap;
          font-weight: 500;
        }

        .game-time {
          color: #666;
          white-space: nowrap;
        }

        .opponent-name {
          font-weight: 500;
        }

        .conference-badge {
          display: inline-block;
          background: #e6f2ff;
          color: #0066cc;
          font-size: 0.65rem;
          font-weight: 700;
          padding: 2px 6px;
          border-radius: 3px;
          margin-left: 6px;
          vertical-align: middle;
        }

        .neutral-designation {
          font-size: 0.65rem;
          color: #666;
          margin-top: 2px;
          font-style: italic;
        }

        .location-badge {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
        }

        .location-badge.home {
          background: #d4edda;
          color: #155724;
        }

        .location-badge.away {
          background: #f8d7da;
          color: #721c24;
        }

        .location-badge.neutral {
          background: #d1ecf1;
          color: #0c5460;
        }

        .result-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 4px;
          font-weight: 700;
          font-size: 0.85rem;
        }

        .result-badge.win {
          background: #d4edda;
          color: #155724;
        }

        .result-badge.loss {
          background: #f8d7da;
          color: #721c24;
        }

        .result-pending {
          color: #999;
        }

        .tv-badge {
          display: inline-block;
          background: #667eea;
          color: white;
          padding: 3px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .city-location {
          color: #666;
          font-size: 0.85rem;
        }

        .venue {
          font-weight: 500;
        }

        .tournament-name {
          font-size: 0.8rem;
          color: #805ad5;
          font-weight: 500;
        }

        /* MLB Game Type Badges */
        .game-type-badge {
          display: inline-block;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 0.65rem;
          font-weight: 700;
          text-transform: uppercase;
          white-space: nowrap;
        }

        .game-type-badge.spring {
          background: #fef3c7;
          color: #92400e;
        }

        .game-type-badge.regular {
          background: #dbeafe;
          color: #1e40af;
        }

        .game-type-badge.postseason {
          background: #fce7f3;
          color: #9d174d;
        }

        /* Day/Night Badges */
        .day-night-badge {
          display: inline-block;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 600;
          white-space: nowrap;
        }

        .day-night-badge.day {
          background: #fef9c3;
          color: #854d0e;
        }

        .day-night-badge.night {
          background: #1e293b;
          color: #e2e8f0;
        }

        /* Doubleheader Badge */
        .doubleheader-badge {
          display: inline-block;
          background: #f59e0b;
          color: white;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 700;
        }

        .doubleheader-badge.split {
          background: #8b5cf6;
        }
      `}</style>
    </div>
  );
}

export default FetchDashboard;