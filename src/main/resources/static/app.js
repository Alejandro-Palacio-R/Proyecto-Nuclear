let token = localStorage.getItem('token'), me = null, students = [], sessionCases = [], adminUsers = [];
let activeBlocks = [], activeAssignment = null, builderBlocks = [];
let activeGameSession = null, liveSessionTimer = null;
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const CASE_IMPORT_TEMPLATE = `CASO: Toma de decisiones en grupo
CATEGORIA: Psicologia social
DIFICULTAD: Media
DESCRIPCION:
Un equipo debe decidir como actuar frente a presion social y conflicto de roles.

---
TEXTO: Contexto inicial
Lee la situacion antes de responder las preguntas siguientes.

---
PREGUNTA: Cual seria la primera accion profesional mas adecuada?
PUNTAJE: 10
OPCIONES:
- [correcta] Escuchar a las partes y recopilar informacion
- Tomar partido por la persona con mas liderazgo
- Ignorar la situacion hasta que el grupo se calme

---
PREGUNTA: Que factores pueden explicar la conducta del grupo?
PUNTAJE: 10
OPCIONES:
- [correcta] Conformidad
- [correcta] Presion social
- Azar biologico sin contexto
- [correcta] Roles grupales`;

async function api(path, opts = {}) {
  opts.headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
  if (token) opts.headers.Authorization = 'Bearer ' + token;
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error(await r.text());
  const ct = r.headers.get('content-type') || '';
  return ct.includes('json') ? r.json() : r.text();
}

async function login() {
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('email').value, password: $('password').value }) });
    token = r.token;
    localStorage.setItem('token', token);
    await boot();
  } catch (e) {
    $('loginMsg').textContent = e.message;
  }
}

function logout() {
  localStorage.removeItem('token');
  location.reload();
}

async function boot() {
  if (!token) return;
  try {
    me = await api('/api/me');
    $('login').classList.add('hidden');
    $('app').classList.remove('hidden');
    document.body.classList.remove('auth-shell');
    $('welcome').textContent = me.name || me.email;
    $('roleBadge').textContent = me.role;
    const canManageCases = me.role === 'PROFESOR' || me.role === 'ADMIN';
    $('adminBtn').style.display = me.role === 'ADMIN' ? 'flex' : 'none';
    $('createUserBtn').style.display = me.role === 'ADMIN' ? 'flex' : 'none';
    $('createCaseBtn').style.display = canManageCases ? 'flex' : 'none';
    $('createSessionBtn').style.display = canManageCases ? 'flex' : 'none';
    $('joinSessionBtn').style.display = me.role === 'ESTUDIANTE' ? 'flex' : 'none';
    loadCases();
  } catch (e) {
    localStorage.removeItem('token');
  }
}

function setActiveNav(btn) {
  document.querySelectorAll('.side-nav button').forEach(b => b.classList.remove('active'));
  btn?.classList.add('active');
}

function pageHint(title) {
  const hints = {
    'Casos': 'Explora casos, disena pantallas y asigna estudiantes desde tarjetas de trabajo.',
    'Mis asignaciones': 'Continua los casos asignados y revisa que actividades tienes pendientes.',
    'Entregas': 'Consulta entregas, puntajes y retroalimentacion del proceso.',
    'Ranking': 'Compara desempeno por caso y detecta avances destacados.',
    'Notificaciones': 'Revisa avisos academicos y actualizaciones recientes.',
    'Cuenta': 'Administra tu acceso y seguridad personal.',
    'Usuarios': 'Gestiona usuarios y roles de la plataforma.',
    'Crear caso': 'Define un nuevo caso academico o importa una plantilla estructurada.',
    'Crear usuario': 'Registra estudiantes, profesores o administradores desde un formulario dedicado.',
    'Crear sesion': 'Genera una sala en vivo con PIN y tiempo limite para un caso.',
    'Unirse a sesion': 'Ingresa el PIN de una sala en vivo para resolver el caso con tu grupo.',
    'Constructor del caso': 'Ordena la experiencia paso a paso como una simulacion guiada.',
    'Resolver caso': 'Avanza por la simulacion, revisa el historial y registra tus decisiones.',
    'Sala en vivo': 'Monitorea participantes y tiempo de la sesion sincronizada.'
  };
  return hints[title] || 'Trabaja sobre la informacion seleccionada.';
}

function show(title, html) {
  if ($('pageTitle')) $('pageTitle').textContent = title;
  if ($('pageHint')) $('pageHint').textContent = pageHint(title);
  $('output').innerHTML = `<div class="section-head"><div><span class="eyebrow">Modulo</span><h3>${title}</h3></div></div>${html}`;
}

function showAccount() {
  show('Cuenta', `<div class="account-panel">
    <p>Actualiza tu contrasena ingresando primero la contrasena actual.</p>
    <label class="field-label" for="currentPassword">Contrasena actual</label>
    <input id="currentPassword" type="password" autocomplete="current-password">
    <label class="field-label" for="newPassword">Nueva contrasena</label>
    <input id="newPassword" type="password" autocomplete="new-password" minlength="6">
    <label class="field-label" for="confirmPassword">Confirmar nueva contrasena</label>
    <input id="confirmPassword" type="password" autocomplete="new-password" minlength="6">
    <button onclick="changePassword()">Cambiar contrasena</button>
    <pre id="accountMsg"></pre>
  </div>`);
}

async function changePassword() {
  const currentPassword = $('currentPassword').value;
  const newPassword = $('newPassword').value;
  const confirmPassword = $('confirmPassword').value;
  const msg = $('accountMsg');
  msg.textContent = '';
  if (newPassword.length < 6) {
    msg.textContent = 'La nueva contrasena debe tener al menos 6 caracteres.';
    return;
  }
  if (newPassword !== confirmPassword) {
    msg.textContent = 'La confirmacion no coincide con la nueva contrasena.';
    return;
  }
  try {
    const r = await api('/api/account/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword })
    });
    $('currentPassword').value = '';
    $('newPassword').value = '';
    $('confirmPassword').value = '';
    msg.textContent = r.message || 'Contrasena actualizada.';
  } catch (e) {
    msg.textContent = e.message;
  }
}

