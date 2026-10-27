require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const OpenAI = require('openai');
const Airtable = require('airtable');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Multer: almacenamiento temporal de archivos ─────────────────────────────
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, unique + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Tipo de archivo no permitido. Solo imágenes o PDF.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ─── Clientes API ────────────────────────────────────────────────────────────
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const airtableBase = new Airtable({ apiKey: process.env.AIRTABLE_API_KEY }).base(
  process.env.AIRTABLE_BASE_ID
);
const TABLE_NAME = process.env.AIRTABLE_TABLE_NAME || 'Tickets';

// ─── Función: convertir PDF → imagen base64 (primera página) ─────────────────
async function pdfToBase64Image(filePath) {
  // Para PDFs enviamos el contenido como base64 y dejamos que OpenAI lo procese
  // como documento. OpenAI acepta PDFs nativamente en la API de visión.
  const fileBuffer = fs.readFileSync(filePath);
  return fileBuffer.toString('base64');
}

// ─── Función: extraer datos con OpenAI Vision ────────────────────────────────
async function extractTicketData(filePath, mimeType) {
  const isPDF = mimeType === 'application/pdf';
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');

  const prompt = `Eres un asistente experto en análisis de tickets de compra y facturas.
Analiza la imagen o documento proporcionado y extrae ÚNICAMENTE los siguientes campos en formato JSON estricto:

{
  "nombre_comercio": "nombre del establecimiento o tienda",
  "fecha": "fecha de la compra en formato DD/MM/YYYY",
  "importe_total": "importe total como número decimal (solo el número, sin símbolo de moneda)"
}

REGLAS IMPORTANTES:
- Si no encuentras algún campo, usa null para ese campo
- El importe_total debe ser un número decimal como 12.50 (no texto)
- La fecha debe estar en formato DD/MM/YYYY
- Responde SOLO con el JSON, sin explicaciones adicionales, sin markdown, sin bloques de código`;

  let response;

  if (isPDF) {
    // Para PDFs usamos el endpoint de archivos de OpenAI
    response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:application/pdf;base64,${base64Data}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });
  } else {
    response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt,
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Data}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 500,
    });
  }

  const rawText = response.choices[0].message.content.trim();

  // Limpiar posibles envoltorios markdown
  const cleaned = rawText.replace(/```json\n?/gi, '').replace(/```\n?/gi, '').trim();

  try {
    const parsed = JSON.parse(cleaned);
    return {
      nombre_comercio: parsed.nombre_comercio || null,
      fecha: parsed.fecha || null,
      importe_total: parsed.importe_total !== undefined ? Number(parsed.importe_total) : null,
    };
  } catch {
    throw new Error(`No se pudo parsear la respuesta de OpenAI: ${cleaned}`);
  }
}

// ─── Función: normalizar fecha a formato ISO (YYYY-MM-DD) para Airtable ──────
function normalizeDateToISO(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const trimmed = dateStr.trim();
  if (!trimmed) return null;

  // Si ya está en YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  // DD/MM/YYYY o DD-MM-YYYY
  const dmyMatch = trimmed.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})$/);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }

  // Si viene en otro formato reconocible por Date
  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) {
    const d = new Date(parsed);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  return trimmed;
}

// ─── Función: guardar en Airtable ────────────────────────────────────────────
async function saveToAirtable(data) {
  const fields = {};

  if (data.nombre_comercio) fields['NombreComercio'] = data.nombre_comercio;
  if (data.fecha) {
    const isoDate = normalizeDateToISO(data.fecha);
    if (isoDate) fields['Fecha'] = isoDate;
  }
  if (data.importe_total !== null && data.importe_total !== undefined && data.importe_total !== '') {
    fields['ImporteTotal'] = Number(data.importe_total);
  }

  return new Promise((resolve, reject) => {
    airtableBase(TABLE_NAME).create([{ fields }], (err, records) => {
      if (err) return reject(err);
      resolve(records[0].getId());
    });
  });
}

// ─── Endpoint: procesar ticket ────────────────────────────────────────────────
app.post('/api/procesar-ticket', upload.single('ticket'), async (req, res) => {
  let filePath = null;

  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No se ha subido ningún archivo.' });
    }

    filePath = req.file.path;
    const mimeType = req.file.mimetype;

    console.log(`[INFO] Procesando: ${req.file.originalname} (${mimeType})`);

    const datos = await extractTicketData(filePath, mimeType);

    console.log('[INFO] Datos extraídos:', datos);

    res.json({ success: true, datos });
  } catch (err) {
    console.error('[ERROR] /api/procesar-ticket:', err.message);
    res.status(500).json({ error: err.message || 'Error procesando el ticket.' });
  } finally {
    // Limpiar archivo temporal
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
});

// ─── Endpoint: confirmar y guardar en Airtable ────────────────────────────────
app.post('/api/guardar-ticket', async (req, res) => {
  try {
    const { nombre_comercio, fecha, importe_total } = req.body;

    if (!nombre_comercio && !fecha && importe_total === undefined) {
      return res.status(400).json({ error: 'No hay datos para guardar.' });
    }

    const recordId = await saveToAirtable({ nombre_comercio, fecha, importe_total });

    console.log(`[INFO] Guardado en Airtable. Record ID: ${recordId}`);

    res.json({
      success: true,
      message: 'Ticket guardado correctamente en Airtable.',
      recordId,
    });
  } catch (err) {
    console.error('[ERROR] /api/guardar-ticket:', err.message);
    res.status(500).json({ error: err.message || 'Error guardando en Airtable.' });
  }
});

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    openai: !!process.env.OPENAI_API_KEY,
    airtable: !!process.env.AIRTABLE_API_KEY && !!process.env.AIRTABLE_BASE_ID,
  });
});

// ─── Iniciar servidor ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅ Servidor iniciado en http://localhost:${PORT}`);
  console.log(`   OpenAI API:  ${process.env.OPENAI_API_KEY ? '✔ Configurada' : '✗ FALTA'}`);
  console.log(`   Airtable:    ${process.env.AIRTABLE_API_KEY ? '✔ Configurada' : '✗ FALTA'}`);
  console.log(`   Base ID:     ${process.env.AIRTABLE_BASE_ID || 'NO CONFIGURADA'}`);
  console.log(`   Tabla:       ${TABLE_NAME}\n`);
});
