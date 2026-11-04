/**
 * FrontendAgent — Module 6: Collaborative Agentic AI
 *
 * Reads schema + API contract from SharedContext, then generates a complete
 * enhanced HTML file with:
 *   - Full CRUD data management (using localStorage simulation in iframe)
 *   - Chart.js visualization
 *   - Original site design preserved
 *
 * When the Reviewer finds issues, this agent re-runs with revision feedback.
 */

const aiService = require('../services/ai');
const { FRONTEND_SYSTEM_PROMPT } = require('./prompts/frontend');

const MAX_BASE_HTML = 6000;

class FrontendAgent {
  get name() { return 'frontend'; }

  /**
   * @param {SharedContext}  ctx
   * @param {MessageBus}     bus
   * @param {string}         model
   * @param {function}       emit
   * @param {object|null}    revisionFeedback  — from ReviewerAgent on retry
   */
  async run(ctx, bus, model, emit, revisionFeedback = null) {
    const task = ctx.tasks.find(t => t.agentName === 'frontend');
    if (!task) {
      console.warn('[FrontendAgent] No frontend task found');
      return;
    }

    ctx.startTask(task.id);
    const isRevision = revisionFeedback !== null;
    emit({
      type: 'agent_start',
      agent: 'frontend',
      message: isRevision
        ? `Frontend Agent applying Reviewer fixes (revision ${ctx.getRevisionCount('frontend') + 1})...`
        : `Frontend Agent enhancing HTML with CRUD + charts for "${ctx.domain}"...`
    });
    bus.broadcast('frontend', 'agent:started', { agent: 'frontend', isRevision });

    const truncatedBase = ctx.baseHtml.length > MAX_BASE_HTML
      ? ctx.baseHtml.substring(0, MAX_BASE_HTML) + '\n<!-- truncated -->'
      : ctx.baseHtml;

    const schemaJson      = JSON.stringify(ctx.schema, null, 2);
    const apiJson         = JSON.stringify(ctx.apiContract, null, 2);
    const seedJson        = JSON.stringify(ctx.seedData, null, 2);

    let userMessage = `Domain: ${ctx.domain}
Features: ${ctx.features.join(', ')}
Task: ${task.description}

DATABASE SCHEMA (use these exact field names in HTML forms and table columns):
${schemaJson}

API CONTRACT (use these exact paths in fetch() calls):
${apiJson}

SEED DATA (pre-populate localStorage with this data):
${seedJson}

BASE HTML (preserve the visual design/branding):
${truncatedBase}

Build a complete enhanced HTML with CRUD management and Chart.js chart.`;

    if (isRevision && revisionFeedback) {
      userMessage += `

REVIEWER FEEDBACK — fix these issues before regenerating:
${revisionFeedback.map((issue, i) => `${i + 1}. [${issue.severity.toUpperCase()}] ${issue.description}
   Fix: ${issue.suggestedFix}`).join('\n')}`;
    }

    let enhancedHtml;
    try {
      const raw = await aiService._complete([
        { role: 'system', content: FRONTEND_SYSTEM_PROMPT },
        { role: 'user',   content: userMessage }
      ], model);

      enhancedHtml = aiService.cleanHtml(raw);

      if (!enhancedHtml || enhancedHtml.length < 500 || !enhancedHtml.includes('<')) {
        throw new Error('Frontend agent returned invalid HTML');
      }
    } catch (err) {
      console.warn('[FrontendAgent] LLM failed, injecting CRUD into base HTML:', err.message);
      enhancedHtml = this._injectCrudIntoBase(ctx);
    }

    // Store result
    ctx.updateEnhancedHtml(enhancedHtml);
    ctx.completeTask(task.id, `Enhanced HTML (${enhancedHtml.length} bytes)`);

    if (isRevision) {
      ctx.incrementRevisionCount('frontend');
    }

    bus.broadcast('frontend', 'html:updated', {
      htmlLength: enhancedHtml.length,
      isRevision
    });

    emit({
      type: 'agent_done',
      agent: 'frontend',
      result: { htmlLength: enhancedHtml.length, isRevision }
    });

    console.log(`[FrontendAgent] HTML generated: ${enhancedHtml.length} bytes (revision=${isRevision})`);
    return enhancedHtml;
  }