function showCreateCase() {
  show('Crear caso', `<div class="form-page">
    <section class="form-card">
      <span class="material-symbols-outlined form-icon">note_add</span>
      <h4>Nuevo caso academico</h4>
      <p>Completa la informacion base. Luego podras disenar las pantallas del caso desde el modulo Casos.</p>
      <label class="field-label" for="caseTitle">Titulo</label>
      <input id="caseTitle" placeholder="Ej. Presion social en equipos de trabajo">
      <label class="field-label" for="caseCategory">Categoria</label>
      <input id="caseCategory" placeholder="Ej. Psicologia social">
      <label class="field-label" for="caseDifficulty">Dificultad</label>
      <select id="caseDifficulty">
        <option>Baja</option>
        <option>Media</option>
        <option>Alta</option>
      </select>
      <label class="field-label" for="caseDesc">Descripcion</label>
      <textarea id="caseDesc" placeholder="Resume el contexto y objetivo del caso"></textarea>
      <button onclick="createCase()">Crear caso</button>
      <pre id="caseMsg"></pre>
    </section>

    <section class="form-card">
      <span class="material-symbols-outlined form-icon">upload_file</span>
      <h4>Importar casos</h4>
      <p>Usa una plantilla para cargar casos con textos, preguntas y opciones de respuesta.</p>
      <div class="import-actions">
        <button onclick="downloadCaseImportTemplate()">Descargar plantilla</button>
        <button class="secondary-btn" onclick="fillCaseImportTemplate()">Usar ejemplo</button>
        <input id="caseImportFile" type="file" accept=".txt,text/plain,application/json,.json" onchange="loadCaseImportFile(event)">
      </div>
      <textarea id="caseImportJson" class="import-textarea" placeholder="Pega aqui la plantilla en texto natural"></textarea>
      <button onclick="importCases()">Importar casos</button>
      <pre id="importMsg"></pre>
    </section>
  </div>`);
}

async function showCreateSession() {
  show('Crear sesion', '<p>Cargando casos disponibles...</p>');
  const cases = await api('/api/cases');
  updateSessionCaseOptions(cases);
  const options = cases.length
    ? `<option value="">Selecciona un caso</option>${cases.map(c => `<option value="${c.id}">#${c.id} ${esc(c.title)}${c.difficulty ? ` - ${esc(c.difficulty)}` : ''}</option>`).join('')}`
    : '<option value="">No hay casos activos</option>';
  show('Crear sesion', `<div class="form-page single-form">
    <section class="form-card">
      <span class="material-symbols-outlined form-icon">stadia_controller</span>
      <h4>Nueva sesion en vivo</h4>
      <p>Selecciona un caso y define el tiempo limite. El sistema generara un PIN para estudiantes.</p>
      <label class="field-label" for="sessionCaseId">Caso</label>
      <select id="sessionCaseId">${options}</select>
      <label class="field-label" for="sessionDuration">Duracion en minutos</label>
      <input id="sessionDuration" type="number" min="1" value="30" placeholder="Minutos">
      <button onclick="createSession()">Generar PIN</button>
      <pre id="pinOut"></pre>
      <div id="hostSessionOut"></div>
    </section>
  </div>`);
}

function showJoinSession() {
  show('Unirse a sesion', `<div class="form-page single-form">
    <section class="form-card">
      <span class="material-symbols-outlined form-icon">pin</span>
      <h4>Entrar a una sala en vivo</h4>
      <p>Ingresa el PIN de 6 digitos entregado por tu profesor.</p>
      <label class="field-label" for="joinPin">PIN de la sesion</label>
      <input id="joinPin" placeholder="PIN de 6 digitos">
      <button onclick="joinLiveSession()">Entrar con PIN</button>
      <pre id="joinOut"></pre>
    </section>
  </div>`);
}

function showCreateUser() {
  show('Crear usuario', `<div class="form-page single-form">
    <section class="form-card">
      <span class="material-symbols-outlined form-icon">person_add</span>
      <h4>Nuevo usuario</h4>
      <p>Crea cuentas para estudiantes, profesores o administradores.</p>
      <label class="field-label" for="uName">Nombre</label>
      <input id="uName" placeholder="Nombre">
      <label class="field-label" for="uEmail">Correo</label>
      <input id="uEmail" placeholder="Email">
      <label class="field-label" for="uRole">Rol</label>
      <select id="uRole">
        <option>ESTUDIANTE</option>
        <option>PROFESOR</option>
        <option>ADMIN</option>
      </select>
      <label class="field-label" for="uPass">Clave inicial</label>
      <input id="uPass" type="password" placeholder="Clave" value="123456">
      <button onclick="createUser()">Crear usuario</button>
      <pre id="uMsg"></pre>
    </section>
  </div>`);
}

async function runView(title, loader) {
  try {
    show(title, '<p>Cargando...</p>');
    await loader();
  } catch (e) {
    show(title, `<p class="error-text">No se pudo cargar esta seccion.</p><pre>${esc(e.message)}</pre>`);
  }
}

async function loadStudents() {
  students = await api('/api/cases/students');
}

function studentOptions() {
  return students.map(s => `<option value="${s.id}">${s.name || s.email} (${s.email})</option>`).join('');
}

function updateSessionCaseOptions(cases) {
  sessionCases = cases || [];
  const select = $('sessionCaseId');
  if (!select) return;
  select.innerHTML = sessionCases.length
    ? `<option value="">Selecciona un caso</option>${sessionCases.map(c => `<option value="${c.id}">#${c.id} ${esc(c.title)}${c.difficulty ? ` - ${esc(c.difficulty)}` : ''}</option>`).join('')}`
    : '<option value="">No hay casos activos</option>';
}

