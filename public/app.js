/* ═══════════════════════════════════════════════════════════════
   TicketScan AI – app.js
   Controla el flujo completo: upload → procesado → validación → Airtable
   ═══════════════════════════════════════════════════════════════ */

// ── Año en footer ────────────────────────────────────────────────────────────
document.getElementById('year').textContent = new Date().getFullYear();

// ── Elementos del DOM ────────────────────────────────────────────────────────
const dropZone       = document.getElementById('drop-zone');
const fileInput      = document.getElementById('ticket-file');
const btnProcess     = document.getElementById('btn-process');
const uploadForm     = document.getElementById('upload-form');

const previewArea    = document.getElementById('preview-area');
const previewFile    = document.getElementById('preview-file');
const previewIcon    = document.getElementById('preview-icon');
const previewName    = document.getElementById('preview-name');
const previewSize    = document.getElementById('preview-size');
const previewRemove  = document.getElementById('preview-remove');
const previewImg     = document.getElementById('preview-img');

const stepUpload     = document.getElementById('step-upload');
const stepLoading    = document.getElementById('step-loading');
const stepResults    = document.getElementById('step-results');
const stepSuccess    = document.getElementById('step-success');

const loadingSub     = document.getElementById('loading-sub');
const ls1            = document.getElementById('ls-1');
const ls2            = document.getElementById('ls-2');
const ls3            = document.getElementById('ls-3');

const fieldComercio  = document.getElementById('field-comercio');
const fieldFecha     = document.getElementById('field-fecha');
const fieldImporte   = document.getElementById('field-importe');

const confidencePct  = document.getElementById('confidence-pct');
const confidenceFill = document.getElementById('confidence-fill');

const btnRetry       = document.getElementById('btn-retry');
const btnSave        = document.getElementById('btn-save');
const btnNew         = document.getElementById('btn-new');

const errorBanner    = document.getElementById('error-banner');
const errorMsg       = document.getElementById('error-msg');
const errorClose     = document.getElementById('error-close');
const successRecord  = document.getElementById('success-record');

// ── Estado ───────────────────────────────────────────────────────────────────
let selectedFile = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}

function getFileIcon(mime) {
  if (mime === 'application/pdf') return '📄';
  if (mime.startsWith('image/')) return '🖼️';
  return '📎';
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorBanner.hidden = false;
  errorBanner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideError() { errorBanner.hidden = true; }

function showStep(step) {
  stepUpload.hidden  = (step !== 'upload');
  stepLoading.hidden = (step !== 'loading');
  stepResults.hidden = (step !== 'results');
  stepSuccess.hidden = (step !== 'success');
}

function setLoadingStep(active) {
  // active: 1, 2, 3
  [ls1, ls2, ls3].forEach((el, i) => {
    const dot = el.querySelector('.ls-dot');
    const n = i + 1;
    if (n < active) {
      dot.className = 'ls-dot done';
      el.classList.add('active');
    } else if (n === active) {
      dot.className = 'ls-dot active';
      el.classList.add('active');
    } else {
      dot.className = 'ls-dot';
      el.classList.remove('active');
    }
  });
}

// ── Gestión de archivo seleccionado ─────────────────────────────────────────
function handleFileSelected(file) {
  if (!file) return;

  const allowed = ['image/jpeg','image/png','image/webp','image/gif','application/pdf'];
  if (!allowed.includes(file.type)) {
    showError('Tipo de archivo no admitido. Usa JPG, PNG, WEBP, GIF o PDF.');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    showError('El archivo supera el límite de 20 MB.');
    return;
  }

  hideError();
  selectedFile = file;

  previewName.textContent = file.name;
  previewSize.textContent = formatFileSize(file.size);
  previewIcon.textContent = getFileIcon(file.type);
  previewArea.hidden = false;

  // Vista previa de imagen
  if (file.type.startsWith('image/')) {
    const reader = new FileReader();
    reader.onload = (e) => {
      previewImg.src = e.target.result;
      previewImg.hidden = false;
    };
    reader.readAsDataURL(file);
  } else {
    previewImg.hidden = true;
    previewImg.src = '';
  }

  btnProcess.disabled = false;
}

function clearFile() {
  selectedFile = null;
  fileInput.value = '';
  previewArea.hidden = true;
  previewImg.hidden = true;
  previewImg.src = '';
  btnProcess.disabled = true;
  hideError();
}

// ── Eventos de archivo ───────────────────────────────────────────────────────
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) handleFileSelected(fileInput.files[0]);
});

