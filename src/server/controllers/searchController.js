const Customer = require('../models/Customer');
const Vehicle = require('../models/Vehicle');
const WorkOrder = require('../models/WorkOrder');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

/**
 * Escape special regex characters to prevent ReDoS and NoSQL injection attacks
 * @param {string} str - The string to escape
 * @returns {string} - The escaped string safe for use in regex
 */
const escapeRegex = (str) => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const globalSearch = catchAsync(async (req, res, next) => {
  const { q: searchQuery } = req.query;

  if (!searchQuery || searchQuery.trim().length < 1) {
    return res.status(200).json({
      status: 'success',
      data: {
        results: []
      }
    });
  }

  // Limit query length to prevent ReDoS attacks
  const rawQuery = searchQuery.trim().slice(0, 100);
  // Escape regex special characters to prevent injection
  const query = escapeRegex(rawQuery);
  const results = [];

  try {
    // Search customers
    const customers = await Customer.find({
      $or: [
        { name: { $regex: query, $options: 'i' } },
        { phone: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { 'address.street': { $regex: query, $options: 'i' } },
        { 'address.city': { $regex: query, $options: 'i' } },
        { 'address.state': { $regex: query, $options: 'i' } },
        { 'address.zip': { $regex: query, $options: 'i' } },
        { notes: { $regex: query, $options: 'i' } }
      ]
    }).limit(10);

    customers.forEach(customer => {
      results.push({
        type: 'customer',
        id: customer._id,
        title: customer.name,
        subtitle: customer.phone,
        description: customer.email || customer.fullAddress || 'No additional info'
      });
    });

    // Search vehicles
    // For multi-word queries (e.g., "GMC Acadia"), try to match across make/model fields
    // Split on whitespace and escape each part for safe regex use
    const queryParts = rawQuery.split(/\s+/).filter(part => part.length > 0).map(escapeRegex);

    let vehicleSearchConditions = [
      { make: { $regex: query, $options: 'i' } },
      { model: { $regex: query, $options: 'i' } },
      { year: isNaN(parseInt(rawQuery)) ? null : parseInt(rawQuery) },
      { vin: { $regex: query, $options: 'i' } },
      { licensePlate: { $regex: query, $options: 'i' } },
      { licensePlateState: { $regex: query, $options: 'i' } },
      { notes: { $regex: query, $options: 'i' } }
    ].filter(condition => condition !== null);

    // If query has multiple words, also search for combinations across make/model
    if (queryParts.length > 1) {
      // Try to match first part to make and remaining parts to model
      const firstPart = queryParts[0];
      const remainingParts = queryParts.slice(1).join(' ');

      vehicleSearchConditions.push({
        $and: [
          { make: { $regex: firstPart, $options: 'i' } },
          { model: { $regex: remainingParts, $options: 'i' } }
        ]
      });

      // Also try matching any individual word to make or model
      queryParts.forEach(part => {
        if (part.length > 1) {
          vehicleSearchConditions.push(
            { make: { $regex: part, $options: 'i' } },
            { model: { $regex: part, $options: 'i' } }
          );
        }
      });
    }

    const vehicles = await Vehicle.find({
      $or: vehicleSearchConditions
    })
    .populate('customer', 'name phone')
    .limit(10);

    vehicles.forEach(vehicle => {
      results.push({
        type: 'vehicle',
        id: vehicle._id,
        title: vehicle.displayName,
        subtitle: vehicle.customer ? `Owner: ${vehicle.customer.name}` : 'Unknown Owner',
        description: `${vehicle.vin ? `VIN: ${vehicle.vin}` : ''} ${vehicle.licensePlate ? `License: ${vehicle.licensePlate}` : ''}`.trim()
      });
    });

    // Search work orders
    const workOrders = await WorkOrder.find({
      $or: [
        { serviceRequested: { $regex: query, $options: 'i' } },
        { diagnosticNotes: { $regex: query, $options: 'i' } },
        { status: { $regex: query, $options: 'i' } },
        { 'services.description': { $regex: query, $options: 'i' } },
        { 'parts.name': { $regex: query, $options: 'i' } },
        { 'parts.partNumber': { $regex: query, $options: 'i' } },
        { 'labor.description': { $regex: query, $options: 'i' } }
      ]
    })
    .populate('customer', 'name phone')
    .populate('vehicle', 'year make model')
    .sort({ createdAt: -1 })
    .limit(10);

    workOrders.forEach(workOrder => {
      const vehicleInfo = workOrder.vehicle 
        ? `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`
        : 'No vehicle';
      
      results.push({
        type: 'workorder',
        id: workOrder._id,
        title: `Work Order - ${workOrder.customer ? workOrder.customer.name : 'Unknown Customer'}`,
        subtitle: vehicleInfo,
        description: workOrder.serviceRequested || 'No service description'
      });
    });

    // Advanced search: If query looks like a date, search by date
    const dateQuery = new Date(query);
    if (!isNaN(dateQuery.getTime()) && query.length > 5) {
      const startOfDay = new Date(dateQuery.getFullYear(), dateQuery.getMonth(), dateQuery.getDate());
      const endOfDay = new Date(dateQuery.getFullYear(), dateQuery.getMonth(), dateQuery.getDate() + 1);

      const workOrdersByDate = await WorkOrder.find({
        createdAt: {
          $gte: startOfDay,
          $lt: endOfDay
        }
      })
      .populate('customer', 'name phone')
      .populate('vehicle', 'year make model')
      .limit(5);

      workOrdersByDate.forEach(workOrder => {
        // Avoid duplicates
        if (!results.some(r => r.type === 'workorder' && r.id === workOrder._id.toString())) {
          const vehicleInfo = workOrder.vehicle 
            ? `${workOrder.vehicle.year} ${workOrder.vehicle.make} ${workOrder.vehicle.model}`
            : 'No vehicle';
          
          results.push({
            type: 'workorder',
            id: workOrder._id,
            title: `Work Order - ${workOrder.customer ? workOrder.customer.name : 'Unknown Customer'}`,
            subtitle: vehicleInfo,
            description: `Created: ${workOrder.createdAt.toLocaleDateString()}`
          });
        }
      });
    }

    // If query looks like a phone number, prioritize phone matches
    const phoneRegex = /[\d\-\(\)\s\+]+/;
    if (phoneRegex.test(rawQuery) && rawQuery.length > 6) {
      // Extract only digits for phone search (safe, no special chars)
      const phoneDigits = rawQuery.replace(/\D/g, '');
      const phoneMatches = await Customer.find({
        phone: { $regex: phoneDigits, $options: 'i' }
      }).limit(5);

      // Move phone matches to front
      phoneMatches.forEach(customer => {
        const existingIndex = results.findIndex(r => r.type === 'customer' && r.id === customer._id.toString());
        if (existingIndex !== -1) {
          const match = results.splice(existingIndex, 1)[0];
          results.unshift(match);
        }
      });
    }

    // Sort results: customers first, then vehicles, then work orders, then by relevance
    results.sort((a, b) => {
      const typeOrder = { customer: 1, vehicle: 2, workorder: 3 };
      if (typeOrder[a.type] !== typeOrder[b.type]) {
        return typeOrder[a.type] - typeOrder[b.type];
      }

      // Within same type, prioritize exact matches (use rawQuery for comparison)
      const aExact = a.title.toLowerCase().includes(rawQuery.toLowerCase()) ? 1 : 0;
      const bExact = b.title.toLowerCase().includes(rawQuery.toLowerCase()) ? 1 : 0;
      return bExact - aExact;
    });

    res.status(200).json({
      status: 'success',
      results: results.length,
      data: {
        results: results.slice(0, 20) // Limit to 20 results
      }
    });

  } catch (error) {
    console.error('Global search error:', error);
    return next(new AppError('Search failed. Please try again.', 500));
  }
});

module.exports = {
  globalSearch
};