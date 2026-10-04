/* ============================================================
   Courier Management System — App Logic
   ============================================================ */

let db = loadDB();

const PAGE_META = {
  dashboard: { title: "Dashboard", subtitle: "Live snapshot of every shipment in the network" },
  customers: { title: "Customers", subtitle: "Add and manage sender records" },
  booking: { title: "Courier Booking", subtitle: "Register a new pickup and generate a tracking number" },
  tracking: { title: "Track a Shipment", subtitle: "Look up a parcel by its tracking number" },
  delivery: { title: "Delivery Workflow", subtitle: "Move active shipments through pickup to delivery" },
  reports: { title: "Reports", subtitle: "Performance across branches and agents" },
  branches: { title: "Branches", subtitle: "Courier branch network" },
  agents: { title: "Delivery Agents", subtitle: "Field staff and their current load" },
};

document.addEventListener("DOMContentLoaded", () => {
  wireNav();
  wireForms();
  navigate("dashboard");
});

/* ---------------- navigation ---------------- */
function wireNav() {
  document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.section));
  });
}

function navigate(section) {
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${section}`).classList.add("active");

  document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.section === section));

  const meta = PAGE_META[section];
  document.getElementById("pageTitle").textContent = meta.title;
  document.getElementById("pageSubtitle").textContent = meta.subtitle;

  const renderers = {
    dashboard: renderDashboard,
    customers: renderCustomers,
    booking: renderBookingForm,
    tracking: renderTrackingReset,
    delivery: renderDelivery,
    reports: renderReports,
    branches: renderBranches,
    agents: renderAgents,
  };
  renderers[section]?.();
}

/* ---------------- toast ---------------- */
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 3200);
}

function logActivity(text) {
  db.activity.unshift({ date: todayStr(), text });
  db.activity = db.activity.slice(0, 30);
}

/* ================= DASHBOARD ================= */
function renderDashboard() {
  const counts = { Booked: 0, "Picked Up": 0, "In Transit": 0, "Out for Delivery": 0, Delivered: 0, Cancelled: 0 };
  db.couriers.forEach((c) => counts[c.status]++);
  const pending = counts.Booked + counts["Picked Up"] + counts["In Transit"] + counts["Out for Delivery"];

  const cards = [
    { label: "Total Couriers", value: db.couriers.length, cls: "" },
    { label: "Delivered", value: counts.Delivered, cls: "status-delivered" },
    { label: "In Transit", value: counts["In Transit"], cls: "status-transit" },
    { label: "Pending Delivery", value: pending, cls: "status-outfordelivery" },
    { label: "Cancelled", value: counts.Cancelled, cls: "status-cancelled" },
  ];
  document.getElementById("statCards").innerHTML = cards
    .map((c) => `<div class="stat-card"><span class="stat-value ${c.cls}">${c.value}</span><span class="stat-label">${c.label}</span></div>`)
    .join("");

  // Delivery-agent-wise couriers
  const agentCounts = db.agents.map((a) => ({
    name: a.name,
    count: db.couriers.filter((c) => c.deliveryAgentId === a.id).length,
  }));
  const maxAgent = Math.max(1, ...agentCounts.map((a) => a.count));
  document.getElementById("agentBars").innerHTML = agentCounts
    .map((a) => barRow(a.name, a.count, maxAgent))
    .join("") || emptyRow();

  // Monthly bookings (last 6 months)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    months.push(fmtDate(new Date(d.getFullYear(), d.getMonth(), 1)));
  }
  const monthCounts = months.map((m) => {
    const label = monthLabel(m);
    const ym = m.slice(0, 7);
    const count = db.couriers.filter((c) => c.bookingDate.slice(0, 7) === ym).length;
    return { label, count };
  });
  const maxMonth = Math.max(1, ...monthCounts.map((m) => m.count));
  document.getElementById("monthBars").innerHTML = monthCounts
    .map((m) => barRow(m.label, m.count, maxMonth))
    .join("");

  // recent activity
  document.getElementById("activityList").innerHTML =
    db.activity.slice(0, 8).map((a) => `<li><span class="activity-date">${niceDate(a.date)}</span>${escapeHtml(a.text)}</li>`).join("") ||
    `<li class="muted">No activity yet</li>`;
}

function barRow(label, value, max) {
  const pct = Math.round((value / max) * 100);
  return `<div class="bar-row">
    <span class="bar-label">${escapeHtml(label)}</span>
    <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
    <span class="bar-value">${value}</span>
  </div>`;
}
function emptyRow() {
  return `<p class="muted">No data yet</p>`;
}

/* ================= CUSTOMERS ================= */
function renderCustomers() {
  const rows = db.customers
    .map(
      (c) => `<tr>
        <td class="mono">${c.id}</td>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.phone)}</td>
        <td>${escapeHtml(c.email || "—")}</td>
        <td>${escapeHtml(c.address)}</td>
        <td><button class="btn-link danger" data-del-customer="${c.id}">Remove</button></td>
      </tr>`
    )
    .join("");
  document.getElementById("customerTableBody").innerHTML =
    rows || `<tr><td colspan="6" class="muted">No customers yet — add the first one above.</td></tr>`;

  document.querySelectorAll("[data-del-customer]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.delCustomer;
      if (db.couriers.some((c) => c.customerId === id)) {
        toast("Can't remove — this customer has courier bookings on record.");
        return;
      }
      db.customers = db.customers.filter((c) => c.id !== id);
      saveDB(db);
      renderCustomers();
    });
  });
}

function addCustomer(data) {
  const customer = { id: nextId(db, "customer", "CUST"), ...data };
  db.customers.push(customer);
  logActivity(`New customer added: ${customer.name} (${customer.id})`);
  saveDB(db);
  return customer;
}

/* ================= BRANCHES ================= */
function renderBranches() {
  document.getElementById("branchTableBody").innerHTML =
    db.branches
      .map(
        (b) => `<tr><td class="mono">${b.id}</td><td>${escapeHtml(b.name)}</td><td>${escapeHtml(b.location)}</td><td>${escapeHtml(b.phone)}</td></tr>`
      )
      .join("") || `<tr><td colspan="4" class="muted">No branches yet.</td></tr>`;
}
function addBranch(data) {
  const branch = { id: nextId(db, "branch", "BR"), ...data };
  db.branches.push(branch);
  logActivity(`New branch added: ${branch.name} (${branch.id})`);
  saveDB(db);
  return branch;
}

/* ================= AGENTS ================= */
function renderAgents() {
  document.getElementById("agentTableBody").innerHTML =
    db.agents
      .map((a) => {
        const branch = db.branches.find((b) => b.id === a.branchId);
        const active = db.couriers.filter((c) => c.deliveryAgentId === a.id && !["Delivered", "Cancelled"].includes(c.status)).length;
        return `<tr><td class="mono">${a.id}</td><td>${escapeHtml(a.name)}</td><td>${escapeHtml(a.phone)}</td><td>${escapeHtml(branch?.name || "—")}</td><td>${active}</td></tr>`;
      })
      .join("") || `<tr><td colspan="5" class="muted">No delivery agents yet.</td></tr>`;
}
function addAgent(data) {
  const agent = { id: nextId(db, "agent", "DA"), status: "Available", ...data };
  db.agents.push(agent);
  logActivity(`New delivery agent added: ${agent.name} (${agent.id})`);
  saveDB(db);
  return agent;
}

/* ================= COURIER BOOKING ================= */
function renderBookingForm() {
  const custSel = document.getElementById("bk-customer");
  custSel.innerHTML =
    `<option value="">Select customer…</option>` +
    db.customers.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} — ${c.id}</option>`).join("");

  const branchSel = document.getElementById("bk-branch");
  branchSel.innerHTML = db.branches.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");

  const agentSel = document.getElementById("bk-agent");
  agentSel.innerHTML =
    `<option value="">Auto-assign least-busy agent</option>` +
    db.agents.map((a) => `<option value="${a.id}">${escapeHtml(a.name)} — ${a.id}</option>`).join("");

  const typeSel = document.getElementById("bk-type");
  typeSel.innerHTML = COURIER_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("");

  document.getElementById("bk-bookingDate").value = todayStr();
  document.getElementById("bk-expectedDate").value = addDays(todayStr(), 3);
  document.getElementById("newCustomerFields").classList.add("hidden");
  document.getElementById("bk-newCustomerToggle").checked = false;
  document.getElementById("bookingForm").reset();
  document.getElementById("bk-bookingDate").value = todayStr();
  document.getElementById("bk-expectedDate").value = addDays(todayStr(), 3);
}

