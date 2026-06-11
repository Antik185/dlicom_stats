'use strict';

const SPOTLIGHT = window.SPOTLIGHT_DATA;

if (!SPOTLIGHT) {
  document.getElementById('sp-grid').innerHTML =
    '<div style="grid-column:1/-1;text-align:center;padding:60px;color:#f87171">spotlight_data.js не найден</div>';
  throw new Error('No spotlight data');
}

let spSort = 'likes', spPeriod = 'all', spSearch = '';
let modalPost = null, modalIdx = 0;
let spPage = 0;
const SP_PAGE_SIZE = 24;

function fmt(n) {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return String(Math.round(n));
}
function escHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtDate(iso) { const [y, m, d] = (iso || '').split('-'); return d ? `${d}.${m}.${y.slice(2)}` : iso; }

function filtered() {
  let list = SPOTLIGHT.posts || [];
  if (spPeriod !== 'all') {
    const days = spPeriod === 'week' ? 7 : 30;
    const cutoff = Date.now() - days * 86400000;
    list = list.filter(p => new Date(p.postedAt).getTime() >= cutoff);
  }
  if (spSearch) {
    const q = spSearch.toLowerCase();
    list = list.filter(p =>
      (p.handle || '').toLowerCase().includes(q) ||
      (p.discordName || '').toLowerCase().includes(q) ||
      (p.nickname || '').toLowerCase().includes(q));
  }
  if (spSort === 'likes')        list = [...list].sort((a, b) => (b.likes || 0) - (a.likes || 0));
  else if (spSort === 'latest')  list = [...list].sort((a, b) => new Date(b.postedAt) - new Date(a.postedAt));
  else if (spSort === 'oldest')  list = [...list].sort((a, b) => new Date(a.postedAt) - new Date(b.postedAt));
  return list;
}

