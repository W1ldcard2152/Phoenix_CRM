#!/usr/bin/env node
/**
 * Debug Script: Work Order Notes API
 * 
 * This script helps debug the work order notes API issue by:
 * 1. Checking database connection
 * 2. Verifying models are properly loaded
 * 3. Checking if users exist
 * 4. Testing the API endpoints manually
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

// Import models
const WorkOrder = require('./src/server/models/WorkOrder');
const WorkOrderNote = require('./src/server/models/WorkOrderNote');
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

async function debugNotesAPI() {
  try {
    console.log('🔍 Starting Work Order Notes API Debug...\n');
    
    // 1. Check if models are properly loaded
    console.log('📦 Checking models:');
    console.log(`   WorkOrder model: ${WorkOrder ? '✅ Loaded' : '❌ Missing'}`);
    console.log(`   WorkOrderNote model: ${WorkOrderNote ? '✅ Loaded' : '❌ Missing'}`);
    console.log(`   User model: ${User ? '✅ Loaded' : '❌ Missing'}\n`);
    
    // 2. Check users in database
    console.log('👤 Checking users in database:');
    const userCount = await User.countDocuments();
    console.log(`   Total users: ${userCount}`);
    
    if (userCount > 0) {
      const users = await User.find().select('name email role').limit(5);
      console.log('   Sample users:');
      users.forEach(user => {
        console.log(`   - ${user.name} (${user.email}) - ${user.role}`);
      });
    } else {
      console.log('   ⚠️  No users found in database');
    }
    
    // Check the placeholder user ID from migration
    const placeholderUserId = '507f1f77bcf86cd799439011';
    const placeholderUser = await User.findById(placeholderUserId);
    console.log(`   Placeholder user (${placeholderUserId}): ${placeholderUser ? '✅ Exists' : '❌ Missing'}\n`);
    
    // 3. Check work orders
    console.log('📋 Checking work orders:');
    const workOrderCount = await WorkOrder.countDocuments();
    console.log(`   Total work orders: ${workOrderCount}`);
    
    if (workOrderCount > 0) {
      const sampleWorkOrders = await WorkOrder.find().select('_id customer vehicle serviceRequested').limit(3);
      console.log('   Sample work orders:');
      sampleWorkOrders.forEach(wo => {
        console.log(`   - ${wo._id} - ${wo.serviceRequested?.substring(0, 50) || 'No service description'}...`);
      });
    }
    console.log();
    
    // 4. Check work order notes
    console.log('📝 Checking work order notes:');
    const noteCount = await WorkOrderNote.countDocuments();
    console.log(`   Total work order notes: ${noteCount}`);
    
    if (noteCount > 0) {
      const sampleNotes = await WorkOrderNote.find()
        .populate('workOrder', 'serviceRequested')
        .populate('createdBy', 'name email')
        .select('content isCustomerFacing createdAt')
        .limit(3);
      
      console.log('   Sample notes:');
      sampleNotes.forEach(note => {
        console.log(`   - ${note.content.substring(0, 50)}... (Customer facing: ${note.isCustomerFacing})`);
        console.log(`     Work Order: ${note.workOrder?.serviceRequested?.substring(0, 30) || 'Unknown'}...`);
        console.log(`     Created by: ${note.createdBy?.name || 'Unknown'} on ${note.createdAt.toLocaleDateString()}`);
      });
    }
    console.log();
    
    // 5. Test a simple API operation
    console.log('🧪 Testing API operations:');
    if (workOrderCount > 0) {
      const firstWorkOrder = await WorkOrder.findOne();
      console.log(`   Testing with work order: ${firstWorkOrder._id}`);
      
      // Try to get notes for this work order
      const notesForWorkOrder = await WorkOrderNote.find({ workOrder: firstWorkOrder._id })
        .populate('createdBy', 'name email')
        .sort({ createdAt: -1 });
      
      console.log(`   Notes for this work order: ${notesForWorkOrder.length}`);
      notesForWorkOrder.forEach((note, index) => {
        console.log(`   ${index + 1}. ${note.content.substring(0, 50)}... (${note.isCustomerFacing ? 'Customer' : 'Private'})`);
      });
    }
    
    console.log('\n🎉 Debug completed successfully!');
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectToDatabase();
    await debugNotesAPI();
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
Work Order Notes API Debug Script

This script helps debug issues with the work order notes API by:
- Checking database connectivity
- Verifying models are loaded correctly
- Checking for users (including placeholder user from migration)
- Examining work orders and notes data
- Testing basic API operations

Usage:
  node debug-notes-api.js

Environment:
  Requires MONGODB_URI in .env file
`);
  process.exit(0);
}

// Run the debug
main();