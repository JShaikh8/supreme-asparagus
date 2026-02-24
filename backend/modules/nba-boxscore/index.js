const pdfParse = require('pdf-parse');
const NBAGame = require('../../models/NBAGame');
const NBAPlayerGameLog = require('../../models/NBAPlayerGameLog');
const ScrapedData = require('../../models/ScrapedData');
const crypto = require('crypto');
const logger = require('../../utils/logger');

class NBABoxscoreModule {
  constructor() {
    this.config = {
      id: 'nba_boxscore',
      name: 'NBA Box Score',
      league: 'NBA',
      sport: 'basketball',
      dataType: 'stats'
    };
    this.scheduleUrl = 'https://cdn.nba.com/static/json/staticData/scheduleLeagueV2.json';
    this.cacheDuration = 5 * 60 * 1000; // 5 minutes cache
    this.lastFetch = null;
    this.cachedSchedule = null;
  }

  /**
   * Fetch NBA schedule (needed to build PDF URLs)
   * @returns {Promise<Object>} Schedule data
   */
  async fetchSchedule() {
    try {
      const now = Date.now();
      if (this.cachedSchedule && this.lastFetch && (now - this.lastFetch) < this.cacheDuration) {
        logger.debug('Returning cached NBA schedule');
        return this.cachedSchedule;
      }

      logger.debug('Fetching NBA schedule from API...');
      const fetch = global.fetch || require('node-fetch');
      const response = await fetch(this.scheduleUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Schedule fetch failed: ${response.status}`);
      }

      const json = await response.json();
      this.lastFetch = Date.now();
      this.cachedSchedule = json;

      return json;
    } catch (error) {
      logger.error('Error fetching NBA schedule:', error.message);
      throw new Error(`Failed to fetch NBA schedule: ${error.message}`);
    }
  }

  /**
   * Fetch NBA boxscore from the NBA CDN API via PDF
   * @param {string} gameId - NBA game ID
   * @returns {Promise<Object>} Boxscore data with home/away players
   */
  async fetchBoxscoreFromApi(gameId) {
    if (!gameId) throw new Error('gameId is required');

    // 1) Fetch the full schedule to find this game's date + code
    const schedJson = await this.fetchSchedule();

    // 2) Locate the exact game object by gameId
    let matchedGame = null;
    for (const dateEntry of schedJson.leagueSchedule.gameDates) {
      for (const g of dateEntry.games) {
        if (String(g.gameId) === String(gameId)) {
          matchedGame = g;
          break;
        }
      }
      if (matchedGame) break;
    }
    if (!matchedGame) {
      throw new Error(`Game ID ${gameId} not found in schedule JSON`);
    }

    // 3) Build PDF URL: https://statsdmz.nba.com/pdfs/YYYYMMDD/YYYYMMDD_<HOME><AWAY>_book.pdf
    const datePart = this._isoToYYYYMMDD(matchedGame.gameDateTimeEst);

    if (!matchedGame.gameCode) {
      throw new Error(`Game ${gameId} is missing gameCode property`);
    }

    const [, codePart] = matchedGame.gameCode.split('/');
    const pdfUrl = `https://statsdmz.nba.com/pdfs/${datePart}/${datePart}_${codePart}_book.pdf`;

    logger.debug(`→ Downloading PDF from: ${pdfUrl}`);

    // 4) Download PDF
    const fetch = global.fetch || require('node-fetch');
    const pdfRes = await fetch(pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36'
      }
    });

    if (!pdfRes.ok) {
      throw new Error(`PDF download failed: ${pdfRes.status} ${pdfRes.statusText}`);
    }

    const buf = await pdfRes.arrayBuffer();
    const pdfBuffer = Buffer.from(buf);

    // 5) Parse PDF
    const fullText = await this._parsePdf(pdfBuffer);

    if (!fullText) {
      throw new Error('PDF parsing returned empty or undefined text');
    }

    // 6) Truncate at copyright notice
    const truncated = fullText.split(/Copyright\s*\(c\)\s*\d{4}\s+NBA\s+Properties/)[0];

    // 7) Extract boxscore data
    try {
      const { homeTeamName, awayTeamName, homePlayers, awayPlayers } = this._extractBoxscore(truncated);

      return {
        gameId,
        gameDate: matchedGame.gameDateTimeEst.slice(0, 10),
        homeTeamName,
        awayTeamName,
        homeTeam: {
          teamId: matchedGame.homeTeam.teamId,
          tricode: matchedGame.homeTeam.teamTricode,
          teamName: homeTeamName
        },
        awayTeam: {
          teamId: matchedGame.awayTeam.teamId,
          tricode: matchedGame.awayTeam.teamTricode,
          teamName: awayTeamName
        },
        homePlayers,
        awayPlayers,
        allPlayers: [
          ...awayPlayers.map((p, idx) => ({ ...p, teamName: awayTeamName, playerOrder: idx })),
          ...homePlayers.map((p, idx) => ({ ...p, teamName: homeTeamName, playerOrder: idx }))
        ]
      };
    } catch (extractError) {
      logger.error('Error in _extractBoxscore:');
      logger.error('Error message:', extractError.message);
      logger.error('Error stack:', extractError.stack);
      logger.error('Truncated text length:', truncated?.length);
      logger.error('First 1000 chars of truncated text:', truncated?.substring(0, 1000));
      throw extractError;
    }
  }

