import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Play, Square, Clock, Activity, RefreshCw, Calendar, AlertCircle, Loader2 } from 'lucide-react';
import NBAPlayByPlay from './NBAPlayByPlay';

function NBASchedule() {
  const [games, setGames] = useState([]);
  const [monitoredGames, setMonitoredGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [monitoringLoading, setMonitoringLoading] = useState({}); // Track loading state per game

  // Date selection - default to today
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  const [selectedDate, setSelectedDate] = useState(getTodayDateString());

  // Mobile detection
  const isMobile = window.innerWidth < 768;

  // Fetch games for selected date
  const fetchGames = async () => {
    try {
      setError(null);
      const response = await axios.get(`/nba/schedule/${selectedDate}`);
      setGames(response.data.games || []);
    } catch (err) {
      console.error('Error fetching games:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Failed to load games';
      setError(`Cannot connect to backend: ${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  // Fetch monitored games
  const fetchMonitoredGames = async () => {
    try {
      const response = await axios.get('/nba/monitoring/active');
      setMonitoredGames(response.data.games.map(g => g.gameId));
    } catch (err) {
      console.error('Error fetching monitored games:', err);
    }
  };

  // Sync games from NBA API
  const syncGames = async () => {
    try {
      setSyncing(true);
      setError(null);
      setLoading(true);

      const syncResponse = await axios.post('/nba/schedule/sync', { date: selectedDate });
      console.log('Sync response:', syncResponse.data);

      await fetchGames();
      await fetchMonitoredGames();

      if (!syncResponse.data.games || syncResponse.data.games.length === 0) {
        setError(`No NBA games scheduled for ${selectedDate}. Check back on game days!`);
      }
    } catch (err) {
      console.error('Error syncing games:', err);
      const errorMsg = err.response?.data?.message || err.message || 'Unknown error';
      setError(`Failed to sync games: ${errorMsg}. Make sure the backend is running.`);
    } finally {
      setSyncing(false);
      setLoading(false);
    }
  };

  // Start monitoring a game (with optimistic update)
  const startMonitoring = async (gameId) => {
    // Optimistic update - immediately show as monitoring
    setMonitoredGames([...monitoredGames, gameId]);
    setMonitoringLoading({ ...monitoringLoading, [gameId]: true });

    try {
      await axios.post(`/nba/monitor/${gameId}/start`);
      // Success - keep the optimistic update
      setMonitoringLoading({ ...monitoringLoading, [gameId]: false });
    } catch (err) {
      console.error('Error starting monitoring:', err);
      // Revert optimistic update on error
      setMonitoredGames(monitoredGames.filter(id => id !== gameId));
      setMonitoringLoading({ ...monitoringLoading, [gameId]: false });
      setError(`Failed to start monitoring game ${gameId}`);
    }
  };

  // Stop monitoring a game (with optimistic update)
  const stopMonitoring = async (gameId) => {
    // Optimistic update - immediately remove from monitoring
    setMonitoredGames(monitoredGames.filter(id => id !== gameId));
    setMonitoringLoading({ ...monitoringLoading, [gameId]: true });

    try {
      await axios.post(`/nba/monitor/${gameId}/stop`);
      // Success - keep the optimistic update
      setMonitoringLoading({ ...monitoringLoading, [gameId]: false });
    } catch (err) {
      console.error('Error stopping monitoring:', err);
      // Revert optimistic update on error
      setMonitoredGames([...monitoredGames, gameId]);
      setMonitoringLoading({ ...monitoringLoading, [gameId]: false });
      setError(`Failed to stop monitoring game ${gameId}`);
    }
  };

  // Initial load and when date changes
  useEffect(() => {
    syncGames();
  }, [selectedDate]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchGames();
      fetchMonitoredGames();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, selectedDate]);

  // If a game is selected, show play-by-play
  if (selectedGame) {
    return (
      <NBAPlayByPlay
        game={selectedGame}
        onBack={() => setSelectedGame(null)}
      />
    );
  }

  // Format game time - parse gameTimeEst timestamp
  const formatGameTime = (game) => {
    if (game.gameTimeEst) {
      // Parse the timestamp like "1900-01-01T19:00:00Z"
      // The time portion (19:00) is already in EST, so extract it directly
      const match = game.gameTimeEst.match(/T(\d{2}):(\d{2})/);
      if (match) {
        let hours = parseInt(match[1]);
        const minutes = match[2];
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12; // Convert 0 to 12, and 13-23 to 1-11
        return `${hours}:${minutes} ${ampm} EST`;
      }
    }
    // Fallback to parsing gameDateTimeEst if gameTimeEst not available
    if (game.gameDateTimeEst) {
      const date = new Date(game.gameDateTimeEst);
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
    }
    return 'TBD';
  };

  // Get game status badge
  const getStatusBadge = (game) => {
    const statusMap = {
      1: { label: 'Scheduled', color: 'bg-slate-100 text-slate-700 border-slate-200' },
      2: { label: 'LIVE', color: 'bg-red-500 text-white border-red-600' },
      3: { label: 'Final', color: 'bg-blue-100 text-blue-700 border-blue-200' }
    };
    const status = statusMap[game.gameStatus] || { label: 'Unknown', color: 'bg-gray-100 text-gray-700 border-gray-200' };

    return (
      <span className={`inline-flex items-center px-3 py-1 text-xs font-bold rounded-full border-2 ${status.color}`}>
        {game.gameStatus === 2 && <span className="w-2 h-2 bg-white rounded-full mr-2 animate-pulse" />}
        {status.label}
      </span>
    );
  };

  // Check if game is being monitored
  const isMonitored = (gameId) => monitoredGames.includes(gameId);

  return (
    <div style={{ padding: isMobile ? '1rem' : '2rem', maxWidth: '1400px', margin: '0 auto', backgroundColor: '#f8fafc', minHeight: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? '1.5rem' : '2.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem', flexDirection: isMobile ? 'column' : 'row' }}>
          <div>
            <h1 style={{ fontSize: isMobile ? '1.75rem' : '2.5rem', fontWeight: '800', color: '#1e293b', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{ fontSize: isMobile ? '2rem' : '3rem' }}>🏀</span>
              NBA Drift
            </h1>
            <p style={{ fontSize: isMobile ? '0.875rem' : '1.125rem', color: '#64748b' }}>
              Live game tracking with play-by-play edit detection
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', width: isMobile ? '100%' : 'auto' }}>
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              style={{
                padding: isMobile ? '0.75rem' : '0.75rem 1.25rem',
                borderRadius: '0.75rem',
                fontWeight: '600',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.2s',
                backgroundColor: autoRefresh ? '#10b981' : '#e2e8f0',
                color: autoRefresh ? 'white' : '#475569',
                boxShadow: autoRefresh ? '0 4px 6px rgba(16, 185, 129, 0.3)' : '0 2px 4px rgba(0, 0, 0, 0.1)',
                flex: isMobile ? '1' : 'none'
              }}
            >
              <Activity size={18} style={{ animation: autoRefresh ? 'pulse 2s infinite' : 'none' }} />
              {!isMobile && (autoRefresh ? 'Live Updates' : 'Paused')}
            </button>
            <button
              onClick={syncGames}
              disabled={syncing || loading}
              style={{
                padding: isMobile ? '0.75rem' : '0.75rem 1.5rem',
                borderRadius: '0.75rem',
                fontWeight: '600',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                border: 'none',
                cursor: syncing || loading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                backgroundColor: syncing || loading ? '#94a3b8' : '#3b82f6',
                color: 'white',
                boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)',
                flex: isMobile ? '1' : 'none'
              }}
            >
              <RefreshCw size={18} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
              {syncing ? 'Syncing...' : 'Sync Games'}
            </button>
          </div>
        </div>

        {/* Date Picker */}
        <div style={{
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          flexWrap: 'wrap'
        }}>
          <label style={{
            fontSize: isMobile ? '0.875rem' : '1rem',
            fontWeight: '600',
            color: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <Calendar size={20} style={{ color: '#3b82f6' }} />
            Select Date:
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              padding: isMobile ? '0.625rem 1rem' : '0.75rem 1.25rem',
              borderRadius: '0.75rem',
              border: '2px solid #e2e8f0',
              fontSize: isMobile ? '0.875rem' : '1rem',
              fontWeight: '500',
              color: '#1e293b',
              backgroundColor: 'white',
              cursor: 'pointer',
              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.05)',
              flex: isMobile ? '1' : 'none',
              minWidth: isMobile ? '0' : '180px'
            }}
          />
          <button
            onClick={() => setSelectedDate(getTodayDateString())}
            style={{
              padding: isMobile ? '0.625rem 1rem' : '0.75rem 1.25rem',
              borderRadius: '0.75rem',
              fontWeight: '600',
              fontSize: isMobile ? '0.75rem' : '0.875rem',
              border: '2px solid #3b82f6',
              backgroundColor: 'white',
              color: '#3b82f6',
              cursor: 'pointer',
              transition: 'all 0.2s',
              whiteSpace: 'nowrap'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = '#3b82f6';
              e.currentTarget.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'white';
              e.currentTarget.style.color = '#3b82f6';
            }}
          >
            Today
          </button>
        </div>

        {/* Error/Info Message */}
        {error && (
          <div style={{
            padding: '1rem 1.25rem',
            borderRadius: '0.75rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.75rem',
            backgroundColor: error.includes('No NBA games') ? '#eff6ff' : '#fef2f2',
            border: error.includes('No NBA games') ? '2px solid #93c5fd' : '2px solid #fca5a5',
            color: error.includes('No NBA games') ? '#1e40af' : '#991b1b',
            marginBottom: '1.5rem'
          }}>
            {error.includes('No NBA games') ? <Calendar size={24} /> : <AlertCircle size={24} />}
            <div style={{ flex: 1 }}>
              <p style={{ fontWeight: '600', fontSize: '1rem', marginBottom: '0.25rem' }}>
                {error.includes('No NBA games') ? 'No Games Today' : 'Connection Error'}
              </p>
              <p style={{ fontSize: '0.875rem', opacity: 0.9 }}>{error}</p>
            </div>
          </div>
        )}
      </div>

      {/* Stats Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))', gap: isMobile ? '1rem' : '1.5rem', marginBottom: isMobile ? '1.5rem' : '2rem' }}>
        <div style={{
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          padding: isMobile ? '1rem' : '1.5rem',
          borderRadius: '1rem',
          boxShadow: '0 10px 20px rgba(102, 126, 234, 0.3)',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Calendar size={isMobile ? 28 : 36} style={{ opacity: 0.8 }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: isMobile ? '2rem' : '2.5rem', fontWeight: '800', lineHeight: 1 }}>
                {loading ? '...' : games.length}
              </div>
              <div style={{ fontSize: isMobile ? '0.75rem' : '0.875rem', opacity: 0.9, marginTop: '0.25rem', fontWeight: '500' }}>
                {selectedDate === getTodayDateString() ? 'Games Today' : 'Games'}
              </div>
            </div>
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
          padding: isMobile ? '1rem' : '1.5rem',
          borderRadius: '1rem',
          boxShadow: '0 10px 20px rgba(240, 147, 251, 0.3)',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Activity size={isMobile ? 28 : 36} style={{ opacity: 0.8 }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: isMobile ? '2rem' : '2.5rem', fontWeight: '800', lineHeight: 1 }}>
                {loading ? '...' : games.filter(g => g.gameStatus === 2).length}
              </div>
              <div style={{ fontSize: isMobile ? '0.75rem' : '0.875rem', opacity: 0.9, marginTop: '0.25rem', fontWeight: '500' }}>
                In Progress
              </div>
            </div>
          </div>
        </div>

        <div style={{
          background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
          padding: isMobile ? '1rem' : '1.5rem',
          borderRadius: '1rem',
          boxShadow: '0 10px 20px rgba(79, 172, 254, 0.3)',
          color: 'white'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Play size={isMobile ? 28 : 36} style={{ opacity: 0.8 }} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: isMobile ? '2rem' : '2.5rem', fontWeight: '800', lineHeight: 1 }}>
                {loading ? '...' : monitoredGames.length}
              </div>
              <div style={{ fontSize: isMobile ? '0.75rem' : '0.875rem', opacity: 0.9, marginTop: '0.25rem', fontWeight: '500' }}>
                Monitoring
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Games List */}
      {loading ? (
        <div style={{
          textAlign: 'center',
          padding: isMobile ? '2rem 1rem' : '4rem 2rem',
          backgroundColor: 'white',
          borderRadius: '1rem',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)'
        }}>
          <RefreshCw size={isMobile ? 36 : 48} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite', margin: '0 auto 1.5rem' }} />
          <p style={{ fontSize: isMobile ? '1rem' : '1.25rem', fontWeight: '600', color: '#1e293b', marginBottom: '0.5rem' }}>
            Loading NBA games...
          </p>
          <p style={{ fontSize: isMobile ? '0.75rem' : '0.875rem', color: '#64748b' }}>
            Fetching today's schedule from NBA API
          </p>
        </div>
      ) : games.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: isMobile ? '2rem 1rem' : '4rem 2rem',
          background: 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)',
          borderRadius: '1rem',
          border: '2px solid #cbd5e1',
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)'
        }}>
          <Calendar size={isMobile ? 48 : 72} style={{ color: '#94a3b8', margin: '0 auto 1rem' }} />
          <h3 style={{ fontSize: isMobile ? '1.25rem' : '1.5rem', fontWeight: '700', color: '#1e293b', marginBottom: '0.5rem' }}>
            No Games {selectedDate === getTodayDateString() ? 'Today' : 'Found'}
          </h3>
          <p style={{ fontSize: isMobile ? '0.875rem' : '1rem', color: '#64748b', marginBottom: '0.25rem' }}>
            No NBA games are scheduled for {selectedDate === getTodayDateString() ? 'today' : selectedDate}
          </p>
          <p style={{ fontSize: isMobile ? '0.75rem' : '0.875rem', color: '#94a3b8', marginBottom: isMobile ? '1.5rem' : '2rem' }}>
            Try refreshing or check back on game days
          </p>
          <button
            onClick={syncGames}
            disabled={syncing}
            style={{
              padding: isMobile ? '0.75rem 1.5rem' : '0.875rem 1.75rem',
              borderRadius: '0.75rem',
              fontWeight: '600',
              fontSize: isMobile ? '0.875rem' : '1rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              border: 'none',
              cursor: syncing ? 'not-allowed' : 'pointer',
              backgroundColor: syncing ? '#94a3b8' : '#3b82f6',
              color: 'white',
              boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)'
            }}
          >
            <RefreshCw size={isMobile ? 18 : 20} style={{ animation: syncing ? 'spin 1s linear infinite' : 'none' }} />
            {syncing ? 'Syncing...' : 'Refresh Schedule'}
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {games.map((game) => (
            <div
              key={game.gameId}
              style={{
                backgroundColor: 'white',
                borderRadius: '1rem',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
                transition: 'all 0.2s',
                cursor: 'pointer'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.05)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              onClick={() => setSelectedGame(game)}
            >
              <div style={{ padding: isMobile ? '1rem' : '1.5rem' }}>
                {/* Game Header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? '0.5rem' : '1rem', marginBottom: isMobile ? '1rem' : '1.5rem', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#64748b', fontSize: isMobile ? '0.75rem' : '0.875rem', fontWeight: '500' }}>
                    <Clock size={isMobile ? 14 : 16} />
                    {formatGameTime(game)}
                  </div>
                  {getStatusBadge(game)}
                  {isMonitored(game.gameId) && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: isMobile ? '0.25rem 0.5rem' : '0.375rem 0.75rem',
                      fontSize: isMobile ? '0.625rem' : '0.75rem',
                      fontWeight: '700',
                      backgroundColor: '#fef3c7',
                      color: '#92400e',
                      borderRadius: '9999px',
                      border: '2px solid #fbbf24',
                      gap: '0.375rem'
                    }}>
                      <Activity size={12} style={{ animation: 'pulse 2s infinite' }} />
                      MONITORING
                    </span>
                  )}
                </div>

                <div style={{ display: 'flex', gap: isMobile ? '1rem' : '2rem', alignItems: isMobile ? 'stretch' : 'center', flexDirection: isMobile ? 'column' : 'row' }}>
                  {/* Teams */}
                  <div style={{ flex: 1 }}>
                    {/* Away Team */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: isMobile ? '0.75rem' : '1rem',
                      backgroundColor: '#f8fafc',
                      borderRadius: '0.75rem',
                      marginBottom: isMobile ? '0.5rem' : '0.75rem',
                      border: '2px solid #e2e8f0'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: isMobile ? '0.625rem' : '0.75rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                          Away
                        </div>
                        <div style={{ fontSize: isMobile ? '1rem' : '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                          {game.awayTeam.teamCity} {game.awayTeam.teamName}
                        </div>
                        <div style={{ fontSize: isMobile ? '0.75rem' : '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
                          {game.awayTeam.wins}-{game.awayTeam.losses}
                        </div>
                      </div>
                      {game.gameStatus >= 2 && (
                        <div style={{ fontSize: isMobile ? '2rem' : '3rem', fontWeight: '800', color: '#0f172a', marginLeft: '1rem' }}>
                          {game.awayTeam.score}
                        </div>
                      )}
                    </div>

                    {/* Home Team */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: isMobile ? '0.75rem' : '1rem',
                      backgroundColor: '#dbeafe',
                      borderRadius: '0.75rem',
                      border: '2px solid #93c5fd'
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: isMobile ? '0.625rem' : '0.75rem', fontWeight: '700', color: '#1e40af', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>
                          Home
                        </div>
                        <div style={{ fontSize: isMobile ? '1rem' : '1.25rem', fontWeight: '800', color: '#0f172a' }}>
                          {game.homeTeam.teamCity} {game.homeTeam.teamName}
                        </div>
                        <div style={{ fontSize: isMobile ? '0.75rem' : '0.875rem', color: '#64748b', marginTop: '0.25rem' }}>
                          {game.homeTeam.wins}-{game.homeTeam.losses}
                        </div>
                      </div>
                      {game.gameStatus >= 2 && (
                        <div style={{ fontSize: isMobile ? '2rem' : '3rem', fontWeight: '800', color: '#0f172a', marginLeft: '1rem' }}>
                          {game.homeTeam.score}
                        </div>
                      )}
                    </div>

                    {/* Arena */}
                    {game.arenaName && (
                      <div style={{
                        marginTop: isMobile ? '0.5rem' : '1rem',
                        fontSize: isMobile ? '0.75rem' : '0.875rem',
                        color: '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                      }}>
                        <span style={{ fontSize: isMobile ? '0.875rem' : '1rem' }}>📍</span>
                        {game.arenaName}, {game.arenaCity}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'row' : 'column', gap: '0.75rem', minWidth: isMobile ? 'auto' : '180px', width: isMobile ? '100%' : 'auto' }}>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedGame(game);
                      }}
                      style={{
                        padding: isMobile ? '0.75rem 1rem' : '0.875rem 1.5rem',
                        borderRadius: '0.75rem',
                        fontWeight: '600',
                        fontSize: isMobile ? '0.75rem' : '0.875rem',
                        border: 'none',
                        cursor: 'pointer',
                        backgroundColor: '#3b82f6',
                        color: 'white',
                        boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s',
                        flex: isMobile ? '1' : 'none'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#2563eb';
                        e.currentTarget.style.transform = 'translateY(-1px)';
                        e.currentTarget.style.boxShadow = '0 6px 10px rgba(59, 130, 246, 0.4)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#3b82f6';
                        e.currentTarget.style.transform = 'translateY(0)';
                        e.currentTarget.style.boxShadow = '0 4px 6px rgba(59, 130, 246, 0.3)';
                      }}
                    >
                      View Play-by-Play
                    </button>
                    {isMonitored(game.gameId) ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          stopMonitoring(game.gameId);
                        }}
                        style={{
                          padding: isMobile ? '0.75rem' : '0.75rem 1.25rem',
                          borderRadius: '0.75rem',
                          fontWeight: '600',
                          fontSize: isMobile ? '0.75rem' : '0.875rem',
                          border: 'none',
                          cursor: 'pointer',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          boxShadow: '0 4px 6px rgba(239, 68, 68, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s',
                          flex: isMobile ? '1' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = '#dc2626';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.boxShadow = '0 6px 10px rgba(239, 68, 68, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = '#ef4444';
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.boxShadow = '0 4px 6px rgba(239, 68, 68, 0.3)';
                        }}
                      >
                        <Square size={16} />
                        Stop
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startMonitoring(game.gameId);
                        }}
                        disabled={monitoringLoading[game.gameId]}
                        style={{
                          padding: isMobile ? '0.75rem' : '0.75rem 1.25rem',
                          borderRadius: '0.75rem',
                          fontWeight: '600',
                          fontSize: isMobile ? '0.75rem' : '0.875rem',
                          border: 'none',
                          cursor: monitoringLoading[game.gameId] ? 'wait' : 'pointer',
                          backgroundColor: monitoringLoading[game.gameId] ? '#6b7280' : '#10b981',
                          color: 'white',
                          boxShadow: '0 4px 6px rgba(16, 185, 129, 0.3)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.5rem',
                          transition: 'all 0.2s',
                          flex: isMobile ? '1' : 'none',
                          opacity: monitoringLoading[game.gameId] ? 0.7 : 1
                        }}
                        onMouseEnter={(e) => {
                          if (!monitoringLoading[game.gameId]) {
                            e.currentTarget.style.backgroundColor = '#059669';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.style.boxShadow = '0 6px 10px rgba(16, 185, 129, 0.4)';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!monitoringLoading[game.gameId]) {
                            e.currentTarget.style.backgroundColor = '#10b981';
                            e.currentTarget.style.transform = 'translateY(0)';
                            e.currentTarget.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)';
                          }
                        }}
                      >
                        {monitoringLoading[game.gameId] ? (
                          <>
                            <Loader2 size={16} className="spinner" style={{ animation: 'spin 1s linear infinite' }} />
                            Starting...
                          </>
                        ) : (
                          <>
                            <Play size={16} />
                            Monitor
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add CSS animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}

export default NBASchedule;
