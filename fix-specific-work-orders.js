#!/usr/bin/env node
/**
 * Fix Specific Work Order Statuses Script
 * 
 * This script updates specific work orders that were accidentally changed to "Invoiced" status
 * using the exact customer and vehicle data provided by the user.
 * 
 * Usage: node fix-specific-work-orders.js
 */

const mongoose = require('mongoose');
require('dotenv').config();

// Import the WorkOrder model
const WorkOrder = require('./src/server/models/WorkOrder');

// MongoDB connection string
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/phoenixcrm';

// Work order data to fix (from user's CSV)
const workOrderUpdates = [
  { customerName: "Susan Decker", vehicleYear: 2012, vehicleMake: "Kia", vehicleModel: "Optima", service: "Accessory Belt/Tensioner & Downstream O2 Sensor", newStatus: "Created" },
  { customerName: "Gregory Moore", vehicleYear: null, vehicleMake: null, vehicleModel: null, service: "Test Appt Without Vehicle", newStatus: "Scheduled" },
  { customerName: "Alex O'Conner", vehicleYear: 2008, vehicleMake: "Ford", vehicleModel: "F-150", service: "Diagnose Timing Codes (Over-Advanced & Retarded)", newStatus: "Scheduled" },
  { customerName: "Angel Castillo", vehicleYear: 2014, vehicleMake: "Jeep", vehicleModel: "Grand Cherokee", service: "Tires mount and balance", newStatus: "Scheduled" },
  { customerName: "Dante Smith", vehicleYear: 2013, vehicleMake: "Cadillac", vehicleModel: "SRX", service: "Full Diag", newStatus: "Scheduled" },
  { customerName: "Dave Krieger", vehicleYear: 2011, vehicleMake: "Audi", vehicleModel: "Q7 TDI", service: "Diagnose P229F (NOx Sensor - Bank 1 Sensor 2)", newStatus: "Scheduled" },
  { customerName: "Wilson Augustave", vehicleYear: 2016, vehicleMake: "Land Rover", vehicleModel: "Range Rover Sport", service: "Diagnose & Repair Check Engine Light", newStatus: "Scheduled" },
  { customerName: "Nick Wenz", vehicleYear: 2001, vehicleMake: "Audi", vehicleModel: "S4", service: "Oil Pressure Switch Install (+1 more)", newStatus: "Scheduled" },
  { customerName: "Susan Decker", vehicleYear: 2012, vehicleMake: "Kia", vehicleModel: "Optima", service: "Replace Exhaust Flex Pipe", newStatus: "Scheduled" },
  { customerName: "Sheena Cruz", vehicleYear: 2018, vehicleMake: "Hyundai", vehicleModel: "Tucson", service: "Diagnose lack of power on accelleration", newStatus: "Scheduled" },
  { customerName: "Billy Q", vehicleYear: 2014, vehicleMake: "Audi", vehicleModel: "Q5", service: "Diagnose AC not working", newStatus: "Scheduled" },
  { customerName: "Katie Moore", vehicleYear: 2021, vehicleMake: "GMC", vehicleModel: "Acadia", service: "Grille & Air Shutter", newStatus: "Scheduled" },
  { customerName: "Kevin Fosdick", vehicleYear: 2016, vehicleMake: "Land Rover", vehicleModel: "Discovery Sport", service: "Confirm Diagnosis of Blower Motor & Blower Motor", newStatus: "Scheduled" },
  { customerName: "Walter Johnson", vehicleYear: 2016, vehicleMake: "Dodge", vehicleModel: "Charger Hellcat", service: "Engine Replacement (Customer Supplied Engine) (+1 more)", newStatus: "Scheduled" },
  { customerName: "Shawn Ross", vehicleYear: 2018, vehicleMake: "Ford", vehicleModel: "Transit 250", service: "Replace Front Struts", newStatus: "Scheduled" },
  { customerName: "Robert Hahn", vehicleYear: 2019, vehicleMake: "GMC", vehicleModel: "Sierra Elevation", service: "4 Tires Mount & Balance", newStatus: "Completed - Need Payment" },
  { customerName: "Mike Smith", vehicleYear: 2014, vehicleMake: "Audi", vehicleModel: "A8", service: "Steering Column Intermediate Link (+1 more)", newStatus: "Completed - Need Payment" },
  { customerName: "Ronald Johnson", vehicleYear: 2007, vehicleMake: "Mercedes", vehicleModel: "R500", service: "Rear left air strut not inflating", newStatus: "Completed - Need Payment" },
  { customerName: "Whitney Vanderbrook", vehicleYear: 2010, vehicleMake: "Toyota", vehicleModel: "Sienna", service: "Repheel", newStatus: "Completed - Paid" },
  { customerName: "Thomas Doucet", vehicleYear: null, vehicleMake: null, vehicleModel: null, service: "Transmission Replacement", newStatus: "On Hold" }
];

async function connectToDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

