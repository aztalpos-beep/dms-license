// server-index.js — minimal bootstrap. Merge this into your existing DMS backend's
// main server file; don't run two separate servers in production.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const licenseRoutes = require('./license-api');
const syncRoutes = require('./sync-api');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/', licenseRoutes);
app.use('/', syncRoutes);

app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`DMS license/sync server running on port ${PORT}`);
});

// Express error-handling middleware (catches anything that calls next(err))
app.use((err, req, res, next) => {
  console.error('[server] unhandled route error:', err);
  if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
});

// Last line of defense: log instead of letting the whole process die on a
// stray unhandled rejection. All routes are already wrapped in asyncRoute()
// (see license-api.js / sync-api.js), so this should rarely fire — but if
// something new is added later without that wrapper, this keeps the server
// (and everyone else's in-flight requests) alive instead of crashing.
process.on('unhandledRejection', (err) => {
  console.error('[server] UNHANDLED REJECTION (server stayed up):', err);
});
process.on('uncaughtException', (err) => {
  console.error('[server] UNCAUGHT EXCEPTION (server stayed up):', err);
});
