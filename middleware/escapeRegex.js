/**
 * Escape special regex characters to prevent NoSQL injection via
 * user-supplied search strings used in $regex queries.
 */

function escapeRegex(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { escapeRegex };
