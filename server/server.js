const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { decodeFrequency, decodeFoodTiming, buildSchedule } = require("./decoder");

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, "data.json");
const PUBLIC_DIR = path.join(__dirname, "..", "public");

app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// --- tiny JSON-file "database" -------------------------------------------
function readDB() {
  if (!fs.existsSync(DB_FILE)) return { prescriptions: {} };
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
  } catch {
    return { prescriptions: {} };
  }
}
function writeDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// --- POST /api/prescriptions ----------------------------------------------
// Accepts one or more medicine entries, decodes each, saves the record,
// returns a shareable id + the fully built schedule.
app.post("/api/prescriptions", (req, res) => {
  const { patientName, startDate, medicines } = req.body || {};

  if (!Array.isArray(medicines) || medicines.length === 0) {
    return res.status(400).json({ ok: false, error: "At least one medicine is required." });
  }

  const decodedMedicines = [];
  for (const med of medicines) {
    const { name, dosageCode, durationDays, instructions } = med || {};
    if (!name || !dosageCode) {
      return res.status(400).json({ ok: false, error: "Each medicine needs a name and a dosage code." });
    }

    const freq = decodeFrequency(dosageCode);
    if (!freq.ok) {
      return res.status(400).json({ ok: false, error: `${name}: ${freq.error}` });
    }

    const schedule = buildSchedule({
      frequency: freq,
      durationDays: durationDays || 1,
      startDate,
    });

    decodedMedicines.push({
      name,
      dosageCode,
      frequencyNote: freq.note,
      asNeeded: freq.asNeeded,
      oneTime: freq.oneTime,
      foodTiming: decodeFoodTiming(instructions),
      durationDays: durationDays || 1,
      schedule,
    });
  }

  const id = crypto.randomBytes(4).toString("hex");
  const record = {
    id,
    patientName: patientName || "",
    startDate: startDate || new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    medicines: decodedMedicines,
  };

  const db = readDB();
  db.prescriptions[id] = record;
  writeDB(db);

  res.json({ ok: true, id, record });
});

// --- GET /api/prescriptions/:id -------------------------------------------
app.get("/api/prescriptions/:id", (req, res) => {
  const db = readDB();
  const record = db.prescriptions[req.params.id];
  if (!record) {
    return res.status(404).json({ ok: false, error: "No prescription found for this code." });
  }
  res.json({ ok: true, record });
});

// --- POST /api/decode-preview ----------------------------------------------
// Lightweight endpoint used for live "as you type" preview on the frontend
// (no save). Decodes a single dosage code.
app.post("/api/decode-preview", (req, res) => {
  const { dosageCode } = req.body || {};
  const freq = decodeFrequency(dosageCode);
  if (!freq.ok) return res.status(400).json({ ok: false, error: freq.error });
  res.json({ ok: true, ...freq });
});

app.get("/api/health", (req, res) => res.json({ ok: true, service: "rx-clear", time: new Date().toISOString() }));

app.listen(PORT, () => {
  console.log(`RxClear server running at http://localhost:${PORT}`);
});
