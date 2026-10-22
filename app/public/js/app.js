/**
 * TaskTracker PRO - Frontend Logic
 * Hệ thống Quản lý Công việc Cá nhân và Nhóm (Đề 24)
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
};

// DOM Elements
const elements = {
  // Stats
  statTotal: document.getElementById('statTotal'),
  statInProgress: document.getElementById('statInProgress'),
  statDone: document.getElementById('statDone'),
  statOverdue: document.getElementById('statOverdue'),

  // Filters & Controls
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  typeFilterTabs: document.getElementById('typeFilterTabs'),
  priorityFilter: document.getElementById('priorityFilter'),
  btnViewKanban: document.getElementById('btnViewKanban'),
  btnViewList: document.getElementById('btnViewList'),

  // Views
  kanbanView: document.getElementById('kanbanView'),
  listView: document.getElementById('listView'),
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

  // Modal
  taskModal: document.getElementById('taskModal'),
  taskForm: document.getElementById('taskForm'),
  modalTitle: document.getElementById('modalTitle'),
  taskIdInput: document.getElementById('taskId'),
  taskTitle: document.getElementById('taskTitle'),
  taskDescription: document.getElementById('taskDescription'),
  taskType: document.getElementById('taskType'),
  taskTeam: document.getElementById('taskTeam'),
  taskStatus: document.getElementById('taskStatus'),
  taskPriority: document.getElementById('taskPriority'),
  taskAssignee: document.getElementById('taskAssignee'),
  taskDeadline: document.getElementById('taskDeadline'),
  teamSelectGroup: document.getElementById('teamSelectGroup'),
  btnOpenNewTaskModal: document.getElementById('btnOpenNewTaskModal'),
  btnCloseModal: document.getElementById('btnCloseModal'),
  btnCancelModal: document.getElementById('btnCancelModal'),

  // Feedback & Status
  toastContainer: document.getElementById('toastContainer'),
  systemStatusBadge: document.getElementById('systemStatusBadge'),
};

// ============================================================================
// Toast Notification Utility
// ============================================================================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? 'fa-circle-check' : 'fa-triangle-exclamation';
  toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
  elements.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    toast.style.transition = 'all 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================================================
// API Calls
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
    console.error(err);
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats/summary');
    const data = await res.json();
    if (data.success) {
      const { total, overdue, byStatus } = data.data;
      elements.statTotal.textContent = total;
      elements.statOverdue.textContent = overdue;

      const inProgressCount = byStatus.find(s => s.status === 'in_progress')?.count || 0;
      const doneCount = byStatus.find(s => s.status === 'done')?.count || 0;

      elements.statInProgress.textContent = inProgressCount;
      elements.statDone.textContent = doneCount;
    }
  } catch (err) {
    console.error('Lỗi khi cập nhật thống kê:', err);
  }
}

async function fetchMetadata() {
  try {
    // Teams
    const teamsRes = await fetch('/api/teams');
    const teamsData = await teamsRes.json();
    if (teamsData.success) {
      state.teams = teamsData.data;
      populateTeamSelect();
    }

    // Users
    const usersRes = await fetch('/api/teams/users/all');
    const usersData = await usersRes.json();
    if (usersData.success) {
      state.users = usersData.data;
      populateUserSelect();
    }
  } catch (err) {
    console.error('Lỗi khi tải thông tin teams & users:', err);
  }
}

async function checkSystemHealth() {
  try {
    const res = await fetch('/health');
    const data = await res.json();
    if (data.status === 'UP') {
      elements.systemStatusBadge.className = 'system-status';
      elements.systemStatusBadge.innerHTML = `
        <span class="status-dot"></span>
        <span class="status-text">PostgreSQL & App: OK</span>
      `;
    }
  } catch (err) {
    elements.systemStatusBadge.className = 'system-status';
    elements.systemStatusBadge.style.borderColor = 'rgba(244, 63, 94, 0.4)';
    elements.systemStatusBadge.style.color = '#FB7185';
    elements.systemStatusBadge.innerHTML = `
      <span class="status-dot" style="background:#F43F5E; box-shadow:0 0 10px #F43F5E;"></span>
      <span class="status-text">Mất kết nối</span>
    `;
  }
}

// ============================================================================
// Renderers
// ============================================================================
function renderTasks() {
  if (state.currentView === 'kanban') {
    renderKanban();
  } else {
    renderList();
  }
}

function renderKanban() {
  const groups = {
    todo: [],
    in_progress: [],
    review: [],
    done: [],
  };

  state.tasks.forEach(task => {
    if (groups[task.status]) {
      groups[task.status].push(task);
    }
  });

  // Update counts
  elements.countTodo.textContent = groups.todo.length;
  elements.countInProgress.textContent = groups.in_progress.length;
  elements.countReview.textContent = groups.review.length;
  elements.countDone.textContent = groups.done.length;

  // Render cards
  elements.cardsTodo.innerHTML = renderColumnCards(groups.todo, 'todo');
  elements.cardsInProgress.innerHTML = renderColumnCards(groups.in_progress, 'in_progress');
  elements.cardsReview.innerHTML = renderColumnCards(groups.review, 'review');
  elements.cardsDone.innerHTML = renderColumnCards(groups.done, 'done');
}

function renderColumnCards(taskList, columnStatus) {
  if (taskList.length === 0) {
    return `<div class="column-empty"><i class="fa-regular fa-folder-open"></i> Chưa có công việc</div>`;
  }

  return taskList.map(task => {
    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
    const formattedDeadline = task.deadline ? formatDateTime(task.deadline) : 'Không có hạn';
    
    // Priority badge
    const priorityClass = `priority-${task.priority}`;
    const priorityLabels = { high: 'Ưu tiên Cao', medium: 'Ưu tiên TB', low: 'Ưu tiên Thấp' };
    
    // Type badge
    const typeBadge = task.type === 'team' 
      ? `<span class="badge-tag tag-team"><i class="fa-solid fa-users"></i> ${escapeHTML(task.team_name || 'Nhóm')}</span>`
      : `<span class="badge-tag tag-personal"><i class="fa-solid fa-user"></i> Cá nhân</span>`;

    // Status step transitions
    const statusTransitions = getNextStatusOptions(task.status);
    const transitionButtons = statusTransitions.map(opt => `
      <button class="btn-card-action" onclick="changeTaskStatus(${task.id}, '${opt.status}')" title="Chuyển sang: ${opt.label}">
        ${opt.icon} ${opt.label}
      </button>
    `).join('');

    return `
      <div class="task-card" onclick="handleCardClick(event, ${task.id})">
        <div class="task-card-header">
          <div class="task-tags">
            ${typeBadge}
            <span class="badge-tag ${priorityClass}">${priorityLabels[task.priority] || task.priority}</span>
          </div>
        </div>

        <h4 class="task-title">${escapeHTML(task.title)}</h4>
        ${task.description ? `<p class="task-desc">${escapeHTML(task.description)}</p>` : ''}

        <div class="task-meta">
          <span class="task-deadline ${isOverdue ? 'deadline-overdue' : ''}">
            <i class="fa-regular fa-clock"></i> ${formattedDeadline}
            ${isOverdue ? '<i class="fa-solid fa-triangle-exclamation" title="Đã quá hạn!"></i>' : ''}
          </span>

          <div class="task-assignee">
            <span class="assignee-avatar" title="${escapeHTML(task.assigned_user_name || 'Chưa gán')}">
              ${task.assigned_user_name ? task.assigned_user_name.charAt(0).toUpperCase() : '?'}
            </span>
          </div>
        </div>

        <div class="card-actions" onclick="event.stopPropagation()">
          ${transitionButtons}
          <button class="btn-card-action" onclick="openEditTaskModal(${task.id})" title="Chỉnh sửa">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="btn-card-action btn-card-delete" onclick="deleteTask(${task.id})" title="Xóa">
            <i class="fa-solid fa-trash"></i>
          </button>
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
          Không tìm thấy công việc nào phù hợp với bộ lọc hiện tại.
        </td>
      </tr>
    `;
    return;
  }

  elements.listTableBody.innerHTML = state.tasks.map(task => {
    const isOverdue = task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done';
    const statusLabels = {
      todo: '<span class="badge-tag" style="background: rgba(148, 163, 184, 0.2); color: #CBD5E1;">Cần làm</span>',
      in_progress: '<span class="badge-tag" style="background: rgba(245, 158, 11, 0.2); color: #FCD34D;">Đang thực hiện</span>',
      review: '<span class="badge-tag" style="background: rgba(168, 85, 247, 0.2); color: #E9D5FF;">Đang đánh giá</span>',
      done: '<span class="badge-tag" style="background: rgba(16, 185, 129, 0.2); color: #6EE7B7;">Đã hoàn thành</span>',
    };

    const priorityBadge = `<span class="badge-tag priority-${task.priority}">${task.priority.toUpperCase()}</span>`;
    const typeBadge = task.type === 'team'
      ? `<span class="badge-tag tag-team"><i class="fa-solid fa-users"></i> ${escapeHTML(task.team_name || 'Nhóm')}</span>`
      : `<span class="badge-tag tag-personal"><i class="fa-solid fa-user"></i> Cá nhân</span>`;

    return `
      <tr>
        <td>
          <strong style="color:#FFF;">${escapeHTML(task.title)}</strong>
          ${task.description ? `<br><small style="color:var(--text-muted);">${escapeHTML(task.description.substring(0, 70))}...</small>` : ''}
        </td>
        <td>${typeBadge}</td>
        <td>${priorityBadge}</td>
        <td>${statusLabels[task.status] || task.status}</td>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="assignee-avatar">${task.assigned_user_name ? task.assigned_user_name.charAt(0).toUpperCase() : '?'}</span>
            <span>${escapeHTML(task.assigned_user_name || 'Chưa gán')}</span>
          </div>
        </td>
        <td>
          <span class="${isOverdue ? 'deadline-overdue' : ''}">
            ${task.deadline ? formatDateTime(task.deadline) : 'N/A'}
            ${isOverdue ? '⚠️' : ''}
          </span>
        </td>
        <td class="text-right">
          <button class="btn-card-action" onclick="openEditTaskModal(${task.id})"><i class="fa-solid fa-pen"></i> Sửa</button>
          <button class="btn-card-action btn-card-delete" onclick="deleteTask(${task.id})"><i class="fa-solid fa-trash"></i> Xóa</button>
        </td>
      </tr>
    `;
  }).join('');
}

function getNextStatusOptions(currentStatus) {
  switch (currentStatus) {
    case 'todo':
      return [{ status: 'in_progress', label: 'Bắt đầu', icon: '<i class="fa-solid fa-play"></i>' }];
    case 'in_progress':
      return [
        { status: 'review', label: 'Review', icon: '<i class="fa-solid fa-eye"></i>' },
        { status: 'done', label: 'Xong', icon: '<i class="fa-solid fa-check"></i>' }
      ];
    case 'review':
      return [
        { status: 'done', label: 'Duyệt', icon: '<i class="fa-solid fa-check-double"></i>' },
        { status: 'in_progress', label: 'Sửa lại', icon: '<i class="fa-solid fa-rotate-left"></i>' }
      ];
    case 'done':
      return [{ status: 'todo', label: 'Mở lại', icon: '<i class="fa-solid fa-arrow-rotate-left"></i>' }];
    default:
      return [];
  }
}

// ============================================================================
// Actions & Handlers
// ============================================================================
window.changeTaskStatus = async function(id, newStatus) {
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
    } else {
      showToast(data.message || 'Lỗi cập nhật', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ', 'error');
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
    } else {
      showToast(data.message || 'Lỗi khi xóa', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối máy chủ', 'error');
  }
};

window.openNewTaskModalWithStatus = function(status = 'todo') {
  state.editingTaskId = null;
  elements.modalTitle.innerHTML = '<i class="fa-solid fa-circle-plus"></i> Tạo Công Việc Mới';
  elements.taskForm.reset();
  elements.taskIdInput.value = '';
  elements.taskStatus.value = status;
  
  // Default deadline 2 days from now
  const defaultDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  elements.taskDeadline.value = defaultDate.toISOString().slice(0, 16);
  
  elements.taskType.value = 'personal';
  elements.teamSelectGroup.classList.add('hidden');
  elements.taskModal.classList.remove('hidden');
};

window.openEditTaskModal = function(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;

  state.editingTaskId = id;
  elements.modalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square"></i> Chỉnh Sửa Công Việc';
  elements.taskIdInput.value = task.id;
  elements.taskTitle.value = task.title;
  elements.taskDescription.value = task.description || '';
  elements.taskType.value = task.type || 'personal';
  elements.taskStatus.value = task.status;
  elements.taskPriority.value = task.priority;
  elements.taskTeam.value = task.team_id || '';
  elements.taskAssignee.value = task.assigned_to || '';

  if (task.deadline) {
    const dateObj = new Date(task.deadline);
    // local format YYYY-MM-DDTHH:mm
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(dateObj - tzOffset)).toISOString().slice(0, 16);
    elements.taskDeadline.value = localISOTime;
  } else {
    elements.taskDeadline.value = '';
  }

  if (task.type === 'team') {
    elements.teamSelectGroup.classList.remove('hidden');
  } else {
    elements.teamSelectGroup.classList.add('hidden');
  }

  elements.taskModal.classList.remove('hidden');
};

window.handleCardClick = function(event, id) {
  // If clicked directly on action buttons, do nothing
  if (event.target.closest('.card-actions')) return;
  openEditTaskModal(id);
};

// Populate Select Dropdowns
function populateTeamSelect() {
  elements.taskTeam.innerHTML = '<option value="">-- Chọn nhóm làm việc --</option>' +
    state.teams.map(t => `<option value="${t.id}">${escapeHTML(t.name)}</option>`).join('');
}

function populateUserSelect() {
  elements.taskAssignee.innerHTML = '<option value="">-- Chưa chỉ định --</option>' +
    state.users.map(u => `<option value="${u.id}">${escapeHTML(u.full_name)} (${escapeHTML(u.email)})</option>`).join('');
}

// Helpers
function formatDateTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// ============================================================================
// Event Listeners Setup
// ============================================================================
function setupEventListeners() {
  // Modal open & close
  elements.btnOpenNewTaskModal.addEventListener('click', () => openNewTaskModalWithStatus('todo'));
  elements.btnCloseModal.addEventListener('click', () => elements.taskModal.classList.add('hidden'));
  elements.btnCancelModal.addEventListener('click', () => elements.taskModal.classList.add('hidden'));

  // Close modal when click outside box
  elements.taskModal.addEventListener('click', (e) => {
    if (e.target === elements.taskModal) {
      elements.taskModal.classList.add('hidden');
    }
  });

  // Toggle team selection when task type changes
  elements.taskType.addEventListener('change', () => {
    if (elements.taskType.value === 'team') {
      elements.teamSelectGroup.classList.remove('hidden');
    } else {
      elements.teamSelectGroup.classList.add('hidden');
      elements.taskTeam.value = '';
    }
  });

  // Form submit
  elements.taskForm.addEventListener('submit', async (e) => {
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
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (data.success) {
        showToast(state.editingTaskId ? 'Cập nhật công việc thành công!' : 'Tạo mới công việc thành công!');
        elements.taskModal.classList.add('hidden');
        fetchTasks();
        fetchStats();
      } else {
        showToast(data.message || 'Lỗi thực thi', 'error');
      }
    } catch (err) {
      showToast('Không thể gửi yêu cầu đến máy chủ', 'error');
    }
  });

  // Search input debounce
  let searchTimeout;
  elements.searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const val = e.target.value.trim();
    elements.btnClearSearch.classList.toggle('hidden', val === '');
    searchTimeout = setTimeout(() => {
      state.filters.search = val;
      fetchTasks();
    }, 300);
  });

  elements.btnClearSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    elements.btnClearSearch.classList.add('hidden');
    state.filters.search = '';
    fetchTasks();
  });

  // Scope filter tabs (All / Personal / Team)
  elements.typeFilterTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.filter-tab');
    if (!tab) return;
    document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
    tab.classList.add('active');
    state.filters.type = tab.dataset.type;
    fetchTasks();
  });

  // Priority select filter
  elements.priorityFilter.addEventListener('change', (e) => {
    state.filters.priority = e.target.value;
    fetchTasks();
  });

  // View switchers
  elements.btnViewKanban.addEventListener('click', () => {
    state.currentView = 'kanban';
    elements.btnViewKanban.classList.add('active');
    elements.btnViewList.classList.remove('active');
    elements.kanbanView.classList.remove('hidden');
    elements.listView.classList.add('hidden');
    renderTasks();
  });

  elements.btnViewList.addEventListener('click', () => {
    state.currentView = 'list';
    elements.btnViewList.classList.add('active');
    elements.btnViewKanban.classList.remove('active');
    elements.listView.classList.remove('hidden');
    elements.kanbanView.classList.add('hidden');
    renderTasks();
  });
}

// ============================================================================
// Initialization
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  fetchMetadata();
  fetchTasks();
  fetchStats();
  checkSystemHealth();

  // Auto refresh stats and health every 30 seconds
  setInterval(() => {
    fetchStats();
    checkSystemHealth();
  }, 30000);
});
