// frontend/src/App.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import './App.css';
import {
  LayoutDashboard,
  Users,
  RefreshCw,
  GitCompare,
  Link2,
  Settings as SettingsIcon,
  Menu,
  X,
  Search,
  ChevronRight,
  Activity,
  Dribbble,
  LogOut
} from 'lucide-react';
import TeamManager from './components/TeamManager';
import FetchDashboard from './components/FetchDashboard';
import DataComparison from './components/DataComparison';
import FieldMappings from './components/FieldMappings';
import NBASchedule from './components/NBASchedule';
import Dashboard from './components/Dashboard';
import Settings from './components/Settings';
import SearchResults from './components/SearchResults';

// Configure axios defaults
const apiUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
axios.defaults.baseURL = apiUrl.replace(/\/$/, '') + '/api';

function App() {
  const [activeSection, setActiveSection] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState({ teams: [], players: [], schedule: [], totalResults: 0 });
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const searchTimeoutRef = useRef(null);
  const [systemStatus, setSystemStatus] = useState('online'); // 'online', 'offline', 'syncing'
  const [systemStats, setSystemStats] = useState(null);
  const [connections, setConnections] = useState(null);
  const [isElectron] = useState(() => window.electronAPI?.isElectron || false);

  // Navigation items with Lucide icons
  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      badge: null
    },
    {
      id: 'fetch',
      label: 'Data Collection',
      icon: RefreshCw,
      badge: null
    },
    {
      id: 'teams',
      label: 'Team Management',
      icon: Users,
      badge: teams.length > 0 ? teams.length.toString() : null
    },
    {
      id: 'compare',
      label: 'Data Comparison',
      icon: GitCompare,
      badge: null
    },
    {
      id: 'mappings',
      label: 'Field Mappings',
      icon: Link2,
      badge: null
    },
    {
      id: 'nba',
      label: 'NBA Drift',
      icon: Dribbble,
      badge: null
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: SettingsIcon,
      badge: null
    }
  ];

  // Load initial data on mount
  useEffect(() => {
    loadTeams();
    loadStats();
    loadSystemStats();
  }, []);

  // Check system status periodically
  useEffect(() => {
    const checkSystemStatus = async () => {
      try {
        await axios.get('/system/health').catch(err => {
          // If no health endpoint exists, check teams endpoint
          return axios.get('/teams');
        });
        setSystemStatus('online');
      } catch (error) {
        setSystemStatus('offline');
      }
    };

    checkSystemStatus();
    const interval = setInterval(checkSystemStatus, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const loadTeams = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/teams');
      setTeams(response.data.teams || []);
    } catch (error) {
      console.error('Error loading teams:', error.response?.data || error.message || error);
      setSystemStatus('offline');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await axios.get('/data/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error.response?.data || error.message || error);
    }
  };

  const loadSystemStats = async () => {
    try {
      const [statsRes, connectionsRes] = await Promise.all([
        axios.get('/system/stats').catch(() => null),
        axios.get('/system/connections').catch(() => null)
      ]);
      if (statsRes) setSystemStats(statsRes.data);
      if (connectionsRes) setConnections(connectionsRes.data);
    } catch (error) {
      console.error('Error loading system stats:', error);
    }
  };

  // Debounced search handler
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);

    // Clear existing timeout
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    // Don't search if query is too short
    if (!query || query.length < 2) {
      setSearchResults({ teams: [], players: [], schedule: [], totalResults: 0 });
      setShowSearchResults(false);
      return;
    }

    // Debounce the search
    searchTimeoutRef.current = setTimeout(async () => {
      setSearchLoading(true);
      setShowSearchResults(true);
      try {
        const response = await axios.get('/search', { params: { q: query } });
        if (response.data.success) {
          setSearchResults({
            teams: response.data.teams || [],
            players: response.data.players || [],
            schedule: response.data.schedule || [],
            totalResults: response.data.totalResults || 0
          });
        }
      } catch (error) {
        console.error('Search error:', error);
        setSearchResults({ teams: [], players: [], schedule: [], totalResults: 0 });
      } finally {
        setSearchLoading(false);
      }
    }, 300); // 300ms debounce
  }, []);

  // Handle search result selection
  const handleSearchResultSelect = useCallback((result) => {
    setShowSearchResults(false);
    setSearchQuery('');

    // Navigate based on result type
    if (result.type === 'team') {
      setActiveSection('teams');
    } else if (result.type === 'player') {
      setActiveSection('teams');
    } else if (result.type === 'schedule') {
      setActiveSection('fetch');
    }
  }, []);

  // Cleanup search timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, []);

  const handleRefreshAll = () => {
    loadStats();
    loadSystemStats();
  };

  const handleReloadAll = () => {
    loadTeams();
    loadStats();
    loadSystemStats();
  };

  const handleLogout = async () => {
    if (window.electronAPI?.logout) {
      try {
        await window.electronAPI.logout();
      } catch (error) {
        console.error('Logout error:', error);
      }
    }
  };

  const renderContent = () => {
    switch (activeSection) {
      case 'dashboard':
        return (
          <Dashboard
            teams={teams}
            stats={stats}
            onRefresh={handleRefreshAll}
            onNavigate={setActiveSection}
          />
        );
      case 'teams':
        return <TeamManager teams={teams} onTeamsUpdate={loadTeams} />;
      case 'fetch':
        return <FetchDashboard teams={teams} />;
      case 'compare':
        return <DataComparison teams={teams} />;
      case 'mappings':
        return <FieldMappings teams={teams} />;
      case 'nba':
        return <NBASchedule />;
      case 'settings':
        return (
          <Settings
            teams={teams}
            systemStats={systemStats}
            connections={connections}
            onRefresh={handleRefreshAll}
            onReload={handleReloadAll}
            setSystemStatus={setSystemStatus}
          />
        );
      default:
        return (
          <Dashboard
            teams={teams}
            stats={stats}
            onRefresh={handleRefreshAll}
            onNavigate={setActiveSection}
          />
        );
    }
  };

  return (
    <div className="app-container">
      {/* Top Header */}
      <header className="top-header">
        <div className="header-left">
          <button
            className="menu-toggle"
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
          >
            {isSidebarCollapsed ? <Menu size={20} /> : <X size={20} />}
          </button>
          <div className="logo">
            <Activity className="logo-icon" size={24} />
            <span className="logo-text">SportsData Pro</span>
          </div>
        </div>

        <div className="header-center">
          <div className="search-bar">
            <Search size={18} className="search-icon" />
            <input
              type="text"
              placeholder="Search teams, players, or data..."
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="header-right">
          <div className="header-actions">
            <button
              className="icon-button"
              title="Refresh Data"
              onClick={() => {
                setSystemStatus('syncing');
                Promise.all([loadTeams(), loadStats(), loadSystemStats()]).then(() => {
                  setSystemStatus('online');
                }).catch(() => {
                  setSystemStatus('offline');
                });
              }}
            >
              <RefreshCw size={18} className={systemStatus === 'syncing' ? 'spinning' : ''} />
            </button>

            <div className="divider"></div>

            <button
              className="icon-button"
              title="Settings"
              onClick={() => setActiveSection('settings')}
            >
              <SettingsIcon size={18} />
            </button>

            {isElectron && (
              <>
                <div className="divider"></div>
                <button
                  className="icon-button logout-button"
                  title="Logout"
                  onClick={handleLogout}
                >
                  <LogOut size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Search Results Overlay */}
      {showSearchResults && (
        <SearchResults
          results={searchResults}
          loading={searchLoading}
          query={searchQuery}
          onClose={() => {
            setShowSearchResults(false);
            setSearchQuery('');
          }}
          onSelectResult={handleSearchResultSelect}
        />
      )}

      <div className="main-layout">
        {/* Sidebar Navigation */}
        <aside className={`sidebar ${isSidebarCollapsed ? 'collapsed' : ''}`}>
          <nav className="sidebar-nav">
            {navItems.map(item => {
              const IconComponent = item.icon;
              return (
                <button
                  key={item.id}
                  className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(item.id)}
                  title={isSidebarCollapsed ? item.label : ''}
                >
                  <IconComponent className="nav-icon" size={20} />
                  {!isSidebarCollapsed && (
                    <>
                      <span className="nav-label">{item.label}</span>
                      {item.badge && (
                        <span className="nav-badge">{item.badge}</span>
                      )}
                    </>
                  )}
                  {!isSidebarCollapsed && activeSection === item.id && (
                    <ChevronRight className="nav-indicator" size={16} />
                  )}
                </button>
              );
            })}
          </nav>

          {!isSidebarCollapsed && (
            <div className="sidebar-footer">
              <div
                className="system-status clickable"
                onClick={() => window.open(`${axios.defaults.baseURL?.replace('/api', '')}/api/system/dashboard`, '_blank')}
                title="Open Health Dashboard"
              >
                <div className="status-row">
                  <span className="status-label">System Status</span>
                  <div className={`status-indicator ${systemStatus}`}>
                    <span className="status-dot"></span>
                    <span className="status-text">
                      {systemStatus === 'online' ? 'Online' :
                        systemStatus === 'syncing' ? 'Syncing' : 'Offline'}
                    </span>
                  </div>
                </div>
                <div className="status-stats">
                  <span>{teams.length} teams</span>
                  <span>•</span>
                  <span>{systemStats?.summary?.totalDocuments || 0} records</span>
                </div>
              </div>
            </div>
          )}
        </aside>

        {/* Main Content */}
        <main className="main-content">
          {loading && (
            <div className="loading-overlay">
              <div className="loading-spinner">
                <RefreshCw className="spinner-icon" size={32} />
              </div>
              <p>Loading...</p>
            </div>
          )}
          {renderContent()}
        </main>
      </div>
    </div>
  );
}

export default App;
