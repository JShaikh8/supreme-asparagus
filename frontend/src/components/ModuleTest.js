import React, { useState } from 'react';
import axios from 'axios';

function ModuleTest() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const modules = [
    'ncaa_football_roster',
    'ncaa_football_schedule',
    'ncaa_basketball_roster'
  ];

  const testModule = async (moduleType, teamId) => {
    setLoading(true);
    setError(null);
    setResults(null);
    
    try {
      const response = await axios.post(`/fetch/module/${moduleType}`, {
        teamId
      });
      setResults(response.data);
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="module-test">
      <h2>Module Testing Panel</h2>
      
      <div className="test-controls">
        <h3>Quick Tests</h3>
        {modules.map(module => (
          <button 
            key={module}
            onClick={() => testModule(module, 'NCAA_NORTHWESTERN')}
            disabled={loading}
          >
            Test {module}
          </button>
        ))}
      </div>

      {loading && <p>Loading...</p>}
      
      {error && (
        <div className="error">
          <h3>Error:</h3>
          <pre>{error}</pre>
        </div>
      )}
      
      {results && (
        <div className="results">
          <h3>Results:</h3>
          <p>Module: {results.module}</p>
          <p>Team: {results.team}</p>
          <p>Count: {results.count}</p>
          <h4>Sample Data:</h4>
          <pre>{JSON.stringify(results.data[0], null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

export default ModuleTest;