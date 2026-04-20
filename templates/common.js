// ===== AUTH HELPERS =====
function getToken() {
  const token = localStorage.getItem('ss_token') || localStorage.getItem('ss_admin_token');
  if (!token) { window.location.href = 'index.html'; return null; }
  return token;
}

function getStudent() {
  const s = localStorage.getItem('ss_student');
  if (!s) { window.location.href = 'index.html'; return null; }
  return JSON.parse(s);
}

function getAdmin() {
  const a = localStorage.getItem('ss_admin');
  return a ? JSON.parse(a) : null;
}

function isAdmin() {
  return !!localStorage.getItem('ss_admin_token');
}

function logout() {
  if (confirm('Are you sure you want to logout?')) {
    ['ss_token','ss_student','ss_admin_token','ss_admin'].forEach(k => localStorage.removeItem(k));
    window.location.href = 'index.html';
  }
}

// ===== API HELPER =====
function apiRequest(url, options = {}) {
  const token = localStorage.getItem('ss_admin_token') || localStorage.getItem('ss_token');
  return fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...(options.headers || {})
    }
  });
}

// ===== UI HELPERS =====
function toggleSidebar() {
  document.getElementById('sidebar')?.classList.toggle('open');
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-PK', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatCurrency(n) {
  return 'PKR ' + Number(n || 0).toLocaleString();
}

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function showToast(msg, type = 'success') {
  const existing = document.getElementById('globalToast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'globalToast';
  const colors = { success: '#27ae60', error: '#e74c3c', warning: '#f39c12', info: '#2980b9' };
  toast.style.cssText = `
    position:fixed; bottom:80px; right:25px; z-index:99999;
    background:${colors[type] || colors.success}; color:white;
    padding:12px 20px; border-radius:10px; font-size:13px; font-weight:600;
    box-shadow:0 5px 20px rgba(0,0,0,0.25); animation:slideIn 0.3s ease;
    max-width:300px;
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 3500);
}

// ===== THEME MANAGEMENT =====
function initTheme() {
  const saved = localStorage.getItem('ss_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('ss_theme', next);
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggleBtn');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ===== SIDEBAR ACTIVE STATE =====
function setActiveSidebarItem() {
  const page = window.location.pathname.split('/').pop();
  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    item.classList.toggle('active', href === page || href.startsWith(page.split('.')[0]));
  });
}

// Init on load
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  setActiveSidebarItem();
});