function render() {
  const list = filtered();
  const totalLikes = list.reduce((a, p) => a + (p.likes || 0), 0);
  document.getElementById('sp-stats').textContent = `${list.length} works · ${fmt(totalLikes)} total likes`;
  document.getElementById('sp-updated').textContent =
    'Updated ' + new Date(SPOTLIGHT.generatedAt).toISOString().slice(0, 10).split('-').reverse().join('.');

  const grid = document.getElementById('sp-grid');
  if (!list.length) {
    grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:#3a4060">No results</div>';
    document.getElementById('sp-footer').textContent = '';
    document.getElementById('sp-pagination').style.display = 'none';
    return;
  }

  // пагинация
  const pages = Math.max(1, Math.ceil(list.length / SP_PAGE_SIZE));
  spPage = Math.max(0, Math.min(spPage, pages - 1));
  const slice = list.slice(spPage * SP_PAGE_SIZE, (spPage + 1) * SP_PAGE_SIZE);

  grid.innerHTML = slice.map(p => {
    const author = p.nickname || p.discordName || (p.handle ? '@' + p.handle : 'Unknown');
    const likes  = fmt(p.likes || 0);
    const first  = (p.media || [])[0];
    let imgHtml;
    if (first && first.url) {
      const isVideo = first.type === 'video' || first.type === 'animated_gif';
      const url = isVideo && first.previewUrl ? first.previewUrl : first.url;
      imgHtml = `<div class="sp-card-img-wrap${isVideo ? ' video' : ''}" style="background-image:url('${url}')"></div>`;
    } else {
      imgHtml = `<div class="sp-card-empty">NO MEDIA</div>`;
    }
    return `<div class="sp-card" data-id="${p.id}">
      ${imgHtml}
      <div class="sp-card-foot">
        <div class="sp-card-author">${escHtml(author)}</div>
        <div class="sp-card-likes"><i class="ti ti-heart"></i>${likes}</div>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.sp-card').forEach(c => {
    c.addEventListener('click', () => openModal(c.dataset.id));
  });

  // pagination controls
  const pag = document.getElementById('sp-pagination');
  if (pages <= 1) {
    pag.style.display = 'none';
  } else {
    pag.style.display = 'flex';
    const from = spPage * SP_PAGE_SIZE + 1;
    const to   = Math.min((spPage + 1) * SP_PAGE_SIZE, list.length);
    document.getElementById('sp-page-info').textContent = `${from} – ${to} of ${list.length}`;
    document.getElementById('sp-prev-page').disabled = spPage === 0;
    document.getElementById('sp-next-page').disabled = spPage >= pages - 1;
  }

  document.getElementById('sp-footer').textContent = `${SPOTLIGHT.posts.length} curated works total`;
}

// ─── Modal с каруселью ───────────────────────────────────────────
function renderModalMedia() {
  const wrap = document.getElementById('sp-media-wrap');
  const ms = modalPost?.media || [];
  if (!ms.length) {
    wrap.innerHTML = '<div style="padding:60px;color:#3a4060">No media</div>';
    document.getElementById('sp-dots').innerHTML = '';
    document.getElementById('sp-prev').classList.add('hidden');
    document.getElementById('sp-next').classList.add('hidden');
    return;
  }
  const m = ms[modalIdx];
  const url = (m.type === 'video' || m.type === 'animated_gif')
    ? (m.previewUrl || m.url)
    : m.url;
  // показываем ОДНУ картинку за раз
  wrap.innerHTML = `<img src="${url}" alt="" onerror="this.style.display='none';this.parentNode.innerHTML='<div style=\\'padding:60px;color:#3a4060\\'>Image failed to load</div>'">`;

  // стрелки + точки только если медиа больше одной
  const prev = document.getElementById('sp-prev');
  const next = document.getElementById('sp-next');
  const dots = document.getElementById('sp-dots');
  if (ms.length > 1) {
    prev.classList.remove('hidden');
    next.classList.remove('hidden');
    dots.innerHTML = ms.map((_, i) => `<div class="sp-dot${i === modalIdx ? ' active' : ''}"></div>`).join('');
  } else {
    prev.classList.add('hidden');
    next.classList.add('hidden');
    dots.innerHTML = '';
  }
}

function openModal(id) {
  modalPost = SPOTLIGHT.posts.find(x => x.id === id);
  if (!modalPost) return;
  modalIdx = 0;

  const author = modalPost.nickname || modalPost.discordName || '';
  const handle = modalPost.handle ? `@${modalPost.handle}` : '';
  const avatarStyle = modalPost.avatarUrl ? `background-image:url('${modalPost.avatarUrl}')` : '';
  document.getElementById('sp-author').innerHTML =
    `<div class="sp-modal-avatar" style="${avatarStyle}"></div>
     <div>${escHtml(author)}${handle ? ` <span class="sp-modal-handle">${escHtml(handle)}</span>` : ''}</div>`;
  document.getElementById('sp-text').textContent = modalPost.text || '';
  document.getElementById('sp-stats-modal').innerHTML = `
    <span class="likes"><i class="ti ti-heart"></i> ${fmt(modalPost.likes || 0)} likes</span>
    <span class="views"><i class="ti ti-eye"></i> ${fmt(modalPost.views || 0)} views</span>
    <span class="reposts"><i class="ti ti-repeat"></i> ${fmt(modalPost.reposts || 0)} reposts</span>
    <span class="date"><i class="ti ti-calendar"></i> ${fmtDate(modalPost.postedAt.slice(0, 10))}</span>`;
  document.getElementById('sp-link').href =
    `https://x.com/${modalPost.handle || 'i'}/status/${modalPost.id}`;

  renderModalMedia();
  document.getElementById('sp-modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('sp-modal-overlay').classList.add('hidden');
  modalPost = null;
}

function step(dir) {
  if (!modalPost || !modalPost.media || modalPost.media.length < 2) return;
  const n = modalPost.media.length;
  modalIdx = (modalIdx + dir + n) % n;
  renderModalMedia();
}

// ─── Init ────────────────────────────────────────────────────────
(function init() {
  render();

  document.getElementById('sp-sort').addEventListener('click', e => {
    const b = e.target.closest('[data-sort]'); if (!b) return;
    spSort = b.dataset.sort; spPage = 0;
    document.querySelectorAll('#sp-sort .filter-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    render();
  });
  document.getElementById('sp-period').addEventListener('click', e => {
    const b = e.target.closest('[data-period]'); if (!b) return;
    spPeriod = b.dataset.period; spPage = 0;
    document.querySelectorAll('#sp-period .filter-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    render();
  });
  document.getElementById('sp-search').addEventListener('input', e => {
    spSearch = e.target.value.trim(); spPage = 0; render();
  });
  document.getElementById('sp-prev-page').addEventListener('click', () => {
    spPage--; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  document.getElementById('sp-next-page').addEventListener('click', () => {
    spPage++; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  document.getElementById('sp-modal-close').addEventListener('click', closeModal);
  document.getElementById('sp-modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'sp-modal-overlay') closeModal();
  });
  document.getElementById('sp-prev').addEventListener('click', () => step(-1));
  document.getElementById('sp-next').addEventListener('click', () => step(1));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
  });
})();
