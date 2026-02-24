// frontend/src/components/SearchResults.js
import React from 'react';
import { Users, User, Calendar, X, Search } from 'lucide-react';

function SearchResults({ results, loading, query, onClose, onSelectResult }) {
  if (!query || query.length < 2) {
    return null;
  }

  return (
    <div className="search-results-overlay" onClick={onClose}>
      <div className="search-results-container" onClick={(e) => e.stopPropagation()}>
        <div className="search-results-header">
          <div className="search-results-title">
            <Search size={18} />
            <span>Search Results for "{query}"</span>
          </div>
          <button className="search-close-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {loading ? (
          <div className="search-loading">
            <div className="search-spinner"></div>
            <span>Searching...</span>
          </div>
        ) : (
          <div className="search-results-content">
            {results.totalResults === 0 ? (
              <div className="search-no-results">
                <Search size={48} className="no-results-icon" />
                <h3>No results found</h3>
                <p>Try adjusting your search terms</p>
              </div>
            ) : (
              <>
                {/* Teams Section */}
                {results.teams && results.teams.length > 0 && (
                  <div className="search-section">
                    <h4 className="search-section-title">
                      <Users size={16} />
                      Teams ({results.teams.length})
                    </h4>
                    <div className="search-items">
                      {results.teams.map((team, index) => (
                        <div
                          key={`team-${index}`}
                          className="search-item"
                          onClick={() => onSelectResult(team)}
                        >
                          <div className="search-item-icon team">
                            <Users size={16} />
                          </div>
                          <div className="search-item-content">
                            <div className="search-item-title">{team.displayName}</div>
                            <div className="search-item-subtitle">{team.subtitle}</div>
                          </div>
                          <div className="search-item-badge">{team.league}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Players Section */}
                {results.players && results.players.length > 0 && (
                  <div className="search-section">
                    <h4 className="search-section-title">
                      <User size={16} />
                      Players ({results.players.length})
                    </h4>
                    <div className="search-items">
                      {results.players.map((player, index) => (
                        <div
                          key={`player-${index}`}
                          className="search-item"
                          onClick={() => onSelectResult(player)}
                        >
                          <div className="search-item-icon player">
                            <User size={16} />
                          </div>
                          <div className="search-item-content">
                            <div className="search-item-title">{player.displayName}</div>
                            <div className="search-item-subtitle">{player.subtitle}</div>
                          </div>
                          {player.position && (
                            <div className="search-item-badge">{player.position}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Schedule Section */}
                {results.schedule && results.schedule.length > 0 && (
                  <div className="search-section">
                    <h4 className="search-section-title">
                      <Calendar size={16} />
                      Schedule ({results.schedule.length})
                    </h4>
                    <div className="search-items">
                      {results.schedule.map((game, index) => (
                        <div
                          key={`game-${index}`}
                          className="search-item"
                          onClick={() => onSelectResult(game)}
                        >
                          <div className="search-item-icon schedule">
                            <Calendar size={16} />
                          </div>
                          <div className="search-item-content">
                            <div className="search-item-title">{game.displayName}</div>
                            <div className="search-item-subtitle">{game.subtitle}</div>
                          </div>
                          {game.date && (
                            <div className="search-item-badge">{game.date}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="search-results-footer">
          <span>{results.totalResults || 0} results found</span>
        </div>
      </div>
    </div>
  );
}

export default SearchResults;
