// Population helper utilities to centralize and standardize .populate() calls
// This eliminates 100+ duplicate populate patterns across controllers

const populationConfigs = {
  workOrder: {
    standard: [
      { path: 'customer', select: 'name phone email' },
      { path: 'vehicle', select: 'year make model vin licensePlate' },
      { path: 'assignedTechnician', select: 'name specialization' }
    ],
    detailed: [
      { path: 'customer', select: 'name phone email' },
      { path: 'vehicle', select: 'year make model vin licensePlate' },
      { path: 'assignedTechnician', select: '_id name specialization' },
      {
        path: 'appointmentId',
        select: '_id technician startTime endTime status serviceType',
        populate: {
          path: 'technician',
          select: '_id name specialization'
        }
      },
      {
        path: 'appointments',
        select: '_id technician startTime endTime status serviceType',
        populate: {
          path: 'technician',
          select: '_id name specialization'
        }
      }
    ],
    invoice: [
      { path: 'customer', select: 'name email phone address' },
      { path: 'vehicle', select: 'year make model vin' },
      { path: 'assignedTechnician', select: 'name specialization' }
    ]
  },
  appointment: {
    standard: [
      { path: 'customer', select: 'name phone email' },
      { path: 'vehicle', select: 'year make model' },
      { path: 'technician', select: 'name specialization' },
      { path: 'workOrder', select: 'status' }
    ],
    detailed: [
      { path: 'customer', select: 'name phone email' },
      { path: 'vehicle', select: 'year make model vin' },
      { path: 'technician', select: 'name specialization' },
      {
        path: 'workOrder',
        populate: [
          { path: 'assignedTechnician', select: 'name specialization' },
          { path: 'customer', select: 'name' },
          { path: 'vehicle', select: 'year make model' }
        ]
      }
    ],
    withCommunication: [
      { path: 'customer', select: 'name phone email communicationPreference' },
      { path: 'vehicle', select: 'year make model' },
      { path: 'technician', select: 'name specialization' }
    ]
  },
  invoice: {
    standard: [
      { path: 'customer', select: 'name phone email' },
      { path: 'vehicle', select: 'year make model vin' },
      { path: 'workOrder' }
    ]
  },
  interaction: {
    standard: [
      { path: 'customer', select: 'name phone email' },
      { path: 'createdBy', select: 'name' },
      { path: 'completedBy', select: 'name' }
    ]
  },
  vehicle: {
    standard: [
      { path: 'customer', select: 'name phone email' }
    ]
  },
  workOrderNote: {
    standard: [
      { path: 'createdBy', select: 'name email' }
    ]
  }
};

/**
 * Apply population configuration to a query
 * @param {Object} query - Mongoose query object
 * @param {String} modelType - Type of model (workOrder, appointment, etc.)
 * @param {String} variant - Variant of population (standard, detailed, etc.)
 * @returns {Object} Query with populations applied
 */
const applyPopulation = (query, modelType, variant = 'standard') => {
  const config = populationConfigs[modelType]?.[variant];
  if (!config) {
    console.warn(`Population config not found for ${modelType}.${variant}`);
    return query;
  }

  config.forEach(pop => query.populate(pop));
  return query;
};

module.exports = {
  applyPopulation,
  populationConfigs
};
