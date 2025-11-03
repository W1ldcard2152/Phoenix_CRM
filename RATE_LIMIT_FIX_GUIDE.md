# MongoDB Rate Limiting - Fix Guide

## 🔍 Problem Summary

You're experiencing **429 "Too Many Requests"** errors due to hitting MongoDB Atlas rate limits. This is causing:
- Sporadic failures loading data
- "err_bad_request" errors in console
- Elements failing to load on the frontend

## 📊 Root Causes Identified

1. **Excessive Database Queries**: 123 database queries across 20 controller files
2. **Limited Caching**: Only appointments cached; work orders, customers, vehicles hit DB every time
3. **Missing Database Indexes**: Queries scanning entire collections instead of using indexes
4. **Expensive Population Queries**: Multiple `.populate()` calls increasing DB load
5. **N+1 Query Problems**: Some endpoints making multiple separate queries

## ✅ Solutions Implemented

### 1. ✓ Expanded Caching Service

**File**: `src/server/services/cacheService.js`

Added support for:
- Work Order caching (5-minute TTL)
- Service Writer's Corner caching (3-minute TTL)
- Generic cache functions for future expansion

### 2. ✓ Database Index Migration Script

**File**: `src/server/utils/addDatabaseIndexes.js`

Adds indexes to all frequently queried fields.

## 🚀 How to Apply the Fixes

### Step 1: Add Database Indexes (CRITICAL)

Run the index migration script:

```bash
node src/server/utils/addDatabaseIndexes.js
```

This will create indexes on:
- Work Orders: `status`, `customer`, `vehicle`, `date`, `assignedTechnician`
- Appointments: `startTime`, `endTime`, `workOrder`, `technician`, `status`
- Customers: `email`, `phone`, `name`
- Vehicles: `owner`, `vin`, `licensePlate`
- Full-text search indexes on all searchable fields

**Expected result**: Queries will run 10-100x faster

### Step 2: Implement Caching in Controllers

Add caching to high-traffic endpoints. Here are the priority changes:

#### A. Cache `getServiceWritersCorner` (Line 798 in workOrderController.js)

**Before:**
```javascript
exports.getServiceWritersCorner = catchAsync(async (req, res, next) => {
  // ... existing query logic
```

**After:**
```javascript
exports.getServiceWritersCorner = catchAsync(async (req, res, next) => {
  // Check cache first
  const cached = cacheService.getServiceWritersCorner();
  if (cached) {
    return res.status(200).json(cached);
  }

  // ... existing query logic (only runs on cache miss)

  // Before sending response, cache it:
  const responseData = {
    status: 'success',
    data: {
      diagComplete: { workOrders: diagComplete, count: diagComplete.length },
      partsReceived: { workOrders: partsReceived, count: partsReceived.length },
      awaitingPayment: { workOrders: awaitingPayment, count: awaitingPayment.length }
    }
  };

  cacheService.setServiceWritersCorner(responseData);
  res.status(200).json(responseData);
});
```

#### B. Cache `getWorkOrdersByStatus` (Line 539)

**Add at the start:**
```javascript
// Check cache first
const cached = cacheService.getWorkOrdersByStatus(status);
if (cached) {
  return res.status(200).json({
    status: 'success',
    results: cached.length,
    data: { workOrders: cached }
  });
}
```

**Before the response:**
```javascript
cacheService.setWorkOrdersByStatus(status, workOrders);
```

#### C. Invalidate Cache on Updates

Add to `updateWorkOrder` (after line 395):
```javascript
// Invalidate work order cache
cacheService.invalidateAllWorkOrders();
cacheService.invalidateServiceWritersCorner();
```

Add to `createWorkOrder` (after line 188):
```javascript
// Invalidate work order cache
cacheService.invalidateAllWorkOrders();
cacheService.invalidateServiceWritersCorner();
```

Add to `deleteWorkOrder` (after line 428):
```javascript
// Invalidate work order cache
cacheService.invalidateAllWorkOrders();
cacheService.invalidateServiceWritersCorner();
```

### Step 3: Check Your MongoDB Atlas Tier

1. Log into MongoDB Atlas
2. Go to your cluster
3. Check **Cluster Tier** under "Configuration"

**Rate Limits by Tier:**
- **M0 (Free)**: 100 operations/second, very strict limits
- **M2/M5 (Shared)**: Higher limits but still constrained
- **M10+ (Dedicated)**: Production-ready with relaxed limits

**Recommendation**: If you're on M0 and still having issues after indexes + caching, upgrade to M10 ($0.08/hour = ~$57/month)

### Step 4: Monitor Performance

#### Check Cache Effectiveness

Add this endpoint to see cache stats:

```javascript
// In workOrderController.js or a new statsController.js
exports.getCacheStats = catchAsync(async (req, res, next) => {
  const stats = cacheService.getStats();
  res.status(200).json({
    status: 'success',
    data: { stats }
  });
});
```

#### MongoDB Atlas Performance Monitoring

1. Go to MongoDB Atlas Dashboard
2. Click "Performance" tab
3. Look for:
   - **Slow Queries**: Should decrease dramatically after indexes
   - **Index Usage**: Verify your new indexes are being used
   - **Operation Rate**: Should decrease with caching

## 📈 Expected Improvements

After implementing all fixes:

| Metric | Before | After |
|--------|--------|-------|
| Database queries/request | 3-10 | 1-2 (with cache hits: 0) |
| Query execution time | 50-500ms | 5-50ms |
| Cache hit rate | ~20% (appointments only) | ~60-80% (all entities) |
| Rate limit errors | Frequent | Rare/None |

## 🔧 Additional Optimizations (Optional)

### 5. Reduce Population Depth

Some queries populate nested objects 3 levels deep. Consider:
- Using `.select()` to limit fields returned
- Creating denormalized views for frequently accessed data
- Using aggregation pipelines instead of populate for complex queries

### 6. Implement Request Throttling

Add rate limiting on your API to prevent client-side issues from overwhelming the DB:

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/api/', apiLimiter);
```

### 7. Add Request Deduplication

If multiple users are viewing the same data, serve from cache instead of making redundant DB queries.

## 🚨 Emergency Mitigation

If you're still hitting rate limits after all fixes:

1. **Temporary**: Increase cache TTL to 15-30 minutes
2. **Increase MongoDB Tier**: Upgrade to M10 or higher
3. **Enable Connection Pooling**: Ensure your MongoDB connection uses pooling (should be default)
4. **Reduce Frontend Polling**: Check if any frontend components are polling too frequently

## 📝 Implementation Checklist

- [ ] Run database index migration script
- [ ] Add caching to `getServiceWritersCorner`
- [ ] Add caching to `getWorkOrdersByStatus`
- [ ] Add cache invalidation to create/update/delete operations
- [ ] Verify indexes are created in MongoDB Atlas
- [ ] Monitor performance for 24 hours
- [ ] Check MongoDB Atlas tier and consider upgrade if needed
- [ ] Add cache stats endpoint for monitoring

## 🔍 Verify the Fix

After implementing:

1. Clear browser cache and restart your app
2. Open browser dev tools → Network tab
3. Navigate through the app normally
4. Check server logs for `[Cache HIT]` messages
5. Verify MongoDB Atlas shows lower operation rate
6. Confirm no more 429 errors in console

## 📞 Need Help?

If issues persist after implementing these fixes:

1. Check MongoDB Atlas alerts for specific error messages
2. Review server logs for any errors or warnings
3. Use MongoDB Atlas Performance Advisor for additional optimization suggestions
4. Consider implementing request logging to identify which endpoints are causing the most load
