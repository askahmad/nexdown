// ─────────────────────────────────────────────
//  NexDown — dashboard.js (Electron App UI)
// ─────────────────────────────────────────────

const BACKEND = 'http://localhost:7474';

const { ipcRenderer } = require('electron');

// DOM refs
const statusDot      = document.getElementById('status-dot');
const urlInput       = document.getElementById('url-input');
const selFormat      = document.getElementById('sel-format');
const selQuality     = document.getElementById('sel-quality');
const btnDownload    = document.getElementById('btn-download');
const btnPlaylist    = document.getElementById('btn-playlist');
const btnClear       = document.getElementById('btn-clear');
const msgBox         = document.getElementById('msg-box');
const queueList      = document.getElementById('queue-list');
const queueCount     = document.getElementById('queue-count');

const btnOpenFolder  = document.getElementById('btn-open-folder');
const playlistRangeRow = document.getElementById('playlist-range-row');
const playlistRangeInput = document.getElementById('playlist-range-input');
const chkEmbed       = document.getElementById('chk-embed');
const pathInput      = document.getElementById('path-input');

// ── Update Banner Elements ──
const updateBanner = document.getElementById('update-banner');
const updateText = document.getElementById('update-text');
const btnUpdateInstall = document.getElementById('btn-update-install');

if (ipcRenderer) {
  ipcRenderer.on('update_status', (event, data) => {
    updateBanner.classList.add('show');
    
    if (data.status === 'not-available') {
      updateText.textContent = 'App is up to date ✓';
      // Hide it after 3 seconds
      setTimeout(() => {
        updateBanner.classList.remove('show');
      }, 3000);
      return;
    }

    if (data.status === 'error') {
      updateText.textContent = data.text || 'Error checking for updates';
      // Hide it after 3 seconds
      setTimeout(() => {
        updateBanner.classList.remove('show');
      }, 3000);
      return;
    }
    
    updateText.textContent = data.text;
    
    if (data.status === 'downloaded') {
      btnUpdateInstall.style.display = 'block';
    } else {
      btnUpdateInstall.style.display = 'none';
    }
  });

  btnUpdateInstall.addEventListener('click', () => {
    ipcRenderer.send('install-update');
  });
}

const PLAYLIST_PATTERNS = [
  /[?&]list=[A-Za-z0-9_-]+/,
  /\/playlist\//i,
  /\/playlists\//i,
  /\/channel\/.*\/videos/i,
  /\/sets\//i,
  /\/album\//i,
  /[?&]collection=/i,
];

function isPlaylistUrl(url) {
  return PLAYLIST_PATTERNS.some(p => p.test(url));
}

function updateRangeInputVisibility() {
  const url = urlInput.value.trim();
  if (isPlaylistUrl(url)) {
    playlistRangeRow.classList.add('show');
  } else {
    playlistRangeRow.classList.remove('show');
  }
}

let queue = [];
let lastVideoQuality = selQuality.value;
let backendOnline = false;
let syncTimer = null;
const activePolls = new Set();

function updateQualityForFormat() {
  if (selFormat.value === 'mp3') {
    if (selQuality.value !== 'best') lastVideoQuality = selQuality.value;
    selQuality.value = 'best';
    selQuality.disabled = true;
  } else {
    selQuality.disabled = false;
    if (lastVideoQuality) selQuality.value = lastVideoQuality;
  }
}

// ── Init ──────────────────────────────────────
async function init() {
  updateQualityForFormat();
  loadQueue();
  await checkBackend();
  if (backendOnline) {
    await syncQueueWithBackend();
    startQueueSync();
    resumePollingForActiveJobs();
  }
  updateRangeInputVisibility();
}

// ── Backend health check ──────────────────────
async function checkBackend() {
  try {
    const res = await fetch(`${BACKEND}/ping`);
    if (res.ok) {
      backendOnline = true;
      statusDot.classList.add('online');
      statusDot.title = 'Local Engine Online ✓';
    } else throw new Error();
  } catch {
    backendOnline = false;
    statusDot.classList.add('offline');
    statusDot.title = 'Local Engine Offline';
    showMsg('Backend offline. Please restart the application.', 'error');
  }
}

