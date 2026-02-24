// frontend/src/components/FetchManager.js
import React, { useState } from 'react';
import axios from 'axios';
import { useModal } from '../contexts/ModalContext';

function FetchManager({ teams }) {
  const { showAlert } = useModal();
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [fetching, setFetching] = useState(false);
  const [results, setResults] = useState([]);

  const toggleTeam = (teamId) => {
    if (selectedTeams.includes(teamId)) {
      setSelectedTeams(selectedTeams.filter(id => id !== teamId));
    } else {
      setSelectedTeams([...selectedTeams, teamId]);
    }
  };

  const fetchRosters = async () => {
    if (selectedTeams.length === 0) {
      await showAlert('Please select at least one team', 'Notice', 'info');
      return;
    }

    setFetching(true);
    setResults([]);

    try {
      // Get the selected team objects
      const teamsToFetch = teams.filter(t => selectedTeams.includes(t.internalId));
      
      // Fetch one by one to show progress
      const fetchResults = [];
      
      for (const team of teamsToFetch) {
        const baseUrl = team.scrapeConfig?.baseUrl?.replace('https://', '').replace('http://', '');
        
        if (!baseUrl) {
          fetchResults.push({
            team: team.displayName,
            success: false,
            error: 'No base URL configured'
          });
          continue;
        }

        try {
          const response = await axios.post('/fetch/roster', {
            baseUrl: baseUrl,
            teamId: team.internalId
          });
          
          fetchResults.push({
            team: team.displayName,
            success: response.data.success,
            playerCount: response.data.playerCount,
            error: response.data.error
          });
        } catch (error) {
          fetchResults.push({
            team: team.displayName,
            success: false,
            error: error.response?.data?.error || error.message
          });
        }
        
        setResults([...fetchResults]);
      }
    } catch (error) {
      await showAlert('Error during fetch: ' + error.message, 'Error', 'error');
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="fetch-manager">
      <h2>Fetch Rosters from Sidearm</h2>
      
      <div className="fetch-controls">
        <div className="team-selector">
          <h3>Select Teams to Fetch</h3>
          <div className="team-checkboxes">
            {teams.map(team => (
              <label key={team.internalId} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedTeams.includes(team.internalId)}
                  onChange={() => toggleTeam(team.internalId)}
                  disabled={fetching}
                />
                <span>{team.displayName} ({team.conference})</span>
              </label>
            ))}
          </div>
        </div>

        <div className="fetch-actions">
          <button 
            className="btn-primary"
            onClick={fetchRosters}
            disabled={fetching || selectedTeams.length === 0}
          >
            {fetching ? 'Fetching...' : `Fetch ${selectedTeams.length} Team(s)`}
          </button>
        </div>
      </div>

      {results.length > 0 && (
        <div className="fetch-results">
          <h3>Fetch Results</h3>
          <table>
            <thead>
              <tr>
                <th>Team</th>
                <th>Status</th>
                <th>Players</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {results.map((result, idx) => (
                <tr key={idx} className={result.success ? 'success' : 'error'}>
                  <td>{result.team}</td>
                  <td>{result.success ? '✅ Success' : '❌ Failed'}</td>
                  <td>{result.playerCount || '-'}</td>
                  <td>{result.error || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default FetchManager;