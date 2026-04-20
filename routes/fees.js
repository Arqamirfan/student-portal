const express = require('express');
const router = express.Router();
const { db } = require('../database');
const { authenticateToken } = require('../middleware/auth');

// GET fee records
router.get('/', authenticateToken, (req, res) => {
  const fees = db.prepare(`
    SELECT * FROM fees
    WHERE student_id = ?
    ORDER BY month DESC
  `).all(req.student.id);

  const summary = {
    total_fee: fees.reduce((s, f) => s + f.amount, 0),
    paid: fees.filter(f => f.status === 'paid').reduce((s, f) => s + f.amount, 0),
    unpaid: fees.filter(f => f.status === 'unpaid').reduce((s, f) => s + f.amount, 0),
    overdue: fees.filter(f => f.status === 'unpaid' && f.due_date < new Date().toISOString().substring(0, 10)).length
  };

  res.json({ success: true, fees, summary });
});

// MARK FEE AS PAID (for demo/admin use)
router.patch('/:feeId/pay', authenticateToken, (req, res) => {
  const { payment_method, transaction_id } = req.body;

  db.prepare(`
    UPDATE fees SET
      status = 'paid',
      paid_date = date('now'),
      payment_method = ?,
      transaction_id = ?
    WHERE id = ? AND student_id = ?
  `).run(payment_method || 'Cash', transaction_id || 'N/A', req.params.feeId, req.student.id);

  res.json({ success: true, message: 'Payment recorded successfully.' });
});

module.exports = router;