async function loadCases() {
  const rows = await api('/api/cases');
  if (me.role !== 'ESTUDIANTE') updateSessionCaseOptions(rows);
  if (me.role !== 'ESTUDIANTE') await loadStudents();
  show('Casos', `<div class="case-grid">${rows.map(c => `<article class="case-card">
    <div class="case-card-top">
      <span class="case-id">#${c.id}</span>
      <span class=badge>${esc(c.difficulty || 'Sin dificultad')}</span>
    </div>
    <h4>${esc(c.title)}</h4>
    <p>${esc(c.description || 'Sin descripcion')}</p>
    <small>${esc(c.category || 'Sin categoria')}</small>
    ${me.role !== 'ESTUDIANTE' ? `<div class="case-actions">
      <button onclick="openBuilder(${c.id})">Disenar bloques</button>
      ${me.role === 'ADMIN' ? `<button onclick="startCaseAsAdmin(${c.id})">Resolver caso</button>` : ''}
      <button class="danger-btn" onclick="deleteCase(${c.id})">Borrar caso</button>
      <select id="assign${c.id}" multiple size="5">${studentOptions()}</select>
      <input id="attempts${c.id}" type="number" min="1" value="1" placeholder="Intentos maximos">
      <button onclick="assignStudents(${c.id})">Asignar seleccionados</button>
    </div>` : ''}
  </article>`).join('') || '<div class="empty-state"><span class="material-symbols-outlined">folder_off</span><h4>Sin casos todavia</h4><p>Crea o importa el primer caso desde el menu Crear caso.</p></div>'}</div>`);
}

async function createCase() {
  const msg = $('caseMsg');
  if (msg) msg.textContent = '';
  try {
    await api('/api/cases', {
      method: 'POST',
      body: JSON.stringify({ title: $('caseTitle').value, description: $('caseDesc').value, category: $('caseCategory').value, difficulty: $('caseDifficulty').value })
    });
    if ($('caseTitle')) $('caseTitle').value = '';
    if ($('caseCategory')) $('caseCategory').value = '';
    if ($('caseDesc')) $('caseDesc').value = '';
    if (msg) msg.textContent = 'Caso creado. Ve a Casos para disenar sus bloques o asignarlo.';
  } catch (e) {
    if (msg) msg.textContent = e.message;
    else throw e;
  }
}

async function deleteCase(caseId) {
  if (!confirm('Borrar este caso? Dejara de aparecer en las listas.')) return;
  await api(`/api/cases/${caseId}`, { method: 'DELETE' });
  if ($('sessionCaseId')?.value === String(caseId)) $('pinOut').textContent = '';
  loadCases();
}

async function startCaseAsAdmin(caseId) {
  activeGameSession = null;
  const assignment = await api(`/api/student/cases/${caseId}/start`, { method: 'POST', body: JSON.stringify({}) });
  activeAssignment = assignment.id;
  activeBlocks = await api(`/api/cases/${caseId}/blocks`);
  renderBlockPlayer(0);
}

function caseImportTemplateText() {
  return CASE_IMPORT_TEMPLATE;
}

function fillCaseImportTemplate() {
  $('caseImportJson').value = caseImportTemplateText();
  $('importMsg').textContent = '';
}

function downloadCaseImportTemplate() {
  const blob = new Blob([caseImportTemplateText()], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'plantilla-importacion-casos-psicoapp.txt';
  a.click();
  URL.revokeObjectURL(url);
}

async function loadCaseImportFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  $('caseImportJson').value = await file.text();
  $('importMsg').textContent = `Archivo cargado: ${file.name}`;
}

async function importCases() {
  try {
    const raw = $('caseImportJson').value.trim();
    if (!raw) { alert('Pega o carga una plantilla de importacion'); return; }
    let imported;
    if (raw.startsWith('{') || raw.startsWith('[')) {
      imported = await api('/api/cases/import', { method: 'POST', body: JSON.stringify(JSON.parse(raw)) });
    } else {
      const r = await fetch('/api/cases/import-text', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', Authorization: 'Bearer ' + token },
        body: raw
      });
      if (!r.ok) throw new Error(await r.text());
      imported = await r.json();
    }
    $('importMsg').textContent = `Importados: ${imported.map(c => `#${c.caseId} ${c.title} (${c.blocks} bloques)`).join(', ')}`;
    $('caseImportJson').value = '';
  } catch (e) {
    $('importMsg').textContent = e.message;
  }
}

async function assignStudents(id) {
  const selected = [...$('assign' + id).selectedOptions].map(o => Number(o.value));
  if (!selected.length) { alert('Selecciona al menos un estudiante'); return; }
  const maxAttempts = Math.max(1, Number($('attempts' + id)?.value || 1));
  const assigned = await api(`/api/cases/${id}/assign-students`, { method: 'POST', body: JSON.stringify({ studentIds: selected, maxAttempts }) });
  alert(`Asignado a ${assigned.length} estudiante(s)`);
}

async function openBuilder(caseId) {
  const blocks = await api(`/api/cases/${caseId}/blocks`);
  builderBlocks = blocks;
  show('Constructor del caso', `<button onclick="loadCases()">Volver</button>
    <div class="block-stack">${blocks.map((b, i) => blockCard(b, caseId, i, blocks.length)).join('')}${addBlockCard(caseId, blocks.length + 1)}</div>`);
}

function blockActions(b, caseId, index, total) {
  return `<div class="block-actions">
    <button class="secondary-btn" onclick="renderEditBlockForm(${caseId},${b.id})">Editar</button>
    <button class="secondary-btn" onclick="moveBlock(${caseId},${b.id},'UP')" ${index === 0 ? 'disabled' : ''}>Subir</button>
    <button class="secondary-btn" onclick="moveBlock(${caseId},${b.id},'DOWN')" ${index === total - 1 ? 'disabled' : ''}>Bajar</button>
    <button class="danger-btn" onclick="deleteBlock(${caseId},${b.id})">Borrar</button>
  </div>`;
}

