import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const PURCHASE_HISTORY = [
  {
    date: '2026-03-05',
    items: [
      { name: 'Great Value Raw Honey, 16 oz', qty: 1, price: 5.64 },
      { name: 'Pampers Splashers Swim Diapers Size S', qty: 1, price: 9.97 },
      { name: 'Great Value 100% Whole Wheat Bread, 20 oz', qty: 1, price: 1.95 },
      { name: 'Great Value 2% Reduced Fat Milk, Gallon', qty: 2, price: 5.40 },
      { name: 'a2 Milk Vitamin D Whole Milk, 59 oz', qty: 2, price: 7.86 },
      { name: 'Fresh Bartlett Pears, 3 lb Bag', qty: 1, price: 3.34 },
      { name: 'Fresh Fuji Apples, 3 lb Bag', qty: 1, price: 3.34 },
    ],
  },
  {
    date: '2026-03-14',
    items: [
      { name: 'Fresh Strawberries, 1 lb', qty: 1, price: 2.50 },
      { name: 'Marketside Fresh Organic Bananas, Bunch', qty: 1, price: 1.47 },
      { name: 'Great Value Vegetable Oil, 1 Gallon', qty: 1, price: 8.43 },
      { name: 'Great Value Mild Cheddar Shredded Cheese, 8 oz', qty: 2, price: 4.28 },
      { name: 'Great Value Ranch Dressing, 16 fl oz', qty: 1, price: 2.18 },
      { name: 'Great Value 2% Reduced Fat Milk, Gallon', qty: 2, price: 5.40 },
      { name: 'a2 Milk Vitamin D Whole Milk, 59 oz', qty: 2, price: 7.86 },
      { name: 'Marketside Cage-Free Large Brown Eggs, 18 ct', qty: 1, price: 3.93 },
    ],
  },
  {
    date: '2026-03-18',
    items: [
      { name: 'Welchs Mixed Fruit Snacks', qty: 1, price: 1.98 },
      { name: 'Fresh Red Seedless Grapes, 3 lb Bag', qty: 1, price: 5.48 },
      { name: "L'Oreal Paris Superior Preference Hair Color", qty: 1, price: 8.97 },
      { name: 'Sargento String Cheese, 12 ct', qty: 1, price: 4.48 },
      { name: 'Great Value 100% Whole Wheat Bread, 20 oz', qty: 1, price: 1.95 },
      { name: 'Zote Laundry Bar Soap, Pink, 14.1 oz', qty: 1, price: 1.24 },
      { name: 'Marketside Fresh Spinach and Spring Mix, 11 oz', qty: 1, price: 3.64 },
      { name: 'Barbasol Original Shaving Cream, 10 oz', qty: 1, price: 2.17 },
      { name: 'Ball Park Classic Hamburger Buns, 8 ct', qty: 1, price: 2.38 },
      { name: 'a2 Milk Vitamin D Whole Milk, 59 oz', qty: 2, price: 7.86 },
      { name: 'Fresh Fuji Apples, 3 lb Bag', qty: 1, price: 3.34 },
      { name: 'Marketside Fresh Organic Bananas, Bunch', qty: 1, price: 0.88 },
    ],
  },
  {
    date: '2026-03-21',
    items: [
      { name: "Parent's Choice Diapers Size 4, 192 ct", qty: 1, price: 24.64 },
      { name: 'Great Value 2% Reduced Fat Milk, Gallon', qty: 2, price: 5.40 },
      { name: 'a2 Milk Vitamin D Whole Milk, 59 oz', qty: 2, price: 7.86 },
    ],
  },
  {
    date: '2026-03-25',
    items: [
      { name: 'Marketside Fresh Organic Bananas, Bunch', qty: 1, price: 1.47 },
      { name: 'Marketside Fresh Spinach and Spring Mix, 11 oz', qty: 1, price: 3.64 },
      { name: 'Marketside Cage-Free Large Brown Eggs, 18 ct', qty: 1, price: 3.93 },
      { name: 'a2 Milk Vitamin D Whole Milk, 59 oz', qty: 2, price: 7.86 },
      { name: 'Great Value 2% Reduced Fat Milk, Gallon', qty: 2, price: 5.40 },
      { name: 'Great Value Mango Chunks, 16 oz (Frozen)', qty: 1, price: 3.07 },
      { name: 'Great Value Triple Berry Blend, 48 oz (Frozen)', qty: 1, price: 10.15 },
      { name: 'Great Value Garbanzos Chick Peas, 15.5 oz', qty: 10, price: 7.70 },
      { name: 'Fresh Navel Oranges, 4 lb Bag', qty: 1, price: 4.27 },
      { name: 'Fresh Gold Potatoes, 5 lb Bag', qty: 1, price: 3.87 },
      { name: 'Fresh Fuji Apples, 3 lb Bag', qty: 1, price: 3.34 },
      { name: 'Fresh Bartlett Pears, 3 lb Bag', qty: 1, price: 3.34 },
    ],
  },
];

