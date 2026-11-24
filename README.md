# MediBook — clinic appointment booking backend

## Demo video

[Watch the MediBook demo (10 min)](https://youtu.be/vwfX8G3Ag3I)

Shows patient/doctor CRUD, booking rules, simultaneous-booking protection, cancellation with refund, waitlist promotion by the worker, reports, the feedback page in English and French, and the unit tests.


Express 5 · MySQL 8 · Redis (BullMQ) · Jest. No ORM; all SQL lives in `src/models` and uses `?` placeholders.

## Requirements

| Tool  | Version | Why |
|-------|---------|-----|
| Node.js | 18 or newer | runtime |
| MySQL | **8.0.16 or newer** | CHECK constraints are only enforced from 8.0.16; recursive CTEs need 8.0 |
| Redis | **6.2 or newer** | waitlist uses `LMOVE` |

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure the environment (edit the values in .env)
cp .env.example .env

# 3. Create a MySQL user that matches .env (once; run as the MySQL root user)
mysql -u root -p -e "CREATE USER IF NOT EXISTS 'medibook'@'localhost' IDENTIFIED BY 'change_me'; GRANT ALL PRIVILEGES ON medibook.* TO 'medibook'@'localhost';"

# 4. Create the database and load sample data
mysql -u root -p < database/schema.sql
mysql -u root -p < database/seed.sql

# 5. Make sure Redis is running (default 127.0.0.1:6379)
redis-server            # or: docker run -p 6379:6379 redis:7

# 6. Start the app (web server + worker, as two separate processes)
npm start
```

The API listens on `http://localhost:3000` (`PORT` in `.env`). `schema.sql` drops and recreates the `medibook` database, so steps 4 can be repeated to reset everything.

| Command | What it runs |
|---------|--------------|
| `npm start` | `scripts/start.js`: launches `src/server.js` (web) **and** `src/worker.js` (worker) as two separate OS processes |
| `npm run start:web` | web server only |
| `npm run start:worker` | worker only (run in a second terminal if you start the web server alone) |
| `npm test` | Jest unit tests — no MySQL or Redis needed |

### Environment variables (`.env.example`)

```
PORT=3000
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=medibook
DB_PASSWORD=change_me
DB_NAME=medibook
DB_CONNECTION_LIMIT=10
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=
AUDIT_LOG_PATH=logs/audit.log
```

`.env` is git-ignored; only `.env.example` is committed.

## Project structure

```
├── database/        schema.sql, seed.sql, schema-diagram.dot (source of the diagram)
├── schema-diagram.png
├── locales/         en.json, fr.json (feedback page text)
├── scripts/start.js launcher for the web + worker processes
├── tests/           Jest unit tests (pure functions only)
└── src/
    ├── config/      env.js (environment), businessRules.js (every clinic number, defined once)
    ├── models/      ALL SQL: db.js (pool, transactions), patient/doctor/appointment/report models
    ├── controllers/ HTTP layer: read the request, call services/models, send the response
    ├── services/    booking, cancellation and waitlist rules (shared by the API and the worker)
    ├── routes/      URL + method -> controller
    ├── validators/  pure input validation (incl. the slot/working-hours check)
    ├── queues/      Redis connection, BullMQ producers, waitlist store
    ├── workers/     job processors run by src/worker.js
    ├── middleware/  404 handler and the central error handler
    ├── docs/        openapi.js (OpenAPI 3 spec served by Swagger UI at /api-docs)
    ├── i18n/, views/ feedback page translation and HTML
    ├── utils/       AppError, audit logger (fs), refund calculator, date helpers
    ├── app.js       Express app
    ├── server.js    web process entry point
    └── worker.js    worker process entry point
```

`services/` is an addition to models/controllers/routes: booking rules are needed by both the HTTP controller and the waitlist worker, so they live in one place instead of being duplicated. Services never contain SQL; they call model functions.

## API

**Interactive docs:** with the app running, open **http://localhost:3000/api-docs** (Swagger UI). Every endpoint is listed with its request schema, a ready-to-run example and the possible error responses; use *Try it out* → *Execute* to call the live API. The raw OpenAPI 3 document is at `/api-docs.json` (it can be imported into Postman). The spec lives in `src/docs/openapi.js`.

All request and response bodies are JSON. Date/times are clinic-local and written `YYYY-MM-DD HH:mm`.

| Method | Path | Success | Purpose |
|--------|------|---------|---------|
| GET | `/api/patients` | 200 | list patients |
| POST | `/api/patients` | 201 + `Location` | create `{ fullName, email, phone }` |
| GET | `/api/patients/:id` | 200 | one patient |
| PUT | `/api/patients/:id` | 200 | replace (all fields required) |
| PATCH | `/api/patients/:id` | 200 | partial update |
| DELETE | `/api/patients/:id` | 204 | delete (409 if they have appointments) |
| GET/POST | `/api/doctors` | 200 / 201 | list / create `{ fullName, specialty, consultationFee, room }` |
| GET/PUT/PATCH/DELETE | `/api/doctors/:id` | 200 / 204 | as for patients |
| GET | `/api/doctors/:id/statistics` | 200 | revenue, upcoming count, next-7-days per-day counts, utilization |
| POST | `/api/appointments` | 201 | book `{ patientId, doctorId, datetime }` |
| GET | `/api/appointments` | 200 | list; filters `?doctorId=&patientId=&status=&date=` |
| GET | `/api/appointments/:id` | 200 | one appointment |
| POST | `/api/appointments/:id/cancellation` | 200 | cancel; response includes the refund |
| POST | `/api/waitlist` | 202 | join the waitlist `{ patientId, doctorId, datetime }` |
| GET | `/api/waitlist?doctorId=&date=` | 200 | see a doctor-day's waitlist in order |
| GET | `/api/reports/doctors` | 200 | every doctor's totals and revenue |
| GET | `/api/reports/busy-days` | 200 | doctor-days more than 80% booked |
| GET | `/feedback?lang=fr` | 200 | course feedback page (en default, fr) |
| GET | `/api-docs` | 200 | Swagger UI (interactive API docs) |

Errors always have the shape `{ "error": { "status", "code", "message", "details?" } }`:
400 malformed input (with a `details` list per field) · 404 unknown id or route · 409 conflict with current state (slot taken, day full, duplicate email, already cancelled, record still referenced) · 422 well-formed but breaks a business rule (past slot, outside hours, off-boundary, cannot cancel a past appointment, joining a waitlist for a free slot) · 503 MySQL/Redis unavailable.

Quick try (with the seed data):

```bash
curl -X POST localhost:3000/api/appointments -H "Content-Type: application/json" \
  -d '{"patientId":6,"doctorId":1,"datetime":"2027-03-15 15:00"}'   # 12th slot of the day -> 201
curl -X POST localhost:3000/api/appointments -H "Content-Type: application/json" \
  -d '{"patientId":2,"doctorId":1,"datetime":"2027-03-15 16:00"}'   # day full -> 409 + waitlist offer
curl -X POST localhost:3000/api/waitlist -H "Content-Type: application/json" \
  -d '{"patientId":2,"doctorId":1,"datetime":"2027-03-15 16:00"}'   # 202, position 1
curl -X POST localhost:3000/api/appointments/10/cancellation        # refund + worker promotes patient 2
```

## Design decisions

### Part A/B — schema

- **3NF.** The spreadsheet mixes three things. Patient columns depend only on the patient, doctor columns (specialty, fee, room) only on the doctor, and the remaining columns on the booking. Each became its own table; `appointments` references the other two (1:N each).
- **`amount_paid` is not a copy of `consultation_fee`.** It is what this booking cost when it was made (AP-002 paid 120.00 against a 150.00 fee, and fees change), so it is a fact about the appointment.
- **Money is `DECIMAL(10,2)`, slots are `DATETIME`.** Never floating point for money.
- **One live booking per doctor slot — visible in the schema.** MySQL has no partial unique index, so `active_slot` is a stored generated column equal to `appt_datetime` while `status = 'BOOKED'` and `NULL` once cancelled. `UNIQUE (doctor_id, active_slot)` then forbids two live bookings for the same doctor slot, while any number of cancelled rows (NULLs) may share it. That is what lets a cancelled slot be rebooked while its record is kept. `UNIQUE (patient_id, active_slot)` does the same for patients. The column is computed by MySQL, so it can never disagree with `status`.
- **CHECK constraints repeat the timing rules in the database** (30-minute boundary, 09:00–16:30 start times, refund 0…amount paid, cancellation fields present only when cancelled). "Future only" cannot be a CHECK because MySQL forbids `NOW()` in CHECK constraints; the service enforces it.
- **Foreign keys use `ON DELETE RESTRICT`.** Appointments are refund history, so a patient or doctor with appointments cannot be deleted (409).

### Part C — booking, cancellation, REST choices

**URLs.** Resources are plural nouns; the HTTP method carries the action. Cancelling is modelled as `POST /api/appointments/:id/cancellation` — creating the cancellation (with its refund) of an appointment — rather than `DELETE`, because the appointment is not deleted: the row is kept for refund history. It returns 200 with the refund and the updated appointment. Joining the waitlist returns **202 Accepted** because the booking happens later, in the worker.

**Booking rules** (`src/services/appointmentService.js`):
1. `validateAppointmentSlot` (pure) checks format (400), 30-minute boundary, working hours and future-only (422). Working hours 09:00–17:00 with 30-minute slots means the last slot **starts at 16:30**; 17:00 is rejected.
2. Inside one transaction: lock the doctor row (`SELECT … FOR UPDATE`), check the patient exists, check the slot and the patient are free, count the doctor's bookings that day, insert with `amount_paid` = the doctor's current fee (the client never sends a price).

**Simultaneous requests.** Two requests for the same doctor both try to lock the same doctor row; the second waits until the first commits. The transaction runs at `READ COMMITTED`, so when the second request continues, its slot check and daily count see the first request's booking. This closes **both** races: the shared-slot race and the 12-per-day race (two requests for *different* slots when 11 are booked). The `UNIQUE (doctor_id, active_slot)` key is the final safety net; if it ever fires, the duplicate-key error is turned into the same 409 `SLOT_TAKEN`. Tested by firing 6 simultaneous requests at one slot (one 201, five 409) and 5 simultaneous requests for different slots on an 11/12 day (one 201, day ends at exactly 12).

**Refund policy** (`src/utils/refundCalculator.js`), computed only on the server from the time of cancellation:

| Notice before the appointment | Refund |
|---|---|
| more than 48 hours | 100% |
| from 24 hours up to and including 48 hours | 50% |
| less than 24 hours | 0% |

Both boundaries belong to the middle tier: exactly 48h is not "more than 48h", and exactly 24h is inside "24–48 hours". Amounts are computed in whole cents. Appointments that have already started cannot be cancelled (422).

**Cancellation atomicity.** One transaction locks the appointment row (`FOR UPDATE`, so it cannot be cancelled twice), computes the refund and runs a single `UPDATE` that sets `status`, `cancelled_at` and `refund_amount` together. They cannot be saved separately, and `chk_appt_cancellation_record` makes a cancelled row without a refund impossible. After the commit the slot is free (its `active_slot` becomes NULL), the audit log is written and a `slot-freed` job notifies the waitlist.

**Statistics and reports** are aggregated in SQL (`src/models/reportModel.js`): `LEFT JOIN` + `COALESCE` so doctors with zero appointments appear with 0; a recursive CTE produces all 7 days so empty days show 0; utilization = booked / 12 × 100 per day and booked / (12 × 7) for the window. Revenue collected = `amount_paid − refund_amount` (payment is taken at booking). The busy-days threshold is compared in integers (`booked × 100 > 12 × 80`), so a day qualifies from 10 bookings (83.33%); 9 bookings (75%) does not.

### Part D — audit log

`src/utils/auditLogger.js` appends one JSON object per line to `logs/audit.log` with `fs/promises.appendFile` (async; there is no `*Sync` call anywhere in `src/`). The `logs/` directory is created on first use with `mkdir({ recursive: true })` (and again at startup), and recreated if it is deleted while running. Request handlers call `logAudit`, which catches every error and only prints it, because the booking/cancellation is already committed — a disk problem must not turn a successful booking into an error. The worker uses `appendAuditEntry`, which does throw, so a failed write makes the notification job retry. Events: `APPOINTMENT_BOOKED`, `APPOINTMENT_CANCELLED`, `WAITLIST_JOINED`, `WAITLIST_PROMOTED`, `WAITLIST_ENTRY_DROPPED`, `NOTIFICATION_SENT`.

### Part E — waitlist and notification queues

- **Offer.** When a booking fails with 409 `SLOT_TAKEN` or `DAY_FULL`, the error's `details.waitlist` tells the client how to join. `POST /api/waitlist` only accepts a slot that really is unavailable, and refuses duplicates.
- **Storage.** One Redis list per doctor per day (`medibook:waitlist:<doctorId>:<date>`), first come first served. A waitlisted patient accepts the first slot that is freed with that doctor on that day.
- **Promotion** runs in `src/worker.js`, a separate process from the web server. Each cancellation enqueues a BullMQ `slot-freed` job; the worker (concurrency 1) books the first waiting patient through the same `bookAppointment` service the API uses, so every rule still applies.
- **If the promoted booking fails, the patient is not lost.** The worker never pops-and-hopes: `LMOVE` atomically moves the entry into a `…:processing` list, and it is removed only after the booking commits. A `finally` block moves anything still in processing back to the **front** of the waitlist in the original order. By failure:
  - patient already has an appointment at that time → skipped for this slot, keeps their place, the next patient is tried;
  - slot taken again / day full / slot now in the past → stop; everyone keeps their place;
  - patient record deleted → removed and logged (`WAITLIST_ENTRY_DROPPED`);
  - unexpected error (e.g. MySQL down) → entries restored, the job throws, BullMQ retries 5 times with exponential backoff. Tested by stopping MySQL during a promotion: the patients stayed queued and were booked after MySQL came back.
  - If the worker crashes mid-promotion, it restores every leftover processing list when it starts.
- **Notifications.** Every confirmed booking (API or waitlist) enqueues an `appointment-confirmation` job; the worker writes the SMS/email text to the audit log as `NOTIFICATION_SENT`.
- **Redis down.** Enqueuing is wrapped in a timeout and never fails the request: bookings and cancellations still succeed (the job is sent when Redis returns, or the error is logged). Endpoints that need Redis directly (`/api/waitlist`) return 503.

### Part F — tests

`npm test` runs 30+ unit tests against pure functions only, with fixed dates: every refund tier, both exact boundaries (24h, 48h) and one minute either side; the slot validator (09:00, 16:30, 17:00 exactly, 08:30, 09:15, seconds, past, "now", malformed strings, 30 February, 25:00); patient validation; and the feedback page's language fallback. No test opens a MySQL or Redis connection.

### Part G — feedback page

`GET /feedback` renders a page whose title, instructions and 5 questions come from `locales/en.json` or `locales/fr.json`. `?lang=fr` shows French; a missing, unknown, repeated or malformed `lang` falls back to English. Today's date is formatted with `Intl.DateTimeFormat` for the active locale (`en-GB` / `fr-FR`). Every translated string is HTML-escaped.