function blockCard(b, caseId, index, total) {
  if (b.blockType === 'QUESTION') {
    const opts = (b.question?.options || []).map(o => `<li>${o.correct ? '<b>[correcta]</b> ' : ''}${o.text}</li>`).join('');
    return `<div class="block-card" id="block${b.id}"><span class=badge>Pantalla ${b.orderIndex}: Pregunta</span>${blockActions(b, caseId, index, total)}<h4>${b.question?.text || b.title}</h4><ol>${opts}</ol></div>`;
  }
  return `<div class="block-card" id="block${b.id}"><span class=badge>Pantalla ${b.orderIndex}: Cuadro de texto</span>${blockActions(b, caseId, index, total)}<h4>${b.title}</h4><p>${b.contextText || ''}</p></div>`;
}

function addBlockCard(caseId, orderIndex) {
  return `<div class="block-card add-block" id="addBlock">
    <button class="plus-btn" onclick="chooseBlockType(${caseId},${orderIndex})">+</button>
  </div>`;
}

function chooseBlockType(caseId, orderIndex) {
  $('addBlock').className = 'block-card form-block';
  $('addBlock').innerHTML = `<div class="choice-row">
    <button onclick="renderTextBlockForm(${caseId},${orderIndex})">Cuadro de texto</button>
    <button onclick="renderQuestionBlockForm(${caseId},${orderIndex})">Pregunta con opciones</button>
  </div>`;
}

function renderTextBlockForm(caseId, orderIndex) {
  $('addBlock').className = 'block-card form-block';
  $('addBlock').innerHTML = `<h4>Nueva pantalla de texto</h4>
    <label class="field-label">Título de la pantalla</label>
    <input id="blockTitle" placeholder="Ej. Reflexión inicial">
    <label class="field-label">Texto o instrucción</label>
    <textarea id="blockText" placeholder="Escribe lo que verá el estudiante en esta pantalla"></textarea>
    <div class="form-actions"><button onclick="saveTextBlock(${caseId},${orderIndex})">Guardar bloque</button></div>`;
}

function renderQuestionBlockForm(caseId, orderIndex) {
  $('addBlock').className = 'block-card form-block';
  $('addBlock').innerHTML = `<h4>Nueva pregunta cerrada</h4>
    <label class="field-label">Pregunta</label>
    <textarea id="questionText" class="question-input" placeholder="Escribe aquí la pregunta que responderá el estudiante"></textarea>
    <label class="field-label">Puntaje</label>
    <input id="questionScore" class="score-input" type="number" value="10" min="1" placeholder="Puntaje">
    <div class="options-editor">
      <label class="field-label">Opciones de respuesta</label>
      ${[1, 2, 3, 4].map(i => `<div class="option-row"><input id="opt${i}" placeholder="Opción ${i}${i === 4 ? ' opcional' : ''}"><label class="check-label"><input id="ok${i}" type="checkbox"> Correcta</label></div>`).join('')}
    </div>
    <div class="form-actions"><button onclick="saveQuestionBlock(${caseId},${orderIndex})">Guardar pregunta</button></div>`;
}

async function saveTextBlock(caseId, orderIndex) {
  await api(`/api/cases/${caseId}/blocks`, {
    method: 'POST',
    body: JSON.stringify({ blockType: 'TEXT', orderIndex, title: $('blockTitle').value, contextText: $('blockText').value })
  });
  openBuilder(caseId);
}

async function saveQuestionBlock(caseId, orderIndex) {
  const questionText = $('questionText').value.trim();
  if (!questionText) { alert('Escribe el texto de la pregunta'); return; }
  const options = [1, 2, 3, 4].map(i => ({ text: $('opt' + i).value.trim(), correct: $('ok' + i).checked })).filter(o => o.text);
  if (options.length < 3 || options.length > 4) { alert('Cada pregunta debe tener entre 3 y 4 opciones'); return; }
  if (!options.some(o => o.correct)) { alert('Marca al menos una opción correcta'); return; }
  await api(`/api/cases/${caseId}/blocks`, {
    method: 'POST',
    body: JSON.stringify({ blockType: 'QUESTION', orderIndex, title: 'Pregunta', questionText, score: Number($('questionScore').value || 10), options })
  });
  openBuilder(caseId);
}

function renderEditBlockForm(caseId, blockId) {
  const b = activeBuilderBlock(blockId);
  const target = $('block' + blockId);
  if (!b || !target) return;
  if (b.blockType === 'QUESTION') {
    const optionInputs = [0, 1, 2, 3].map(i => {
      const opt = b.question?.options?.[i] || {};
      return `<div class="option-row"><input id="editOpt${i + 1}" value="${esc(opt.text)}" placeholder="Opcion ${i + 1}${i === 3 ? ' opcional' : ''}"><label class="check-label"><input id="editOk${i + 1}" type="checkbox" ${opt.correct ? 'checked' : ''}> Correcta</label></div>`;
    }).join('');
    target.className = 'block-card form-block';
    target.innerHTML = `<h4>Editar pregunta</h4>
      <label class="field-label">Pregunta</label>
      <textarea id="editQuestionText" class="question-input">${esc(b.question?.text)}</textarea>
      <label class="field-label">Puntaje</label>
      <input id="editQuestionScore" class="score-input" type="number" value="${b.question?.score || 10}" min="1">
      <div class="options-editor"><label class="field-label">Opciones de respuesta</label>${optionInputs}</div>
      <div class="form-actions"><button class="secondary-btn" onclick="openBuilder(${caseId})">Cancelar</button><button onclick="saveEditedQuestionBlock(${caseId},${blockId})">Guardar</button></div>`;
    return;
  }
  target.className = 'block-card form-block';
  target.innerHTML = `<h4>Editar cuadro de texto</h4>
    <label class="field-label">Titulo de la pantalla</label>
    <input id="editBlockTitle" value="${esc(b.title)}">
    <label class="field-label">Texto o instruccion</label>
    <textarea id="editBlockText">${esc(b.contextText)}</textarea>
    <div class="form-actions"><button class="secondary-btn" onclick="openBuilder(${caseId})">Cancelar</button><button onclick="saveEditedTextBlock(${caseId},${blockId})">Guardar</button></div>`;
}

function activeBuilderBlock(blockId) {
  return builderBlocks.find(b => b.id === blockId);
}

