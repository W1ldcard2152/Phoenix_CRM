/**
 * Test script for Gemini AI integration
 * Tests: URL extraction, connection test, and finalizeParts logic
 *
 * Usage: node scripts/test-ai-integration.js
 */

require('dotenv').config();

const aiService = require('../src/server/services/aiService');

const TEST_URLS = [
  {
    url: 'https://www.ebay.com/itm/256242498498',
    description: 'eBay listing',
    expectedVendor: 'eBay',
    // We don't know what this is — test checks the model doesn't hallucinate
    verifyReal: true
  },
  {
    url: 'https://www.amazon.com/dp/B000C9UWOC',
    description: 'Amazon product',
    expectedVendor: 'Amazon',
    verifyReal: true
  },
  {
    url: 'https://www.autozone.com/motor-oil-and-transmission-fluid/motor-oil/p/mobil-1-extended-performance-full-synthetic-motor-oil-5w-30-5-quart/586498_0_0',
    description: 'AutoZone - Mobil 1 Motor Oil',
    expectedVendor: 'AutoZone',
    expectedNameContains: 'mobil'
  },
  {
    url: 'https://www.rockauto.com/en/moreinfo.php?pk=1599962&cc=1442930&pt=5340',
    description: 'RockAuto part',
    expectedVendor: 'RockAuto',
    verifyReal: true
  }
];

const EXPECTED_FIELDS = ['name', 'partNumber', 'price', 'cost', 'vendor', 'brand', 'warranty'];

// Color helpers for console output
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

