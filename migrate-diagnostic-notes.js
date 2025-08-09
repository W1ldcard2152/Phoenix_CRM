#!/usr/bin/env node
/**
 * Migration Script: Diagnostic Notes to Work Order Notes
 * 
 * This script migrates existing diagnostic notes from WorkOrder documents
 * to the new WorkOrderNotes collection, splitting on double line breaks.
 * 
 * Usage: node migrate-diagnostic-notes.js
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

// Import models
const WorkOrder = require('./src/server/models/WorkOrder');
const WorkOrderNote = require('./src/server/models/WorkOrderNote');
const Customer = require('./src/server/models/Customer');
const Vehicle = require('./src/server/models/Vehicle');
const User = require('./src/server/models/User');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phoenixcrm';

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function migrateDiagnosticNotes() {
  try {
    console.log('🔍 Finding work orders with diagnostic notes...');
    
    // Find all work orders that have diagnostic notes
    const workOrdersWithNotes = await WorkOrder.find({
      diagnosticNotes: { $exists: true, $ne: '', $ne: null }
    }).populate('customer', 'name');

    console.log(`📋 Found ${workOrdersWithNotes.length} work orders with diagnostic notes`);

    if (workOrdersWithNotes.length === 0) {
      console.log('✅ No diagnostic notes to migrate');
      return;
    }

    let totalNotesCreated = 0;
    let workOrdersProcessed = 0;
    const defaultUserId = '507f1f77bcf86cd799439011'; // Placeholder user ID for migrated notes

    for (const workOrder of workOrdersWithNotes) {
      try {
        console.log(`\n📝 Processing work order: ${workOrder._id} (${workOrder.customer?.name || 'Unknown Customer'})`);
        
        // Split diagnostic notes on double line breaks
        const diagnosticNotes = workOrder.diagnosticNotes.trim();
        const noteSegments = diagnosticNotes
          .split(/\n\s*\n/)  // Split on double line breaks (with optional whitespace)
          .map(segment => segment.trim())
          .filter(segment => segment.length > 0); // Remove empty segments

        console.log(`   Found ${noteSegments.length} note segment(s)`);

        // Create a WorkOrderNote for each segment
        for (let i = 0; i < noteSegments.length; i++) {
          const content = noteSegments[i];
          
          if (content.length > 0) {
            const note = new WorkOrderNote({
              workOrder: workOrder._id,
              content: content,
              isCustomerFacing: false, // Default to private as requested
              createdBy: defaultUserId,
              createdAt: workOrder.createdAt || new Date(), // Use work order creation date or current date
              updatedAt: workOrder.updatedAt || new Date()
            });

            await note.save();
            totalNotesCreated++;
            
            console.log(`   ✅ Created note ${i + 1}: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`);
          }
        }

        workOrdersProcessed++;
        
      } catch (error) {
        console.error(`❌ Error processing work order ${workOrder._id}:`, error.message);
      }
    }

    console.log('\n📊 Migration Summary:');
    console.log('=====================================');
    console.log(`Work orders processed: ${workOrdersProcessed}`);
    console.log(`Total notes created: ${totalNotesCreated}`);
    
    // Ask for confirmation before removing diagnostic notes
    console.log('\n⚠️  Ready to remove diagnostic notes from WorkOrder documents');
    console.log('   This will permanently delete the diagnosticNotes field from all work orders');
    console.log('   The data has been migrated to WorkOrderNotes collection');
    
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirmation = await new Promise((resolve) => {
      rl.question('   Proceed with cleanup? (yes/no): ', (answer) => {
        rl.close();
        resolve(answer.toLowerCase());
      });
    });

    if (confirmation === 'yes' || confirmation === 'y') {
      console.log('\n🧹 Cleaning up diagnostic notes from WorkOrder collection...');
      
      const updateResult = await WorkOrder.updateMany(
        { diagnosticNotes: { $exists: true } },
        { $unset: { diagnosticNotes: "" } }
      );
      
      console.log(`✅ Removed diagnosticNotes field from ${updateResult.modifiedCount} work orders`);
      console.log('\n🎉 Migration completed successfully!');
      
    } else {
      console.log('\n⏸️  Migration completed but diagnostic notes were NOT removed from WorkOrder collection');
      console.log('   You can manually remove them later or run this script again');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectToDatabase();
    await migrateDiagnosticNotes();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Show usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Diagnostic Notes Migration Script

This script migrates existing diagnostic notes from WorkOrder documents
to the new WorkOrderNotes collection.

Features:
- Splits diagnostic notes on double line breaks (\\n\\n)
- Creates separate WorkOrderNote entries for each segment  
- Sets all migrated notes as private (isCustomerFacing: false)
- Preserves creation timestamps from original work orders
- Provides confirmation before removing old diagnostic notes

Usage:
  node migrate-diagnostic-notes.js

The script will:
1. Find all work orders with diagnostic notes
2. Split each diagnostic note on double line breaks
3. Create WorkOrderNote entries for each segment
4. Ask for confirmation before removing old diagnostic notes
5. Clean up the diagnosticNotes field from WorkOrder collection
`);
  process.exit(0);
}

// Run the migration
main();