// ── Download single video ─────────────────────
btnDownload.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) { showMsg('Please enter a URL first.', 'error'); return; }

  await startDownload({
    url,
    type:    'video',
    format:  selFormat.value,
    quality: selQuality.value,
    embed:   chkEmbed.checked,
    downloadPath: pathInput.value.trim(),
  });
});

// ── Download full playlist ────────────────────
btnPlaylist.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) { showMsg('Please enter a playlist URL.', 'error'); return; }

  const playlistItems = playlistRangeInput.value.trim();
  if (playlistItems && !/^[0-9\s,-]+$/.test(playlistItems)) {
    showMsg('Invalid items range. Use formats like: 1-5, 8, 12-', 'error');
    return;
  }

  showMsg('Fetching playlist info...', 'info');
  btnPlaylist.disabled = true;
  btnPlaylist.textContent = 'Fetching...';

  try {
    const res  = await fetch(`${BACKEND}/playlist-info`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url }),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Failed to fetch playlist');

    showMsg(`Found ${data.count} videos in "${data.title}". Starting download...`, 'success');
    await startDownload({
      url,
      type:    'playlist',
      format:  selFormat.value,
      quality: selQuality.value,
      title:   data.title,
      count:   data.count,
      embed:   chkEmbed.checked,
      playlistItems: playlistItems || null,
      downloadPath: pathInput.value.trim(),
    });
  } catch (err) {
    showMsg(err.message, 'error');
  } finally {
    btnPlaylist.disabled = false;
    btnPlaylist.textContent = '▶▶ Full Playlist';
  }
});

selFormat.addEventListener('change', updateQualityForFormat);
urlInput.addEventListener('input', updateRangeInputVisibility);

pathInput.addEventListener('input', () => {
  localStorage.setItem('downloadPath', pathInput.value.trim());
});

btnOpenFolder.addEventListener('click', async () => {
  try {
    const res = await fetch(`${BACKEND}/open-folder`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ downloadPath: pathInput.value.trim() }),
    });
    if (res.ok) showMsg('Downloads folder opened.', 'success');
    else throw new Error();
  } catch {
    showMsg('Failed to open downloads folder.', 'error');
  }
});

// ── Core: start download ──────────────────────
async function startDownload(job) {
  const id = Date.now().toString();
  const item = {
    id,
    ...job,
    status: 'queued',
    progress: 0,
    speed: null,
    downloaded: 0,
    total: job.count || job.total || null,
  };

  queue.push(item);
  saveQueue();
  renderQueue();
  showMsg(`Added to queue: ${job.type === 'playlist' ? job.title || 'Playlist' : 'Video'}`, 'success');

  try {
    const endpoint = job.type === 'playlist' ? '/download-playlist' : '/download';
    const res = await fetch(`${BACKEND}${endpoint}`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ id, ...job }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Download failed');
    }
    
    pollProgress(id);
  } catch (err) {
    updateItemStatus(id, 'error', 0);
  }
}

// ── Polling logic ─────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

async function pollProgress(id) {
  if (activePolls.has(id)) return;
  activePolls.add(id);

  const maxAttempts = 3600; // up to 1 hour
  let attempts = 0;

  while (attempts < maxAttempts) {
    await sleep(1000);
    attempts++;

    // check if it's still in the queue and not paused/canceled
    const item = queue.find(i => i.id === id);
    if (!item || item.status === 'canceled' || item.status === 'paused' || item.status === 'done' || item.status === 'error') {
      activePolls.delete(id);
      break;
    }

    try {
      const res  = await fetch(`${BACKEND}/progress/${id}`);
      const data = await res.json();

      updateItemStatus(id, data.status, data.progress, data.downloaded, data.speed, data.total);

      if (['done', 'error', 'canceled', 'paused'].includes(data.status)) {
        activePolls.delete(id);
        break;
      }
    } catch {
      // Backend busy
    }
  }
}

