const { GoogleGenerativeAI, SchemaType } = require('@google/generative-ai');

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL = 'gemini-2.5-flash';

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
1. Part name (full descriptive name as shown in the item listing)
2. Vendor - The MARKETPLACE/RETAILER name from the receipt header (e.g., "RockAuto", "eBay", "Amazon")
   - DO NOT use part brand names (like "QUALITY-LT", "SKP", "NTK") as the vendor
   - USE the company name from the receipt header (RockAuto, Advance Auto, etc.)
3. Supplier - The actual seller (only for marketplaces like eBay/Amazon where items come from different sellers; leave empty for direct retailers like RockAuto)
4. Order number - Use the order number from the section the item appears in
5. Price - The EXACT dollar amount shown next to the item (e.g., "Item price" column). Read this number precisely as printed - do NOT estimate or calculate it
6. Quantity (from "Qty" or "Quantity" column, default to 1)
7. Item Number/SKU - the eBay item number in parentheses, or part number from "Part Number" column

CRITICAL - Price extraction:
- Read the EXACT price printed on the receipt for each item
- Do NOT round, estimate, or infer prices from totals
- The price is the per-unit "Item price" shown in the item's row
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

IGNORE these line items entirely (do NOT extract them):
- Coupons, discounts, promotions
- Tax lines
- Order totals / subtotals

Return a JSON array. Example format:
[
  {
    "name": "Oxygen (O2) Sensor",
    "vendor": "RockAuto",
    "supplier": "",
    "orderNumber": "327394945",
    "price": 36.79,
    "quantity": 2,
    "itemNumber": "22012"
  },
  {
    "name": "Door Lock Latch Actuator Front Left",
    "vendor": "eBay",
    "supplier": "prestigeautorecycling",
    "orderNumber": "23-13747-54228",
    "price": 65.34,
    "quantity": 1,
    "itemNumber": "406323463061"
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

    const rawParts = regularParts.map(part => ({
      name: part.name || '',
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
exports.finalizeParts = (selectedParts, shippingTotal, isOrder, markupPercentage = 30) => {
  const shippingPerItem = selectedParts.length > 0 ? shippingTotal / selectedParts.length : 0;
  const multiplier = 1 + markupPercentage / 100;

  console.log(`[Receipt Parser] Amortizing $${shippingPerItem.toFixed(2)} shipping per item across ${selectedParts.length} selected parts (markup: ${markupPercentage}%)`);

  return selectedParts.map(part => {
    const baseCost = parseFloat(part.price) || 0;
    const costWithShipping = baseCost + shippingPerItem;

    return {
      name: part.name || '',
      itemNumber: part.itemNumber || '',
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
