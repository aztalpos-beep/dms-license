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
