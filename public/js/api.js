// Neurobuild API Client
const API_BASE = '';

// Token management
const Token = {
  get: () => localStorage.getItem('token'),
  set: (token) => localStorage.setItem('token', token),
  remove: () => localStorage.removeItem('token'),
  exists: () => !!localStorage.getItem('token'),
  getExpiry: () => localStorage.getItem('tokenExpiry'),
  setExpiry: (expiresAt) => localStorage.setItem('tokenExpiry', expiresAt)
};

// User management
const User = {
  get: () => {
    const data = localStorage.getItem('user');
    return data ? JSON.parse(data) : null;
  },
  set: (user) => localStorage.setItem('user', JSON.stringify(user)),
  remove: () => localStorage.removeItem('user'),
  update: (updates) => {
    const current = User.get() || {};
    User.set({ ...current, ...updates });
  }
};

// CSRF token cache (for unauthenticated state-changing requests)
let csrfToken = null;

async function fetchCsrfToken() {
  const response = await fetch(`${API_BASE}/api/auth/csrf-token`);
  if (!response.ok) throw new Error('Failed to fetch CSRF token');
  const data = await response.json();
  csrfToken = data.csrfToken;
  return csrfToken;
}

// API request helper
async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const token = Token.get();

  const config = {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { 'Authorization': `Bearer ${token}` }),
      ...(options.headers || {})
    }
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 401) {
        Token.remove();
        User.remove();
        window.location.href = 'login.html';
        throw new Error('Session expired. Please log in again.');
      }
      throw new Error(data?.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// API helper for unauthenticated requests that require CSRF
async function apiWithCsrf(endpoint, options = {}) {
  if (!csrfToken) await fetchCsrfToken();
  try {
    return await api(endpoint, {
      ...options,
      headers: { 'X-CSRF-Token': csrfToken, ...options.headers }
    });
  } catch (error) {
    // Retry once with a fresh CSRF token on 403
    if (error.message.includes('CSRF')) {
      await fetchCsrfToken();
      return api(endpoint, {
        ...options,
        headers: { 'X-CSRF-Token': csrfToken, ...options.headers }
      });
    }
    throw error;
  }
}

function storeAuthSession(data) {
  if (data.token) Token.set(data.token);
  if (data.expiresAt) Token.setExpiry(data.expiresAt);
  if (data.user) User.set(data.user);
}

// Auth API
const AuthAPI = {
  register: async (username, name, email, password) => {
    const data = await apiWithCsrf('/api/auth/register', {
      method: 'POST',
      body: { username, name, email, password }
    });
    storeAuthSession(data);
    return data;
  },

  login: async (email, password) => {
    const data = await apiWithCsrf('/api/auth/login', {
      method: 'POST',
      body: { email, password }
    });
    storeAuthSession(data);
    return data;
  },

  me: () => api('/api/auth/me'),

  updateProfile: (updates) =>
    api('/api/auth/profile', { method: 'PATCH', body: updates }),

  updateSettings: (settings) =>
    api('/api/auth/settings', { method: 'PATCH', body: settings }),

  changePassword: async (currentPassword, newPassword) => {
    const data = await api('/api/auth/change-password', {
      method: 'POST',
      body: { currentPassword, newPassword }
    });
    if (data.token) Token.set(data.token);
    if (data.expiresAt) Token.setExpiry(data.expiresAt);
    return data;
  },

  forgotPassword: (email) =>
    apiWithCsrf('/api/auth/forgot-password', { method: 'POST', body: { email } }),

  resetPassword: async (token, newPassword) => {
    const data = await apiWithCsrf('/api/auth/reset-password', {
      method: 'POST',
      body: { token, newPassword }
    });
    if (data.token) Token.set(data.token);
    if (data.expiresAt) Token.setExpiry(data.expiresAt);
    return data;
  },

  refresh: async () => {
    const data = await api('/api/auth/refresh', { method: 'POST' });
    if (data.token) Token.set(data.token);
    if (data.expiresAt) Token.setExpiry(data.expiresAt);
    return data;
  },

  logout: async () => {
    try {
      if (Token.exists()) {
        await api('/api/auth/logout', { method: 'POST' });
      }
    } catch {
      // Proceed with local cleanup even if server call fails
    }
    Token.remove();
    Token.setExpiry('');
    User.remove();
    csrfToken = null;
  },

  deleteAccount: () => api('/api/auth/account', { method: 'DELETE' })
};

// Auto-refresh token when it is within 1 day of expiry
let refreshTimer = null;

function scheduleTokenRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);

  const expiry = Token.getExpiry();
  if (!expiry || !Token.exists()) return;

  const msUntilExpiry = new Date(expiry).getTime() - Date.now();
  const refreshIn = Math.max(msUntilExpiry - 24 * 60 * 60 * 1000, 60_000);

  refreshTimer = setTimeout(async () => {
    try {
      await AuthAPI.refresh();
      scheduleTokenRefresh();
    } catch {
      Token.remove();
      User.remove();
      if (!window.location.pathname.includes('login.html')) {
        window.location.href = '/login.html';
      }
    }
  }, refreshIn);
}

