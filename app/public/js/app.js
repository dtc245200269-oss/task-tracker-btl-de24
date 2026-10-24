'use strict';

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

const STATUS_META = {
  todo:        { label: 'Chưa bắt đầu', color: 'gray',  hex: '#8b919c' },
  in_progress: { label: 'Đang làm',     color: 'blue',  hex: '#2563eb' },
  review:      { label: 'Chờ duyệt',    color: 'amber', hex: '#d97706' },
  done:        { label: 'Hoàn thành',   color: 'green', hex: '#188544' }
};
const STATUS_ORDER = ['todo', 'in_progress', 'review', 'done'];

const PRIORITY_META = {
  high:   { label: 'Cao',  color: 'red',   hex: '#cf3434' },
  medium: { label: 'Vừa',  color: 'amber', hex: '#d97706' },
  low:    { label: 'Thấp', color: 'gray',  hex: '#8b919c' }
};

const TYPE_META = {
  personal: { label: 'Cá nhân', hex: '#5e6ad2' },
  team:     { label: 'Nhóm',    hex: '#0e7490' }
};

const state = {
  view: 'list',
  tasks: [],
  teams: [],
  users: [],
  filters: { status: '', priority: '', type: '', team_id: '', search: '' },
  editingTaskId: null,
  metaLoaded: false
};

/* ================================ API ================================ */

async function api(path, options) {
  const opts = Object.assign({ headers: { 'Content-Type': 'application/json' } }, options || {});
  let res;
  try {
    res = await fetch(path, opts);
  } catch (netErr) {
    throw new Error('Không thể kết nối máy chủ. Kiểm tra lại container app.');
  }
  let body = null;
  try { body = await res.json(); } catch (parseErr) { body = null; }
  if (!res.ok || (body && body.success === false)) {
    throw new Error((body && body.message) || ('Lỗi máy chủ (HTTP ' + res.status + ')'));
  }
  return body || { success: true };
}

const apiGet    = (p) => api(p);
const apiPost   = (p, data) => api(p, { method: 'POST',   body: JSON.stringify(data) });
const apiPut    = (p, data) => api(p, { method: 'PUT',    body: JSON.stringify(data) });
const apiPatch  = (p, data) => api(p, { method: 'PATCH',  body: JSON.stringify(data) });
const apiDelete = (p) => api(p, { method: 'DELETE' });

/* ============================== HELPERS ============================== */

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
}

function isOverdue(task) {
  if (!task.deadline || task.status === 'done') return false;
  return new Date(task.deadline).getTime() < Date.now();
}

function initials(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  const last = parts[parts.length - 1] || '?';
  return last.slice(0, 2);
}

function avatarColorClass(id) {
  return 'c' + (Number(id) % 6);
}

function debounce(fn, wait) {
  let t = null;
  return function () {
    const args = arguments;
    clearTimeout(t);
    t = setTimeout(() => fn.apply(null, args), wait);
  };
}

function toast(message, type) {
  const box = $('#toastContainer');
  const el = document.createElement('div');
  el.className = 'toast ' + (type || 'success');
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 200);
  }, 3600);
}

function setLoading(btn, loading, label) {
  if (loading) {
    btn.dataset.label = btn.textContent;
    btn.disabled = true;
    btn.textContent = label || 'Đang xử lý...';
  } else {
    btn.disabled = false;
    btn.textContent = btn.dataset.label || label || btn.textContent;
  }
}

function openModal(id) {
  $('#' + id).hidden = false;
}

function closeModal(id) {
  $('#' + id).hidden = true;
}

function confirmDialog(message) {
  return new Promise((resolve) => {
    $('#confirmText').textContent = message;
    openModal('confirmDialog');
    const ok = $('#confirmOk');
    const cancel = $('#confirmCancel');
    const backdrop = $('#confirmDialog');
    const cleanup = (result) => {
      ok.removeEventListener('click', onOk);
      cancel.removeEventListener('click', onCancel);
      backdrop.removeEventListener('mousedown', onBackdrop);
      closeModal('confirmDialog');
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (e) => { if (e.target === backdrop) cleanup(false); };
    ok.addEventListener('click', onOk);
    cancel.addEventListener('click', onCancel);
    backdrop.addEventListener('mousedown', onBackdrop);
  });
}

/* ============================== THEME ============================== */

function initTheme() {
  const saved = localStorage.getItem('tt-theme');
  const theme = saved === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    localStorage.setItem('tt-theme', next);
  });
}

