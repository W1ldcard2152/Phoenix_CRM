module.exports = {
  testEnvironment: 'node',
  // Explicit roots for Windows compatibility (default rootDir glob matching can fail)
  roots: ['<rootDir>/src/server/__tests__'],
  testRegex: '\\.test\\.js$',
  // Don't pick up client tests (those run via craco/react-scripts)
  testPathIgnorePatterns: ['node_modules'],
  // Collect coverage only for the files we're testing
  collectCoverageFrom: [
    'src/server/middleware/restrictToOwn.js',
    'src/server/routes/*.js',
    'src/server/controllers/authController.js',
    'src/server/controllers/followUpController.js',
  ],
};
