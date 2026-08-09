// decoder.js — converts standard prescription shorthand into a plain-language
// dose schedule. This is deliberately rule-based (not ML) so it is transparent,
// auditable, and never guesses at a dosage.

// Default clock times used to render a schedule. In a future version these
// would be user-editable per patient (e.g. shift workers).
const SLOT_TIMES = {
  morning: "08:00",
  afternoon: "14:00",
  evening: "18:00",
  night: "21:00",
  bedtime: "22:00",
};

const SLOT_LABELS = {
  morning: "Morning",
  afternoon: "Afternoon",
  evening: "Evening",
  night: "Night",
  bedtime: "Bedtime",
};

// Known shorthand codes → which slots they fire in plain English.
// Keys are normalized (uppercase, no periods/spaces) before lookup.
const CODE_MAP = {
  OD: { slots: ["morning"], note: "Once a day" },
  QD: { slots: ["morning"], note: "Once a day" },
  BD: { slots: ["morning", "night"], note: "Twice a day" },
  BID: { slots: ["morning", "night"], note: "Twice a day" },
  TDS: { slots: ["morning", "afternoon", "night"], note: "Three times a day" },
  TID: { slots: ["morning", "afternoon", "night"], note: "Three times a day" },
  QID: { slots: ["morning", "afternoon", "evening", "night"], note: "Four times a day" },
  QDS: { slots: ["morning", "afternoon", "evening", "night"], note: "Four times a day" },
  HS: { slots: ["bedtime"], note: "At bedtime" },
  ON: { slots: ["night"], note: "Every night" },
  SOS: { slots: [], note: "As needed — take only when the symptom occurs", asNeeded: true },
  PRN: { slots: [], note: "As needed — take only when the symptom occurs", asNeeded: true },
  STAT: { slots: ["morning"], note: "Take immediately, once only", oneTime: true },
  QOD: { slots: ["morning"], note: "Once every other day", alternateDay: true },
  EOD: { slots: ["morning"], note: "Once every other day", alternateDay: true },
};

// Food-timing codes.
const FOOD_MAP = {
  AC: "Before food",
  PC: "After food",
  HS_FOOD: "At bedtime",
};

/**
 * Parses a numeric dose pattern like "1-0-1" or "1-1-1" into slots.
 * Position order is the medical convention: Morning-Afternoon-Night (3-part)
 * or Morning-Afternoon-Evening-Night (4-part).
 */
function parseDosePattern(raw) {
  const parts = raw.split(/[-–]/).map((p) => p.trim());
  if (parts.length < 2 || parts.length > 4) return null;
  if (!parts.every((p) => /^\d+(\.\d+)?$/.test(p))) return null;

  const order3 = ["morning", "afternoon", "night"];
  const order4 = ["morning", "afternoon", "evening", "night"];
  const order = parts.length === 3 ? order3 : parts.length === 4 ? order4 : null;
  if (!order) return null;

  const slots = [];
  parts.forEach((count, i) => {
    const n = parseFloat(count);
    if (n > 0) slots.push(order[i]);
  });

  if (slots.length === 0) return null;

  const timesPerDay = slots.length;
  const label =
    timesPerDay === 1 ? "Once a day" : timesPerDay === 2 ? "Twice a day" : timesPerDay === 3 ? "Three times a day" : "Four times a day";

  return { slots, note: label, doseUnits: parts };
}

/**
 * Main entry point. Returns a structured, plain-language interpretation
 * of a shorthand frequency code, or an error describing what couldn't
 * be understood (never silently guesses).
 */
function decodeFrequency(shorthandRaw) {
  const raw = (shorthandRaw || "").trim();
  if (!raw) {
    return { ok: false, error: "No dosage code provided." };
  }

  // Try numeric dose-pattern form first (e.g. 1-0-1)
  if (/[-–]/.test(raw) && /\d/.test(raw)) {
    const parsed = parseDosePattern(raw);
    if (parsed) {
      return {
        ok: true,
        input: raw,
        slots: parsed.slots,
        note: parsed.note,
        asNeeded: false,
        oneTime: false,
      };
    }
  }

  // Try known letter code
  const normalized = raw.toUpperCase().replace(/[.\s]/g, "");
  const known = CODE_MAP[normalized];
  if (known) {
    return {
      ok: true,
      input: raw,
      slots: known.slots,
      note: known.note,
      asNeeded: !!known.asNeeded,
      oneTime: !!known.oneTime,
      alternateDay: !!known.alternateDay,
    };
  }

  return {
    ok: false,
    error: `"${raw}" isn't a recognised dosage code. Try formats like BD, TDS, HS, SOS, or 1-0-1.`,
  };
}

function decodeFoodTiming(rawInstruction) {
  if (!rawInstruction) return null;
  const normalized = rawInstruction.toUpperCase().replace(/[.\s]/g, "");
  if (FOOD_MAP[normalized]) return FOOD_MAP[normalized];
  return rawInstruction.trim(); // pass through free text as-is
}

/**
 * Builds a full day-by-day schedule between startDate and startDate + duration.
 */
function buildSchedule({ frequency, durationDays, startDate }) {
  const start = startDate ? new Date(startDate) : new Date();
  const days = [];
  const dayCount = Math.max(1, parseInt(durationDays, 10) || 1);

  for (let d = 0; d < dayCount; d++) {
    if (frequency.alternateDay && d % 2 !== 0) continue; // skip alternate days
    const date = new Date(start);
    date.setDate(date.getDate() + d);

    const doses = frequency.slots.map((slot) => ({
      slot,
      label: SLOT_LABELS[slot],
      time: SLOT_TIMES[slot],
    }));

    days.push({
      dayNumber: d + 1,
      date: date.toISOString().slice(0, 10),
      doses,
    });

    if (frequency.oneTime) break; // STAT — only fires once, ever
  }

  return days;
}

module.exports = { decodeFrequency, decodeFoodTiming, buildSchedule, SLOT_LABELS, SLOT_TIMES };
