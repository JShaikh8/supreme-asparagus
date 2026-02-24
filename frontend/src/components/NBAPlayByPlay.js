import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { ArrowLeft, RefreshCw, Play, Square, AlertCircle, Database } from 'lucide-react';
import { useSwipeable } from 'react-swipeable';

// Swipeable Card Component
function SwipeableCard({ action, onSwipeLeft, onSwipeRight, reviewStatus, children }) {
  const [offset, setOffset] = useState(0);
  const [swiped, setSwiped] = useState(false);
  const SWIPE_THRESHOLD = 80; // Reduced from 100 for easier swiping

  const handlers = useSwipeable({
    onSwiping: ({ deltaX }) => setOffset(deltaX),
    onSwiped: ({ deltaX }) => {
      if (deltaX > SWIPE_THRESHOLD) {
        onSwipeRight(action.actionNumber);
        // Haptic feedback on mobile
        if (navigator.vibrate) navigator.vibrate(50);
      } else if (deltaX < -SWIPE_THRESHOLD) {
        onSwipeLeft(action.actionNumber);
        // Haptic feedback on mobile
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
      }
      setOffset(0);
      setSwiped(true);
      setTimeout(() => setSwiped(false), 300);
    },
    trackMouse: true,
    preventScrollOnSwipe: true // Prevent scroll while swiping
  });

  return (
    <div {...handlers} style={{ position: 'relative', marginBottom: '0.75rem' }}>
      {/* Background hint */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        borderRadius: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: offset > 0 ? 'flex-start' : 'flex-end',
        padding: '0 2rem',
        backgroundColor: offset > 0 ? '#10b981' : offset < 0 ? '#ef4444' : 'transparent',
        color: 'white',
        fontWeight: '700',
        fontSize: '1rem',
        opacity: Math.min(Math.abs(offset) / 80, 1),
        transition: 'opacity 0.1s',
        pointerEvents: 'none'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          transform: `scale(${Math.min(Math.abs(offset) / 80, 1.2)})`,
          transition: 'transform 0.1s'
        }}>
          {offset > 0 ? (
            <>
              <span style={{ fontSize: '1.5rem' }}>✓</span>
              <span>Approve</span>
            </>
          ) : offset < 0 ? (
            <>
              <span>Flag</span>
              <span style={{ fontSize: '1.5rem' }}>⚠</span>
            </>
          ) : ''}
        </div>
      </div>

      {/* Card content */}
      <div style={{
        transform: `translateX(${offset}px)`,
        transition: swiped ? 'transform 0.3s ease-out' : 'none',
        position: 'relative',
        zIndex: 1
      }}>
        {children}
      </div>
    </div>
  );
}