/* ============================== HEALTH ============================== */

async function checkHealth() {
  const pill = $('#healthPill');
  const text = $('#healthText');
  try {
    const res = await fetch('/health');
    const body = await res.json();
    if (res.ok && body.status === 'UP') {
      pill.className = 'health-pill up';
      text.textContent = 'Hệ thống hoạt động';
      return;
    }
    throw new Error('down');
  } catch (err) {
    pill.className = 'health-pill down';
    text.textContent = 'Mất kết nối DB';
  }
}

/* ============================== DATA LOAD ============================== */

async function loadMeta() {
  if (state.metaLoaded) return;
  const [teamsRes, usersRes] = await Promise.all([
    apiGet('/api/teams'),
    apiGet('/api/teams/users/all')
  ]);
  state.teams = teamsRes.data || [];
  state.users = usersRes.data || [];
  state.metaLoaded = true;
  populateFilterTeams();
  populateFormSelects();
}

function populateFilterTeams() {
  const sel = $('#filterTeam');
  sel.innerHTML = '<option value="">Nhóm: tất cả</option>' + state.teams.map((t) =>
    '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>'
  ).join('');
}

function populateFormSelects() {
  $('#fTeam').innerHTML = '<option value="">-- Chọn nhóm --</option>' + state.teams.map((t) =>
    '<option value="' + t.id + '">' + escapeHtml(t.name) + '</option>'
  ).join('');
  $('#fAssignee').innerHTML = '<option value="">-- Chưa gán --</option>' + state.users.map((u) =>
    '<option value="' + u.id + '">' + escapeHtml(u.full_name) + '</option>'
  ).join('');
}

async function loadTasks() {
  const f = state.filters;
  const params = new URLSearchParams();
  if (f.status) params.set('status', f.status);
  if (f.priority) params.set('priority', f.priority);
  if (f.type) params.set('type', f.type);
  if (f.team_id) params.set('team_id', f.team_id);
  if (f.search) params.set('search', f.search);
  const qs = params.toString();
  const res = await apiGet('/api/tasks' + (qs ? '?' + qs : ''));
  state.tasks = res.data || [];
}

/* ============================== RENDER: LIST ============================== */

function skeletonRows(count) {
  let html = '';
  for (let i = 0; i < count; i++) html += '<div class="skeleton"></div>';
  return html;
}

function emptyStateHtml(message) {
  return '<div class="empty-state">' +
    '<svg viewBox="0 0 24 24" width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">' +
    '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M8 10h8M8 14h5"/></svg>' +
    '<p>' + escapeHtml(message) + '</p></div>';
}

function taskMetaHtml(task) {
  const st = STATUS_META[task.status] || STATUS_META.todo;
  const pr = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  let html = '';
  html += '<span class="badge ' + st.color + '"><span class="dot"></span>' + st.label + '</span>';
  html += '<span class="badge ' + pr.color + '">Ưu tiên: ' + pr.label + '</span>';
  html += '<span class="badge ' + (task.type === 'team' ? 'accent' : 'gray') + '">' +
          (TYPE_META[task.type] ? TYPE_META[task.type].label : task.type) + '</span>';
  if (task.deadline) {
    html += '<span class="deadline' + (isOverdue(task) ? ' overdue' : '') + '">' +
      '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
      formatDate(task.deadline) + (isOverdue(task) ? ' (quá hạn)' : '') + '</span>';
  }
  if (task.assigned_user_name) {
    html += '<span class="assignee"><span class="avatar ' + avatarColorClass(task.assigned_to) + '">' +
      escapeHtml(initials(task.assigned_user_name)) + '</span>' + escapeHtml(task.assigned_user_name) + '</span>';
  }
  if (task.team_name) {
    html += '<span class="badge gray">' + escapeHtml(task.team_name) + '</span>';
  }
  return html;
}