async function saveEditedTextBlock(caseId, blockId) {
  await api(`/api/cases/blocks/${blockId}`, {
    method: 'PUT',
    body: JSON.stringify({ blockType: 'TEXT', title: $('editBlockTitle').value, contextText: $('editBlockText').value })
  });
  openBuilder(caseId);
}

async function saveEditedQuestionBlock(caseId, blockId) {
  const questionText = $('editQuestionText').value.trim();
  if (!questionText) { alert('Escribe el texto de la pregunta'); return; }
  const options = [1, 2, 3, 4].map(i => ({ text: $('editOpt' + i).value.trim(), correct: $('editOk' + i).checked })).filter(o => o.text);
  if (options.length < 3 || options.length > 4) { alert('Cada pregunta debe tener entre 3 y 4 opciones'); return; }
  if (!options.some(o => o.correct)) { alert('Marca al menos una opcion correcta'); return; }
  await api(`/api/cases/blocks/${blockId}`, {
    method: 'PUT',
    body: JSON.stringify({ blockType: 'QUESTION', questionText, score: Number($('editQuestionScore').value || 10), options })
  });
  openBuilder(caseId);
}

async function deleteBlock(caseId, blockId) {
  if (!confirm('Borrar este bloque?')) return;
  await api(`/api/cases/blocks/${blockId}`, { method: 'DELETE' });
  openBuilder(caseId);
}

async function moveBlock(caseId, blockId, direction) {
  await api(`/api/cases/blocks/${blockId}/move`, { method: 'POST', body: JSON.stringify({ direction }) });
  openBuilder(caseId);
}

async function loadAssignments() {
  try {
    const rows = await api('/api/student/assignments');
    show('Mis asignaciones', rows.map(a => `<div class=item>
      <b>#${a.id} ${esc(a.caseStudy.title)}</b><p>${esc(a.caseStudy.description)}</p>
      <p>Intentos usados: <b>${a.attemptsUsed}</b> / ${a.attemptsAllowed}${a.extraAttempts ? ` (${a.extraAttempts} extra)` : ''}</p>
      ${a.latestScore !== null && a.latestScore !== undefined ? `<p>Ultimo puntaje: <b>${a.latestScore}</b> | Estado: ${esc(a.latestStatus || '')}</p>` : ''}
      ${a.canStart ? `<button onclick="startAssignment(${a.id},${a.caseStudy.id})">Resolver caso</button>` : '<span class="badge locked-badge">Intentos agotados</span>'}
    </div>`).join('') || 'Sin asignaciones');
  } catch (e) {
    show('Mis asignaciones', 'Disponible para estudiantes.');
  }
}

async function startAssignment(assignmentId, caseId) {
  activeGameSession = null;
  activeAssignment = assignmentId;
  activeBlocks = await api(`/api/cases/${caseId}/blocks`);
  renderBlockPlayer(0);
}

function visualPlaceholder() {
  return `<section class="vn-stage" aria-label="Area visual en desarrollo">
    <div class="vn-placeholder">
      <span>UNDER DEVELOPMENT</span>
      <small>Placeholder de ilustraciones y animaciones</small>
    </div>
  </section>`;
}

function toggleSlideHistory() {
  $('slideHistoryPanel')?.classList.toggle('hidden');
}

function slideSummary(block, index) {
  if (block.blockType === 'QUESTION') {
    const options = (block.question?.options || []).map(o => `<li>${esc(o.text)}</li>`).join('');
    return `<article class="history-slide">
      <span class="badge">Diapositiva ${index + 1}: Pregunta</span>
      <h5>${esc(block.question?.text || block.title || 'Pregunta')}</h5>
      ${options ? `<ol>${options}</ol>` : ''}
    </article>`;
  }
  return `<article class="history-slide">
    <span class="badge">Diapositiva ${index + 1}: Texto</span>
    <h5>${esc(block.title || 'Texto')}</h5>
    <p>${esc(block.contextText || '')}</p>
  </article>`;
}

function slideHistoryPanel(currentIndex) {
  const seenBlocks = activeBlocks.slice(0, currentIndex + 1);
  return `<aside id="slideHistoryPanel" class="slide-history-panel hidden" aria-label="Historial de diapositivas">
    <div class="history-header">
      <h4>Historial</h4>
      <button class="icon-btn" onclick="toggleSlideHistory()" title="Cerrar historial" aria-label="Cerrar historial">x</button>
    </div>
    <div class="history-list">${seenBlocks.map(slideSummary).join('')}</div>
  </aside>`;
}

function playerHeader(block, index, progress) {
  const liveTime = activeGameSession ? `<div class="live-timer">Tiempo restante: <b id="liveRemaining">${formatRemaining(activeGameSession.remainingSeconds)}</b></div>` : '';
  return `<div class="player-top">
    <span class=badge>${block.blockType === 'QUESTION' ? 'Pregunta cerrada' : 'Cuadro de texto'}</span>
    <div class="player-tools">
      <strong>Pantalla ${index + 1}</strong>
      <button class="info-btn" onclick="toggleSlideHistory()" title="Ver historial de diapositivas" aria-label="Ver historial de diapositivas">i</button>
    </div>
  </div>
  ${liveTime}
  <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>`;
}

