const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL = 'gemini-3.1-flash-lite-preview';

// Normalize brand-name casing: words ≤3 letters stay all-caps (acronyms like BCA, NTK),
// words ≥4 letters become Title Case ("BOSCH" → "Bosch", "MAHLE / CLEVITE" → "Mahle / Clevite").
// User-managed overrides (e.g. ACDelco) are looked up first.
// Numbers and separators (/, -, spaces) are preserved as-is.
const formatBrandName = (brand, overridesMap = {}) => {
  if (!brand || typeof brand !== 'string') return brand || '';
  return brand.replace(/[A-Za-z]+/g, (word) => {
    const override = overridesMap[word.toLowerCase()];
    if (override) return override;
    if (word.length <= 3) return word.toUpperCase();
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
};

/**
 * Get a Gemini model instance (shared with registrationController)
 */
const getModel = (modelName = MODEL) => genAI.getGenerativeModel({ model: modelName });
exports.getModel = getModel;

/**
 * Parse a receipt image or text and extract raw parts information.
 * Returns raw extracted parts and shipping total — does NOT apply markup or amortization.
 * Use finalizeParts() to apply shipping amortization and markup to selected parts.
 *
 * @param {Buffer|String} receiptData - Receipt image buffer or text content
 * @param {String} dataType - 'image' or 'text'
 * @param {String} mimeType - MIME type for image files (e.g. 'image/png', 'image/jpeg')
 * @returns {Promise<{parts: Array, shippingTotal: number}>}
 */
exports.parseReceipt = async (receiptData, dataType = 'image', mimeType = 'image/png') => {
  try {
    const model = getModel();

    const extractionPrompt = `You are a receipt parser for an auto repair shop. Extract ALL parts/items from this receipt.

FIRST, identify the retailer/marketplace at the TOP of the receipt (e.g., "RockAuto Order Confirmation" = RockAuto, "eBay" = eBay).
SECOND, find the ORDER NUMBER (e.g., "Order 328112506" = "328112506"). On eBay receipts with multiple sellers, each seller section has its own order number.

For EACH item found, extract:
1. Part name - A concise, clean description of the part itself. If the receipt has a "Part Type" / "Description" / "Item" column, use that value (e.g., "Oil Filter", "Wheel Bearing", "Oxygen Sensor"). For listing-style titles (Amazon/eBay), strip brand names, seller names, and marketing filler from the title and keep only what identifies the part itself.
2. Brand - The manufacturer/brand name ONLY (e.g., "Mobil 1", "Bosch", "MANN", "MAHLE", "ACDelco"). This must be SEPARATE from the part number — do NOT combine them. Leave empty string if not identifiable.
3. Item Number/SKU - The part number or SKU ONLY (e.g., "OX387D", "3334", "PF64"). This is separate from the brand. Do NOT include the brand name here.
4. Vendor - The MARKETPLACE/RETAILER name from the receipt header (e.g., "RockAuto", "eBay", "Amazon"). DO NOT use part brand names as vendor.
5. Supplier - The actual seller (only for marketplaces like eBay/Amazon; leave empty for direct retailers like RockAuto)
6. Order number - Use the order number from the section the item appears in
7. Price - The EXACT per-unit dollar amount (e.g., "Price EA" column). Read precisely as printed — do NOT estimate or calculate from totals
8. Quantity - From "Qty" or "Quantity" column, default to 1

CRITICAL — Brand vs. Part Number separation:
- Brand and part number are ALWAYS two distinct fields. NEVER merge them into one.
- Brand = a manufacturer/company name (e.g., "Bosch", "MAHLE / CLEVITE", "MANN", "ACDelco", "FEL-PRO", "Mobil 1", "Genuine BMW", "OEM", "Febi"). Brands often appear ALL-CAPS on parts receipts.
- Part number = an alphanumeric SKU/identifier (e.g., "OX387D", "3334", "PF64", "11427837997"). Often contains digits or mixed letters/digits.
- HOW to identify which is which:
  • If the receipt has a TABLE with column headers, read the headers — "Brand" / "Manufacturer" / "Mfr" columns hold the brand; "Part Number" / "Part #" / "SKU" / "Mfr #" columns hold the part number. Trust the headers, NOT column position.
  • If the receipt is a LISTING-STYLE row (Amazon/eBay-style with one long title), parse the title: a leading recognizable manufacturer name → brand; an alphanumeric token that looks like a SKU → itemNumber; the descriptive remainder → name.
- If you cannot confidently separate them, populate the field you ARE sure about and leave the other empty — never put a combined string like "Bosch 3334" into either field.

CRITICAL - Price extraction:
- Read the EXACT price printed on the receipt for each item
- Do NOT round, estimate, or infer prices from totals
- Use the per-unit price ("Price EA" or "Item price" column), NOT the line total
- IGNORE coupons, discounts, and promotions — extract only the item price as listed

CRITICAL - Vendor identification:
- Look at the RECEIPT HEADER for the vendor name (first few lines)
- "RockAuto Order Confirmation" → vendor = "RockAuto"
- "eBay" with seller name → vendor = "eBay", supplier = seller name
- DO NOT use the brand/manufacturer column as vendor

CRITICAL - Shipping extraction:
- If a total shipping cost is listed in the order summary, create ONE item called "Shipping" with that exact amount as the price
- Do NOT include coupons, discounts, or tax as shipping
- If shipping is $0 or free, do not create a shipping item

CRITICAL - Tax extraction:
- If a tax total is listed in the order summary, create ONE item called "Tax" with that exact amount as the price
- If tax is $0, do not create a tax item

IGNORE these line items entirely (do NOT extract them):
- Coupons, discounts, promotions, core charges
- Order totals / subtotals

Return a JSON array. Example format:
[
  {
    "name": "Oil Filter",
    "brand": "Bosch",
    "itemNumber": "3334",
    "vendor": "RockAuto",
    "supplier": "",
    "orderNumber": "341993980",
    "price": 3.87,
    "quantity": 3
  },
  {
    "name": "Oil Filter",
    "brand": "MAHLE / CLEVITE",
    "itemNumber": "OX387D",
    "vendor": "RockAuto",
    "supplier": "",
    "orderNumber": "341993980",
    "price": 5.89,
    "quantity": 3
  },
  {
    "name": "Full Synthetic Motor Oil 0W-20, 5 Quart",
    "brand": "Mobil 1",
    "itemNumber": "",
    "vendor": "Walmart",
    "supplier": "",
    "orderNumber": "",
    "price": 28.97,
    "quantity": 1
  }
]`;

    // Build content parts
    const parts = [{ text: extractionPrompt }];

    if (dataType === 'image') {
      // Support single buffer or array of buffers (multi-page PDF)
      const buffers = Array.isArray(receiptData) ? receiptData : [receiptData];
      for (const buf of buffers) {
        parts.push({
          inlineData: {
            mimeType,
            data: buf.toString('base64')
          }
        });
      }
    } else {
      // Text input (from pasted text or PDF extraction)
      parts.push({ text: `\nReceipt text:\n${receiptData}` });
    }

    const result = await model.generateContent({
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 4000
      }
    });

    const content = result.response.text();
    let parsedParts;
    try {
      parsedParts = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', content);
      throw new Error('Failed to parse receipt data from AI response');
    }

    if (!Array.isArray(parsedParts)) {
      throw new Error('Invalid response format: expected an array of parts');
    }

    // Separate shipping/tax items from regular parts
    const shippingItems = parsedParts.filter(part =>
      part.name && (part.name.toLowerCase().includes('shipping') || part.name.toLowerCase().includes('tax'))
    );
    const regularParts = parsedParts.filter(part =>
      !part.name || (!part.name.toLowerCase().includes('shipping') && !part.name.toLowerCase().includes('tax'))
    );

    const shippingTotal = shippingItems.reduce((sum, item) => {
      return sum + ((parseFloat(item.price) || 0) * (item.quantity || 1));
    }, 0);

    console.log(`[Receipt Parser] Extracted ${regularParts.length} part(s) and ${shippingItems.length} shipping/tax item(s) totaling $${shippingTotal.toFixed(2)}`);

    // Load brand override map from Settings (singleton)
    const Settings = require('../models/Settings');
    const settings = await Settings.getSettings();
    const overridesMap = {};
    (settings.brandOverrides || []).forEach(b => { overridesMap[b.toLowerCase()] = b; });

    const rawParts = regularParts.map(part => ({
      name: part.name || '',
      brand: formatBrandName(part.brand || '', overridesMap),
      itemNumber: part.itemNumber || '',
      vendor: part.vendor || '',
      supplier: part.supplier || '',
      orderNumber: part.orderNumber || '',
      price: parseFloat(part.price) || 0,
      quantity: part.quantity || 1
    }));

    return { parts: rawParts, shippingTotal };

  } catch (error) {
    console.error('Error parsing receipt with Gemini:', error);
    throw new Error(`Receipt parsing failed: ${error.message}`);
  }
};

/**
 * Apply shipping amortization and markup to selected parts.
 * Call this after the user has selected which parts to keep.
 *
 * @param {Array} selectedParts - Raw parts chosen by the user
 * @param {Number} shippingTotal - Total shipping/tax from the receipt
 * @param {Boolean} isOrder - Whether parts are already ordered
 * @param {Number} markupPercentage - Markup percentage (e.g. 30 for 30%)
 * @returns {Array} Finalized parts ready to add to a work order
 */
exports.finalizeParts = (selectedParts, shippingTotal, isOrder, markupPercentage = 30, totalAllUnits = null) => {
  const divisor = totalAllUnits || selectedParts.reduce((sum, p) => sum + (p.quantity || 1), 0);
  const shippingPerItem = divisor > 0 ? shippingTotal / divisor : 0;
  const multiplier = 1 + markupPercentage / 100;

  console.log(`[Receipt Parser] Amortizing $${shippingPerItem.toFixed(2)} shipping per unit across ${divisor} total units (${selectedParts.length} selected lines, markup: ${markupPercentage}%)`);

  return selectedParts.map(part => {
    const baseCost = parseFloat(part.price) || 0;
    const costWithShipping = baseCost + shippingPerItem;
    const partNumber = [part.brand, part.itemNumber].filter(Boolean).join(' ');

    return {
      name: part.name || '',
      partNumber,
      vendor: part.vendor || '',
      supplier: part.supplier || '',
      purchaseOrderNumber: part.orderNumber || '',
      quantity: part.quantity || 1,
      cost: costWithShipping,
      price: parseFloat((costWithShipping * multiplier).toFixed(2)),
      ordered: isOrder,
      received: false
    };
  });
};

/**
 * Fetch a URL and return simplified text content for AI extraction.
 * Strips HTML tags, scripts, styles, and excessive whitespace.
 */
const fetchPageText = (pageUrl) => {
  const lib = pageUrl.startsWith('https') ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const opts = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      timeout: 15000
    };

    const handleResponse = (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const redirectUrl = new URL(res.headers.location, pageUrl).href;
        console.log(`[URL Extract] Following redirect to: ${redirectUrl}`);
        const rLib = redirectUrl.startsWith('https') ? require('https') : require('http');
        rLib.get(redirectUrl, opts, handleResponse).on('error', reject);
        return;
      }

      let html = '';
      res.on('data', chunk => { html += chunk; });
      res.on('end', () => {
        // Strip scripts, styles, and HTML tags; collapse whitespace
        let text = html
          .replace(/<script[\s\S]*?<\/script>/gi, '')
          .replace(/<style[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/gi, ' ')
          .replace(/&amp;/gi, '&')
          .replace(/&lt;/gi, '<')
          .replace(/&gt;/gi, '>')
          .replace(/&#\d+;/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        // Truncate to ~30k chars to stay within token limits
        if (text.length > 30000) text = text.substring(0, 30000);

        resolve(text);
      });
    };

    lib.get(pageUrl, opts, handleResponse).on('error', reject);
  });
};