function resumePollingForActiveJobs() {
  queue.forEach(item => {
    if (item.status === 'queued' || item.status === 'downloading') {
      pollProgress(item.id);
    }
  });
}

function updateItemStatus(id, status, progress, downloaded = 0, speed = null, total = null) {
  const item = queue.find(i => i.id === id);
  if (!item) return;

  item.status = status;
  if (Number.isFinite(progress)) item.progress = Math.round(progress);
  if (Number.isFinite(downloaded)) item.downloaded = downloaded;
  if (Number.isFinite(speed)) item.speed = speed;
  if (Number.isFinite(total)) {
    item.total = total;
    if (!item.count) item.count = total;
  }
  if (status === 'done') item.progress = 100;
  
  saveQueue();
  renderQueue();
}

// ── Queue persistence (localStorage) ──────────
function loadQueue() {
  const savedQueue = localStorage.getItem('queue');
  if (savedQueue) {
    try { queue = JSON.parse(savedQueue); } catch(e) { queue = []; }
  }
  
  const savedPath = localStorage.getItem('downloadPath');
  if (savedPath) pathInput.value = savedPath;
  
  renderQueue();
}

function saveQueue() {
  localStorage.setItem('queue', JSON.stringify(queue));
}

// ── Queue Operations ──────────────────────────
async function cancelJob(id) {
  try {
    await fetch(`${BACKEND}/cancel/${id}`, { method: 'POST' });
  } catch {}
}

async function handleRemove(id) {
  const item = queue.find(i => i.id === id);
  if (!item) return;

  if (item.status === 'downloading' || item.status === 'queued') {
    await cancelJob(id);
    updateItemStatus(id, 'canceled', item.progress);
    return;
  }

  queue = queue.filter(i => i.id !== id);
  saveQueue();
  renderQueue();
}

async function pauseJob(id) {
  try {
    const res = await fetch(`${BACKEND}/pause/${id}`, { method: 'POST' });
    if (res.ok) {
      updateItemStatus(id, 'paused', null);
      showMsg('Download paused.', 'success');
    }
  } catch {
    showMsg('Failed to pause.', 'error');
  }
}

async function resumeJob(id) {
  try {
    const res = await fetch(`${BACKEND}/resume/${id}`, { method: 'POST' });
    if (res.ok) {
      updateItemStatus(id, 'queued', null);
      showMsg('Download resumed.', 'success');
      
      const item = queue.find(i => i.id === id);
      if (item) {
        // Send a post request just like startDownload to backend to actually resume download if needed, 
        // though /resume should handle it on backend if backend supports it.
        // Assuming /resume sets backend status, we just need to poll again.
        pollProgress(id);
      }
    }
  } catch {
    showMsg('Failed to resume.', 'error');
  }
}

queueList.addEventListener('click', async (event) => {
  const removeBtn = event.target.closest('.q-remove');
  if (removeBtn) {
    const id = removeBtn.dataset.id;
    if (id) await handleRemove(id);
    return;
  }

  const pauseBtn = event.target.closest('.btn-pause');
  if (pauseBtn) {
    const id = pauseBtn.dataset.id;
    if (id) await pauseJob(id);
    return;
  }

  const resumeBtn = event.target.closest('.btn-resume');
  if (resumeBtn) {
    const id = resumeBtn.dataset.id;
    if (id) await resumeJob(id);
    return;
  }
});

btnClear.addEventListener('click', () => {
  queue = [];
  saveQueue();
  renderQueue();
});

// ── Sync queue status from backend ──────────
async function syncQueueWithBackend() {
  if (!backendOnline || queue.length === 0) return;

  try {
    const res = await fetch(`${BACKEND}/jobs`);
    if (!res.ok) return;
    const jobs = await res.json();

    let changed = false;
    for (const item of queue) {
      const job = jobs[item.id];
      if (!job) continue;

      if (job.status && job.status !== item.status) {
        item.status = job.status;
        changed = true;
      }
      if (Number.isFinite(job.progress) && Math.round(job.progress) !== item.progress) {
        item.progress = Math.round(job.progress);
        changed = true;
      }
      if (Number.isFinite(job.downloaded) && job.downloaded !== item.downloaded) {
        item.downloaded = job.downloaded;
        changed = true;
      }
      if (Number.isFinite(job.total) && job.total !== item.total) {
        item.total = job.total;
        if (!item.count) item.count = job.total;
        changed = true;
      }
      if (Number.isFinite(job.speed) && job.speed !== item.speed) {
        item.speed = job.speed;
        changed = true;
      }
      if (job.status === 'done' && item.progress !== 100) {
        item.progress = 100;
        changed = true;
      }
    }

    if (changed) {
      saveQueue();
      renderQueue();
    }
  } catch {}
}

