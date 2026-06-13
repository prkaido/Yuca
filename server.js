const fs = require("node:fs");
const path = require("node:path");

const dotenv = require("dotenv");
const express = require("express");
const { DIAGNOSTICO1_ITEMS } = require("./instrumentos");

dotenv.config();

const app = express();
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const dataDir = path.join(rootDir, "data");
const dbPath = path.join(dataDir, "server-yuca.sqlite");
const port = Number(process.env.PORT || 3000);

let store;
let server;
let ngrokListener;

app.disable("x-powered-by");
app.use(express.json({ limit: "1mb", type: ["application/json", "text/plain"] }));
app.use(express.urlencoded({ extended: false }));
app.use(express.static(publicDir));

app.get("/diagnostico1", (_req, res) => {
  res.sendFile(path.join(rootDir, "diagnostico1.html"));
});

app.get("/diagnostico1.html", (_req, res) => {
  res.sendFile(path.join(rootDir, "diagnostico1.html"));
});

app.get("/diagnostico2", (_req, res) => {
  res.sendFile(path.join(rootDir, "diagnostico2.html"));
});

app.get("/diagnostico2.html", (_req, res) => {
  res.sendFile(path.join(rootDir, "diagnostico2.html"));
});

app.get("/api/health", asyncHandler(async (_req, res) => {
  res.json({
    ok: true,
    app: "server-yuca-4",
    db: store.type,
    storage: store.location,
    uptimeSeconds: Math.round(process.uptime())
  });
}));

app.get("/api/resumen", asyncHandler(async (_req, res) => {
  const row = await store.resumen();

  res.json({
    ok: true,
    total: row.total || 0,
    diagnostico1: row.diagnostico1 || 0,
    diagnostico2: row.diagnostico2 || 0
  });
}));

app.get("/api/diagnosticos", asyncHandler(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 500);
  res.json({ ok: true, data: await store.list(limit) });
}));

app.get("/api/diagnosticos.csv", asyncHandler(async (_req, res) => {
  const rows = await store.list(5000);
  const header = ["id", "idEnvio", "tipo", "nombre", "totalPreguntas", "createdAt"];
  const csv = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvValue(row[key])).join(","))
  ].join("\n");

  res.header("Content-Type", "text/csv; charset=utf-8");
  res.attachment("diagnosticos-yuca.csv");
  res.send(csv);
}));

app.get("/api/export/resumen.csv", asyncHandler(async (_req, res) => {
  const records = await getFullRecords();
  sendCsv(res, "analisis-yuca-resumen.csv", buildSummaryRows(records), [
    "id",
    "nombre",
    "tipo",
    "fecha",
    "respondidas",
    "puntajeAjustado",
    "puntajeMaximo",
    "promedio",
    "porcentaje",
    "nivel"
  ]);
}));

app.get("/api/export/detalle.csv", asyncHandler(async (_req, res) => {
  const records = await getFullRecords();
  sendCsv(res, "analisis-yuca-detalle-preguntas.csv", buildDetailRows(records), [
    "id",
    "nombre",
    "tipo",
    "fecha",
    "numeroPregunta",
    "seccion",
    "dimension",
    "preguntaInversa",
    "respuestaOriginal",
    "puntajeAjustado",
    "pregunta"
  ]);
}));

app.get("/api/export/secciones.csv", asyncHandler(async (_req, res) => {
  const records = await getFullRecords();
  sendCsv(res, "analisis-yuca-por-seccion.csv", buildGroupRows(records, "seccion"), [
    "id",
    "nombre",
    "grupo",
    "preguntas",
    "puntajeAjustado",
    "puntajeMaximo",
    "promedio",
    "porcentaje",
    "nivel"
  ]);
}));

app.get("/api/export/dimensiones.csv", asyncHandler(async (_req, res) => {
  const records = await getFullRecords();
  sendCsv(res, "analisis-yuca-por-dimension.csv", buildGroupRows(records, "dimension"), [
    "id",
    "nombre",
    "grupo",
    "preguntas",
    "puntajeAjustado",
    "puntajeMaximo",
    "promedio",
    "porcentaje",
    "nivel"
  ]);
}));

app.get("/api/export/matriz.csv", asyncHandler(async (_req, res) => {
  const records = await getFullRecords();
  const maxQuestions = Math.max(
    65,
    ...records.map((record) => Math.max(
      0,
      ...Object.keys(parseStoredAnswers(record.respuestas)).map((key) => Number(key) + 1)
    ))
  );
  const questionHeaders = Array.from({ length: maxQuestions }, (_item, index) => `P${index + 1}`);
  const header = ["id", "nombre", "tipo", "fecha", ...questionHeaders];
  const rows = records.map((record) => {
    const answers = parseStoredAnswers(record.respuestas);
    const row = {
      id: record.id,
      nombre: record.nombre,
      tipo: record.tipo,
      fecha: record.createdAt
    };

    for (let i = 0; i < maxQuestions; i += 1) {
      row[`P${i + 1}`] = answers[String(i)] ?? "";
    }

    return row;
  });

  sendCsv(res, "analisis-yuca-matriz-respuestas.csv", rows, header);
}));

