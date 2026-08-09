(() => {
  const medicineList = document.getElementById("medicine-list");
  const template = document.getElementById("medicine-template");
  const addBtn = document.getElementById("add-medicine");
  const form = document.getElementById("rx-form");
  const formError = document.getElementById("form-error");
  const startDateInput = document.getElementById("startDate");

  const resultPanel = document.getElementById("result-panel");
  const scheduleOutput = document.getElementById("schedule-output");
  const shareId = document.getElementById("share-id");
  const legend = document.getElementById("legend");
  const copyLinkBtn = document.getElementById("copy-link");
  const printBtn = document.getElementById("print-btn");

  const lookupBtn = document.getElementById("lookup-btn");
  const lookupInput = document.getElementById("lookup-id");
  const lookupError = document.getElementById("lookup-error");

  const DOT_COLORS = ["#1F6F63", "#D98E2B", "#B84A3E", "#4A6FA5", "#8A6FB0", "#4F8A5B"];

  // Default start date = today
  startDateInput.value = new Date().toISOString().slice(0, 10);

  function addMedicineRow() {
    const node = template.content.cloneNode(true);
    const card = node.querySelector(".medicine-card");
    medicineList.appendChild(node);

    const codeInput = card.querySelector(".med-code");
    const preview = card.querySelector(".med-preview");
    const removeBtn = card.querySelector(".medicine-card__remove");

    let debounceTimer;
    codeInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      const value = codeInput.value.trim();
      if (!value) {
        preview.textContent = "";
        preview.removeAttribute("data-state");
        return;
      }
      debounceTimer = setTimeout(() => previewCode(value, preview), 220);
    });

    removeBtn.addEventListener("click", () => {
      if (medicineList.children.length > 1) {
        card.remove();
      }
    });
  }

  async function previewCode(dosageCode, previewEl) {
    try {
      const res = await fetch("/api/decode-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dosageCode }),
      });
      const data = await res.json();
      if (!data.ok) {
        previewEl.textContent = data.error;
        previewEl.dataset.state = "error";
        return;
      }
      previewEl.dataset.state = "ok";
      if (data.asNeeded) {
        previewEl.textContent = "→ As needed (no fixed times)";
      } else if (data.oneTime) {
        previewEl.textContent = "→ One-time dose";
      } else {
        previewEl.textContent = `→ ${data.note}: ${data.slots.map(capitalize).join(", ")}`;
      }
    } catch {
      previewEl.textContent = "Couldn't reach the decoder — check your connection.";
      previewEl.dataset.state = "error";
    }
  }

  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  addBtn.addEventListener("click", addMedicineRow);
  addMedicineRow(); // start with one row

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    formError.textContent = "";

    const patientName = document.getElementById("patientName").value.trim();
    const startDate = startDateInput.value;

    const cards = Array.from(medicineList.querySelectorAll(".medicine-card"));
    const medicines = cards.map((card) => ({
      name: card.querySelector(".med-name").value.trim(),
      dosageCode: card.querySelector(".med-code").value.trim(),
      durationDays: parseInt(card.querySelector(".med-duration").value, 10) || 1,
      instructions: card.querySelector(".med-instructions").value.trim(),
    }));

    if (medicines.some((m) => !m.name || !m.dosageCode)) {
      formError.textContent = "Every medicine needs a name and a dosage code.";
      return;
    }

    const submitBtn = form.querySelector(".btn--primary");
    submitBtn.disabled = true;
    submitBtn.textContent = "Building…";

    try {
      const res = await fetch("/api/prescriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientName, startDate, medicines }),
      });
      const data = await res.json();
      if (!data.ok) {
        formError.textContent = data.error;
        return;
      }
      renderResult(data.record);
    } catch {
      formError.textContent = "Couldn't reach the server. Is it running?";
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Build my schedule";
    }
  });

  lookupBtn.addEventListener("click", async () => {
    lookupError.textContent = "";
    const id = lookupInput.value.trim();
    if (!id) return;
    try {
      const res = await fetch(`/api/prescriptions/${encodeURIComponent(id)}`);
      const data = await res.json();
      if (!data.ok) {
        lookupError.textContent = data.error;
        return;
      }
      renderResult(data.record);
    } catch {
      lookupError.textContent = "Couldn't reach the server.";
    }
  });

  function renderResult(record) {
    resultPanel.hidden = false;
    shareId.textContent = record.id;

    // Legend
    legend.innerHTML = "";
    record.medicines.forEach((med, i) => {
      const color = DOT_COLORS[i % DOT_COLORS.length];
      const item = document.createElement("div");
      item.className = "legend__item";
      item.innerHTML = `<span class="legend__dot" style="background:${color}"></span>${escapeHtml(med.name)}${
        med.foodTiming ? ` · ${escapeHtml(med.foodTiming)}` : ""
      }`;
      legend.appendChild(item);
    });

    // Build a unified day-by-day view across all medicines
    const dayMap = new Map(); // date -> [{med, dose}]
    let hasAsNeeded = false;
    const asNeededNames = [];

    record.medicines.forEach((med, i) => {
      const color = DOT_COLORS[i % DOT_COLORS.length];
      if (med.asNeeded) {
        hasAsNeeded = true;
        asNeededNames.push(med.name);
        return;
      }
      med.schedule.forEach((day) => {
        if (!dayMap.has(day.date)) dayMap.set(day.date, []);
        day.doses.forEach((dose) => {
          dayMap.get(day.date).push({ medName: med.name, color, ...dose });
        });
      });
    });

    scheduleOutput.innerHTML = "";
    const sortedDates = Array.from(dayMap.keys()).sort();

    if (sortedDates.length === 0 && !hasAsNeeded) {
      scheduleOutput.innerHTML = `<p class="as-needed-note">No timed doses to show.</p>`;
    }

    sortedDates.forEach((date) => {
      const doses = dayMap.get(date).sort((a, b) => a.time.localeCompare(b.time));
      const compartment = document.createElement("div");
      compartment.className = "day-compartment";
      const dateLabel = new Date(date + "T00:00:00").toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      compartment.innerHTML = `<div class="day-compartment__date"><span>${dateLabel}</span></div>`;
      const dosesWrap = document.createElement("div");
      dosesWrap.className = "day-compartment__doses";
      doses.forEach((dose) => {
        const tag = document.createElement("div");
        tag.className = "pill-tag";
        tag.innerHTML = `<span class="pill-tag__dot" style="background:${dose.color}"></span>${escapeHtml(
          dose.medName
        )} <span class="pill-tag__time">${formatTime(dose.time)}</span>`;
        dosesWrap.appendChild(tag);
      });
      compartment.appendChild(dosesWrap);
      scheduleOutput.appendChild(compartment);
    });

    if (hasAsNeeded) {
      const note = document.createElement("p");
      note.className = "as-needed-note";
      note.textContent = `Take as needed (no fixed schedule): ${asNeededNames.join(", ")}.`;
      scheduleOutput.appendChild(note);
    }

    resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function formatTime(hhmm) {
    const [h, m] = hhmm.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const hour12 = h % 12 === 0 ? 12 : h % 12;
    return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  copyLinkBtn.addEventListener("click", async () => {
    const url = `${window.location.origin}/?rx=${encodeURIComponent(shareId.textContent)}`;
    try {
      await navigator.clipboard.writeText(url);
      copyLinkBtn.textContent = "Copied!";
      setTimeout(() => (copyLinkBtn.textContent = "Copy link"), 1500);
    } catch {
      prompt("Copy this link:", url);
    }
  });

  printBtn.addEventListener("click", () => window.print());

  // If page loaded with ?rx=ID, auto-load that schedule
  const params = new URLSearchParams(window.location.search);
  const rxParam = params.get("rx");
  if (rxParam) {
    fetch(`/api/prescriptions/${encodeURIComponent(rxParam)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.ok) renderResult(data.record);
      });
  }
})();
