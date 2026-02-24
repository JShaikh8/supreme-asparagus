// frontend/src/components/Dashboard.js
import React from 'react';
import {
  Users,
  RefreshCw,
  Database,
  GitCompare,
  Plus,
  TrendingUp,
  CheckCircle,
  ChevronRight,
  School,
  Trophy,
  Dribbble
} from 'lucide-react';

function Dashboard({ teams, stats, onRefresh, onNavigate }) {
  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <div>
          <h1>Dashboard</h1>
          <p className="dashboard-subtitle">
            Welcome back! Here's your sports data overview.
          </p>
        </div>
        <div className="dashboard-actions">
          <button className="btn-outline" onClick={onRefresh}>
            <RefreshCw size={16} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card primary">
          <div className="stat-icon">
            <Users size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">{teams.length}</div>
            <div className="stat-label">Total Teams</div>
            <div className="stat-change">
              <TrendingUp size={14} />
              <span>Active</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <School size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {teams.filter(t => t.league === 'NCAA').length}
            </div>
            <div className="stat-label">NCAA Teams</div>
            <div className="stat-change active">Active</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Trophy size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {teams.filter(t => t.league === 'MLB' || t.league === 'MILB').length}
            </div>
            <div className="stat-label">Baseball Teams</div>
            <div className="stat-change">MLB + MiLB</div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon">
            <Dribbble size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {teams.filter(t => t.league === 'NBA').length}
            </div>
            <div className="stat-label">NBA Teams</div>
            <div className="stat-change active">Active</div>
          </div>
        </div>

        <div className="stat-card success">
          <div className="stat-icon">
            <CheckCircle size={24} />
          </div>
          <div className="stat-content">
            <div className="stat-value">
              {teams.filter(t => t.autoPopulateStatus === 'success').length}
            </div>
            <div className="stat-label">Auto-Populated</div>
            <div className="stat-change">
              {Math.round((teams.filter(t => t.autoPopulateStatus === 'success').length / teams.length) * 100) || 0}% complete
            </div>
          </div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="quick-actions-card">
          <div className="card-header">
            <h3>Quick Actions</h3>
          </div>
          <div className="quick-action-grid">
            <button
              className="quick-action-item"
              onClick={() => onNavigate('teams')}
            >
              <div className="quick-action-icon">
                <Plus size={18} />
              </div>
              <span className="quick-action-label">Add Team</span>
            </button>

            <button
              className="quick-action-item"
              onClick={() => onNavigate('fetch')}
            >
              <div className="quick-action-icon">
                <RefreshCw size={18} />
              </div>
              <span className="quick-action-label">Fetch Data</span>
            </button>

            <button
              className="quick-action-item"
              onClick={() => onNavigate('compare')}
            >
              <div className="quick-action-icon">
                <GitCompare size={18} />
              </div>
              <span className="quick-action-label">Compare</span>
            </button>

            <button
              className="quick-action-item"
              onClick={() => onNavigate('data')}
            >
              <div className="quick-action-icon">
                <Database size={18} />
              </div>
              <span className="quick-action-label">View Data</span>
            </button>
          </div>
        </div>

        {stats && stats.length > 0 && (
          <div className="recent-activity-card">
            <div className="card-header">
              <h3>Recent Data Collection</h3>
              <button
                className="link-button"
                onClick={() => onNavigate('data')}
              >
                View all
                <ChevronRight size={14} />
              </button>
            </div>
            <div className="activity-list">
              {stats.slice(0, 5).map((stat, index) => (
                <div key={index} className="activity-item">
                  <div className="activity-indicator"></div>
                  <div className="activity-content">
                    <div className="activity-main">
                      <span className="activity-team">{stat._id.teamId}</span>
                      <span className="activity-badge">{stat.count} items</span>
                    </div>
                    <div className="activity-meta">
                      <span className="activity-module">{stat._id.moduleId}</span>
                      <span className="activity-time">
                        {new Date(stat.lastUpdated).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Dashboard;