function renderList() {
  const box = $('#taskList');
  $('#listCount').textContent = state.tasks.length + ' công việc';
  if (!state.tasks.length) {
    box.innerHTML = emptyStateHtml('Không có công việc nào khớp bộ lọc. Bấm "Tạo công việc" để thêm mới.');
    return;
  }
  box.innerHTML = state.tasks.map((task) => {
    const st = STATUS_META[task.status] || STATUS_META.todo;
    return '<article class="task-row' + (task.status === 'done' ? ' done' : '') + '" data-id="' + task.id + '">' +
      '<div class="task-main">' +
        '<h3 class="task-title">' + escapeHtml(task.title) + '</h3>' +
        (task.description ? '<p class="task-desc">' + escapeHtml(task.description) + '</p>' : '') +
        '<div class="task-meta">' + taskMetaHtml(task) + '</div>' +
      '</div>' +
      '<div class="task-actions">' +
        '<select class="inline-status" data-id="' + task.id + '" title="Đổi trạng thái nhanh">' +
          STATUS_ORDER.map((s) => '<option value="' + s + '"' + (s === task.status ? ' selected' : '') + '>' + STATUS_META[s].label + '</option>').join('') +
        '</select>' +
        '<button class="icon-btn" data-action="edit" data-id="' + task.id + '" title="Sửa">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/></svg>' +
        '</button>' +
        '<button class="icon-btn danger" data-action="delete" data-id="' + task.id + '" title="Xóa">' +
          '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>' +
        '</button>' +
      '</div>' +
    '</article>';
  }).join('');
}

/* ============================== RENDER: KANBAN ============================== */

function renderKanban() {
  const board = $('#kanbanBoard');
  board.innerHTML = STATUS_ORDER.map((status) => {
    const meta = STATUS_META[status];
    const cards = state.tasks.filter((t) => t.status === status);
    return '<div class="kanban-col" data-status="' + status + '">' +
      '<div class="kanban-col-head">' +
        '<span class="kanban-col-title"><span class="dot" style="background:' + meta.hex + '"></span>' + meta.label + '</span>' +
        '<span class="col-count">' + cards.length + '</span>' +
      '</div>' +
      (cards.length ? cards.map(kanbanCardHtml).join('') : '<div class="kanban-empty">Thả công việc vào đây</div>') +
    '</div>';
  }).join('');
  bindKanbanDnD();
}

function kanbanCardHtml(task) {
  const pr = PRIORITY_META[task.priority] || PRIORITY_META.medium;
  return '<div class="kanban-card" draggable="true" data-id="' + task.id + '">' +
    '<h3 class="task-title">' + escapeHtml(task.title) + '</h3>' +
    '<div class="task-meta">' +
      '<span class="badge ' + pr.color + '">' + pr.label + '</span>' +
      (task.deadline ? '<span class="deadline' + (isOverdue(task) ? ' overdue' : '') + '">' + formatDate(task.deadline) + '</span>' : '') +
    '</div>' +
    '<div class="kanban-card-foot">' +
      (task.assigned_user_name
        ? '<span class="assignee"><span class="avatar ' + avatarColorClass(task.assigned_to) + '">' + escapeHtml(initials(task.assigned_user_name)) + '</span></span>'
        : '<span></span>') +
      '<span class="task-actions">' +
        '<button class="icon-btn" data-action="edit" data-id="' + task.id + '" title="Sửa">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"/></svg>' +
        '</button>' +
        '<button class="icon-btn danger" data-action="delete" data-id="' + task.id + '" title="Xóa">' +
          '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13h10l1-13"/></svg>' +
        '</button>' +
      '</span>' +
    '</div>' +
  '</div>';
}

function bindKanbanDnD() {
  $$('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  $$('.kanban-col').forEach((col) => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      col.classList.add('drop-target');
    });
    col.addEventListener('dragleave', (e) => {
      if (!col.contains(e.relatedTarget)) col.classList.remove('drop-target');
    });
    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drop-target');
      const id = e.dataTransfer.getData('text/plain');
      const status = col.dataset.status;
      const task = state.tasks.find((t) => String(t.id) === String(id));
      if (!task || task.status === status) return;
      try {
        await apiPatch('/api/tasks/' + id + '/status', { status });
        toast('Đã chuyển "' + task.title + '" sang ' + STATUS_META[status].label);
        await refreshTasks();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  });
}

/* ============================== RENDER: TEAMS ============================== */

function renderTeams() {
  const box = $('#teamList');
  if (!state.teams.length) {
    box.innerHTML = emptyStateHtml('Chưa có nhóm nào. Bấm "Tạo nhóm" để bắt đầu.');
    return;
  }
  box.innerHTML = state.teams.map((team) =>
    '<article class="team-card" data-id="' + team.id + '">' +
      '<h4>' + escapeHtml(team.name) + '</h4>' +
      '<p>' + escapeHtml(team.description || 'Chưa có mô tả') + '</p>' +
      '<div class="team-stats">' +
        '<span class="badge accent">' + team.member_count + ' thành viên</span>' +
        '<span class="badge gray">' + team.task_count + ' công việc</span>' +
      '</div>' +
      '<div class="team-card-foot">' +
        '<button class="btn btn-ghost btn-sm" data-action="members" data-id="' + team.id + '">Xem thành viên</button>' +
      '</div>' +
    '</article>'
  ).join('');
}