previewRemove.addEventListener('click', clearFile);

// Drag & drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) {
    // Asignar al input para FormData
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
    handleFileSelected(file);
  }
});

// Accesibilidad teclado en drop-zone
dropZone.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fileInput.click();
  }
});

// ── Procesar ticket ──────────────────────────────────────────────────────────
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!selectedFile) return;

  hideError();
  showStep('loading');

  // Animación de pasos de carga
  setLoadingStep(1);
  loadingSub.textContent = 'Enviando imagen a GPT-4o Vision…';

  const formData = new FormData();
  formData.append('ticket', selectedFile);

  // Paso 2 con delay simulado para UX
  const step2Timer = setTimeout(() => {
    setLoadingStep(2);
    loadingSub.textContent = 'Extrayendo datos del ticket…';
  }, 1200);

  try {
    const response = await fetch('/api/procesar-ticket', {
      method: 'POST',
      body: formData,
    });

    clearTimeout(step2Timer);
    setLoadingStep(3);
    loadingSub.textContent = 'Preparando resultados…';

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Error del servidor (${response.status})`);
    }

    // Pequeña pausa para que el paso 3 se vea
    await new Promise(r => setTimeout(r, 600));

    populateResults(data.datos);
    showStep('results');

  } catch (err) {
    showStep('upload');
    showError(err.message || 'Error de conexión con el servidor.');
    console.error(err);
  }
});

// ── Poblar campos de resultados ──────────────────────────────────────────────
function populateResults(datos) {
  fieldComercio.value = datos.nombre_comercio ?? '';
  fieldFecha.value    = datos.fecha ?? '';
  fieldImporte.value  = datos.importe_total !== null && datos.importe_total !== undefined
    ? datos.importe_total
    : '';

  // Calcular "confianza" basada en campos encontrados
  const found = [datos.nombre_comercio, datos.fecha, datos.importe_total]
    .filter(v => v !== null && v !== undefined && v !== '').length;
  const pct = Math.round((found / 3) * 100);

  confidencePct.textContent = pct + '%';
  // Forzar reflow para animación
  confidenceFill.style.width = '0%';
  requestAnimationFrame(() => {
    setTimeout(() => { confidenceFill.style.width = pct + '%'; }, 50);
  });

  // Color de confianza
  confidenceFill.style.background =
    pct === 100 ? 'linear-gradient(90deg, #007A33, #005a26)' :
    pct >= 66   ? 'linear-gradient(90deg, #CC0000, #007A33)' :
                  'linear-gradient(90deg, #f59e0b, #CC0000)';
}

// ── Guardar en Airtable ──────────────────────────────────────────────────────
btnSave.addEventListener('click', async () => {
  hideError();

  const payload = {
    nombre_comercio: fieldComercio.value.trim() || null,
    fecha:           fieldFecha.value.trim() || null,
    importe_total:   fieldImporte.value !== '' ? parseFloat(fieldImporte.value) : null,
  };

  if (!payload.nombre_comercio && !payload.fecha && payload.importe_total === null) {
    showError('Debes rellenar al menos un campo antes de guardar.');
    return;
  }

  btnSave.disabled = true;
  btnSave.innerHTML = '<span class="btn-icon">⏳</span> Guardando…';

  try {
    const response = await fetch('/api/guardar-ticket', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `Error del servidor (${response.status})`);
    }

    successRecord.textContent = `Record ID: ${data.recordId}`;
    showStep('success');

  } catch (err) {
    showError(err.message || 'No se pudo guardar en Airtable.');
    console.error(err);
  } finally {
    btnSave.disabled = false;
    btnSave.innerHTML = '<span class="btn-icon">☁️</span> Guardar en Airtable';
  }
});

// ── Reiniciar ────────────────────────────────────────────────────────────────
function resetAll() {
  clearFile();
  hideError();
  fieldComercio.value = '';
  fieldFecha.value    = '';
  fieldImporte.value  = '';
  confidencePct.textContent = '—';
  confidenceFill.style.width = '0%';
  showStep('upload');
}

btnRetry.addEventListener('click', resetAll);
btnNew.addEventListener('click', resetAll);
errorClose.addEventListener('click', hideError);