// Generation API
const GenerateAPI = {
  generate: (prompt, model) =>
    api('/api/generate', {
      method: 'POST',
      body: { prompt, model }
    }),

  getModels: () =>
    api('/api/models'),

  // Streaming generation with SSE
  streamGenerate: (prompt, model, onChunk, onDone, onError) => {
    const token = Token.get();
    const params = new URLSearchParams({ prompt, ...(model && { model }) });
    const url = `${API_BASE}/api/stream-generate?${params}`;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(url, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          signal: controller.signal
        });
        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Generation stream could not start');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop();
          for (const event of events) {
            const payload = event.split(/\r?\n/)
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trimStart())
              .join('\n');
            if (!payload) continue;
            const data = JSON.parse(payload);
            if (data.chunk) onChunk(data.chunk);
            if (data.done) onDone(data.html);
            if (data.error) throw new Error(data.error);
          }
        }
      } catch (error) {
        if (error.name !== 'AbortError') onError(error);
      }
    })();

    return () => controller.abort();
  }
};

// Chat API
const ChatAPI = {
  sendMessage: (message, conversationId, model) =>
    api('/api/chat', {
      method: 'POST',
      body: { message, conversationId, model }
    }),

  getConversations: () =>
    api('/api/conversations'),

  getConversation: (id) =>
    api(`/api/conversations/${id}`),

  deleteConversation: (id) =>
    api(`/api/conversations/${id}`, { method: 'DELETE' }),

  // Stream chat with SSE
  streamChat: (message, conversationId, model, onChunk, onDone, onError, onInit) => {
    const token = Token.get();
    const params = new URLSearchParams({
      message,
      ...(conversationId && { conversationId }),
      ...(model && { model })
    });
    const url = `${API_BASE}/api/stream-chat?${params}`;
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch(url, {
          headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          signal: controller.signal
        });
        if (!response.ok || !response.body) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || 'Chat stream could not start');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split(/\r?\n\r?\n/);
          buffer = events.pop();
          for (const event of events) {
            const payload = event.split(/\r?\n/)
              .filter(line => line.startsWith('data:'))
              .map(line => line.slice(5).trimStart())
              .join('\n');
            if (!payload) continue;
            const data = JSON.parse(payload);
            if (data.type === 'init' && onInit) onInit(data.conversationId);
            if (data.type === 'chunk') onChunk(data.content);
            if (data.type === 'done') onDone(data.reply, data.html);
            if (data.type === 'error') throw new Error(data.error);
          }
        }
      } catch (error) {
        if (error.name !== 'AbortError') onError(error);
      }
    })();

    return () => controller.abort();
  }
};


// Analytics API
const AnalyticsAPI = {
  track: (action, metadata) =>
    api('/api/analytics/track', {
      method: 'POST',
      body: { action, metadata }
    }),

  getDashboard: () =>
    api('/api/analytics/dashboard'),

  getUsage: (days = 30) =>
    api(`/api/analytics/usage?days=${days}`)
};

// AI Enhancement API
const AIEnhanceAPI = {
  generateDesignSystem: (prompt, model) =>
    api('/api/generate/design-system', {
      method: 'POST',
      body: { prompt, model }
    }),

  generateContent: (prompt, type, model) =>
    api('/api/generate/content', {
      method: 'POST',
      body: { prompt, type, model }
    }),

  suggest: (html, model) =>
    api('/api/generate/suggest', {
      method: 'POST',
      body: { html, model }
    })
};

