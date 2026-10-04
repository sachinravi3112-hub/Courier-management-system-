# SwiftRoute — Courier Management System

A working Courier Management System covering the full workflow you described:

```
Customer → Courier Booking → Pickup → In Transit → Out for Delivery → Delivered
```

Since Salesforce Objects and Flows only run inside a Salesforce org (not in VS Code),
this is built as a standalone web app that implements the **same data model, status
automation, tracking search, and dashboard reports** — so you can run it immediately
with no org, no login, and no paid setup. Everything is plain HTML / CSS / JavaScript,
with your data kept in the browser's local storage.

## How to run it in VS Code

1. Unzip the folder and open it in VS Code.
2. Easiest option: install the **Live Server** extension, right-click `index.html`,
   and choose **"Open with Live Server."**
3. No-extension option: open a terminal in the folder and run:
   ```
   npm start
   ```
   then open the URL it prints (`http://localhost:5173`). This uses a small
   built-in server (`server.js`) with **zero npm packages to install.**
4. You can also just double-click `index.html` to open it directly in a browser —
   everything still works.

## Where each Salesforce object went

| Salesforce Object | In this app |
|---|---|
| Customer | `Customers` tab — add/view sender records |
| Courier | `Courier Booking` tab — Courier ID and Tracking Number are auto-generated, Sender is a lookup to Customer |
| Delivery Agent | `Delivery Agents` tab — the booking form auto-assigns the least-busy agent, or you can pick one manually |
| Branch | `Branches` tab — originating branch for a booking |
| Payment | Created automatically with every booking (mode + Paid/Pending status) |

## Automation implemented

- New courier → status starts at **Booked**, tracking number generated, delivery agent
  auto-assigned by current workload.
- `Delivery` tab moves a shipment forward one step at a time
  (Booked → Picked Up → In Transit → Out for Delivery → Delivered), with a **Cancel**
  option while a shipment is still Booked or Picked Up.
- When a shipment is marked **Delivered**, the delivery date is stamped automatically
  and a confirmation notification is simulated (shown as a toast + logged to
  **Recent activity** on the dashboard).

## Tracking

The `Tracking` tab looks up a shipment by tracking number (or Courier ID) and shows
sender, receiver, addresses, dates, and a status timeline.

## Reports & Dashboard

The `Dashboard` shows total / delivered / in transit / pending / cancelled counts,
couriers by delivery agent, and bookings by month. `Reports` adds a full sortable
table of every booking with payment status.

## Notes

- Data is seeded with a couple of demo customers, branches, agents, and courier
  bookings on first run so the dashboard isn't empty. Everything after that is
  whatever you add — stored in your browser's local storage (per browser, not
  shared between devices).
- To reset to a clean slate, open the browser DevTools console on the page and run:
  `localStorage.clear()`, then refresh.
- Pricing is a simple placeholder formula (base rate by courier type + ₹15/kg over
  1kg) — easy to change in `js/data.js` (`BASE_RATE` and `calcAmount`).
