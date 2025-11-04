const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Parse a receipt image or text and extract parts information
 * @param {Buffer|String} receiptData - Receipt image buffer or text content
 * @param {String} dataType - 'image' or 'text'
 * @param {Boolean} isOrder - true if parts have been ordered, false if quote
 * @returns {Promise<Array>} Array of extracted parts with their details
 */
exports.parseReceipt = async (receiptData, dataType = 'image', isOrder = true) => {
  try {
    let messages;

    if (dataType === 'image') {
      // Convert buffer to base64
      const base64Image = receiptData.toString('base64');
      const mimeType = 'image/png'; // Default, can be enhanced to detect actual type

      messages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `You are a receipt parser for an auto repair shop. Extract ALL parts/items from this receipt image.

FIRST, identify the retailer/marketplace at the TOP of the receipt (e.g., "RockAuto Order Confirmation" = RockAuto, "eBay" = eBay).
SECOND, find the ORDER NUMBER near the top (usually line 2-3, like "Order 328112506" = "328112506").

For EACH item found, extract:
1. Part name (full descriptive name from "Part Type" column - NOT the brand name)
2. Vendor - The MARKETPLACE/RETAILER name from the TOP of the receipt (e.g., "RockAuto", "eBay", "Amazon")
   - DO NOT use part brand names (like "QUALITY-LT", "SKP", "NTK") as the vendor
   - USE the company name from the receipt header (RockAuto, Advance Auto, etc.)
3. Supplier - The actual seller (only for marketplaces like eBay/Amazon; leave empty for direct retailers like RockAuto)
4. Order number - The SAME order number from the top for ALL items on this receipt
5. Price (the unit price per item from "Price EA" column, as a number)
6. Quantity (from "Qty" or "Quantity" column, otherwise default to 1)
7. Item Number/SKU (from "Part Number" column if available)

CRITICAL - Vendor identification:
- Look at the RECEIPT HEADER for the vendor name (first few lines)
- "RockAuto Order Confirmation" → vendor = "RockAuto"
- "eBay" with seller name → vendor = "eBay", supplier = seller name
- DO NOT use the brand/manufacturer column as vendor
- DO NOT use "QUALITY-LT", "SKP", "NTK", etc. as vendor - these are BRANDS, not vendors

IMPORTANT:
- ALL items from one receipt share the SAME order number
- Extract ALL items from the receipt
- Return the data as a valid JSON array
- For price, extract only the unit price (not total)
- If shipping cost is listed separately, create a separate item called "Shipping" for it

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
]`
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ];
    } else {
      // Text input
      messages = [
        {
          role: 'user',
          content: `You are a receipt parser for an auto repair shop. Extract ALL parts/items from this receipt text.

Receipt text:
${receiptData}

FIRST, identify the retailer/marketplace at the TOP of the receipt (e.g., "RockAuto Order Confirmation" = RockAuto, "eBay" = eBay).
SECOND, find the ORDER NUMBER near the top (usually line 2-3, like "Order 328112506" = "328112506").

For EACH item found, extract:
1. Part name (full descriptive name from "Part Type" column - NOT the brand name)
2. Vendor - The MARKETPLACE/RETAILER name from the TOP of the receipt (e.g., "RockAuto", "eBay", "Amazon")
   - DO NOT use part brand names (like "QUALITY-LT", "SKP", "NTK") as the vendor
   - USE the company name from the receipt header (RockAuto, Advance Auto, etc.)
3. Supplier - The actual seller (only for marketplaces like eBay/Amazon; leave empty for direct retailers like RockAuto)
4. Order number - The SAME order number from the top for ALL items on this receipt
5. Price (the unit price per item from "Price EA" column, as a number)
6. Quantity (from "Qty" or "Quantity" column, otherwise default to 1)
7. Item Number/SKU (from "Part Number" column if available)

CRITICAL - Vendor identification:
- Look at the RECEIPT HEADER for the vendor name (first few lines)
- "RockAuto Order Confirmation" → vendor = "RockAuto"
- "eBay" with seller name → vendor = "eBay", supplier = seller name
- DO NOT use the brand/manufacturer column as vendor
- DO NOT use "QUALITY-LT", "SKP", "NTK", etc. as vendor - these are BRANDS, not vendors

IMPORTANT:
- ALL items from one receipt share the SAME order number
- Extract ALL items from the receipt
- Return the data as a valid JSON array
- For price, extract only the unit price (not total)
- If shipping cost is listed separately, create a separate item called "Shipping" for it

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
]`
        }
      ];
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      max_tokens: 2000,
      temperature: 0.1 // Low temperature for consistent extraction
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
      console.error('Failed to parse OpenAI response:', content);
      throw new Error('Failed to parse receipt data from AI response');
    }

    // Validate the parsed data
    if (!Array.isArray(parsedParts)) {
      throw new Error('Invalid response format: expected an array of parts');
    }

    // Separate shipping items from regular parts
    const shippingItems = parsedParts.filter(part =>
      part.name && part.name.toLowerCase().includes('shipping')
    );
    const regularParts = parsedParts.filter(part =>
      !part.name || !part.name.toLowerCase().includes('shipping')
    );

    // Calculate total shipping cost
    const totalShipping = shippingItems.reduce((sum, item) => {
      return sum + (parseFloat(item.price) || 0);
    }, 0);

    // Calculate shipping per item (amortize across all regular parts)
    const shippingPerItem = regularParts.length > 0 ? totalShipping / regularParts.length : 0;

    console.log(`[Receipt Parser] Found ${shippingItems.length} shipping item(s) totaling $${totalShipping.toFixed(2)}`);
    console.log(`[Receipt Parser] Amortizing $${shippingPerItem.toFixed(2)} shipping per item across ${regularParts.length} parts`);

    // Apply shipping cost to each part, then apply 30% markup
    const partsWithMarkup = regularParts.map(part => {
      const baseCost = parseFloat(part.price) || 0;
      const costWithShipping = baseCost + shippingPerItem;

      return {
        name: part.name || '',
        itemNumber: part.itemNumber || '',
        vendor: part.vendor || '',
        supplier: part.supplier || '',
        purchaseOrderNumber: part.orderNumber || '',
        quantity: part.quantity || 1,
        cost: costWithShipping, // Actual cost including amortized shipping
        price: costWithShipping * 1.3, // 30% markup on cost including shipping
        ordered: isOrder, // Mark as ordered only if this is an order (not a quote)
        received: false // Not received yet by default
      };
    });

    return partsWithMarkup;

  } catch (error) {
    console.error('Error parsing receipt with OpenAI:', error);
    throw new Error(`Receipt parsing failed: ${error.message}`);
  }
};

/**
 * Test function to validate OpenAI service is configured correctly
 * @returns {Promise<Boolean>}
 */
exports.testConnection = async () => {
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello' }],
      max_tokens: 10
    });
    return response.choices[0].message.content ? true : false;
  } catch (error) {
    console.error('OpenAI connection test failed:', error);
    return false;
  }
};
