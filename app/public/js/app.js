/**
 * TASKFLOW PRO - Modern SPA Engine
 * Full Drag-and-Drop, Realtime Analytics & Responsive Kanban
 */

// Application State
const state = {
  tasks: [],
  teams: [],
  users: [],
  filters: {
    type: '',       // '' | 'personal' | 'team'
    priority: '',   // '' | 'high' | 'medium' | 'low'
    search: '',
  },
  currentView: 'kanban', // 'kanban' | 'list'
  editingTaskId: null,
  draggedTaskId: null,
  charts: {
    status: null,
    priority: null,
  }
};

// DOM References
const elements = {
  // KPI Elements
  kpiTotal: document.getElementById('kpiTotal'),
  kpiInProgress: document.getElementById('kpiInProgress'),
  kpiDone: document.getElementById('kpiDone'),
  kpiOverdue: document.getElementById('kpiOverdue'),
  kpiPercentDone: document.getElementById('kpiPercentDone'),
  sidebarTotalBadge: document.getElementById('sidebarTotalBadge'),
  dbStatusText: document.getElementById('dbStatusText'),

  // Filters & Search
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  typeFilters: document.getElementById('typeFilters'),
  priorityFilter: document.getElementById('priorityFilter'),

  // Views & Sections
  kanbanBoard: document.getElementById('kanbanBoard'),
  listView: document.getElementById('listView'),
  analyticsSection: document.getElementById('analyticsSection'),
  listTableBody: document.getElementById('listTableBody'),

  // Columns & Counts
  cardsTodo: document.getElementById('cardsTodo'),
  cardsInProgress: document.getElementById('cardsInProgress'),
  cardsReview: document.getElementById('cardsReview'),
  cardsDone: document.getElementById('cardsDone'),
  countTodo: document.getElementById('countTodo'),
  countInProgress: document.getElementById('countInProgress'),
  countReview: document.getElementById('countReview'),
  countDone: document.getElementById('countDone'),

  // Navigation Items
  navKanban: document.getElementById('navKanban'),
  navList: document.getElementById('navList'),
  navAnalytics: document.getElementById('navAnalytics'),

  // Modal
  taskModal: document.getElementById('taskModal'),
  taskForm: document.getElementById('taskForm'),
  modalTitle: document.getElementById('modalTitle'),
  taskIdInput: document.getElementById('taskId'),
  taskTitle: document.getElementById('taskTitle'),
  taskDescription: document.getElementById('taskDescription'),
  taskType: document.getElementById('taskType'),
  taskTeam: document.getElementById('taskTeam'),
  teamSelectBlock: document.getElementById('teamSelectBlock'),
  taskStatus: document.getElementById('taskStatus'),
  taskPriority: document.getElementById('taskPriority'),
  taskAssignee: document.getElementById('taskAssignee'),
  taskDeadline: document.getElementById('taskDeadline'),
  btnOpenNewTaskModal: document.getElementById('btnOpenNewTaskModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  btnCancelModal: document.getElementById('btnCancelModal'),

  // Toasts
  toastContainer: document.getElementById('toastContainer'),
};

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast-msg toast-${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${escapeHTML(message)}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// ============================================================================
// API DATA SYNC
// ============================================================================
async function fetchTasks() {
  try {
    const params = new URLSearchParams();
    if (state.filters.type) params.append('type', state.filters.type);
    if (state.filters.priority) params.append('priority', state.filters.priority);
    if (state.filters.search) params.append('search', state.filters.search);

    const res = await fetch(`/api/tasks?${params.toString()}`);
    const data = await res.json();
    if (data.success) {
      state.tasks = data.data;
      renderTasks();
    }
  } catch (err) {
    showToast('Lỗi khi tải danh sách công việc', 'error');
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats/summary');
    const data = await res.json();
    if (data.success) {
      const { total, overdue, byStatus, byPriority } = data.data;

      // Update KPI banner
      elements.kpiTotal.textContent = total;
      elements.sidebarTotalBadge.textContent = total;
      elements.kpiOverdue.textContent = overdue;

      const inProgressCount = byStatus.find(s => s.status === 'in_progress')?.count || 0;
      const doneCount = byStatus.find(s => s.status === 'done')?.count || 0;

      elements.kpiInProgress.textContent = inProgressCount;
      elements.kpiDone.textContent = doneCount;

      const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;
      elements.kpiPercentDone.textContent = `${percent}% hoàn thành`;

      // Update Charts
      updateCharts(byStatus, byPriority);
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

async function fetchMetadata() {
  try {
    // Teams
    const teamsRes = await fetch('/api/teams');
    const teamsData = await teamsRes.json();
    if (teamsData.success) {
      state.teams = teamsData.data;
      populateTeams();
    }

    // Users
    const usersRes = await fetch('/api/teams/users/all');
    const usersData = await usersRes.json();
    if (usersData.success) {
      state.users = usersData.data;
      populateUsers();
    }
  } catch (err) {
    console.error('Metadata error:', err);
  }
}

async function checkHealth() {
  try {
    const res = await fetch('/health');
    const data = await res.json();
    if (data.status === 'UP') {
      elements.dbStatusText.textContent = 'PostgreSQL 16 OK';
      elements.dbStatusText.className = 'text-emerald';
    }
  } catch {
    elements.dbStatusText.textContent = 'Mất kết nối DB';
    elements.dbStatusText.className = 'text-rose';
  }
}

// ============================================================================
// CHARTS (Chart.js Integration)
// ============================================================================
function updateCharts(byStatus, byPriority) {
  if (typeof Chart === 'undefined') return;

  // 1. Status Doughnut Chart
  const statusLabels = { todo: 'Cần làm', in_progress: 'Đang làm', review: 'Đánh giá', done: 'Hoàn thành' };
  const statusColors = { todo: '#94A3B8', in_progress: '#F59E0B', review: '#A855F7', done: '#10B981' };

  const sKeys = ['todo', 'in_progress', 'review', 'done'];
  const sData = sKeys.map(k => byStatus.find(s => s.status === k)?.count || 0);

  const statusCtx = document.getElementById('statusChart');
  if (statusCtx) {
    if (state.charts.status) {
      state.charts.status.data.datasets[0].data = sData;
      state.charts.status.update();
    } else {
      state.charts.status = new Chart(statusCtx, {
        type: 'doughnut',
        data: {
          labels: sKeys.map(k => statusLabels[k]),
          datasets: [{
            data: sData,
            backgroundColor: sKeys.map(k => statusColors[k]),
            borderWidth: 2,
            borderColor: '#0D121F'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: '#94A3B8', font: { family: 'Plus Jakarta Sans', size: 11 } } }
          },
          cutout: '70%'
        }
      });
    }
  }

  // 2. Priority Bar Chart
  const pKeys = ['high', 'medium', 'low'];
  const pLabels = ['Cao 🔴', 'Trung bình 🟡', 'Thấp 🟢'];
  const pColors = ['#F43F5E', '#F59E0B', '#10B981'];
  const pData = pKeys.map(k => byPriority.find(p => p.priority === k)?.count || 0);

  const priorityCtx = document.getElementById('priorityChart');
  if (priorityCtx) {
    if (state.charts.priority) {
      state.charts.priority.data.datasets[0].data = pData;
      state.charts.priority.update();
    } else {
      state.charts.priority = new Chart(priorityCtx, {
        type: 'bar',
        data: {
          labels: pLabels,
          datasets: [{
            label: 'Số lượng công việc',
            data: pData,
            backgroundColor: pColors,
            borderRadius: 6,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            y: { beginAtZero: true, ticks: { precision: 0, color: '#64748B' }, grid: { color: 'rgba(255,255,255,0.05)' } },
            x: { ticks: { color: '#94A3B8' }, grid: { display: false } }
          },
          plugins: { legend: { display: false } }
        }
      });
    }
  }
}

// ============================================================================
// DRAG & DROP HANDLERS (Native HTML5 API)
// ============================================================================
window.handleDragStart = function(event, taskId) {
  state.draggedTaskId = taskId;
  event.currentTarget.classList.add('dragging');
  event.dataTransfer.setData('text/plain', taskId);
  event.dataTransfer.effectAllowed = 'move';
};

window.handleDragEnd = function(event) {
  event.currentTarget.classList.remove('dragging');
  document.querySelectorAll('.card-drop-zone').forEach(z => z.classList.remove('drag-active'));
};

window.handleDragOver = function(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  const dropZone = event.currentTarget.closest('.card-drop-zone');
  if (dropZone) dropZone.classList.add('drag-active');
};

window.handleDragLeave = function(event) {
  const dropZone = event.currentTarget.closest('.card-drop-zone');
  if (dropZone && !dropZone.contains(event.relatedTarget)) {
    dropZone.classList.remove('drag-active');
  }
};

window.handleDrop = async function(event, targetStatus) {
  event.preventDefault();
  const dropZone = event.currentTarget.closest('.card-drop-zone');
  if (dropZone) dropZone.classList.remove('drag-active');

  const taskId = state.draggedTaskId || event.dataTransfer.getData('text/plain');
  if (!taskId) return;

  const currentTask = state.tasks.find(t => t.id === parseInt(taskId, 10));
  if (currentTask && currentTask.status === targetStatus) return;

  try {
    const res = await fetch(`/api/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: targetStatus })
    });
    const data = await res.json();
    if (data.success) {
      const statusVN = { todo: 'Cần làm', in_progress: 'Đang làm', review: 'Đánh giá', done: 'Hoàn thành' };
      showToast(`Đã chuyển công việc sang "${statusVN[targetStatus]}"!`);
      fetchTasks();
      fetchStats();
    }
  } catch (err) {
    showToast('Lỗi cập nhật trạng thái', 'error');
  } finally {
    state.draggedTaskId = null;
  }
};

// ============================================================================
// RENDERERS
// ============================================================================
function renderTasks() {
  if (state.currentView === 'kanban') {
    renderKanban();
  } else {
    renderList();
  }
}

function renderKanban() {
  const groups = { todo: [], in_progress: [], review: [], done: [] };
  state.tasks.forEach(t => {
    if (groups[t.status]) groups[t.status].push(t);
  });

  elements.countTodo.textContent = groups.todo.length;
  elements.countInProgress.textContent = groups.in_progress.length;
  elements.countReview.textContent = groups.review.length;
  elements.countDone.textContent = groups.done.length;

  elements.cardsTodo.innerHTML = renderCardsList(groups.todo, 'todo');
  elements.cardsInProgress.innerHTML = renderCardsList(groups.in_progress, 'in_progress');
  elements.cardsReview.innerHTML = renderCardsList(groups.review, 'review');
  elements.cardsDone.innerHTML = renderCardsList(groups.done, 'done');
}

function renderCardsList(taskList, colStatus) {
  if (taskList.length === 0) {
    return `<div class="empty-col-notice"><i class="fa-regular fa-folder-open"></i> Chưa có việc</div>`;
  }

  return taskList.map(task => {
    const priorityLabels = { high: 'Cao', medium: 'Trung bình', low: 'Thấp' };
    const typeBadge = task.type === 'team'
      ? `<span class="tag-badge tag-team"><i class="fa-solid fa-users"></i> ${escapeHTML(task.team_name || 'Nhóm')}</span>`
      : `<span class="tag-badge tag-personal"><i class="fa-solid fa-user"></i> Cá nhân</span>`;

    const deadlineInfo = computeDeadlineNotice(task.deadline, task.status);

    const stepButtons = getTransitionButtons(task.status, task.id);

    return `
      <div class="task-item" 
           draggable="true" 
           ondragstart="handleDragStart(event, ${task.id})"
           ondragend="handleDragEnd(event)"
           onclick="handleCardClick(event, ${task.id})">
        
        <div class="task-top">
          <div class="task-tags">
            ${typeBadge}
            <span class="tag-badge priority-${task.priority}">${priorityLabels[task.priority] || task.priority}</span>
          </div>
        </div>

        <h4 class="task-title-text">${escapeHTML(task.title)}</h4>
        ${task.description ? `<p class="task-desc-text">${escapeHTML(task.description)}</p>` : ''}

        <div class="task-bottom">
          <span class="deadline-chip ${deadlineInfo.isOverdue ? 'is-overdue' : ''}">
            <i class="fa-regular fa-clock"></i> ${deadlineInfo.text}
          </span>

          <div class="assignee-bubble" title="${escapeHTML(task.assigned_user_name || 'Chưa gán')}">
            ${task.assigned_user_name ? task.assigned_user_name.charAt(0).toUpperCase() : '?'}
          </div>
        </div>

        <div class="task-actions" onclick="event.stopPropagation()">
          ${stepButtons}
          <button class="btn-step" onclick="openEditModal(${task.id})" title="Chỉnh sửa"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-step btn-del" onclick="deleteTask(${task.id})" title="Xóa"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `;
  }).join('');
}

function renderList() {
  if (state.tasks.length === 0) {
    elements.listTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align:center; padding: 40px; color: var(--text-muted);">
          Không tìm thấy công việc phù hợp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  elements.listTableBody.innerHTML = state.tasks.map(task => {
    const deadlineInfo = computeDeadlineNotice(task.deadline, task.status);
    const statusMap = {
      todo: '<span class="tag-badge" style="background: rgba(148, 163, 184, 0.2); color: #CBD5E1;">Cần làm</span>',
      in_progress: '<span class="tag-badge priority-medium">Đang làm</span>',
      review: '<span class="tag-badge" style="background: rgba(168, 85, 247, 0.2); color: #E9D5FF;">Đang đánh giá</span>',
      done: '<span class="tag-badge priority-low">Hoàn thành</span>',
    };

    return `
      <tr>
        <td>
          <strong style="color:#FFF;">${escapeHTML(task.title)}</strong>
          ${task.description ? `<br><small style="color:var(--text-muted);">${escapeHTML(task.description.substring(0, 70))}...</small>` : ''}
        </td>
        <td>${task.type === 'team' ? '👥 Nhóm' : '👤 Cá nhân'}</td>
        <td><span class="tag-badge priority-${task.priority}">${task.priority.toUpperCase()}</span></td>
        <td>${statusMap[task.status] || task.status}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div class="assignee-bubble">${task.assigned_user_name ? task.assigned_user_name.charAt(0).toUpperCase() : '?'}</div>
            <span>${escapeHTML(task.assigned_user_name || 'Chưa gán')}</span>
          </div>
        </td>
        <td>
          <span class="${deadlineInfo.isOverdue ? 'text-rose' : ''}">${deadlineInfo.text}</span>
        </td>
        <td class="text-right">
          <button class="btn-step" onclick="openEditModal(${task.id})"><i class="fa-solid fa-pen"></i></button>
          <button class="btn-step btn-del" onclick="deleteTask(${task.id})"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('');
}

function getTransitionButtons(currentStatus, id) {
  switch (currentStatus) {
    case 'todo':
      return `<button class="btn-step" onclick="quickUpdateStatus(${id}, 'in_progress')"><i class="fa-solid fa-play"></i> Bắt đầu</button>`;
    case 'in_progress':
      return `
        <button class="btn-step" onclick="quickUpdateStatus(${id}, 'review')"><i class="fa-solid fa-eye"></i> Review</button>
        <button class="btn-step" onclick="quickUpdateStatus(${id}, 'done')"><i class="fa-solid fa-check"></i> Xong</button>
      `;
    case 'review':
      return `
        <button class="btn-step" onclick="quickUpdateStatus(${id}, 'done')"><i class="fa-solid fa-check-double"></i> Duyệt</button>
        <button class="btn-step" onclick="quickUpdateStatus(${id}, 'in_progress')"><i class="fa-solid fa-rotate-left"></i> Sửa lại</button>
      `;
    case 'done':
      return `<button class="btn-step" onclick="quickUpdateStatus(${id}, 'todo')"><i class="fa-solid fa-arrow-rotate-left"></i> Mở lại</button>`;
    default:
      return '';
  }
}

function computeDeadlineNotice(deadlineStr, status) {
  if (!deadlineStr) return { text: 'Không hạn', isOverdue: false };
  const deadline = new Date(deadlineStr);
  const now = new Date();
  const diffDays = Math.round((deadline - now) / (1000 * 60 * 60 * 24));

  if (deadline < now && status !== 'done') {
    return { text: `Quá hạn ${Math.abs(diffDays)} ngày ⚠️`, isOverdue: true };
  }
  if (diffDays === 0) return { text: 'Hạn hôm nay 🔥', isOverdue: false };
  if (diffDays === 1) return { text: 'Còn 1 ngày', isOverdue: false };
  return { text: `Còn ${diffDays} ngày`, isOverdue: false };
}

// ============================================================================
// CRUD ACTIONS
// ============================================================================
window.quickUpdateStatus = async function(id, newStatus) {
  try {
    const res = await fetch(`/api/tasks/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    });
    const data = await res.json();
    if (data.success) {
      showToast('Cập nhật trạng thái thành công!');
      fetchTasks();
      fetchStats();
    }
  } catch (err) {
    showToast('Lỗi cập nhật trạng thái', 'error');
  }
};

window.deleteTask = async function(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa công việc này?')) return;
  try {
    const res = await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa công việc!');
      fetchTasks();
      fetchStats();
    }
  } catch {
    showToast('Lỗi khi xóa công việc', 'error');
  }
};

window.openCreateModal = function(status = 'todo') {
  state.editingTaskId = null;
  elements.modalTitle.textContent = 'Tạo Công Việc Mới';
  elements.taskForm.reset();
  elements.taskIdInput.value = '';
  elements.taskStatus.value = status;

  const defaultDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  elements.taskDeadline.value = defaultDate.toISOString().slice(0, 16);

  elements.taskType.value = 'personal';
  elements.teamSelectBlock.classList.add('hidden');
  elements.taskModal.classList.remove('hidden');
};

window.openEditModal = function(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  state.editingTaskId = id;
  elements.modalTitle.textContent = 'Chỉnh Sửa Công Việc';
  elements.taskIdInput.value = task.id;
  elements.taskTitle.value = task.title;
  elements.taskDescription.value = task.description || '';
  elements.taskType.value = task.type || 'personal';
  elements.taskStatus.value = task.status;
  elements.taskPriority.value = task.priority;
  elements.taskTeam.value = task.team_id || '';
  elements.taskAssignee.value = task.assigned_to || '';

  if (task.deadline) {
    const d = new Date(task.deadline);
    const tzOffset = d.getTimezoneOffset() * 60000;
    elements.taskDeadline.value = (new Date(d - tzOffset)).toISOString().slice(0, 16);
  } else {
    elements.taskDeadline.value = '';
  }

  elements.teamSelectBlock.classList.toggle('hidden', task.type !== 'team');
  elements.taskModal.classList.remove('hidden');
};

window.handleCardClick = function(event, id) {
  if (event.target.closest('.task-actions')) return;
  openEditModal(id);
};

// Populate Helpers
function populateTeams() {
  elements.taskTeam.innerHTML = '<option value="">-- Chọn nhóm làm việc --</option>' +
    state.teams.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
}

function populateUsers() {
  elements.taskAssignee.innerHTML = '<option value="">-- Chọn thành viên phụ trách --</option>' +
    state.users.map(u => `<option value="${u.id}">${escapeHTML(u.full_name)} (${escapeHTML(u.email)})</option>`).join('');
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag));
}

// ============================================================================
// EVENT LISTENERS SETUP
// ============================================================================
function setupListeners() {
  // Navigation tabs
  elements.navKanban.addEventListener('click', () => {
    state.currentView = 'kanban';
    elements.navKanban.classList.add('active');
    elements.navList.classList.remove('active');
    elements.navAnalytics.classList.remove('active');
    elements.kanbanBoard.classList.remove('hidden');
    elements.listView.classList.add('hidden');
    elements.analyticsSection.classList.add('hidden');
    renderTasks();
  });

  elements.navList.addEventListener('click', () => {
    state.currentView = 'list';
    elements.navList.classList.add('active');
    elements.navKanban.classList.remove('active');
    elements.navAnalytics.classList.remove('active');
    elements.listView.classList.remove('hidden');
    elements.kanbanBoard.classList.add('hidden');
    elements.analyticsSection.classList.add('hidden');
    renderTasks();
  });

  elements.navAnalytics.addEventListener('click', () => {
    const isShowing = !elements.analyticsSection.classList.contains('hidden');
    elements.analyticsSection.classList.toggle('hidden', isShowing);
    elements.navAnalytics.classList.toggle('active', !isShowing);
  });

  // Modal open & close
  elements.btnOpenNewTaskModal.addEventListener('click', () => openCreateModal('todo'));
  elements.btnCloseModal.addEventListener('click', () => elements.taskModal.classList.add('hidden'));
  elements.btnCancelModal.addEventListener('click', () => elements.taskModal.classList.add('hidden'));

  elements.taskModal.addEventListener('click', e => {
    if (e.target === elements.taskModal) elements.taskModal.classList.add('hidden');
  });

  elements.taskType.addEventListener('change', () => {
    elements.teamSelectBlock.classList.toggle('hidden', elements.taskType.value !== 'team');
  });

  // Task submit
  elements.taskForm.addEventListener('submit', async e => {
    e.preventDefault();
    const payload = {
      title: elements.taskTitle.value.trim(),
      description: elements.taskDescription.value.trim(),
      type: elements.taskType.value,
      team_id: elements.taskType.value === 'team' ? elements.taskTeam.value : null,
      status: elements.taskStatus.value,
      priority: elements.taskPriority.value,
      assigned_to: elements.taskAssignee.value || null,
      deadline: elements.taskDeadline.value || null,
    };

    try {
      let res;
      if (state.editingTaskId) {
        res = await fetch(`/api/tasks/${state.editingTaskId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      } else {
        res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      const data = await res.json();
      if (data.success) {
        showToast(state.editingTaskId ? 'Cập nhật công việc thành công!' : 'Tạo mới công việc thành công!');
        elements.taskModal.classList.add('hidden');
        fetchTasks();
        fetchStats();
      } else {
        showToast(data.message || 'Lỗi xử lý', 'error');
      }
    } catch {
      showToast('Lỗi gửi dữ liệu', 'error');
    }
  });

  // Search
  let searchTimer;
  elements.searchInput.addEventListener('input', e => {
    clearTimeout(searchTimer);
    const val = e.target.value.trim();
    elements.btnClearSearch.classList.toggle('hidden', val === '');
    searchTimer = setTimeout(() => {
      state.filters.search = val;
      fetchTasks();
    }, 250);
  });

  elements.btnClearSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.btnClearSearch.classList.add('hidden');
    state.filters.search = '';
    fetchTasks();
  });

  // Segmented Type Filters (All / Personal / Team)
  elements.typeFilters.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    document.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.filters.type = btn.dataset.type;
    fetchTasks();
  });

  // Priority Filter
  elements.priorityFilter.addEventListener('change', e => {
    state.filters.priority = e.target.value;
    fetchTasks();
  });
}

// ============================================================================
// INIT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupListeners();
  fetchMetadata();
  fetchTasks();
  fetchStats();
  checkHealth();

  setInterval(() => {
    fetchStats();
    checkHealth();
  }, 25000);
});