  /**
   * Parse PDF buffer to text (first page only)
   * @private
   */
  async _parsePdf(buffer) {
    function makePagerender() {
      let pageCount = 0;
      return async function pagerender(pageData) {
        pageCount += 1;
        if (pageCount > 1) return '';

        const textContent = await pageData.getTextContent();
        const items = textContent.items;
        const rows = {};
        const tolerance = 2;

        items.forEach(item => {
          const y = item.transform[5];
          const key = Math.round(y / tolerance) * tolerance;
          if (!rows[key]) rows[key] = [];
          rows[key].push(item);
        });

        const threshold = 5;
        const lines = [];

        Object.keys(rows)
          .map(k => parseInt(k, 10))
          .sort((a, b) => b - a)
          .forEach(key => {
            const lineItems = rows[key];
            lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
            let prevX = null;
            let lineStr = '';
            lineItems.forEach(item => {
              const x = item.transform[4];
              if (prevX !== null && x - prevX > threshold) {
                lineStr += ' ';
              }
              lineStr += item.str;
              prevX = x + (item.width || 0);
            });
            lines.push(lineStr);
          });

        return lines.join('\n');
      };
    }

    logger.debug('→ Parsing PDF…');
    const options = { pagerender: makePagerender() };

    // Call pdf-parse as a function (not class constructor)
    // This properly aggregates text from the custom pagerender
    const { text } = await pdfParse(buffer, options);
    logger.debug('← Finished parsing PDF');
    return text;
  }

