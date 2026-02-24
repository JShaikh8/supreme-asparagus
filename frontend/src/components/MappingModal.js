// frontend/src/components/MappingModal.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useModal } from '../contexts/ModalContext';
import {
  Plus,
  X,
  Check,
  Users,
  MapPin,
  Weight as WeightIcon,
  Ruler,
  GraduationCap,
  Hash,
  Home,
  School,
  Calendar,
  Globe,
  Building2,
  Activity,
  Trophy
} from 'lucide-react';

function MappingModal({
  isOpen,
  onClose,
  onSave,
  initialData = null,
  teams = []
}) {
  const { showAlert } = useModal();
  const fieldTypes = [
    { value: 'name', label: 'Player Name', icon: Users },
    { value: 'opponent', label: 'Opponent Name', icon: Trophy },
    { value: 'position', label: 'Position', icon: MapPin },
    { value: 'weight', label: 'Weight', icon: WeightIcon },
    { value: 'height', label: 'Height', icon: Ruler },
    { value: 'year', label: 'Year/Class', icon: GraduationCap },
    { value: 'jersey', label: 'Jersey Number', icon: Hash },
    { value: 'hometown', label: 'Hometown', icon: Home },
    { value: 'highSchool', label: 'High School', icon: School },
    { value: 'birthDate', label: 'Birth Date', icon: Calendar },
    { value: 'venue', label: 'Venue', icon: Building2 },
    { value: 'tv', label: 'TV Network', icon: Activity },
    { value: 'time', label: 'Game Time', icon: Calendar }
  ];

  const scopeLevels = [
    { value: 'global', label: 'Global', icon: Globe, description: 'All teams and sports' },
    { value: 'league', label: 'League', icon: Building2, description: 'Specific league only' },
    { value: 'sport', label: 'Sport', icon: Activity, description: 'Specific sport only' },
    { value: 'team', label: 'Team', icon: Trophy, description: 'Specific team only' }
  ];

  const getDefaultMapping = () => ({
    mappingType: initialData?.mappingType || 'equivalence',
    fieldType: initialData?.fieldType || 'name',
    scope: {
      level: initialData?.scope?.level || 'global',
      league: initialData?.scope?.league || '',
      sport: initialData?.scope?.sport || '',
      teamId: initialData?.scope?.teamId || ''
    },
    rules: {
      primaryValue: initialData?.rules?.primaryValue || '',
      equivalents: initialData?.rules?.equivalents || [''],
      caseSensitive: initialData?.rules?.caseSensitive || false,
      tolerance: initialData?.rules?.tolerance || 5,
      toleranceType: initialData?.rules?.toleranceType || 'absolute'
    },
    appliesTo: {
      scraped: initialData?.appliesTo?.scraped ?? true,
      api: initialData?.appliesTo?.api ?? true,
      oracle: initialData?.appliesTo?.oracle ?? true
    },
    notes: initialData?.notes || ''
  });

  const [mapping, setMapping] = useState(getDefaultMapping());

  // Update form when initialData changes
  useEffect(() => {
    if (initialData) {
      setMapping(getDefaultMapping());
    }
  }, [initialData]);

  const addEquivalentField = () => {
    setMapping({
      ...mapping,
      rules: {
        ...mapping.rules,
        equivalents: [...mapping.rules.equivalents, '']
      }
    });
  };

  const updateEquivalent = (index, value) => {
    const newEquivalents = [...mapping.rules.equivalents];
    newEquivalents[index] = value;
    setMapping({
      ...mapping,
      rules: {
        ...mapping.rules,
        equivalents: newEquivalents
      }
    });
  };

  const removeEquivalent = (index) => {
    const newEquivalents = mapping.rules.equivalents.filter((_, i) => i !== index);
    setMapping({
      ...mapping,
      rules: {
        ...mapping.rules,
        equivalents: newEquivalents
      }
    });
  };

  const handleSave = async () => {
    try {
      if (!mapping.fieldType) {
        await showAlert('Please select a field type', 'Validation Error', 'warning');
        return;
      }

      // Validate scope-specific requirements
      if (mapping.scope.level === 'league' && !mapping.scope.league) {
        await showAlert('Please select a league', 'Validation Error', 'warning');
        return;
      }

      if (mapping.scope.level === 'sport' && !mapping.scope.sport) {
        await showAlert('Please select a sport', 'Validation Error', 'warning');
        return;
      }

      if (mapping.scope.level === 'team' && !mapping.scope.teamId) {
        await showAlert('Please select a team', 'Validation Error', 'warning');
        return;
      }

      if (mapping.mappingType === 'equivalence') {
        if (!mapping.rules.primaryValue) {
          await showAlert('Please enter a primary value', 'Validation Error', 'warning');
          return;
        }
        if (mapping.rules.equivalents.filter(e => e.trim()).length === 0) {
          await showAlert('Please enter at least one equivalent value', 'Validation Error', 'warning');
          return;
        }
      }

      // Clean up the mapping object
      const cleanedMapping = {
        ...mapping,
        scope: {
          level: mapping.scope.level
        },
        rules: {
          ...mapping.rules,
          equivalents: mapping.rules.equivalents.filter(e => e.trim() !== '')
        }
      };

      // Only include scope fields that are set
      if (mapping.scope.league) cleanedMapping.scope.league = mapping.scope.league;
      if (mapping.scope.sport) cleanedMapping.scope.sport = mapping.scope.sport;
      if (mapping.scope.teamId) cleanedMapping.scope.teamId = mapping.scope.teamId;
      if (mapping.scope.playerId) cleanedMapping.scope.playerId = mapping.scope.playerId;
      if (mapping.scope.playerName) cleanedMapping.scope.playerName = mapping.scope.playerName;

      await axios.post('/mappings/create', cleanedMapping);

      await showAlert('Mapping created successfully!', 'Success', 'success');
      if (onSave) {
        onSave(cleanedMapping);
      }
      onClose();
    } catch (error) {
      console.error('Error creating mapping:', error);
      await showAlert('Failed to create mapping: ' + (error.response?.data?.error || error.message), 'Error', 'error');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content large" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>
            <Plus className="inline-icon" />
            Create Field Mapping
          </h3>
          <button className="modal-close" onClick={onClose}>
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
                  checked={mapping.mappingType === 'equivalence'}
                  onChange={(e) => setMapping({ ...mapping, mappingType: e.target.value })}
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
                  checked={mapping.mappingType === 'tolerance'}
                  onChange={(e) => setMapping({ ...mapping, mappingType: e.target.value })}
                />
                <div className="radio-content">
                  <strong>Tolerance</strong>
                  <span>Allow values within a certain range</span>
                </div>
              </label>
              <label className="radio-option">
                <input
                  type="radio"
                  value="ignore"
                  checked={mapping.mappingType === 'ignore'}
                  onChange={(e) => setMapping({ ...mapping, mappingType: e.target.value })}
                />
                <div className="radio-content">
                  <strong>Ignore</strong>
                  <span>Suppress this discrepancy (known issue)</span>
                </div>
              </label>
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">Field Type</label>
            <select
              value={mapping.fieldType}
              onChange={(e) => setMapping({ ...mapping, fieldType: e.target.value })}
              className="form-select"
            >
              {fieldTypes.map(field => (
                <option key={field.value} value={field.value}>{field.label}</option>
              ))}
            </select>
          </div>

          {mapping.mappingType === 'equivalence' && (
            <div className="form-section">
              <label className="form-label">Primary Value</label>
              <input
                type="text"
                value={mapping.rules.primaryValue}
                onChange={(e) => setMapping({
                  ...mapping,
                  rules: { ...mapping.rules, primaryValue: e.target.value }
                })}
                className="form-input"
                placeholder="Enter the primary/canonical value"
              />

              <label className="form-label" style={{ marginTop: '1rem' }}>
                Equivalent Values
              </label>
              {mapping.rules.equivalents.map((equiv, index) => (
                <div key={index} className="equivalent-input-group">
                  <input
                    type="text"
                    value={equiv}
                    onChange={(e) => updateEquivalent(index, e.target.value)}
                    className="form-input"
                    placeholder="Enter an equivalent value"
                  />
                  {mapping.rules.equivalents.length > 1 && (
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
                className="btn-secondary btn-small"
                onClick={addEquivalentField}
              >
                <Plus size={14} />
                Add Equivalent
              </button>

              <label className="checkbox-label" style={{ marginTop: '1rem' }}>
                <input
                  type="checkbox"
                  checked={mapping.rules.caseSensitive}
                  onChange={(e) => setMapping({
                    ...mapping,
                    rules: { ...mapping.rules, caseSensitive: e.target.checked }
                  })}
                />
                Case Sensitive
              </label>
            </div>
          )}

          {mapping.mappingType === 'tolerance' && (
            <div className="form-section">
              <label className="form-label">Tolerance Value</label>
              <input
                type="number"
                value={mapping.rules.tolerance}
                onChange={(e) => setMapping({
                  ...mapping,
                  rules: { ...mapping.rules, tolerance: parseFloat(e.target.value) }
                })}
                className="form-input"
                placeholder="5"
              />

              <label className="form-label" style={{ marginTop: '1rem' }}>Tolerance Type</label>
              <select
                value={mapping.rules.toleranceType}
                onChange={(e) => setMapping({
                  ...mapping,
                  rules: { ...mapping.rules, toleranceType: e.target.value }
                })}
                className="form-select"
              >
                <option value="absolute">Absolute</option>
                <option value="percentage">Percentage</option>
              </select>
            </div>
          )}

          {mapping.mappingType === 'ignore' && (
            <div className="form-section">
              <label className="form-label">Reason for Ignoring</label>
              <input
                type="text"
                value={mapping.rules.ignoreReason || ''}
                onChange={(e) => setMapping({
                  ...mapping,
                  rules: { ...mapping.rules, ignoreReason: e.target.value }
                })}
                className="form-input"
                placeholder="e.g., Known data entry issue, Player no longer active, etc."
              />
            </div>
          )}

          <div className="scope-selection">
            <h4>Select Mapping Scope</h4>
            <div className="scope-buttons">
              <button
                type="button"
                className={`btn-scope global ${mapping.scope.level === 'global' ? 'active' : ''}`}
                onClick={() => setMapping({
                  ...mapping,
                  scope: { level: 'global', league: '', sport: '', teamId: '' }
                })}
              >
                <Globe size={16} />
                Global
                <span className="scope-desc">All teams and sports</span>
              </button>
              <button
                type="button"
                className={`btn-scope league ${mapping.scope.level === 'league' ? 'active' : ''}`}
                onClick={() => setMapping({
                  ...mapping,
                  scope: { ...mapping.scope, level: 'league', teamId: '', sport: '' }
                })}
              >
                <Building2 size={16} />
                League
                <span className="scope-desc">Specific league only</span>
              </button>
              <button
                type="button"
                className={`btn-scope sport ${mapping.scope.level === 'sport' ? 'active' : ''}`}
                onClick={() => setMapping({
                  ...mapping,
                  scope: { ...mapping.scope, level: 'sport', teamId: '' }
                })}
              >
                <Activity size={16} />
                Sport
                <span className="scope-desc">Specific sport only</span>
              </button>
              <button
                type="button"
                className={`btn-scope team ${mapping.scope.level === 'team' ? 'active' : ''}`}
                onClick={() => setMapping({
                  ...mapping,
                  scope: { ...mapping.scope, level: 'team', sport: '' }
                })}
              >
                <Trophy size={16} />
                Team
                <span className="scope-desc">Specific team only</span>
              </button>
            </div>

            {mapping.scope.level === 'league' && (
              <div style={{ marginTop: '1rem' }}>
                <label className="form-label">Select League</label>
                <select
                  value={mapping.scope.league}
                  onChange={(e) => setMapping({
                    ...mapping,
                    scope: { ...mapping.scope, league: e.target.value }
                  })}
                  className="form-select"
                >
                  <option value="">Select League</option>
                  <option value="NCAA">NCAA</option>
                  <option value="NFL">NFL</option>
                  <option value="NBA">NBA</option>
                  <option value="MLB">MLB</option>
                </select>
              </div>
            )}

            {mapping.scope.level === 'sport' && (
              <div style={{ marginTop: '1rem' }}>
                <label className="form-label">Select Sport</label>
                <select
                  value={mapping.scope.sport}
                  onChange={(e) => setMapping({
                    ...mapping,
                    scope: { ...mapping.scope, sport: e.target.value }
                  })}
                  className="form-select"
                >
                  <option value="">Select Sport</option>
                  <option value="football">Football</option>
                  <option value="mensBasketball">Men's Basketball</option>
                  <option value="womensBasketball">Women's Basketball</option>
                  <option value="baseball">Baseball</option>
                  <option value="softball">Softball</option>
                </select>
              </div>
            )}

            {mapping.scope.level === 'team' && (
              <div style={{ marginTop: '1rem' }}>
                <label className="form-label">Select Team</label>
                <select
                  value={mapping.scope.teamId}
                  onChange={(e) => setMapping({
                    ...mapping,
                    scope: { ...mapping.scope, teamId: e.target.value }
                  })}
                  className="form-select"
                >
                  <option value="">Select Team</option>
                  {teams.map(team => (
                    <option key={team.teamId} value={team.teamId}>
                      {team.teamName} {team.teamNickname || ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="form-section">
            <label className="form-label">Applies To</label>
            <div className="checkbox-group">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={mapping.appliesTo.scraped}
                  onChange={(e) => setMapping({
                    ...mapping,
                    appliesTo: { ...mapping.appliesTo, scraped: e.target.checked }
                  })}
                />
                Scraped Data
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={mapping.appliesTo.api}
                  onChange={(e) => setMapping({
                    ...mapping,
                    appliesTo: { ...mapping.appliesTo, api: e.target.checked }
                  })}
                />
                Stats API
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={mapping.appliesTo.oracle}
                  onChange={(e) => setMapping({
                    ...mapping,
                    appliesTo: { ...mapping.appliesTo, oracle: e.target.checked }
                  })}
                />
                Oracle Database
              </label>
            </div>
          </div>

          <div className="form-section">
            <label className="form-label">Notes (Optional)</label>
            <textarea
              value={mapping.notes}
              onChange={(e) => setMapping({ ...mapping, notes: e.target.value })}
              className="form-textarea"
              placeholder="Add any notes about this mapping..."
              rows={3}
            />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            <Check size={16} />
            Create Mapping
          </button>
        </div>
      </div>
    </div>
  );
}

export default MappingModal;