function pickAgentForBranch(branchId) {
  const branchAgents = db.agents.filter((a) => a.branchId === branchId);
  const pool = branchAgents.length ? branchAgents : db.agents;
  if (!pool.length) return null;
  const load = (agentId) => db.couriers.filter((c) => c.deliveryAgentId === agentId && !["Delivered", "Cancelled"].includes(c.status)).length;
  return pool.reduce((least, a) => (load(a.id) < load(least.id) ? a : least), pool[0]);
}

function submitBooking(form) {
  const fd = new FormData(form);
  let customerId = fd.get("customer");

  if (document.getElementById("bk-newCustomerToggle").checked) {
    const name = fd.get("newCustName")?.trim();
    const phone = fd.get("newCustPhone")?.trim();
    if (!name || !phone) {
      toast("Enter the new customer's name and phone number.");
      return;
    }
    const customer = addCustomer({
      name,
      phone,
      email: fd.get("newCustEmail")?.trim() || "",
      address: fd.get("newCustAddress")?.trim() || fd.get("pickupAddress")?.trim(),
    });
    customerId = customer.id;
  }

  if (!customerId) {
    toast("Select a sender / customer for this booking.");
    return;
  }

  const branchId = fd.get("branch");
  let agentId = fd.get("agent");
  if (!agentId) {
    const auto = pickAgentForBranch(branchId);
    agentId = auto ? auto.id : "";
  }

  const type = fd.get("type");
  const weight = Number(fd.get("weight")) || 0;
  const amount = calcAmount(type, weight);

  const courier = {
    id: nextId(db, "courier", "CR"),
    trackingNumber: nextTracking(db),
    customerId,
    receiverName: fd.get("receiverName").trim(),
    receiverPhone: fd.get("receiverPhone").trim(),
    pickupAddress: fd.get("pickupAddress").trim(),
    deliveryAddress: fd.get("deliveryAddress").trim(),
    courierType: type,
    weight,
    bookingDate: fd.get("bookingDate") || todayStr(),
    expectedDeliveryDate: fd.get("expectedDate"),
    deliveryDate: "",
    deliveryAgentId: agentId,
    branchId,
    status: "Booked",
    amount,
  };
  db.couriers.push(courier);

  const paymentStatus = fd.get("paymentTiming") === "now" ? "Paid" : "Pending";
  db.payments.push({
    id: nextId(db, "payment", "PAY"),
    courierId: courier.id,
    amount,
    mode: fd.get("paymentMode"),
    status: paymentStatus,
    date: paymentStatus === "Paid" ? todayStr() : "",
  });

  logActivity(`Courier ${courier.id} booked — tracking ${courier.trackingNumber}, status Booked`);
  saveDB(db);

  toast(`Booked! Tracking number ${courier.trackingNumber} — ₹${amount} ${paymentStatus.toLowerCase()}.`);
  renderBookingForm();
}