function renderBlockPlayer(index) {
  if (!activeBlocks.length) {
    show('Resolver caso', '<p>Este caso todavia no tiene bloques.</p>');
    return;
  }
  if (index >= activeBlocks.length) {
    updateLiveProgress(activeBlocks.length, true);
    show('Resolver caso', `<div class="player-shell vn-player complete-screen"><div class="player-top"><span class=badge>Completado</span><strong>${activeBlocks.length} / ${activeBlocks.length}</strong></div>${visualPlaceholder()}<section class="vn-dialogue"><div><h4>Caso terminado</h4><p>Terminaste las pantallas del caso.</p></div><button onclick="finishAssignment()">Enviar caso</button></section></div>`);
    return;
  }
  updateLiveProgress(index, false);
  const b = activeBlocks[index];
  const progress = Math.round(((index + 1) / activeBlocks.length) * 100);
  const previousButton = activeGameSession ? '' : `<button class="secondary-btn" onclick="renderBlockPlayer(${Math.max(0, index - 1)})">Anterior</button>`;
  const nav = `<div class="player-nav">${previousButton}<div class="step-count">${index + 1} / ${activeBlocks.length}</div><button onclick="nextBlock(${index})">Siguiente</button></div>`;
  const head = playerHeader(b, index, progress);
  const history = slideHistoryPanel(index);
  if (b.blockType === 'QUESTION') {
    const opts = (b.question.options || []).map(o => `<label class="answer-option"><input type="checkbox" name="q${b.question.id}" value="${o.id}"> ${esc(o.text)}</label>`).join('');
    show('Resolver caso', `<div class="player-shell vn-player">${head}${visualPlaceholder()}${history}<section class="vn-dialogue question-dialogue"><div class="dialogue-copy"><h4>${esc(b.question.text)}</h4><div class="answers-grid">${opts}</div></div></section>${nav}</div>`);
    return;
  }
  show('Resolver caso', `<div class="player-shell vn-player">${head}${visualPlaceholder()}${history}<section class="vn-dialogue"><div class="dialogue-copy"><h4>${esc(b.title)}</h4><p>${esc(b.contextText || '')}</p></div></section>${nav}</div>`);
}

async function updateLiveProgress(blockIndex, completed = false) {
  if (!activeGameSession?.id || !activeAssignment) return;
  try {
    await api(`/api/game/sessions/${activeGameSession.id}/progress`, { method: 'POST', body: JSON.stringify({ blockIndex, completed }) });
  } catch (e) {
    // Polling will surface session end; progress is best-effort for the host dashboard.
  }
}
async function nextBlock(index) {
  const b = activeBlocks[index];
  try {
    if (b.blockType === 'QUESTION') {
      const selected = [...document.querySelectorAll(`input[name="q${b.question.id}"]:checked`)].map(x => Number(x.value));
      if (!selected.length) { alert('Selecciona al menos una opcion'); return; }
      await api(`/api/student/assignments/${activeAssignment}/answer-multiple`, { method: 'POST', body: JSON.stringify({ questionId: b.question.id, optionIds: selected }) });
    }
    renderBlockPlayer(index + 1);
  } catch (e) {
    show('Sesion en vivo', `<p class="error-text">No se pudo guardar la respuesta.</p><pre>${esc(e.message)}</pre>`);
  }
}
async function saveDraft(id, notify = true) {
  await api(`/api/student/assignments/${id}/draft`, { method: 'POST', body: JSON.stringify({ analysisText: '' }) });
  if (notify) alert('Avance guardado');
}

async function finishAssignment() {
  try {
    await updateLiveProgress(activeBlocks.length, true);
    await saveDraft(activeAssignment, false);
    const submitted = await api(`/api/student/assignments/${activeAssignment}/submit`, { method: 'POST', body: JSON.stringify({}) });
    showScoreResult(submitted.autoScore, submitted.attemptNumber, 'Entrega enviada');
  } catch (e) {
    show('Sesion en vivo', `<p class="error-text">No se pudo enviar la entrega.</p><pre>${esc(e.message)}</pre>`);
  }
}

function showScoreResult(score, attemptNumber, title = 'Caso finalizado') {
  show(title, `<div class="score-result">
    <span class="material-symbols-outlined">military_tech</span>
    <h4>Puntaje obtenido</h4>
    <strong>${score ?? 0}</strong>
    ${attemptNumber ? `<p>Intento ${attemptNumber}</p>` : ''}
    <button onclick="loadAssignments()">Volver a mis asignaciones</button>
  </div>`);
}

async function showCurrentAssignmentScore(title = 'Sesion finalizada') {
  try {
    const rows = await api('/api/student/submissions');
    const latest = rows.filter(s => s.assignment?.id === activeAssignment).sort((a, b) => (b.attemptNumber || 1) - (a.attemptNumber || 1))[0];
    showScoreResult(latest?.autoScore || 0, latest?.attemptNumber, title);
  } catch (e) {
    show(title, '<p>El tiempo de la sesion termino.</p>');
  }
}
async function loadSubmissions() {
  const path = me.role === 'ESTUDIANTE' ? '/api/student/submissions' : '/api/teacher/submissions';
  const rows = await api(path);
  show('Entregas', rows.map(s => `<div class=item>
    <b>#${s.id} ${esc(s.assignment?.caseStudy?.title || '')}</b>
    <p>Estudiante: ${esc(s.student?.name || '')} | Intento: ${s.attemptNumber || 1}</p>
    <p>${esc(s.analysisText || '')}</p>
    <p>Estado: ${s.status} | Puntaje: <b>${s.autoScore}</b> | Nota: ${s.grade ?? 'sin nota'}</p>
    ${me.role !== 'ESTUDIANTE' ? `<input id="g${s.id}" placeholder="nota"><input id="f${s.id}" placeholder="retroalimentacion"><button onclick="grade(${s.id})">Calificar</button>
      <div class="extra-attempt-row"><input id="extra${s.assignment?.id}" type="number" min="1" value="1" placeholder="Intentos extra"><button class="secondary-btn" onclick="grantExtraAttempts(${s.assignment?.id})">Dar intento extra</button></div>` : `<p>${esc(s.feedback || '')}</p>`}
  </div>`).join('') || 'Sin entregas');
}

async function grade(id) {
  await api(`/api/teacher/submissions/${id}/grade`, { method: 'PUT', body: JSON.stringify({ grade: $('g' + id).value, feedback: $('f' + id).value }) });
  loadSubmissions();
}

async function grantExtraAttempts(assignmentId) {
  const amount = Math.max(1, Number($('extra' + assignmentId)?.value || 1));
  await api(`/api/teacher/assignments/${assignmentId}/extra-attempts`, { method: 'POST', body: JSON.stringify({ extraAttempts: amount }) });
  alert(`Se agregaron ${amount} intento(s) extra.`);
  loadSubmissions();
}