/**
 * Extract product details from a URL.
 * Fetches the page content ourselves then sends it to Gemini Pro for extraction.
 *
 * @param {String} url - Product page URL
 * @returns {Promise<Object>} Extracted product details
 */
/**
 * Parse AI response text into normalized product object.
 */
const parseAiResponse = (text) => {
  let content = text.trim();
  if (!content) return null;

  // Strip markdown code blocks if present
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (jsonMatch) content = jsonMatch[1].trim();

  // Remove trailing commas and comments
  content = content.replace(/,\s*([}\]])/g, '$1');
  content = content.replace(/\/\/[^\n]*/g, '');

  const extracted = JSON.parse(content);
  return {
    name: extracted.name || null,
    partNumber: extracted.partNumber || null,
    price: null,
    cost: null,
    vendor: extracted.vendor || null,
    brand: extracted.brand || null,
    warranty: extracted.warranty || null
  };
};

const EXTRACTION_FIELDS = `Fields to extract:
- name: The exact product/part name as listed
- partNumber: The manufacturer part number, SKU, model number, or item number
- vendor: The retailer/marketplace name (e.g., "RockAuto", "Amazon", "eBay", "AutoZone")
- brand: The manufacturer/brand name (e.g., "Bosch", "Mobil 1", "ACDelco")
- warranty: Warranty information if listed

IMPORTANT: Do NOT extract prices. Prices change constantly and we need the user to verify them manually. Only extract identifying information.

Return a JSON object with these fields. Use null for any field not found.`;