/* ================= TRACKING ================= */
function renderTrackingReset() {
  document.getElementById("trackingResult").innerHTML = "";
  document.getElementById("trackingInput").value = "";
  document.getElementById("trackingInput").focus();
}

function doTrack(query) {
  const q = query.trim().toUpperCase();
  const courier = db.couriers.find((c) => c.trackingNumber.toUpperCase() === q || c.id.toUpperCase() === q);
  const box = document.getElementById("trackingResult");
  if (!courier) {
    box.innerHTML = `<div class="empty-state">No shipment found for "<strong>${escapeHtml(query)}</strong>". Check the tracking number and try again.</div>`;
    return;
  }
  const customer = db.customers.find((c) => c.id === courier.customerId);
  const agent = db.agents.find((a) => a.id === courier.deliveryAgentId);
  const cancelled = courier.status === "Cancelled";

  const steps = STATUS_ORDER.map((s, i) => {
    const currentIdx = STATUS_ORDER.indexOf(courier.status);
    let state = "future";
    if (!cancelled) {
      if (i < currentIdx) state = "done";
      else if (i === currentIdx) state = "current";
    }
    return `<div class="step ${state}"><span class="step-dot"></span><span class="step-label">${s}</span></div>`;
  }).join(`<span class="step-line"></span>`);

  box.innerHTML = `
    <div class="track-card">
      <div class="track-head">
        <div>
          <div class="track-tracking mono">${courier.trackingNumber}</div>
          <div class="muted">${courier.id}</div>
        </div>
        <span class="status-pill ${STATUS_COLOR[courier.status]}">${courier.status}</span>
      </div>

      ${cancelled ? `<p class="cancelled-note">This shipment was cancelled and is no longer moving through the network.</p>` : `<div class="stepper">${steps}</div>`}

      <div class="track-grid">
        <div><span class="fld-label">Sender</span><span>${escapeHtml(customer?.name || "—")}</span></div>
        <div><span class="fld-label">Receiver</span><span>${escapeHtml(courier.receiverName)} · ${escapeHtml(courier.receiverPhone)}</span></div>
        <div><span class="fld-label">Pickup address</span><span>${escapeHtml(courier.pickupAddress)}</span></div>
        <div><span class="fld-label">Delivery address</span><span>${escapeHtml(courier.deliveryAddress)}</span></div>
        <div><span class="fld-label">Courier type</span><span>${courier.courierType} · ${courier.weight} kg</span></div>
        <div><span class="fld-label">Delivery agent</span><span>${escapeHtml(agent?.name || "Unassigned")}</span></div>
        <div><span class="fld-label">Booking date</span><span>${niceDate(courier.bookingDate)}</span></div>
        <div><span class="fld-label">Expected delivery</span><span>${niceDate(courier.expectedDeliveryDate)}</span></div>
        ${courier.deliveryDate ? `<div><span class="fld-label">Delivered on</span><span>${niceDate(courier.deliveryDate)}</span></div>` : ""}
      </div>
    </div>`;
}