  /**
   * Extract boxscore data from PDF text
   * @private
   */
  _extractBoxscore(firstPageText) {
    if (!firstPageText) {
      throw new Error('firstPageText is undefined or empty');
    }

    // Title case helper
    const titleCase = (str) => {
      if (!str) {
        logger.error('titleCase received undefined/null string');
        return '';
      }
      return str
        .toLowerCase()
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
    };

    // 1) Find team headings via "(W-L)"
    const teamHeadingRegex = /([A-Za-z &''\-\.\d]+ \(\d+-\d+\))/g;
    const headings = Array.from(firstPageText.matchAll(teamHeadingRegex), m => m[1]);

    if (headings.length < 2) {
      logger.error('Found headings:', headings);
      logger.error('First 500 chars:', firstPageText.substring(0, 500));
      throw new Error('Could not find both team headings (e.g. "Boston Celtics (1-0)").');
    }

    // headings[0] is AWAY, headings[1] is HOME (based on the reference code)
    if (!headings[0] || !headings[1]) {
      throw new Error('One or both team headings are undefined');
    }

    const rawAway = headings[0].replace(/\s*\(\d+-\d+\)$/, '').trim();
    const rawHome = headings[1].replace(/\s*\(\d+-\d+\)$/, '').trim();

    const homeTeamName = titleCase(rawHome.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    const awayTeamName = titleCase(rawAway.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));

    // 2) Find header line "POS ... PTS"
    const headerLineMatch = firstPageText.match(/^POS.*PTS$/m);
    if (!headerLineMatch) {
      throw new Error('Could not find the "POS ... PTS" header line.');
    }
    const headerLine = headerLineMatch[0];

    // 3) Split on that header (expect 3 parts: before, away block, home block)
    const splitAtHeader = firstPageText.split(headerLine);
    if (splitAtHeader.length < 3) {
      logger.error('Split result length:', splitAtHeader.length);
      logger.error('First 500 chars of PDF text:', firstPageText.substring(0, 500));
      throw new Error(`Could not split on the boxscore header twice. Found ${splitAtHeader.length} parts, expected 3.`);
    }

    if (!splitAtHeader[1] || !splitAtHeader[2]) {
      throw new Error('One or both team blocks are undefined after split');
    }

    const awayBlock = splitAtHeader[1].trim();
    const homeBlock = splitAtHeader[2].trim();

    // 4) Parse each block into player objects
    const parseLines = (block, teamLabel) => {
      if (!block) {
        logger.error(`Block for ${teamLabel} is undefined or empty`);
        return [];
      }

      const lines = block.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      const players = [];

      for (let line of lines) {
        // Skip DNP, DND, NWT lines
        if (/\b(DNP|DND|NWT)\b/.test(line)) continue;

        const m = line.match(
          /^(\d+)\s*([\p{L} \.''\-]+?)(?:\s+([CFG]))?\s+(\d{1,2}:\d{2})\s+(.+)$/u
        );
        if (!m) continue;

        const [, jersey, rawName, position = null, minutes, rest] = m;
        const fields = rest.trim().split(/\s+/);
        if (fields.length < 16) continue;

        const slice16 = fields.slice(0, 16).map(v => Number(v));
        if (slice16.some(isNaN)) continue;

        const [
          fgm, fga,
          tpm, tpa,
          ftm, fta,
          offReb, defReb, totReb,
          ast, pf, stl, tov, bs, plusMinusPts, pts
        ] = slice16;

        const name = rawName
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();

        players.push({
          playerName: name,
          team: teamLabel,
          position,
          jerseyNum: jersey,
          minutes,
          fieldGoalsMade: fgm,
          fieldGoalsAttempted: fga,
          threePointersMade: tpm,
          threePointersAttempted: tpa,
          freeThrowsMade: ftm,
          freeThrowsAttempted: fta,
          offensiveRebounds: offReb,
          defensiveRebounds: defReb,
          rebounds: totReb,
          assists: ast,
          personalFouls: pf,
          steals: stl,
          turnovers: tov,
          blocks: bs,
          plusMinusPoints: plusMinusPts,
          points: pts
        });
      }
      return players;
    };

    const homePlayers = parseLines(homeBlock, 'home');
    const awayPlayers = parseLines(awayBlock, 'away');

    return { homeTeamName, awayTeamName, homePlayers, awayPlayers };
  }

  /**
   * Convert ISO datetime to YYYYMMDD format
   * @private
   */
  _isoToYYYYMMDD(iso) {
    const d = new Date(iso);
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
  }

  /**
   * Save boxscore data to ScrapedData format (for comparison tool)
   * @param {string} gameId - NBA game ID
   * @param {Object} boxscoreData - Boxscore data from fetchBoxscoreFromApi
   * @param {string} teamId - Team ID for the team being fetched
   * @returns {Promise<Array>} Saved ScrapedData documents
   */
  async saveToScrapedData(gameId, boxscoreData, teamId) {
    const saved = [];

    for (const player of boxscoreData.allPlayers) {
      const matchKey = `${teamId}_${gameId}_${player.playerName}`;

      const dataHash = crypto.createHash('sha256')
        .update(JSON.stringify(player))
        .digest('hex');

      // Create new boxscore entry (delete was done upfront by fetch module)
      const scrapedDoc = await ScrapedData.create({
        matchKey,
        moduleId: this.config.id,
        teamId: teamId,
        sport: this.config.sport,
        league: this.config.league,
        dataType: this.config.dataType,
        source: {
          url: `https://statsdmz.nba.com/pdfs`,
          name: 'NBA Stats PDF',
          fetchedAt: new Date()
        },
        data: {
          gameId,
          gameDate: boxscoreData.gameDate,
          playerName: player.playerName,
          team: player.team,
          teamName: player.teamName,
          ...player
        },
        dataHash,
        validation: { isValid: true, errors: [], warnings: [] },
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        version: 1
      });

      saved.push(scrapedDoc);
    }

    logger.debug(`Saved ${saved.length} player boxscores to ScrapedData`);
    return saved;
  }
}

module.exports = new NBABoxscoreModule();
