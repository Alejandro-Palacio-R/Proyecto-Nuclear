let token = localStorage.getItem('token'), me = null, students = [], sessionCases = [];
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
    $('welcome').textContent = `Hola, ${me.name} (${me.role})`;
    $('adminBtn').style.display = me.role === 'ADMIN' ? 'inline-block' : 'none';
    $('adminPanel').classList.toggle('hidden', me.role !== 'ADMIN');
    $('teacherPanel').classList.toggle('hidden', !(me.role === 'PROFESOR' || me.role === 'ADMIN'));
    $('studentPanel').classList.toggle('hidden', me.role !== 'ESTUDIANTE');
    loadCases();
  } catch (e) {
    localStorage.removeItem('token');
  }
}

function show(title, html) {
  $('output').innerHTML = `<h3>${title}</h3>${html}`;
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
  show('Casos', rows.map(c => `<div class=item>
    <b>#${c.id} ${c.title}</b> <span class=badge>${c.difficulty || ''}</span>
    <p>${c.description || ''}</p><small>${c.category || ''}</small>
    ${me.role !== 'ESTUDIANTE' ? `<div class="case-actions">
      <button onclick="openBuilder(${c.id})">Diseñar bloques</button>
      ${me.role === 'ADMIN' ? `<button onclick="startCaseAsAdmin(${c.id})">Resolver caso</button>` : ''}
      <button class="danger-btn" onclick="deleteCase(${c.id})">Borrar caso</button>
      <select id="assign${c.id}" multiple size="5">${studentOptions()}</select>
      <button onclick="assignStudents(${c.id})">Asignar seleccionados</button>
    </div>` : ''}
  </div>`).join('') || 'Sin casos');
}

async function createCase() {
  await api('/api/cases', {
    method: 'POST',
    body: JSON.stringify({ title: $('caseTitle').value, description: $('caseDesc').value, category: $('caseCategory').value, difficulty: $('caseDifficulty').value })
  });
  loadCases();
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
    loadCases();
  } catch (e) {
    $('importMsg').textContent = e.message;
  }
}

async function assignStudents(id) {
  const selected = [...$('assign' + id).selectedOptions].map(o => Number(o.value));
  if (!selected.length) { alert('Selecciona al menos un estudiante'); return; }
  const assigned = await api(`/api/cases/${id}/assign-students`, { method: 'POST', body: JSON.stringify({ studentIds: selected }) });
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
      <b>#${a.id} ${a.caseStudy.title}</b><p>${a.caseStudy.description}</p>
      <button onclick="startAssignment(${a.id},${a.caseStudy.id})">Resolver caso</button>
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
    await api(`/api/student/assignments/${activeAssignment}/submit`, { method: 'POST', body: JSON.stringify({}) });
    alert('Entrega enviada');
    loadSubmissions();
  } catch (e) {
    show('Sesion en vivo', `<p class="error-text">No se pudo enviar la entrega.</p><pre>${esc(e.message)}</pre>`);
  }
}
async function loadSubmissions() {
  const path = me.role === 'ESTUDIANTE' ? '/api/student/submissions' : '/api/teacher/submissions';
  const rows = await api(path);
  show('Entregas', rows.map(s => `<div class=item><b>#${s.id} ${s.student?.name || ''}</b><p>${s.analysisText || ''}</p><p>Estado: ${s.status} | Puntaje: ${s.autoScore} | Nota: ${s.grade ?? 'sin nota'}</p>${me.role !== 'ESTUDIANTE' ? `<input id="g${s.id}" placeholder="nota"><input id="f${s.id}" placeholder="retroalimentación"><button onclick="grade(${s.id})">Calificar</button>` : `<p>${s.feedback || ''}</p>`}</div>`).join('') || 'Sin entregas');
}

async function grade(id) {
  await api(`/api/teacher/submissions/${id}/grade`, { method: 'PUT', body: JSON.stringify({ grade: $('g' + id).value, feedback: $('f' + id).value }) });
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
    return `<div class=item><b>${esc(p.name || p.email)}</b><p>${esc(p.email)}</p><span class=badge>${progress}</span></div>`;
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
      show('Sesion finalizada', '<p>El tiempo de la sesion termino.</p>');
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
  show('Usuarios', rows.map(u => `<div class=item>#${u.id} <b>${u.name}</b> ${u.email} <span class=badge>${u.role}</span></div>`).join(''));
}

async function createUser() {
  await api('/api/admin/users', { method: 'POST', body: JSON.stringify({ name: $('uName').value, email: $('uEmail').value, role: $('uRole').value, password: $('uPass').value }) });
  loadUsers();
}

boot();


