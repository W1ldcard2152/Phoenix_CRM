/**
 * Migration Script: Merge Duplicate Work Orders Created by Appointment Bug
 *
 * Problem: A bug in the appointment-complete cron job, combined with the
 * one-to-many work-order-to-appointments change, caused new (empty) work
 * orders to be spawned from appointments that already belonged to an
 * existing work order.
 *
 * Detection: Duplicate work orders were created by Appointment.createWorkOrder()
 * and share a distinct fingerprint:
 *   - appointmentId is set (populated by createWorkOrder)
 *   - 0 parts, 0 labor
 *   - appointments array has exactly 1 entry
 *   - Another, older work order exists for the same customer + vehicle
 *
 * Merge action (per duplicate):
 *   1. Move the appointment reference to the original work order
 *   2. Update the appointment document to point back to the original WO
 *   3. Remove the duplicate from the vehicle's serviceHistory
 *   4. Delete the duplicate work order
 *
 * Usage:
 *   node scripts/merge-duplicate-workorders.js              # dry run (default)
 *   node scripts/merge-duplicate-workorders.js --execute     # actually write changes
 */

const path = require('path');
const fs = require('fs');
const mongoose = require('mongoose');
const moment = require('moment-timezone');
const dotenv = require('dotenv');

// Load env
dotenv.config({ path: path.resolve(__dirname, '../.env'), override: true });

const MONGODB_URI = process.env.MONGODB_URI;
const DRY_RUN = !process.argv.includes('--execute');

if (!MONGODB_URI) {
  console.error('ERROR: MONGODB_URI not found in .env');
  process.exit(1);
}

// ─── Backup ────────────────────────────────────────────────────────────────────

async function backupCollections(db) {
  const timestamp = moment().format('YYYY-MM-DD_HH-mm-ss');
  const backupDir = path.resolve(__dirname, '../backups', `merge-duplicates-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  // Only back up the collections this script touches
  const collectionsToBackup = ['workorders', 'appointments', 'vehicles'];
  console.log(`\nBacking up ${collectionsToBackup.length} collections to ${backupDir} ...`);

  for (const name of collectionsToBackup) {
    const docs = await db.collection(name).find({}).toArray();
    const filePath = path.join(backupDir, `${name}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2));
    console.log(`  + ${name} (${docs.length} documents)`);
  }

  console.log(`Backup complete: ${backupDir}\n`);
  return backupDir;
}

// ─── Detection ─────────────────────────────────────────────────────────────────

/**
 * Find work orders that match the fingerprint of having been auto-created
 * by Appointment.createWorkOrder() and are likely duplicates.
 */
async function findDuplicateCandidates(db) {
  const workorders = db.collection('workorders');

  // Step 1: Find WOs that look auto-created from an appointment
  // Fingerprint: appointmentId is set, 0 parts, 0 labor, appointments array length <= 1
  const candidates = await workorders.find({
    appointmentId: { $exists: true, $ne: null },
    $or: [
      { parts: { $size: 0 } },
      { parts: { $exists: false } }
    ]
  }).toArray();

  // Further filter in JS for labor check and appointments array size
  const filtered = candidates.filter(wo => {
    const noParts = !wo.parts || wo.parts.length === 0;
    const noLabor = !wo.labor || wo.labor.length === 0;
    const singleAppointment = !wo.appointments || wo.appointments.length <= 1;
    return noParts && noLabor && singleAppointment;
  });

  return filtered;
}

/**
 * For each candidate duplicate, find the likely original work order:
 * same customer + vehicle, created before the candidate, with more data
 * or at least not matching the auto-created fingerprint.
 */
