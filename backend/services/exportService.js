// backend/services/exportService.js
// Service for exporting data in various formats (JSON, CSV, Excel)

const ExcelJS = require('exceljs');
const logger = require('../utils/logger');

class ExportService {
  /**
   * Export data as JSON
   */
  toJSON(data, res, filename = 'export') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.json"`);
    return res.json(data);
  }

  /**
   * Export data as CSV
   */
  toCSV(data, res, filename = 'export') {
    try {
      if (!Array.isArray(data) || data.length === 0) {
        return res.status(400).json({ error: 'No data to export' });
      }

      // Flatten nested objects for CSV
      const flattenedData = data.map(item => this.flattenObject(item));

      // Get all unique headers
      const headers = [...new Set(flattenedData.flatMap(obj => Object.keys(obj)))];

      // Build CSV content
      let csv = headers.join(',') + '\n';

      flattenedData.forEach(row => {
        const values = headers.map(header => {
          const value = row[header];
          // Escape values that contain commas, quotes, or newlines
          if (value === null || value === undefined) return '';
          const stringValue = String(value);
          if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
            return `"${stringValue.replace(/"/g, '""')}"`;
          }
          return stringValue;
        });
        csv += values.join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
      return res.send(csv);

    } catch (error) {
      logger.error('CSV export error:', error);
      return res.status(500).json({ error: 'Failed to generate CSV' });
    }
  }

  /**
   * Export data as Excel with multiple sheets
   */
  async toExcel(data, res, filename = 'export', options = {}) {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'Sports Data Platform';
      workbook.created = new Date();

      // Handle single sheet vs multiple sheets
      if (options.sheets && Array.isArray(options.sheets)) {
        // Multiple sheets mode
        for (const sheetConfig of options.sheets) {
          await this.addSheetToWorkbook(workbook, sheetConfig.name, sheetConfig.data);
        }
      } else {
        // Single sheet mode
        await this.addSheetToWorkbook(workbook, options.sheetName || 'Data', data);
      }

      // Set response headers
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);

      // Write to response
      await workbook.xlsx.write(res);
      res.end();

    } catch (error) {
      logger.error('Excel export error:', error);
      if (!res.headersSent) {
        return res.status(500).json({ error: 'Failed to generate Excel file' });
      }
    }
  }

  /**
   * Add a sheet to an Excel workbook
   */
  async addSheetToWorkbook(workbook, sheetName, data) {
    if (!Array.isArray(data) || data.length === 0) {
      // Create empty sheet with message
      const sheet = workbook.addWorksheet(sheetName);
      sheet.addRow(['No data available']);
      return;
    }

    const sheet = workbook.addWorksheet(sheetName);

    // Flatten data for Excel
    const flattenedData = data.map(item => this.flattenObject(item));

    // Get headers
    const headers = [...new Set(flattenedData.flatMap(obj => Object.keys(obj)))];

    // Add header row with styling
    const headerRow = sheet.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' }
    };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' };

    // Add data rows
    flattenedData.forEach(row => {
      const values = headers.map(header => row[header] || '');
      sheet.addRow(values);
    });

    // Auto-fit columns
    sheet.columns.forEach((column, index) => {
      let maxLength = headers[index]?.length || 10;
      column.eachCell({ includeEmpty: false }, cell => {
        const cellLength = String(cell.value || '').length;
        if (cellLength > maxLength) {
          maxLength = cellLength;
        }
      });
      column.width = Math.min(maxLength + 2, 50); // Cap at 50 characters
    });

    // Add filters
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: headers.length }
    };

    // Freeze header row
    sheet.views = [
      { state: 'frozen', xSplit: 0, ySplit: 1 }
    ];
  }

  /**
   * Flatten nested objects for CSV/Excel export
   */
  flattenObject(obj, prefix = '') {
    const flattened = {};

    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;

      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;

      // Skip MongoDB internal fields
      if (key === '_id' || key === '__v') continue;

      if (value === null || value === undefined) {
        flattened[newKey] = '';
      } else if (value instanceof Date) {
        flattened[newKey] = value.toISOString();
      } else if (Array.isArray(value)) {
        // Convert arrays to JSON strings
        flattened[newKey] = JSON.stringify(value);
      } else if (typeof value === 'object' && !(value instanceof Date)) {
        // Recursively flatten nested objects
        Object.assign(flattened, this.flattenObject(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }

    return flattened;
  }

  /**
   * Format comparison data for export
   */
  formatComparisonExport(comparisonResult) {
    const sheets = [];

    // Sheet 1: Summary
    const summary = [{
      'Comparison Date': new Date(comparisonResult.createdAt).toLocaleString(),
      'Team': comparisonResult.teamId,
      'Module': comparisonResult.moduleId,
      'Source': comparisonResult.source,
      'Total Scraped Records': comparisonResult.scrapedCount,
      'Total Source Records': comparisonResult.sourceCount,
      'Matches': comparisonResult.matchCount,
      'Discrepancies': comparisonResult.discrepancyCount,
      'Missing in Scraped': comparisonResult.missingInScraped?.length || 0,
      'Missing in Source': comparisonResult.missingInSource?.length || 0
    }];
    sheets.push({ name: 'Summary', data: summary });

    // Sheet 2: Side-by-Side Comparison (matched records)
    if (comparisonResult.matches && comparisonResult.matches.length > 0) {
      const sideBySide = comparisonResult.matches.map(match => {
        const scraped = match.scrapedRecord || {};
        const source = match.sourceRecord || {};

        return {
          'Player Name (Scraped)': scraped.name || '',
          'Player Name (Source)': source.name || '',
          'Position (Scraped)': scraped.position || '',
          'Position (Source)': source.position || '',
          'Jersey (Scraped)': scraped.jersey || '',
          'Jersey (Source)': source.jersey || '',
          'Height (Scraped)': scraped.height || '',
          'Height (Source)': source.height || '',
          'Weight (Scraped)': scraped.weight || '',
          'Weight (Source)': source.weight || '',
          'Year (Scraped)': scraped.year || '',
          'Year (Source)': source.year || '',
          'Match Quality': match.confidence || 'N/A'
        };
      });
      sheets.push({ name: 'Side-by-Side', data: sideBySide });
    }

    // Sheet 3: Discrepancies
    if (comparisonResult.discrepancies && comparisonResult.discrepancies.length > 0) {
      const discrepancies = comparisonResult.discrepancies.map(disc => ({
        'Player Name': disc.playerName || disc.name || 'Unknown',
        'Field': disc.field,
        'Scraped Value': disc.scrapedValue,
        'Source Value': disc.sourceValue,
        'Severity': disc.severity || 'medium',
        'Notes': disc.notes || ''
      }));
      sheets.push({ name: 'Discrepancies', data: discrepancies });
    }

    // Sheet 4: Missing in Scraped
    if (comparisonResult.missingInScraped && comparisonResult.missingInScraped.length > 0) {
      sheets.push({ name: 'Missing in Scraped', data: comparisonResult.missingInScraped });
    }

    // Sheet 5: Missing in Source
    if (comparisonResult.missingInSource && comparisonResult.missingInSource.length > 0) {
      sheets.push({ name: 'Missing in Source', data: comparisonResult.missingInSource });
    }

    return sheets;
  }

  /**
   * Format team stats for export
   */
  formatTeamStatsExport(stats) {
    if (!Array.isArray(stats)) {
      stats = [stats];
    }

    return stats.map(stat => {
      const data = stat.data || stat;
      return {
        'Team ID': stat.teamId || data.teamId,
        'Game ID': data.gameId,
        'Season': data.season,
        'Game Date': data.gameInfo?.date,
        'Opponent': data.gameInfo?.opponent,
        'Result': data.gameInfo?.result,
        'Score': data.gameInfo?.score,
        'Players': data.players?.length || 0,
        'Fetched At': stat.source?.fetchedAt || stat.createdAt,
        'Module': stat.moduleId,
        'Valid': stat.validation?.isValid ? 'Yes' : 'No'
      };
    });
  }

  /**
   * Format team roster for export
   */
  formatTeamRosterExport(roster) {
    if (!Array.isArray(roster)) {
      roster = [roster];
    }

    return roster.map(item => {
      const data = item.data || item;
      return {
        'Team ID': item.teamId || data.teamId,
        'Player ID': data.playerId || data.rosterPlayerId,
        'First Name': data.firstName,
        'Last Name': data.lastName,
        'Full Name': data.fullName,
        'Jersey': data.jersey || data.uniformNumber,
        'Position': data.position,
        'Height': data.height,
        'Weight': data.weight,
        'Year': data.year || data.class,
        'Hometown': data.hometown,
        'High School': data.highSchool,
        'Fetched At': item.source?.fetchedAt || item.createdAt,
        'Module': item.moduleId,
        'Valid': item.validation?.isValid ? 'Yes' : 'No'
      };
    });
  }

  /**
   * Format team schedule for export
   */
  formatTeamScheduleExport(schedule) {
    if (!Array.isArray(schedule)) {
      schedule = [schedule];
    }

    return schedule.map(item => {
      const data = item.data || item;
      return {
        'Team ID': item.teamId || data.teamId,
        'Game ID': data.gameId,
        'Date': data.date,
        'Time': data.time,
        'Opponent': data.opponent,
        'Home/Away': data.locationIndicator === 'H' ? 'Home' :
                     data.locationIndicator === 'A' ? 'Away' :
                     data.locationIndicator === 'N' ? 'Neutral' : '',
        'Venue': data.venue,
        'Location': data.location,
        'Result': data.result || '',
        'Team Score': data.teamScore || '',
        'Opponent Score': data.opponentScore || '',
        'TV': data.tv || '',
        'Conference Game': data.isConferenceGame ? 'Yes' : 'No',
        'Conference': data.conference || '',
        'Tournament': data.tournament || '',
        'Status': data.status === 'A' ? 'Upcoming' : 'Completed',
        'Fetched At': item.source?.fetchedAt || item.createdAt,
        'Module': item.moduleId,
        'Valid': item.validation?.isValid ? 'Yes' : 'No'
      };
    });
  }

  /**
   * Format teams list for export
   */
  formatTeamsExport(teams) {
    return teams.map(team => ({
      'Team ID': team.teamId,
      'Team Name': team.teamName,
      'Nickname': team.teamNickname,
      'Abbreviation': team.teamAbbrev,
      'League': team.league,
      'Conference': team.conference,
      'Division': team.division,
      'Scrape Type': team.scrapeType,
      'Base URL': team.baseUrl,
      'Active': team.active ? 'Yes' : 'No',
      'Created': new Date(team.createdAt).toLocaleDateString(),
      'Updated': new Date(team.updatedAt).toLocaleDateString()
    }));
  }
}

module.exports = new ExportService();