/**
 * Extract product details from a URL.
 * Strategy: fetch the page ourselves for ground truth, fall back to Gemini Pro
 * for JS-rendered sites that return empty shells.
 *
 * @param {String} url - Product page URL
 * @returns {Promise<Object>} Extracted product details
 */
exports.extractFromUrl = async (url) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });

  // Strategy 1: Fetch page ourselves and send real content to AI
  try {
    console.log(`[URL Extract] Fetching page: ${url}`);
    const pageText = await fetchPageText(url);

    // Check if we got meaningful content (JS-rendered sites return <1000 chars of shell)
    if (pageText && pageText.length > 1000) {
      console.log(`[URL Extract] Got ${pageText.length} chars — using fetched content`);

      const prompt = `You are a product data extractor for an auto repair shop. Below is the text content scraped from a product listing page at: ${url}

Extract the product details from this page content. Only extract what is ACTUALLY present in the text — do NOT guess or infer.

${EXTRACTION_FIELDS}

PAGE CONTENT:
${pageText}`;

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.1,
          maxOutputTokens: 8192
        }
      });

      const parsed = parseAiResponse(result.response.text());
      if (parsed && parsed.name) {
        console.log(`[URL Extract] Success via page fetch + Pro`);
        return parsed;
      }
    } else {
      console.log(`[URL Extract] Page returned only ${pageText?.length || 0} chars (JS-rendered site)`);
    }
  } catch (fetchErr) {
    console.log(`[URL Extract] Fetch approach failed: ${fetchErr.message}`);
  }

  // Strategy 2: Let Gemini Pro try with just the URL (for JS-rendered sites)
  // Model can identify products but NOT current prices from stale training data
  try {
    console.log(`[URL Extract] Falling back to Pro model with URL only (no live page content)`);

    const prompt = `You are a product data extractor for an auto repair shop. Identify the product at this URL:

${url}

CRITICAL RULES:
- You may identify the product name, part number, brand, vendor, and warranty from your knowledge.
- You MUST set "price" to null and "cost" to null. Prices change constantly and you do not have access to the live page, so any price you provide would be wrong.
- Do NOT guess or fabricate any field. Use null if unsure.

Fields to extract:
- name: The product/part name
- partNumber: The manufacturer part number or SKU
- price: null (you cannot see live prices without page content)
- cost: null
- vendor: The retailer/marketplace name (e.g., "RockAuto", "Amazon", "eBay", "AutoZone")
- brand: The manufacturer/brand name
- warranty: Warranty information if you are certain of it, otherwise null

Return a JSON object with these fields.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
        maxOutputTokens: 8192
      }
    });

    const parsed = parseAiResponse(result.response.text());
    if (parsed && parsed.name) {
      // Force-null prices on fallback path — model doesn't have live data
      parsed.price = null;
      parsed.cost = null;
      console.log(`[URL Extract] Success via Pro (URL only — prices omitted, no live page)`);
      return parsed;
    }
  } catch (err) {
    console.log(`[URL Extract] Pro URL-only failed: ${err.message}`);
  }

  throw new Error('Could not extract product details from this URL');
};

/**
 * Find duplicate matches between parsed receipt items and existing inventory/parts items.
 * Uses AI to recognize same physical products despite name variations.
 *
 * @param {Array} parsedItems - Items from receipt: [{ name, itemNumber }]
 * @param {Array} existingItems - Existing records: [{ _id, name, partNumber }]
 * @returns {Promise<Array>} Matches: [{ parsedIndex, existingId, reason }]
 */
exports.findDuplicates = async (parsedItems, existingItems) => {
  if (!parsedItems.length || !existingItems.length) return [];

  try {
    const model = getModel();

    const parsedList = parsedItems
      .map((item, i) => {
        const tags = [];
        if (item.brand) tags.push(`Brand: ${item.brand}`);
        if (item.itemNumber) tags.push(`SKU: ${item.itemNumber}`);
        return `[${i}] "${item.name}"${tags.length ? ` (${tags.join(', ')})` : ''}`;
      })
      .join('\n');

    const existingList = existingItems
      .map(item => `["${item._id}"] "${item.name}"${item.partNumber ? ` (Brand/SKU: ${item.partNumber})` : ''}`)
      .join('\n');

    const prompt = `You are a duplicate detection assistant for an auto repair shop's parts and inventory system.

Compare the RECEIPT ITEMS against EXISTING ITEMS to identify likely duplicates — the same physical product regardless of minor name differences.

RECEIPT ITEMS:
${parsedList}

EXISTING ITEMS (Brand field is the manufacturer brand):
${existingList}

For each receipt item with a confident match, return an entry. Use the exact ID string shown in brackets for existingId.

Output a JSON array:
[{ "parsedIndex": <number>, "existingId": "<id string>", "reason": "<short explanation>" }]

Matching rules (apply in order):

RULE 1 — Part number is the strongest signal:
- If BOTH the receipt item and the existing item have a part number / SKU and they DIFFER (e.g., "3311" vs "3334", "OX387D" vs "OX1213D"), it is NEVER a match — they are different physical parts even if the brand and product type are identical (different oil filters fit different vehicles, different brake pads fit different calipers, etc.).
- If part numbers MATCH, it is a strong match signal.
- Treat a Brand/SKU field on existing items as containing a part number when it has digits or mixed alphanumerics (e.g., "Bosch 3311", "OX387D"), and as just a brand when it's pure letters (e.g., "Mobil 1", "Castrol").

RULE 2 — Brand must agree:
- If brands clearly differ (e.g., "Mobil 1" vs "Super Tech", "Bosch" vs "MANN", "Castrol" vs "Pennzoil"), it is NEVER a match.
- A receipt item whose name starts with a different brand than the existing item's Brand → NOT a match.

RULE 3 — Same brand, no part numbers, same core product → match (consumables/fluids):
- This applies when neither side has a distinguishing SKU (typical for oils, cleaners, fluids, hand soap, etc.).
- "Full Synthetic Motor Oil 0W-20 5 Quart" (Mobil 1) matches "Advanced Fuel Economy Full Synthetic Motor Oil 0W-20" (Mobil 1) — same brand, type, viscosity, size.
- Product line sub-names like "Advanced Fuel Economy", "Extended Performance", "High Mileage", "Pro Select" are marketing descriptors, not differentiators — IGNORE them when matching consumables.
- Multi-pack of same product by same brand (e.g., "Fast Orange 2pk" vs "Fast Orange") → match.

RULE 4 — Size/volume always matters:
- "5 Quart" vs "1 Quart" of the same oil → NOT a match (different quantities tracked separately).
- "12oz" vs "32oz" → NOT a match.

RULE 5 — When in doubt, do NOT match. A false negative is better than a false positive.
- Return [] if no confident matches found.`;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 1500 }
    });

    let matches;
    try {
      matches = JSON.parse(result.response.text());
    } catch {
      return [];
    }

    if (!Array.isArray(matches)) return [];

    const validIds = new Set(existingItems.map(i => i._id.toString()));
    return matches.filter(m =>
      typeof m.parsedIndex === 'number' &&
      m.parsedIndex >= 0 &&
      m.parsedIndex < parsedItems.length &&
      m.existingId &&
      validIds.has(m.existingId.toString())
    );
  } catch (err) {
    console.error('[findDuplicates] Error:', err);
    return [];
  }
};

/**
 * Test function to validate Gemini service is configured correctly
 * @returns {Promise<Boolean>}
 */
exports.testConnection = async () => {
  try {
    const model = getModel();
    const result = await model.generateContent('Hello');
    return result.response.text() ? true : false;
  } catch (error) {
    console.error('Gemini connection test failed:', error);
    return false;
  }
};
