// frontend/src/components/ViewData.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useModal } from '../contexts/ModalContext';
import { 
  ChartBar, 
  Table, 
  Filter, 
  Search, 
  Download, 
  Trash2, 
  Calendar,
  Building2,
  Trophy,
  Package,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  Square,
  AlertCircle,
  FileText,
  Users,
  Clock,
  TrendingUp,
  Eye,
  Database,
  Activity,
  ExternalLink
} from 'lucide-react';

function ViewData({ teams }) {
  const { showAlert, showConfirm } = useModal();
  // Filter state
  const [filters, setFilters] = useState({
    league: '',
    conference: '',
    team: '',
    module: '',
    sport: '',
    dataType: 'roster',
    dateFrom: '',
    dateTo: '',
    validOnly: false
  });

  // Data state
  const [data, setData] = useState([]);
  const [allFilteredData, setAllFilteredData] = useState([]); // Store all filtered data for search
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState([]);
  const [selectedItems, setSelectedItems] = useState(new Set());
  
  // UI state - removed 'compare' from viewMode
  const [viewMode, setViewMode] = useState('summary');
  const [summaryViewType, setSummaryViewType] = useState('table'); // 'cards' or 'table'
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [collapsedLeagues, setCollapsedLeagues] = useState(new Set()); // Track collapsed leagues
  const [exporting, setExporting] = useState(false); // Track export state

  // Get unique values for filters
  const leagues = [...new Set(teams.map(t => t.league))].sort();
  const conferences = filters.league 
    ? [...new Set(teams.filter(t => t.league === filters.league).map(t => t.conference))].filter(Boolean).sort()
    : [];
  const filteredTeams = teams.filter(t => {
    if (filters.league && t.league !== filters.league) return false;
    if (filters.conference && t.conference !== filters.conference) return false;
    return true;
  });

  // Get filtered modules based on selected league
  const getFilteredModules = () => {
    const allModules = [
      { value: 'ncaa_football_roster', label: 'NCAA Football Roster', leagues: ['NCAA'] },
      { value: 'ncaa_football_schedule', label: 'NCAA Football Schedule', leagues: ['NCAA'] },
      { value: 'ncaa_football_stats', label: 'NCAA Football Stats', leagues: ['NCAA'] },
      { value: 'ncaa_mensBasketball_roster', label: 'NCAA Men\'s Basketball Roster', leagues: ['NCAA'] },
      { value: 'ncaa_mensBasketball_schedule', label: 'NCAA Men\'s Basketball Schedule', leagues: ['NCAA'] },
      { value: 'ncaa_mensBasketball_stats', label: 'NCAA Men\'s Basketball Stats', leagues: ['NCAA'] },
      { value: 'ncaa_womensBasketball_roster', label: 'NCAA Women\'s Basketball Roster', leagues: ['NCAA'] },
      { value: 'ncaa_womensBasketball_schedule', label: 'NCAA Women\'s Basketball Schedule', leagues: ['NCAA'] },
      { value: 'ncaa_womensBasketball_stats', label: 'NCAA Women\'s Basketball Stats', leagues: ['NCAA'] },
      { value: 'mlb_roster', label: 'MLB Roster', leagues: ['MLB'] },
      { value: 'mlb_schedule', label: 'MLB Schedule', leagues: ['MLB'] }
    ];

    if (!filters.league) return allModules;
    return allModules.filter(module => module.leagues.includes(filters.league));
  };

  const modules = getFilteredModules();

  const sports = ['football', 'mensBasketball', 'womensBasketball', 'baseball'];

  // Helper function to get team display name
  const getTeamDisplayName = (team) => {
    if (!team) return '';
    return `${team.teamName}${team.teamNickname ? ` ${team.teamNickname}` : ''}`;
  };

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Build base params for filters
      const baseParams = {};
      
      // Add all active filters
      if (filters.league && filters.league !== '') {
        baseParams.league = filters.league;
      }
      if (filters.conference && filters.conference !== '') {
        baseParams.conference = filters.conference;
      }
      if (filters.team && filters.team !== '') {
        baseParams.teamId = filters.team;
      }
      if (filters.module && filters.module !== '') {
        baseParams.moduleId = filters.module;
      }
      if (filters.sport && filters.sport !== '') {
        baseParams.sport = filters.sport;
      }
      if (filters.dataType && filters.dataType !== '') {
        baseParams.dataType = filters.dataType;
      }
      if (filters.dateFrom && filters.dateFrom !== '') {
        baseParams.dateFrom = filters.dateFrom;
      }
      if (filters.dateTo && filters.dateTo !== '') {
        baseParams.dateTo = filters.dateTo;
      }
      if (filters.validOnly === true) {
        baseParams.validOnly = true;
      }

      // If searching, fetch ALL data that matches filters, then filter client-side
      if (debouncedSearchTerm && debouncedSearchTerm.trim() !== '') {
        console.log('Searching for:', debouncedSearchTerm);
        
        // Fetch ALL data matching filters (up to a reasonable limit)
        const searchParams = {
          ...baseParams,
          limit: 10000, // Get all records for search
          skip: 0
        };
        
        const response = await axios.get('/data/scraped', { params: searchParams });
        const allData = Array.isArray(response.data) ? response.data : (response.data.data || []);
        
        // Apply search filter client-side
        const searchLower = debouncedSearchTerm.trim().toLowerCase();
        const searchResults = allData.filter(item => {
          const player = item.data || {};
          return (
            player.displayName?.toLowerCase().includes(searchLower) ||
            player.fullName?.toLowerCase().includes(searchLower) ||
            player.firstName?.toLowerCase().includes(searchLower) ||
            player.lastName?.toLowerCase().includes(searchLower) ||
            player.jersey?.toString().includes(debouncedSearchTerm.trim()) ||
            player.jerseyNumber?.toString().includes(debouncedSearchTerm.trim()) ||
            item.teamId?.toLowerCase().includes(searchLower) ||
            item.moduleId?.toLowerCase().includes(searchLower)
          );
        });
        
        console.log(`Found ${searchResults.length} results for "${debouncedSearchTerm}"`);
        
        // Store all search results
        setAllFilteredData(searchResults);
        
        // Paginate client-side through search results
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResults = searchResults.slice(startIndex, endIndex);
        
        setData(paginatedResults);
        setTotalCount(searchResults.length);
        
      } else {
        // Normal pagination without search - use server-side pagination
        const params = {
          ...baseParams,
          limit: pageSize,
          skip: (currentPage - 1) * pageSize,
          sortBy,
          sortOrder
        };

        console.log('Loading data with params:', params);

        const response = await axios.get('/data/scraped', { params });
        const responseData = Array.isArray(response.data) ? response.data : (response.data.data || []);
        
        setData(responseData);
        setAllFilteredData([]); // Clear search data
        
        // Get total count
        const totalFromHeader = response.headers['x-total-count'];
        const totalFromResponse = response.data.totalCount;
        
        if (totalFromHeader) {
          setTotalCount(parseInt(totalFromHeader));
        } else if (totalFromResponse) {
          setTotalCount(totalFromResponse);
        } else {
          // Try to get count separately
          const countParams = { ...baseParams };
          try {
            const countResponse = await axios.get('/data/scraped/count', { params: countParams });
            setTotalCount(countResponse.data.count || responseData.length);
          } catch {
            // Estimate based on current data
            if (responseData.length < pageSize) {
              setTotalCount((currentPage - 1) * pageSize + responseData.length);
            } else {
              setTotalCount(currentPage * pageSize + 1);
            }
          }
        }
      }
      
    } catch (error) {
      console.error('Error loading data:', error);
      setData([]);
      setAllFilteredData([]);
      setTotalCount(0);
    } finally {
      setLoading(false);
    }
  }, [filters, currentPage, sortBy, sortOrder, pageSize, debouncedSearchTerm]);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      // Stats endpoint doesn't need filters in summary view
      // It always shows all available data
      const response = await axios.get('/data/stats');
      setStats(response.data);
    } catch (error) {
      console.error('Error loading stats:', error);
      setStats([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to handle row click in summary view
  const handleSummaryRowClick = (teamId, moduleId) => {
    console.log(`Navigating to detail view with team: ${teamId}, module: ${moduleId}`);
    
    // Set filters for the selected team and module
    setFilters(prev => ({
      ...prev,
      team: teamId,
      module: moduleId,
      // Clear other filters to focus on this specific data
      league: '',
      conference: '',
      sport: '',
      dateFrom: '',
      dateTo: '',
      validOnly: false
    }));
    
    // Switch to detail view
    setViewMode('detail');
    
    // Reset pagination and search
    setCurrentPage(1);
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setAllFilteredData([]);
  };

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearchTerm]);

  // Load data when relevant state changes
  useEffect(() => {
    if (viewMode === 'summary') {
      loadStats();
    } else if (viewMode === 'detail') {
      loadData();
    }
  }, [viewMode, filters, sortBy, sortOrder, currentPage, debouncedSearchTerm, loadData, loadStats]);

  // Handlers
  const handleFilterChange = (key, value) => {
    setFilters(prev => {
      const newFilters = { ...prev, [key]: value };
      
      // Reset dependent filters
      if (key === 'league') {
        newFilters.conference = '';
        newFilters.team = '';
        // Reset module if it's not available for the new league
        const newModules = getFilteredModules(value);
        if (!newModules.find(m => m.value === prev.module)) {
          newFilters.module = '';
        }
      }
      if (key === 'conference') {
        newFilters.team = '';
      }
      
      return newFilters;
    });
    setCurrentPage(1);
  };

  const handleClearFilters = () => {
    setFilters({
      league: '',
      conference: '',
      team: '',
      module: '',
      sport: '',
      dataType: 'roster',
      dateFrom: '',
      dateTo: '',
      validOnly: false
    });
    setSearchTerm('');
    setDebouncedSearchTerm('');
    setAllFilteredData([]);
    setCurrentPage(1);
  };

  const handleExport = async (format = 'json') => {
    try {
      setExporting(true);
      
      let exportData = [];
      
      // If we're searching and have search results, use those
      if (debouncedSearchTerm && allFilteredData.length > 0) {
        exportData = allFilteredData;
        console.log(`Exporting ${exportData.length} search results`);
      } else {
        // Otherwise fetch all data with current filters
        const params = { 
          limit: 100000  // Get all records for export
        };
        
        // Add all active filters for export
        if (filters.league && filters.league !== '') {
          params.league = filters.league;
        }
        if (filters.conference && filters.conference !== '') {
          params.conference = filters.conference;
        }
        if (filters.team && filters.team !== '') {
          params.teamId = filters.team;
        }
        if (filters.module && filters.module !== '') {
          params.moduleId = filters.module;
        }
        if (filters.sport && filters.sport !== '') {
          params.sport = filters.sport;
        }
        if (filters.dataType && filters.dataType !== '') {
          params.dataType = filters.dataType;
        }
        if (filters.dateFrom && filters.dateFrom !== '') {
          params.dateFrom = filters.dateFrom;
        }
        if (filters.dateTo && filters.dateTo !== '') {
          params.dateTo = filters.dateTo;
        }
        if (filters.validOnly === true) {
          params.validOnly = true;
        }
        
        console.log('Fetching all data for export with params:', params);
        
        const response = await axios.get('/data/scraped', { params });
        exportData = Array.isArray(response.data) ? response.data : (response.data.data || []);
      }
      
      // Convert to appropriate format
      let blob;
      if (format === 'json') {
        const jsonString = JSON.stringify(exportData, null, 2);
        blob = new Blob([jsonString], { type: 'application/json' });
      } else {
        const csvContent = convertToCSV(exportData);
        blob = new Blob([csvContent], { type: 'text/csv' });
      }
      
      // Download the file
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const timestamp = new Date().toISOString().split('T')[0];
      const searchSuffix = debouncedSearchTerm ? `_search_${debouncedSearchTerm.replace(/\s+/g, '_')}` : '';
      a.download = `data_export_${timestamp}${searchSuffix}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setExporting(false);
      console.log(`Successfully exported ${exportData.length} records as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Error exporting data:', error);
      await showAlert('Failed to export data. Please try again.', 'Notice', 'info');
      setExporting(false);
    }
  };

  // Helper function to convert data to CSV
  const convertToCSV = (data) => {
    if (!data || data.length === 0) {
      return 'No data to export';
    }

    console.log('Converting', data.length, 'records to CSV'); // Debug log

    // Extract headers from the first item
    const headers = [
      'Team ID',
      'Module ID', 
      'Player Name',
      'Full Name',
      'Jersey',
      'Position',
      'Height',
      'Weight',
      'Year',
      'Hometown',
      'High School',
      'Valid',
      'Updated At'
    ];

    // Convert data to CSV rows
    const rows = data.map(item => {
      const player = item.data || {};
      return [
        item.teamId || '',
        item.moduleId || '',
        player.displayName || '',
        player.fullName || '',
        player.jersey || player.jerseyNumber || '',
        player.position || '',
        player.height || '',
        player.weight || '',
        player.year || player.experience?.years || '',
        player.hometown?.city || '',
        player.highSchool || '',
        item.validation?.isValid ? 'Yes' : 'No',
        item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : ''
      ].map(value => {
        // Escape values that contain commas or quotes
        const stringValue = String(value || '');
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',');
    });

    // Combine headers and rows
    const csvContent = [headers.join(','), ...rows].join('\n');
    console.log('CSV generated with', rows.length, 'rows'); // Debug log
    
    return csvContent;
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) {
      await showAlert('No items selected', 'Notice', 'info');
      return;
    }
    
    if (!window.confirm(`Are you sure you want to delete ${selectedItems.size} items? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await axios.delete('/data/bulk', {
        data: { ids: Array.from(selectedItems) }
      });
      
      setSelectedItems(new Set());
      
      // If searching, remove deleted items from search results
      if (debouncedSearchTerm && allFilteredData.length > 0) {
        const deletedIds = Array.from(selectedItems);
        const updatedSearchResults = allFilteredData.filter(
          item => !deletedIds.includes(item._id)
        );
        setAllFilteredData(updatedSearchResults);
        setTotalCount(updatedSearchResults.length);
        
        // Re-paginate the updated results
        const startIndex = (currentPage - 1) * pageSize;
        const endIndex = startIndex + pageSize;
        const paginatedResults = updatedSearchResults.slice(startIndex, endIndex);
        setData(paginatedResults);
      } else {
        // Normal reload for non-search mode
        if (viewMode === 'detail') {
          loadData();
        }
      }
      
      console.log(`Successfully deleted ${selectedItems.size} items`);
    } catch (error) {
      console.error('Error deleting items:', error);
      await showAlert('Failed to delete items. Please try again.', 'Notice', 'info');
    }
  };

  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return new Date(date).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (error) {
      return '-';
    }
  };

  // Data display and pagination logic
  const displayData = data;
  
  // Calculate pagination based on whether we're searching or not
  const isSearching = debouncedSearchTerm && debouncedSearchTerm.trim() !== '';
  const totalPages = Math.ceil(totalCount / pageSize) || 1;
  const hasNextPage = isSearching 
    ? (currentPage * pageSize < totalCount)  // For search, check against total search results
    : (data.length === pageSize || currentPage < totalPages);  // For normal, check if full page returned
  const hasPrevPage = currentPage > 1;

  return (
    <div className="view-data-container">
      <div className="view-header">
        <div className="header-title-section">
          <h2><Database className="inline-icon" /> Data Browser</h2>
          <p className="header-subtitle">Explore and manage your collected sports data</p>
        </div>
        
        <div className="view-controls">
          <div className="view-mode-toggle">
            <button 
              className={viewMode === 'summary' ? 'active' : ''}
              onClick={() => {
                setViewMode('summary');
                setSearchTerm('');
                setDebouncedSearchTerm('');
                setAllFilteredData([]);
              }}
            >
              <ChartBar size={16} />
              Summary
            </button>
            <button 
              className={viewMode === 'detail' ? 'active' : ''}
              onClick={() => {
                setViewMode('detail');
              }}
            >
              <Table size={16} />
              Detail
            </button>
          </div>

          <div className="export-buttons">
            <button 
              className="btn-secondary btn-export"
              onClick={() => handleExport('json')}
              disabled={exporting}
              title="Export as JSON"
            >
              {exporting ? (
                <>
                  <div className="spinner-small"></div>
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <Download size={16} />
                  <span>Export JSON</span>
                </>
              )}
            </button>
            <button 
              className="btn-secondary btn-export"
              onClick={() => handleExport('csv')}
              disabled={exporting}
              title="Export as CSV"
            >
              {exporting ? (
                <>
                  <div className="spinner-small"></div>
                  <span>Exporting...</span>
                </>
              ) : (
                <>
                  <FileText size={16} />
                  <span>Export CSV</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Only show filters in detail view */}
      {viewMode === 'detail' && (
        <div className="filter-container">
          <div className="filter-header">
            <h3>
              <Filter size={16} /> 
              Filters
              {(() => {
                let activeCount = 0;
                if (filters.league) activeCount++;
                if (filters.conference) activeCount++;
                if (filters.team) activeCount++;
                if (filters.module) activeCount++;
                if (filters.sport) activeCount++;
                if (filters.dateFrom) activeCount++;
                if (filters.dateTo) activeCount++;
                if (filters.validOnly) activeCount++;
                
                return activeCount > 0 ? (
                  <span className="active-filter-indicator">{activeCount} Active</span>
                ) : null;
              })()}
              {debouncedSearchTerm && (
                <span className="search-indicator">
                  <Search size={12} /> Searching
                </span>
              )}
            </h3>
            <button 
              className="btn-text"
              onClick={handleClearFilters}
            >
              Clear All
            </button>
          </div>

          <div className="filter-row">
            <div className="filter-group">
              <label><Trophy size={14} /> League</label>
              <select 
                value={filters.league}
                onChange={(e) => handleFilterChange('league', e.target.value)}
              >
                <option value="">All Leagues</option>
                {leagues.map(league => (
                  <option key={league} value={league}>{league}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label><Building2 size={14} /> Conference</label>
              <select 
                value={filters.conference}
                onChange={(e) => handleFilterChange('conference', e.target.value)}
                disabled={!filters.league}
              >
                <option value="">All Conferences</option>
                {conferences.map(conf => (
                  <option key={conf} value={conf}>{conf}</option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label><Users size={14} /> Team</label>
              <select 
                value={filters.team}
                onChange={(e) => handleFilterChange('team', e.target.value)}
              >
                <option value="">All Teams</option>
                {filteredTeams.map(team => (
                  <option key={team.teamId} value={team.teamId}>
                    {getTeamDisplayName(team)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label><Package size={14} /> Module</label>
              <select 
                value={filters.module}
                onChange={(e) => handleFilterChange('module', e.target.value)}
              >
                <option value="">All Modules</option>
                {modules.map(module => (
                  <option key={module.value} value={module.value}>
                    {module.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label><Activity size={14} /> Sport</label>
              <select 
                value={filters.sport}
                onChange={(e) => handleFilterChange('sport', e.target.value)}
              >
                <option value="">All Sports</option>
                <option value="football">Football</option>
                <option value="mensBasketball">Men's Basketball</option>
                <option value="womensBasketball">Women's Basketball</option>
                <option value="baseball">Baseball</option>
              </select>
            </div>

            <div className="filter-group">
              <label><Calendar size={14} /> From Date</label>
              <input 
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label><Calendar size={14} /> To Date</label>
              <input 
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>

            <div className="filter-group">
              <div className="checkbox-wrapper">
                <input 
                  type="checkbox"
                  id="validOnly"
                  checked={filters.validOnly}
                  onChange={(e) => {
                    handleFilterChange('validOnly', e.target.checked);
                  }}
                />
                <label htmlFor="validOnly" className="checkbox-label">
                  {filters.validOnly ? <CheckSquare size={16} /> : <Square size={16} />}
                  Valid Data Only
                </label>
              </div>
            </div>
          </div>

          <div className="search-row">
            <div className="search-input-wrapper">
              <Search size={18} className="search-icon" />
              <input
                type="text"
                placeholder="Search across all filtered data (name, jersey, team)..."
                value={searchTerm}
                onChange={(e) => {
                  console.log('Search term:', e.target.value);
                  setSearchTerm(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setSearchTerm('');
                    setDebouncedSearchTerm('');
                    setAllFilteredData([]);
                  }
                }}
                className="search-input-large"
              />
              {searchTerm && (
                <button 
                  className="clear-search-btn"
                  onClick={() => {
                    setSearchTerm('');
                    setDebouncedSearchTerm('');
                    setAllFilteredData([]);
                  }}
                  title="Clear search"
                >
                  ×
                </button>
              )}
            </div>
            {searchTerm && (
              <div className="search-status">
                {searchTerm !== debouncedSearchTerm ? (
                  <span className="search-loading">Searching...</span>
                ) : totalCount > 0 ? (
                  <span className="search-results">
                    Found <strong>{totalCount}</strong> result{totalCount !== 1 ? 's' : ''} 
                    {` for "${debouncedSearchTerm}"`}
                    {totalCount > pageSize && (
                      <span className="search-pagination-hint">
                        {' '}(showing {Math.min(pageSize, data.length)} per page)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="search-no-results">
                    No results found for "{debouncedSearchTerm}"
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content based on view mode */}
      <div className="view-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>{debouncedSearchTerm ? 'Searching data...' : 'Loading data...'}</p>
          </div>
        ) : (
          <>
            {viewMode === 'summary' && (
              <SummaryView 
                stats={stats} 
                teams={teams} 
                viewType={summaryViewType}
                setViewType={setSummaryViewType}
                collapsedLeagues={collapsedLeagues}
                setCollapsedLeagues={setCollapsedLeagues}
                onRowClick={handleSummaryRowClick}
              />
            )}
            {viewMode === 'detail' && (
              <DetailView 
                data={displayData}
                selectedItems={selectedItems}
                setSelectedItems={setSelectedItems}
                handleBulkDelete={handleBulkDelete}
                teams={teams}
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                setCurrentPage={setCurrentPage}
                sortBy={sortBy}
                setSortBy={setSortBy}
                sortOrder={sortOrder}
                setSortOrder={setSortOrder}
                hasNextPage={hasNextPage}
                hasPrevPage={hasPrevPage}
                isSearching={isSearching}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Enhanced Summary View Component with Clickable Rows
function SummaryView({ stats, teams, viewType, setViewType, collapsedLeagues, setCollapsedLeagues, onRowClick }) {
  if (!stats || stats.length === 0) {
    return (
      <div className="empty-state">
        <AlertCircle size={48} className="empty-icon" />
        <h3>No Data Available</h3>
        <p>Start collecting data to see summary statistics</p>
      </div>
    );
  }

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.teamId === teamId);
    return team ? `${team.teamName} ${team.teamNickname || ''}` : teamId;
  };

  const getDataQualityClass = (percentage) => {
    if (percentage > 80) return 'quality-high';
    if (percentage > 50) return 'quality-medium';
    return 'quality-low';
  };

  // Group stats by league
  const statsByLeague = stats.reduce((acc, stat) => {
    const league = stat._id?.league || 'Unknown';
    if (!acc[league]) acc[league] = [];
    acc[league].push(stat);
    return acc;
  }, {});

  const toggleLeague = (league) => {
    const newCollapsed = new Set(collapsedLeagues);
    if (newCollapsed.has(league)) {
      newCollapsed.delete(league);
    } else {
      newCollapsed.add(league);
    }
    setCollapsedLeagues(newCollapsed);
  };

  return (
    <div className="summary-view">
      {/* View Type Toggle */}
      <div className="summary-view-header">
        <h3>Data Summary</h3>
        <div className="view-type-toggle">
          <button 
            className={viewType === 'table' ? 'active' : ''}
            onClick={() => setViewType('table')}
          >
            <Table size={14} />
            Table
          </button>
          <button 
            className={viewType === 'cards' ? 'active' : ''}
            onClick={() => setViewType('cards')}
          >
            <ChartBar size={14} />
            Cards
          </button>
        </div>
      </div>

      {viewType === 'table' ? (
        // Table View with Clickable Rows
        <div className="summary-tables-container">
          {Object.entries(statsByLeague).map(([league, leagueStats]) => (
            <div key={league} className="league-table-section">
              <div className="league-table-header" onClick={() => toggleLeague(league)}>
                <div className="league-title">
                  {collapsedLeagues.has(league) ? 
                    <ChevronRight size={20} /> : 
                    <ChevronDown size={20} />
                  }
                  <Trophy size={18} />
                  <span>{league}</span>
                  <span className="league-badge">{leagueStats.length} teams</span>
                </div>
              </div>
              
              {!collapsedLeagues.has(league) && (
                <div className="summary-table-wrapper">
                  <table className="summary-table">
                    <thead>
                      <tr>
                        <th>Team</th>
                        <th>Module</th>
                        <th>Total Records</th>
                        <th>Valid Records</th>
                        <th>Completeness</th>
                        <th>Last Updated</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {leagueStats.map((stat, index) => {
                        const completeness = Math.round(((stat.validCount || 0) / stat.count) * 100);
                        return (
                          <tr 
                            key={index}
                            className="clickable-row"
                            onClick={() => onRowClick(stat._id?.teamId, stat._id?.moduleId)}
                            title="Click to view details"
                          >
                            <td className="team-name-cell">{getTeamName(stat._id?.teamId)}</td>
                            <td className="module-cell">{stat._id?.moduleId?.replace(/_/g, ' ') || '-'}</td>
                            <td>{stat.count}</td>
                            <td>{stat.validCount || 0}</td>
                            <td>
                              <div className="completeness-cell">
                                <span className={`quality-badge ${getDataQualityClass(completeness)}`}>
                                  {completeness}%
                                </span>
                                <div className="mini-progress">
                                  <div 
                                    className={`mini-progress-fill ${getDataQualityClass(completeness)}`}
                                    style={{ width: `${completeness}%` }}
                                  ></div>
                                </div>
                              </div>
                            </td>
                            <td>{stat.lastUpdated ? new Date(stat.lastUpdated).toLocaleDateString() : '-'}</td>
                            <td className="action-cell">
                              <ExternalLink size={16} className="row-action-icon" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        // Card View with Click Functionality
        Object.entries(statsByLeague).map(([league, leagueStats]) => (
          <div key={league} className="league-section">
            <div className="league-header" onClick={() => toggleLeague(league)}>
              <div className="league-header-left">
                {collapsedLeagues.has(league) ? 
                  <ChevronRight size={20} /> : 
                  <ChevronDown size={20} />
                }
                <h3><Trophy size={18} /> {league}</h3>
              </div>
              <span className="league-count">{leagueStats.length} teams</span>
            </div>
            
            {!collapsedLeagues.has(league) && (
              <div className="stats-grid">
                {leagueStats.map((stat) => {
                  const completeness = Math.round(((stat.validCount || 0) / stat.count) * 100);
                  return (
                    <div 
                      key={`${stat._id?.teamId}-${stat._id?.moduleId}`} 
                      className="stat-card clickable-card"
                      onClick={() => onRowClick(stat._id?.teamId, stat._id?.moduleId)}
                      title="Click to view details"
                    >
                      <div className="stat-card-header">
                        <h4>{getTeamName(stat._id?.teamId)}</h4>
                        <span className={`quality-badge ${getDataQualityClass(completeness)}`}>
                          {completeness}% Complete
                        </span>
                      </div>
                      
                      <div className="stat-details">
                        <div className="stat-row">
                          <span className="stat-label"><Users size={14} /> Total Records</span>
                          <span className="stat-value">{stat.count}</span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-label"><CheckSquare size={14} /> Valid Records</span>
                          <span className="stat-value">{stat.validCount || 0}</span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-label"><Package size={14} /> Module</span>
                          <span className="stat-value stat-module">{stat._id?.moduleId?.replace(/_/g, ' ') || '-'}</span>
                        </div>
                        <div className="stat-row">
                          <span className="stat-label"><Clock size={14} /> Last Updated</span>
                          <span className="stat-value">{stat.lastUpdated ? new Date(stat.lastUpdated).toLocaleDateString() : '-'}</span>
                        </div>
                      </div>

                      <div className="stat-progress">
                        <div className="progress-bar">
                          <div 
                            className={`progress-fill ${getDataQualityClass(completeness)}`}
                            style={{ width: `${completeness}%` }}
                          ></div>
                        </div>
                      </div>
                      
                      <div className="card-action-hint">
                        <ExternalLink size={14} />
                        <span>View Details</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// Detail View Component (unchanged)
function DetailView({ 
  data, 
  selectedItems, 
  setSelectedItems, 
  handleBulkDelete, 
  teams,
  currentPage,
  totalPages,
  totalCount,
  setCurrentPage,
  sortBy,
  setSortBy,
  sortOrder,
  setSortOrder,
  hasNextPage,
  hasPrevPage,
  isSearching
}) {
  // Handle empty data
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <AlertCircle size={48} className="empty-icon" />
        <h3>No Data Found</h3>
        <p>Try adjusting your filters or search terms</p>
      </div>
    );
  }

  const handleSelectAll = () => {
    if (selectedItems.size === data.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(data.map(item => item._id)));
    }
  };

  const handleToggleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const getTeamName = (teamId) => {
    const team = teams.find(t => t.teamId === teamId);
    return team ? `${team.teamName} ${team.teamNickname || ''}` : teamId;
  };

  const getSortIcon = (field) => {
    if (sortBy !== field) return <ChevronDown size={14} className="sort-icon inactive" />;
    return sortOrder === 'asc' ? 
      <TrendingUp size={14} className="sort-icon active" /> : 
      <ChevronDown size={14} className="sort-icon active" />;
  };

  console.log('DetailView rendering with', data.length, 'records'); // Debug log

  return (
    <div className="detail-view">
      <div className="detail-toolbar">
        <div className="selection-controls">
          <button 
            className="checkbox-button"
            onClick={handleSelectAll}
          >
            {selectedItems.size === data.length && data.length > 0 ? 
              <CheckSquare size={18} /> : 
              <Square size={18} />
            }
          </button>
          <span className="selection-count">{selectedItems.size} selected</span>
          {selectedItems.size > 0 && (
            <button 
              className="btn-danger btn-small"
              onClick={handleBulkDelete}
            >
              <Trash2 size={14} />
              Delete Selected
            </button>
          )}
        </div>
        
        <div className="pagination">
          <button 
            disabled={!hasPrevPage}
            onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
            className="pagination-btn"
            title="Previous Page"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="pagination-info">
            Page <strong>{currentPage}</strong>
            {totalPages > 0 && <> of <strong>{totalPages}</strong></>}
            {totalCount > 0 && (
              <span className="pagination-count"> 
                ({totalCount.toLocaleString()} {isSearching ? 'filtered' : 'total'} records)
              </span>
            )}
          </span>
          <button 
            disabled={!hasNextPage}
            onClick={() => setCurrentPage(currentPage + 1)}
            className="pagination-btn"
            title="Next Page"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div className="data-table-wrapper">
        {/* Detect if this is schedule data */}
        {data.length > 0 && data[0].dataType === 'schedule' ? (
          // Schedule Table
          <ScheduleDataTable
            data={data}
            selectedItems={selectedItems}
            setSelectedItems={setSelectedItems}
            handleSelectAll={handleSelectAll}
            handleToggleSort={handleToggleSort}
            getSortIcon={getSortIcon}
            getTeamName={getTeamName}
          />
        ) : (
          // Roster/Player Table
          <table className="data-table">
            <thead>
              <tr>
                <th width="40">
                  <button
                    className="checkbox-button"
                    onClick={handleSelectAll}
                  >
                    {selectedItems.size === data.length && data.length > 0 ?
                      <CheckSquare size={16} /> :
                      <Square size={16} />
                    }
                  </button>
                </th>
                <th onClick={() => handleToggleSort('teamId')} className="sortable">
                  Team {getSortIcon('teamId')}
                </th>
                <th onClick={() => handleToggleSort('data.displayName')} className="sortable">
                  Player {getSortIcon('data.displayName')}
                </th>
                <th>Jersey</th>
                <th onClick={() => handleToggleSort('data.position')} className="sortable">
                  Position {getSortIcon('data.position')}
                </th>
                <th onClick={() => handleToggleSort('data.year')} className="sortable">
                  Year {getSortIcon('data.year')}
                </th>
                <th>Height</th>
                <th>Weight</th>
                <th onClick={() => handleToggleSort('updatedAt')} className="sortable">
                  Updated {getSortIcon('updatedAt')}
                </th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => {
                const player = item.data;
                const isSelected = selectedItems.has(item._id);

                return (
                  <tr key={item._id} className={isSelected ? 'selected' : ''}>
                    <td>
                      <button
                        className="checkbox-button"
                        onClick={() => {
                          const newSelection = new Set(selectedItems);
                          if (isSelected) {
                            newSelection.delete(item._id);
                          } else {
                            newSelection.add(item._id);
                          }
                          setSelectedItems(newSelection);
                        }}
                      >
                        {isSelected ?
                          <CheckSquare size={16} /> :
                          <Square size={16} />
                        }
                      </button>
                    </td>
                    <td>{getTeamName(item.teamId)}</td>
                    <td className="player-name">
                      <div>
                        <div style={{ fontWeight: 500 }}>
                          {player.fullName || player.displayName || player.name || '-'}
                        </div>
                        {player.abbreviatedName && player.abbreviatedName !== player.fullName && (
                          <div style={{ fontSize: '0.85em', color: '#666', marginTop: '2px' }}>
                            {player.abbreviatedName}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>{player.jersey || player.jerseyNumber || '-'}</td>
                    <td>{player.position || '-'}</td>
                    <td>{player.year || player.experience?.years || '-'}</td>
                    <td>{player.height || '-'}</td>
                    <td>{player.weight ? `${player.weight} lbs` : '-'}</td>
                    <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn-icon-small"
                        title="View Details"
                      >
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
              );
            })}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}

// Schedule Data Table Component
function ScheduleDataTable({
  data,
  selectedItems,
  setSelectedItems,
  handleSelectAll,
  handleToggleSort,
  getSortIcon,
  getTeamName
}) {
  const formatGameDate = (dateString) => {
    if (!dateString) return 'TBD';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <table className="data-table schedule-data-table">
      <thead>
        <tr>
          <th width="40">
            <button
              className="checkbox-button"
              onClick={handleSelectAll}
            >
              {selectedItems.size === data.length && data.length > 0 ?
                <CheckSquare size={16} /> :
                <Square size={16} />
              }
            </button>
          </th>
          <th onClick={() => handleToggleSort('teamId')} className="sortable">
            Team {getSortIcon('teamId')}
          </th>
          <th onClick={() => handleToggleSort('data.date')} className="sortable">
            Date {getSortIcon('data.date')}
          </th>
          <th>Time</th>
          <th onClick={() => handleToggleSort('data.opponent')} className="sortable">
            Opponent {getSortIcon('data.opponent')}
          </th>
          <th>Home/Away</th>
          <th>Game Type</th>
          <th>Day/Night</th>
          <th>DH</th>
          <th>Venue</th>
          <th>Result</th>
          <th>TV</th>
          <th onClick={() => handleToggleSort('updatedAt')} className="sortable">
            Updated {getSortIcon('updatedAt')}
          </th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {data.map((item) => {
          const game = item.data;
          const isSelected = selectedItems.has(item._id);
          const isHome = game.isHome || game.locationIndicator === 'H';
          const isAway = game.isAway || game.locationIndicator === 'A';
          const isNeutral = game.isNeutral || game.locationIndicator === 'N';

          return (
            <tr key={item._id} className={isSelected ? 'selected' : ''}>
              <td>
                <button
                  className="checkbox-button"
                  onClick={() => {
                    const newSelection = new Set(selectedItems);
                    if (isSelected) {
                      newSelection.delete(item._id);
                    } else {
                      newSelection.add(item._id);
                    }
                    setSelectedItems(newSelection);
                  }}
                >
                  {isSelected ?
                    <CheckSquare size={16} /> :
                    <Square size={16} />
                  }
                </button>
              </td>
              <td>{getTeamName(item.teamId)}</td>
              <td>
                <Calendar size={14} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
                {formatGameDate(game.date)}
              </td>
              <td>{game.time || '-'}</td>
              <td className="opponent-name">
                <strong>{game.opponent || '-'}</strong>
                {game.isConferenceGame && (
                  <span className="conference-badge-small" title="Conference Game">
                    CONF
                  </span>
                )}
              </td>
              <td>
                {isNeutral ? (
                  <span className="location-badge-small neutral">NEUTRAL</span>
                ) : isHome ? (
                  <span className="location-badge-small home">HOME</span>
                ) : (
                  <span className="location-badge-small away">AWAY</span>
                )}
              </td>
              <td>
                {game.gameTypeName ? (
                  <span className={`game-type-badge ${game.gameType === 'S' ? 'spring' : game.gameType === 'R' ? 'regular' : 'postseason'}`}>
                    {game.gameTypeName}
                  </span>
                ) : (
                  '-'
                )}
              </td>
              <td>
                {game.dayNight ? (
                  <span className={`day-night-badge ${game.dayNight?.toLowerCase() === 'day' ? 'day' : 'night'}`}>
                    {game.dayNight === 'day' || game.dayNight === 'Day' ? '☀️ Day' : '🌙 Night'}
                  </span>
                ) : (
                  '-'
                )}
              </td>
              <td>
                {game.doubleHeader ? (
                  <span className={`doubleheader-badge ${game.doubleHeaderType === 'Split' ? 'split' : ''}`} title={`Game ${game.gameNumber || 1} of ${game.doubleHeaderType || 'doubleheader'}`}>
                    {game.doubleHeaderType === 'Split' ? `Split DH${game.gameNumber || 1}` : `DH${game.gameNumber || 1}`}
                  </span>
                ) : (
                  '-'
                )}
              </td>
              <td>{game.venue || '-'}</td>
              <td>
                {game.result ? (
                  <span className={`result-badge-small ${game.resultStatus === 'W' ? 'win' : 'loss'}`}>
                    {game.result}
                  </span>
                ) : (
                  <span style={{ color: '#999' }}>-</span>
                )}
              </td>
              <td>
                {game.tv ? (
                  <span className="tv-badge-small">{game.tv}</span>
                ) : (
                  '-'
                )}
              </td>
              <td>{new Date(item.updatedAt).toLocaleDateString()}</td>
              <td>
                <button
                  className="btn-icon-small"
                  title="View Details"
                >
                  <Eye size={14} />
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export default ViewData;