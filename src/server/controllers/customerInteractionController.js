const CustomerInteraction = require('../models/CustomerInteraction');
const WorkOrder = require('../models/WorkOrder');

// Get all interactions for a work order
exports.getWorkOrderInteractions = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    
    const interactions = await CustomerInteraction.find({ workOrder: workOrderId })
      .populate('customer', 'name phone email')
      .populate('createdBy', 'name')
      .populate('completedBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json(interactions);
  } catch (error) {
    console.error('Error fetching work order interactions:', error);
    res.status(500).json({ message: 'Error fetching interactions', error: error.message });
  }
};

// Get all interactions for a customer
exports.getCustomerInteractions = async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const interactions = await CustomerInteraction.find({ customer: customerId })
      .populate('workOrder', 'date status serviceRequested')
      .populate('createdBy', 'name')
      .populate('completedBy', 'name')
      .sort({ createdAt: -1 });
    
    res.json(interactions);
  } catch (error) {
    console.error('Error fetching customer interactions:', error);
    res.status(500).json({ message: 'Error fetching interactions', error: error.message });
  }
};

// Get interactions requiring follow-up
exports.getPendingFollowUps = async (req, res) => {
  try {
    const interactions = await CustomerInteraction.find({ 
      followUpRequired: true,
      completedAt: null 
    })
      .populate('workOrder', 'date status serviceRequested')
      .populate('customer', 'name phone email')
      .populate('createdBy', 'name')
      .sort({ followUpDate: 1, createdAt: -1 });
    
    res.json(interactions);
  } catch (error) {
    console.error('Error fetching pending follow-ups:', error);
    res.status(500).json({ message: 'Error fetching follow-ups', error: error.message });
  }
};

// Create a new interaction
exports.createInteraction = async (req, res) => {
  try {
    const interactionData = {
      ...req.body,
      createdBy: req.user?._id || req.body.createdBy
    };
    
    // Validate that work order exists
    const workOrder = await WorkOrder.findById(interactionData.workOrder);
    if (!workOrder) {
      return res.status(404).json({ message: 'Work order not found' });
    }
    
    // Use the customer from work order if not provided
    if (!interactionData.customer) {
      interactionData.customer = workOrder.customer;
    }
    
    const interaction = new CustomerInteraction(interactionData);
    await interaction.save();
    
    // Populate the response
    await interaction.populate('customer', 'name phone email');
    await interaction.populate('createdBy', 'name');
    
    res.status(201).json(interaction);
  } catch (error) {
    console.error('Error creating interaction:', error);
    res.status(400).json({ message: 'Error creating interaction', error: error.message });
  }
};

// Update an interaction
exports.updateInteraction = async (req, res) => {
  try {
    const { id } = req.params;
    
    const interaction = await CustomerInteraction.findByIdAndUpdate(
      id,
      req.body,
      { new: true, runValidators: true }
    )
      .populate('customer', 'name phone email')
      .populate('createdBy', 'name')
      .populate('completedBy', 'name');
    
    if (!interaction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }
    
    res.json(interaction);
  } catch (error) {
    console.error('Error updating interaction:', error);
    res.status(400).json({ message: 'Error updating interaction', error: error.message });
  }
};

// Complete a follow-up
exports.completeFollowUp = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user?._id || req.body.userId;
    
    const interaction = await CustomerInteraction.findById(id);
    
    if (!interaction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }
    
    await interaction.completeFollowUp(userId);
    
    await interaction.populate('customer', 'name phone email');
    await interaction.populate('createdBy', 'name');
    await interaction.populate('completedBy', 'name');
    
    res.json(interaction);
  } catch (error) {
    console.error('Error completing follow-up:', error);
    res.status(400).json({ message: 'Error completing follow-up', error: error.message });
  }
};

// Delete an interaction
exports.deleteInteraction = async (req, res) => {
  try {
    const { id } = req.params;
    
    const interaction = await CustomerInteraction.findByIdAndDelete(id);
    
    if (!interaction) {
      return res.status(404).json({ message: 'Interaction not found' });
    }
    
    res.json({ message: 'Interaction deleted successfully' });
  } catch (error) {
    console.error('Error deleting interaction:', error);
    res.status(500).json({ message: 'Error deleting interaction', error: error.message });
  }
};

// Get interaction statistics for a work order
exports.getInteractionStats = async (req, res) => {
  try {
    const { workOrderId } = req.params;
    
    const interactions = await CustomerInteraction.find({ workOrder: workOrderId });
    
    const stats = {
      totalInteractions: interactions.length,
      lastContact: interactions.length > 0 ? interactions[0].createdAt : null,
      pendingFollowUps: interactions.filter(i => i.followUpRequired && !i.completedAt).length,
      overdueFollowUps: interactions.filter(i => i.isOverdue).length,
      contactTypes: {},
      outcomes: {}
    };
    
    // Count contact types and outcomes
    interactions.forEach(interaction => {
      stats.contactTypes[interaction.contactType] = (stats.contactTypes[interaction.contactType] || 0) + 1;
      stats.outcomes[interaction.outcome] = (stats.outcomes[interaction.outcome] || 0) + 1;
    });
    
    res.json(stats);
  } catch (error) {
    console.error('Error fetching interaction stats:', error);
    res.status(500).json({ message: 'Error fetching stats', error: error.message });
  }
};