// Projects API (convenience wrappers)
const ProjectsAPI = {
  list: (page, limit, search) =>
    api(`/api/projects?${new URLSearchParams({
      ...(page && { page }),
      ...(limit && { limit }),
      ...(search && { search })
    })}`),

  get: (id) => api(`/api/projects/${id}`),

  create: (project) =>
    api('/api/projects', { method: 'POST', body: project }),

  update: (id, updates) =>
    api(`/api/projects/${id}`, { method: 'PATCH', body: updates }),

  delete: (id) =>
    api(`/api/projects/${id}`, { method: 'DELETE' }),

  deleteAll: () =>
    api('/api/projects', { method: 'DELETE' }),

  getVersion: (projectId, index) =>
    api(`/api/projects/${projectId}/versions/${index}`),

  restoreVersion: (projectId, index) =>
    api(`/api/projects/${projectId}/restore/${index}`, { method: 'POST' })
};

// Protected route guard — validates token against server
async function requireAuth() {
  if (!Token.exists()) {
    window.location.href = '/login.html';
    return false;
  }

  const result = await checkAuth();
  if (!result.authenticated) {
    window.location.href = '/login.html';
    return false;
  }
  return true;
}

// Redirect if already authenticated
function redirectIfAuth() {
  if (Token.exists()) {
    window.location.href = '/dashboard.html';
    return true;
  }
  return false;
}

// Logout — server-side blacklist + local cleanup
async function logout() {
  await AuthAPI.logout();
  window.location.href = '/login.html';
}

// Check auth status and update UI
async function checkAuth() {
  if (!Token.exists()) return { authenticated: false };

  try {
    const data = await AuthAPI.me();
    if (data.authenticated && data.user) {
      User.set(data.user);
      scheduleTokenRefresh();
      return data;
    }
  } catch {
    // Token invalid
  }

  Token.remove();
  User.remove();
  return { authenticated: false };
}

// Initialize theme from user settings or localStorage
function initTheme() {
  const user = User.get();
  const settings = user?.settings || JSON.parse(localStorage.getItem('settings') || '{}');
  const isDark = settings.darkMode !== false;

  if (!isDark) {
    document.documentElement.setAttribute('data-theme', 'light');
  }

  return settings;
}

// Toggle theme
function toggleTheme() {
  const settings = initTheme();
  const isCurrentlyDark = settings.darkMode !== false;
  settings.darkMode = !isCurrentlyDark;

  localStorage.setItem('settings', JSON.stringify(settings));

  // Update user settings if logged in
  const user = User.get();
  if (user) {
    user.settings = settings;
    User.set(user);
    AuthAPI.updateSettings(settings).catch(console.error);
  }

  if (settings.darkMode) {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', 'light');
  }
}

// Toast notification
function showToast(message, type = 'success', duration = 3000) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.className = `toast ${type} visible`;

  setTimeout(() => {
    toast.classList.remove('visible');
  }, duration);
}

// Copy to clipboard
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('Copied to clipboard');
  } catch {
    showToast('Failed to copy', 'error');
  }
}

// Initialize dropdown
function initDropdown() {
  const profileBtn = document.getElementById('profileBtn');
  const dropdown = document.getElementById('dropdown');

  if (!profileBtn || !dropdown) return;

  profileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.dropdown') && !e.target.closest('.profile-btn')) {
      dropdown.classList.remove('open');
    }
  });

  // Load user info
  const user = User.get();
  if (user) {
    profileBtn.textContent = user.name.charAt(0).toUpperCase();
    const nameEl = document.getElementById('dropdownName');
    const emailEl = document.getElementById('dropdownEmail');
    if (nameEl) nameEl.textContent = user.name;
    if (emailEl) emailEl.textContent = user.email || '';
  }
}

// Export for use in other scripts
window.NeuroAPI = {
  Token,
  User,
  AuthAPI,
  GenerateAPI,
  ChatAPI,
  AnalyticsAPI,
  AIEnhanceAPI,
  ProjectsAPI,
  requireAuth,
  redirectIfAuth,
  logout,
  checkAuth,
  initTheme,
  toggleTheme,
  showToast,
  copyToClipboard,
  initDropdown,
  scheduleTokenRefresh
};

// Schedule token refresh on load if already authenticated
if (Token.exists()) {
  scheduleTokenRefresh();
}