app.get("/api/diagnosticos/:id", asyncHandler(async (req, res) => {
  const row = await store.get(Number(req.params.id));

  if (!row) {
    res.status(404).json({ ok: false, error: "Diagnostico no encontrado" });
    return;
  }

  res.json({
    ok: true,
    data: {
      ...row,
      respuestas: parseStoredAnswers(row.respuestas)
    }
  });
}));

app.post("/api/diagnosticos", asyncHandler(async (req, res) => {
  const body = req.body || {};
  const idEnvio = String(body.idEnvio || body.id_envio || "").trim();
  const tipo = String(body.tipo || "general").trim();
  const nombre = String(body.nombre || "").trim();
  const respuestas = normalizeAnswers(body.respuestas);

  if (!idEnvio || !nombre || !respuestas) {
    res.status(400).json({
      ok: false,
      error: "Faltan idEnvio, nombre o respuestas"
    });
    return;
  }

  await store.insert({
    idEnvio,
    tipo,
    nombre,
    respuestas,
    totalPreguntas: Object.keys(respuestas).length
  });

  res.json({
    ok: true,
    idEnvio,
    tipo,
    totalPreguntas: Object.keys(respuestas).length
  });
}));

app.use((_req, res) => {
  res.status(404).json({ ok: false, error: "Ruta no encontrada" });
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({
    ok: false,
    error: "Error interno del servidor"
  });
});

start().catch((error) => {
  console.error("No se pudo iniciar el servidor.");
  console.error(error);
  process.exit(1);
});

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function start() {
  store = await createStore();

  server = app.listen(port, async () => {
    console.log(`Servidor listo en http://localhost:${port}`);
    console.log(`Base de datos: ${store.type} (${store.location})`);
    await maybeStartNgrok(port);
  });
}

async function createStore() {
  if (process.env.DATABASE_URL) {
    return createPostgresStore(process.env.DATABASE_URL);
  }

  return createSqliteStore();
}

async function createPostgresStore(connectionString) {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString,
    ssl: getPostgresSslConfig(connectionString)
  });

  await pool.query(`
    CREATE TABLE IF NOT EXISTS diagnosticos (
      id INTEGER GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
      id_envio TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      respuestas JSONB NOT NULL,
      total_preguntas INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_diagnosticos_created_at
      ON diagnosticos(created_at DESC);
  `);

  return {
    type: "postgres",
    location: "DATABASE_URL",
    async resumen() {
      const { rows } = await pool.query(`
        SELECT
          COUNT(*)::int AS total,
          COALESCE(SUM(CASE WHEN tipo = 'diagnostico1' THEN 1 ELSE 0 END), 0)::int AS "diagnostico1",
          COALESCE(SUM(CASE WHEN tipo = 'diagnostico2' THEN 1 ELSE 0 END), 0)::int AS "diagnostico2"
        FROM diagnosticos
      `);

      return rows[0];
    },
    async list(limit) {
      const { rows } = await pool.query(`
        SELECT
          id,
          id_envio AS "idEnvio",
          tipo,
          nombre,
          total_preguntas AS "totalPreguntas",
          created_at AS "createdAt"
        FROM diagnosticos
        ORDER BY id DESC
        LIMIT $1
      `, [limit]);

      return rows.map(normalizeRowDates);
    },
    async get(id) {
      const { rows } = await pool.query(`
        SELECT
          id,
          id_envio AS "idEnvio",
          tipo,
          nombre,
          respuestas,
          total_preguntas AS "totalPreguntas",
          created_at AS "createdAt"
        FROM diagnosticos
        WHERE id = $1
      `, [id]);

      return rows[0] ? normalizeRowDates(rows[0]) : null;
    },
    async insert({ idEnvio, tipo, nombre, respuestas, totalPreguntas }) {
      await pool.query(`
        INSERT INTO diagnosticos (
          id_envio,
          tipo,
          nombre,
          respuestas,
          total_preguntas
        ) VALUES ($1, $2, $3, $4::jsonb, $5)
        ON CONFLICT(id_envio) DO UPDATE SET
          tipo = excluded.tipo,
          nombre = excluded.nombre,
          respuestas = excluded.respuestas,
          total_preguntas = excluded.total_preguntas
      `, [
        idEnvio,
        tipo,
        nombre,
        JSON.stringify(respuestas),
        totalPreguntas
      ]);
    },
    async close() {
      await pool.end();
    }
  };
}

