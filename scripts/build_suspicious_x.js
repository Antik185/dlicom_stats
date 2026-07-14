/**
 * Builds a review queue of accounts with unusual X activity.
 * The rules are intentionally conservative and every flag includes evidence.
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const links = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'x_links.json'), 'utf8'));
const stats = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'x_stats.json'), 'utf8'));
const scores = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'scores.json'), 'utf8'));
const badges = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'badges.json'), 'utf8'));
const currentRolesFile = path.join(DATA_DIR, 'current_roles.json');
const currentRoles = fs.existsSync(currentRolesFile) ? JSON.parse(fs.readFileSync(currentRolesFile, 'utf8')) : null;
const excludedHandles = new Set(
  JSON.parse(fs.readFileSync(path.join(__dirname, 'excluded_suspicious_x.json'), 'utf8')).map(handle => handle.toLowerCase()),
);

const scoreByUser = new Map((scores.users || []).map(user => [user.username, user]));
const ROLE_MAP = { dcoded: 'Dcoded', dliever: 'Dliever', dco: 'DCO' };

function tweetTimestamp(id) {
  try { return Number((BigInt(id) >> 22n) + 1288834974657n); }
  catch { return 0; }
}

function compactPost(post, metric) {
  const handle = metric.handle || post.handle || 'i';
  return {
    id: post.id,
    url: `https://x.com/${handle}/status/${post.id}`,
    date: new Date(tweetTimestamp(post.id)).toISOString().slice(0, 10),
    views: metric.views || 0,
    likes: metric.likes || 0,
    comments: metric.comments || 0,
    reposts: metric.reposts || 0,
    engagement: (metric.likes || 0) + (metric.comments || 0) + (metric.reposts || 0),
  };
}

function main() {
  const users = [];

  for (const [username, linkData] of Object.entries(links)) {
    const posts = (linkData.posts || [])
      .map(post => ({ post, metric: stats[post.id] }))
      .filter(({ metric }) => metric && !metric.error && !metric.notFound)
      .map(({ post, metric }) => compactPost(post, metric))
      .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

    if (posts.length < 2) continue;
    if (posts.some(post => {
      const handle = post.url.match(/x\.com\/([^/]+)/i)?.[1];
      return handle && excludedHandles.has(handle.toLowerCase());
    })) continue;

    const flags = [];
    const commentFlags = posts
      .filter(post => post.likes >= 15 && post.comments > post.likes)
      .sort((a, b) => (b.comments - b.likes) - (a.comments - a.likes));
    if (commentFlags.length) {
      flags.push({ type: 'comments', count: commentFlags.length, evidence: commentFlags });
    }

    const lowLikeFlags = posts
      .filter(post => post.views >= 1000 && post.likes <= 10 && post.likes / post.views <= 0.003)
      .sort((a, b) => b.views - a.views);
    if (lowLikeFlags.length) {
      flags.push({ type: 'low-likes', count: lowLikeFlags.length, evidence: lowLikeFlags.slice(0, 5) });
    }

    if (!flags.length) continue;

    const score = scoreByUser.get(username) || {};
    const userBadges = badges[username]?.badges || [];
    const roles = currentRoles
      ? ['Dliever', 'Dcoded', 'DCO'].filter(role => (currentRoles[username] || []).includes(role))
      : Object.entries(ROLE_MAP).filter(([badge]) => userBadges.includes(badge)).map(([, role]) => role);
    if (!roles.length) continue;
    const handleCounts = {};
    for (const post of posts) {
      const match = post.url.match(/x\.com\/([^/]+)/i);
      if (match && match[1] !== 'i') handleCounts[match[1]] = (handleCounts[match[1]] || 0) + 1;
    }
    const handle = Object.entries(handleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || score.xHandle || '';
    const severity = flags.reduce((sum, flag) => sum + flag.count, 0);

    users.push({
      username,
      nickname: score.nickname || linkData.nickname || username,
      avatarUrl: score.avatarUrl || linkData.avatarUrl || '',
      handle,
      roles,
      posts: posts.length,
      totals: posts.reduce((out, post) => {
        out.views += post.views; out.likes += post.likes; out.comments += post.comments; out.reposts += post.reposts;
        return out;
      }, { views: 0, likes: 0, comments: 0, reposts: 0 }),
      flags,
      severity: Math.round(severity * 10) / 10,
    });
  }

  users.sort((a, b) => b.severity - a.severity || b.totals.views - a.totals.views);
  const output = {
    generatedAt: new Date().toISOString(),
    rules: {
      comments: 'At least 15 likes and more comments than likes',
      lowLikes: 'At least 1,000 views, no more than 10 likes, like rate up to 0.3%',
    },
    counts: {
      users: users.length,
      comments: users.filter(user => user.flags.some(flag => flag.type === 'comments')).length,
      lowLikes: users.filter(user => user.flags.some(flag => flag.type === 'low-likes')).length,
    },
    users,
  };

  fs.writeFileSync(path.join(DATA_DIR, 'suspicious_x.json'), JSON.stringify(output, null, 2));
  fs.writeFileSync(path.join(DATA_DIR, 'suspicious_x_data.js'), `window.SUSPICIOUS_X_DATA = ${JSON.stringify(output)};\n`);
  console.log(`Suspicious X accounts: ${users.length}`);
  console.log(`Comments: ${output.counts.comments}, low likes: ${output.counts.lowLikes}`);
}

main();
