// test-airtable.js — Script de prueba de conexión con Airtable
require('dotenv').config();
const Airtable = require('airtable');

const TOKEN   = process.env.AIRTABLE_API_KEY;
const BASE_ID = process.env.AIRTABLE_BASE_ID;
const TABLE   = process.env.AIRTABLE_TABLE_NAME;

console.log('\n🔍 Probando conexión con Airtable...');
console.log(`   Token:   ${TOKEN.slice(0,18)}...`);
console.log(`   Base ID: ${BASE_ID}`);
console.log(`   Tabla:   ${TABLE}\n`);

const base = new Airtable({ apiKey: TOKEN }).base(BASE_ID);

// 1. Test de LECTURA
base(TABLE).select({ maxRecords: 1 }).firstPage((err, records) => {
  if (err) {
    console.error('❌ Error de LECTURA:', err.message);
    process.exit(1);
  }
  console.log(`✅ Lectura OK — ${records.length} registro(s) leídos`);

  // 2. Test de ESCRITURA
  console.log('\n📝 Probando escritura de registro de test...');
  base(TABLE).create([{
    fields: {
      NombreComercio: 'TEST_CONEXION',
      Fecha: '2024-10-27',
      ImporteTotal: 0.01
    }
  }], (err2, newRecords) => {
    if (err2) {
      console.error('❌ Error de ESCRITURA:', err2.message);
      process.exit(1);
    }
    const id = newRecords[0].getId();
    console.log(`✅ Escritura OK — Record creado: ${id}`);

    // 3. Borrar el registro de test
    base(TABLE).destroy([id], (err3) => {
      if (err3) {
        console.warn('⚠️  No se pudo borrar el registro de test:', err3.message);
      } else {
        console.log(`🗑️  Registro de test eliminado correctamente`);
      }
      console.log('\n🎉 ¡Conexión con Airtable funciona perfectamente!\n');
    });
  });
});
