module.exports = {
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/src/server/__tests__/**/*.test.js',
    '<rootDir>/src/server/**/*.test.js',
  ],
  // Don't pick up client tests (those run via craco/react-scripts)
  testPathIgnorePatterns: ['/node_modules/', '/src/client/'],
  // Collect coverage only for the files we're testing
  collectCoverageFrom: [
    'src/server/middleware/restrictToOwn.js',
    'src/server/routes/*.js',
    'src/server/controllers/authController.js',
  ],
};
