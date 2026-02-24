// frontend/src/utils/exportUtils.js
import * as XLSX from 'xlsx';

/**
 * Export comparison results to CSV format
 * @param {Object} comparison - The comparison result object
 * @param {Object} metadata - Additional metadata (teamName, module, date, etc.)
 */
export const exportToCSV = (comparison, metadata = {}) => {
  const { teamName, moduleName, comparisonDate, source } = metadata;

  // Create CSV content
  let csvContent = '';

  // Header section
  csvContent += `Comparison Report\n`;
  csvContent += `Generated: ${comparisonDate || new Date().toLocaleString()}\n`;
  if (teamName) csvContent += `Team: ${teamName}\n`;
  if (moduleName) csvContent += `Module: ${moduleName}\n`;
  if (source) csvContent += `Source: ${source}\n`;
  csvContent += `\n`;

  // Summary section
  csvContent += `Summary\n`;
  csvContent += `Total Scraped,${comparison.totalScraped || 0}\n`;
  csvContent += `Total Source,${comparison.totalSource || 0}\n`;
  csvContent += `Perfect Matches,${comparison.summary?.perfectMatches || 0}\n`;
  csvContent += `With Issues,${comparison.summary?.matchesWithDiscrepancies || 0}\n`;
  csvContent += `Missing in Scraped,${comparison.missingInScraped?.length || 0}\n`;
  csvContent += `Missing in Source,${comparison.missingInSource?.length || 0}\n`;
  csvContent += `\n`;

  // Discrepancies section
  if (comparison.discrepancies && comparison.discrepancies.length > 0) {
    csvContent += `Discrepancies\n`;
    csvContent += `Player,Jersey,Field,Scraped Value,Source Value\n`;

    comparison.discrepancies.forEach(disc => {
      const playerName = disc.player || disc.displayName || 'Unknown';
      const jersey = disc.jersey || '';

      disc.discrepancies.forEach(d => {
        const field = d.field || d.category;
        const scrapedValue = escapeCSV(d.scraped || '');
        const sourceValue = escapeCSV(d.source || '');

        csvContent += `"${escapeCSV(playerName)}",${jersey},"${field}","${scrapedValue}","${sourceValue}"\n`;
      });
    });
    csvContent += `\n`;
  }

  // Missing in Scraped section
  if (comparison.missingInScraped && comparison.missingInScraped.length > 0) {
    csvContent += `Missing in Scraped Data\n`;
    csvContent += `Player,Jersey,Position\n`;

    comparison.missingInScraped.forEach(player => {
      const playerName = player.player || player.displayName || player.fullName || 'Unknown';
      const jersey = player.jersey || '';
      const position = player.position || '';

      csvContent += `"${escapeCSV(playerName)}",${jersey},"${position}"\n`;
    });
    csvContent += `\n`;
  }

  // Missing in Source section
  if (comparison.missingInSource && comparison.missingInSource.length > 0) {
    csvContent += `Missing in Source (${source || 'Oracle/API'})\n`;
    csvContent += `Player,Jersey,Position\n`;

    comparison.missingInSource.forEach(player => {
      const playerName = player.player || player.displayName || player.fullName || 'Unknown';
      const jersey = player.jersey || '';
      const position = player.position || '';

      csvContent += `"${escapeCSV(playerName)}",${jersey},"${position}"\n`;
    });
  }

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const fileName = generateFileName(metadata, 'csv');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export comparison results to Excel format
 * @param {Object} comparison - The comparison result object
 * @param {Object} metadata - Additional metadata (teamName, module, date, etc.)
 */
export const exportToExcel = (comparison, metadata = {}) => {
  const { teamName, moduleName, comparisonDate, source } = metadata;

  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Summary Sheet
  const summaryData = [
    ['Comparison Report'],
    ['Generated', comparisonDate || new Date().toLocaleString()],
    ['Team', teamName || 'N/A'],
    ['Module', moduleName || 'N/A'],
    ['Source', source || 'N/A'],
    [],
    ['Summary'],
    ['Total Scraped', comparison.totalScraped || 0],
    ['Total Source', comparison.totalSource || 0],
    ['Perfect Matches', comparison.summary?.perfectMatches || 0],
    ['With Issues', comparison.summary?.matchesWithDiscrepancies || 0],
    ['Missing in Scraped', comparison.missingInScraped?.length || 0],
    ['Missing in Source', comparison.missingInSource?.length || 0]
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Discrepancies Sheet
  if (comparison.discrepancies && comparison.discrepancies.length > 0) {
    const discrepanciesData = [
      ['Player', 'Jersey', 'Field', 'Scraped Value', 'Source Value']
    ];

    comparison.discrepancies.forEach(disc => {
      const playerName = disc.player || disc.displayName || 'Unknown';
      const jersey = disc.jersey || '';

      disc.discrepancies.forEach(d => {
        const field = d.field || d.category;
        const scrapedValue = d.scraped || '';
        const sourceValue = d.source || '';

        discrepanciesData.push([playerName, jersey, field, scrapedValue, sourceValue]);
      });
    });

    const discrepanciesSheet = XLSX.utils.aoa_to_sheet(discrepanciesData);
    XLSX.utils.book_append_sheet(workbook, discrepanciesSheet, 'Discrepancies');
  }

  // Missing in Scraped Sheet
  if (comparison.missingInScraped && comparison.missingInScraped.length > 0) {
    const missingScrapedData = [
      ['Player', 'Jersey', 'Position', 'Year']
    ];

    comparison.missingInScraped.forEach(player => {
      const playerName = player.player || player.displayName || player.fullName || 'Unknown';
      const jersey = player.jersey || '';
      const position = player.position || '';
      const year = player.year || '';

      missingScrapedData.push([playerName, jersey, position, year]);
    });

    const missingScrapedSheet = XLSX.utils.aoa_to_sheet(missingScrapedData);
    XLSX.utils.book_append_sheet(workbook, missingScrapedSheet, 'Missing in Scraped');
  }

  // Missing in Source Sheet
  if (comparison.missingInSource && comparison.missingInSource.length > 0) {
    const missingSourceData = [
      ['Player', 'Jersey', 'Position', 'Year']
    ];

    comparison.missingInSource.forEach(player => {
      const playerName = player.player || player.displayName || player.fullName || 'Unknown';
      const jersey = player.jersey || '';
      const position = player.position || '';
      const year = player.year || '';

      missingSourceData.push([playerName, jersey, position, year]);
    });

    const missingSourceSheet = XLSX.utils.aoa_to_sheet(missingSourceData);
    XLSX.utils.book_append_sheet(workbook, missingSourceSheet, `Missing in ${source || 'Source'}`);
  }

  // Download the file
  const fileName = generateFileName(metadata, 'xlsx');
  XLSX.writeFile(workbook, fileName);
};

/**
 * Helper function to escape CSV values
 */
function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  // Escape quotes and wrap in quotes if contains comma, quote, or newline
  if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
    return stringValue.replace(/"/g, '""');
  }
  return stringValue;
}

/**
 * Generate filename with timestamp
 */
function generateFileName(metadata, extension) {
  const { teamName, moduleName } = metadata;
  const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

  let fileName = 'comparison-report';

  if (teamName) {
    fileName += `-${teamName.replace(/\s+/g, '-')}`;
  }

  if (moduleName) {
    fileName += `-${moduleName.replace(/\s+/g, '-')}`;
  }

  fileName += `-${timestamp}.${extension}`;

  return fileName;
}

/**
 * Export all games comparison to CSV format
 * @param {Array} allGamesResults - Array of game comparison results
 * @param {Object} metadata - Additional metadata (teamName, source, etc.)
 */
export const exportAllGamesToCSV = (allGamesResults, metadata = {}) => {
  const { teamName, comparisonDate, source } = metadata;

  // Sort games by date
  const sortedGames = [...allGamesResults].sort((a, b) => {
    return new Date(a.date) - new Date(b.date);
  });

  // Calculate aggregate statistics
  let totalGames = sortedGames.length;
  let gamesWithIssues = 0;
  let perfectGames = 0;
  let totalIssues = 0;
  let totalPlayers = 0;
  let totalMatchPercentage = 0;

  sortedGames.forEach(game => {
    const issues = game.comparison.summary?.totalStatDiscrepancies || 0;
    totalIssues += issues;
    totalPlayers += game.comparison.totalScraped || 0;
    totalMatchPercentage += game.comparison.matchPercentage || 0;

    if (issues > 0) {
      gamesWithIssues++;
    } else {
      perfectGames++;
    }
  });

  const avgMatchPercentage = totalGames > 0
    ? Math.round(totalMatchPercentage / totalGames)
    : 0;

  // Create CSV content
  let csvContent = '';

  // Header section
  csvContent += `All Games Comparison Report\n`;
  csvContent += `Generated: ${comparisonDate || new Date().toLocaleString()}\n`;
  if (teamName) csvContent += `Team: ${teamName}\n`;
  csvContent += `Source: ${source || 'Oracle Database'}\n`;
  csvContent += `\n`;

  // Aggregate Summary
  csvContent += `Aggregate Summary\n`;
  csvContent += `Total Games,${totalGames}\n`;
  csvContent += `Perfect Games,${perfectGames}\n`;
  csvContent += `Games with Issues,${gamesWithIssues}\n`;
  csvContent += `Total Issues,${totalIssues}\n`;
  csvContent += `Total Players,${totalPlayers}\n`;
  csvContent += `Average Match %,${avgMatchPercentage}%\n`;
  csvContent += `\n`;

  // Game-by-game section
  csvContent += `Game-by-Game Results\n`;
  csvContent += `Date,Opponent,Score,Scraped Count,${source === 'api' ? 'API' : 'Oracle'} Count,Match %,Issues\n`;

  sortedGames.forEach(game => {
    const date = game.date || '';
    const opponent = escapeCSV(game.opponent || 'Unknown');
    const score = game.score || 'N/A';
    const scrapedCount = game.comparison.totalScraped || 0;
    const sourceCount = game.comparison.totalSource || 0;
    const matchPercentage = game.comparison.matchPercentage || 0;
    const issues = game.comparison.summary?.totalStatDiscrepancies || 0;

    csvContent += `"${date}","${opponent}","${score}",${scrapedCount},${sourceCount},${matchPercentage}%,${issues}\n`;
  });

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const fileName = generateFileName({
    ...metadata,
    moduleName: 'All-Games'
  }, 'csv');

  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export all games comparison to Excel format
 * @param {Array} allGamesResults - Array of game comparison results
 * @param {Object} metadata - Additional metadata (teamName, source, etc.)
 */
export const exportAllGamesToExcel = (allGamesResults, metadata = {}) => {
  const { teamName, comparisonDate, source } = metadata;

  // Sort games by date
  const sortedGames = [...allGamesResults].sort((a, b) => {
    return new Date(a.date) - new Date(b.date);
  });

  // Calculate aggregate statistics
  let totalGames = sortedGames.length;
  let gamesWithIssues = 0;
  let perfectGames = 0;
  let totalIssues = 0;
  let totalPlayers = 0;
  let totalMatchPercentage = 0;

  sortedGames.forEach(game => {
    const issues = game.comparison.summary?.totalStatDiscrepancies || 0;
    totalIssues += issues;
    totalPlayers += game.comparison.totalScraped || 0;
    totalMatchPercentage += game.comparison.matchPercentage || 0;

    if (issues > 0) {
      gamesWithIssues++;
    } else {
      perfectGames++;
    }
  });

  const avgMatchPercentage = totalGames > 0
    ? Math.round(totalMatchPercentage / totalGames)
    : 0;

  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Summary Sheet
  const summaryData = [
    ['All Games Comparison Report'],
    ['Generated', comparisonDate || new Date().toLocaleString()],
    ['Team', teamName || 'N/A'],
    ['Source', source || 'Oracle Database'],
    [],
    ['Aggregate Summary'],
    ['Total Games', totalGames],
    ['Perfect Games', perfectGames],
    ['Games with Issues', gamesWithIssues],
    ['Total Issues', totalIssues],
    ['Total Players', totalPlayers],
    ['Average Match %', `${avgMatchPercentage}%`]
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Game-by-Game Sheet
  const gamesData = [
    ['Date', 'Opponent', 'Score', 'Scraped Count', `${source === 'api' ? 'API' : 'Oracle'} Count`, 'Match %', 'Issues']
  ];

  sortedGames.forEach(game => {
    const date = game.date || '';
    const opponent = game.opponent || 'Unknown';
    const score = game.score || 'N/A';
    const scrapedCount = game.comparison.totalScraped || 0;
    const sourceCount = game.comparison.totalSource || 0;
    const matchPercentage = `${game.comparison.matchPercentage || 0}%`;
    const issues = game.comparison.summary?.totalStatDiscrepancies || 0;

    gamesData.push([date, opponent, score, scrapedCount, sourceCount, matchPercentage, issues]);
  });

  const gamesSheet = XLSX.utils.aoa_to_sheet(gamesData);
  XLSX.utils.book_append_sheet(workbook, gamesSheet, 'Game-by-Game');

  // Download the file
  const fileName = generateFileName({
    ...metadata,
    moduleName: 'All-Games'
  }, 'xlsx');

  XLSX.writeFile(workbook, fileName);
};

/**
 * Export bulk comparison results to CSV format
 * @param {Object} bulkJobStatus - The bulk job status object with results
 * @param {Object} metadata - Additional metadata (league, sport, source, etc.)
 */
export const exportBulkComparisonToCSV = (bulkJobStatus, metadata = {}) => {
  const { league, sport, comparisonDate, source } = metadata;

  // Create CSV content
  let csvContent = '';

  // Header section
  csvContent += `Bulk Comparison Report\n`;
  csvContent += `Generated: ${comparisonDate || new Date().toLocaleString()}\n`;
  if (league) csvContent += `League: ${league}\n`;
  if (sport) csvContent += `Sport: ${sport}\n`;
  csvContent += `Source: ${source || 'Oracle Database'}\n`;
  csvContent += `Status: ${bulkJobStatus.status}\n`;
  csvContent += `\n`;

  // Overall Summary
  if (bulkJobStatus.overallSummary) {
    const summary = bulkJobStatus.overallSummary;
    csvContent += `Overall Summary\n`;
    csvContent += `Total Comparisons,${summary.totalComparisons || 0}\n`;
    csvContent += `Average Match %,${summary.averageMatchPercentage || 0}%\n`;
    csvContent += `Total Discrepancies,${summary.totalDiscrepancies || 0}\n`;
    csvContent += `Total Missing in Scraped,${summary.totalMissingInScraped || 0}\n`;
    csvContent += `Total Missing in Source,${summary.totalMissingInSource || 0}\n`;
    csvContent += `\n`;
  }

  // Team-by-team results
  csvContent += `Team-by-Team Results\n`;
  csvContent += `Team,Module,Status,Match %,Perfect Matches,Issues,Missing (Scraped),Missing (Source),Error\n`;

  if (bulkJobStatus.results && bulkJobStatus.results.length > 0) {
    bulkJobStatus.results.forEach(result => {
      const teamName = escapeCSV(result.teamName || 'Unknown');
      const module = escapeCSV(result.module || 'N/A');
      const status = result.status || 'unknown';

      if (result.status === 'success' && result.summary) {
        const matchPercentage = result.summary.matchPercentage || 0;
        const perfectMatches = result.summary.perfectMatches || 0;
        const issues = result.summary.matchesWithDiscrepancies || 0;
        const missingScraped = result.summary.missingInScraped || 0;
        const missingSource = result.summary.missingInSource || 0;

        csvContent += `"${teamName}","${module}","${status}",${matchPercentage}%,${perfectMatches},${issues},${missingScraped},${missingSource},""\n`;
      } else {
        const error = escapeCSV(result.error || 'Unknown error');
        csvContent += `"${teamName}","${module}","${status}",,,,,,"${error}"\n`;
      }
    });
  }

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  const fileName = generateFileName({
    ...metadata,
    teamName: league || sport || 'Bulk',
    moduleName: 'Comparison'
  }, 'csv');

  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Export bulk comparison results to Excel format
 * @param {Object} bulkJobStatus - The bulk job status object with results
 * @param {Object} metadata - Additional metadata (league, sport, source, etc.)
 */
export const exportBulkComparisonToExcel = (bulkJobStatus, metadata = {}) => {
  const { league, sport, comparisonDate, source } = metadata;

  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Summary Sheet
  const summaryData = [
    ['Bulk Comparison Report'],
    ['Generated', comparisonDate || new Date().toLocaleString()],
    ['League', league || 'N/A'],
    ['Sport', sport || 'N/A'],
    ['Source', source || 'Oracle Database'],
    ['Status', bulkJobStatus.status],
    []
  ];

  if (bulkJobStatus.overallSummary) {
    const summary = bulkJobStatus.overallSummary;
    summaryData.push(
      ['Overall Summary'],
      ['Total Comparisons', summary.totalComparisons || 0],
      ['Average Match %', `${summary.averageMatchPercentage || 0}%`],
      ['Total Discrepancies', summary.totalDiscrepancies || 0],
      ['Total Missing in Scraped', summary.totalMissingInScraped || 0],
      ['Total Missing in Source', summary.totalMissingInSource || 0]
    );
  }

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');

  // Team Results Sheet
  if (bulkJobStatus.results && bulkJobStatus.results.length > 0) {
    const resultsData = [
      ['Team', 'Module', 'Status', 'Match %', 'Perfect Matches', 'Issues', 'Missing (Scraped)', 'Missing (Source)', 'Error']
    ];

    bulkJobStatus.results.forEach(result => {
      const teamName = result.teamName || 'Unknown';
      const module = result.module || 'N/A';
      const status = result.status || 'unknown';

      if (result.status === 'success' && result.summary) {
        const matchPercentage = `${result.summary.matchPercentage || 0}%`;
        const perfectMatches = result.summary.perfectMatches || 0;
        const issues = result.summary.matchesWithDiscrepancies || 0;
        const missingScraped = result.summary.missingInScraped || 0;
        const missingSource = result.summary.missingInSource || 0;

        resultsData.push([teamName, module, status, matchPercentage, perfectMatches, issues, missingScraped, missingSource, '']);
      } else {
        const error = result.error || 'Unknown error';
        resultsData.push([teamName, module, status, '', '', '', '', '', error]);
      }
    });

    const resultsSheet = XLSX.utils.aoa_to_sheet(resultsData);
    XLSX.utils.book_append_sheet(workbook, resultsSheet, 'Team Results');
  }

  // Download the file
  const fileName = generateFileName({
    ...metadata,
    teamName: league || sport || 'Bulk',
    moduleName: 'Comparison'
  }, 'xlsx');

  XLSX.writeFile(workbook, fileName);
};