async function matchOriginals(db, candidates) {
  const workorders = db.collection('workorders');
  const appointments = db.collection('appointments');
  const mergeProposals = [];
  const skipped = [];

  for (const dup of candidates) {
    // The duplicate must have a customer and vehicle to match against
    if (!dup.customer || !dup.vehicle) {
      skipped.push({
        _id: dup._id,
        reason: 'No customer or vehicle on duplicate — cannot match to original'
      });
      continue;
    }

    // Find other WOs with the same customer + vehicle, excluding the duplicate itself
    const possibleOriginals = await workorders.find({
      _id: { $ne: dup._id },
      customer: dup.customer,
      vehicle: dup.vehicle,
      // Exclude quotes
      status: { $nin: ['Quote', 'Quote - Archived'] }
    }).sort({ createdAt: 1 }).toArray();

    if (possibleOriginals.length === 0) {
      skipped.push({
        _id: dup._id,
        reason: 'No other work order found for same customer + vehicle'
      });
      continue;
    }

    // Prefer the original that was created before the duplicate
    // and has more substance (parts, labor, or was further along)
    let bestMatch = null;

    for (const orig of possibleOriginals) {
      const origCreatedBefore = new Date(orig.createdAt) < new Date(dup.createdAt);
      const origHasParts = orig.parts && orig.parts.length > 0;
      const origHasLabor = orig.labor && orig.labor.length > 0;
      const origHasSubstance = origHasParts || origHasLabor;

      // Strong match: created before AND has parts/labor
      if (origCreatedBefore && origHasSubstance) {
        bestMatch = orig;
        break; // Take the earliest one with substance
      }

      // Fallback: created before (even if also empty — it's the original)
      if (origCreatedBefore && !bestMatch) {
        bestMatch = orig;
      }
    }

    if (!bestMatch) {
      // All other WOs were created AFTER the candidate — this one might
      // actually be the original, not the duplicate
      skipped.push({
        _id: dup._id,
        reason: 'Candidate is the oldest WO for this customer+vehicle — likely not a duplicate'
      });
      continue;
    }

    // Look up the appointment that's on the duplicate
    const appointmentId = dup.appointmentId;
    const appointment = appointmentId
      ? await appointments.findOne({ _id: appointmentId })
      : null;

    mergeProposals.push({
      duplicate: dup,
      original: bestMatch,
      appointment
    });
  }

  return { mergeProposals, skipped };
}

// ─── Merge ─────────────────────────────────────────────────────────────────────

async function executeMerges(db, mergeProposals) {
  const workorders = db.collection('workorders');
  const appointmentsColl = db.collection('appointments');
  const vehicles = db.collection('vehicles');

  let mergedCount = 0;

  for (const { duplicate, original, appointment } of mergeProposals) {
    const dupId = duplicate._id;
    const origId = original._id;
    const apptId = duplicate.appointmentId;

    // 1. Add the appointment to the original WO's appointments array (if not already there)
    if (apptId) {
      const alreadyLinked = (original.appointments || []).some(
        id => id.toString() === apptId.toString()
      );

      if (!alreadyLinked) {
        await workorders.updateOne(
          { _id: origId },
          { $addToSet: { appointments: apptId } }
        );
      }

      // If the original has no appointmentId set, set it for backward compat
      if (!original.appointmentId) {
        await workorders.updateOne(
          { _id: origId },
          { $set: { appointmentId: apptId } }
        );
      }

      // 2. Update the appointment document to point to the original WO
      await appointmentsColl.updateOne(
        { _id: apptId },
        { $set: { workOrder: origId } }
      );
    }

    // Also move any other appointments from the duplicate's array
    if (duplicate.appointments && duplicate.appointments.length > 0) {
      for (const extraApptId of duplicate.appointments) {
        if (extraApptId.toString() === (apptId || '').toString()) continue; // Already handled

        await workorders.updateOne(
          { _id: origId },
          { $addToSet: { appointments: extraApptId } }
        );
        await appointmentsColl.updateOne(
          { _id: extraApptId },
          { $set: { workOrder: origId } }
        );
      }
    }

    // 3. Remove the duplicate from the vehicle's serviceHistory
    if (duplicate.vehicle) {
      await vehicles.updateOne(
        { _id: duplicate.vehicle },
        { $pull: { serviceHistory: dupId } }
      );
    }

    // 4. Delete the duplicate work order
    await workorders.deleteOne({ _id: dupId });

    mergedCount++;
  }

  return mergedCount;
}

