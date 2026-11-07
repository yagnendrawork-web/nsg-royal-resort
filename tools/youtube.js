/**
 * NSG ROYAL RESORT — youtube.js: the one YouTube ID parser, shared by build.js and check.js.
 * Accepts watch?v=, youtu.be/, /shorts/, /embed/, /live/ and /v/ URLs (with or without extra params).
 */
function parseYouTubeId(url) {
  if (typeof url !== 'string' || !url.trim()) return '';
  let u;
  try {
    u = new URL(url.trim());
  } catch (e) {
    return '';
  }
  const host = u.hostname.toLowerCase().replace(/^(www|m|music)\./, '');
  let id = '';
  if (host === 'youtu.be') {
    id = u.pathname.split('/')[1] || '';
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (u.pathname === '/watch') {
      id = u.searchParams.get('v') || '';
    } else {
      const m = u.pathname.match(/^\/(shorts|embed|live|v)\/([^/?#]+)/);
      if (m) id = m[2];
    }
  }
  return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
}

module.exports = { parseYouTubeId };