const SYSTEM_PROMPT = `You are a grocery inventory analyst for a family that shops at Walmart.

Your job:
1. Analyze the fridge photo(s) to identify items and estimate quantity levels (full, half, low, empty).
2. Cross-reference against purchase history to determine what needs restocking.
3. Flag non-fridge items (pantry, frozen, baby, household) due for reorder based on purchase frequency.
4. Optimize for Walmart's $35 free delivery threshold with smart filler suggestions.

RULES:
- Only suggest items from purchase history. Never suggest random items.
- For $35 filler: prioritize pull-forward staples (needed in 1-2 orders), then long-shelf-life items. Never suggest extra perishables.

CRITICAL PRICING RULES:
- "unit_price" must be the price for ONE unit of the item (not multiplied by qty)
- "qty" is how many units to buy
- The line total = unit_price × qty. You must ensure estimated_total equals the sum of all (unit_price × qty).
- Reference prices from purchase history: a2 Milk=$3.93/each, 2% Milk=$2.70/each, Eggs=$3.93/each, Bread=$1.95/each, Apples=$3.34/bag, Pears=$3.34/bag, Spinach=$3.64/each, Bananas=$1.47/bunch, Cheese=$2.14/each, Chickpeas=$0.77/can, Diapers=$24.64/pack

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "fridge_contents": [
    { "item": "string", "status": "full|half|low|empty|not_found", "confidence": 0.0-1.0 }
  ],
  "restock_list": [
    {
      "item": "exact product name from history",
      "urgency": "need_now|need_soon|dont_forget",
      "reason": "brief explanation",
      "qty": 1,
      "unit_price": 3.93,
      "walmart_search": "https://www.walmart.com/search?q=URL+encoded+product+name"
    }
  ],
  "estimated_total": 0,
  "free_delivery": {
    "threshold": 35.00,
    "current_total": 0,
    "gap": 0,
    "status": "met|needs_filler|too_low",
    "filler_suggestions": [
      {
        "item": "product name",
        "reason": "why this is a smart filler",
        "strategy": "pull_forward_staple|long_shelf_life|non_grocery_need",
        "unit_price": 0,
        "qty": 1,
        "walmart_search": "https://www.walmart.com/search?q=URL+encoded+product+name"
      }
    ],
    "recommendation": "brief recommendation text"
  }
}`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { images, today } = req.body;

    if (!images || images.length === 0) {
      return res.status(400).json({ error: 'At least one image is required' });
    }

    const content = [];

    for (const img of images) {
      if (!img || img.length === 0) continue;
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: 'image/jpeg',
          data: img,
        },
      });
    }

    if (content.length === 0) {
      return res.status(400).json({ error: 'No valid images received' });
    }

    content.push({
      type: 'text',
      text: `Today's date: ${today}

Purchase history:
${JSON.stringify(PURCHASE_HISTORY, null, 2)}

Baseline prices:
- a2 Milk Vitamin D Whole Milk, 59 oz: $3.93 (perishable)
- Great Value 2% Reduced Fat Milk, Gallon: $2.70 (perishable)
- Marketside Cage-Free Large Brown Eggs, 18 ct: $3.93
- Fresh Fuji Apples, 3 lb Bag: $3.34 (perishable)
- Great Value Garbanzos Chick Peas, 15.5 oz: $0.77/can (non-perishable)
- Great Value Triple Berry Blend, 48 oz (Frozen): $10.15
- Great Value Mango Chunks, 16 oz (Frozen): $3.07
- Great Value Raw Honey, 16 oz: $5.64 (non-perishable)
- Great Value Vegetable Oil, 1 Gallon: $8.43 (non-perishable)
- Parent's Choice Diapers Size 4, 192 ct: $24.64

Analyze the fridge photo(s), identify items and quantity levels, determine restocking needs, and generate the restock list with free delivery optimization. Return ONLY valid JSON.`,
    });

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
    });

    const text = response.content[0].text;

    let result;
    try {
      result = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse Claude response as JSON');
      }
    }

    return res.status(200).json(result);
  } catch (error) {
    console.error('Analyze fridge error:', error);
    return res.status(500).json({
      error: 'Analysis failed',
      message: error.message,
    });
  }
}
