# RxClear — Prescription Shorthand Decoder

**The problem:** Doctors write dosage instructions in medical shorthand — `BD`,
`TDS`, `HS`, `1-0-1`, `SOS`. Patients (especially elderly patients, first-time
patients, or anyone without a medical background) frequently misread or
misremember these, leading to missed doses, doubled doses, or a phone call
back to the pharmacy. RxClear turns that shorthand into a plain-language,
day-by-day dose schedule — instantly, and shareable by link.

## What it does

1. You fill in one or more medicines: name, dosage shorthand, duration, and
   optional food-timing instructions (AC/PC/etc).
2. The backend decodes each shorthand code using a transparent, rule-based
   engine (no guessing — unrecognised codes are rejected with a clear error).
3. It builds a full day-by-day dosing schedule and saves it, returning a
   short shareable code (e.g. `b2000214`) and link.
4. The schedule renders as a "pillbox" — one compartment per day, with
   color-coded pill tags showing exactly what to take and when.
5. Anyone with the code/link can reopen the same schedule later — useful for
   caregivers, family members, or the patient checking from their phone.

## Stack

- **Backend:** Node.js + Express. Real REST API (`/api/prescriptions`,
  `/api/decode-preview`), JSON-file persistence (`server/data.json`) — no
  mocked data, every request round-trips through the actual server.
- **Frontend:** Vanilla HTML/CSS/JS, fully responsive, no build step.
- **Parsing engine:** `server/decoder.js` — a rule-based mapping of standard
  prescription shorthand (OD, BD, TDS, QID, HS, SOS, PRN, STAT, QOD, and
  numeric patterns like `1-0-1`) to plain-language dose times.

## Running it

```bash
cd server
npm install    # only needed if node_modules isn't already present
npm start
```

Then open **http://localhost:3000** in a browser.

## Project structure

```
prescription-decoder/
├── server/
│   ├── server.js       # Express app + REST API
│   ├── decoder.js       # shorthand → schedule parsing logic
│   ├── package.json
│   └── data.json        # created automatically on first save
└── public/
    ├── index.html
    ├── styles.css
    └── app.js
```

## Supported shorthand

| Code | Meaning |
|---|---|
| OD / QD | Once a day |
| BD / BID | Twice a day |
| TDS / TID | Three times a day |
| QID / QDS | Four times a day |
| HS | At bedtime |
| SOS / PRN | As needed |
| STAT | Immediately, once only |
| QOD / EOD | Every other day |
| `1-0-1`, `1-1-1`, etc. | Numeric dose pattern (Morning-Afternoon-Night) |
| AC / PC | Before food / after food |

## Notes for judges

- This is intentionally rule-based rather than AI-guessed for a medical
  context — every output is traceable to an explicit mapping, and unknown
  codes fail loudly instead of producing a plausible-looking wrong answer.
- Default dose clock-times (8am / 2pm / 6pm / 9pm / 10pm bedtime) are a
  reasonable default; a real product would let a patient customize these.