function createSqliteStore() {
  fs.mkdirSync(dataDir, { recursive: true });

  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS diagnosticos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      id_envio TEXT NOT NULL UNIQUE,
      tipo TEXT NOT NULL,
      nombre TEXT NOT NULL,
      respuestas TEXT NOT NULL,
      total_preguntas INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_diagnosticos_created_at
      ON diagnosticos(created_at DESC);
  `);

  const insertDiagnostico = db.prepare(`
    INSERT INTO diagnosticos (
      id_envio,
      tipo,
      nombre,
      respuestas,
      total_preguntas
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id_envio) DO UPDATE SET
      tipo = excluded.tipo,
      nombre = excluded.nombre,
      respuestas = excluded.respuestas,
      total_preguntas = excluded.total_preguntas
  `);

  const listDiagnosticos = db.prepare(`
    SELECT
      id,
      id_envio AS idEnvio,
      tipo,
      nombre,
      total_preguntas AS totalPreguntas,
      created_at AS createdAt
    FROM diagnosticos
    ORDER BY id DESC
    LIMIT ?
  `);

  const getDiagnostico = db.prepare(`
    SELECT
      id,
      id_envio AS idEnvio,
      tipo,
      nombre,
      respuestas,
      total_preguntas AS totalPreguntas,
      created_at AS createdAt
    FROM diagnosticos
    WHERE id = ?
  `);

  const resumenDiagnosticos = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN tipo = 'diagnostico1' THEN 1 ELSE 0 END) AS diagnostico1,
      SUM(CASE WHEN tipo = 'diagnostico2' THEN 1 ELSE 0 END) AS diagnostico2
    FROM diagnosticos
  `);

  return {
    type: "sqlite",
    location: dbPath,
    async resumen() {
      return resumenDiagnosticos.get();
    },
    async list(limit) {
      return listDiagnosticos.all(limit);
    },
    async get(id) {
      return getDiagnostico.get(id) || null;
    },
    async insert({ idEnvio, tipo, nombre, respuestas, totalPreguntas }) {
      insertDiagnostico.run(
        idEnvio,
        tipo,
        nombre,
        JSON.stringify(respuestas),
        totalPreguntas
      );
    },
    async close() {
      db.close();
    }
  };
}

function getPostgresSslConfig(connectionString) {
  const sslMode = String(process.env.PGSSLMODE || "").toLowerCase();

  if (sslMode === "disable" || process.env.DATABASE_SSL === "false") {
    return false;
  }

  if (sslMode === "require" || process.env.DATABASE_SSL === "true") {
    return { rejectUnauthorized: false };
  }

  if (/localhost|127\.0\.0\.1/.test(connectionString)) {
    return false;
  }

  return undefined;
}

function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function normalizeAnswers(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value;
}

function parseStoredAnswers(value) {
  if (typeof value === "string") {
    return JSON.parse(value);
  }

  return value;
}

function normalizeRowDates(row) {
  if (row.createdAt instanceof Date) {
    return {
      ...row,
      createdAt: row.createdAt.toISOString()
    };
  }

  return row;
}

function csvValue(value) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

async function getFullRecords() {
  const rows = await store.list(5000);
  const records = [];

  for (const row of rows) {
    const record = await store.get(row.id);

    if (record) {
      records.push(record);
    }
  }

  return records;
}

function buildSummaryRows(records) {
  return records.map((record) => {
    const analysis = analyzeRecord(record);

    return {
      id: record.id,
      nombre: record.nombre,
      tipo: record.tipo,
      fecha: record.createdAt,
      respondidas: analysis.respondidas,
      puntajeAjustado: analysis.puntajeAjustado,
      puntajeMaximo: analysis.puntajeMaximo,
      promedio: analysis.promedio,
      porcentaje: analysis.porcentaje,
      nivel: analysis.nivel
    };
  });
}

function buildDetailRows(records) {
  return records.flatMap((record) => analyzeRecord(record).detalle);
}