  /**
   * Fallback: inject a working CRUD section + chart into the base HTML using
   * the schema and seed data already in context. No LLM call needed.
   */
  _injectCrudIntoBase(ctx) {
    const schema     = ctx.schema;
    const seedData   = ctx.seedData;
    const domain     = ctx.domain || 'Data Management';
    const apiContract = ctx.apiContract;

    const mainTable = schema?.tables?.[0] || { name: 'items', fields: [
      { name: 'id', primaryKey: true }, { name: 'name', required: true }
    ]};
    const tableName = mainTable.name;
    const fields = mainTable.fields.filter(f => !f.primaryKey && !f.autoIncrement);
    const allFields = mainTable.fields;

    const seedRows = seedData?.[tableName] || [];
    const lookupTable = schema?.tables?.[1];
    const lookupRows = lookupTable ? (seedData?.[lookupTable.name] || []) : [];

    // Build table headers
    const thCells = allFields.map(f =>
      `<th style="padding:10px 14px;text-align:left;border-bottom:2px solid #e2e8f0;white-space:nowrap;">${f.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</th>`
    ).join('') + '<th style="padding:10px 14px;">Actions</th>';

    // Build form inputs
    const formInputs = fields.map(f => {
      // If field is a foreign key to lookup table, render a <select>
      if (f.foreignKey && lookupTable) {
        const optionsVar = `${lookupTable.name}Options`;
        return `<div style="margin-bottom:12px;">
          <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#374151;">${f.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</label>
          <select id="form_${f.name}" name="${f.name}" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;">
            <option value="">Select...</option>
          </select>
        </div>`;
      }
      return `<div style="margin-bottom:12px;">
        <label style="display:block;font-size:13px;font-weight:600;margin-bottom:4px;color:#374151;">${f.name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</label>
        <input id="form_${f.name}" name="${f.name}" type="text" placeholder="${f.name}" style="width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box;" />
      </div>`;
    }).join('');

    // Chart data — count by a groupable field (grade, status, category, etc.)
    const groupField = fields.find(f => /grade|status|category|type|department|level/.test(f.name));
    const groupKey = groupField ? groupField.name : (fields[0]?.name || 'name');

    const crudSection = `
  <!-- ═══ MODULE 6: COLLABORATIVE AGENTIC AI ENHANCEMENT ═══ -->
  <section id="agentSection" style="font-family:'Inter',sans-serif;padding:40px 24px;background:#f8fafc;min-height:100vh;">
    <div style="max-width:1100px;margin:0 auto;">

      <div style="display:flex;align-items:center;gap:12px;margin-bottom:28px;">
        <div style="width:36px;height:36px;background:linear-gradient(135deg,#667eea,#764ba2);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;">🤖</div>
        <div>
          <h2 style="margin:0;font-size:22px;font-weight:800;color:#1a202c;">${domain} — Agentic AI Enhanced</h2>
          <p style="margin:2px 0 0;font-size:13px;color:#64748b;">Multi-agent system: Planner + Database + Backend + Frontend + Reviewer</p>
        </div>
      </div>

      <!-- Stats Row -->
      <div id="statsRow" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:28px;"></div>

      <!-- Chart + Table Grid -->
      <div style="display:grid;grid-template-columns:1fr 2fr;gap:20px;margin-bottom:28px;">

        <!-- Chart -->
        <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;padding:20px;">
          <h3 style="margin:0 0 16px;font-size:15px;font-weight:700;color:#1a202c;">${groupKey.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} Distribution</h3>
          <canvas id="dataChart" height="220"></canvas>
        </div>

        <!-- CRUD Table -->
        <div style="background:#fff;border-radius:14px;border:1px solid #e2e8f0;overflow:hidden;">
          <div style="padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;justify-content:space-between;align-items:center;">
            <h3 style="margin:0;font-size:15px;font-weight:700;color:#1a202c;">${tableName.replace(/\b\w/g, c => c.toUpperCase())} <span id="recordCount" style="font-size:12px;font-weight:400;color:#94a3b8;"></span></h3>
            <div style="display:flex;gap:8px;">
              <input id="searchInput" placeholder="Search..." oninput="filterRecords()" style="padding:7px 12px;border:1px solid #d1d5db;border-radius:7px;font-size:13px;width:160px;" />
              <button onclick="openAddModal()" style="padding:7px 14px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:13px;font-weight:600;">+ Add</button>
            </div>
          </div>
          <div style="overflow-x:auto;">
            <table style="width:100%;border-collapse:collapse;font-size:13px;">
              <thead><tr style="background:#f8fafc;">${thCells}</tr></thead>
              <tbody id="tableBody"></tbody>
            </table>
          </div>
        </div>
      </div>

    </div>
  </section>

  <!-- Modal -->
  <div id="modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:9999;display:none;align-items:center;justify-content:center;">
    <div style="background:#fff;border-radius:16px;padding:28px;width:420px;max-width:95vw;box-shadow:0 20px 60px rgba(0,0,0,.2);">
      <h3 id="modalTitle" style="margin:0 0 20px;font-size:17px;font-weight:700;color:#1a202c;"></h3>
      <input type="hidden" id="editId" value="" />
      ${formInputs}
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px;">
        <button onclick="closeModal()" style="padding:9px 18px;border:1px solid #e2e8f0;border-radius:8px;cursor:pointer;font-size:14px;background:#fff;">Cancel</button>
        <button onclick="saveRecord()" style="padding:9px 18px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">Save</button>
      </div>
    </div>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
  <script>
  // ─── Data Store (localStorage simulation) ───────────────────────────────────
  const STORE_KEY = 'agentEnhanced_${tableName}';
  const LOOKUP_KEY = 'agentEnhanced_${lookupTable?.name || 'lookup'}';

  const SEED_DATA = ${JSON.stringify(seedRows)};
  const LOOKUP_DATA = ${JSON.stringify(lookupRows)};

  function getRecords() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; }
  }
  function saveRecords(rows) { localStorage.setItem(STORE_KEY, JSON.stringify(rows)); }
  function getLookup() {
    try { return JSON.parse(localStorage.getItem(LOOKUP_KEY)) || LOOKUP_DATA; } catch { return LOOKUP_DATA; }
  }

  let records = getRecords();
  if (!records) { records = SEED_DATA; saveRecords(records); }
  if (LOOKUP_DATA.length) localStorage.setItem(LOOKUP_KEY, JSON.stringify(LOOKUP_DATA));

  let nextId = records.length ? Math.max(...records.map(r => r.id || 0)) + 1 : 1;
  let chartInstance = null;
  let currentFilter = '';

  // ─── Stats ──────────────────────────────────────────────────────────────────
  function renderStats() {
    const lookup = getLookup();
    const statsRow = document.getElementById('statsRow');
    if (!statsRow) return;
    statsRow.innerHTML = [
      { label: 'Total Records', value: records.length, color: '#667eea' },
      { label: '${lookupTable ? lookupTable.name.replace(/\b\w/g, c => c.toUpperCase()) : 'Categories'}', value: lookup.length || '-', color: '#10b981' },
      { label: 'Active', value: records.filter(r => r.status !== 'inactive' && r.grade !== 'F').length, color: '#f59e0b' }
    ].map(s => \`
      <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:18px 20px;">
        <div style="font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">\${s.label}</div>
        <div style="font-size:28px;font-weight:800;color:\${s.color};margin-top:4px;">\${s.value}</div>
      </div>
    \`).join('');
  }

  // ─── Table ───────────────────────────────────────────────────────────────────
  function filterRecords() {
    currentFilter = document.getElementById('searchInput')?.value?.toLowerCase() || '';
    renderTable();
  }

  function renderTable() {
    const lookup = getLookup();
    const lookupMap = {};
    lookup.forEach(r => { lookupMap[r.id] = r.title || r.name || r.id; });

    const filtered = records.filter(r =>
      !currentFilter || Object.values(r).some(v => String(v).toLowerCase().includes(currentFilter))
    );

    const tbody = document.getElementById('tableBody');
    const counter = document.getElementById('recordCount');
    if (counter) counter.textContent = \`(\${filtered.length} of \${records.length})\`;
    if (!tbody) return;

    tbody.innerHTML = filtered.map(row => {
      const cells = ${JSON.stringify(allFields.map(f => f.name))}.map(f => {
        let val = row[f];
        if (f.endsWith('_id') && lookupMap[val]) val = lookupMap[val];
        if (val === null || val === undefined) val = '-';
        return \`<td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;color:#374151;">\${val}</td>\`;
      }).join('');
      return \`<tr style="transition:background .15s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''">
        \${cells}
        <td style="padding:10px 14px;border-bottom:1px solid #f1f5f9;white-space:nowrap;">
          <button onclick="openEditModal(\${row.id})" style="padding:4px 10px;border:1px solid #667eea;color:#667eea;background:#fff;border-radius:5px;cursor:pointer;font-size:12px;margin-right:4px;">Edit</button>
          <button onclick="deleteRecord(\${row.id})" style="padding:4px 10px;border:1px solid #ef4444;color:#ef4444;background:#fff;border-radius:5px;cursor:pointer;font-size:12px;">Delete</button>
        </td>
      </tr>\`;
    }).join('') || '<tr><td colspan="99" style="padding:24px;text-align:center;color:#94a3b8;">No records found</td></tr>';

    renderChart();
  }

  // ─── Chart ───────────────────────────────────────────────────────────────────
  function renderChart() {
    const canvas = document.getElementById('dataChart');
    if (!canvas) return;
    const groupKey = '${groupKey}';
    const counts = {};
    records.forEach(r => {
      const val = r[groupKey] || 'Unknown';
      counts[val] = (counts[val] || 0) + 1;
    });
    const labels = Object.keys(counts);
    const data = Object.values(counts);
    const colors = ['#667eea','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f97316'];
    if (chartInstance) chartInstance.destroy();
    chartInstance = new Chart(canvas, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Count', data, backgroundColor: colors.slice(0, labels.length), borderRadius: 6, borderSkipped: false }] },
      options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } } }
    });
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────────
  function openAddModal() {
    document.getElementById('modalTitle').textContent = 'Add New Record';
    document.getElementById('editId').value = '';
    ${fields.map(f => `document.getElementById('form_${f.name}') && (document.getElementById('form_${f.name}').value = '');`).join('\n    ')}
    populateLookupSelect();
    const m = document.getElementById('modal');
    m.style.display = 'flex';
  }

  function openEditModal(id) {
    const row = records.find(r => r.id === id);
    if (!row) return;
    document.getElementById('modalTitle').textContent = 'Edit Record';
    document.getElementById('editId').value = id;
    ${fields.map(f => `document.getElementById('form_${f.name}') && (document.getElementById('form_${f.name}').value = row['${f.name}'] || '');`).join('\n    ')}
    populateLookupSelect(row['${fields.find(f => f.foreignKey)?.name || '_none'}']);
    const m = document.getElementById('modal');
    m.style.display = 'flex';
  }

  function populateLookupSelect(selectedId) {
    ${lookupTable ? `
    const sel = document.getElementById('form_${fields.find(f => f.foreignKey)?.name || '_none'}');
    if (!sel) return;
    const lookup = getLookup();
    sel.innerHTML = '<option value="">Select...</option>' + lookup.map(r =>
      '<option value="' + r.id + '"' + (String(r.id) === String(selectedId) ? ' selected' : '') + '>' + (r.title || r.name) + '</option>'
    ).join('');` : '// no lookup table'}
  }

  function closeModal() { document.getElementById('modal').style.display = 'none'; }

  function saveRecord() {
    const id = document.getElementById('editId').value;
    const formData = {};
    ${fields.map(f => `const v_${f.name} = document.getElementById('form_${f.name}')?.value || ''; formData['${f.name}'] = v_${f.name};`).join('\n    ')}
    if (!formData['${fields.find(f => f.required)?.name || fields[0]?.name || 'name'}']) {
      alert('Please fill in all required fields'); return;
    }
    if (id) {
      const idx = records.findIndex(r => String(r.id) === String(id));
      if (idx !== -1) records[idx] = { ...records[idx], ...formData };
    } else {
      records.push({ id: nextId++, ...formData });
    }
    saveRecords(records);
    closeModal();
    renderTable();
    renderStats();
  }

  function deleteRecord(id) {
    if (!confirm('Delete this record?')) return;
    records = records.filter(r => r.id !== id);
    saveRecords(records);
    renderTable();
    renderStats();
  }

  // ─── Init ────────────────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function() {
    renderStats();
    renderTable();
    document.getElementById('modal').addEventListener('click', function(e) {
      if (e.target === this) closeModal();
    });
  });
  </script>`;

    // Inject into the base HTML before </body>
    let base = ctx.baseHtml || `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${domain}</title></head><body>`;
    if (base.includes('</body>')) {
      return base.replace('</body>', crudSection + '\n</body>');
    }
    return base + crudSection + '\n</body></html>';
  }
}

module.exports = new FrontendAgent();

