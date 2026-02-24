// frontend/src/components/Settings.js
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import packageJson from '../../package.json';
import { useModal } from '../contexts/ModalContext';
import {
  RefreshCw,
  Database,
  Settings as SettingsIcon,
  Info,
  Trash2,
  Download,
  Upload,
  AlertTriangle,
  Activity,
  Save,
  RotateCcw,
  BookOpen,
  ExternalLink
} from 'lucide-react';

function Settings({
  teams,
  systemStats,
  connections,
  onRefresh,
  onReload,
  setSystemStatus
}) {
  const { showAlert, showConfirm } = useModal();
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [deletingData, setDeletingData] = useState(false);

  // App settings state
  const [appSettings, setAppSettings] = useState({
    requestTimeout: 30,
    maxRetryAttempts: 3,
    autoRefreshInterval: 60,
    dataRetentionPeriod: 30
  });
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsModified, setSettingsModified] = useState(false);

  // Modal states for password and confirmations
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showTextInputModal, setShowTextInputModal] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [textInput, setTextInput] = useState('');
  const [modalConfig, setModalConfig] = useState({
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    confirmText: 'Confirm',
    cancelText: 'Cancel',
    expectedText: '',
    placeholder: ''
  });

  // Load app settings on mount
  const loadSettings = useCallback(async () => {
    try {
      setSettingsLoading(true);
      const response = await axios.get('/settings');
      if (response.data.success && response.data.settings) {
        setAppSettings({
          requestTimeout: response.data.settings.requestTimeout || 30,
          maxRetryAttempts: response.data.settings.maxRetryAttempts || 3,
          autoRefreshInterval: response.data.settings.autoRefreshInterval || 60,
          dataRetentionPeriod: response.data.settings.dataRetentionPeriod || 30
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setSettingsLoading(false);
      setSettingsModified(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Handle settings change
  const handleSettingChange = (field, value) => {
    setAppSettings(prev => ({
      ...prev,
      [field]: value
    }));
    setSettingsModified(true);
  };

  // Save settings
  const handleSaveSettings = async () => {
    try {
      setSavingSettings(true);
      await axios.put('/settings', appSettings);
      await showAlert('Settings saved successfully!', 'Success', 'success');
      setSettingsModified(false);
    } catch (error) {
      console.error('Error saving settings:', error);
      await showAlert('Failed to save settings: ' + (error.response?.data?.error || error.message), 'Error', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Reset settings to defaults
  const handleResetSettings = async () => {
    const confirmed = await showConfirm(
      'This will reset all configuration settings to their default values.\n\nContinue?',
      'Reset Settings',
      'Reset',
      'Cancel'
    );
    if (!confirmed) return;

    try {
      setSavingSettings(true);
      const response = await axios.post('/settings/reset');
      if (response.data.success && response.data.settings) {
        setAppSettings({
          requestTimeout: response.data.settings.requestTimeout,
          maxRetryAttempts: response.data.settings.maxRetryAttempts,
          autoRefreshInterval: response.data.settings.autoRefreshInterval,
          dataRetentionPeriod: response.data.settings.dataRetentionPeriod
        });
      }
      await showAlert('Settings reset to defaults!', 'Success', 'success');
      setSettingsModified(false);
    } catch (error) {
      console.error('Error resetting settings:', error);
      await showAlert('Failed to reset settings: ' + (error.response?.data?.error || error.message), 'Error', 'error');
    } finally {
      setSavingSettings(false);
    }
  };

  // Helper function for formatting bytes
  const formatBytes = (bytes, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  // Helper functions for modals
  const showPasswordPrompt = (title, message) => {
    return new Promise((resolve) => {
      setModalConfig({
        title,
        message,
        onConfirm: (password) => {
          setShowPasswordModal(false);
          setPasswordInput('');
          resolve(password);
        },
        onCancel: () => {
          setShowPasswordModal(false);
          setPasswordInput('');
          resolve(null);
        }
      });
      setShowPasswordModal(true);
    });
  };

  const showConfirmDialog = (title, message) => {
    return new Promise((resolve) => {
      setModalConfig({
        title,
        message,
        onConfirm: () => {
          setShowConfirmModal(false);
          resolve(true);
        },
        onCancel: () => {
          setShowConfirmModal(false);
          resolve(false);
        },
        confirmText: 'OK',
        cancelText: 'Cancel'
      });
      setShowConfirmModal(true);
    });
  };

  const showTextPrompt = (title, message, expectedText, placeholder) => {
    return new Promise((resolve) => {
      setModalConfig({
        title,
        message,
        expectedText,
        placeholder,
        onConfirm: (text) => {
          setShowTextInputModal(false);
          setTextInput('');
          resolve(text);
        },
        onCancel: () => {
          setShowTextInputModal(false);
          setTextInput('');
          resolve(null);
        }
      });
      setShowTextInputModal(true);
    });
  };

  // Export data handler
  const handleExportData = async (format = 'json') => {
    try {
      setExporting(true);
      const response = await axios.get('/data-management/export', {
        params: { format },
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `sportsdata_export_${Date.now()}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      await showAlert('Export completed successfully!', 'Success', 'success');
    } catch (error) {
      console.error('Export error:', error);
      await showAlert('Export failed: ' + (error.response?.data?.error || error.message), 'Error', 'error');
    } finally {
      setExporting(false);
    }
  };

  // Import data handler
  const handleImportData = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Reset the input
    event.target.value = '';

    setImporting(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('/data-management/import', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      const results = response.data.results;
      await showAlert(`Import successful!

Teams:
• Added: ${results.teams.added}
• Updated: ${results.teams.updated}
• Failed: ${results.teams.failed}`, 'Success', 'success');

      // Reload data
      onReload();
    } catch (error) {
      console.error('Import error:', error);
      await showAlert('Import failed: ' + (error.response?.data?.error || error.message), 'Error', 'error');
    } finally {
      setImporting(false);
    }
  };

  // Sync all teams handler
  const handleSyncAll = async () => {
    const confirmSync = await showConfirm(
      'This will refresh all team data from their sources.\nThis may take several minutes depending on the number of teams.\n\nContinue?',
      'Confirm Sync',
      'Continue',
      'Cancel'
    );
    if (!confirmSync) return;

    setSyncing(true);
    try {
      setSystemStatus('syncing');
      const response = await axios.post('/data-management/sync-all');

      const successful = response.data.results.filter(r => r.status === 'success').length;
      const failed = response.data.results.filter(r => r.status === 'failed').length;

      await showAlert(`Sync completed!

✓ Successful: ${successful} teams
✗ Failed: ${failed} teams`, 'Success', 'success');

      // Reload stats
      onRefresh();
      setSystemStatus('online');
    } catch (error) {
      console.error('Sync error:', error);
      await showAlert('Sync failed: ' + (error.response?.data?.error || error.message), 'Error', 'error');
      setSystemStatus('online');
    } finally {
      setSyncing(false);
    }
  };

  // Clear cache handler
  const handleClearCache = async () => {
    const confirmClear = await showConfirm(
      'This will remove:\n• Scraped data older than 30 days\n• Temporary files\n\nContinue?',
      'Confirm Clear Cache',
      'Continue',
      'Cancel'
    );
    if (!confirmClear) return;

    setClearingCache(true);
    try {
      const response = await axios.post('/data-management/clear-cache', {
        type: 'all'
      });

      const cleared = response.data.cleared;
      await showAlert(`Cache cleared successfully!

• Old records removed: ${cleared.oldScrapedData || 0}
• Temp files removed: ${cleared.tempFiles || 0}`, 'Success', 'success');

      // Reload system stats to show new sizes
      onRefresh();
    } catch (error) {
      console.error('Clear cache error:', error);
      await showAlert('Clear cache failed: ' + (error.response?.data?.error || error.message), 'Error', 'error');
    } finally {
      setClearingCache(false);
    }
  };

  // Reset database handler
  const handleResetDatabase = async () => {
    // Password prompt first
    const password = await showPasswordPrompt(
      'DANGER ZONE PASSWORD REQUIRED',
      'Enter the danger zone password to continue:'
    );

    if (!password) {
      await showConfirmDialog('Operation Cancelled', 'Password required for this operation.');
      return;
    }

    // First confirmation
    const firstConfirm = await showConfirmDialog(
      'WARNING',
      'This will PERMANENTLY delete:\n• All teams\n• All scraped data\n• All mappings\n• All configurations\n\nThis action CANNOT be undone!\n\nAre you sure you want to continue?'
    );
    if (!firstConfirm) return;

    // Second confirmation with text input
    const confirmation = await showTextPrompt(
      'Final Warning',
      'To confirm database reset, type exactly: RESET_ALL_DATA',
      'RESET_ALL_DATA',
      'Type RESET_ALL_DATA'
    );

    if (confirmation !== 'RESET_ALL_DATA') {
      await showConfirmDialog('Operation Cancelled', 'Confirmation text did not match.');
      return;
    }

    setResetting(true);
    try {
      console.log('Attempting reset with password:', password ? '[password provided]' : '[no password]');
      const response = await axios.post('/data-management/reset-database', {
        confirm: 'RESET_ALL_DATA',
        password: password
      });

      console.log('Reset successful:', response.data);

      await showConfirmDialog(
        'Database Reset Successful',
        `Deleted:\n• ${response.data.deleted.teams} teams\n• ${response.data.deleted.scrapedData} scraped records\n• ${response.data.deleted.mappings} mappings\n\nThe application will now reload.`
      );

      // Reload entire application
      window.location.reload();
    } catch (error) {
      console.error('Reset error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);

      const errorMessage = error.response?.data?.error || error.message || 'Unknown error occurred';
      await showConfirmDialog('Reset Failed', errorMessage);
      setResetting(false);
      return; // Stop execution
    }
    setResetting(false);
  };

  // Delete all data except teams handler
  const handleDeleteAllData = async () => {
    // Password prompt first
    const password = await showPasswordPrompt(
      'DANGER ZONE PASSWORD REQUIRED',
      'Enter the danger zone password to continue:'
    );

    if (!password) {
      await showConfirmDialog('Operation Cancelled', 'Password required for this operation.');
      return;
    }

    // First confirmation
    const firstConfirm = await showConfirmDialog(
      'WARNING',
      'This will PERMANENTLY delete:\n• All scraped data\n• All comparisons\n• All jobs\n• All mappings (unless excluded)\n\nTeams will be preserved.\n\nThis action CANNOT be undone!\n\nContinue?'
    );
    if (!firstConfirm) return;

    // Ask which collections to exclude
    const excludeDataMappings = await showConfirmDialog(
      'Preserve Data Mappings?',
      'Do you want to PRESERVE data mappings?\n\nClick OK to keep mappings, Cancel to delete them.'
    );

    const excludeComparisons = await showConfirmDialog(
      'Preserve Comparison Results?',
      'Do you want to PRESERVE comparison results?\n\nClick OK to keep comparison results, Cancel to delete them.'
    );

    // Final confirmation
    const confirmation = await showTextPrompt(
      'Final Confirmation',
      'To confirm deletion, type exactly: DELETE_ALL_DATA',
      'DELETE_ALL_DATA',
      'Type DELETE_ALL_DATA'
    );

    if (confirmation !== 'DELETE_ALL_DATA') {
      await showConfirmDialog('Operation Cancelled', 'Confirmation text did not match.');
      return;
    }

    const excludeCollections = [];
    if (excludeDataMappings) excludeCollections.push('dataMappings');
    if (excludeComparisons) excludeCollections.push('comparisons', 'comparisonJobs');

    setDeletingData(true);
    try {
      console.log('Attempting deletion with password:', password ? '[password provided]' : '[no password]');
      const response = await axios.post('/data-management/delete-all-data', {
        confirm: 'DELETE_ALL_DATA',
        password: password,
        excludeCollections
      });

      console.log('Deletion successful:', response.data);

      const deleted = response.data.deleted;
      const excludedInfo = excludeCollections.length > 0
        ? `\n\nExcluded: ${excludeCollections.join(', ')}`
        : '';

      await showConfirmDialog(
        'Data Deleted Successfully',
        `Deleted:\n• ${deleted.scrapedData} scraped records\n• ${deleted.comparisons === 'excluded' ? 'Excluded' : deleted.comparisons + ' comparisons'}\n• ${deleted.comparisonJobs === 'excluded' ? 'Excluded' : deleted.comparisonJobs + ' comparison jobs'}\n• ${deleted.fetchJobs} fetch jobs\n• ${deleted.dataMappings === 'excluded' ? 'Excluded' : deleted.dataMappings + ' data mappings'}${excludedInfo}\n\nTeams preserved: ${teams.length}\n\nThe application will now reload.`
      );

      // Reload entire application
      window.location.reload();
    } catch (error) {
      console.error('Delete data error:', error);
      console.error('Error response:', error.response?.data);
      console.error('Error status:', error.response?.status);

      const errorMessage = error.response?.data?.error || error.message || 'Unknown error occurred';
      await showConfirmDialog('Delete Failed', errorMessage);
      setDeletingData(false);
      return; // Stop execution
    }
    setDeletingData(false);
  };

  return (
    <div className="settings">
      <div className="settings-header">
        <div className="header-content">
          <h1>Settings</h1>
          <p className="settings-subtitle">Manage your application configuration and preferences</p>
        </div>
        <div className="header-actions">
          <button
            className="btn-outline"
            onClick={onRefresh}
          >
            <RefreshCw size={16} />
            <span>Refresh Stats</span>
          </button>
        </div>
      </div>

      <div className="settings-container">
        {/* Connection Status Section */}
        <div className="settings-section">
          <h2
            className="section-title clickable-title"
            onClick={() => window.open(`${axios.defaults.baseURL?.replace('/api', '')}/api/system/dashboard`, '_blank')}
            title="Click to open Health Dashboard"
          >
            <Activity size={20} />
            System Connections
            <ExternalLink size={14} className="title-link-icon" />
          </h2>
          <div className="connection-grid">
            <div className="connection-card">
              <div className="connection-header">
                <div className="connection-info">
                  <h4>Backend API</h4>
                  <p>{connections?.backend?.url || axios.defaults.baseURL}</p>
                </div>
                <span className="status-badge success">Connected</span>
              </div>
              <div className="connection-stats">
                <div className="stat">
                  <span className="stat-label">Uptime</span>
                  <span className="stat-value">
                    {connections?.backend?.uptime
                      ? `${Math.floor(connections.backend.uptime / 3600)}h ${Math.floor((connections.backend.uptime % 3600) / 60)}m`
                      : 'N/A'}
                  </span>
                </div>
                <div className="stat">
                  <span className="stat-label">Memory</span>
                  <span className="stat-value">
                    {connections?.backend?.memory?.heapUsed
                      ? `${Math.round(connections.backend.memory.heapUsed / 1024 / 1024)} MB`
                      : 'N/A'}
                  </span>
                </div>
              </div>
            </div>

            <div className="connection-card">
              <div className="connection-header">
                <div className="connection-info">
                  <h4>Oracle Database</h4>
                  <p>{connections?.oracle?.database || 'Sports Data Repository'}</p>
                </div>
                <span className={`status-badge ${connections?.oracle?.status === 'configured' ? 'success' : 'inactive'}`}>
                  {connections?.oracle?.status === 'configured' ? 'Configured' : 'Not Configured'}
                </span>
              </div>
              <div className="connection-stats">
                <div className="stat">
                  <span className="stat-label">Database</span>
                  <span className="stat-value">{connections?.oracle?.database || 'N/A'}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Status</span>
                  <span className="stat-value">{connections?.oracle?.status || 'N/A'}</span>
                </div>
              </div>
            </div>

            <div className="connection-card">
              <div className="connection-header">
                <div className="connection-info">
                  <h4>MongoDB</h4>
                  <p>{connections?.mongodb?.database || 'Local Database'}</p>
                </div>
                <span className={`status-badge ${connections?.mongodb?.status === 'connected' ? 'success' : 'error'}`}>
                  {connections?.mongodb?.status === 'connected' ? 'Running' : 'Disconnected'}
                </span>
              </div>
              <div className="connection-stats">
                <div className="stat">
                  <span className="stat-label">Collections</span>
                  <span className="stat-value">{systemStats?.summary?.totalCollections || 0}</span>
                </div>
                <div className="stat">
                  <span className="stat-label">Size</span>
                  <span className="stat-value">{systemStats?.summary?.formattedSize || '0 KB'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MongoDB Details Section */}
        {systemStats && (
          <div className="settings-section">
            <h2 className="section-title">
              <Database size={20} />
              Database Details
            </h2>
            <div className="database-details">
              <div className="db-summary">
                <div className="db-stat">
                  <label>Total Documents</label>
                  <span>{systemStats.summary.totalDocuments.toLocaleString()}</span>
                </div>
                <div className="db-stat">
                  <label>Data Size</label>
                  <span>{systemStats.summary.formattedSize}</span>
                </div>
                <div className="db-stat">
                  <label>Storage Size</label>
                  <span>{systemStats.summary.formattedStorageSize}</span>
                </div>
                <div className="db-stat">
                  <label>Collections</label>
                  <span>{systemStats.summary.totalCollections}</span>
                </div>
              </div>

              <div className="collections-table">
                <h4>Collections Breakdown</h4>
                <table>
                  <thead>
                    <tr>
                      <th>Collection</th>
                      <th>Documents</th>
                      <th>Size</th>
                      <th>Indexes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {systemStats.collections.map(col => (
                      <tr key={col.name}>
                        <td>{col.name}</td>
                        <td>{col.count.toLocaleString()}</td>
                        <td>{formatBytes(col.size)}</td>
                        <td>{col.indexes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Data Management Section */}
        <div className="settings-section">
          <h2 className="section-title">
            <Database size={20} />
            Data Management
          </h2>
          <div className="data-actions-grid">
            <button
              className={`action-card ${exporting ? 'loading' : ''}`}
              onClick={() => handleExportData('json')}
              disabled={exporting}
            >
              <div className="action-icon">
                <Download size={24} className={exporting ? 'spinning' : ''} />
              </div>
              <div className="action-content">
                <h4>{exporting ? 'Exporting...' : 'Export Data'}</h4>
                <p>Download all teams and rosters as JSON</p>
              </div>
            </button>

            <label className={`action-card ${importing ? 'loading' : ''}`} style={{ cursor: importing ? 'wait' : 'pointer' }}>
              <input
                type="file"
                accept=".json"
                onChange={handleImportData}
                style={{ display: 'none' }}
                disabled={importing}
              />
              <div className="action-icon">
                <Upload size={24} className={importing ? 'pulse' : ''} />
              </div>
              <div className="action-content">
                <h4>{importing ? 'Importing...' : 'Import Data'}</h4>
                <p>Bulk import teams from JSON file</p>
              </div>
            </label>

            <button
              className={`action-card ${syncing ? 'loading' : ''}`}
              onClick={handleSyncAll}
              disabled={syncing}
            >
              <div className="action-icon">
                <RefreshCw size={24} className={syncing ? 'spinning' : ''} />
              </div>
              <div className="action-content">
                <h4>{syncing ? 'Syncing...' : 'Sync All'}</h4>
                <p>Refresh all team data from sources</p>
              </div>
            </button>

            <button
              className={`action-card warning ${clearingCache ? 'loading' : ''}`}
              onClick={handleClearCache}
              disabled={clearingCache}
            >
              <div className="action-icon">
                <Trash2 size={24} className={clearingCache ? 'pulse' : ''} />
              </div>
              <div className="action-content">
                <h4>{clearingCache ? 'Clearing...' : 'Clear Cache'}</h4>
                <p>Remove data older than 30 days</p>
              </div>
            </button>
          </div>
        </div>

        {/* Configuration Section */}
        <div className="settings-section">
          <h2 className="section-title">
            <SettingsIcon size={20} />
            Configuration
            {settingsModified && <span className="modified-badge">Modified</span>}
          </h2>
          {settingsLoading ? (
            <div className="loading-placeholder">Loading settings...</div>
          ) : (
            <>
              <div className="config-grid">
                <div className="config-item">
                  <label>Request Timeout</label>
                  <div className="config-control">
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={appSettings.requestTimeout}
                      onChange={(e) => handleSettingChange('requestTimeout', parseInt(e.target.value) || 30)}
                    />
                    <span className="config-unit">seconds</span>
                  </div>
                </div>

                <div className="config-item">
                  <label>Max Retry Attempts</label>
                  <div className="config-control">
                    <input
                      type="number"
                      min="0"
                      max="10"
                      value={appSettings.maxRetryAttempts}
                      onChange={(e) => handleSettingChange('maxRetryAttempts', parseInt(e.target.value) || 3)}
                    />
                    <span className="config-unit">attempts</span>
                  </div>
                </div>

                <div className="config-item">
                  <label>Auto-refresh Interval</label>
                  <div className="config-control">
                    <select
                      value={appSettings.autoRefreshInterval}
                      onChange={(e) => handleSettingChange('autoRefreshInterval', parseInt(e.target.value))}
                    >
                      <option value="0">Never</option>
                      <option value="30">30 minutes</option>
                      <option value="60">1 hour</option>
                      <option value="180">3 hours</option>
                      <option value="360">6 hours</option>
                    </select>
                  </div>
                </div>

                <div className="config-item">
                  <label>Data Retention Period</label>
                  <div className="config-control">
                    <select
                      value={appSettings.dataRetentionPeriod}
                      onChange={(e) => handleSettingChange('dataRetentionPeriod', parseInt(e.target.value))}
                    >
                      <option value="7">7 days</option>
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="365">1 year</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="config-actions">
                <button
                  className={`btn-primary ${savingSettings ? 'loading' : ''}`}
                  onClick={handleSaveSettings}
                  disabled={savingSettings || !settingsModified}
                >
                  <Save size={16} />
                  {savingSettings ? 'Saving...' : 'Save Settings'}
                </button>
                <button
                  className="btn-outline"
                  onClick={handleResetSettings}
                  disabled={savingSettings}
                >
                  <RotateCcw size={16} />
                  Reset to Defaults
                </button>
              </div>
            </>
          )}
        </div>

        {/* Application Info Section */}
        <div className="settings-section">
          <h2 className="section-title">
            <Info size={20} />
            Application Information
          </h2>
          <div className="info-grid">
            <div className="info-item">
              <label>Version</label>
              <span>{packageJson.version}</span>
            </div>
            <div className="info-item">
              <label>Environment</label>
              <span>Production</span>
            </div>
            <div className="info-item">
              <label>Teams Configured</label>
              <span>{teams.length}</span>
            </div>
            <div className="info-item">
              <label>Total Data Points</label>
              <span>{systemStats?.summary?.totalDocuments || 0}</span>
            </div>
            <div className="info-item">
              <label>Last System Update</label>
              <span>{new Date().toLocaleDateString()}</span>
            </div>
            <div className="info-item">
              <label>Last Data Sync</label>
              <span>N/A</span>
            </div>
          </div>
        </div>

        {/* API Documentation Section */}
        <div className="settings-section">
          <h2 className="section-title">
            <BookOpen size={20} />
            API Documentation
          </h2>
          <div className="api-docs-grid">
            <a
              href={`${axios.defaults.baseURL?.replace('/api', '')}/api/v1/docs`}
              target="_blank"
              rel="noopener noreferrer"
              className="api-doc-card"
            >
              <div className="api-doc-icon">
                <BookOpen size={24} />
              </div>
              <div className="api-doc-content">
                <h4>Interactive API Docs</h4>
                <p>Browse endpoints with examples and try them live</p>
              </div>
              <ExternalLink size={16} className="external-icon" />
            </a>

            <a
              href={`${axios.defaults.baseURL?.replace('/api', '')}/api/v1/swagger`}
              target="_blank"
              rel="noopener noreferrer"
              className="api-doc-card"
            >
              <div className="api-doc-icon swagger">
                <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
                  <path d="M12 0C5.383 0 0 5.383 0 12s5.383 12 12 12 12-5.383 12-12S18.617 0 12 0zm0 1.144c5.995 0 10.856 4.861 10.856 10.856S17.995 22.856 12 22.856 1.144 17.995 1.144 12 6.005 1.144 12 1.144zM8.17 7.086a.544.544 0 00-.544.544v8.74c0 .3.244.544.544.544h7.66a.544.544 0 00.544-.544v-8.74a.544.544 0 00-.544-.544H8.17zm.907 1.634h5.846v1.09H9.077v-1.09zm0 2.18h5.846v1.09H9.077v-1.09zm0 2.18h5.846v1.09H9.077v-1.09zm0 2.18h3.27v1.09h-3.27v-1.09z"/>
                </svg>
              </div>
              <div className="api-doc-content">
                <h4>Swagger UI</h4>
                <p>OpenAPI specification with interactive testing</p>
              </div>
              <ExternalLink size={16} className="external-icon" />
            </a>

            <a
              href={`${axios.defaults.baseURL?.replace('/api', '')}/api/v1/openapi.json`}
              target="_blank"
              rel="noopener noreferrer"
              className="api-doc-card"
            >
              <div className="api-doc-icon json">
                {'{ }'}
              </div>
              <div className="api-doc-content">
                <h4>OpenAPI Spec (JSON)</h4>
                <p>Raw OpenAPI 3.0 specification file</p>
              </div>
              <ExternalLink size={16} className="external-icon" />
            </a>

            <a
              href={`${axios.defaults.baseURL?.replace('/api', '')}/api/system/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
              className="api-doc-card"
            >
              <div className="api-doc-icon health">
                <Activity size={24} />
              </div>
              <div className="api-doc-content">
                <h4>Health Dashboard</h4>
                <p>Real-time system status and metrics</p>
              </div>
              <ExternalLink size={16} className="external-icon" />
            </a>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="settings-section danger-zone">
          <h2 className="section-title">
            <AlertTriangle size={20} />
            Danger Zone
          </h2>
          <div className="danger-actions">
            <div className="danger-item">
              <div className="danger-info">
                <h4>Delete All Data (Keep Teams)</h4>
                <p>Permanently delete all scraped data, comparisons, and jobs. Teams will be preserved. You can exclude specific collections like data mappings.</p>
              </div>
              <button
                className={`btn-danger ${deletingData ? 'loading' : ''}`}
                onClick={handleDeleteAllData}
                disabled={deletingData}
              >
                <Trash2 size={16} />
                {deletingData ? 'Deleting...' : 'Delete All Data'}
              </button>
            </div>

            <div className="danger-item">
              <div className="danger-info">
                <h4>Reset Entire Database</h4>
                <p>This will permanently delete EVERYTHING including all teams, rosters, mappings, and scraped data. This action cannot be undone.</p>
              </div>
              <button
                className={`btn-danger ${resetting ? 'loading' : ''}`}
                onClick={handleResetDatabase}
                disabled={resetting}
              >
                <AlertTriangle size={16} />
                {resetting ? 'Resetting...' : 'Reset Database'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div className="modal-overlay" onClick={() => modalConfig.onCancel()}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalConfig.title}</h3>
            </div>
            <div className="modal-body">
              <p>{modalConfig.message}</p>
              <input
                type="password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                placeholder="Enter password"
                className="modal-input"
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && passwordInput) {
                    modalConfig.onConfirm(passwordInput);
                  }
                }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => modalConfig.onCancel()}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => passwordInput && modalConfig.onConfirm(passwordInput)}
                disabled={!passwordInput}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => modalConfig.onCancel()}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalConfig.title}</h3>
            </div>
            <div className="modal-body">
              <p style={{ whiteSpace: 'pre-line' }}>{modalConfig.message}</p>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => modalConfig.onCancel()}>
                {modalConfig.cancelText || 'Cancel'}
              </button>
              <button className="btn-primary" onClick={() => modalConfig.onConfirm()}>
                {modalConfig.confirmText || 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Text Input Modal */}
      {showTextInputModal && (
        <div className="modal-overlay" onClick={() => modalConfig.onCancel()}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{modalConfig.title}</h3>
            </div>
            <div className="modal-body">
              <p>{modalConfig.message}</p>
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={modalConfig.placeholder || 'Enter text'}
                className="modal-input"
                autoFocus
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && textInput === modalConfig.expectedText) {
                    modalConfig.onConfirm(textInput);
                  }
                }}
              />
              {textInput && textInput !== modalConfig.expectedText && (
                <p className="modal-error">Text must match exactly: {modalConfig.expectedText}</p>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => modalConfig.onCancel()}>
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={() => textInput === modalConfig.expectedText && modalConfig.onConfirm(textInput)}
                disabled={textInput !== modalConfig.expectedText}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Settings;
