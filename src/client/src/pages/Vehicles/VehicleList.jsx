import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import Card from '../../components/common/Card';
import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import VehicleService from '../../services/vehicleService';
import CustomerService from '../../services/customerService';

const VehicleList = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [customers, setCustomers] = useState({});
  const [searchParams] = useSearchParams();
  
  // Get customer ID from URL query parameter if present
  const customerIdParam = searchParams.get('customer');

  useEffect(() => {
    const fetchVehicles = async () => {
      try {
        setLoading(true);
        let filters = {};
        
        // If customer ID is in the URL, filter by that customer
        if (customerIdParam) {
          filters.customer = customerIdParam;
        }
        
        const response = await VehicleService.getAllVehicles(filters);
        setVehicles(response.data.vehicles);
        
        // Fetch customer data for each vehicle
        await fetchCustomersForVehicles(response.data.vehicles);
        
        setLoading(false);
      } catch (err) {
        console.error('Error fetching vehicles:', err);
        setError('Failed to load vehicles. Please try again later.');
        setLoading(false);
      }
    };

    fetchVehicles();
  }, [customerIdParam]);

  const fetchCustomersForVehicles = async (vehicleList) => {
    // Create a set of unique customer IDs
    const customerIds = new Set(vehicleList.map(vehicle => 
      typeof vehicle.customer === 'object' ? vehicle.customer._id : vehicle.customer
    ));
    
    try {
      // Fetch customer data for each unique customer ID
      const customerPromises = Array.from(customerIds).map(async (customerId) => {
        const response = await CustomerService.getCustomer(customerId);
        return { id: customerId, data: response.data.customer };
      });
      
      const customerResults = await Promise.all(customerPromises);
      
      // Create a map of customer ID to customer data
      const customerMap = {};
      customerResults.forEach(result => {
        customerMap[result.id] = result.data;
      });
      
      setCustomers(customerMap);
    } catch (err) {
      console.error('Error fetching customers for vehicles:', err);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      // If search query is empty, fetch all vehicles
      try {
        setIsSearching(true);
        const response = await VehicleService.getAllVehicles();
        setVehicles(response.data.vehicles);
        await fetchCustomersForVehicles(response.data.vehicles);
        setIsSearching(false);
      } catch (err) {
        console.error('Error fetching all vehicles:', err);
        setError('Failed to load vehicles. Please try again later.');
        setIsSearching(false);
      }
      return;
    }

    try {
      setIsSearching(true);
      const response = await VehicleService.searchVehicles(searchQuery);
      setVehicles(response.data.vehicles);
      await fetchCustomersForVehicles(response.data.vehicles);
      setIsSearching(false);
    } catch (err) {
      console.error('Error searching vehicles:', err);
      setError('Failed to search vehicles. Please try again later.');
      setIsSearching(false);
    }
  };

  const getCustomerName = (vehicle) => {
    if (vehicle.customer && typeof vehicle.customer === 'object') {
      return vehicle.customer.name;
    }
    
    const customerId = typeof vehicle.customer === 'string' ? vehicle.customer : null;
    return customers[customerId]?.name || 'Unknown Customer';
  };

  return (
    <div className="container mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Vehicles</h1>
        <Button to="/vehicles/new" variant="primary">
          Add New Vehicle
        </Button>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <Card>
        <div className="mb-4 flex">
          <Input
            placeholder="Search by make, model, or VIN..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-grow"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSearch();
              }
            }}
          />
          <Button
            onClick={handleSearch}
            variant="secondary"
            className="ml-2"
            disabled={isSearching}
          >
            {isSearching ? 'Searching...' : 'Search'}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <p>Loading vehicles...</p>
          </div>
        ) : vehicles.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <p>No vehicles found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Vehicle
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    VIN / License
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service History
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {vehicles.map((vehicle) => (
                  <tr key={vehicle._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-gray-900">
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {vehicle.vin && <div>VIN: {vehicle.vin}</div>}
                        {vehicle.licensePlate && <div>License: {vehicle.licensePlate}</div>}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {getCustomerName(vehicle)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-500">
                        {vehicle.serviceHistory ? vehicle.serviceHistory.length : 0} records
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <Button
                          to={`/vehicles/${vehicle._id}`}
                          variant="outline"
                          size="sm"
                        >
                          View
                        </Button>
                        <Button
                          to={`/vehicles/${vehicle._id}/edit`}
                          variant="outline"
                          size="sm"
                        >
                          Edit
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
};

export default VehicleList;