async function showMembers(teamId) {
  const team = state.teams.find((t) => String(t.id) === String(teamId));
  $('#membersModalTitle').textContent = 'Thành viên: ' + (team ? team.name : '');
  const box = $('#membersList');
  box.innerHTML = skeletonRows(2);
  openModal('membersModal');
  try {
    const res = await apiGet('/api/teams/' + teamId + '/members');
    const members = res.data || [];
    box.innerHTML = members.length ? members.map((m) =>
      '<div class="member-row">' +
        '<span class="avatar ' + avatarColorClass(m.id) + '">' + escapeHtml(initials(m.full_name)) + '</span>' +
        '<div class="member-info"><b>' + escapeHtml(m.full_name) + '</b>' +
        '<span>' + escapeHtml(m.email) + ' &middot; ' + escapeHtml(m.role) + '</span></div>' +
      '</div>'
    ).join('') : emptyStateHtml('Nhóm chưa có thành viên nào.');
  } catch (err) {
    box.innerHTML = emptyStateHtml(err.message);
  }
}

/* ============================== RENDER: STATS ============================== */

function donutSvg(rows, colorOf, total) {
  const size = 150;
  const r = 56;
  const c = 2 * Math.PI * r;
  let offset = 0;
  let segments = '';
  rows.forEach((row) => {
    const frac = total ? row.count / total : 0;
    if (frac <= 0) return;
    const len = frac * c;
    segments += '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + colorOf(row) +
      '" stroke-width="17" stroke-dasharray="' + len + ' ' + (c - len) + '" stroke-dashoffset="' + (-offset) +
      '" transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"><title>' + escapeHtml(row.label) + ': ' + row.count + '</title></circle>';
    offset += len;
  });
  return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
    '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--surface-3)" stroke-width="17"/>' +
    segments +
    '<text x="50%" y="47%" text-anchor="middle" font-size="24" font-weight="700" fill="var(--text)">' + total + '</text>' +
    '<text x="50%" y="61%" text-anchor="middle" font-size="10.5" fill="var(--text-3)">tổng</text>' +
  '</svg>';
}

function legendHtml(rows, colorOf) {
  return '<div class="chart-legend">' + rows.map((row) =>
    '<div class="legend-row"><span class="swatch" style="background:' + colorOf(row) + '"></span>' +
    escapeHtml(row.label) + '<b>' + row.count + '</b></div>'
  ).join('') + '</div>';
}

function barChartHtml(rows, colorOf, total) {
  if (!rows.length) return emptyStateHtml('Chưa có dữ liệu');
  const max = Math.max.apply(null, rows.map((r) => r.count).concat([1]));
  return '<div class="bar-chart">' + rows.map((row) =>
    '<div class="bar-row">' +
      '<div class="bar-label"><span>' + escapeHtml(row.label) + '</span><b>' + row.count + '</b></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + Math.round((row.count / max) * 100) + '%;background:' + colorOf(row) + '"></div></div>' +
    '</div>'
  ).join('') + '</div>';
}

async function renderStats() {
  const cards = $('#statCards');
  cards.innerHTML = skeletonRows(1) + skeletonRows(1);
  try {
    const res = await apiGet('/api/stats/summary');
    const d = res.data;
    const inProgress = (d.byStatus || []).filter((r) => r.status === 'in_progress' || r.status === 'review')
      .reduce((a, r) => a + r.count, 0);
    const done = (d.byStatus || []).find((r) => r.status === 'done');
    cards.innerHTML =
      '<div class="stat-card"><div class="label">Tổng công việc</div><div class="value">' + d.total + '</div></div>' +
      '<div class="stat-card"><div class="label">Đang thực hiện</div><div class="value blue">' + inProgress + '</div></div>' +
      '<div class="stat-card"><div class="label">Hoàn thành</div><div class="value green">' + ((done && done.count) || 0) + '</div></div>' +
      '<div class="stat-card"><div class="label">Quá hạn</div><div class="value red">' + d.overdue + '</div></div>';

    const statusRows = STATUS_ORDER.map((s) => ({
      label: STATUS_META[s].label,
      count: ((d.byStatus || []).find((r) => r.status === s) || { count: 0 }).count,
      key: s
    }));
    const statusColor = (row) => STATUS_META[row.key].hex;
    $('#chartStatus').innerHTML = donutSvg(statusRows, statusColor, d.total) + legendHtml(statusRows, statusColor);

    const prioRows = ['high', 'medium', 'low'].map((p) => ({
      label: 'Ưu tiên ' + PRIORITY_META[p].label,
      count: ((d.byPriority || []).find((r) => r.priority === p) || { count: 0 }).count,
      key: p
    }));
    $('#chartPriority').innerHTML = barChartHtml(prioRows, (row) => PRIORITY_META[row.key].hex, d.total);

    const typeRows = ['personal', 'team'].map((t) => ({
      label: TYPE_META[t].label,
      count: ((d.byType || []).find((r) => r.type === t) || { count: 0 }).count,
      key: t
    }));
    const typeColor = (row) => TYPE_META[row.key].hex;
    $('#chartType').innerHTML = donutSvg(typeRows, typeColor, d.total) + legendHtml(typeRows, typeColor);
  } catch (err) {
    cards.innerHTML = emptyStateHtml(err.message);
    toast(err.message, 'error');
  }
}

