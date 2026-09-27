const { Readable } = require('stream');

/**
 * RFC 4180 compliant CSV Headers
 */
const HEADERS = [
  'Rank',
  'Project Title',
  'Track',
  'Team Name',
  'Team Members',
  'Raw Average',
  'Normalized Score',
  'Z-Score Mean',
  'Ballot Count',
  'Judge Comments',
];

/**
 * Escapes a single CSV field value according to RFC 4180 specification.
 * 
 * Rules:
 * 1. If the value contains commas, double quotes, or line breaks (CRLF or LF),
 *    the field MUST be enclosed in double quotes.
 * 2. If double quotes are used to enclose the field, any double quote inside
 *    the field MUST be escaped by preceding it with another double quote ("").
 * 3. Fields with leading or trailing whitespace are enclosed in double quotes
 *    to preserve whitespace integrity.
 * 4. null or undefined values produce an empty string.
 *
 * @param {any} val - Value to escape
 * @returns {string} RFC 4180 compliant string
 */
function escapeRFC4180(val) {
  if (val === null || val === undefined) {
    return '';
  }
  const str = String(val);
  const needsQuotes = /[",\r\n]/.test(str) || /^\s|\s$/.test(str);
  if (needsQuotes) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Formats a standing item into an array of values matching HEADERS.
 *
 * @param {object} item - Standing item object
 * @returns {Array<string|number>} Ordered field values
 */
function formatStandingRow(item = {}) {
  // 1. Rank
  const rank = item.rank != null ? item.rank : '';

  // 2. Project Title
  const projectTitle = item.projectTitle || item.title || '';

  // 3. Track
  const track = item.track || '';

  // 4. Team Name
  const teamName = item.teamName || item.team?.name || '';

  // 5. Team Members
  let teamMembers = '';
  if (typeof item.teamMembers === 'string') {
    teamMembers = item.teamMembers;
  } else if (Array.isArray(item.teamMembers)) {
    teamMembers = item.teamMembers
      .map((m) => (typeof m === 'object' && m ? m.name || m.fullName || m.email : String(m)))
      .filter(Boolean)
      .join(', ');
  } else if (Array.isArray(item.teamMembersList)) {
    teamMembers = item.teamMembersList
      .map((m) => (typeof m === 'object' && m ? m.name || m.fullName || m.email : String(m)))
      .filter(Boolean)
      .join(', ');
  } else if (Array.isArray(item.members)) {
    teamMembers = item.members
      .map((m) => (typeof m === 'object' && m ? m.name || m.fullName || m.email : String(m)))
      .filter(Boolean)
      .join(', ');
  } else if (item.team && Array.isArray(item.team.members)) {
    const list = [];
    if (item.team.captain) {
      const c = item.team.captain;
      list.push(typeof c === 'object' ? c.name || c.fullName || c.email : String(c));
    }
    item.team.members.forEach((m) => {
      const name = typeof m === 'object' ? m.name || m.fullName || m.email : String(m);
      if (name && !list.includes(name)) list.push(name);
    });
    teamMembers = list.filter(Boolean).join(', ');
  }

  // 6. Raw Average
  let rawAverage = 'N/A';
  if (item.rawAverage != null && !isNaN(Number(item.rawAverage))) {
    rawAverage = Number(item.rawAverage).toFixed(2);
  } else if (item.rawMean != null && !isNaN(Number(item.rawMean))) {
    rawAverage = Number(item.rawMean).toFixed(2);
  } else if (item.raw_mean != null && !isNaN(Number(item.raw_mean))) {
    rawAverage = Number(item.raw_mean).toFixed(2);
  }

  // 7. Normalized Score
  let normalizedScore = 'N/A';
  if (item.normalizedScore != null && !isNaN(Number(item.normalizedScore))) {
    normalizedScore = Number(item.normalizedScore).toFixed(2);
  } else if (item.normalized_score != null && !isNaN(Number(item.normalized_score))) {
    normalizedScore = Number(item.normalized_score).toFixed(2);
  }

  // 8. Z-Score Mean
  let zScoreMean = 'N/A';
  if (item.zScoreMean != null && !isNaN(Number(item.zScoreMean))) {
    zScoreMean = Number(item.zScoreMean).toFixed(4);
  } else if (item.zScore != null && !isNaN(Number(item.zScore))) {
    zScoreMean = Number(item.zScore).toFixed(4);
  } else if (item.z_score_mean != null && !isNaN(Number(item.z_score_mean))) {
    zScoreMean = Number(item.z_score_mean).toFixed(4);
  } else if (item.z_mean != null && !isNaN(Number(item.z_mean))) {
    zScoreMean = Number(item.z_mean).toFixed(4);
  }

  // 9. Ballot Count
  let ballotCount = 0;
  if (item.ballotCount != null && !isNaN(Number(item.ballotCount))) {
    ballotCount = Number(item.ballotCount);
  } else if (item.ballot_count != null && !isNaN(Number(item.ballot_count))) {
    ballotCount = Number(item.ballot_count);
  } else if (Array.isArray(item.ballots)) {
    ballotCount = item.ballots.length;
  }

  // 10. Judge Comments
  let judgeComments = '';
  if (typeof item.judgeComments === 'string') {
    judgeComments = item.judgeComments;
  } else if (Array.isArray(item.judgeComments)) {
    judgeComments = item.judgeComments
      .map((c) => (typeof c === 'object' && c ? c.privateNotes || c.comment || c.text || JSON.stringify(c) : String(c)))
      .filter(Boolean)
      .join('\n---\n');
  } else if (Array.isArray(item.judgeCommentsList)) {
    judgeComments = item.judgeCommentsList
      .map((c) => (typeof c === 'object' && c ? c.privateNotes || c.comment || c.text || JSON.stringify(c) : String(c)))
      .filter(Boolean)
      .join('\n---\n');
  } else if (typeof item.comments === 'string') {
    judgeComments = item.comments;
  } else if (Array.isArray(item.comments)) {
    judgeComments = item.comments.filter(Boolean).join('\n---\n');
  } else if (item.privateNotes) {
    judgeComments = String(item.privateNotes);
  }

  return [
    rank,
    projectTitle,
    track,
    teamName,
    teamMembers,
    rawAverage,
    normalizedScore,
    zScoreMean,
    ballotCount,
    judgeComments,
  ];
}

/**
 * Generates an RFC 4180 compliant CSV string from standings data.
 * Prepends UTF-8 BOM (\uFEFF) for optimal spreadsheet compatibility.
 * Delimited with CRLF (\r\n).
 *
 * @param {Array<object>} standings - Array of standing items
 * @returns {string} Complete CSV content
 */
function generateStandingsCSV(standings = []) {
  const headerLine = HEADERS.map(escapeRFC4180).join(',') + '\r\n';
  const rowLines = standings.map((item) => {
    const row = formatStandingRow(item);
    return row.map(escapeRFC4180).join(',') + '\r\n';
  });

  return '\uFEFF' + headerLine + rowLines.join('');
}

/**
 * Creates a Node.js Readable stream streaming RFC 4180 compliant CSV.
 * Streams the UTF-8 BOM and headers first, followed by each row line by line.
 *
 * @param {Array<object>} standings - Array of standing items
 * @returns {Readable} Readable stream
 */
function createStandingsCSVStream(standings = []) {
  let index = -1;
  const headerLine = '\uFEFF' + HEADERS.map(escapeRFC4180).join(',') + '\r\n';

  return new Readable({
    read() {
      // Push BOM and header row
      if (index === -1) {
        this.push(headerLine);
        index = 0;
        return;
      }

      // Push data rows
      if (index < standings.length) {
        const row = formatStandingRow(standings[index]);
        const line = row.map(escapeRFC4180).join(',') + '\r\n';
        index++;
        this.push(line);
      } else {
        // End of stream
        this.push(null);
      }
    },
  });
}

/**
 * Streams RFC 4180 compliant CSV directly to a writable stream (e.g. Express res).
 *
 * @param {Array<object>} standings - Array of standing items
 * @param {import('stream').Writable} destination - Destination writable stream
 * @returns {Readable} The created readable stream
 */
function streamStandingsCSV(standings, destination) {
  const stream = createStandingsCSVStream(standings);
  stream.pipe(destination);
  return stream;
}

module.exports = {
  HEADERS,
  escapeRFC4180,
  escapeCSV: escapeRFC4180,
  formatStandingRow,
  generateStandingsCSV,
  createStandingsCSVStream,
  streamStandingsCSV,
};
