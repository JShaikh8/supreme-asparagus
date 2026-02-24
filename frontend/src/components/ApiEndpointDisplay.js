// frontend/src/components/ApiEndpointDisplay.js
// Component to display API endpoint URLs and export buttons

import React, { useState } from 'react';
import { Link, Download, Copy, Check, FileJson, FileSpreadsheet, FileText } from 'lucide-react';

function ApiEndpointDisplay({ teamId, conference, type = 'team', sport, comparisonId, dataType = 'stats' }) {
  const [copied, setCopied] = useState(false);

  // Determine the API endpoint based on type
  const getApiUrl = () => {
    // Use the same backend URL as axios (works in both web and Electron)
    const baseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';

    if (type === 'team' && teamId) {
      const queryParams = sport ? `?sport=${sport}` : '';
      // Use the correct endpoint based on dataType (roster, schedule, or stats)
      let endpoint = 'stats'; // default
      if (dataType === 'roster') {
        endpoint = 'roster';
      } else if (dataType === 'schedule') {
        endpoint = 'schedule';
      }
      return `${baseUrl}/api/v1/teams/${teamId}/${endpoint}${queryParams}`;
    } else if (type === 'conference' && conference) {
      const queryParams = sport ? `?sport=${sport}` : '';
      return `${baseUrl}/api/v1/conferences/${encodeURIComponent(conference)}/stats${queryParams}`;
    } else if (type === 'comparison' && comparisonId) {
      return `${baseUrl}/api/v1/comparisons/${comparisonId}`;
    }
    return null;
  };

  const apiUrl = getApiUrl();

  if (!apiUrl) return null;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(apiUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getExportUrl = (format) => {
    return `${apiUrl}${apiUrl.includes('?') ? '&' : '?'}format=${format}`;
  };

  return (
    <div className="api-endpoint-display">
      <div className="api-header">
        <Link size={16} className="api-icon" />
        <h4>API Endpoint</h4>
      </div>

      <div className="api-url-container">
        <code className="api-url">{apiUrl}</code>
        <button
          className="btn-copy"
          onClick={copyToClipboard}
          title="Copy to clipboard"
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>

      <div className="export-buttons">
        <span className="export-label">Export:</span>
        <a
          href={getExportUrl('json')}
          className="btn-export btn-json"
          target="_blank"
          rel="noopener noreferrer"
        >
          <FileJson size={14} />
          JSON
        </a>
        <a
          href={getExportUrl('csv')}
          className="btn-export btn-csv"
          download
        >
          <FileText size={14} />
          CSV
        </a>
        <a
          href={getExportUrl('xlsx')}
          className="btn-export btn-excel"
          download
        >
          <FileSpreadsheet size={14} />
          Excel
        </a>
      </div>

      <p className="api-help-text">
        💡 Use this API endpoint to access data programmatically or share with other systems
      </p>
    </div>
  );
}

export default ApiEndpointDisplay;