function buildGroupRows(records, groupKey) {
  return records.flatMap((record) => {
    const groups = new Map();

    for (const detail of analyzeRecord(record).detalle) {
      if (!detail.puntajeAjustado) {
        continue;
      }

      const groupName = detail[groupKey] || "Sin clasificar";
      const current = groups.get(groupName) || {
        id: record.id,
        nombre: record.nombre,
        grupo: groupName,
        preguntas: 0,
        puntajeAjustado: 0,
        puntajeMaximo: 0
      };

      current.preguntas += 1;
      current.puntajeAjustado += Number(detail.puntajeAjustado);
      current.puntajeMaximo += 5;
      groups.set(groupName, current);
    }

    return Array.from(groups.values()).map((row) => {
      const porcentaje = row.puntajeMaximo ? round2((row.puntajeAjustado / row.puntajeMaximo) * 100) : 0;

      return {
        ...row,
        promedio: row.preguntas ? round2(row.puntajeAjustado / row.preguntas) : 0,
        porcentaje,
        nivel: scoreLevel(porcentaje)
      };
    });
  });
}

function analyzeRecord(record) {
  const answers = parseStoredAnswers(record.respuestas);

  if (record.tipo !== "diagnostico1") {
    const detail = Object.keys(answers)
      .sort((a, b) => Number(a) - Number(b))
      .map((key) => ({
        id: record.id,
        nombre: record.nombre,
        tipo: record.tipo,
        fecha: record.createdAt,
        numeroPregunta: Number(key) + 1,
        seccion: "",
        dimension: "",
        preguntaInversa: "",
        respuestaOriginal: answers[key],
        puntajeAjustado: "",
        pregunta: ""
      }));

    return {
      respondidas: detail.length,
      puntajeAjustado: "",
      puntajeMaximo: "",
      promedio: "",
      porcentaje: "",
      nivel: "Sin puntaje",
      detalle: detail
    };
  }

  const detail = DIAGNOSTICO1_ITEMS
    .filter((item) => answers[String(item.numero - 1)] !== undefined)
    .map((item) => {
      const raw = Number(answers[String(item.numero - 1)]);
      const adjusted = item.inversa ? 6 - raw : raw;

      return {
        id: record.id,
        nombre: record.nombre,
        tipo: record.tipo,
        fecha: record.createdAt,
        numeroPregunta: item.numero,
        seccion: item.seccion,
        dimension: item.dimension,
        preguntaInversa: item.inversa ? "si" : "no",
        respuestaOriginal: raw,
        puntajeAjustado: adjusted,
        pregunta: item.pregunta
      };
    });
  const puntajeAjustado = detail.reduce((total, item) => total + item.puntajeAjustado, 0);
  const puntajeMaximo = detail.length * 5;
  const porcentaje = puntajeMaximo ? round2((puntajeAjustado / puntajeMaximo) * 100) : 0;

  return {
    respondidas: detail.length,
    puntajeAjustado,
    puntajeMaximo,
    promedio: detail.length ? round2(puntajeAjustado / detail.length) : 0,
    porcentaje,
    nivel: scoreLevel(porcentaje),
    detalle: detail
  };
}

function sendCsv(res, filename, rows, header) {
  const csv = [
    header.join(","),
    ...rows.map((row) => header.map((key) => csvValue(row[key])).join(","))
  ].join("\n");

  res.header("Content-Type", "text/csv; charset=utf-8");
  res.attachment(filename);
  res.send(`\uFEFF${csv}`);
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

function scoreLevel(percent) {
  if (percent >= 85) {
    return "Alto";
  }

  if (percent >= 70) {
    return "Medio-alto";
  }

  if (percent >= 55) {
    return "Medio";
  }

  if (percent >= 40) {
    return "Bajo-medio";
  }

  return "Bajo";
}

async function maybeStartNgrok(localPort) {
  const wantsNgrok =
    process.argv.includes("--ngrok") ||
    String(process.env.NGROK_ENABLED || "").toLowerCase() === "true";

  if (!wantsNgrok) {
    console.log("Ngrok desactivado. Usa: npm.cmd run tunnel");
    return;
  }

  try {
    const ngrok = await import("@ngrok/ngrok");
    const forward = ngrok.forward || ngrok.default?.forward;

    if (!forward) {
      throw new Error("No se encontro la funcion ngrok.forward");
    }

    const options = {
      addr: localPort,
      authtoken_from_env: true
    };

    if (process.env.NGROK_DOMAIN) {
      options.domain = process.env.NGROK_DOMAIN;
    }

    ngrokListener = await forward(options);
    console.log(`Ngrok publico: ${ngrokListener.url()}`);
  } catch (error) {
    console.error("Ngrok no pudo iniciar.");
    console.error("Configura NGROK_AUTHTOKEN en .env y vuelve a ejecutar npm.cmd run tunnel.");
    console.error(error.message);
  }
}

function shutdown() {
  if (!server) {
    process.exit(0);
  }

  server.close(async () => {
    try {
      if (ngrokListener?.close) {
        await ngrokListener.close();
      }

      if (store?.close) {
        await store.close();
      }
    } finally {
      process.exit(0);
    }
  });
}
