// frontend/src/components/TeamManager.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../contexts/ToastContext';
import {
  Plus,
  Search,
  Filter,
  Grid3x3,
  Table2,
  Edit2,
  Trash,
  Trash2,
  RefreshCw,
  Check,
  X,
  Circle,
  ChevronDown,
  Building2,
  Trophy,
  Globe,
  Clock,
  MapPin,
  Users,
  Activity,
  Database,
  Link,
  ExternalLink,
  Settings,
  Info,
  AlertCircle,
  CheckCircle,
  XCircle,
  Loader2,
  Image,
  FileText,
  Shield,
  Zap,
  Calendar,
  Hash,
  Tag,
  Briefcase,
  FileJson,
  FileSpreadsheet
} from 'lucide-react';

function TeamManager({ teams, onTeamsUpdate }) {
  const toast = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingTeam, setEditingTeam] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterConference, setFilterConference] = useState('');
  const [filterLeague, setFilterLeague] = useState('');
  const [sortBy, setSortBy] = useState('teamName');
  const [autoPopulating, setAutoPopulating] = useState(false);
  const [selectedTeamsForAuto, setSelectedTeamsForAuto] = useState([]);
  const [viewMode, setViewMode] = useState('grid');
  const [expandedTeam, setExpandedTeam] = useState(null);

  const [formData, setFormData] = useState({
    teamId: '',
    statsId: '',
    mlbId: '',
    nbaTeamId: '',
    espnId: '',
    teamName: '',
    teamNickname: '',
    teamAbbrev: '',
    league: 'NCAA',
    conference: '',
    division: '',
    scrapeType: '',
    subScrapeType: '',
    baseUrl: '',
    href: '',
    logoUrl: '',
    timezone: '',
    ncaaSportsConfig: {
      football: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
      mensBasketball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
      womensBasketball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
      mensIceHockey: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
      womensIceHockey: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
      baseball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
      softball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' }
    }
  });

  const leagues = ['NCAA', 'NFL', 'NBA', 'NHL', 'MLB', 'MILB'];
  
  const conferences = [
    'ACC', 'American', 'Big 12', 'Big Ten', 'C-USA', 'Independent', 
    'MAC', 'Mountain West', 'Pac-12', 'SEC', 'Sun Belt', 
    'Atlantic 10', 'Big East', 'Big Sky', 'CAA', 'Ivy League',
    'MAAC', 'Missouri Valley', 'Patriot', 'Southern', 'Southland', 'SWAC', 'WAC'
  ];
  
  const mlbConferences = ['American League', 'National League'];
  const mlbDivisions = ['East', 'Central', 'West'];
  
  const milbConferences = [
    'Cactus League', 'Grapefruit League', 'International League', 'Pacific Coast League',
    'Eastern League', 'Southern League', 'Texas League', 'Midwest League',
    'Northwest League', 'Carolina League', 'Florida State League', 'California League',
    'Arizona Complex League', 'Florida Complex League'
  ];
  
  const milbDivisions = ['Triple-A (AAA)', 'Double-A (AA)', 'High-A', 'Low-A', 'Rookie'];
  const generalDivisions = ['I', 'II', 'III', 'I-NAIA', 'II-NAIA'];
  const footballDivisions = ['FBS', 'FCS', 'II', 'III', 'I-NAIA', 'II-NAIA'];
  
  const timezones = [
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'America/Phoenix', 'America/Detroit', 'America/Indiana/Indianapolis', 'Pacific/Honolulu'
  ];
  
  const ncaaSports = [
    { key: 'football', label: 'Football', icon: Activity, useFootballDivisions: true },
    { key: 'mensBasketball', label: "Men's Basketball", icon: Activity },
    { key: 'womensBasketball', label: "Women's Basketball", icon: Activity },
    { key: 'mensIceHockey', label: "Men's Ice Hockey", icon: Activity },
    { key: 'womensIceHockey', label: "Women's Ice Hockey", icon: Activity },
    { key: 'baseball', label: 'Baseball', icon: Activity },
    { key: 'softball', label: 'Softball', icon: Activity }
  ];

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (showAddForm || editingTeam) {
      document.body.classList.add('modal-open');
    } else {
      document.body.classList.remove('modal-open');
    }
    
    return () => {
      document.body.classList.remove('modal-open');
    };
  }, [showAddForm, editingTeam]);

  // Helper function to get display division
  const getDisplayDivision = (team) => {
    if (team.league === 'NCAA' && team.ncaaSportsConfig?.football?.division) {
      return team.ncaaSportsConfig.football.division;
    }
    return team.division;
  };

  // Reset form when closing
  useEffect(() => {
    if (!showAddForm && !editingTeam) {
      setFormData({
        teamId: '',
        statsId: '',
        mlbId: '',
        nbaTeamId: '',
        espnId: '',
        teamName: '',
        teamNickname: '',
        teamAbbrev: '',
        league: 'NCAA',
        conference: '',
        division: '',
        scrapeType: '',
        subScrapeType: '',
        baseUrl: '',
        href: '',
        logoUrl: '',
        timezone: '',
        ncaaSportsConfig: {
          football: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          mensBasketball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          womensBasketball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          mensIceHockey: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          womensIceHockey: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          baseball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          softball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' }
        }
      });
    }
  }, [showAddForm, editingTeam]);

  // Filter and sort teams
  const processedTeams = teams
    .filter(team => {
      const matchesSearch = searchTerm === '' || 
        team.teamName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.teamId?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        team.conference?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesConference = filterConference === '' || team.conference === filterConference;
      const matchesLeague = filterLeague === '' || team.league === filterLeague;
      
      return matchesSearch && matchesConference && matchesLeague;
    })
    .sort((a, b) => {
      switch(sortBy) {
        case 'teamName':
          return (a.teamName || '').localeCompare(b.teamName || '');
        case 'conference':
          return (a.conference || '').localeCompare(b.conference || '');
        case 'league':
          return (a.league || '').localeCompare(b.league || '');
        default:
          return 0;
      }
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const teamData = {
        teamId: formData.teamId || `${formData.league}_${formData.teamName.replace(/\s+/g, '_').toUpperCase()}`,
        statsId: formData.statsId,
        mlbId: (formData.league === 'MLB' || formData.league === 'MILB') ? formData.mlbId : undefined,
        nbaTeamId: formData.league === 'NBA' ? formData.nbaTeamId : undefined,
        espnId: formData.espnId,
        teamName: formData.teamName,
        teamNickname: formData.teamNickname,
        teamAbbrev: formData.teamAbbrev,
        league: formData.league,
        conference: formData.conference,
        division: formData.division,
        scrapeType: (formData.league === 'MLB' || formData.league === 'MILB') ? 'mlb' : (formData.scrapeType || 'unknown'),
        subScrapeType: (formData.league === 'MLB' || formData.league === 'MILB') ? 'api' : (formData.subScrapeType || 'unknown'),
        baseUrl: formData.baseUrl.startsWith('http') ? formData.baseUrl : `https://${formData.baseUrl}`,
        href: formData.href,
        logoUrl: formData.logoUrl,
        timezone: formData.timezone,
        ncaaSportsConfig: formData.league === 'NCAA' ? formData.ncaaSportsConfig : undefined,
        active: true
      };

      let successMessage;
      if (editingTeam) {
        await axios.put(`/teams/${editingTeam.teamId}`, teamData);
        successMessage = 'Team updated successfully!';
      } else {
        await axios.post('/teams', teamData);
        successMessage = 'Team added successfully!';
      }

      // Close modal and show success toast
      setShowAddForm(false);
      setEditingTeam(null);
      toast.success(successMessage);

      onTeamsUpdate();
    } catch (error) {
      toast.error('Error saving team: ' + (error.response?.data?.error || error.message));
    }
  };

  const startEdit = (team) => {
    try {
      let ncaaSportsConfig = null;
      
      if (team.league === 'NCAA') {
        const defaultSportsConfig = {
          football: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          mensBasketball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          womensBasketball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          mensIceHockey: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          womensIceHockey: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          baseball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          softball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' }
        };

        ncaaSportsConfig = team.ncaaSportsConfig ? {
          football: { ...defaultSportsConfig.football, ...(team.ncaaSportsConfig.football || {}) },
          mensBasketball: { ...defaultSportsConfig.mensBasketball, ...(team.ncaaSportsConfig.mensBasketball || {}) },
          womensBasketball: { ...defaultSportsConfig.womensBasketball, ...(team.ncaaSportsConfig.womensBasketball || {}) },
          mensIceHockey: { ...defaultSportsConfig.mensIceHockey, ...(team.ncaaSportsConfig.mensIceHockey || {}) },
          womensIceHockey: { ...defaultSportsConfig.womensIceHockey, ...(team.ncaaSportsConfig.womensIceHockey || {}) },
          baseball: { ...defaultSportsConfig.baseball, ...(team.ncaaSportsConfig.baseball || {}) },
          softball: { ...defaultSportsConfig.softball, ...(team.ncaaSportsConfig.softball || {}) }
        } : defaultSportsConfig;
      } else {
        ncaaSportsConfig = {
          football: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          mensBasketball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          womensBasketball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          mensIceHockey: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          womensIceHockey: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          baseball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' },
          softball: { rosterId: '', scheduleId: '', sportId: '', conference: '', division: '' }
        };
      }

      setFormData({
        teamId: team.teamId || '',
        statsId: team.statsId || '',
        mlbId: team.mlbId || '',
        nbaTeamId: team.nbaTeamId || '',
        espnId: team.espnId || '',
        teamName: team.teamName || '',
        teamNickname: team.teamNickname || '',
        teamAbbrev: team.teamAbbrev || '',
        league: team.league || 'NCAA',
        conference: team.conference || '',
        division: team.division || '',
        scrapeType: team.scrapeType || '',
        subScrapeType: team.subScrapeType || '',
        baseUrl: team.baseUrl?.replace('https://', '').replace('http://', '') || '',
        href: team.href || '',
        logoUrl: team.logoUrl || '',
        timezone: team.timezone || '',
        ncaaSportsConfig: ncaaSportsConfig
      });
      
      setEditingTeam(team);
      setShowAddForm(false);

    } catch (error) {
      console.error('Error starting edit:', error);
      toast.error('Error loading team for editing. Check console for details.');
    }
  };

  const deleteTeam = async (teamId) => {
    if (window.confirm('Are you sure you want to delete this team?')) {
      try {
        await axios.delete(`/teams/${teamId}`);
        toast.success('Team deleted successfully!');
        onTeamsUpdate();
      } catch (error) {
        toast.error('Error deleting team: ' + error.message);
      }
    }
  };

  const toggleTeamSelection = (teamId) => {
    if (selectedTeamsForAuto.includes(teamId)) {
      setSelectedTeamsForAuto(selectedTeamsForAuto.filter(id => id !== teamId));
    } else {
      setSelectedTeamsForAuto([...selectedTeamsForAuto, teamId]);
    }
  };

  const autoPopulateTeams = async () => {
    if (selectedTeamsForAuto.length === 0) {
      toast.warning('Please select at least one team to auto-populate');
      return;
    }

    setAutoPopulating(true);
    try {
      const response = await axios.post('/auto-populate/bulk', {
        teamIds: selectedTeamsForAuto
      });

      toast.success(`Auto-populated ${response.data.successful} teams successfully, ${response.data.failed} failed`);
      onTeamsUpdate();
      setSelectedTeamsForAuto([]);
    } catch (error) {
      toast.error('Error during auto-populate: ' + error.message);
    } finally {
      setAutoPopulating(false);
    }
  };

  const autoPopulateSingleTeam = async (teamId) => {
    try {
      const response = await axios.post(`/auto-populate/team/${teamId}`);
      if (response.data.success) {
        toast.success('Team auto-populated successfully!');
        onTeamsUpdate();
      } else {
        toast.error('Auto-populate failed: ' + response.data.error);
      }
    } catch (error) {
      toast.error('Error during auto-populate: ' + error.message);
    }
  };

  const updateSportConfig = (sport, field, value) => {
    setFormData({
      ...formData,
      ncaaSportsConfig: {
        ...formData.ncaaSportsConfig,
        [sport]: {
          ...formData.ncaaSportsConfig[sport],
          [field]: value
        }
      }
    });
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch(status) {
      case 'success':
        return <CheckCircle size={16} className="status-icon-success" />;
      case 'failed':
        return <XCircle size={16} className="status-icon-error" />;
      default:
        return <Circle size={16} className="status-icon-default" />;
    }
  };

  // Get backend URL for exports (works in both web and Electron)
  const getBackendUrl = () => {
    return process.env.REACT_APP_API_URL || 'http://localhost:5000';
  };

  return (
    <div className="team-manager">
      <div className="section-header">
        <div className="header-title-group">
          <h2><Users className="inline-icon" /> Team Management</h2>
          <span className="header-count">{processedTeams.length} of {teams.length} teams</span>
        </div>
        <div className="header-actions">
          <div className="export-dropdown">
            <button className="btn-secondary">
              <FileJson size={16} />
              Export
            </button>
            <div className="export-dropdown-menu">
              <a
                href={`${getBackendUrl()}/api/v1/teams?format=json&league=${filterLeague || ''}&conference=${filterConference || ''}`}
                className="export-menu-item"
                target="_blank"
                rel="noopener noreferrer"
              >
                <FileJson size={14} />
                JSON
              </a>
              <a
                href={`${getBackendUrl()}/api/v1/teams?format=csv&league=${filterLeague || ''}&conference=${filterConference || ''}`}
                className="export-menu-item"
                download
              >
                <FileText size={14} />
                CSV
              </a>
              <a
                href={`${getBackendUrl()}/api/v1/teams?format=xlsx&league=${filterLeague || ''}&conference=${filterConference || ''}`}
                className="export-menu-item"
                download
              >
                <FileSpreadsheet size={14} />
                Excel
              </a>
            </div>
          </div>
          <button
            className="btn-secondary"
            onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
          >
            {viewMode === 'grid' ? (
              <>
                <Table2 size={16} />
                Table View
              </>
            ) : (
              <>
                <Grid3x3 size={16} />
                Grid View
              </>
            )}
          </button>
          <button
            className="btn-primary"
            onClick={() => {
              setShowAddForm(!showAddForm);
              setEditingTeam(null);
            }}
          >
            {showAddForm ? (
              <>
                <X size={16} />
                Cancel
              </>
            ) : (
              <>
                <Plus size={16} />
                Add Team
              </>
            )}
          </button>
        </div>
      </div>

      {/* Search and Filter Bar */}
      <div className="controls-bar">
        <div className="search-box">
          <Search size={18} className="search-icon" />
          <input
            type="text"
            placeholder="Search teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        
        <select 
          value={filterLeague}
          onChange={(e) => setFilterLeague(e.target.value)}
          className="filter-select"
        >
          <option value="">All Leagues</option>
          {leagues.map(league => (
            <option key={league} value={league}>{league}</option>
          ))}
        </select>
        
        <select 
          value={filterConference}
          onChange={(e) => setFilterConference(e.target.value)}
          className="filter-select"
        >
          <option value="">All Conferences</option>
          {conferences.map(conf => (
            <option key={conf} value={conf}>{conf}</option>
          ))}
        </select>
        
        <select 
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="sort-select"
        >
          <option value="teamName">Sort by Name</option>
          <option value="league">Sort by League</option>
          <option value="conference">Sort by Conference</option>
        </select>
      </div>

      {/* Auto-populate section for NCAA teams */}
      {processedTeams.some(t => t.league === 'NCAA') && (
        <div className="auto-populate-section">
          <div className="auto-populate-header">
            <div className="auto-populate-info">
              <h3><Zap size={18} /> NCAA Configuration Auto-Populate</h3>
              <p>Automatically detect and populate sport IDs for selected NCAA teams</p>
            </div>
            <div className="auto-populate-actions">
              <button 
                className="btn-secondary"
                onClick={() => {
                  const ncaaTeams = processedTeams.filter(t => t.league === 'NCAA');
                  if (selectedTeamsForAuto.length === ncaaTeams.length) {
                    setSelectedTeamsForAuto([]);
                  } else {
                    setSelectedTeamsForAuto(ncaaTeams.map(t => t.teamId));
                  }
                }}
              >
                {selectedTeamsForAuto.length === processedTeams.filter(t => t.league === 'NCAA').length 
                  ? 'Deselect All' 
                  : 'Select All NCAA'}
              </button>
              <button
                className="btn-primary"
                onClick={autoPopulateTeams}
                disabled={autoPopulating || selectedTeamsForAuto.length === 0}
              >
                {autoPopulating ? (
                  <>
                    <Loader2 size={16} className="spinner" />
                    Processing...
                  </>
                ) : (
                  <>
                    <RefreshCw size={16} />
                    Auto-populate {selectedTeamsForAuto.length} Selected
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal for Add/Edit Form */}
      {(showAddForm || editingTeam) && (
        <>
          <div 
            className="modal-backdrop" 
            onClick={() => {
              setShowAddForm(false);
              setEditingTeam(null);
            }}
          />
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <form className="modal-form" onSubmit={handleSubmit}>
              <div className="modal-header">
                <h3>{editingTeam ? 'Edit Team' : 'Add New Team'}</h3>
                <button 
                  type="button"
                  className="modal-close"
                  onClick={() => {
                    setShowAddForm(false);
                    setEditingTeam(null);
                  }}
                >
                  <X size={20} />
                </button>
              </div>
              
              <div className="modal-body">
                <div className="form-grid">
                  <div className="form-group">
                    <label><Hash size={14} /> Team ID *</label>
                    <input
                      type="text"
                      value={formData.teamId}
                      onChange={(e) => setFormData({...formData, teamId: e.target.value})}
                      placeholder="NCAA_ALABAMA"
                      disabled={editingTeam}
                    />
                  </div>

                  <div className="form-group">
                    <label><Building2 size={14} /> Team Name *</label>
                    <input
                      type="text"
                      value={formData.teamName}
                      onChange={(e) => setFormData({...formData, teamName: e.target.value})}
                      placeholder="University of Alabama"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label><Tag size={14} /> Team Nickname</label>
                    <input
                      type="text"
                      value={formData.teamNickname}
                      onChange={(e) => setFormData({...formData, teamNickname: e.target.value})}
                      placeholder="Crimson Tide"
                    />
                  </div>

                  <div className="form-group">
                    <label><FileText size={14} /> Team Abbreviation</label>
                    <input
                      type="text"
                      value={formData.teamAbbrev}
                      onChange={(e) => setFormData({...formData, teamAbbrev: e.target.value})}
                      placeholder="ALA"
                      maxLength="5"
                    />
                  </div>

                  <div className="form-group">
                    <label><Trophy size={14} /> League *</label>
                    <select
                      value={formData.league}
                      onChange={(e) => setFormData({...formData, league: e.target.value})}
                      required
                    >
                      {leagues.map(league => (
                        <option key={league} value={league}>{league}</option>
                      ))}
                    </select>
                  </div>

                  {formData.league === 'NCAA' && (
                    <>
                      <div className="form-group">
                        <label><Briefcase size={14} /> Conference</label>
                        <select
                          value={formData.conference}
                          onChange={(e) => setFormData({...formData, conference: e.target.value})}
                        >
                          <option value="">Select Conference</option>
                          {conferences.map(conf => (
                            <option key={conf} value={conf}>{conf}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label><Shield size={14} /> Division</label>
                        <select
                          value={formData.division}
                          onChange={(e) => setFormData({...formData, division: e.target.value})}
                        >
                          <option value="">Select Division</option>
                          {generalDivisions.map(div => (
                            <option key={div} value={div}>{div}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {formData.league === 'MLB' && (
                    <>
                      <div className="form-group">
                        <label><Briefcase size={14} /> League</label>
                        <select
                          value={formData.conference}
                          onChange={(e) => setFormData({...formData, conference: e.target.value})}
                        >
                          <option value="">Select League</option>
                          {mlbConferences.map(conf => (
                            <option key={conf} value={conf}>{conf}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label><Shield size={14} /> Division</label>
                        <select
                          value={formData.division}
                          onChange={(e) => setFormData({...formData, division: e.target.value})}
                        >
                          <option value="">Select Division</option>
                          {mlbDivisions.map(div => (
                            <option key={div} value={div}>{div}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  {formData.league === 'MILB' && (
                    <>
                      <div className="form-group">
                        <label><Briefcase size={14} /> League</label>
                        <select
                          value={formData.conference}
                          onChange={(e) => setFormData({...formData, conference: e.target.value})}
                        >
                          <option value="">Select League</option>
                          {milbConferences.map(conf => (
                            <option key={conf} value={conf}>{conf}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group">
                        <label><Shield size={14} /> Level</label>
                        <select
                          value={formData.division}
                          onChange={(e) => setFormData({...formData, division: e.target.value})}
                        >
                          <option value="">Select Level</option>
                          {milbDivisions.map(div => (
                            <option key={div} value={div}>{div}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label><Database size={14} /> Stats ID</label>
                    <input
                      type="text"
                      value={formData.statsId}
                      onChange={(e) => setFormData({...formData, statsId: e.target.value})}
                      placeholder="STATS_123"
                    />
                  </div>

                  {(formData.league === 'MLB' || formData.league === 'MILB') && (
                    <div className="form-group">
                      <label><Hash size={14} /> MLB ID *</label>
                      <input
                        type="text"
                        value={formData.mlbId}
                        onChange={(e) => setFormData({...formData, mlbId: e.target.value})}
                        placeholder="147"
                        required
                      />
                    </div>
                  )}

                  {formData.league === 'NBA' && (
                    <div className="form-group">
                      <label><Hash size={14} /> NBA Team ID</label>
                      <input
                        type="text"
                        value={formData.nbaTeamId}
                        onChange={(e) => setFormData({...formData, nbaTeamId: e.target.value})}
                        placeholder="1610612737"
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label><Database size={14} /> ESPN ID</label>
                    <input
                      type="text"
                      value={formData.espnId}
                      onChange={(e) => setFormData({...formData, espnId: e.target.value})}
                      placeholder="333"
                    />
                  </div>

                  <div className="form-group">
                    <label><Globe size={14} /> Base URL *</label>
                    <input
                      type="text"
                      value={formData.baseUrl}
                      onChange={(e) => setFormData({...formData, baseUrl: e.target.value})}
                      placeholder="rolltide.com"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label><Image size={14} /> Logo URL</label>
                    <input
                      type="text"
                      value={formData.logoUrl}
                      onChange={(e) => setFormData({...formData, logoUrl: e.target.value})}
                      placeholder="https://example.com/logo.png"
                    />
                    {formData.logoUrl && (
                      <img src={formData.logoUrl} alt="Logo preview" className="logo-preview" />
                    )}
                  </div>

                  {(formData.league === 'MLB' || formData.league === 'MILB') ? (
                    <div className="form-group">
                      <label><Settings size={14} /> Scrape Type</label>
                      <input
                        type="text"
                        value="MLB API"
                        disabled
                        className="disabled-input"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="form-group">
                        <label><Settings size={14} /> Scrape Type</label>
                        <select
                          value={formData.scrapeType}
                          onChange={(e) => setFormData({...formData, scrapeType: e.target.value})}
                        >
                          <option value="">Auto-detect</option>
                          <option value="sidearm">Sidearm</option>
                          <option value="presto">Presto</option>
                          <option value="custom">Custom</option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label><Settings size={14} /> Sub-Scrape Type</label>
                        <select
                          value={formData.subScrapeType}
                          onChange={(e) => setFormData({...formData, subScrapeType: e.target.value})}
                        >
                          <option value="">Auto-detect</option>
                          <option value="new">New</option>
                          <option value="old">Old</option>
                        </select>
                      </div>
                    </>
                  )}

                  <div className="form-group">
                    <label><Clock size={14} /> Time Zone</label>
                    <select
                      value={formData.timezone}
                      onChange={(e) => setFormData({...formData, timezone: e.target.value})}
                    >
                      <option value="">Select Time Zone</option>
                      {timezones.map(tz => (
                        <option key={tz} value={tz}>{tz}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* NCAA Sports Configuration Section */}
                {formData.league === 'NCAA' && (
                  <div className="ncaa-sports-section">
                    <h4><Activity size={16} /> NCAA Sports Configuration</h4>
                    <p className="section-description">
                      Configure each sport's IDs, conference, and division. Leave conference/division blank to use team defaults.
                    </p>
                    
                    <div className="sports-config-grid">
                      {ncaaSports.map(sport => {
                        const SportIcon = sport.icon;
                        return (
                          <div key={sport.key} className="sport-config-card">
                            <div className="sport-header">
                              <SportIcon size={20} className="sport-icon" />
                              <h5>{sport.label}</h5>
                            </div>
                            
                            <div className="sport-fields">
                              <div className="field-group">
                                <label>Sport ID</label>
                                <input
                                  type="text"
                                  value={formData.ncaaSportsConfig[sport.key]?.sportId || ''}
                                  onChange={(e) => updateSportConfig(sport.key, 'sportId', e.target.value)}
                                  placeholder="e.g., 3"
                                />
                              </div>
                              
                              <div className="field-group">
                                <label>Roster ID</label>
                                <input
                                  type="text"
                                  value={formData.ncaaSportsConfig[sport.key]?.rosterId || ''}
                                  onChange={(e) => updateSportConfig(sport.key, 'rosterId', e.target.value)}
                                  placeholder="e.g., 585"
                                />
                              </div>
                              
                              <div className="field-group">
                                <label>Schedule ID</label>
                                <input
                                  type="text"
                                  value={formData.ncaaSportsConfig[sport.key]?.scheduleId || ''}
                                  onChange={(e) => updateSportConfig(sport.key, 'scheduleId', e.target.value)}
                                  placeholder="e.g., 492"
                                />
                              </div>

                              <div className="field-group">
                                <label>Oracle Team ID</label>
                                <input
                                  type="text"
                                  value={formData.ncaaSportsConfig[sport.key]?.oracleTeamId || ''}
                                  onChange={(e) => updateSportConfig(sport.key, 'oracleTeamId', e.target.value ? parseInt(e.target.value) || '' : '')}
                                  placeholder="Enter Oracle team ID"
                                  title="Oracle team ID for this sport (different per sport)"
                                />
                              </div>

                              <div className="field-group">
                                <label>Conference (if different)</label>
                                <select
                                  value={formData.ncaaSportsConfig[sport.key]?.conference || ''}
                                  onChange={(e) => updateSportConfig(sport.key, 'conference', e.target.value)}
                                >
                                  <option value="">Use team default</option>
                                  {conferences.map(conf => (
                                    <option key={conf} value={conf}>{conf}</option>
                                  ))}
                                </select>
                              </div>
                              
                              <div className="field-group">
                                <label>Division (if different)</label>
                                <select
                                  value={formData.ncaaSportsConfig[sport.key]?.division || ''}
                                  onChange={(e) => updateSportConfig(sport.key, 'division', e.target.value)}
                                >
                                  <option value="">Use team default</option>
                                  {(sport.useFootballDivisions ? footballDivisions : generalDivisions).map(div => (
                                    <option key={div} value={div}>{div}</option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="modal-footer">
                <button type="submit" className="btn-primary">
                  {editingTeam ? 'Update Team' : 'Add Team'}
                </button>
                <button 
                  type="button" 
                  className="btn-secondary"
                  onClick={() => {
                    setEditingTeam(null);
                    setShowAddForm(false);
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Teams Display - Grid View */}
      {viewMode === 'grid' ? (
        <div className="teams-grid modern">
          {processedTeams.map(team => (
            <div key={team._id || team.teamId} className="team-card modern">
              {team.league === 'NCAA' && (
                <input
                  type="checkbox"
                  className="team-select-checkbox"
                  checked={selectedTeamsForAuto.includes(team.teamId)}
                  onChange={() => toggleTeamSelection(team.teamId)}
                  title="Select for auto-populate"
                />
              )}
              
              <div className="team-card-header">
                <div className="team-logo-container">
                  {team.logoUrl ? (
                    <img src={team.logoUrl} alt={team.teamName} className="team-logo" />
                  ) : (
                    <div className="team-logo-placeholder">
                      <Building2 size={24} />
                    </div>
                  )}
                </div>
                <div className="team-header-info">
                  <h3>
                    {team.teamName}
                    {team.teamNickname && (
                      <>
                        <br />
                        <span className="team-nickname">{team.teamNickname}</span>
                      </>
                    )}
                  </h3>
                  <div className="team-meta">
                    <span className="badge badge-league">{team.league}</span>
                    {team.conference && <span className="badge badge-conference">{team.conference}</span>}
                    {getDisplayDivision(team) && <span className="badge badge-division">{getDisplayDivision(team)}</span>}
                  </div>
                </div>
              </div>
              
              <div className="team-card-body">
                <div className="team-info-row">
                  <span className="label">Team ID:</span>
                  <span className="value">{team.teamId || <span className="placeholder">Not set</span>}</span>
                </div>
                <div className="team-info-row">
                  <span className="label">Stats/ESPN ID:</span>
                  <span className="value">
                    {team.statsId || <span className="placeholder">-</span>} / {team.espnId || <span className="placeholder">-</span>}
                  </span>
                </div>
                {(team.league === 'MLB' || team.league === 'MILB') && team.mlbId && (
                  <div className="team-info-row">
                    <span className="label">MLB ID:</span>
                    <span className="value">{team.mlbId}</span>
                  </div>
                )}
                {team.league === 'NBA' && team.nbaTeamId && (
                  <div className="team-info-row">
                    <span className="label">NBA Team ID:</span>
                    <span className="value">{team.nbaTeamId}</span>
                  </div>
                )}
                <div className="team-info-row">
                  <span className="label">URL:</span>
                  <span className="value">
                    {team.baseUrl ? (
                      <a href={team.baseUrl} target="_blank" rel="noopener noreferrer" className="team-link">
                        {team.baseUrl.replace('https://', '').replace('http://', '')}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <span className="placeholder">Not set</span>
                    )}
                  </span>
                </div>
                <div className="team-info-row">
                  <span className="label">Scrape Type:</span>
                  <span className="value">
                    {team.scrapeType || <span className="placeholder">Unknown</span>} / 
                    {team.subScrapeType || <span className="placeholder">Unknown</span>}
                  </span>
                </div>
                
                {team.league === 'NCAA' && (
                  <div className="team-info-row">
                    <span className="label">Status:</span>
                    <span className={`status-indicator ${team.autoPopulateStatus || 'never'}`}>
                      {getStatusIcon(team.autoPopulateStatus)}
                      <span className="status-text">
                        {team.autoPopulateStatus === 'success' ? 'Populated' : 
                         team.autoPopulateStatus === 'failed' ? 'Failed' : 
                         'Not populated'}
                      </span>
                    </span>
                  </div>
                )}
              </div>

              <div className="team-card-actions">
                {team.league === 'NCAA' && (
                  <button 
                    className="btn-icon btn-refresh"
                    onClick={() => autoPopulateSingleTeam(team.teamId)}
                    disabled={autoPopulating}
                    title="Auto-populate"
                  >
                    <RefreshCw size={16} />
                  </button>
                )}
                <button 
                  className="btn-icon btn-edit"
                  onClick={() => startEdit(team)}
                  title="Edit"
                >
                  <Edit2 size={16} />
                </button>
                <button 
                  className="btn-icon btn-delete"
                  onClick={() => deleteTeam(team.teamId)}
                  title="Delete"
                >
                  <Trash size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Table View
        <div className="table-container">
          <table className="teams-table modern">
            <thead>
              <tr>
                {processedTeams.some(t => t.league === 'NCAA') && (
                  <th className="checkbox-col">Select</th>
                )}
                <th>Logo</th>
                <th>Team Name</th>
                <th>Nickname</th>
                <th>League</th>
                <th>Conference</th>
                <th>Division</th>
                <th>IDs</th>
                <th>Base URL</th>
                <th>Scrape</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {processedTeams.map(team => (
                <tr key={team._id || team.teamId}>
                  {processedTeams.some(t => t.league === 'NCAA') && (
                    <td className="checkbox-col">
                      {team.league === 'NCAA' && (
                        <input
                          type="checkbox"
                          checked={selectedTeamsForAuto.includes(team.teamId)}
                          onChange={() => toggleTeamSelection(team.teamId)}
                        />
                      )}
                    </td>
                  )}
                  <td className="logo-col">
                    {team.logoUrl ? (
                      <img src={team.logoUrl} alt={team.teamName} className="table-logo" />
                    ) : (
                      <div className="table-logo-placeholder">
                        <Building2 size={16} />
                      </div>
                    )}
                  </td>
                  <td className="team-name-col">
                    <strong>{team.teamName}</strong>
                  </td>
                  <td>{team.teamNickname || '-'}</td>
                  <td>
                    <span className="badge badge-league">{team.league}</span>
                  </td>
                  <td>{team.conference || '-'}</td>
                  <td>{getDisplayDivision(team) || '-'}</td>
                  <td className="ids-col">
                    <div className="ids-list">
                      {(team.league === 'MLB' || team.league === 'MILB') && team.mlbId && (
                        <span className="id-badge" title="MLB ID">
                          <Tag size={12} /> {team.mlbId}
                        </span>
                      )}
                      {team.league === 'NBA' && team.nbaTeamId && (
                        <span className="id-badge" title="NBA Team ID">
                          <Tag size={12} /> {team.nbaTeamId}
                        </span>
                      )}
                      <span className="id-badge" title="ESPN ID">
                        E: {team.espnId || '-'}
                      </span>
                      <span className="id-badge" title="Stats ID">
                        S: {team.statsId || '-'}
                      </span>
                    </div>
                  </td>
                  <td className="url-col">
                    {team.baseUrl ? (
                      <a href={team.baseUrl} target="_blank" rel="noopener noreferrer" className="url-link">
                        {team.baseUrl.replace('https://', '').replace('http://', '')}
                        <ExternalLink size={12} />
                      </a>
                    ) : '-'}
                  </td>
                  <td>
                    {team.scrapeType || '?'}/{team.subScrapeType || '?'}
                  </td>
                  <td>
                    <span className={`status-pill ${team.autoPopulateStatus || 'never'}`}>
                      {getStatusIcon(team.autoPopulateStatus)}
                      {team.autoPopulateStatus === 'success' ? 'Populated' : 
                       team.autoPopulateStatus === 'failed' ? 'Failed' : 
                       'Not run'}
                    </span>
                  </td>
                  <td className="actions-col">
                    {team.league === 'NCAA' && (
                      <button 
                        className="btn-table-action btn-refresh" 
                        onClick={() => autoPopulateSingleTeam(team.teamId)} 
                        title="Auto-populate"
                      >
                        <RefreshCw size={14} />
                      </button>
                    )}
                    <button 
                      className="btn-table-action btn-edit" 
                      onClick={() => startEdit(team)} 
                      title="Edit"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button 
                      className="btn-table-action btn-delete" 
                      onClick={() => deleteTeam(team.teamId)} 
                      title="Delete"
                    >
                      <Trash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {processedTeams.length === 0 && (
        <div className="empty-state">
          <AlertCircle size={48} className="empty-icon" />
          <h3>No teams found</h3>
          <p>{searchTerm || filterConference || filterLeague ? 
            'Try adjusting your filters' : 
            'Click "Add Team" to get started'}</p>
        </div>
      )}
    </div>
  );
} 

export default TeamManager;
