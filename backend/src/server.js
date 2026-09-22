require('dotenv').config();

const express = require('express');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const vendorRoutes = require('./routes/vendors');
const inventoryRoutes = require('./routes/inventory');
const customerRoutes = require('./routes/customers');
const salesRoutes = require('./routes/sales');
const paymentsRoutes = require('./routes/payments');
const returnsRoutes = require('./routes/returns');
const expensesRoutes = require('./routes/expenses');
const cashbookRoutes = require('./routes/cashbook');
const reportsRoutes = require('./routes/reports');
const adminRoutes = require('./routes/admin');
const exportRoutes = require('./routes/export');
const uploadRoutes = require('./routes/uploads');

const { requireAuth } = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

// ======================================================
// UPLOADS
// ======================================================
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'))
);

// ======================================================
// API ROUTES
// ======================================================

// Public health check
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Public routes: branches + login
app.use('/api', authRoutes);

// Protected routes
app.use('/api/vendors', vendorRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api', paymentsRoutes);
// NOTE (fixed): returnsRoutes' internal routes already declare their own
// full paths ('/returns' for the list, '/sales/:saleId/return' for
// creating one) -- same pattern as paymentsRoutes above -- so it must be
// mounted bare at '/api', NOT '/api/returns' (which was doubling the
// prefix and causing POST /api/sales/:id/return to 404).
app.use('/api', returnsRoutes);
app.use('/api/expenses', expensesRoutes);
app.use('/api/cashbook', cashbookRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/uploads', uploadRoutes);

// Protected test route
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ======================================================
// REACT FRONTEND
// ======================================================
// NOTE: Hostinger sirf 'backend' (Root Directory) ko deploy karta hai,
// isliye frontend ka built output 'backend/public' ke andar hona zaroori hai.
const frontendPath = path.join(__dirname, '..', 'public');

app.use(express.static(frontendPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ======================================================
// START SERVER
// ======================================================
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Yazman Motors backend running on port ${PORT}`);
});