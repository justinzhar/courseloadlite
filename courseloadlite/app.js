// ── Supabase config ──────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://twawxrbtlviudolyfamb.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR3YXd4cmJ0bHZpdWRvbHlmYW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM1OTM2NzAsImV4cCI6MjA4OTE2OTY3MH0.zxlDQcg6mCsxBTaCK44HASNYJHAuNTJI5oBF7RyUm9c';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let courses = [];
let assignments = [];
let assignStatuses = {};   // { assignment_id: 'not_started'|'in_progress'|'done' }
let activeFilter = 'all';
let modalType = null; // 'course' | 'assignment'
let editingId = null; // id of record being edited, null = new

// selected values for modal
let selColor = '#6366f1';
let selCourseId = null;
let selType = 'homework';

const COURSE_COLORS = [
  '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e',
  '#f59e0b', '#10b981', '#14b8a6', '#3b82f6',
  '#06b6d4', '#84cc16', '#f97316', '#64748b',
];

// ── Auth ─────────────────────────────────────────────────────────────────────
let authMode = 'signin';

function switchAuthTab(mode) {
  authMode = mode;
  document.getElementById('tab-signin').classList.toggle('active', mode === 'signin');
  document.getElementById('tab-signup').classList.toggle('active', mode === 'signup');
  document.getElementById('auth-submit-btn').textContent = mode === 'signin' ? 'Sign In' : 'Create Account';
  document.getElementById('auth-error').classList.add('hidden');
}

async function handleAuth(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const btn = document.getElementById('auth-submit-btn');
  const errEl = document.getElementById('auth-error');
  errEl.classList.add('hidden');
  btn.disabled = true;
  btn.textContent = authMode === 'signin' ? 'Signing in…' : 'Creating account…';

  let error = null;
  if (authMode === 'signin') {
    ({ error } = await sb.auth.signInWithPassword({ email, password }));
  } else {
    ({ error } = await sb.auth.signUp({ email, password }));
  }

  btn.disabled = false;
  btn.textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';

  if (error) {
    errEl.textContent = error.message;
    errEl.classList.remove('hidden');
    return;
  }

  if (authMode === 'signup') {
    errEl.style.color = '#22c55e';
    errEl.textContent = '✓ Account created! Sign in below.';
    errEl.classList.remove('hidden');
    switchAuthTab('signin');
  }
}

async function handleSignOut() {
  await sb.auth.signOut();
  showView('auth');
  currentUser = null;
  courses = [];
  assignments = [];
  assignStatuses = {};
}

// ── View switching ────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
}

function showSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-' + name).classList.add('active');
}

// ── Data fetching ─────────────────────────────────────────────────────────────
async function loadCourses() {
  // Query courses directly by user_id — simpler than the user_courses join
  const { data, error } = await sb
    .from('courses')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('name');

  if (error) { console.error('loadCourses error:', error); }
  courses = data || [];
  renderCourses();
}

async function loadAssignments() {
  if (!courses.length) {
    assignments = [];
    renderAssignments();
    return;
  }

  const courseIds = courses.map(c => c.id);

  // Fetch assignments for user's courses
  const { data: aData } = await sb
    .from('assignments')
    .select('*')
    .in('course_id', courseIds)
    .order('due_date');

  assignments = aData || [];

  // Fetch user's statuses for those assignments
  if (assignments.length) {
    const assignIds = assignments.map(a => a.id);
    const { data: sData } = await sb
      .from('user_assignment_status')
      .select('assignment_id, status')
      .eq('user_id', currentUser.id)
      .in('assignment_id', assignIds);

    assignStatuses = {};
    (sData || []).forEach(s => { assignStatuses[s.assignment_id] = s.status; });
  }

  renderAssignments();
}

