const Part = require('../models/Part');
const { validationResult } = require('express-validator');

// Get all parts
const getAllParts = async (req, res) => {
  try {
    const { 
      category, 
      vendor, 
      brand, 
      isActive = 'true',
      search,
      page = 1,
      limit = 50,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query;

    // Build filter object
    const filter = {};
    
    if (category) filter.category = category;
    if (vendor) filter.vendor = new RegExp(vendor, 'i');
    if (brand) filter.brand = new RegExp(brand, 'i');
    if (isActive !== 'all') filter.isActive = isActive === 'true';

    // Handle search
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      filter.$or = [
        { name: searchRegex },
        { partNumber: searchRegex },
        { brand: searchRegex },
        { vendor: searchRegex },
        { category: searchRegex }
      ];
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Execute query
    const parts = await Part.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalParts = await Part.countDocuments(filter);
    const totalPages = Math.ceil(totalParts / parseInt(limit));

    res.json({
      success: true,
      data: {
        parts,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalParts,
          hasNextPage: page < totalPages,
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    console.error('Error fetching parts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch parts',
      error: error.message
    });
  }
};

// Get single part by ID
const getPartById = async (req, res) => {
  try {
    const part = await Part.findById(req.params.id);
    
    if (!part) {
      return res.status(404).json({
        success: false,
        message: 'Part not found'
      });
    }

    res.json({
      success: true,
      data: { part }
    });
  } catch (error) {
    console.error('Error fetching part:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch part',
      error: error.message
    });
  }
};

// Create new part
const createPart = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const partData = {
      name: req.body.name,
      partNumber: req.body.partNumber,
      price: parseFloat(req.body.price),
      cost: parseFloat(req.body.cost),
      vendor: req.body.vendor,
      category: req.body.category,
      brand: req.body.brand,
      warranty: req.body.warranty || '',
      notes: req.body.notes || '',
      url: req.body.url || '',
      isActive: req.body.isActive !== undefined ? req.body.isActive : true
    };

    const part = new Part(partData);
    await part.save();

    res.status(201).json({
      success: true,
      message: 'Part created successfully',
      data: { part }
    });
  } catch (error) {
    console.error('Error creating part:', error);
    
    // Handle duplicate part number
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Part number already exists',
        error: 'Duplicate part number'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create part',
      error: error.message
    });
  }
};

// Update part
const updatePart = async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation errors',
        errors: errors.array()
      });
    }

    const updateData = {
      name: req.body.name,
      partNumber: req.body.partNumber,
      price: parseFloat(req.body.price),
      cost: parseFloat(req.body.cost),
      vendor: req.body.vendor,
      category: req.body.category,
      brand: req.body.brand,
      warranty: req.body.warranty || '',
      notes: req.body.notes || '',
      url: req.body.url || '',
      isActive: req.body.isActive !== undefined ? req.body.isActive : true,
      lastUpdated: new Date()
    };

    const part = await Part.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true, runValidators: true }
    );

    if (!part) {
      return res.status(404).json({
        success: false,
        message: 'Part not found'
      });
    }

    res.json({
      success: true,
      message: 'Part updated successfully',
      data: { part }
    });
  } catch (error) {
    console.error('Error updating part:', error);
    
    // Handle duplicate part number
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Part number already exists',
        error: 'Duplicate part number'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update part',
      error: error.message
    });
  }
};

// Delete part (soft delete by setting isActive to false)
const deletePart = async (req, res) => {
  try {
    const part = await Part.findByIdAndUpdate(
      req.params.id,
      { isActive: false, lastUpdated: new Date() },
      { new: true }
    );

    if (!part) {
      return res.status(404).json({
        success: false,
        message: 'Part not found'
      });
    }

    res.json({
      success: true,
      message: 'Part deactivated successfully',
      data: { part }
    });
  } catch (error) {
    console.error('Error deleting part:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete part',
      error: error.message
    });
  }
};

// Search parts
const searchParts = async (req, res) => {
  try {
    const { q: query, limit = 20 } = req.query;
    
    if (!query || query.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Search query is required'
      });
    }

    const parts = await Part.searchParts(query.trim())
      .limit(parseInt(limit))
      .sort({ name: 1 });

    res.json({
      success: true,
      data: { parts }
    });
  } catch (error) {
    console.error('Error searching parts:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search parts',
      error: error.message
    });
  }
};

// Get parts categories
const getCategories = async (req, res) => {
  try {
    const categories = await Part.distinct('category', { isActive: true });
    
    res.json({
      success: true,
      data: { categories: categories.sort() }
    });
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories',
      error: error.message
    });
  }
};

// Get parts vendors
const getVendors = async (req, res) => {
  try {
    const vendors = await Part.distinct('vendor', { isActive: true });
    
    res.json({
      success: true,
      data: { vendors: vendors.sort() }
    });
  } catch (error) {
    console.error('Error fetching vendors:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch vendors',
      error: error.message
    });
  }
};

// Get parts brands
const getBrands = async (req, res) => {
  try {
    const brands = await Part.distinct('brand', { isActive: true });
    
    res.json({
      success: true,
      data: { brands: brands.sort() }
    });
  } catch (error) {
    console.error('Error fetching brands:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch brands',
      error: error.message
    });
  }
};

module.exports = {
  getAllParts,
  getPartById,
  createPart,
  updatePart,
  deletePart,
  searchParts,
  getCategories,
  getVendors,
  getBrands
};