/* ================= DELIVERY WORKFLOW ================= */
function renderDelivery() {
  const active = db.couriers.filter((c) => !["Delivered", "Cancelled"].includes(c.status));
  const rows = active
    .map((c) => {
      const customer = db.customers.find((x) => x.id === c.customerId);
      const agent = db.agents.find((x) => x.id === c.deliveryAgentId);
      const nextIdx = STATUS_ORDER.indexOf(c.status) + 1;
      const nextStatus = STATUS_ORDER[nextIdx];
      const canCancel = ["Booked", "Picked Up"].includes(c.status);
      return `<tr>
        <td class="mono">${c.trackingNumber}</td>
        <td>${escapeHtml(customer?.name || "—")} → ${escapeHtml(c.receiverName)}</td>
        <td>${escapeHtml(agent?.name || "Unassigned")}</td>
        <td><span class="status-pill ${STATUS_COLOR[c.status]}">${c.status}</span></td>
        <td class="row-actions">
          ${nextStatus ? `<button class="btn small" data-advance="${c.id}">Mark ${nextStatus}</button>` : ""}
          ${canCancel ? `<button class="btn-link danger" data-cancel="${c.id}">Cancel</button>` : ""}
        </td>
      </tr>`;
    })
    .join("");
  document.getElementById("deliveryTableBody").innerHTML =
    rows || `<tr><td colspan="5" class="muted">Nothing in progress — every shipment is delivered or cancelled.</td></tr>`;

  document.querySelectorAll("[data-advance]").forEach((btn) => {
    btn.addEventListener("click", () => advanceStatus(btn.dataset.advance));
  });
  document.querySelectorAll("[data-cancel]").forEach((btn) => {
    btn.addEventListener("click", () => cancelCourier(btn.dataset.cancel));
  });
}

function advanceStatus(courierId) {
  const courier = db.couriers.find((c) => c.id === courierId);
  if (!courier) return;
  const nextIdx = STATUS_ORDER.indexOf(courier.status) + 1;
  const next = STATUS_ORDER[nextIdx];
  if (!next) return;
  courier.status = next;

  if (next === "Delivered") {
    courier.deliveryDate = todayStr();
    const customer = db.customers.find((c) => c.id === courier.customerId);
    logActivity(`Courier ${courier.id} delivered to ${courier.receiverName}. Confirmation sent to ${customer?.name || "customer"}.`);
    toast(`Delivered! Notification sent to ${customer?.name || "the customer"}.`);
  } else {
    logActivity(`Courier ${courier.id} status updated to ${next}.`);
    toast(`SMS sent to ${courier.receiverName}: your parcel is now "${next}".`);
  }
  saveDB(db);
  renderDelivery();
}