// ── Render: Courses ───────────────────────────────────────────────────────────
function renderCourses() {
  const grid = document.getElementById('courses-grid');
  if (!courses.length) {
    grid.innerHTML = '<p class="empty-msg">No courses yet — add one to get started!</p>';
    return;
  }
  grid.innerHTML = courses.map(c => `
    <div class="course-card">
      <div class="course-card-bar" style="background:${c.color}"></div>
      <div class="course-card-body">
        <div class="course-card-name">${esc(c.name)}</div>
        <div class="course-card-code">${esc(c.code)}</div>
        <div class="course-card-meta">
          <span class="course-pill">${c.credit_hours} cr</span>
          <span class="course-pill">${esc(c.term)}</span>
        </div>
        <div class="course-card-actions">
          <button class="btn-ghost" onclick="openModal('course','${c.id}')">Edit</button>
          <button class="btn-danger" onclick="deleteCourse('${c.id}')">Remove</button>
        </div>
      </div>
    </div>
  `).join('');
}

// ── Render: Assignments ───────────────────────────────────────────────────────
function setFilter(f) {
  activeFilter = f;
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active', c.dataset.filter === f);
  });
  renderAssignments();
}

function renderAssignments() {
  const list = document.getElementById('assignments-list');
  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const filtered = assignments.filter(a => {
    const status = assignStatuses[a.id] || 'not_started';
    return activeFilter === 'all' || status === activeFilter;
  });

  if (!filtered.length) {
    list.innerHTML = '<p class="empty-msg">Nothing here yet!</p>';
    return;
  }

  list.innerHTML = filtered.map(a => {
    const course = courseMap[a.course_id] || {};
    const status = assignStatuses[a.id] || 'not_started';
    const due = new Date(a.due_date + 'T00:00:00');
    const overdue = status !== 'done' && due < today;
    const dueStr = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const statusIcon = status === 'done' ? '✓' : status === 'in_progress' ? '~' : '';

    return `
      <div class="assignment-card ${overdue ? 'overdue' : ''}" style="cursor:pointer" onclick="handleCardClick(event,'${a.id}')">
        <div class="a-color-bar" style="background:${course.color || '#94a3b8'}"></div>
        <button class="a-status-btn ${status}" onclick="event.stopPropagation();cycleStatus('${a.id}')" title="Toggle status">${statusIcon}</button>
        <div class="a-info">
          <div class="a-title ${status === 'done' ? 'done-text' : ''}">${esc(a.title)}</div>
          <div class="a-meta">
            <span style="color:${course.color || '#94a3b8'};font-weight:600">${esc(course.code || '')}</span>
            <span class="dot">•</span>
            <span>${capitalize(a.type)}</span>
            <span class="dot">•</span>
            <span ${overdue ? 'style="color:#ef4444;font-weight:600"' : ''}>${dueStr}${overdue ? ' ⚠' : ''}</span>
            ${a.description ? '<span class="dot">•</span><span style="color:#6366f1">📝 notes</span>' : ''}
          </div>
        </div>
        <div class="a-actions">
          <button class="icon-btn del" onclick="event.stopPropagation();deleteAssignment('${a.id}')" title="Delete">🗑</button>
        </div>
      </div>
    `;
  }).join('');
}

// ── Card click — go to detail page ────────────────────────────────────────────
function handleCardClick(event, assignId) {
  if (event.target.closest('.a-actions') || event.target.closest('.a-status-btn')) return;
  openAssignmentDetail(assignId);
}

// ── Assignment Detail Page ──────────────────────────────────────────────
function openAssignmentDetail(id) {
  const a = assignments.find(x => x.id === id);
  if (!a) return;
  renderAssignmentDetail(a);
  // Show the detail section (hide others)
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-assignment-detail').classList.add('active');
  // Keep Assignments highlighted in sidebar
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('nav-assignments').classList.add('active');
}

