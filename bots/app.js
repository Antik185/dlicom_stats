const DATA = window.SUSPICIOUS_X_DATA;
const PAGE_SIZE = 25;
const state = { category: 'all', role: 'all', search: '', sort: 'severity', page: 1 };

const labels = {
  comments: { text: 'Comments exceed likes', icon: 'ti-message-exclamation' },
  'low-likes': { text: 'High views, low likes', icon: 'ti-eye-exclamation' },
};

function esc(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]);
}
function fmt(value) { return new Intl.NumberFormat('en-US', { notation: value >= 10000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value || 0); }
function initials(value) { return String(value || '?').replace(/[^\p{L}\p{N}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?'; }

function renderSummary() {
  const counts = DATA?.counts || {};
  const cards = [
    ['ti-users-question', counts.users, 'Accounts flagged'],
    ['ti-message-exclamation', counts.comments, 'Comments > likes'],
    ['ti-eye-exclamation', counts.lowLikes, 'Low like rate'],
  ];
  document.getElementById('signal-grid').innerHTML = cards.map(([icon, value, label]) => `
    <div class="signal-card"><i class="ti ${icon}"></i><span class="signal-number">${fmt(value)}</span><span class="signal-label">${label}</span></div>
  `).join('');
  document.getElementById('updated').textContent = DATA?.generatedAt ? `updated ${new Date(DATA.generatedAt).toLocaleString('en-US')}` : 'data unavailable';
}

function filteredUsers() {
  const query = state.search.toLowerCase();
  const users = (DATA?.users || []).filter(user => {
    const categoryOk = state.category === 'all' || user.flags.some(flag => flag.type === state.category);
    const roleOk = state.role === 'all' || user.roles.includes(state.role);
    const searchOk = !query || `${user.username} ${user.nickname} ${user.handle}`.toLowerCase().includes(query);
    return categoryOk && roleOk && searchOk;
  });
  return users.sort((a, b) => {
    if (state.sort === 'views') return b.totals.views - a.totals.views;
    if (state.sort === 'comments') return b.totals.comments - a.totals.comments;
    return b.severity - a.severity || b.totals.views - a.totals.views;
  });
}

function avatar(user) {
  const image = user.avatarUrl ? `<img src="${esc(user.avatarUrl)}" alt="" loading="lazy">` : '';
  return `<div class="bot-avatar"><span>${esc(initials(user.nickname || user.username))}</span>${image}</div>`;
}

function flaggedMetrics(user) {
  const posts = new Map();
  for (const flag of user.flags) {
    for (const post of flag.evidence) posts.set(post.id, post);
  }
  return [...posts.values()].reduce((totals, post) => {
    totals.posts++;
    totals.likes += post.likes || 0;
    totals.comments += post.comments || 0;
    return totals;
  }, { posts: 0, likes: 0, comments: 0 });
}

function evidence(flag) {
  const title = labels[flag.type].text;
  return `<div class="evidence-group"><div class="evidence-title">${esc(title)}${flag.ratio ? ` / ${flag.ratio}x` : ''}</div>${flag.evidence.map(post => `
    <a class="post-link" href="${esc(post.url)}" target="_blank" rel="noopener">
      <strong>${esc(post.date)}</strong><span><i class="ti ti-eye"></i> ${fmt(post.views)}</span><span><i class="ti ti-heart"></i> ${fmt(post.likes)}</span><span><i class="ti ti-message"></i> ${fmt(post.comments)}</span><i class="ti ti-external-link"></i>
    </a>`).join('')}</div>`;
}

function row(user) {
  const flagged = flaggedMetrics(user);
  const roles = user.roles.map(role => `<span class="role-pill role-${esc(role)}">${esc(role)}</span>`).join('');
  const flags = user.flags.map(flag => `<span class="flag-pill flag-${flag.type}"><i class="ti ${labels[flag.type].icon}"></i>${labels[flag.type].text}${flag.count > 1 ? ` · ${flag.count}` : ''}</span>`).join('');
  return `<article class="bot-row">
    <button class="bot-main" type="button" aria-expanded="false">
      <div class="bot-user">${avatar(user)}<div style="min-width:0"><div class="bot-name copyable-name">${esc(user.nickname || user.username)}</div><div class="bot-handles copyable-name">${esc(user.username)}${user.handle ? ` · @${esc(user.handle)}` : ''}</div><div class="role-list">${roles}</div></div></div>
      <div class="bot-metrics"><div class="metric"><strong>${fmt(flagged.posts)}</strong><span><i class="ti ti-file-text"></i> posts</span></div><div class="metric"><strong>${fmt(flagged.likes)}</strong><span><i class="ti ti-heart"></i> likes</span></div><div class="metric"><strong>${fmt(flagged.comments)}</strong><span><i class="ti ti-message-circle"></i> comments</span></div></div>
      <div class="flag-list">${flags}</div><i class="ti ti-chevron-down expand-icon"></i>
    </button>
    <div class="evidence"><div class="evidence-grid">${user.flags.map(evidence).join('')}</div></div>
  </article>`;
}

function bindRows() {
  document.querySelectorAll('.bot-avatar img').forEach(img => img.addEventListener('error', () => img.remove(), { once: true }));
  document.querySelectorAll('.bot-main').forEach(button => button.addEventListener('click', event => {
    if (event.target.closest('a, .copyable-name')) return;
    const item = button.closest('.bot-row');
    item.classList.toggle('open');
    button.setAttribute('aria-expanded', item.classList.contains('open'));
  }));
}

function render() {
  const users = filteredUsers();
  const pages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  state.page = Math.min(state.page, pages);
  const start = (state.page - 1) * PAGE_SIZE;
  const visible = users.slice(start, start + PAGE_SIZE);
  document.getElementById('result-count').textContent = fmt(users.length);
  document.getElementById('bots-list').innerHTML = visible.map(row).join('');
  document.getElementById('empty-state').hidden = users.length !== 0;
  const pagination = document.getElementById('pagination');
  pagination.hidden = pages <= 1;
  document.getElementById('page-info').textContent = `${start + 1}-${Math.min(start + PAGE_SIZE, users.length)} of ${users.length}`;
  document.getElementById('prev-page').disabled = state.page === 1;
  document.getElementById('next-page').disabled = state.page === pages;
  bindRows();
}

function bindFilter(id, key, attribute) {
  document.getElementById(id).addEventListener('click', event => {
    const button = event.target.closest(`[data-${attribute}]`);
    if (!button) return;
    document.querySelectorAll(`#${id} [data-${attribute}]`).forEach(item => item.classList.toggle('active', item === button));
    state[key] = button.dataset[attribute]; state.page = 1; render();
  });
}

renderSummary();
bindFilter('category-filter', 'category', 'category');
bindFilter('role-filter', 'role', 'role');
document.getElementById('bots-search').addEventListener('input', event => { state.search = event.target.value.trim(); state.page = 1; render(); });
document.getElementById('sort-select').addEventListener('change', event => { state.sort = event.target.value; state.page = 1; render(); });
document.getElementById('prev-page').addEventListener('click', () => { if (state.page > 1) { state.page--; render(); scrollTo({ top: 0, behavior: 'smooth' }); } });
document.getElementById('next-page').addEventListener('click', () => { state.page++; render(); scrollTo({ top: 0, behavior: 'smooth' }); });
render();
