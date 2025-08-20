import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const GlobalSearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchRef = useRef(null);
  const navigate = useNavigate();

  // Debounced search effect
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const performSearch = async (query) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/search/global?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      if (data.status === 'success') {
        setSearchResults(data.data.results);
        setIsOpen(true);
      }
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResultClick = (result) => {
    setIsOpen(false);
    setSearchQuery('');
    
    // Navigate based on result type
    switch (result.type) {
      case 'customer':
        navigate(`/customers/${result.id}`);
        break;
      case 'vehicle':
        navigate(`/vehicles/${result.id}`);
        break;
      case 'workorder':
        navigate(`/work-orders/${result.id}`);
        break;
      default:
        break;
    }
  };

  const clearSearch = () => {
    setSearchQuery('');
    setSearchResults([]);
    setIsOpen(false);
  };

  const getResultIcon = (type) => {
    switch (type) {
      case 'customer':
        return '👤';
      case 'vehicle':
        return '🚗';
      case 'workorder':
        return '🔧';
      default:
        return '📄';
    }
  };

  const highlightMatch = (text, query) => {
    if (!text || !query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 font-semibold">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  return (
    <div className="relative" ref={searchRef}>
      {/* Search Input */}
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <i className="fas fa-search text-gray-400 text-sm"></i>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search customers, vehicles, work orders..."
          className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
        {searchQuery && (
          <button
            onClick={clearSearch}
            className="absolute inset-y-0 right-0 pr-3 flex items-center"
          >
            <i className="fas fa-times text-gray-400 hover:text-gray-600 text-sm"></i>
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
          {isLoading ? (
            <div className="p-4 text-center text-gray-500">
              <div className="flex items-center justify-center">
                <i className="fas fa-spinner fa-spin mr-2"></i>
                Searching...
              </div>
            </div>
          ) : searchResults.length > 0 ? (
            <div className="py-2">
              {searchResults.map((result, index) => (
                <button
                  key={`${result.type}-${result.id}-${index}`}
                  onClick={() => handleResultClick(result)}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:bg-gray-50 focus:outline-none border-b border-gray-100 last:border-b-0"
                >
                  <div className="flex items-start">
                    <span className="text-lg mr-3 flex-shrink-0">
                      {getResultIcon(result.type)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 truncate">
                        {highlightMatch(result.title, searchQuery)}
                      </div>
                      <div className="text-sm text-gray-500 mt-1">
                        {highlightMatch(result.subtitle, searchQuery)}
                      </div>
                      {result.description && (
                        <div className="text-xs text-gray-400 mt-1 truncate">
                          {highlightMatch(result.description, searchQuery)}
                        </div>
                      )}
                    </div>
                    <div className="ml-2 flex-shrink-0">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800 capitalize">
                        {result.type}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          ) : searchQuery.trim() && !isLoading ? (
            <div className="p-4 text-center text-gray-500">
              No results found for "{searchQuery}"
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default GlobalSearch;