/* ============================== VIEW SWITCH ============================== */

async function refreshTasks() {
  await loadTasks();
  renderList();
  renderKanban();
}

async function switchView(view) {
  state.view = view;
  if (location.hash !== '#/' + view) {
    history.replaceState(null, '', '#/' + view);
  }
  $$('.nav-item').forEach((btn) => btn.classList.toggle('active', btn.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  try {
    if (view === 'list' || view === 'kanban') {
      await loadMeta();
      await refreshTasks();
    } else if (view === 'teams') {
      state.metaLoaded = false;
      await loadMeta();
      renderTeams();
    } else if (view === 'stats') {
      await renderStats();
    }
  } catch (err) {
    toast(err.message, 'error');
  }
}

/* ============================== TASK MODAL ============================== */

async function openTaskModal(taskId) {
  try {
    await loadMeta();
  } catch (err) {
    toast(err.message, 'error');
    return;
  }
  state.editingTaskId = taskId || null;
  const form = $('#taskForm');
  form.reset();
  $('#errTitle').hidden = true;
  $('#fTitle').classList.remove('invalid');

  if (taskId) {
    const task = state.tasks.find((t) => String(t.id) === String(taskId));
    if (!task) { toast('Không tìm thấy công việc', 'error'); return; }
    $('#taskModalTitle').textContent = 'Sửa công việc';
    $('#btnSaveTask').textContent = 'Cập nhật';
    $('#fTitle').value = task.title || '';
    $('#fDescription').value = task.description || '';
    $('#fDeadline').value = task.deadline ? String(task.deadline).slice(0, 10) : '';
    $('#fPriority').value = task.priority || 'medium';
    $('#fStatus').value = task.status || 'todo';
    $('#fType').value = task.type || 'personal';
    $('#fTeam').value = task.team_id || '';
    $('#fAssignee').value = task.assigned_to || '';
  } else {
    $('#taskModalTitle').textContent = 'Tạo công việc';
    $('#btnSaveTask').textContent = 'Lưu công việc';
  }
  openModal('taskModal');
  setTimeout(() => $('#fTitle').focus(), 60);
}

async function submitTaskForm(e) {
  e.preventDefault();
  const title = $('#fTitle').value.trim();
  if (!title) {
    $('#errTitle').hidden = false;
    $('#fTitle').classList.add('invalid');
    $('#fTitle').focus();
    return;
  }
  $('#errTitle').hidden = true;
  $('#fTitle').classList.remove('invalid');

  const type = $('#fType').value;
  const payload = {
    title,
    description: $('#fDescription').value.trim(),
    deadline: $('#fDeadline').value || null,
    priority: $('#fPriority').value,
    status: $('#fStatus').value,
    type,
    team_id: type === 'team' ? ($('#fTeam').value || null) : null,
    assigned_to: $('#fAssignee').value || null
  };

  const btn = $('#btnSaveTask');
  setLoading(btn, true);
  try {
    if (state.editingTaskId) {
      await apiPut('/api/tasks/' + state.editingTaskId, payload);
      toast('Cập nhật công việc thành công');
    } else {
      await apiPost('/api/tasks', payload);
      toast('Tạo công việc thành công');
    }
    closeModal('taskModal');
    await refreshTasks();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false, state.editingTaskId ? 'Cập nhật' : 'Lưu công việc');
  }
}

async function deleteTask(id) {
  const task = state.tasks.find((t) => String(t.id) === String(id));
  const ok = await confirmDialog('Xóa công việc "' + (task ? task.title : '#' + id) + '"? Hành động không thể hoàn tác.');
  if (!ok) return;
  try {
    await apiDelete('/api/tasks/' + id);
    toast('Đã xóa công việc');
    await refreshTasks();
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function quickStatus(id, status) {
  try {
    await apiPatch('/api/tasks/' + id + '/status', { status });
    toast('Cập nhật trạng thái thành công');
    await refreshTasks();
  } catch (err) {
    toast(err.message, 'error');
    await refreshTasks();
  }
}

/* ============================== TEAM MODAL ============================== */

async function submitTeamForm(e) {
  e.preventDefault();
  const name = $('#fTeamName').value.trim();
  if (!name) {
    $('#errTeamName').hidden = false;
    $('#fTeamName').classList.add('invalid');
    return;
  }
  $('#errTeamName').hidden = true;
  $('#fTeamName').classList.remove('invalid');
  const btn = $('#btnSaveTeam');
  setLoading(btn, true);
  try {
    await apiPost('/api/teams', { name, description: $('#fTeamDesc').value.trim() });
    toast('Tạo nhóm thành công');
    closeModal('teamModal');
    $('#teamForm').reset();
    state.metaLoaded = false;
    await loadMeta();
    renderTeams();
  } catch (err) {
    toast(err.message, 'error');
  } finally {
    setLoading(btn, false, 'Tạo nhóm');
  }
}

/* ============================== EVENTS ============================== */

function bindEvents() {
  $$('.nav-item').forEach((btn) => btn.addEventListener('click', () => switchView(btn.dataset.view)));

  $('#btnNewTask').addEventListener('click', () => openTaskModal(null));
  $('#taskForm').addEventListener('submit', submitTaskForm);
  $('#teamForm').addEventListener('submit', submitTeamForm);
  $('#btnNewTeam').addEventListener('click', () => { $('#teamForm').reset(); openModal('teamModal'); });
  $('#btnRefreshStats').addEventListener('click', () => renderStats());

  $$('[data-close]').forEach((btn) => btn.addEventListener('click', () => closeModal(btn.dataset.close)));
  $$('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('mousedown', (e) => {
      if (e.target === backdrop && backdrop.id !== 'confirmDialog') closeModal(backdrop.id);
    });
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      $$('.modal-backdrop').forEach((m) => { if (!m.hidden && m.id !== 'confirmDialog') closeModal(m.id); });
    }
  });

  const onSearch = debounce(() => {
    state.filters.search = $('#searchInput').value.trim();
    if (state.view === 'list' || state.view === 'kanban') refreshTasks().catch((err) => toast(err.message, 'error'));
  }, 300);
  $('#searchInput').addEventListener('input', onSearch);

  [['#filterStatus', 'status'], ['#filterPriority', 'priority'], ['#filterType', 'type'], ['#filterTeam', 'team_id']]
    .forEach(([sel, key]) => {
      $(sel).addEventListener('change', (e) => {
        state.filters[key] = e.target.value;
        refreshTasks().catch((err) => toast(err.message, 'error'));
      });
    });

  $('#btnClearFilters').addEventListener('click', () => {
    state.filters = { status: '', priority: '', type: '', team_id: '', search: '' };
    $('#searchInput').value = '';
    ['#filterStatus', '#filterPriority', '#filterType', '#filterTeam'].forEach((sel) => { $(sel).value = ''; });
    refreshTasks().catch((err) => toast(err.message, 'error'));
  });

  document.addEventListener('click', (e) => {
    const actionBtn = e.target.closest('[data-action]');
    if (!actionBtn) return;
    const { action, id } = actionBtn.dataset;
    if (action === 'edit') openTaskModal(id);
    else if (action === 'delete') deleteTask(id);
    else if (action === 'members') showMembers(id);
  });

  document.addEventListener('change', (e) => {
    if (e.target.classList.contains('inline-status')) {
      quickStatus(e.target.dataset.id, e.target.value);
    }
  });
}

/* ============================== INIT ============================== */

async function init() {
  initTheme();
  bindEvents();
  checkHealth();
  setInterval(checkHealth, 30000);
  $('#taskList').innerHTML = skeletonRows(4);
  const hashView = location.hash.replace('#/', '');
  await switchView(['list', 'kanban', 'teams', 'stats'].includes(hashView) ? hashView : 'list');
}

document.addEventListener('DOMContentLoaded', init);