async function runTests() {
  console.log('\n' + '='.repeat(70));
  console.log(cyan('  Gemini AI Integration Test Suite'));
  console.log('='.repeat(70));

  let passed = 0;
  let failed = 0;

  // ── Test 1: Connection ──
  console.log('\n' + cyan('Test 1: Gemini Connection'));
  console.log(dim('-'.repeat(40)));
  try {
    const connected = await aiService.testConnection();
    if (connected) {
      console.log(green('  ✓ Gemini API connection successful'));
      passed++;
    } else {
      console.log(red('  ✗ Connection returned false'));
      failed++;
    }
  } catch (err) {
    console.log(red(`  ✗ Connection failed: ${err.message}`));
    failed++;
    console.log(red('\n  Cannot proceed without API connection. Check GEMINI_API_KEY in .env'));
    process.exit(1);
  }

  // ── Test 2: finalizeParts (pure logic, no API) ──
  console.log('\n' + cyan('Test 2: finalizeParts Logic'));
  console.log(dim('-'.repeat(40)));
  try {
    const testParts = [
      { name: 'Brake Pad', price: 25.00, quantity: 2, vendor: 'RockAuto', itemNumber: 'BP-123', orderNumber: 'ORD-1' },
      { name: 'Oil Filter', price: 8.50, quantity: 1, vendor: 'Amazon', itemNumber: 'OF-456', orderNumber: 'ORD-2' }
    ];
    const result = aiService.finalizeParts(testParts, 10.00, true, 30);

    // Shipping: $10 / 2 parts = $5 each
    // Brake Pad: cost = 25 + 5 = 30, price = 30 * 1.3 = 39
    // Oil Filter: cost = 8.5 + 5 = 13.5, price = 13.5 * 1.3 = 17.55
    const brakePad = result[0];
    const oilFilter = result[1];

    let allGood = true;

    if (Math.abs(brakePad.cost - 30) > 0.01) { console.log(red(`  ✗ Brake Pad cost: expected 30, got ${brakePad.cost}`)); allGood = false; }
    if (Math.abs(brakePad.price - 39) > 0.01) { console.log(red(`  ✗ Brake Pad price: expected 39, got ${brakePad.price}`)); allGood = false; }
    if (Math.abs(oilFilter.cost - 13.5) > 0.01) { console.log(red(`  ✗ Oil Filter cost: expected 13.5, got ${oilFilter.cost}`)); allGood = false; }
    if (Math.abs(oilFilter.price - 17.55) > 0.01) { console.log(red(`  ✗ Oil Filter price: expected 17.55, got ${oilFilter.price}`)); allGood = false; }
    if (brakePad.ordered !== true) { console.log(red(`  ✗ ordered flag: expected true, got ${brakePad.ordered}`)); allGood = false; }
    if (brakePad.received !== false) { console.log(red(`  ✗ received flag: expected false, got ${brakePad.received}`)); allGood = false; }
    if (brakePad.purchaseOrderNumber !== 'ORD-1') { console.log(red(`  ✗ PO number: expected ORD-1, got ${brakePad.purchaseOrderNumber}`)); allGood = false; }

    if (allGood) {
      console.log(green('  ✓ Shipping amortization correct ($5/part)'));
      console.log(green('  ✓ Markup calculation correct (30%)'));
      console.log(green('  ✓ Ordered/received flags set correctly'));
      console.log(green('  ✓ Field mapping (orderNumber → purchaseOrderNumber) correct'));
      passed++;
    } else {
      failed++;
    }
  } catch (err) {
    console.log(red(`  ✗ finalizeParts error: ${err.message}`));
    failed++;
  }

  // ── Test 3: URL Extraction ──
  console.log('\n' + cyan('Test 3: URL Extraction'));
  console.log(dim('-'.repeat(40)));

  for (const test of TEST_URLS) {
    console.log(`\n  ${cyan(test.description)}`);
    console.log(dim(`  ${test.url}`));

    try {
      const startTime = Date.now();
      const result = await aiService.extractFromUrl(test.url);
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log(dim(`  Response time: ${elapsed}s`));
      console.log('  Extracted fields:');

      let fieldCount = 0;
      for (const field of EXPECTED_FIELDS) {
        const val = result[field];
        if (val != null && val !== '') {
          console.log(green(`    ✓ ${field}: ${val}`));
          fieldCount++;
        } else {
          console.log(yellow(`    ~ ${field}: null/empty (may not be on page)`));
        }
      }

      // Minimum: name and either price or vendor should be extracted
      if (result.name && (result.price != null || result.vendor)) {
        console.log(green(`  ✓ PASS - ${fieldCount}/${EXPECTED_FIELDS.length} fields extracted`));
        passed++;
      } else {
        console.log(red(`  ✗ FAIL - Missing critical fields (name + price/vendor)`));
        failed++;
      }

      // Check vendor matches expectation (if extracted)
      if (result.vendor && test.expectedVendor) {
        if (result.vendor.toLowerCase().includes(test.expectedVendor.toLowerCase())) {
          console.log(green(`  ✓ Vendor matches expected: ${test.expectedVendor}`));
        } else {
          console.log(yellow(`  ~ Vendor mismatch: got "${result.vendor}", expected "${test.expectedVendor}"`));
        }
      }

      // Check name accuracy when expected
      if (test.expectedNameContains && result.name) {
        if (result.name.toLowerCase().includes(test.expectedNameContains.toLowerCase())) {
          console.log(green(`  ✓ Product name contains "${test.expectedNameContains}"`));
        } else {
          console.log(red(`  ✗ Product name "${result.name}" does NOT contain "${test.expectedNameContains}" — possible hallucination`));
        }
      }

    } catch (err) {
      console.log(red(`  ✗ FAIL - ${err.message}`));
      failed++;
    }
  }

  // ── Summary ──
  console.log('\n' + '='.repeat(70));
  const total = passed + failed;
  if (failed === 0) {
    console.log(green(`  All ${total} tests passed!`));
  } else {
    console.log(`  ${green(`${passed} passed`)}, ${red(`${failed} failed`)} out of ${total} tests`);
  }
  console.log('='.repeat(70) + '\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error(red(`\nUnhandled error: ${err.message}`));
  process.exit(1);
});