async function loadRanking() {
  const cases = await api('/api/cases');
  const firstCaseId = cases[0]?.id || '';
  const selector = `<label class="field-label" for="rankingCaseId">Caso</label>
    <select id="rankingCaseId" onchange="loadRankingForCase()">
      ${cases.map(c => `<option value="${c.id}">#${c.id} ${esc(c.title)}${c.difficulty ? ` - ${esc(c.difficulty)}` : ''}</option>`).join('')}
    </select>
    <div id="rankingRows"></div>`;
  show(me.role === 'ESTUDIANTE' ? 'Mi ranking por caso' : 'Ranking por caso', cases.length ? selector : 'No hay casos activos para rankear');
  if (firstCaseId) await loadRankingForCase(firstCaseId);
}

async function loadRankingForCase(caseId = Number($('rankingCaseId')?.value || 0)) {
  const target = $('rankingRows');
  if (!target || !caseId) return;
  target.innerHTML = '<p>Cargando ranking...</p>';
  try {
    const rows = await api(`/api/game/ranking?caseId=${caseId}`);
    target.innerHTML = rows.map((r, i) => `<div class=item>${i + 1}. <b>${esc(r.estudiante)}</b>: ${r.puntaje} pts ${r.nota ?? ''}</div>`).join('') || 'Sin ranking para este caso';
  } catch (e) {
    target.innerHTML = `<p class="error-text">No se pudo cargar el ranking de este caso.</p><pre>${esc(e.message)}</pre>`;
  }
}

async function createSession() {
  const caseId = Number($('sessionCaseId').value);
  const durationMinutes = Number($('sessionDuration').value || 30);
  if ($('hostSessionOut')) $('hostSessionOut').innerHTML = '';
  if (!caseId) {
    $('pinOut').textContent = 'Selecciona un caso para generar el PIN.';
    return;
  }
  if (!durationMinutes || durationMinutes < 1) {
    $('pinOut').textContent = 'Indica un limite de tiempo valido.';
    return;
  }
  const r = await api('/api/game/sessions', { method: 'POST', body: JSON.stringify({ caseId, durationMinutes }) });
  activeGameSession = r;
  $('pinOut').textContent = `PIN: ${r.pin}\nEstado: esperando estudiantes\nTiempo: ${r.durationMinutes} minutos`;
  renderHostSessionRoom(r);
}

function stopLiveSessionTimer() {
  if (liveSessionTimer) clearInterval(liveSessionTimer);
  liveSessionTimer = null;
}

function formatRemaining(seconds) {
  const s = Math.max(0, Number(seconds || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}`;
}

function sessionStatusLabel(s) {
  return s === 'EN_CURSO' ? 'En curso' : s === 'FINALIZADA' ? 'Finalizada' : 'En espera';
}

function participantList(session) {
  return (session.participants || []).map(p => {
    const progress = p.completed ? 'Finalizo' : `Pantalla ${Number(p.currentBlockIndex || 0) + 1}`;
    const score = session.status === 'FINALIZADA' || p.completed ? `<p>Puntaje: <b>${p.score ?? 0}</b>${p.attemptNumber ? ` | Intento ${p.attemptNumber}` : ''}</p>` : '';
    return `<div class=item><b>${esc(p.name || p.email)}</b><p>${esc(p.email)}</p><span class=badge>${progress}</span>${score}</div>`;
  }).join('') || '<p>Aun no hay estudiantes en la sala.</p>';
}

async function renderHostSessionRoom(session) {
  activeGameSession = session;
  const html = `<div class="session-room card">
    <h3>Sala en vivo</h3>
    <p><b>Caso:</b> ${esc(session.caseTitle)}</p>
    <p><b>PIN:</b> ${esc(session.pin)} | <b>Estado:</b> ${sessionStatusLabel(session.status)} | <b>Tiempo:</b> ${session.durationMinutes} min</p>
    <p><b>Tiempo restante:</b> <span id="hostRemaining">${formatRemaining(session.remainingSeconds)}</span></p>
    ${session.status === 'ESPERA' ? `<button onclick="startLiveSession(${session.id})">Empezar ahora</button>` : ''}
    ${session.status !== 'FINALIZADA' ? `<button class="danger-btn" onclick="finishLiveSession(${session.id})">Finalizar sesion</button>` : ''}
    <h4>Estudiantes conectados</h4>
    <div id="participantsList">${participantList(session)}</div>
  </div>`;
  if ($('hostSessionOut')) {
    $('hostSessionOut').innerHTML = html;
    $('hostSessionOut').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } else {
    show('Sala en vivo', html);
  }
  stopLiveSessionTimer();
  liveSessionTimer = setInterval(() => pollHostSession(session.id), 3000);
}

async function pollHostSession(sessionId) {
  try {
    const session = await api(`/api/game/sessions/${sessionId}`);
    activeGameSession = session;
    const list = $('participantsList');
    if (list) list.innerHTML = participantList(session);
    const remaining = $('hostRemaining');
    if (remaining) remaining.textContent = formatRemaining(session.remainingSeconds);
    if (session.status !== 'ESPERA' && document.querySelector('.session-room button[onclick^="startLiveSession"]')) renderHostSessionRoom(session);
    if (session.status === 'FINALIZADA') stopLiveSessionTimer();
  } catch (e) {
    stopLiveSessionTimer();
  }
}

async function startLiveSession(sessionId) {
  const session = await api(`/api/game/sessions/${sessionId}/start`, { method: 'POST', body: JSON.stringify({}) });
  renderHostSessionRoom(session);
}

async function finishLiveSession(sessionId) {
  const session = await api(`/api/game/sessions/${sessionId}/status`, { method: 'PUT', body: JSON.stringify({ status: 'FINALIZADA' }) });
  renderHostSessionRoom(session);
}

async function joinLiveSession() {
  const pin = $('joinPin').value.trim();
  if (!pin) {
    $('joinOut').textContent = 'Ingresa el PIN.';
    return;
  }
  try {
    const session = await api(`/api/game/join/${encodeURIComponent(pin)}`, { method: 'POST', body: JSON.stringify({}) });
    $('joinOut').textContent = `Entraste a la sesion ${session.pin}`;
    renderStudentSession(session);
  } catch (e) {
    $('joinOut').textContent = e.message;
  }
}

