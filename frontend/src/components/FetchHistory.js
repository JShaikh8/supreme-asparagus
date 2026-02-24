// frontend/src/components/FetchHistory.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

function FetchHistory({ isOpen, onClose }) {
  const [history, setHistory] = useState([]);
  const [expandedItems, setExpandedItems] = useState(new Set());
  const [filter, setFilter] = useState('all'); // all, single, bulk
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      // Get single fetch history from localStorage
      const singleHistory = JSON.parse(localStorage.getItem('singleFetchHistory') || '[]');
      
      // Get bulk fetch history from server
      const bulkResponse = await axios.get('/bulk-fetch/recent?limit=50');
      
      // Combine and sort by timestamp
      const combinedHistory = [
        ...singleHistory.map(item => ({
          ...item,
          type: 'single',
          timestamp: item.timestamp || item.completedAt
        })),
        ...bulkResponse.data.map(job => ({
          ...job,
          type: 'bulk',
          timestamp: job.completedAt || job.createdAt
        }))
      ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      
      setHistory(combinedHistory);
    } catch (error) {
      console.error('Error loading history:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (id) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const clearSingleHistory = () => {
    if (window.confirm('Clear all single fetch history?')) {
      localStorage.setItem('singleFetchHistory', '[]');
      loadHistory();
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
      case 'success':
        return '✅';
      case 'failed':
        return '❌';
      case 'running':
        return '⏳';
      case 'cancelled':
        return '⚫';
      default:
        return '⏸️';
    }
  };

  const filteredHistory = history.filter(item => {
    if (filter === 'all') return true;
    return item.type === filter;
  });

  if (!isOpen) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="history-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Fetch History</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="history-controls">
          <div className="filter-buttons">
            <button 
              className={filter === 'all' ? 'active' : ''}
              onClick={() => setFilter('all')}
            >
              All ({history.length})
            </button>
            <button 
              className={filter === 'single' ? 'active' : ''}
              onClick={() => setFilter('single')}
            >
              Single ({history.filter(h => h.type === 'single').length})
            </button>
            <button 
              className={filter === 'bulk' ? 'active' : ''}
              onClick={() => setFilter('bulk')}
            >
              Bulk ({history.filter(h => h.type === 'bulk').length})
            </button>
          </div>
          
          <button 
            className="btn-secondary btn-small"
            onClick={clearSingleHistory}
          >
            Clear Single History
          </button>
        </div>

        <div className="history-content">
          {loading ? (
            <div className="loading-message">Loading history...</div>
          ) : filteredHistory.length === 0 ? (
            <div className="empty-message">No history found</div>
          ) : (
            <div className="history-items">
              {filteredHistory.map((item, index) => (
                <div key={item.id || item.jobId || index} className="history-item-wrapper">
                  <div 
                    className={`history-item-header ${item.type}`}
                    onClick={() => toggleExpand(item.id || item.jobId)}
                  >
                    <div className="history-item-main">
                      <span className="history-type-badge">
                        {item.type === 'bulk' ? '📦 BULK' : '📄 SINGLE'}
                      </span>
                      
                      {item.type === 'single' ? (
                        <>
                          <span className="history-team">{item.teamName}</span>
                          <span className="history-module">{item.moduleId?.replace(/_/g, ' ')}</span>
                        </>
                      ) : (
                        <>
                          <span className="history-league">{item.filters?.league}</span>
                          {item.filters?.conference && (
                            <span className="history-conference">{item.filters.conference}</span>
                          )}
                          <span className="history-summary">
                            {item.progress?.total} operations
                          </span>
                        </>
                      )}
                      
                      <span className={`history-status status-${item.status}`}>
                        {getStatusIcon(item.status)} {item.status}
                      </span>
                    </div>
                    
                    <div className="history-item-meta">
                      <span className="history-date">{formatDate(item.timestamp)}</span>
                      <span className="expand-icon">
                        {expandedItems.has(item.id || item.jobId) ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>

                  {expandedItems.has(item.id || item.jobId) && (
                    <div className="history-item-details">
                      {item.type === 'single' ? (
                        <div className="single-details">
                          <div className="detail-row">
                            <span className="detail-label">Team:</span>
                            <span className="detail-value">{item.teamName} ({item.teamId})</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Module:</span>
                            <span className="detail-value">{item.moduleId}</span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">Items:</span>
                            <span className="detail-value">{item.count || 0}</span>
                          </div>
                          {item.error && (
                            <div className="detail-row">
                              <span className="detail-label">Error:</span>
                              <span className="detail-value error">{item.error}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bulk-details">
                          <div className="detail-section">
                            <h4>Configuration</h4>
                            <div className="detail-row">
                              <span className="detail-label">League:</span>
                              <span className="detail-value">{item.filters?.league}</span>
                            </div>
                            {item.filters?.conference && (
                              <div className="detail-row">
                                <span className="detail-label">Conference:</span>
                                <span className="detail-value">{item.filters.conference}</span>
                              </div>
                            )}
                            {item.filters?.division && (
                              <div className="detail-row">
                                <span className="detail-label">Division:</span>
                                <span className="detail-value">{item.filters.division}</span>
                              </div>
                            )}
                            <div className="detail-row">
                              <span className="detail-label">Modules:</span>
                              <span className="detail-value">
                                {item.filters?.modules?.join(', ') || 'All available'}
                              </span>
                            </div>
                          </div>

                          <div className="detail-section">
                            <h4>Progress</h4>
                            <div className="progress-summary">
                              <div className="progress-stat">
                                <span className="stat-number">{item.progress?.completed || 0}</span>
                                <span className="stat-label">Completed</span>
                              </div>
                              <div className="progress-stat">
                                <span className="stat-number error">{item.progress?.failed || 0}</span>
                                <span className="stat-label">Failed</span>
                              </div>
                              <div className="progress-stat">
                                <span className="stat-number">{item.progress?.total || 0}</span>
                                <span className="stat-label">Total</span>
                              </div>
                            </div>
                          </div>

                          {item.results && item.results.length > 0 && (
                            <div className="detail-section">
                              <h4>Team Results ({item.results.length})</h4>
                              <div className="results-table">
                                <div className="results-header">
                                  <span>Team</span>
                                  <span>Module</span>
                                  <span>Status</span>
                                  <span>Count/Error</span>
                                </div>
                                <div className="results-body">
                                  {item.results.map((result, idx) => (
                                    <div key={idx} className={`result-row ${result.status}`}>
                                      <span>{result.teamName}</span>
                                      <span>{result.module?.replace(/_/g, ' ')}</span>
                                      <span>{getStatusIcon(result.status)}</span>
                                      <span>
                                        {result.status === 'success' 
                                          ? `${result.count} items`
                                          : result.error || 'Failed'}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FetchHistory;