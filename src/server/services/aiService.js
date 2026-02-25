const OpenAI = require('openai');

// Initialize xAI client (OpenAI SDK-compatible)
const xai = new OpenAI({
  baseURL: 'https://api.x.ai/v1',
  apiKey: process.env.XAI_API_KEY
});

const MODEL = 'grok-4';

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
    let messages;

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

Return ONLY a JSON array with no additional text. Example format:
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

    if (dataType === 'image') {
      // Support single buffer or array of buffers (multi-page PDF)
      const buffers = Array.isArray(receiptData) ? receiptData : [receiptData];

      const imageContent = buffers.map(buf => ({
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${buf.toString('base64')}`
        }
      }));

      messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: extractionPrompt },
            ...imageContent
          ]
        }
      ];
    } else {
      // Text input (from pasted text or PDF extraction)
      messages = [
        {
          role: 'user',
          content: `${extractionPrompt}

Receipt text:
${receiptData}`
        }
      ];
    }

    const response = await xai.chat.completions.create({
      model: MODEL,
      messages: messages,
      max_tokens: 4000,
      temperature: 0.1
    });

    const content = response.choices[0].message.content.trim();

    // Parse the JSON response
    let parsedParts;
    try {
      // Remove markdown code blocks if present
      const jsonMatch = content.match(/```(?:json)?\s*(\[[\s\S]*\])\s*```/);
      const jsonString = jsonMatch ? jsonMatch[1] : content;
      parsedParts = JSON.parse(jsonString);
    } catch (parseError) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse receipt data from AI response');
    }

    // Validate the parsed data
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

    // Calculate total shipping/tax cost
    const shippingTotal = shippingItems.reduce((sum, item) => {
      return sum + ((parseFloat(item.price) || 0) * (item.quantity || 1));
    }, 0);

    console.log(`[Receipt Parser] Extracted ${regularParts.length} part(s) and ${shippingItems.length} shipping/tax item(s) totaling $${shippingTotal.toFixed(2)}`);

    // Return raw parts (no markup, no amortization) + shipping total
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
    console.error('Error parsing receipt with xAI:', error);
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
 * @returns {Array} Finalized parts ready to add to a work order
 */
exports.finalizeParts = (selectedParts, shippingTotal, isOrder) => {
  const shippingPerItem = selectedParts.length > 0 ? shippingTotal / selectedParts.length : 0;

  console.log(`[Receipt Parser] Amortizing $${shippingPerItem.toFixed(2)} shipping per item across ${selectedParts.length} selected parts`);

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
      price: costWithShipping * 1.3,
      ordered: isOrder,
      received: false
    };
  });
};

/**
 * Test function to validate xAI service is configured correctly
 * @returns {Promise<Boolean>}
 */
exports.testConnection = async () => {
  try {
    const response = await xai.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 10
    });
    return response.choices[0].message.content ? true : false;
  } catch (error) {
    console.error('xAI connection test failed:', error);
    return false;
  }
};
