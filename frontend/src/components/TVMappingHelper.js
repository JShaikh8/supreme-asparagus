// frontend/src/components/TVMappingHelper.js
// Helper component for mapping TV broadcasters between Oracle and Fetched data
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useToast } from '../contexts/ToastContext';
import {
  Tv,
  ArrowRight,
  Check,
  X,
  Loader2,
  AlertCircle,
  RefreshCw,
  Save,
  Link2,
  ChevronDown
} from 'lucide-react';

function TVMappingHelper({
  oracleBroadcasters = [],
  fetchedBroadcasters = [],
  scope = {},
  onMappingsCreated,
  onClose
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unmappedData, setUnmappedData] = useState(null);
  const [pendingMappings, setPendingMappings] = useState({});

  useEffect(() => {
    loadUnmappedBroadcasters();
  }, [oracleBroadcasters, fetchedBroadcasters]);

  const loadUnmappedBroadcasters = async () => {
    setLoading(true);
    try {
      // Get unique broadcasters from all games
      const uniqueOracle = [...new Set(oracleBroadcasters.flat())].filter(Boolean).sort();
      const uniqueFetched = [...new Set(fetchedBroadcasters.flat())].filter(Boolean).sort();

      const response = await axios.post('/mappings/unmapped-tv', {
        oracleBroadcasters: uniqueOracle,
        fetchedBroadcasters: uniqueFetched,
        scope
      });

      setUnmappedData(response.data);

      // Initialize pending mappings with empty values
      const initial = {};
      response.data.unmappedOracle?.forEach(b => {
        initial[b] = '';
      });
      setPendingMappings(initial);

    } catch (error) {
      console.error('Error loading unmapped broadcasters:', error);
      toast.error('Failed to load unmapped broadcasters');
    } finally {
      setLoading(false);
    }
  };

  const handleMappingChange = (oracleBroadcaster, value) => {
    setPendingMappings(prev => ({
      ...prev,
      [oracleBroadcaster]: value
    }));
  };

  const handleSaveMappings = async () => {
    // Get mappings that have been set (not empty or N/A)
    const mappingsToCreate = Object.entries(pendingMappings)
      .filter(([_, value]) => value && value !== 'N/A')
      .map(([oracle, mappedTo]) => ({ oracle, mappedTo, type: mappedTo === 'IGNORE' ? 'ignore' : 'equivalence' }));

    if (mappingsToCreate.length === 0) {
      toast.warning('No mappings to save. Select a fetched broadcaster for at least one Oracle broadcaster.');
      return;
    }

    setSaving(true);
    try {
      const response = await axios.post('/mappings/bulk-tv-mappings', {
        mappings: mappingsToCreate,
        scope: scope.level ? scope : { level: 'global' }
      });

      toast.success(`Created ${response.data.created} TV mapping(s)`);

      if (onMappingsCreated) {
        onMappingsCreated(response.data);
      }

      // Reload to show updated state
      await loadUnmappedBroadcasters();

    } catch (error) {
      console.error('Error saving mappings:', error);
      toast.error('Failed to save mappings');
    } finally {
      setSaving(false);
    }
  };

  const getMappingCount = () => {
    return Object.values(pendingMappings).filter(v => v && v !== 'N/A').length;
  };

  if (loading) {
    return (
      <div className="tv-mapping-helper loading">
        <Loader2 size={32} className="spinner" />
        <p>Analyzing TV broadcasters...</p>
      </div>
    );
  }

  if (!unmappedData) {
    return (
      <div className="tv-mapping-helper error">
        <AlertCircle size={32} />
        <p>Failed to load broadcaster data</p>
        <button className="btn-secondary" onClick={loadUnmappedBroadcasters}>
          <RefreshCw size={16} />
          Retry
        </button>
      </div>
    );
  }

  const { unmappedOracle, unmappedFetched, allFetchedOptions, existingMappings, summary } = unmappedData;

  // If nothing to map, show success state
  if (unmappedOracle.length === 0 && unmappedFetched.length === 0) {
    return (
      <div className="tv-mapping-helper success">
        <Check size={48} className="success-icon" />
        <h3>All Broadcasters Mapped!</h3>
        <p>All TV broadcasters have either direct matches or existing mappings.</p>
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-value">{summary.existingMappingsCount}</span>
            <span className="stat-label">Active Mappings</span>
          </div>
        </div>
        {onClose && (
          <button className="btn-primary" onClick={onClose}>
            Done
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="tv-mapping-helper">
      <div className="helper-header">
        <div className="header-title">
          <Tv size={24} />
          <div>
            <h3>TV Broadcaster Mapping</h3>
            <p className="header-subtitle">
              Map Oracle broadcasters to their fetched equivalents
            </p>
          </div>
        </div>
        <div className="header-actions">
          <button
            className="btn-secondary"
            onClick={loadUnmappedBroadcasters}
            disabled={loading}
          >
            <RefreshCw size={16} />
            Refresh
          </button>
          {onClose && (
            <button className="btn-secondary" onClick={onClose}>
              <X size={16} />
              Close
            </button>
          )}
        </div>
      </div>

      <div className="helper-summary">
        <div className="summary-item">
          <span className="summary-value">{summary.unmappedOracleCount}</span>
          <span className="summary-label">Unmapped Oracle</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{summary.unmappedFetchedCount}</span>
          <span className="summary-label">Unmapped Fetched</span>
        </div>
        <div className="summary-item">
          <span className="summary-value">{summary.existingMappingsCount}</span>
          <span className="summary-label">Existing Mappings</span>
        </div>
        <div className="summary-item highlight">
          <span className="summary-value">{getMappingCount()}</span>
          <span className="summary-label">Pending to Save</span>
        </div>
      </div>

      {/* Unmapped Oracle Broadcasters */}
      {unmappedOracle.length > 0 && (
        <div className="mapping-section">
          <h4>
            <span className="section-badge oracle">Oracle</span>
            Unmapped Oracle Broadcasters ({unmappedOracle.length})
          </h4>
          <p className="section-description">
            Select the corresponding fetched broadcaster for each Oracle broadcaster, or choose "N/A" if it doesn't exist in fetched data.
          </p>

          <div className="mapping-list">
            {unmappedOracle.map(broadcaster => (
              <div key={broadcaster} className="mapping-row">
                <div className="broadcaster-name oracle">
                  <Tv size={16} />
                  <span>{broadcaster}</span>
                </div>
                <div className="mapping-arrow">
                  <ArrowRight size={20} />
                </div>
                <div className="mapping-select-wrapper">
                  <select
                    value={pendingMappings[broadcaster] || ''}
                    onChange={(e) => handleMappingChange(broadcaster, e.target.value)}
                    className={`mapping-select ${pendingMappings[broadcaster] ? 'has-value' : ''}`}
                  >
                    <option value="">-- Select mapping --</option>
                    <option value="IGNORE">IGNORE (Skip in comparison)</option>
                    <option value="N/A">N/A (No equivalent)</option>
                    <optgroup label="Fetched Broadcasters">
                      {allFetchedOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </optgroup>
                  </select>
                  <ChevronDown size={16} className="select-icon" />
                </div>
                {pendingMappings[broadcaster] && pendingMappings[broadcaster] !== 'N/A' && (
                  <div className={`mapping-status ready ${pendingMappings[broadcaster] === 'IGNORE' ? 'ignore' : ''}`}>
                    {pendingMappings[broadcaster] === 'IGNORE' ? <X size={16} /> : <Check size={16} />}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmapped Fetched Broadcasters (informational) */}
      {unmappedFetched.length > 0 && (
        <div className="mapping-section info">
          <h4>
            <span className="section-badge fetched">Fetched</span>
            Unmapped Fetched Broadcasters ({unmappedFetched.length})
          </h4>
          <p className="section-description">
            These broadcasters exist in fetched data but not in Oracle. They may be available for mapping above.
          </p>
          <div className="broadcaster-chips">
            {unmappedFetched.map(broadcaster => (
              <div key={broadcaster} className="broadcaster-chip fetched">
                <Tv size={14} />
                <span>{broadcaster}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Existing Mappings (informational) */}
      {existingMappings.length > 0 && (
        <div className="mapping-section existing">
          <h4>
            <Link2 size={16} />
            Existing Mappings ({existingMappings.length})
          </h4>
          <div className="existing-mappings-list">
            {existingMappings.map((mapping, idx) => (
              <div key={idx} className="existing-mapping">
                <span className="primary">{mapping.primary}</span>
                <ArrowRight size={14} />
                <span className="equivalents">{mapping.equivalents.join(', ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      {unmappedOracle.length > 0 && (
        <div className="helper-footer">
          <div className="footer-info">
            {getMappingCount() > 0 ? (
              <span className="ready-count">
                <Check size={16} />
                {getMappingCount()} mapping(s) ready to save
              </span>
            ) : (
              <span className="no-mappings">
                Select mappings above to save
              </span>
            )}
          </div>
          <button
            className="btn-primary"
            onClick={handleSaveMappings}
            disabled={saving || getMappingCount() === 0}
          >
            {saving ? (
              <>
                <Loader2 size={16} className="spinner" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save Mappings
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default TVMappingHelper;
