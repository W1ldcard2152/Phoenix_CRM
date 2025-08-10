#!/usr/bin/env node
/**
 * Create Placeholder User Script
 * 
 * Creates the placeholder user that was referenced in the migration script
 * for migrated work order notes.
 */

const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

// Import models
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

async function createPlaceholderUser() {
  try {
    const placeholderUserId = '507f1f77bcf86cd799439011';
    
    console.log('🔍 Checking if placeholder user already exists...');
    const existingUser = await User.findById(placeholderUserId);
    
    if (existingUser) {
      console.log('✅ Placeholder user already exists');
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Role: ${existingUser.role}`);
      return;
    }
    
    console.log('👤 Creating placeholder user for migrated notes...');
    
    // Create user with the specific ID used in migration
    const placeholderUser = new User({
      _id: placeholderUserId,
      name: 'System Migration',
      email: 'migration@phoenixcrm.com',
      password: 'TempPassword123!',
      passwordConfirm: 'TempPassword123!',
      role: 'admin'
    });
    
    await placeholderUser.save();
    
    console.log('✅ Placeholder user created successfully!');
    console.log(`   ID: ${placeholderUser._id}`);
    console.log(`   Name: ${placeholderUser.name}`);
    console.log(`   Email: ${placeholderUser.email}`);
    console.log(`   Role: ${placeholderUser.role}`);
    console.log('   Note: This user was created for migrated diagnostic notes');
    
  } catch (error) {
    console.error('❌ Failed to create placeholder user:', error);
    throw error;
  }
}

async function main() {
  try {
    await connectToDatabase();
    await createPlaceholderUser();
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('\n🔌 Disconnected from MongoDB');
  }
}

// Run the script
main();