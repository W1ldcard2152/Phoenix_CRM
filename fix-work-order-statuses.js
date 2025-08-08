#!/usr/bin/env node
/**
 * Fix Work Order Statuses Script
 * 
 * This script fixes work orders that were accidentally changed to "Invoiced" status.
 * Since we don't have status history, it will set them to reasonable defaults based
 * on their completion state and totals.
 * 
 * Usage: node fix-work-order-statuses.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import the WorkOrder model
const WorkOrder = require('./src/server/models/WorkOrder');

// MongoDB connection string
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

async function fixWorkOrderStatuses() {
  try {
    console.log('🔍 Finding work orders with "Invoiced" status...');
    
    // Find all work orders with "Invoiced" status
    const invoicedWorkOrders = await WorkOrder.find({ status: 'Invoiced' })
      .populate('customer', 'name')
      .populate('vehicle', 'year make model');

    console.log(`📋 Found ${invoicedWorkOrders.length} work orders with "Invoiced" status`);

    if (invoicedWorkOrders.length === 0) {
      console.log('✅ No work orders need fixing');
      return;
    }

    console.log('\n📊 Work orders to be fixed:');
    console.log('----------------------------------------');

    const updates = [];

    for (const workOrder of invoicedWorkOrders) {
      const customerName = workOrder.customer?.name || 'Unknown Customer';
      const vehicle = workOrder.vehicle 
        ? `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`
        : 'No Vehicle';

      console.log(`• ID: ${workOrder._id}`);
      console.log(`  Customer: ${customerName}`);
      console.log(`  Vehicle: ${vehicle}`);
      console.log(`  Date: ${workOrder.date.toLocaleDateString()}`);
      console.log(`  Current Status: ${workOrder.status}`);

      // Determine new status based on work order properties
      let newStatus;
      
      if (workOrder.totalActual > 0) {
        // If there's an actual total, it's likely completed
        newStatus = 'Completed - Need Payment';
      } else if (workOrder.totalEstimate > 0) {
        // If there's only an estimate, it might be in progress
        newStatus = 'In Progress';
      } else {
        // No totals, probably just created
        newStatus = 'Created';
      }

      console.log(`  New Status: ${newStatus}`);
      console.log('');

      updates.push({
        workOrderId: workOrder._id,
        oldStatus: workOrder.status,
        newStatus: newStatus,
        customerName: customerName,
        vehicle: vehicle
      });
    }

    // Ask for confirmation
    console.log('⚠️  This will update the status of these work orders.');
    console.log('   Do you want to proceed? (y/N): ');
    
    // Simple confirmation for Node.js script
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirmation = await new Promise((resolve) => {
      rl.question('', (answer) => {
        rl.close();
        resolve(answer.toLowerCase());
      });
    });

    if (confirmation !== 'y' && confirmation !== 'yes') {
      console.log('❌ Operation cancelled');
      return;
    }

    console.log('\n🔧 Updating work order statuses...');

    let updatedCount = 0;
    for (const update of updates) {
      try {
        await WorkOrder.findByIdAndUpdate(
          update.workOrderId,
          { status: update.newStatus },
          { new: true }
        );
        
        console.log(`✅ Updated ${update.customerName} - ${update.vehicle}: ${update.oldStatus} → ${update.newStatus}`);
        updatedCount++;
      } catch (error) {
        console.error(`❌ Failed to update ${update.workOrderId}:`, error.message);
      }
    }

    console.log(`\n🎉 Successfully updated ${updatedCount} out of ${updates.length} work orders`);
    
    if (updatedCount < updates.length) {
      console.log('⚠️  Some updates failed. Please check the errors above.');
    }

  } catch (error) {
    console.error('❌ Error fixing work order statuses:', error);
    throw error;
  }
}

// Alternative function to reset all to a single status
async function resetAllToStatus(targetStatus = 'Created') {
  try {
    console.log(`🔧 Resetting all "Invoiced" work orders to "${targetStatus}"...`);
    
    const result = await WorkOrder.updateMany(
      { status: 'Invoiced' },
      { status: targetStatus }
    );

    console.log(`✅ Updated ${result.modifiedCount} work orders to "${targetStatus}" status`);
  } catch (error) {
    console.error('❌ Error resetting work order statuses:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectToDatabase();
    
    // Check command line arguments for operation mode
    const args = process.argv.slice(2);
    const mode = args[0];
    
    if (mode === 'reset') {
      const targetStatus = args[1] || 'Created';
      await resetAllToStatus(targetStatus);
    } else {
      await fixWorkOrderStatuses();
    }

  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Show usage information
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Work Order Status Fix Script

Usage:
  node fix-work-order-statuses.js              # Smart fix based on work order data
  node fix-work-order-statuses.js reset        # Reset all to "Created" status  
  node fix-work-order-statuses.js reset "In Progress"  # Reset all to specified status

Options:
  --help, -h    Show this help message

Examples:
  # Smart fix (recommended)
  node fix-work-order-statuses.js

  # Simple reset to "Created"
  node fix-work-order-statuses.js reset

  # Reset to "In Progress"
  node fix-work-order-statuses.js reset "In Progress"
`);
  process.exit(0);
}

// Run the script
main();