function renderAssignmentDetail(a) {
  const courseMap = Object.fromEntries(courses.map(c => [c.id, c]));
  const course = courseMap[a.course_id] || {};
  const status = assignStatuses[a.id] || 'not_started';
  const due = new Date(a.due_date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = status !== 'done' && due < today;
  const dueStr = due.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' });
  const statusLabel = { not_started: 'Not Started', in_progress: 'In Progress', done: 'Done' }[status];

  const dots = Array.from({ length: 5 }, (_, i) =>
    `<div class="difficulty-dot ${i < a.difficulty ? 'filled' : ''}"></div>`
  ).join('');

  const descHtml = a.description
    ? `<div class="detail-desc" id="detail-desc-text">${esc(a.description)}</div>`
    : `<div class="detail-desc empty" id="detail-desc-text">No description yet. Click Edit to add one.</div>`;

  document.getElementById('assignment-detail-content').innerHTML = `
    <button class="detail-back" onclick="goBackToAssignments()">← Back to list</button>

    <div class="detail-badges">
      <span class="course-badge" style="background:${course.color || '#94a3b8'}">${esc(course.code || 'Unknown')}</span>
      <span class="status-badge ${status}">${statusLabel}</span>
      ${overdue ? '<span class="status-badge" style="background:#fee2e2;color:#991b1b">⚠ Overdue</span>' : ''}
    </div>

    <h1 class="detail-title">${esc(a.title)}</h1>

    <div class="detail-meta-row">
      <div class="detail-meta-item">&#128336; <strong>${a.estimated_hours}h</strong>&nbsp;estimated</div>
      <div class="detail-meta-item">&#128197; Due <strong ${overdue ? 'style="color:#ef4444"' : ''}>${dueStr}</strong></div>
      <div class="detail-meta-item">&#128218; <strong>${capitalize(a.type)}</strong></div>
    </div>

    <div class="detail-actions">
      <button class="btn-ghost" onclick="cycleStatusOnDetail('${a.id}')" id="detail-status-btn">
        ${status === 'done' ? '&#10003; Mark Incomplete' : status === 'in_progress' ? '~ Mark Done' : '&#9675; Start Working'}
      </button>
      <button class="btn-primary" onclick="openModal('assignment','${a.id}')">✏ Edit</button>
      <button class="btn-danger" onclick="deleteAssignmentFromDetail('${a.id}')">&#128465; Delete</button>
    </div>

    <div class="detail-body">
      <!-- Main: description -->
      <div class="detail-card">
        <div class="detail-card-label">Description / Notes</div>
        ${descHtml}
      </div>

      <!-- Sidebar: stats -->
      <div class="detail-card">
        <div class="detail-card-label">Assignment Info</div>
        <div class="detail-stat-list">
          <div class="detail-stat">
            <span class="detail-stat-label">Course</span>
            <span class="detail-stat-value" style="color:${course.color || '#94a3b8'}">${esc(course.code || '—')}</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Type</span>
            <span class="detail-stat-value">${capitalize(a.type)}</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Due Date</span>
            <span class="detail-stat-value" ${overdue ? 'style="color:#ef4444"' : ''}>${due.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Est. Hours</span>
            <span class="detail-stat-value">${a.estimated_hours}h</span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Difficulty</span>
            <span class="detail-stat-value"><div class="difficulty-dots">${dots}</div></span>
          </div>
          <div class="detail-stat">
            <span class="detail-stat-label">Status</span>
            <span class="detail-stat-value">${statusLabel}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function goBackToAssignments() {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.getElementById('section-assignments').classList.add('active');
}

async function cycleStatusOnDetail(assignId) {
  await cycleStatus(assignId);
  // Re-render the detail page with updated status
  const a = assignments.find(x => x.id === assignId);
  if (a) renderAssignmentDetail(a);
}

async function deleteAssignmentFromDetail(id) {
  await deleteAssignment(id);
  goBackToAssignments();
}

// ── Status cycle ──────────────────────────────────────────────────────────────
async function cycleStatus(assignId) {
  const cycle = ['not_started', 'in_progress', 'done'];
  const current = assignStatuses[assignId] || 'not_started';
  const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];

  assignStatuses[assignId] = next;
  renderAssignments();

  // Upsert into user_assignment_status
  await sb.from('user_assignment_status').upsert({
    user_id: currentUser.id,
    assignment_id: assignId,
    status: next,
  }, { onConflict: 'user_id,assignment_id' });
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(type, id = null) {
  modalType = type;
  editingId = id;
  const overlay = document.getElementById('modal-overlay');
  const title = document.getElementById('modal-title');
  const body = document.getElementById('modal-body');

  if (type === 'course') {
    const course = id ? courses.find(c => c.id === id) : null;
    selColor = course ? course.color : COURSE_COLORS[0];
    title.textContent = course ? 'Edit Course' : 'Add Course';
    body.innerHTML = buildCourseForm(course);
  } else {
    const a = id ? assignments.find(x => x.id === id) : null;
    selCourseId = a ? a.course_id : (courses[0]?.id || null);
    selType = a ? a.type : 'homework';
    title.textContent = a ? 'Edit Assignment' : 'Add Assignment';
    body.innerHTML = buildAssignmentForm(a);
  }

  overlay.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

function handleOverlayClick(e) {
  if (e.target === document.getElementById('modal-overlay')) closeModal();
}

// ── Course form ───────────────────────────────────────────────────────────────
function buildCourseForm(c) {
  const swatches = COURSE_COLORS.map(col => `
    <div class="color-swatch ${col === selColor ? 'selected' : ''}" 
         style="background:${col}" 
         onclick="selectColor('${col}')" 
         id="swatch-${col.replace('#', '')}">
    </div>
  `).join('');

  return `
    <div class="field">
      <label>Course Name *</label>
      <input id="f-name" value="${esc(c?.name || '')}" placeholder="Introduction to Biology" />
    </div>
    <div class="field">
      <label>Course Code *</label>
      <input id="f-code" value="${esc(c?.code || '')}" placeholder="BIO 101" />
    </div>
    <div class="row-2">
      <div class="field">
        <label>Credits</label>
        <input id="f-credits" type="number" min="0" max="20" value="${c?.credit_hours ?? 3}" />
      </div>
      <div class="field">
        <label>Term</label>
        <input id="f-term" value="${esc(c?.term || 'Spring 2026')}" />
      </div>
    </div>
    <div class="field">
      <label>Color</label>
      <div class="color-grid">${swatches}</div>
    </div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveCourse()">Save</button>
    </div>
  `;
}

function selectColor(col) {
  selColor = col;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
  document.getElementById('swatch-' + col.replace('#', '')).classList.add('selected');
}

async function saveCourse() {
  const name = document.getElementById('f-name').value.trim();
  const code = document.getElementById('f-code').value.trim();
  const credits = parseInt(document.getElementById('f-credits').value) || 3;
  const term = document.getElementById('f-term').value.trim();

  if (!name || !code) { alert('Name and code are required.'); return; }

  if (editingId) {
    // Update
    await sb.from('courses').update({
      name, code, color: selColor, credit_hours: credits, term
    }).eq('id', editingId);
  } else {
    // Insert course then enroll user
    const { data: newCourse, error } = await sb.from('courses').insert({
      name, code, color: selColor, credit_hours: credits, term,
      user_id: currentUser.id,
    }).select().single();
    if (error) { alert('Error: ' + error.message); return; }

    await sb.from('user_courses').insert({
      user_id: currentUser.id,
      course_id: newCourse.id,
      is_active: true,
    });
  }

  closeModal();
  await loadCourses();
  await loadAssignments();
}

async function deleteCourse(id) {
  if (!confirm('Remove this course and all its assignments?')) return;
  // Remove user_courses link
  await sb.from('user_courses').delete()
    .eq('user_id', currentUser.id)
    .eq('course_id', id);
  await loadCourses();
  await loadAssignments();
}

// ── Assignment form ───────────────────────────────────────────────────────────
const TYPES = ['homework', 'exam', 'project', 'quiz', 'reading', 'other'];

function buildAssignmentForm(a) {
  const courseChips = courses.map(c => `
    <button class="sel-chip ${c.id === selCourseId ? 'active' : ''}" 
            id="cp-${c.id}" 
            onclick="selectCourse('${c.id}')"
            style="${c.id === selCourseId ? `background:${c.color};color:#fff` : ''}">
      ${esc(c.code)}
    </button>
  `).join('');

  const typeChips = TYPES.map(t => `
    <button class="sel-chip ${t === selType ? 'active' : ''}" 
            id="tp-${t}" 
            onclick="selectType('${t}')">
      ${capitalize(t)}
    </button>
  `).join('');

  const today = new Date().toISOString().split('T')[0];

  return `
    <div class="field">
      <label>Title *</label>
      <input id="f-atitle" value="${esc(a?.title || '')}" placeholder="Homework 3" />
    </div>
    <div class="field">
      <label>Course *</label>
      <div class="chip-row">${courseChips || '<em style="color:#94a3b8;font-size:.85rem">Add a course first</em>'}</div>
    </div>
    <div class="field">
      <label>Type</label>
      <div class="chip-row">${typeChips}</div>
    </div>
    <div class="field">
      <label>Due Date *</label>
      <input id="f-due" type="date" value="${a?.due_date || today}" />
    </div>
    <div class="row-2">
      <div class="field">
        <label>Est. Hours</label>
        <input id="f-hours" type="number" min="0" step="0.5" value="${a?.estimated_hours ?? 2}" />
      </div>
      <div class="field">
        <label>Difficulty (1–5)</label>
        <input id="f-diff" type="number" min="1" max="5" value="${a?.difficulty ?? 3}" />
      </div>
    </div>
    <div class="field">
      <label>Description / Notes</label>
      <textarea id="f-desc" placeholder="Add details, instructions, links…" rows="4">${esc(a?.description || '')}</textarea>
    </div>
    <div class="modal-footer">
      <button class="btn-ghost" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveAssignment()">Save</button>
    </div>
  `;
}

function selectCourse(id) {
  selCourseId = id;
  courses.forEach(c => {
    const btn = document.getElementById('cp-' + c.id);
    if (!btn) return;
    if (c.id === id) {
      btn.classList.add('active');
      btn.style.background = c.color;
      btn.style.color = '#fff';
    } else {
      btn.classList.remove('active');
      btn.style.background = '';
      btn.style.color = '';
    }
  });
}

function selectType(t) {
  selType = t;
  TYPES.forEach(x => {
    const btn = document.getElementById('tp-' + x);
    if (btn) btn.classList.toggle('active', x === t);
  });
}

async function saveAssignment() {
  const title = document.getElementById('f-atitle')?.value.trim();
  const due = document.getElementById('f-due')?.value;
  const hours = parseFloat(document.getElementById('f-hours')?.value) || 1;
  const diff = parseInt(document.getElementById('f-diff')?.value) || 3;

  if (!title) { alert('Title is required.'); return; }
  if (!selCourseId) { alert('Please select a course.'); return; }
  if (!due) { alert('Due date is required.'); return; }

  try {
    // Ensure user_courses enrollment exists (required by Supabase RLS for assignments)
    await sb.from('user_courses').upsert({
      user_id: currentUser.id,
      course_id: selCourseId,
      is_active: true,
    }, { onConflict: 'user_id,course_id' });

    const desc = document.getElementById('f-desc')?.value.trim() || null;

    const payload = {
      course_id: selCourseId,
      user_id: currentUser.id,
      title,
      type: selType,
      due_date: due,
      estimated_hours: hours,
      difficulty: Math.min(5, Math.max(1, diff)),
      description: desc,
    };

    if (editingId) {
      const { error } = await sb.from('assignments').update(payload).eq('id', editingId);
      if (error) throw error;
    } else {
      const { data: newA, error } = await sb.from('assignments').insert(payload).select().single();
      if (error) throw error;
      await sb.from('user_assignment_status').insert({
        user_id: currentUser.id,
        assignment_id: newA.id,
        status: 'not_started',
      });
    }

    closeModal();
    await loadAssignments();
    // If editing from detail page, go back to it
    if (editingId) openAssignmentDetail(editingId);
  } catch (err) {
    alert('Error saving assignment: ' + (err.message || err));
  }
}

async function deleteAssignment(id) {
  if (!confirm('Delete this assignment?')) return;
  await sb.from('user_assignment_status').delete()
    .eq('user_id', currentUser.id).eq('assignment_id', id);
  await sb.from('assignments').delete().eq('id', id);
  await loadAssignments();
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

// ── Boot ──────────────────────────────────────────────────────────────────────
async function boot() {
  // Check existing session
  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    showView('app');
    await loadCourses();
    await loadAssignments();
  } else {
    showView('auth');
  }

  // Listen for auth state changes
  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      currentUser = session.user;
      showView('app');
      await loadCourses();
      await loadAssignments();
    } else {
      showView('auth');
    }
  });
}

boot();
