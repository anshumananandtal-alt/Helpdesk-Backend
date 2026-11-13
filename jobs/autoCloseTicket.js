// jobs/autoCloseTickets.js
import cron from 'node-cron';
import Ticket from '../models/ticket.js';
import AuditTrail from '../models/auditTrail.js';
import User from '../models/user.js';
import { AUTO_CLOSE_CONFIG } from '../config/autoClose.js';

export async function autoCloseResolvedTickets() {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_CONFIG.AUTO_CLOSE_AFTER_DAYS * 24 * 60 * 60 * 1000);

  // Only tickets that have stayed resolved past the cutoff
  const tickets = await Ticket.find({
    status: 'resolved',
    resolvedAt: { $lte: cutoff },
  }).select('_id version creator');

  let closed = 0;

  for (const t of tickets) {
    // Atomic update: the filter re-checks status and version,
    // so it never overwrites a customer reopening at the same moment.
    const updated = await Ticket.findOneAndUpdate(
      { _id: t._id, status: 'resolved', version: t.version },
      { $set: { status: 'closed', closedAt: new Date() }, $inc: { version: 1 } },
      { new: true }
    );

    if (!updated) continue; // changed in between, skip it

    const actorId = (await User.findOne({ role: 'admin' }).select('_id').lean())?._id ?? updated.creator ?? t.creator;

    if (actorId) {
      await AuditTrail.create({
        ticket: t._id,
        field: 'status',
        oldValue: 'resolved',
        newValue: 'closed',
        changedBy: actorId,
        action: 'status changed',
      });
    }

    closed++;
  }

  console.log(`[auto-close] closed ${closed} of ${tickets.length} candidates`);
}

export function startAutoCloseJob() {
  cron.schedule(AUTO_CLOSE_CONFIG.CRON_SCHEDULE, async () => {
    try {
      await autoCloseResolvedTickets();
    } catch (err) {
      console.error('[auto-close] failed', err);
    }
  });
}