# 🧾 TicketScan AI – Guía de instalación y uso

## Estructura del proyecto

```
APP Tickets/
├── public/
│   ├── index.html      ← Frontend
│   ├── styles.css      ← Estilos
│   └── app.js          ← Lógica del cliente
├── server.js           ← Backend Node.js
├── package.json
├── .env                ← Variables de entorno (NO subir a git)
└── .env.example        ← Plantilla pública
```

## 1. Requisitos previos
- Node.js LTS → https://nodejs.org

## 2. Instalar dependencias
```powershell
npm install
```

## 3. Configurar .env
```env
OPENAI_API_KEY=sk-...
AIRTABLE_API_KEY=pat...
AIRTABLE_BASE_ID=app...
AIRTABLE_TABLE_NAME=Tickets
PORT=3000
```

## 4. Iniciar
```powershell
npm start
```
Abre http://localhost:3000