function NBAPlayByPlay({ game, onBack }) {
  const [playByPlay, setPlayByPlay] = useState({});
  const [gameData, setGameData] = useState(game);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [expandedActions, setExpandedActions] = useState(new Set());
  const [viewMode, setViewMode] = useState('live'); // live, editor, changes
  const [reviewStatuses, setReviewStatuses] = useState({}); // actionNumber -> 'reviewed' | 'flagged'

  // Pull to refresh
  const [pullY, setPullY] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const pullingRef = useRef(false);
  const containerRef = useRef(null);

  // Fetch play-by-play data
  const fetchPlayByPlay = async () => {
    try {
      setError(null);
      const response = await axios.get(`/nba/playbyplay/${gameData.gameId}/by-period?t=${Date.now()}`);
      setPlayByPlay(response.data.playByPlay);

      // Load review statuses from database
      const statuses = {};
      Object.values(response.data.playByPlay || {}).forEach(periodActions => {
        periodActions.forEach(action => {
          if (action.reviewStatus === 'approved') {
            statuses[action.actionNumber] = 'reviewed';
          } else if (action.reviewStatus === 'flagged') {
            statuses[action.actionNumber] = 'flagged';
          }
        });
      });
      setReviewStatuses(statuses);
    } catch (err) {
      console.error('Error fetching play-by-play:', err);
      setError('Failed to load play-by-play data');
    } finally {
      setLoading(false);
    }
  };

  // Fetch updated game data
  const fetchGameData = async () => {
    try {
      const response = await axios.get(`/nba/game/${gameData.gameId}`);
      setGameData(response.data.game);
    } catch (err) {
      console.error('Error fetching game data:', err);
    }
  };

  // Manual refresh
  const refreshPlayByPlay = async () => {
    setIsRefreshing(true);
    await fetchPlayByPlay();
    await fetchGameData();
    setIsRefreshing(false);
  };

  // Start/Stop monitoring
  const startMonitoring = async () => {
    try {
      await axios.post(`/nba/monitor/${gameData.gameId}/start`);
      await fetchGameData();
    } catch (err) {
      console.error('Error starting monitoring:', err);
      setError('Failed to start monitoring');
    }
  };

  const stopMonitoring = async () => {
    try {
      await axios.post(`/nba/monitor/${gameData.gameId}/stop`);
      await fetchGameData();
    } catch (err) {
      console.error('Error stopping monitoring:', err);
      setError('Failed to stop monitoring');
    }
  };

  // Toggle action expansion
  const toggleAction = (actionNumber) => {
    const newExpanded = new Set(expandedActions);
    if (newExpanded.has(actionNumber)) {
      newExpanded.delete(actionNumber);
    } else {
      newExpanded.add(actionNumber);
    }
    setExpandedActions(newExpanded);
  };

  // Swipe handlers - persist to database
  const handleSwipeRight = useCallback(async (actionNumber) => {
    const current = reviewStatuses[actionNumber];
    const newStatus = current === 'reviewed' ? 'unreviewed' : 'approved';

    setReviewStatuses(prev => {
      const next = { ...prev };
      if (newStatus === 'unreviewed') delete next[actionNumber];
      else next[actionNumber] = 'reviewed';
      return next;
    });

    // Persist to database
    try {
      await axios.post(`/nba/playbyplay/${gameData.gameId}/action/${actionNumber}/review`, {
        reviewStatus: newStatus
      });
    } catch (err) {
      console.error('Error updating review status:', err);
    }
  }, [reviewStatuses, gameData.gameId]);

  const handleSwipeLeft = useCallback(async (actionNumber) => {
    const current = reviewStatuses[actionNumber];
    const newStatus = current === 'flagged' ? 'unreviewed' : 'flagged';

    setReviewStatuses(prev => {
      const next = { ...prev };
      if (newStatus === 'unreviewed') delete next[actionNumber];
      else next[actionNumber] = 'flagged';
      return next;
    });

    // Persist to database
    try {
      await axios.post(`/nba/playbyplay/${gameData.gameId}/action/${actionNumber}/review`, {
        reviewStatus: newStatus
      });
    } catch (err) {
      console.error('Error updating review status:', err);
    }
  }, [reviewStatuses, gameData.gameId]);

  // Pull to refresh handlers
  const onTouchStart = (e) => {
    if (containerRef.current && containerRef.current.scrollTop === 0) {
      startYRef.current = e.touches[0].clientY;
      pullingRef.current = true;
    }
  };

  const onTouchMove = (e) => {
    if (!pullingRef.current) return;
    const delta = e.touches[0].clientY - startYRef.current;
    if (delta > 0) {
      e.preventDefault();
      setPullY(delta * 0.5);
    }
  };

  const onTouchEnd = async () => {
    if (!pullingRef.current) return;
    pullingRef.current = false;
    if (pullY > 60) {
      await refreshPlayByPlay();
    }
    setPullY(0);
  };

  // Initial load
  useEffect(() => {
    fetchPlayByPlay();
  }, [gameData.gameId]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      fetchPlayByPlay();
      fetchGameData();
    }, 30000);

    return () => clearInterval(interval);
  }, [autoRefresh, gameData.gameId]);

  // Format time
  const formatTime = (clock) => {
    if (!clock) return '';
    const match = clock.match(/PT(\d+)M([\d.]+)S/);
    if (match) {
      const minutes = match[1];
      const seconds = parseFloat(match[2]).toFixed(2).padStart(5, '0');
      return `${minutes}:${seconds}`;
    }
    return clock;
  };

  // Format timestamp
  const formatTimestamp = (timestamp) => {
    if (!timestamp) return 'N/A';
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    });
  };

  // Get period name
  const getPeriodName = (period) => {
    if (period <= 4) return `Q${period}`;
    return `OT${period - 4}`;
  };

  // Get team logo URL
  const getTeamLogoUrl = (teamId) => {
    return `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`;
  };

  // Get player headshot URL
  const getPlayerHeadshotUrl = (personId) => {
    return `https://cdn.nba.com/headshots/nba/latest/1040x760/${personId}.png`;
  };

  // Highlight differences between old and new text
  const highlightTextDiff = (oldText, newText) => {
    if (!oldText || !newText) return { old: oldText || '', new: newText || '' };

    const oldWords = oldText.split(' ');
    const newWords = newText.split(' ');
    const maxLen = Math.max(oldWords.length, newWords.length);

    let oldHighlighted = [];
    let newHighlighted = [];

    for (let i = 0; i < maxLen; i++) {
      const oldWord = oldWords[i] || '';
      const newWord = newWords[i] || '';

      if (oldWord !== newWord) {
        // Words differ - highlight them
        if (oldWord) {
          oldHighlighted.push(
            <span key={i} style={{ backgroundColor: '#fee2e2', padding: '2px 4px', borderRadius: '3px', textDecoration: 'line-through' }}>
              {oldWord}
            </span>
          );
        }
        if (newWord) {
          newHighlighted.push(
            <span key={i} style={{ backgroundColor: '#dcfce7', padding: '2px 4px', borderRadius: '3px', fontWeight: '600' }}>
              {newWord}
            </span>
          );
        }
      } else {
        // Words match - no highlight
        if (oldWord) oldHighlighted.push(<span key={i}>{oldWord}</span>);
        if (newWord) newHighlighted.push(<span key={i}>{newWord}</span>);
      }

      // Add space between words
      if (i < maxLen - 1) {
        oldHighlighted.push(' ');
        newHighlighted.push(' ');
      }
    }

    return {
      old: <>{oldHighlighted}</>,
      new: <>{newHighlighted}</>
    };
  };

  // Get all actions with filtering based on view mode
  const getAllActions = () => {
    let allActions = [];
    Object.values(playByPlay).forEach(periodActions => {
      allActions = allActions.concat(periodActions);
    });

    // Filter based on view mode
    if (viewMode === 'editor') {
      // Editor mode: ONLY show actions that need review
      // Must have significant edit AND not be reviewed/approved
      allActions = allActions.filter(a => {
        const isEdited = a.hasSignificantEdit;
        const isReviewed = reviewStatuses[a.actionNumber] === 'reviewed';
        return isEdited && !isReviewed;
      });
    } else if (viewMode === 'changes') {
      // Changes mode: only show edited actions
      allActions = allActions.filter(a => a.hasSignificantEdit);
    }

    // Sort by order number
    // For live mode: newest first (descending) - latest plays at top
    // For editor/changes mode: oldest first (ascending) - chronological order
    if (viewMode === 'live') {
      allActions.sort((a, b) => (b.orderNumber || 0) - (a.orderNumber || 0)); // Descending
    } else {
      allActions.sort((a, b) => (a.orderNumber || 0) - (b.orderNumber || 0)); // Ascending
    }

    return allActions;
  };

  const allActions = getAllActions();
  const periods = Object.keys(playByPlay).sort((a, b) => parseInt(a) - parseInt(b));

  // Build list with period separators
  const listItems = [];
  let lastPeriod = null;
  allActions.forEach(action => {
    if (action.period !== lastPeriod) {
      lastPeriod = action.period;
      listItems.push({ type: 'separator', period: lastPeriod });
    }
    listItems.push({ type: 'action', action });
  });

  // Stats
  const totalActions = allActions.length;
  const editedActions = allActions.filter(a => a.hasSignificantEdit).length;
  const reviewedCount = Object.values(reviewStatuses).filter(s => s === 'reviewed').length;
  const flaggedCount = Object.values(reviewStatuses).filter(s => s === 'flagged').length;

  // Detect if mobile
  const isMobile = window.innerWidth < 768;

  return (
    <div style={{
      backgroundColor: '#f8fafc',
      minHeight: '100%',
      height: '100%',
      paddingBottom: '80px', // Space for bottom nav
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backgroundColor: 'white',
        borderBottom: '1px solid #e2e8f0',
        padding: '1rem'
      }}>
        {/* Back Button */}
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 1rem',
            marginBottom: '1rem',
            backgroundColor: 'white',
            border: '2px solid #e2e8f0',
            borderRadius: '0.5rem',
            color: '#3b82f6',
            fontWeight: '600',
            fontSize: '0.875rem',
            cursor: 'pointer'
          }}
        >
          <ArrowLeft size={20} />
          Back
        </button>

        {/* Game Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '1rem'
        }}>
          {/* Away Team */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flex: 1
          }}>
            <img
              src={getTeamLogoUrl(gameData.awayTeam?.teamId)}
              alt={gameData.awayTeam?.teamTricode}
              style={{ width: '40px', height: '40px' }}
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
            <div>
              <div style={{ fontWeight: '700', fontSize: '1rem' }}>
                {gameData.awayTeam?.teamTricode}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>
                {gameData.awayTeam?.score}
              </div>
            </div>
          </div>

          {/* Game Status */}
          <div style={{ textAlign: 'center' }}>
            {gameData.gameStatus === 2 && gameData.period && gameData.gameClock ? (
              // Live game: show period and clock
              <>
                <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ef4444' }}>
                  {gameData.period <= 4 ? `Q${gameData.period}` : `OT${gameData.period - 4}`}
                </div>
                <div style={{ fontSize: '1rem', fontWeight: '700', color: '#0f172a', fontFamily: 'monospace' }}>
                  {gameData.gameClock}
                </div>
              </>
            ) : (
              // Pre-game or post-game: show status text
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600' }}>
                {gameData.gameStatusText}
              </div>
            )}
          </div>

          {/* Home Team */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flex: 1,
            justifyContent: 'flex-end'
          }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: '700', fontSize: '1rem' }}>
                {gameData.homeTeam?.teamTricode}
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: '800' }}>
                {gameData.homeTeam?.score}
              </div>
            </div>
            <img
              src={getTeamLogoUrl(gameData.homeTeam?.teamId)}
              alt={gameData.homeTeam?.teamTricode}
              style={{ width: '40px', height: '40px' }}
              onError={(e) => e.currentTarget.style.display = 'none'}
            />
          </div>
        </div>

        {/* Controls */}
        <div style={{
          display: 'flex',
          gap: '0.5rem',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.5rem',
              fontWeight: '600',
              fontSize: '0.75rem',
              border: 'none',
              cursor: 'pointer',
              backgroundColor: autoRefresh ? '#10b981' : '#e2e8f0',
              color: autoRefresh ? 'white' : '#475569',
              flex: isMobile ? '1' : 'none'
            }}
          >
            {autoRefresh ? 'Live ON' : 'Live OFF'}
          </button>

          {gameData.isMonitoring ? (
            <button
              onClick={stopMonitoring}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                fontWeight: '600',
                fontSize: '0.75rem',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#ef4444',
                color: 'white',
                flex: isMobile ? '1' : 'none'
              }}
            >
              <Square size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Stop
            </button>
          ) : (
            <button
              onClick={startMonitoring}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                fontWeight: '600',
                fontSize: '0.75rem',
                border: 'none',
                cursor: 'pointer',
                backgroundColor: '#10b981',
                color: 'white',
                flex: isMobile ? '1' : 'none'
              }}
            >
              <Play size={14} style={{ display: 'inline', marginRight: '0.25rem' }} />
              Monitor
            </button>
          )}
        </div>

        {/* Stats */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: '0.5rem',
          marginTop: '1rem'
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#0f172a' }}>
              {totalActions}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Total</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f59e0b' }}>
              {editedActions}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Edited</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#10b981' }}>
              {reviewedCount}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Reviewed</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: '800', color: '#ef4444' }}>
              {flaggedCount}
            </div>
            <div style={{ fontSize: '0.65rem', color: '#64748b' }}>Flagged</div>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div style={{
          padding: '1rem',
          margin: '1rem',
          borderRadius: '0.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          backgroundColor: '#fef2f2',
          border: '2px solid #fca5a5',
          color: '#991b1b'
        }}>
          <AlertCircle size={24} />
          <p style={{ fontSize: '0.875rem', flex: 1 }}>{error}</p>
        </div>
      )}

      {/* Play-by-Play List with Pull to Refresh */}
      <div
        ref={containerRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          transform: `translateY(${pullY}px)`,
          transition: pullY === 0 && !isRefreshing ? 'transform 0.3s' : 'none',
          padding: '1rem',
          overflow: 'auto',
          maxHeight: 'calc(100vh - 300px)'
        }}
      >
        {isRefreshing && (
          <div style={{
            textAlign: 'center',
            padding: '1rem',
            color: '#3b82f6',
            fontWeight: '600'
          }}>
            <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite', display: 'inline-block', marginRight: '0.5rem' }} />
            Refreshing...
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <RefreshCw size={48} style={{ color: '#3b82f6', animation: 'spin 1s linear infinite', margin: '0 auto 1rem' }} />
            <p>Loading play-by-play...</p>
          </div>
        ) : listItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem 2rem', maxWidth: '500px', margin: '0 auto' }}>
            {viewMode === 'editor' ? (
              // Editor mode empty - all edits reviewed
              <>
                <AlertCircle size={72} style={{ color: '#10b981', margin: '0 auto 1rem' }} />
                <h3 style={{ marginBottom: '0.5rem' }}>All Clear!</h3>
                <p style={{ color: '#64748b', marginBottom: 0 }}>
                  No unreviewed edited actions. Great work!
                </p>
              </>
            ) : viewMode === 'changes' ? (
              // Changes mode empty - no edits detected
              <>
                <AlertCircle size={72} style={{ color: '#3b82f6', margin: '0 auto 1rem' }} />
                <h3 style={{ marginBottom: '0.5rem' }}>No Edits Detected</h3>
                <p style={{ color: '#64748b', marginBottom: 0 }}>
                  No edited actions found for this game. The NBA data appears to be stable.
                </p>
              </>
            ) : !gameData.isMonitoring ? (
              // Live mode but not monitoring - suggest starting
              <>
                <Database size={72} style={{ color: '#f59e0b', margin: '0 auto 1rem' }} />
                <h3 style={{ marginBottom: '0.5rem' }}>No Play-by-Play Data</h3>
                <p style={{ color: '#64748b', marginBottom: '1.5rem' }}>
                  This game isn't being monitored yet. Start monitoring to capture NBA edits in real-time.
                </p>
                <button
                  onClick={startMonitoring}
                  style={{
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.75rem',
                    fontWeight: '600',
                    fontSize: '0.9375rem',
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: '#10b981',
                    color: 'white',
                    boxShadow: '0 4px 6px rgba(16, 185, 129, 0.3)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    transition: 'all 0.2s'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = '#059669';
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 10px rgba(16, 185, 129, 0.4)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = '#10b981';
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = '0 4px 6px rgba(16, 185, 129, 0.3)';
                  }}
                >
                  <Play size={18} />
                  Start Monitoring
                </button>
              </>
            ) : (
              // Live mode, monitoring on, but no data yet
              <>
                <Database size={72} style={{ color: '#94a3b8', margin: '0 auto 1rem' }} />
                <h3 style={{ marginBottom: '0.5rem' }}>No Data Yet</h3>
                <p style={{ color: '#64748b', marginBottom: 0 }}>
                  Monitoring is active. Play-by-play data will appear here once the game starts.
                </p>
              </>
            )}
          </div>
        ) : (
          <div>
            {listItems.map((item, idx) =>
              item.type === 'separator' ? (
                <div
                  key={`sep-${idx}`}
                  style={{
                    padding: '0.5rem 0.75rem',
                    marginBottom: '0.75rem',
                    backgroundColor: '#3b82f6',
                    color: 'white',
                    borderRadius: '0.5rem',
                    fontWeight: '700',
                    fontSize: '0.875rem',
                    textAlign: 'center'
                  }}
                >
                  {getPeriodName(item.period)}
                </div>
              ) : (
                <SwipeableCard
                  key={item.action.actionNumber}
                  action={item.action}
                  reviewStatus={reviewStatuses[item.action.actionNumber]}
                  onSwipeLeft={handleSwipeLeft}
                  onSwipeRight={handleSwipeRight}
                >
                  <div
                    onClick={() => toggleAction(item.action.actionNumber)}
                    style={{
                      backgroundColor: item.action.hasSignificantEdit ? '#fef3c7' : 'white',
                      borderRadius: '0.75rem',
                      boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                      border: item.action.hasSignificantEdit ? '2px solid #fbbf24' : '1px solid #e2e8f0',
                      cursor: 'pointer',
                      overflow: 'hidden'
                    }}
                  >
                    {/* Action Summary */}
                    <div style={{
                      padding: '0.75rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.75rem'
                    }}>
                      {/* Player Headshot */}
                      <img
                        src={getPlayerHeadshotUrl(item.action.personId)}
                        alt=""
                        style={{
                          width: '50px',
                          height: '50px',
                          borderRadius: '50%',
                          objectFit: 'cover',
                          border: '2px solid #e2e8f0'
                        }}
                        onError={(e) => e.currentTarget.style.display = 'none'}
                      />

                      {/* Action Details */}
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontSize: '0.7rem',
                          color: '#64748b',
                          marginBottom: '0.25rem',
                          display: 'flex',
                          gap: '0.5rem',
                          alignItems: 'center'
                        }}>
                          <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>
                            #{item.action.actionNumber}
                          </span>
                          <span style={{ fontWeight: '700', fontFamily: 'monospace' }}>
                            {formatTime(item.action.clock)}
                          </span>
                          {item.action.hasSignificantEdit && (
                            <span style={{
                              fontSize: '0.625rem',
                              fontWeight: '700',
                              backgroundColor: '#fbbf24',
                              color: '#78350f',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '9999px'
                            }}>
                              EDITED
                            </span>
                          )}
                          {reviewStatuses[item.action.actionNumber] === 'reviewed' && (
                            <span style={{
                              fontSize: '0.625rem',
                              fontWeight: '700',
                              backgroundColor: '#10b981',
                              color: 'white',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '9999px'
                            }}>
                              ✓
                            </span>
                          )}
                          {reviewStatuses[item.action.actionNumber] === 'flagged' && (
                            <span style={{
                              fontSize: '0.625rem',
                              fontWeight: '700',
                              backgroundColor: '#ef4444',
                              color: 'white',
                              padding: '0.125rem 0.375rem',
                              borderRadius: '9999px'
                            }}>
                              ⚠
                            </span>
                          )}
                        </div>
                        <div style={{
                          fontSize: '0.875rem',
                          fontWeight: '500',
                          color: '#0f172a'
                        }}>
                          {item.action.description}
                        </div>
                      </div>

                      {/* Team Logo */}
                      <img
                        src={getTeamLogoUrl(item.action.teamId)}
                        alt=""
                        style={{
                          width: '30px',
                          height: '30px'
                        }}
                        onError={(e) => e.currentTarget.style.display = 'none'}
                      />
                    </div>

                    {/* Expanded Details */}
                    {expandedActions.has(item.action.actionNumber) && (
                      <div style={{
                        padding: '0.75rem',
                        backgroundColor: '#f8fafc',
                        borderTop: '1px solid #e2e8f0'
                      }}>
                        {/* Edit History */}
                        {item.action.editHistory && item.action.editHistory.length > 0 && (
                          <div>
                            <h4 style={{
                              fontSize: '0.75rem',
                              fontWeight: '700',
                              color: '#0f172a',
                              marginBottom: '0.5rem'
                            }}>
                              Edit History ({item.action.editHistory.length})
                            </h4>
                            {item.action.editHistory.map((edit, editIdx) => (
                              <div
                                key={editIdx}
                                style={{
                                  backgroundColor: 'white',
                                  borderRadius: '0.375rem',
                                  border: '2px solid #fbbf24',
                                  overflow: 'hidden',
                                  marginBottom: '0.5rem'
                                }}
                              >
                                <div style={{
                                  padding: '0.375rem 0.5rem',
                                  backgroundColor: '#fef3c7',
                                  borderBottom: '1px solid #fbbf24',
                                  fontSize: '0.65rem',
                                  color: '#78350f',
                                  fontWeight: '700'
                                }}>
                                  Edit #{item.action.editHistory.length - editIdx} • {edit.timeDiff?.toFixed(1)}s after
                                </div>

                                {/* Description Comparison with Highlighting */}
                                {edit.oldDescription && edit.newDescription && edit.oldDescription !== edit.newDescription && (
                                  <div style={{ padding: '0.75rem 0.5rem', backgroundColor: '#fffbeb', borderBottom: '1px solid #fbbf24' }}>
                                    <div style={{ fontSize: '0.65rem', fontWeight: '700', color: '#78350f', marginBottom: '0.5rem', textTransform: 'uppercase' }}>
                                      Description Changed:
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                      <div style={{
                                        padding: '0.5rem',
                                        backgroundColor: '#fef2f2',
                                        borderRadius: '0.375rem',
                                        border: '1px solid #fecaca',
                                        fontSize: '0.75rem',
                                        lineHeight: '1.5'
                                      }}>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#991b1b', marginBottom: '0.25rem' }}>
                                          BEFORE:
                                        </div>
                                        <div style={{ color: '#7f1d1d' }}>
                                          {highlightTextDiff(edit.oldDescription, edit.newDescription).old}
                                        </div>
                                      </div>
                                      <div style={{
                                        padding: '0.5rem',
                                        backgroundColor: '#f0fdf4',
                                        borderRadius: '0.375rem',
                                        border: '1px solid #bbf7d0',
                                        fontSize: '0.75rem',
                                        lineHeight: '1.5'
                                      }}>
                                        <div style={{ fontSize: '0.625rem', fontWeight: '700', color: '#166534', marginBottom: '0.25rem' }}>
                                          AFTER:
                                        </div>
                                        <div style={{ color: '#14532d' }}>
                                          {highlightTextDiff(edit.oldDescription, edit.newDescription).new}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {edit.fieldsChanged && edit.fieldsChanged.length > 0 && (
                                  <div>
                                    {edit.fieldsChanged.map((field, fieldIdx) => (
                                      <div
                                        key={fieldIdx}
                                        style={{
                                          display: 'grid',
                                          gridTemplateColumns: '80px 1fr 1fr',
                                          gap: '0.5rem',
                                          padding: '0.375rem 0.5rem',
                                          backgroundColor: fieldIdx % 2 === 0 ? '#fafafa' : 'white',
                                          fontSize: '0.7rem'
                                        }}
                                      >
                                        <div style={{
                                          fontWeight: '700',
                                          color: '#3b82f6',
                                          textTransform: 'uppercase',
                                          fontSize: '0.625rem'
                                        }}>
                                          {field}
                                        </div>
                                        <div style={{
                                          padding: '0.125rem 0.375rem',
                                          backgroundColor: '#fee',
                                          borderRadius: '0.25rem',
                                          border: '1px solid #fcc',
                                          color: '#991b1b',
                                          fontSize: '0.65rem'
                                        }}>
                                          <span style={{ opacity: 0.6 }}>OLD: </span>
                                          <span style={{ textDecoration: 'line-through' }}>
                                            {edit.oldData?.[field]?.toString() || '(empty)'}
                                          </span>
                                        </div>
                                        <div style={{
                                          padding: '0.125rem 0.375rem',
                                          backgroundColor: '#efe',
                                          borderRadius: '0.25rem',
                                          border: '1px solid #cfc',
                                          color: '#166534',
                                          fontSize: '0.65rem'
                                        }}>
                                          <span style={{ opacity: 0.6 }}>NEW: </span>
                                          {edit.newData?.[field]?.toString() || '(empty)'}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </SwipeableCard>
              )
            )}
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <nav style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'white',
        borderTop: '2px solid #e2e8f0',
        display: 'flex',
        justifyContent: 'space-around',
        padding: '0.75rem',
        zIndex: 100
      }}>
        <button
          onClick={() => setViewMode('live')}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: '700',
            fontSize: '0.875rem',
            cursor: 'pointer',
            backgroundColor: viewMode === 'live' ? '#3b82f6' : 'transparent',
            color: viewMode === 'live' ? 'white' : '#64748b',
            transition: 'all 0.2s'
          }}
        >
          Live
        </button>
        <button
          onClick={() => setViewMode('editor')}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: '700',
            fontSize: '0.875rem',
            cursor: 'pointer',
            backgroundColor: viewMode === 'editor' ? '#3b82f6' : 'transparent',
            color: viewMode === 'editor' ? 'white' : '#64748b',
            transition: 'all 0.2s'
          }}
        >
          Editor
        </button>
        <button
          onClick={() => setViewMode('changes')}
          style={{
            flex: 1,
            padding: '0.75rem',
            border: 'none',
            borderRadius: '0.5rem',
            fontWeight: '700',
            fontSize: '0.875rem',
            cursor: 'pointer',
            backgroundColor: viewMode === 'changes' ? '#3b82f6' : 'transparent',
            color: viewMode === 'changes' ? 'white' : '#64748b',
            transition: 'all 0.2s'
          }}
        >
          Changes
        </button>
      </nav>

      {/* CSS Animations */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

export default NBAPlayByPlay;
