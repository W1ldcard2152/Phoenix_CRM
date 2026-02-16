// src/client/src/pages/Dashboard/Dashboard.jsx

import React from 'react';
import SwimmingLaneCalendar from '../../components/dashboard/SwimmingLaneCalendar';
import WorkflowSummary from '../../components/dashboard/WorkflowSummary';
import ServiceWritersCorner from './ServiceWritersCorner';

const Dashboard = () => {
  return (
    <div className="container mx-auto">
      <div className="mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
          <p className="text-gray-600">Welcome to the Auto Repair Shop CRM</p>
        </div>
      </div>

      {/* Workflow Summary with Today's Appointments */}
      <div className="mb-6">
        <WorkflowSummary />
      </div>

      {/* Service Writer's Corner */}
      <div className="mb-6">
        <ServiceWritersCorner />
      </div>

      {/* Calendar Section */}
      <div className="mb-6">
        <SwimmingLaneCalendar />
      </div>
    </div>
  );
};

export default Dashboard;
