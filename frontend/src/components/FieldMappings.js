// frontend/src/components/FieldMappings.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../contexts/ToastContext';
import {
  Link2,
  Plus,
  Edit2,
  Trash2,
  Search,
  Filter,
  Globe,
  Building2,
  Activity,
  Trophy,
  Users,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ChevronRight,
  Settings,
  Hash,
  MapPin,
  Calendar,
  Ruler,
  Weight as WeightIcon,
  GraduationCap,
  Home,
  School,
  Loader2,
  Clock,
  List,
  LayoutGrid,
  EyeOff,
  Lightbulb,
  CalendarDays,
  Info
} from 'lucide-react';

function FieldMappings({ teams }) {
  const toast = useToast();
  const [mappings, setMappings] = useState([]);
  const [ignoredGames, setIgnoredGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('all'); // all, roster, schedule, ignored, suggestions
  const [viewMode, setViewMode] = useState('list'); // list, team
  const [selectedTeamForView, setSelectedTeamForView] = useState('');
  const [filterFieldType, setFilterFieldType] = useState('');
  const [filterScope, setFilterScope] = useState('');
  const [filterTeamId, setFilterTeamId] = useState('');
  const [filterLeague, setFilterLeague] = useState('');
  const [filterSport, setFilterSport] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingMapping, setEditingMapping] = useState(null);
  const [expandedMappings, setExpandedMappings] = useState(new Set());
  const [expandedGroups, setExpandedGroups] = useState(new Set(['name', 'position', 'opponent', 'venue']));
  const [selectedMappings, setSelectedMappings] = useState(new Set());
  const [deletingBulk, setDeletingBulk] = useState(false);

  // New mapping form state
  const [newMapping, setNewMapping] = useState({
    mappingType: 'equivalence',
    fieldType: 'name',
    scope: {
      level: 'global',
      league: '',
      sport: '',
      teamId: ''
    },
    rules: {
      primaryValue: '',
      equivalents: [''],
      caseSensitive: false,
      tolerance: 5,
      toleranceType: 'absolute'
    },
    appliesTo: {
      scraped: true,
      api: true,
      oracle: true
    },
    notes: ''
  });

  const rosterFieldTypes = [
    { value: 'name', label: 'Player Name', icon: Users },
    { value: 'position', label: 'Position', icon: MapPin },
    { value: 'weight', label: 'Weight', icon: WeightIcon },
    { value: 'height', label: 'Height', icon: Ruler },
    { value: 'year', label: 'Year/Class', icon: GraduationCap },
    { value: 'jersey', label: 'Jersey Number', icon: Hash },
    { value: 'hometown', label: 'Hometown', icon: Home },
    { value: 'highSchool', label: 'High School', icon: School },
    { value: 'birthDate', label: 'Birth Date', icon: Calendar }
  ];

  const scheduleFieldTypes = [
    { value: 'opponent', label: 'Opponent Name', icon: Trophy },
    { value: 'venue', label: 'Venue/Stadium', icon: MapPin },
    { value: 'locationIndicator', label: 'Location (H/A/N)', icon: MapPin },
    { value: 'tv', label: 'TV Network', icon: Activity },
    { value: 'time', label: 'Game Time', icon: Clock },
    { value: 'location', label: 'City/Location', icon: Home },
    { value: 'isConferenceGame', label: 'Conference Game', icon: Building2 }
  ];

  const allFieldTypes = [...rosterFieldTypes, ...scheduleFieldTypes];

  const scopeLevels = [
    { value: 'global', label: 'Global', icon: Globe, description: 'All teams and sports', color: '#3b82f6' },
    { value: 'league', label: 'League', icon: Building2, description: 'Specific league only', color: '#10b981' },
    { value: 'sport', label: 'Sport', icon: Activity, description: 'Specific sport only', color: '#f59e0b' },
    { value: 'team', label: 'Team', icon: Trophy, description: 'Specific team only', color: '#8b5cf6' }
  ];

  useEffect(() => {
    loadMappings();
    if (activeTab === 'ignored') {
      loadIgnoredGames();
    }
  }, [activeTab]);

  const loadMappings = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterFieldType) params.fieldType = filterFieldType;
      if (filterScope) params.scope = filterScope;
      if (filterTeamId) params.teamId = filterTeamId;
      if (filterLeague) params.league = filterLeague;
      if (filterSport) params.sport = filterSport;

      const response = await axios.get('/mappings/list', { params });
      setMappings(response.data.mappings || []);
    } catch (error) {
      console.error('Error loading mappings:', error);
      toast.error('Failed to load mappings');
    } finally {
      setLoading(false);
    }
  };

  const loadIgnoredGames = async () => {
    try {
      // Fetch all ignored games across all teams/modules
      const response = await axios.get('/comparison/ignored-games');
      setIgnoredGames(response.data.ignoredGames || []);
    } catch (error) {
      console.error('Error loading ignored games:', error);
      // Don't show error to user, just log it
    }
  };

  const handleCreateMapping = async () => {
    try {
      if (!newMapping.fieldType) {
        toast.warning('Please select a field type');
        return;
      }

      if (newMapping.mappingType === 'equivalence') {
        if (!newMapping.rules.primaryValue) {
          toast.warning('Please enter a primary value');
          return;
        }
        if (newMapping.rules.equivalents.filter(e => e.trim()).length === 0) {
          toast.warning('Please enter at least one equivalent value');
          return;
        }
      }

      const cleanedMapping = {
        ...newMapping,
        rules: {
          ...newMapping.rules,
          equivalents: newMapping.rules.equivalents.filter(e => e.trim() !== '')
        }
      };

      await axios.post('/mappings/create', cleanedMapping);

      setShowCreateModal(false);
      resetForm();
      toast.success('Mapping created successfully!');
      loadMappings();
    } catch (error) {
      console.error('Error creating mapping:', error);
      toast.error('Failed to create mapping: ' + (error.response?.data?.error || error.message));
    }
  };

  const handleUpdateMapping = async () => {
    try {
      await axios.put(`/mappings/${editingMapping._id}`, editingMapping);

      setEditingMapping(null);
      toast.success('Mapping updated successfully!');
      loadMappings();
    } catch (error) {
      console.error('Error updating mapping:', error);
      toast.error('Failed to update mapping');
    }
  };

  const handleDeleteMapping = async (mappingId) => {
    if (!window.confirm('Are you sure you want to delete this mapping?')) {
      return;
    }

    try {
      await axios.delete(`/mappings/${mappingId}`);
      toast.success('Mapping deleted successfully!');
      loadMappings();
    } catch (error) {
      console.error('Error deleting mapping:', error);
      toast.error('Failed to delete mapping');
    }
  };

  const handleUnignoreGame = async (gameId) => {
    if (!window.confirm('Are you sure you want to unignore this game?')) {
      return;
    }

    try {
      await axios.delete(`/comparison/ignored-games/${gameId}`);
      toast.success('Game unignored successfully!');
      loadIgnoredGames();
    } catch (error) {
      console.error('Error unignoring game:', error);
      toast.error('Failed to unignore game');
    }
  };

  const toggleMappingSelection = (mappingId) => {
    const newSelected = new Set(selectedMappings);
    if (newSelected.has(mappingId)) {
      newSelected.delete(mappingId);
    } else {
      newSelected.add(mappingId);
    }
    setSelectedMappings(newSelected);
  };

  const toggleSelectAll = () => {
    const currentMappings = getFilteredMappings();
    if (selectedMappings.size === currentMappings.length) {
      setSelectedMappings(new Set());
    } else {
      setSelectedMappings(new Set(currentMappings.map(m => m._id)));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedMappings.size === 0) {
      toast.warning('Please select at least one mapping to delete');
      return;
    }

    if (!window.confirm(`Are you sure you want to delete ${selectedMappings.size} mapping(s)?`)) {
      return;
    }

    setDeletingBulk(true);
    try {
      const deletePromises = Array.from(selectedMappings).map(id =>
        axios.delete(`/mappings/${id}`)
      );

      await Promise.all(deletePromises);

      toast.success(`Successfully deleted ${selectedMappings.size} mapping(s)`);
      setSelectedMappings(new Set());
      loadMappings();
    } catch (error) {
      console.error('Error deleting mappings:', error);
      toast.error('Failed to delete some mappings');
    } finally {
      setDeletingBulk(false);
    }
  };

  const toggleMappingExpanded = (mappingId) => {
    const newExpanded = new Set(expandedMappings);
    if (newExpanded.has(mappingId)) {
      newExpanded.delete(mappingId);
    } else {
      newExpanded.add(mappingId);
    }
    setExpandedMappings(newExpanded);
  };

  const toggleGroupExpanded = (groupKey) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(groupKey)) {
      newExpanded.delete(groupKey);
    } else {
      newExpanded.add(groupKey);
    }
    setExpandedGroups(newExpanded);
  };

  const resetForm = () => {
    setNewMapping({
      mappingType: 'equivalence',
      fieldType: 'name',
      scope: {
        level: 'global',
        league: '',
        sport: '',
        teamId: ''
      },
      rules: {
        primaryValue: '',
        equivalents: [''],
        caseSensitive: false,
        tolerance: 5,
        toleranceType: 'absolute'
      },
      appliesTo: {
        scraped: true,
        api: true,
        oracle: true
      },
      notes: ''
    });
  };

  const addEquivalentField = () => {
    setNewMapping({
      ...newMapping,
      rules: {
        ...newMapping.rules,
        equivalents: [...newMapping.rules.equivalents, '']
      }
    });
  };

  const updateEquivalent = (index, value) => {
    const newEquivalents = [...newMapping.rules.equivalents];
    newEquivalents[index] = value;
    setNewMapping({
      ...newMapping,
      rules: {
        ...newMapping.rules,
        equivalents: newEquivalents
      }
    });
  };

  const removeEquivalent = (index) => {
    const newEquivalents = newMapping.rules.equivalents.filter((_, i) => i !== index);
    setNewMapping({
      ...newMapping,
      rules: {
        ...newMapping.rules,
        equivalents: newEquivalents
      }
    });
  };

  // Edit modal handlers for equivalents
  const updateEditEquivalent = (index, value) => {
    const newEquivalents = [...editingMapping.rules.equivalents];
    newEquivalents[index] = value;
    setEditingMapping({
      ...editingMapping,
      rules: {
        ...editingMapping.rules,
        equivalents: newEquivalents
      }
    });
  };

  const addEditEquivalent = () => {
    setEditingMapping({
      ...editingMapping,
      rules: {
        ...editingMapping.rules,
        equivalents: [...editingMapping.rules.equivalents, '']
      }
    });
  };

  const removeEditEquivalent = (index) => {
    const newEquivalents = editingMapping.rules.equivalents.filter((_, i) => i !== index);
    setEditingMapping({
      ...editingMapping,
      rules: {
        ...editingMapping.rules,
        equivalents: newEquivalents
      }
    });
  };

  const getFieldIcon = (fieldType) => {
    const field = allFieldTypes.find(f => f.value === fieldType);
    return field ? field.icon : Settings;
  };

  const getScopeIcon = (scopeLevel) => {
    const scope = scopeLevels.find(s => s.value === scopeLevel);
    return scope ? scope.icon : Globe;
  };

  const getScopeColor = (scopeLevel) => {
    const scope = scopeLevels.find(s => s.value === scopeLevel);
    return scope ? scope.color : '#6b7280';
  };

  const getScopeLabel = (mapping) => {
    const scope = mapping.scope;
    if (scope.level === 'global') return 'Global';
    if (scope.level === 'league') return `${scope.league} League`;
    if (scope.level === 'sport') return scope.sport ? `${scope.sport} Sport` : '⚠️ Invalid Sport Mapping';
    if (scope.level === 'team') {
      const team = teams.find(t => t.teamId === scope.teamId);
      return team ? `${team.teamName} ${team.teamNickname || ''}` : scope.teamId;
    }
    return 'Unknown';
  };

  // Get team-specific mappings only (in Team View)
  const getApplicableMappingsForTeam = (teamId) => {
    if (!teamId) return [];

    // Only return mappings specifically for this team
    return mappings.filter(m => {
      return m.scope.level === 'team' && m.scope.teamId === teamId;
    });
  };

  // Get filtered mappings based on active tab and filters
  const getFilteredMappings = () => {
    let filtered = [...mappings];

    // Filter by tab
    if (activeTab === 'roster') {
      const rosterFields = rosterFieldTypes.map(f => f.value);
      filtered = filtered.filter(m => rosterFields.includes(m.fieldType));
    } else if (activeTab === 'schedule') {
      const scheduleFields = scheduleFieldTypes.map(f => f.value);
      filtered = filtered.filter(m => scheduleFields.includes(m.fieldType));
    } else if (activeTab === 'ignored') {
      filtered = filtered.filter(m => m.mappingType === 'ignore');
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(m =>
        m.rules.primaryValue?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.rules.equivalents?.some(e => e.toLowerCase().includes(searchTerm.toLowerCase())) ||
        m.fieldType?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Filter by field type
    if (filterFieldType) {
      filtered = filtered.filter(m => m.fieldType === filterFieldType);
    }

    // Filter by scope
    if (filterScope) {
      filtered = filtered.filter(m => m.scope.level === filterScope);
    }

    // Filter by team
    if (filterTeamId) {
      filtered = filtered.filter(m => m.scope.teamId === filterTeamId);
    }

    // Filter by league
    if (filterLeague) {
      filtered = filtered.filter(m => m.scope.league === filterLeague);
    }

    // Filter by sport
    if (filterSport) {
      filtered = filtered.filter(m => m.scope.sport === filterSport);
    }

    return filtered;
  };

  // Group mappings by field type
  const groupMappingsByFieldType = (mappingsList) => {
    const groups = {};

    mappingsList.forEach(mapping => {
      const fieldType = mapping.fieldType;
      if (!groups[fieldType]) {
        groups[fieldType] = [];
      }
      groups[fieldType].push(mapping);
    });

    return groups;
  };

  // Group mappings by scope level (for team view)
  const groupMappingsByScopeLevel = (mappingsList) => {
    const groups = {
      global: [],
      league: [],
      sport: [],
      team: []
    };

    mappingsList.forEach(mapping => {
      const level = mapping.scope.level;
      if (groups[level]) {
        groups[level].push(mapping);
      }
    });

    return groups;
  };

  // Get context stats for selected team
  const getTeamContext = (teamId) => {
    if (!teamId) return null;

    const teamSpecificMappings = getApplicableMappingsForTeam(teamId);
    const fieldTypeCounts = {};

    teamSpecificMappings.forEach(m => {
      fieldTypeCounts[m.fieldType] = (fieldTypeCounts[m.fieldType] || 0) + 1;
    });

    const ignoredPlayers = teamSpecificMappings.filter(m => m.mappingType === 'ignore');
    const ignoredGamesForTeam = ignoredGames.filter(g => g.teamId === teamId);

    return {
      total: teamSpecificMappings.length,
      byFieldType: fieldTypeCounts,
      ignoredPlayers: ignoredPlayers.length,
      ignoredGames: ignoredGamesForTeam.length
    };
  };

  // Available leagues and sports
  const availableLeagues = ['NCAA', 'MLB', 'MILB', 'NFL', 'NBA', 'NHL'];
  const availableSports = [
    { value: 'football', label: 'Football' },
    { value: 'mensBasketball', label: "Men's Basketball" },
    { value: 'womensBasketball', label: "Women's Basketball" },
    { value: 'baseball', label: 'Baseball' },
    { value: 'softball', label: 'Softball' }
  ];

  const currentMappings = viewMode === 'team' && selectedTeamForView
    ? getApplicableMappingsForTeam(selectedTeamForView)
    : getFilteredMappings();

  const teamContext = viewMode === 'team' && selectedTeamForView
    ? getTeamContext(selectedTeamForView)
    : null;

  const ignoredPlayers = mappings.filter(m => m.mappingType === 'ignore');

  // Render mapping card
  const renderMappingCard = (mapping) => {
    const FieldIcon = getFieldIcon(mapping.fieldType);
    const ScopeIcon = getScopeIcon(mapping.scope.level);
    const isExpanded = expandedMappings.has(mapping._id);
    const isSelected = selectedMappings.has(mapping._id);

    return (
      <div key={mapping._id} className={`mapping-card ${isSelected ? 'selected' : ''}`}>
        <div
          className="mapping-card-header"
          onClick={() => toggleMappingExpanded(mapping._id)}
        >
          <div className="mapping-main-info">
            <label
              className="checkbox-label-inline"
              onClick={(e) => e.stopPropagation()}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => toggleMappingSelection(mapping._id)}
              />
            </label>
            <div className="mapping-icon">
              <FieldIcon size={20} />
            </div>
            <div className="mapping-details">
              <h3 className="mapping-title">
                {allFieldTypes.find(f => f.value === mapping.fieldType)?.label || mapping.fieldType}
                {mapping.rules.primaryValue && (
                  <span className="primary-value-preview"> ({mapping.rules.primaryValue})</span>
                )}
              </h3>
              <div className="mapping-meta">
                <span className={`mapping-type-badge ${mapping.mappingType}`}>
                  {mapping.mappingType}
                </span>
                <span
                  className="mapping-scope"
                  style={{ color: getScopeColor(mapping.scope.level) }}
                >
                  <ScopeIcon size={12} />
                  {getScopeLabel(mapping)}
                </span>
              </div>
            </div>
          </div>

          <div className="mapping-actions-preview">
            <div className="mapping-usage-stats">
              {mapping.usageStats?.timesUsed > 0 && (
                <span className="usage-count" title="Times used">
                  {mapping.usageStats.timesUsed}× used
                </span>
              )}
            </div>
            <div className="mapping-timestamp">
              <Clock size={12} />
              <span>{new Date(mapping.createdAt).toLocaleDateString()}</span>
            </div>
            {mapping.active ? (
              <span className="status-badge active">
                <Check size={14} />
                Active
              </span>
            ) : (
              <span className="status-badge inactive">
                <X size={14} />
                Inactive
              </span>
            )}
            <span className="expand-icon">
              {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div className="mapping-card-body">
            {mapping.mappingType === 'equivalence' && (
              <div className="mapping-rules">
                <div className="rule-section">
                  <label>Primary Value:</label>
                  <div className="value-display primary">
                    {mapping.rules.primaryValue}
                  </div>
                </div>
                <div className="rule-section">
                  <label>Equivalent Values:</label>
                  <div className="equivalents-list">
                    {mapping.rules.equivalents.map((equiv, idx) => (
                      <div key={idx} className="value-display equivalent">
                        {equiv}
                      </div>
                    ))}
                  </div>
                </div>
                {mapping.rules.caseSensitive !== undefined && (
                  <div className="rule-option">
                    <Check size={14} />
                    <span>Case {mapping.rules.caseSensitive ? 'Sensitive' : 'Insensitive'}</span>
                  </div>
                )}
              </div>
            )}

            {mapping.mappingType === 'tolerance' && (
              <div className="mapping-rules">
                <div className="rule-section">
                  <label>Tolerance:</label>
                  <div className="value-display">
                    ±{mapping.rules.tolerance} {mapping.rules.toleranceType === 'percentage' ? '%' : 'units'}
                  </div>
                </div>
              </div>
            )}

            {mapping.mappingType === 'ignore' && (
              <div className="mapping-rules">
                <div className="rule-section">
                  <label>Ignored Value:</label>
                  <div className="value-display ignored">
                    {mapping.rules.primaryValue}
                  </div>
                </div>
                {mapping.rules.ignoreReason && (
                  <div className="rule-section">
                    <label>Reason:</label>
                    <div className="value-display">
                      {mapping.rules.ignoreReason}
                    </div>
                  </div>
                )}
              </div>
            )}

            {mapping.notes && (
              <div className="mapping-notes">
                <Info size={14} />
                <span>{mapping.notes}</span>
              </div>
            )}

            <div className="mapping-actions">
              <button
                className="btn-secondary btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditingMapping(mapping);
                }}
              >
                <Edit2 size={14} />
                Edit
              </button>
              <button
                className="btn-danger btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteMapping(mapping._id);
                }}
              >
                <Trash2 size={14} />
                Delete
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render grouped mappings
  const renderGroupedMappings = (mappingsList) => {
    const groups = groupMappingsByFieldType(mappingsList);
    const sortedFieldTypes = Object.keys(groups).sort();

    return (
      <div className="mappings-grouped">
        {sortedFieldTypes.map(fieldType => {
          const groupMappings = groups[fieldType];
          const fieldInfo = allFieldTypes.find(f => f.value === fieldType);
          const FieldIcon = fieldInfo?.icon || Settings;
          const isExpanded = expandedGroups.has(fieldType);

          return (
            <div key={fieldType} className="mapping-group">
              <div
                className="mapping-group-header"
                onClick={() => toggleGroupExpanded(fieldType)}
              >
                <div className="group-title">
                  <FieldIcon size={18} />
                  <h3>{fieldInfo?.label || fieldType}</h3>
                  <span className="group-count">{groupMappings.length}</span>
                </div>
                <span className="expand-icon">
                  {isExpanded ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                </span>
              </div>

              {isExpanded && (
                <div className="mapping-group-body">
                  {groupMappings.map(mapping => renderMappingCard(mapping))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Render team view - shows only team-specific mappings
  const renderTeamView = () => {
    if (!selectedTeamForView) {
      return (
        <div className="empty-state">
          <Trophy size={64} className="empty-icon" />
          <h3>Select a Team</h3>
          <p>Choose a team to view team-specific mappings</p>
        </div>
      );
    }

    const teamSpecificMappings = getApplicableMappingsForTeam(selectedTeamForView);
    const team = teams.find(t => t.teamId === selectedTeamForView);

    if (teamSpecificMappings.length === 0) {
      return (
        <div className="empty-state">
          <Trophy size={64} className="empty-icon" />
          <h3>No Team-Specific Mappings</h3>
          <p>{team?.teamName || 'This team'} has no custom mappings configured yet</p>
          <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={16} />
            Create Team Mapping
          </button>
        </div>
      );
    }

    return (
      <div className="team-view-container">
        <div className="team-view-content">
          {renderGroupedMappings(teamSpecificMappings)}
        </div>
      </div>
    );
  };

  // Render ignored items tab
  const renderIgnoredItems = () => {
    const team = selectedTeamForView ? teams.find(t => t.teamId === selectedTeamForView) : null;
    const filteredIgnoredPlayers = selectedTeamForView
      ? ignoredPlayers.filter(m => m.scope.teamId === selectedTeamForView)
      : ignoredPlayers;
    const filteredIgnoredGames = selectedTeamForView
      ? ignoredGames.filter(g => g.teamId === selectedTeamForView)
      : ignoredGames;

    return (
      <div className="ignored-items-container">
        <div className="ignored-section">
          <div className="ignored-section-header">
            <Users size={20} />
            <h3>Ignored Players</h3>
            <span className="count-badge">{filteredIgnoredPlayers.length}</span>
          </div>
          {filteredIgnoredPlayers.length === 0 ? (
            <div className="empty-state-small">
              <p>No ignored players</p>
            </div>
          ) : (
            <div className="ignored-list">
              {filteredIgnoredPlayers.map(mapping => {
                const team = teams.find(t => t.teamId === mapping.scope.teamId);
                return (
                  <div key={mapping._id} className="ignored-item">
                    <div className="ignored-item-info">
                      <EyeOff size={16} />
                      <div>
                        <div className="ignored-item-name">{mapping.rules.primaryValue}</div>
                        <div className="ignored-item-team">
                          {team ? `${team.teamName} ${team.teamNickname || ''}` : mapping.scope.teamId}
                        </div>
                        {mapping.rules.ignoreReason && (
                          <div className="ignored-item-reason">{mapping.rules.ignoreReason}</div>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleDeleteMapping(mapping._id)}
                    >
                      <X size={14} />
                      Unignore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="ignored-section">
          <div className="ignored-section-header">
            <CalendarDays size={20} />
            <h3>Ignored Schedule Games</h3>
            <span className="count-badge">{filteredIgnoredGames.length}</span>
          </div>
          {filteredIgnoredGames.length === 0 ? (
            <div className="empty-state-small">
              <p>No ignored games</p>
            </div>
          ) : (
            <div className="ignored-list">
              {filteredIgnoredGames.map(game => {
                const team = teams.find(t => t.teamId === game.teamId);
                return (
                  <div key={game._id} className="ignored-item">
                    <div className="ignored-item-info">
                      <EyeOff size={16} />
                      <div>
                        <div className="ignored-item-name">{game.opponent}</div>
                        <div className="ignored-item-team">
                          {team ? `${team.teamName} ${team.teamNickname || ''}` : game.teamId}
                        </div>
                        <div className="ignored-item-date">
                          {new Date(game.gameDate).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleUnignoreGame(game._id)}
                    >
                      <X size={14} />
                      Unignore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="field-mappings">
      <div className="mappings-header">
        <div className="header-content">
          <h1>
            <Link2 className="inline-icon" />
            Field Mappings
          </h1>
          <p className="mappings-subtitle">
            Configure data field equivalencies and transformations across sources
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={16} />
          Create Mapping
        </button>
      </div>

      {/* Tabs */}
      <div className="mappings-tabs">
        <button
          className={`tab-button ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          <Link2 size={16} />
          All Mappings
          <span className="tab-badge">{mappings.length}</span>
        </button>
        <button
          className={`tab-button ${activeTab === 'roster' ? 'active' : ''}`}
          onClick={() => setActiveTab('roster')}
        >
          <Users size={16} />
          Roster
          <span className="tab-badge">
            {mappings.filter(m => rosterFieldTypes.map(f => f.value).includes(m.fieldType)).length}
          </span>
        </button>
        <button
          className={`tab-button ${activeTab === 'schedule' ? 'active' : ''}`}
          onClick={() => setActiveTab('schedule')}
        >
          <CalendarDays size={16} />
          Schedule
          <span className="tab-badge">
            {mappings.filter(m => scheduleFieldTypes.map(f => f.value).includes(m.fieldType)).length}
          </span>
        </button>
        <button
          className={`tab-button ${activeTab === 'ignored' ? 'active' : ''}`}
          onClick={() => setActiveTab('ignored')}
        >
          <EyeOff size={16} />
          Ignored Items
          <span className="tab-badge">{ignoredPlayers.length + ignoredGames.length}</span>
        </button>
      </div>

      {/* View Mode Toggle */}
      {activeTab !== 'ignored' && (
        <div className="view-mode-controls">
          <div className="view-mode-toggle">
            <button
              className={`view-mode-btn ${viewMode === 'list' ? 'active' : ''}`}
              onClick={() => setViewMode('list')}
            >
              <List size={16} />
              List View
            </button>
            <button
              className={`view-mode-btn ${viewMode === 'team' ? 'active' : ''}`}
              onClick={() => setViewMode('team')}
            >
              <LayoutGrid size={16} />
              Team View
            </button>
          </div>

          {viewMode === 'team' && (
            <div className="team-selector">
              <Trophy size={16} />
              <select
                value={selectedTeamForView}
                onChange={(e) => setSelectedTeamForView(e.target.value)}
                className="team-select"
              >
                <option value="">Select a team...</option>
                {teams
                  .sort((a, b) => a.teamName.localeCompare(b.teamName))
                  .map(team => (
                    <option key={team.teamId} value={team.teamId}>
                      {team.teamName} {team.teamNickname || ''}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Team selector for ignored items tab */}
      {activeTab === 'ignored' && (
        <div className="view-mode-controls">
          <div className="team-selector">
            <Trophy size={16} />
            <select
              value={selectedTeamForView}
              onChange={(e) => setSelectedTeamForView(e.target.value)}
              className="team-select"
            >
              <option value="">All Teams</option>
              {teams
                .sort((a, b) => a.teamName.localeCompare(b.teamName))
                .map(team => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName} {team.teamNickname || ''}
                  </option>
                ))}
            </select>
          </div>
        </div>
      )}

      <div className="mappings-content-wrapper">
        {/* Context Panel */}
        {viewMode === 'team' && selectedTeamForView && teamContext && activeTab !== 'ignored' && (
          <div className="context-panel">
            <div className="context-header">
              <Trophy size={18} />
              <h3>
                {teams.find(t => t.teamId === selectedTeamForView)?.teamName || 'Team'} Context
              </h3>
            </div>
            <div className="context-stats">
              <div className="context-stat">
                <span className="context-stat-value">{teamContext.total}</span>
                <span className="context-stat-label">Total Mappings</span>
              </div>
              {Object.entries(teamContext.byFieldType)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([fieldType, count]) => {
                  const fieldInfo = allFieldTypes.find(f => f.value === fieldType);
                  return (
                    <div key={fieldType} className="context-stat-small">
                      <span className="context-stat-value">{count}</span>
                      <span className="context-stat-label">{fieldInfo?.label || fieldType}</span>
                    </div>
                  );
                })}
              <div className="context-divider" />
              <div className="context-stat-small">
                <span className="context-stat-value">{teamContext.ignoredPlayers}</span>
                <span className="context-stat-label">Ignored Players</span>
              </div>
              <div className="context-stat-small">
                <span className="context-stat-value">{teamContext.ignoredGames}</span>
                <span className="context-stat-label">Ignored Games</span>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <div className="mappings-main-content">
          {activeTab !== 'ignored' && viewMode === 'list' && (
            <>
              <div className="mappings-controls">
                <div className="search-input-wrapper">
                  <Search size={18} className="search-icon" />
                  <input
                    type="text"
                    placeholder="Search mappings..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="search-input"
                  />
                </div>
              </div>

              {/* Scope Level Filter Buttons */}
              <div className="scope-filter-bar">
                <span className="scope-filter-label">Scope Level:</span>
                <div className="scope-filter-buttons">
                  <button
                    className={`scope-filter-btn ${filterScope === '' ? 'active' : ''}`}
                    onClick={() => setFilterScope('')}
                  >
                    All Scopes
                    <span className="filter-count">{mappings.length}</span>
                  </button>
                  {scopeLevels.map(scope => {
                    const ScopeIcon = scope.icon;
                    const count = mappings.filter(m => m.scope.level === scope.value).length;
                    return (
                      <button
                        key={scope.value}
                        className={`scope-filter-btn ${filterScope === scope.value ? 'active' : ''}`}
                        onClick={() => setFilterScope(scope.value)}
                        style={{
                          '--scope-color': scope.color,
                          borderColor: filterScope === scope.value ? scope.color : 'transparent'
                        }}
                      >
                        <ScopeIcon size={14} />
                        {scope.label}
                        <span className="filter-count">{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {loading ? (
            <div className="loading-state">
              <Loader2 size={48} className="spinner" />
              <p>Loading mappings...</p>
            </div>
          ) : activeTab === 'ignored' ? (
            renderIgnoredItems()
          ) : viewMode === 'team' ? (
            renderTeamView()
          ) : currentMappings.length === 0 ? (
            <div className="empty-state">
              <Link2 size={64} className="empty-icon" />
              <h3>No Mappings Found</h3>
              <p>
                {searchTerm || filterFieldType || filterScope
                  ? 'Try adjusting your search or filters'
                  : 'Create your first mapping to resolve data discrepancies'}
              </p>
              <button className="btn-primary" onClick={() => setShowCreateModal(true)}>
                <Plus size={16} />
                Create First Mapping
              </button>
            </div>
          ) : (
            <>
              {viewMode === 'list' && (
                <div className="bulk-actions-bar">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selectedMappings.size === currentMappings.length && currentMappings.length > 0}
                      onChange={toggleSelectAll}
                    />
                    <span>
                      {selectedMappings.size > 0
                        ? `${selectedMappings.size} selected`
                        : 'Select all'}
                    </span>
                  </label>

                  {selectedMappings.size > 0 && (
                    <button
                      className="btn-danger"
                      onClick={handleBulkDelete}
                      disabled={deletingBulk}
                    >
                      <Trash2 size={16} />
                      {deletingBulk ? 'Deleting...' : `Delete ${selectedMappings.size} mapping(s)`}
                    </button>
                  )}
                </div>
              )}

              {renderGroupedMappings(currentMappings)}
            </>
          )}
        </div>
      </div>

      {/* Create Mapping Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Plus className="inline-icon" />
                Create New Mapping
              </h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div className="form-section">
                <label className="form-label">Mapping Type</label>
                <div className="radio-group">
                  <label className="radio-option">
                    <input
                      type="radio"
                      value="equivalence"
                      checked={newMapping.mappingType === 'equivalence'}
                      onChange={(e) => setNewMapping({ ...newMapping, mappingType: e.target.value })}
                    />
                    <div className="radio-content">
                      <strong>Equivalence</strong>
                      <span>Map different values that mean the same thing</span>
                    </div>
                  </label>
                  <label className="radio-option">
                    <input
                      type="radio"
                      value="tolerance"
                      checked={newMapping.mappingType === 'tolerance'}
                      onChange={(e) => setNewMapping({ ...newMapping, mappingType: e.target.value })}
                    />
                    <div className="radio-content">
                      <strong>Tolerance</strong>
                      <span>Allow values within a certain range</span>
                    </div>
                  </label>
                </div>
              </div>

              <div className="form-section">
                <label className="form-label">Field Type</label>
                <select
                  value={newMapping.fieldType}
                  onChange={(e) => setNewMapping({ ...newMapping, fieldType: e.target.value })}
                  className="form-select"
                >
                  <optgroup label="Roster Fields">
                    {rosterFieldTypes.map(field => (
                      <option key={field.value} value={field.value}>{field.label}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Schedule Fields">
                    {scheduleFieldTypes.map(field => (
                      <option key={field.value} value={field.value}>{field.label}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {newMapping.mappingType === 'equivalence' && (
                <div className="form-section">
                  <label className="form-label">Primary Value</label>
                  <input
                    type="text"
                    value={newMapping.rules.primaryValue}
                    onChange={(e) => setNewMapping({
                      ...newMapping,
                      rules: { ...newMapping.rules, primaryValue: e.target.value }
                    })}
                    className="form-input"
                    placeholder="Enter the primary/canonical value"
                  />

                  <label className="form-label" style={{ marginTop: '1rem' }}>
                    Equivalent Values
                  </label>
                  {newMapping.rules.equivalents.map((equiv, index) => (
                    <div key={index} className="equivalent-input-group">
                      <input
                        type="text"
                        value={equiv}
                        onChange={(e) => updateEquivalent(index, e.target.value)}
                        className="form-input"
                        placeholder="Enter an equivalent value"
                      />
                      {newMapping.rules.equivalents.length > 1 && (
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => removeEquivalent(index)}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="btn-secondary btn-sm"
                    onClick={addEquivalentField}
                    style={{ marginTop: '0.5rem' }}
                  >
                    <Plus size={14} />
                    Add Another Value
                  </button>
                </div>
              )}

              {newMapping.mappingType === 'tolerance' && (
                <div className="form-section">
                  <label className="form-label">Tolerance Value</label>
                  <input
                    type="number"
                    value={newMapping.rules.tolerance}
                    onChange={(e) => setNewMapping({
                      ...newMapping,
                      rules: { ...newMapping.rules, tolerance: parseFloat(e.target.value) || 0 }
                    })}
                    className="form-input"
                    placeholder="Enter tolerance value"
                  />

                  <label className="form-label" style={{ marginTop: '1rem' }}>Tolerance Type</label>
                  <div className="radio-group">
                    <label className="radio-option">
                      <input
                        type="radio"
                        value="absolute"
                        checked={newMapping.rules.toleranceType === 'absolute'}
                        onChange={(e) => setNewMapping({
                          ...newMapping,
                          rules: { ...newMapping.rules, toleranceType: e.target.value }
                        })}
                      />
                      <div className="radio-content">
                        <strong>Absolute</strong>
                        <span>±5 units</span>
                      </div>
                    </label>
                    <label className="radio-option">
                      <input
                        type="radio"
                        value="percentage"
                        checked={newMapping.rules.toleranceType === 'percentage'}
                        onChange={(e) => setNewMapping({
                          ...newMapping,
                          rules: { ...newMapping.rules, toleranceType: e.target.value }
                        })}
                      />
                      <div className="radio-content">
                        <strong>Percentage</strong>
                        <span>±5%</span>
                      </div>
                    </label>
                  </div>
                </div>
              )}

              <div className="form-section">
                <label className="form-label">Scope</label>
                <select
                  value={newMapping.scope.level}
                  onChange={(e) => setNewMapping({
                    ...newMapping,
                    scope: { ...newMapping.scope, level: e.target.value, teamId: '', league: '', sport: '' }
                  })}
                  className="form-select"
                >
                  {scopeLevels.map(scope => (
                    <option key={scope.value} value={scope.value}>{scope.label}</option>
                  ))}
                </select>

                {newMapping.scope.level === 'league' && (
                  <select
                    value={newMapping.scope.league}
                    onChange={(e) => setNewMapping({
                      ...newMapping,
                      scope: { ...newMapping.scope, league: e.target.value }
                    })}
                    className="form-select"
                    style={{ marginTop: '0.5rem' }}
                  >
                    <option value="">Select League</option>
                    {availableLeagues.map(league => (
                      <option key={league} value={league}>{league}</option>
                    ))}
                  </select>
                )}

                {newMapping.scope.level === 'sport' && (
                  <select
                    value={newMapping.scope.sport}
                    onChange={(e) => setNewMapping({
                      ...newMapping,
                      scope: { ...newMapping.scope, sport: e.target.value }
                    })}
                    className="form-select"
                    style={{ marginTop: '0.5rem' }}
                  >
                    <option value="">Select Sport</option>
                    {availableSports.map(sport => (
                      <option key={sport.value} value={sport.value}>{sport.label}</option>
                    ))}
                  </select>
                )}

                {newMapping.scope.level === 'team' && (
                  <select
                    value={newMapping.scope.teamId}
                    onChange={(e) => setNewMapping({
                      ...newMapping,
                      scope: { ...newMapping.scope, teamId: e.target.value }
                    })}
                    className="form-select"
                    style={{ marginTop: '0.5rem' }}
                  >
                    <option value="">Select Team</option>
                    {teams
                      .sort((a, b) => a.teamName.localeCompare(b.teamName))
                      .map(team => (
                        <option key={team.teamId} value={team.teamId}>
                          {team.teamName} {team.teamNickname || ''}
                        </option>
                      ))}
                  </select>
                )}
              </div>

              <div className="form-section">
                <label className="form-label">Notes (Optional)</label>
                <textarea
                  value={newMapping.notes}
                  onChange={(e) => setNewMapping({ ...newMapping, notes: e.target.value })}
                  className="form-textarea"
                  placeholder="Add any notes about this mapping..."
                  rows={3}
                />
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleCreateMapping}>
                <Check size={16} />
                Create Mapping
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Mapping Modal */}
      {editingMapping && (
        <div className="modal-overlay" onClick={() => setEditingMapping(null)}>
          <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>
                <Edit2 className="inline-icon" />
                Edit Mapping
              </h3>
              <button className="modal-close" onClick={() => setEditingMapping(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {editingMapping.mappingType === 'equivalence' && (
                <div className="form-section">
                  <label className="form-label">Primary Value</label>
                  <input
                    type="text"
                    value={editingMapping.rules.primaryValue}
                    onChange={(e) => setEditingMapping({
                      ...editingMapping,
                      rules: { ...editingMapping.rules, primaryValue: e.target.value }
                    })}
                    className="form-input"
                  />

                  <label className="form-label" style={{ marginTop: '1rem' }}>
                    Equivalent Values
                  </label>
                  {editingMapping.rules.equivalents.map((equiv, index) => (
                    <div key={index} className="equivalent-input-group">
                      <input
                        type="text"
                        value={equiv}
                        onChange={(e) => updateEditEquivalent(index, e.target.value)}
                        className="form-input"
                      />
                      {editingMapping.rules.equivalents.length > 1 && (
                        <button
                          className="btn-icon btn-danger"
                          onClick={() => removeEditEquivalent(index)}
                        >
                          <X size={16} />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    className="btn-secondary btn-sm"
                    onClick={addEditEquivalent}
                    style={{ marginTop: '0.5rem' }}
                  >
                    <Plus size={14} />
                    Add Another Value
                  </button>
                </div>
              )}

              <div className="form-section">
                <label className="form-label">Notes</label>
                <textarea
                  value={editingMapping.notes || ''}
                  onChange={(e) => setEditingMapping({ ...editingMapping, notes: e.target.value })}
                  className="form-textarea"
                  rows={3}
                />
              </div>

              <div className="form-section">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={editingMapping.active}
                    onChange={(e) => setEditingMapping({ ...editingMapping, active: e.target.checked })}
                  />
                  <span>Active</span>
                </label>
              </div>
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setEditingMapping(null)}>
                Cancel
              </button>
              <button className="btn-primary" onClick={handleUpdateMapping}>
                <Check size={16} />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default FieldMappings;
