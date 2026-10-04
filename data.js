/* ============================================================
   Courier Management System — Data Layer
   Simulates the Salesforce object model (Customer, Courier,
   Delivery Agent, Branch, Payment) using browser localStorage,
   so the whole app runs standalone in any browser / VS Code
   Live Server without needing an org.
   ============================================================ */

const STORAGE_KEY = "courierManagementSystem.db.v1";

const STATUS_ORDER = [
  "Booked",
  "Picked Up",
  "In Transit",
  "Out for Delivery",
  "Delivered",
];

const STATUS_COLOR = {
  "Booked": "status-booked",
  "Picked Up": "status-pickedup",
  "In Transit": "status-transit",
  "Out for Delivery": "status-outfordelivery",
  "Delivered": "status-delivered",
  "Cancelled": "status-cancelled",
};

const COURIER_TYPES = ["Document", "Parcel", "Fragile", "Bulk / Other"];
const PAYMENT_MODES = ["Cash", "UPI", "Card", "Online"];

/* ---------- date helpers ---------- */
function todayStr() {
  return fmtDate(new Date());
}
function fmtDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function addDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return fmtDate(d);
}
function niceDate(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function monthLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

/* ---------- id / tracking generators ---------- */
function pad(n, len) {
  return String(n).padStart(len, "0");
}
function nextId(db, entity, prefix) {
  db.counters[entity] = (db.counters[entity] || 0) + 1;
  return `${prefix}-${pad(db.counters[entity], 4)}`;
}
function nextTracking(db) {
  db.counters.tracking = (db.counters.tracking || 0) + 1;
  const year = new Date().getFullYear();
  return `TRK${year}${pad(db.counters.tracking, 6)}`;
}

/* ---------- pricing ---------- */
const BASE_RATE = { "Document": 30, "Parcel": 50, "Fragile": 80, "Bulk / Other": 60 };
function calcAmount(type, weight) {
  const base = BASE_RATE[type] ?? 50;
  const w = Number(weight) || 0;
  const extra = Math.max(0, w - 1) * 15;
  return Math.round(base + extra);
}

/* ---------- persistence ---------- */
function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.warn("Corrupt DB, reseeding", e);
    }
  }
  const seeded = seedDB();
  saveDB(seeded);
  return seeded;
}
function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

/* ---------- seed data ---------- */
function seedDB() {
  const db = {
    counters: { customer: 0, branch: 0, agent: 0, courier: 0, payment: 0, tracking: 0 },
    customers: [],
    branches: [],
    agents: [],
    couriers: [],
    payments: [],
    activity: [],
  };

  const b1 = { id: nextId(db, "branch", "BR"), name: "Chennai Central Branch", location: "Anna Salai, Chennai", phone: "044-2345 6789" };
  const b2 = { id: nextId(db, "branch", "BR"), name: "Coimbatore Branch", location: "RS Puram, Coimbatore", phone: "0422-234 5678" };
  db.branches.push(b1, b2);

  const a1 = { id: nextId(db, "agent", "DA"), name: "Arun Kumar", phone: "90000 10001", branchId: b1.id, status: "Available" };
  const a2 = { id: nextId(db, "agent", "DA"), name: "Suresh Babu", phone: "90000 10002", branchId: b1.id, status: "Available" };
  const a3 = { id: nextId(db, "agent", "DA"), name: "Vijay Anand", phone: "90000 10003", branchId: b2.id, status: "Available" };
  db.agents.push(a1, a2, a3);

  const c1 = { id: nextId(db, "customer", "CUST"), name: "Priya Ramesh", phone: "90000 11111", email: "priya@example.com", address: "12 Anna Nagar, Chennai" };
  const c2 = { id: nextId(db, "customer", "CUST"), name: "Karthik Subramanian", phone: "90000 22222", email: "karthik@example.com", address: "45 RS Puram, Coimbatore" };
  const c3 = { id: nextId(db, "customer", "CUST"), name: "Meena Iyer", phone: "90000 33333", email: "meena@example.com", address: "8 T Nagar, Chennai" };
  db.customers.push(c1, c2, c3);

  function seedCourier({ customer, agent, branch, receiverName, receiverPhone, deliveryAddress, type, weight, daysAgoBooked, status, paid }) {
    const bookingDate = addDays(todayStr(), -daysAgoBooked);
    const expected = addDays(bookingDate, 3);
    const courier = {
      id: nextId(db, "courier", "CR"),
      trackingNumber: nextTracking(db),
      customerId: customer.id,
      receiverName,
      receiverPhone,
      pickupAddress: customer.address,
      deliveryAddress,
      courierType: type,
      weight,
      bookingDate,
      expectedDeliveryDate: expected,
      deliveryDate: status === "Delivered" ? addDays(bookingDate, 2) : "",
      deliveryAgentId: agent.id,
      branchId: branch.id,
      status,
      amount: calcAmount(type, weight),
    };
    db.couriers.push(courier);
    db.payments.push({
      id: nextId(db, "payment", "PAY"),
      courierId: courier.id,
      amount: courier.amount,
      mode: paid ? "UPI" : "Cash",
      status: paid ? "Paid" : "Pending",
      date: paid ? bookingDate : "",
    });
    db.activity.unshift({ date: bookingDate, text: `Courier ${courier.id} booked for ${receiverName} — status ${status}` });
    return courier;
  }

  seedCourier({ customer: c1, agent: a1, branch: b1, receiverName: "Divya Menon", receiverPhone: "90000 44444", deliveryAddress: "7 MG Road, Bengaluru", type: "Parcel", weight: 2.5, daysAgoBooked: 5, status: "Delivered", paid: true });
  seedCourier({ customer: c2, agent: a3, branch: b2, receiverName: "Ganesh Pillai", receiverPhone: "90000 55555", deliveryAddress: "22 Race Course Road, Coimbatore", type: "Fragile", weight: 1.2, daysAgoBooked: 2, status: "In Transit", paid: false });
  seedCourier({ customer: c3, agent: a2, branch: b1, receiverName: "Lakshmi Narayanan", receiverPhone: "90000 66666", deliveryAddress: "3 Gandhipuram, Coimbatore", type: "Document", weight: 0.5, daysAgoBooked: 1, status: "Booked", paid: true });
  seedCourier({ customer: c1, agent: a1, branch: b1, receiverName: "Ramesh Kannan", receiverPhone: "90000 77777", deliveryAddress: "19 Besant Nagar, Chennai", type: "Bulk / Other", weight: 5, daysAgoBooked: 8, status: "Cancelled", paid: false });

  return db;
}