function startQueueSync() {
  if (syncTimer) return;
  syncTimer = setInterval(syncQueueWithBackend, 2000);
}

// ── Render queue ────────────────────────────
function renderQueue() {
  queueCount.textContent = `${queue.length} item${queue.length !== 1 ? 's' : ''}`;

  if (queue.length === 0) {
    queueList.innerHTML = `
      <div class="queue-empty">
        <span class="queue-empty-icon">📁</span>
        No downloads yet
      </div>`;
    return;
  }

  queueList.innerHTML = queue.map(item => {
    const isAudio = item.format === 'mp3';
    const icon = item.type === 'playlist' ? (isAudio ? '🎵' : '🎬') : (isAudio ? '🎵' : '🎬');
    const speedText = item.speed ? formatSpeed(item.speed) : '';
    const totalVideos = item.type === 'playlist' ? (item.total || item.count) : null;
    const downloaded = Number.isFinite(item.downloaded) ? item.downloaded : 0;
    const displayDownloaded = item.status === 'done' && totalVideos ? totalVideos : downloaded;
    const remaining = totalVideos ? Math.max(totalVideos - displayDownloaded, 0) : null;

    const leftText = item.type === 'playlist'
      ? `${displayDownloaded}/${totalVideos || '?'} videos${remaining !== null ? ` • ${remaining} rem` : ''}`
      : (speedText || '');
    const rightText = `${item.progress}%`;

    let actionBtn = '';
    if (item.status === 'downloading' || item.status === 'queued') {
      actionBtn = `<button class="q-btn btn-pause" type="button" data-id="${item.id}" title="Pause">⏸</button>`;
    } else if (item.status === 'paused') {
      actionBtn = `<button class="q-btn btn-resume" type="button" data-id="${item.id}" title="Resume">▶</button>`;
    }

    return `
    <div class="q-item" id="qi-${item.id}">
      <div class="q-top">
        <span class="q-icon">${icon}</span>
        <span class="q-name">${item.title || item.url}</span>
        <span class="q-badge ${item.status}">${badgeText(item)}</span>
        <div style="display: flex; align-items: center; gap: 4px;">
          ${actionBtn}
          <button class="q-remove" type="button" data-id="${item.id}">✕</button>
        </div>
      </div>
      ${['downloading', 'done', 'canceled', 'paused'].includes(item.status) ? `
        <div class="q-progress-wrap">
          <div class="q-progress-bar" style="width:${item.progress}%"></div>
        </div>
        <div class="q-sub">
          <span>${leftText}</span>
          <span>${rightText}</span>
        </div>` : ''}
    </div>
  `;
  }).join('');
}

function badgeText(item) {
  if (item.status === 'downloading') return 'Downloading';
  if (item.status === 'done')        return '✓ Done';
  if (item.status === 'error')       return '✗ Error';
  if (item.status === 'canceled')    return 'Canceled';
  if (item.status === 'paused')      return 'Paused';
  if (item.type   === 'playlist')    return 'Playlist';
  return 'Queued';
}

function formatSpeed(speed) {
  const val = Number(speed);
  if (!Number.isFinite(val) || val <= 0) return '';
  return `${val.toFixed(2)} MB/s`;
}

function showMsg(text, type = 'info') {
  msgBox.textContent  = text;
  msgBox.className    = type;
  clearTimeout(msgBox._t);
  if (type !== 'error') {
    msgBox._t = setTimeout(() => { msgBox.className = ''; }, 4000);
  }
}

init();