async function renderStudentSession(session) {
  activeGameSession = session;
  activeAssignment = session.assignmentId;
  stopLiveSessionTimer();
  if (session.status === 'ESPERA') {
    show('Sala en vivo', `<div class="session-room"><h4>${esc(session.caseTitle)}</h4><p>Ya estas dentro. Espera a que el profesor inicie la sesion.</p><p>PIN: <b>${esc(session.pin)}</b></p><p id="studentLiveStatus">Estado: ${sessionStatusLabel(session.status)}</p></div>`);
    liveSessionTimer = setInterval(() => pollStudentSession(session.id), 3000);
    return;
  }
  if (session.status === 'FINALIZADA' || session.remainingSeconds <= 0) {
    show('Sala en vivo', `<p>Esta sesion ya finalizo.</p>`);
    return;
  }
  activeBlocks = await api(`/api/cases/${session.caseId}/blocks`);
  liveSessionTimer = setInterval(() => pollStudentSession(session.id), 3000);
  renderBlockPlayer(0);
}

async function pollStudentSession(sessionId) {
  try {
    const session = await api(`/api/game/sessions/${sessionId}`);
    activeGameSession = session;
    const timer = $('liveRemaining');
    if (timer) timer.textContent = formatRemaining(session.remainingSeconds);
    const status = $('studentLiveStatus');
    if (status) status.textContent = `Estado: ${sessionStatusLabel(session.status)}`;
    if (session.status === 'EN_CURSO' && !activeBlocks.length) renderStudentSession(session);
    if (session.status === 'FINALIZADA' || session.remainingSeconds <= 0 && session.status === 'EN_CURSO') {
      stopLiveSessionTimer();
      showCurrentAssignmentScore('Sesion finalizada');
    }
  } catch (e) {
    stopLiveSessionTimer();
  }
}

async function loadNotifications() {
  const rows = await api('/api/notifications');
  show('Notificaciones', rows.map(n => `<div class=item><b>${n.title}</b><p>${n.message}</p></div>`).join('') || 'Sin notificaciones');
}

async function loadUsers() {
  const rows = await api('/api/admin/users');
  adminUsers = rows;
  show('Usuarios', `<div class="user-grid">${rows.map(userCard).join('') || '<div class="empty-state"><span class="material-symbols-outlined">group_off</span><h4>Sin usuarios</h4><p>Crea el primer usuario desde el panel lateral.</p></div>'}</div>`);
}

function roleOptions(selected) {
  return ['ESTUDIANTE', 'PROFESOR', 'ADMIN'].map(role => `<option value="${role}" ${role === selected ? 'selected' : ''}>${role}</option>`).join('');
}

function userCard(u) {
  return `<article class="user-card" id="user${u.id}">
    <div class="user-card-head">
      <div>
        <span class="case-id">#${u.id}</span>
        <h4>${esc(u.name || 'Sin nombre')}</h4>
        <p>${esc(u.email)}</p>
      </div>
      <span class=badge>${esc(u.role)}</span>
    </div>
    <div class="user-meta">
      <span>${u.enabled ? 'Activo' : 'Inactivo'}</span>
      <span>Creado: ${esc((u.createdAt || '').replace('T', ' ').slice(0, 16) || 'N/D')}</span>
    </div>
    <div class="user-actions">
      <button class="secondary-btn" onclick="renderEditUser(${u.id})">Editar</button>
      <button class="danger-btn" onclick="deleteUser(${u.id})">Eliminar</button>
    </div>
  </article>`;
}

function renderEditUser(id) {
  const user = adminUsers.find(u => u.id === id);
  const target = $('user' + id);
  if (!user || !target) return;
  target.className = 'user-card edit-user-card';
  target.innerHTML = `<h4>Editar usuario #${id}</h4>
    <label class="field-label">Nombre</label>
    <input id="editUserName${id}" value="${esc(user.name || '')}">
    <label class="field-label">Correo</label>
    <input id="editUserEmail${id}" value="${esc(user.email || '')}">
    <label class="field-label">Rol</label>
    <select id="editUserRole${id}">${roleOptions(user.role)}</select>
    <label class="check-label user-enabled"><input id="editUserEnabled${id}" type="checkbox" ${user.enabled ? 'checked' : ''}> Usuario activo</label>
    <label class="field-label">Nueva clave (opcional)</label>
    <input id="editUserPass${id}" type="password" placeholder="Dejar vacio para conservar la actual">
    <div class="user-actions">
      <button class="secondary-btn" onclick="loadUsers()">Cancelar</button>
      <button onclick="updateUser(${id})">Guardar cambios</button>
    </div>
    <pre id="editUserMsg${id}"></pre>`;
}

async function updateUser(id) {
  const body = {
    name: $('editUserName' + id).value.trim(),
    email: $('editUserEmail' + id).value.trim(),
    role: $('editUserRole' + id).value,
    enabled: $('editUserEnabled' + id).checked,
    password: $('editUserPass' + id).value
  };
  try {
    await api(`/api/admin/users/${id}`, { method: 'PUT', body: JSON.stringify(body) });
    await loadUsers();
  } catch (e) {
    $('editUserMsg' + id).textContent = e.message;
  }
}

async function deleteUser(id) {
  if (me?.id === id && !confirm('Estas intentando eliminar tu propio usuario. Si continuas podrias perder acceso. Continuar?')) return;
  if (!confirm('Eliminar este usuario? Esta accion no se puede deshacer.')) return;
  await api(`/api/admin/users/${id}`, { method: 'DELETE' });
  await loadUsers();
}

async function createUser() {
  $('uMsg').textContent = '';
  try {
    await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ name: $('uName').value, email: $('uEmail').value, role: $('uRole').value, password: $('uPass').value }) });
    $('uName').value = '';
    $('uEmail').value = '';
    $('uPass').value = '123456';
    $('uMsg').textContent = 'Usuario creado. Ve a Usuarios para editarlo o revisar la lista completa.';
  } catch (e) {
    $('uMsg').textContent = e.message;
  }
}

boot();