function cancelCourier(courierId) {
  const courier = db.couriers.find((c) => c.id === courierId);
  if (!courier) return;
  if (!confirm(`Cancel shipment ${courier.trackingNumber}? This can't be undone.`)) return;
  courier.status = "Cancelled";
  logActivity(`Courier ${courier.id} cancelled.`);
  toast(`Shipment ${courier.trackingNumber} cancelled.`);
  saveDB(db);
  renderDelivery();
}

/* ================= REPORTS ================= */
function renderReports() {
  const counts = { Booked: 0, "Picked Up": 0, "In Transit": 0, "Out for Delivery": 0, Delivered: 0, Cancelled: 0 };
  db.couriers.forEach((c) => counts[c.status]++);
  document.getElementById("reportSummary").innerHTML = Object.entries(counts)
    .map(([status, n]) => `<div class="stat-card"><span class="stat-value ${STATUS_COLOR[status]}">${n}</span><span class="stat-label">${status}</span></div>`)
    .join("");

  const rows = [...db.couriers]
    .sort((a, b) => (a.bookingDate < b.bookingDate ? 1 : -1))
    .map((c) => {
      const customer = db.customers.find((x) => x.id === c.customerId);
      const payment = db.payments.find((p) => p.courierId === c.id);
      return `<tr>
        <td class="mono">${c.trackingNumber}</td>
        <td>${escapeHtml(customer?.name || "—")}</td>
        <td>${escapeHtml(c.receiverName)}</td>
        <td>${niceDate(c.bookingDate)}</td>
        <td><span class="status-pill ${STATUS_COLOR[c.status]}">${c.status}</span></td>
        <td>₹${c.amount}</td>
        <td>${payment ? payment.status : "—"}</td>
      </tr>`;
    })
    .join("");
  document.getElementById("reportTableBody").innerHTML = rows || `<tr><td colspan="7" class="muted">No bookings yet.</td></tr>`;
}

/* ================= FORM WIRING ================= */
function wireForms() {
  document.getElementById("customerForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addCustomer({
      name: fd.get("name").trim(),
      phone: fd.get("phone").trim(),
      email: fd.get("email").trim(),
      address: fd.get("address").trim(),
    });
    e.target.reset();
    toast("Customer added.");
    renderCustomers();
  });

  document.getElementById("branchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addBranch({ name: fd.get("name").trim(), location: fd.get("location").trim(), phone: fd.get("phone").trim() });
    e.target.reset();
    toast("Branch added.");
    renderBranches();
  });

  document.getElementById("agentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    addAgent({ name: fd.get("name").trim(), phone: fd.get("phone").trim(), branchId: fd.get("branchId") });
    e.target.reset();
    toast("Delivery agent added.");
    renderAgents();
  });

  document.getElementById("bk-newCustomerToggle").addEventListener("change", (e) => {
    document.getElementById("newCustomerFields").classList.toggle("hidden", !e.target.checked);
    document.getElementById("bk-customer").required = !e.target.checked;
    document.getElementById("bk-customer").disabled = e.target.checked;
  });

  document.getElementById("bookingForm").addEventListener("submit", (e) => {
    e.preventDefault();
    submitBooking(e.target);
  });

  document.getElementById("trackingForm").addEventListener("submit", (e) => {
    e.preventDefault();
    doTrack(document.getElementById("trackingInput").value);
  });
}

/* ---------------- util ---------------- */
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

/* populate branch dropdown inside Agents form whenever agents view renders needs branch list too */
document.addEventListener("DOMContentLoaded", () => {
  const agentBranchSel = document.getElementById("ag-branch");
  if (agentBranchSel) {
    agentBranchSel.innerHTML = db.branches.map((b) => `<option value="${b.id}">${escapeHtml(b.name)}</option>`).join("");
  }
});