// ─── Reporting ─────────────────────────────────────────────────────────────────

function printProposals(mergeProposals, skipped) {
  if (mergeProposals.length === 0) {
    console.log('No duplicate work orders detected. Nothing to merge.');
    return;
  }

  console.log(`Found ${mergeProposals.length} duplicate work order(s) to merge:\n`);

  for (let i = 0; i < mergeProposals.length; i++) {
    const { duplicate, original, appointment } = mergeProposals[i];
    const dupDate = moment(duplicate.createdAt).format('YYYY-MM-DD HH:mm');
    const origDate = moment(original.createdAt).format('YYYY-MM-DD HH:mm');
    const origParts = (original.parts || []).length;
    const origLabor = (original.labor || []).length;

    console.log(`  ${i + 1}. DUPLICATE  ${duplicate._id}`);
    console.log(`     Created:  ${dupDate}  |  Status: ${duplicate.status}`);
    console.log(`     Service:  ${duplicate.serviceRequested || '(none)'}`);
    if (appointment) {
      console.log(`     Appt:     ${appointment._id} (${appointment.serviceType}, ${appointment.status})`);
    }
    console.log(`     MERGE INTO  ${original._id}`);
    console.log(`     Created:  ${origDate}  |  Status: ${original.status}`);
    console.log(`     Service:  ${original.serviceRequested || '(none)'}`);
    console.log(`     Data:     ${origParts} part(s), ${origLabor} labor item(s)`);
    console.log('');
  }

  if (skipped.length > 0) {
    console.log(`Skipped ${skipped.length} candidate(s):`);
    for (const { _id, reason } of skipped) {
      console.log(`  - ${_id}: ${reason}`);
    }
    console.log('');
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('================================================================');
  console.log('  Merge Duplicate Work Orders (Appointment Bug Fix)');
  console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (no changes will be written)' : 'EXECUTE (writing changes)'}`);
  console.log('================================================================');

  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB.');

  const db = mongoose.connection.db;

  // Step 1: Back up affected collections
  const backupDir = await backupCollections(db);

  // Step 2: Find duplicate candidates
  console.log('--- Scanning for duplicate work orders ---');
  const candidates = await findDuplicateCandidates(db);
  console.log(`Found ${candidates.length} candidate(s) matching auto-created fingerprint.`);

  // Step 3: Match each candidate to its likely original
  const { mergeProposals, skipped } = await matchOriginals(db, candidates);

  // Step 4: Report
  printProposals(mergeProposals, skipped);

  // Step 5: Execute (or skip in dry run)
  if (mergeProposals.length > 0) {
    if (DRY_RUN) {
      console.log('DRY RUN — no changes written. Re-run with --execute to apply merges.');
    } else {
      console.log('Executing merges...');
      const mergedCount = await executeMerges(db, mergeProposals);
      console.log(`Merged ${mergedCount} duplicate work order(s).`);
    }
  }

  // Save migration log
  const logPath = path.join(backupDir, 'migration-log.json');
  fs.writeFileSync(logPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    candidatesFound: candidates.length,
    proposedMerges: mergeProposals.length,
    skipped: skipped.length,
    merges: mergeProposals.map(({ duplicate, original, appointment }) => ({
      duplicateId: duplicate._id,
      duplicateStatus: duplicate.status,
      duplicateCreated: duplicate.createdAt,
      originalId: original._id,
      originalStatus: original.status,
      originalCreated: original.createdAt,
      appointmentId: appointment?._id || null
    })),
    skippedDetails: skipped
  }, null, 2));
  console.log(`\nMigration log saved to: ${logPath}`);

  await mongoose.disconnect();
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
