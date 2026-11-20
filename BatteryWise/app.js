(() => {
  "use strict";
  const STORAGE_KEY = "batterywise_records_v1";
  const STATUSES = ["Registered", "Sent to authorised recycler", "Recycled / Completed"];
  const $ = (id) => document.getElementById(id);
  const form = $("batteryForm");
  const tbody = $("recordsBody");
  let records = loadRecords();

  function loadRecords() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(saved) ? saved.filter(r => r && r.id && r.name) : [];
    } catch (error) {
      console.warn("Could not read saved BatteryWise records:", error);
      return [];
    }
  }

  function saveRecords() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (error) {
      alert("Could not save this record. Your browser storage may be full or disabled.");
      return false;
    }
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function createId() {
    let id;
    do {
      id = "BW-" + new Date().getFullYear() + "-" +
        Math.random().toString(36).slice(2, 8).toUpperCase();
    } while (records.some(record => record.id === id));
    return id;
  }

  function renderDashboard() {
    $("totalCount").textContent = records.length;
    $("sentCount").textContent = records.filter(r => r.status === STATUSES[1]).length;
    $("doneCount").textContent = records.filter(r => r.status === STATUSES[2]).length;
    const categories = {};
    records.forEach(r => { categories[r.type] = (categories[r.type] || 0) + 1; });
    $("categoryCount").textContent = Object.keys(categories).length;

    const breakdown = $("categoryBreakdown");
    const entries = Object.entries(categories).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      breakdown.innerHTML = '<p class="empty">No battery records yet.</p>';
      return;
    }
    const max = Math.max(...entries.map(entry => entry[1]));
    breakdown.innerHTML = entries.map(([name, count]) => `
      <div class="bar-row">
        <span>${escapeHTML(name)}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${(count / max) * 100}%"></div></div>
        <strong>${count}</strong>
      </div>`).join("");
  }

  function renderRecords() {
    const query = $("searchInput").value.trim().toLowerCase();
    const status = $("statusFilter").value;
    const filtered = records.filter(r => {
      const searchable = [r.id, r.name, r.owner, r.type].join(" ").toLowerCase();
      return searchable.includes(query) && (status === "all" || r.status === status);
    });

    if (!filtered.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="empty">No matching records. Try another search or register a battery.</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const statusClass = r.status === STATUSES[2] ? "done" : r.status === STATUSES[1] ? "sent" : "";
      return `<tr>
        <td><span class="id-cell">${escapeHTML(r.id)}</span></td>
        <td><strong>${escapeHTML(r.name)}</strong><br><small>${escapeHTML(r.owner)}</small></td>
        <td>${escapeHTML(r.type)}</td>
        <td><span class="status-pill ${statusClass}">${escapeHTML(r.status)}</span></td>
        <td><select class="table-select" data-action="status" data-id="${escapeHTML(r.id)}" aria-label="Update status for ${escapeHTML(r.id)}">
          ${STATUSES.map(s => `<option ${s === r.status ? "selected" : ""}>${escapeHTML(s)}</option>`).join("")}
        </select></td>
        <td><button class="delete-btn" data-action="delete" data-id="${escapeHTML(r.id)}" aria-label="Delete ${escapeHTML(r.id)}">Delete</button></td>
      </tr>`;
    }).join("");
  }

  function render() {
    renderDashboard();
    renderRecords();
  }

  form.addEventListener("submit", event => {
    event.preventDefault();
    const type = $("batteryType").value;
    const name = $("batteryName").value.trim();
    const owner = $("ownerName").value.trim();
    const condition = $("condition").value;
    const notes = $("notes").value.trim();

    if (!type || !name || !owner || !condition) {
      $("formMessage").textContent = "Please complete all required fields.";
      return;
    }

    const record = {
      id: createId(), type, name, owner, condition, notes,
      status: STATUSES[0], createdAt: new Date().toISOString()
    };
    records.unshift(record);
    if (!saveRecords()) {
      records.shift();
      return;
    }
    render();
    form.reset();
    $("formMessage").textContent = "Battery record saved successfully.";
    $("newPassportId").textContent = record.id;
    $("modal").hidden = false;
  });

  tbody.addEventListener("change", event => {
    const select = event.target.closest('select[data-action="status"]');
    if (!select) return;
    const record = records.find(r => r.id === select.dataset.id);
    if (!record || !STATUSES.includes(select.value)) return;
    const previous = record.status;
    record.status = select.value;
    if (!saveRecords()) record.status = previous;
    render();
  });

  tbody.addEventListener("click", event => {
    const button = event.target.closest('button[data-action="delete"]');
    if (!button) return;
    const record = records.find(r => r.id === button.dataset.id);
    if (!record) return;
    if (!confirm(`Delete record ${record.id}? This cannot be undone.`)) return;
    records = records.filter(r => r.id !== record.id);
    if (saveRecords()) render();
  });

  $("searchInput").addEventListener("input", renderRecords);
  $("statusFilter").addEventListener("change", renderRecords);
  $("closeModal").addEventListener("click", () => { $("modal").hidden = true; });
  $("modal").addEventListener("click", event => {
    if (event.target === $("modal")) $("modal").hidden = true;
  });
  $("copyId").addEventListener("click", async () => {
    const id = $("newPassportId").textContent;
    try {
      await navigator.clipboard.writeText(id);
      $("copyId").textContent = "Copied!";
    } catch {
      $("copyId").textContent = "Select and copy the ID";
    }
  });

  $("exportBtn").addEventListener("click", () => {
    if (!records.length) {
      alert("There are no records to export yet.");
      return;
    }
    const columns = ["id", "name", "owner", "type", "condition", "status", "notes", "createdAt"];
    const csvCell = value => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const csv = [columns.join(","), ...records.map(r => columns.map(c => csvCell(r[c])).join(","))].join("\r\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "batterywise-records.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  });

  render();
})();