async function findWorkOrder(update) {
  try {
    // Build query to find the work order
    const query = {};
    
    // First, find the customer
    const Customer = mongoose.model('Customer');
    const customer = await Customer.findOne({ 
      name: { $regex: new RegExp('^' + update.customerName + '$', 'i') } 
    });
    
    if (!customer) {
      console.log(`⚠️  Customer "${update.customerName}" not found`);
      return null;
    }
    
    query.customer = customer._id;
    
    // If vehicle info provided, try to match vehicle
    if (update.vehicleYear || update.vehicleMake || update.vehicleModel) {
      const Vehicle = mongoose.model('Vehicle');
      const vehicleQuery = { customer: customer._id };
      
      if (update.vehicleYear) vehicleQuery.year = update.vehicleYear;
      if (update.vehicleMake) vehicleQuery.make = { $regex: new RegExp('^' + update.vehicleMake + '$', 'i') };
      if (update.vehicleModel) vehicleQuery.model = { $regex: new RegExp('^' + update.vehicleModel + '$', 'i') };
      
      const vehicle = await Vehicle.findOne(vehicleQuery);
      if (vehicle) {
        query.vehicle = vehicle._id;
      }
    }
    
    // Find work orders matching the query
    const workOrders = await WorkOrder.find(query)
      .populate('customer', 'name')
      .populate('vehicle', 'year make model');
    
    if (workOrders.length === 0) {
      console.log(`⚠️  No work orders found for ${update.customerName}`);
      return null;
    }
    
    // If multiple work orders, try to match by service description
    if (workOrders.length > 1) {
      const serviceMatch = workOrders.find(wo => {
        const woService = wo.services && wo.services.length > 0 
          ? wo.services[0].description 
          : wo.serviceRequested || '';
        return woService.toLowerCase().includes(update.service.toLowerCase().substring(0, 20));
      });
      
      if (serviceMatch) {
        return serviceMatch;
      }
      
      // If no service match, return the most recent one
      return workOrders.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    }
    
    return workOrders[0];
  } catch (error) {
    console.error(`❌ Error finding work order for ${update.customerName}:`, error.message);
    return null;
  }
}

async function fixSpecificWorkOrders() {
  try {
    console.log('🔍 Finding and updating specific work orders...\n');
    
    const results = [];
    let successCount = 0;
    let failCount = 0;
    
    for (const update of workOrderUpdates) {
      console.log(`🔍 Processing: ${update.customerName} - ${update.service.substring(0, 40)}...`);
      
      const workOrder = await findWorkOrder(update);
      
      if (!workOrder) {
        console.log(`❌ Could not find work order for ${update.customerName}`);
        failCount++;
        results.push({ ...update, status: 'NOT_FOUND', workOrderId: null });
        continue;
      }
      
      // Check if it's currently "Invoiced"
      if (workOrder.status !== 'Invoiced') {
        console.log(`ℹ️  Work order already has status "${workOrder.status}" (not Invoiced)`);
        results.push({ ...update, status: 'ALREADY_CORRECT', workOrderId: workOrder._id, currentStatus: workOrder.status });
        continue;
      }
      
      // Update the status
      try {
        workOrder.status = update.newStatus;
        await workOrder.save();
        
        console.log(`✅ Updated ${update.customerName}: Invoiced → ${update.newStatus}`);
        successCount++;
        results.push({ ...update, status: 'UPDATED', workOrderId: workOrder._id, oldStatus: 'Invoiced' });
      } catch (saveError) {
        console.log(`❌ Failed to update ${update.customerName}: ${saveError.message}`);
        failCount++;
        results.push({ ...update, status: 'UPDATE_FAILED', workOrderId: workOrder._id, error: saveError.message });
      }
    }
    
    console.log('\n📊 Summary:');
    console.log('================');
    console.log(`✅ Successfully updated: ${successCount}`);
    console.log(`❌ Failed to update: ${failCount}`);
    console.log(`ℹ️  Already correct status: ${results.filter(r => r.status === 'ALREADY_CORRECT').length}`);
    console.log(`⚠️  Not found: ${results.filter(r => r.status === 'NOT_FOUND').length}`);
    
    // Show detailed results
    console.log('\n📋 Detailed Results:');
    console.log('===================');
    for (const result of results) {
      console.log(`${result.customerName}: ${result.status}${result.workOrderId ? ` (ID: ${result.workOrderId})` : ''}`);
    }
    
  } catch (error) {
    console.error('❌ Error fixing work order statuses:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectToDatabase();
    await fixSpecificWorkOrders();
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
Specific Work Order Status Fix Script

This script updates the exact work orders provided by the user that were
accidentally changed to "Invoiced" status.

Usage:
  node fix-specific-work-orders.js

The script will:
1. Find each work order by customer name and vehicle info
2. Verify it has "Invoiced" status
3. Update it to the correct status as specified
4. Provide detailed results

No confirmation is needed as this targets specific records.
`);
  process.exit(0);
}

// Run the script
main();