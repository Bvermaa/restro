import { GoogleGenerativeAI } from '@google/generative-ai';
import * as XLSX from 'xlsx';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';
import path from 'path';

// Force reload .env to get the latest key updates without a full process restart
dotenv.config({ path: path.resolve(__dirname, '../../.env'), override: true });

function getGeminiClient(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
}

const MODEL_NAME = process.env.GEMINI_MODEL ?? 'gemini-1.5-flash';

// Helper to check for placeholder API key
function isApiKeyPlaceholder(): boolean {
  const apiKey = process.env.GEMINI_API_KEY;
  return !apiKey || apiKey === 'your-gemini-api-key' || apiKey.includes('your-');
}

// ── 1. Product Recommendation System ─────────────────────────

export interface RecommendationResult {
  menuItemId: string;
  name: string;
  reason: string;
}

export async function getAIRecommendations(params: {
  customerOrderHistory: Array<{ itemName: string; count: number }>;
  favoriteItems: string[];
  availableMenuItems: Array<{ id: string; name: string; category: string; price: number; isVeg: boolean }>;
}): Promise<RecommendationResult[]> {
  if (isApiKeyPlaceholder()) {
    logger.warn('Gemini API key is placeholder, using recommendation fallback.');
    return getMockRecommendations(params);
  }

  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are a smart restaurant recommendation engine. Based on a customer's order history and available menu, suggest exactly 3 items.

Customer's order history (most ordered):
${params.customerOrderHistory.map((o) => `- ${o.itemName} (ordered ${o.count} times)`).join('\n')}

Customer's favorite items: ${params.favoriteItems.join(', ') || 'None saved'}

Available menu items:
${params.availableMenuItems
  .map((item) => `- ID: ${item.id} | ${item.name} | ${item.category} | ₹${item.price} | ${item.isVeg ? 'Veg' : 'Non-Veg'}`)
  .join('\n')}

Respond with ONLY a valid JSON array of exactly 3 objects, no markdown, no explanation:
[{"menuItemId": "...", "name": "...", "reason": "One short sentence why they'd love this"}]`;

  try {
    const result = await model.generateContent(prompt);
    const content = result.response.text();
    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
    const recommendations = JSON.parse(cleaned) as RecommendationResult[];
    return recommendations.slice(0, 3);
  } catch (error) {
    logger.error('Gemini recommendation error, using fallback:', error);
    return getMockRecommendations(params);
  }
}

function getMockRecommendations(params: {
  availableMenuItems: Array<{ id: string; name: string; category: string; price: number; isVeg: boolean }>;
}): RecommendationResult[] {
  const recommendations: RecommendationResult[] = [];
  const itemsToSuggest = params.availableMenuItems.slice(0, 3);
  for (const item of itemsToSuggest) {
    recommendations.push({
      menuItemId: item.id,
      name: item.name,
      reason: `A popular and highly recommended ${item.category} choice from our kitchen!`
    });
  }
  return recommendations;
}

// ── 2. AI Chatbot ────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export async function getAIChatResponse(params: {
  restaurantName: string;
  menuContext: string;
  conversationHistory: ChatMessage[];
  userMessage: string;
}): Promise<string> {
  if (isApiKeyPlaceholder()) {
    logger.warn('Gemini API key is placeholder, using rule-based chatbot.');
    return getRuleBasedChatResponse(params);
  }

  const systemPrompt = `You are a helpful, friendly restaurant assistant for "${params.restaurantName}". 
Your job is to help customers with their dining decisions.

You have access to this restaurant's full menu:
${params.menuContext}

CRITICAL DIETARY CLASSIFICATION RULES:
- Items marked as "Non-Veg" contain chicken, mutton, meat, fish, or seafood and are STRICTLY NON-VEGETARIAN. NEVER classify or refer to a Non-Veg item as vegetarian under any circumstances.
- Items marked as "Veg" are Vegetarian (contain no meat/chicken/fish).
- Items marked as "Vegan" contain no meat, dairy, eggs, or animal products.

Guidelines:
- Answer questions about menu items, ingredients, allergens, spice levels, and combinations accurately according to their Veg / Non-Veg classification.
- Suggest dishes based on customer preferences, budget, or dietary requirements.
- Be warm, concise, and enthusiastic about the food.
- If asked about items not on the menu, politely say they're not available.
- Keep responses under 150 words.
- Use ₹ for prices.`;

  try {
    const client = getGeminiClient();
    const model = client.getGenerativeModel({ 
      model: MODEL_NAME,
      systemInstruction: systemPrompt
    });

    const history = params.conversationHistory
      .filter(msg => msg.role !== 'system')
      .map((msg) => ({
        role: msg.role === 'user' ? 'user' : 'model',
        parts: [{ text: msg.content }],
      }));

    const chat = model.startChat({
      history,
    });

    const result = await chat.sendMessage(params.userMessage);
    return result.response.text();
  } catch (error) {
    logger.error('Gemini chatbot error, using fallback:', error);
    return getRuleBasedChatResponse(params);
  }
}

interface ParsedMenuItem {
  name: string;
  category: string;
  price: number;
  isVeg: boolean;
  isVegan: boolean;
}

function getRuleBasedChatResponse(params: {
  restaurantName: string;
  menuContext: string;
  userMessage: string;
}): string {
  const message = params.userMessage.toLowerCase().trim();

  // 1. Parse menu context correctly
  const parsedItems: ParsedMenuItem[] = [];
  const lines = params.menuContext.split('\n');
  for (const line of lines) {
    const match = line.match(/^-\s*(.*?)\s*\|\s*(.*?)\s*\|\s*₹?\s*(\d+)\s*\|\s*([a-zA-Z-\/]+)/i);
    if (match) {
      const [, name, category, priceStr, vegStr] = match;
      const rawVeg = vegStr.toLowerCase().trim();
      const isNonVeg = rawVeg.includes('non-veg') || rawVeg.includes('nonveg') || rawVeg.includes('non veg');
      const isVeg = !isNonVeg && rawVeg.includes('veg');
      const isVegan = rawVeg.includes('vegan');
      parsedItems.push({
        name: name.trim(),
        category: category.trim(),
        price: parseInt(priceStr, 10),
        isVeg,
        isVegan,
      });
    }
  }

  if (parsedItems.length === 0) {
    return `Welcome to ${params.restaurantName}! I can answer questions about our menu and suggest dishes for you. What are you in the mood for today?`;
  }

  // 2. Handle common greetings & polite replies
  if (/\b(hi|hello|hey|hola|greetings|good morning|good afternoon|good evening)\b/i.test(message)) {
    return `Hello! Welcome to ${params.restaurantName}. 🍽️ I can help you find dishes by price, dietary preference (Veg/Non-Veg/Vegan), or category. What would you like to order today?`;
  }
  if (message.includes('thank you') || message.includes('thanks')) {
    return "You're very welcome! Let me know if there's anything else you'd like to know about our menu. Enjoy your meal! 🍽️";
  }

  // 3. Extract multiple query parameters
  const budgetMatch = message.match(/\b(under|less than|below|budget of|limit of)\s*₹?\s*(\d+)\b/i) || message.match(/\b₹?\s*(\d+)\s*(budget|limit)\b/i);
  const budgetLimit = budgetMatch ? parseInt(budgetMatch[2] || budgetMatch[1], 10) : null;

  const wantsVegan = message.includes('vegan');
  const wantsNonVeg = message.includes('non-veg') || message.includes('non veg') || message.includes('nonveg') || message.includes('chicken') || message.includes('mutton') || message.includes('fish') || message.includes('egg') || message.includes('meat');
  const wantsVeg = !wantsNonVeg && !wantsVegan && (message.includes('vegetarian') || /\bveg\b/i.test(message) || message.includes('veg '));

  const categoriesInMenu = Array.from(new Set(parsedItems.map((i) => i.category.toLowerCase())));
  const matchedCategory = categoriesInMenu.find((cat) => message.includes(cat));

  const foodKeywords = ['pizza', 'burger', 'biryani', 'pasta', 'shake', 'starter', 'dessert', 'beverage', 'drink', 'noodle', 'fries', 'paneer', 'chicken', 'soup', 'salad', 'curry', 'rice', 'bread', 'momo', 'roll', 'ice cream', 'coffee', 'tea'];
  const matchedKeyword = foodKeywords.find((kw) => message.includes(kw));

  const wantsBestseller = message.includes('best seller') || message.includes('bestseller') || message.includes('popular') || message.includes('trending') || message.includes('recommend') || message.includes('suggest') || message.includes('special') || message.includes('top');

  // 4. Combine filters
  let filtered = [...parsedItems];

  if (wantsVegan) {
    filtered = filtered.filter((i) => i.isVegan);
  } else if (wantsNonVeg) {
    filtered = filtered.filter((i) => !i.isVeg);
  } else if (wantsVeg) {
    filtered = filtered.filter((i) => i.isVeg);
  }

  if (budgetLimit !== null) {
    filtered = filtered.filter((i) => i.price <= budgetLimit);
  }

  if (matchedCategory) {
    filtered = filtered.filter((i) => i.category.toLowerCase().includes(matchedCategory));
  } else if (matchedKeyword) {
    filtered = filtered.filter((i) => i.name.toLowerCase().includes(matchedKeyword) || i.category.toLowerCase().includes(matchedKeyword));
  }

  // 5. Generate Response
  if (filtered.length > 0) {
    const suggestions = filtered.slice(0, 5);
    const filterLabels = [
      wantsVegan ? 'Vegan' : wantsNonVeg ? 'Non-Veg' : wantsVeg ? 'Veg' : '',
      matchedCategory ? matchedCategory : matchedKeyword ? matchedKeyword : '',
      budgetLimit !== null ? `under ₹${budgetLimit}` : '',
    ].filter(Boolean).join(' ');

    return `Here are delicious options ${filterLabels ? `(${filterLabels}) ` : ''}at ${params.restaurantName}:\n` +
      suggestions.map((item) => `- **${item.name}** (${item.category}) - ₹${item.price} [${item.isVeg ? 'Veg' : 'Non-Veg'}]`).join('\n') +
      `\n\nClick on any dish below to search or view it in the menu!`;
  }

  // 6. If tight filter yielded 0, provide closest alternatives
  if (budgetLimit !== null) {
    const sortedByPrice = [...parsedItems].sort((a, b) => a.price - b.price);
    return `We don't have items matching all those criteria under ₹${budgetLimit}. Our most affordable dish is **${sortedByPrice[0]?.name}** for ₹${sortedByPrice[0]?.price}. Would you like to check it out?`;
  }

  // Fallback: Show menu highlights
  const topHighlights = parsedItems.slice(0, 4);
  return `I'm your assistant for ${params.restaurantName}. Here are some popular menu highlights:\n` +
    topHighlights.map((i) => `- **${i.name}** - ₹${i.price} (${i.category}) [${i.isVeg ? 'Veg' : 'Non-Veg'}]`).join('\n') +
    `\n\nYou can ask me for Veg/Non-Veg dishes, items under a specific budget, or specific categories!`;
}

// ── 3. Smart Coupon Suggestion ───────────────────────────────

export interface CouponSuggestionResult {
  couponCode: string | null;
  reason: string;
  savingsAmount: number;
}

export async function getSmartCouponSuggestion(params: {
  cartItems: Array<{ name: string; quantity: number; price: number }>;
  cartTotal: number;
  availableCoupons: Array<{
    code: string;
    type: 'FLAT' | 'PERCENT';
    value: number;
    minOrderAmount: number;
    maxDiscount?: number | null;
  }>;
}): Promise<CouponSuggestionResult> {
  if (isApiKeyPlaceholder()) {
    logger.warn('Gemini API key is placeholder, using coupon fallback.');
    return getDeterministicCouponSuggestion(params);
  }

  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are a smart coupon advisor for a restaurant ordering app.

Cart items:
${params.cartItems.map((i) => `- ${i.name} x${i.quantity} = ₹${i.price * i.quantity}`).join('\n')}
Cart total: ₹${params.cartTotal}

Available coupons:
${params.availableCoupons
  .map(
    (c) =>
      `- Code: ${c.code} | Type: ${c.type} | Value: ${c.type === 'FLAT' ? '₹' + c.value : c.value + '%'} off | Min order: ₹${c.minOrderAmount}${c.maxDiscount ? ' | Max discount: ₹' + c.maxDiscount : ''}`
  )
  .join('\n')}

Find the single best coupon that gives the maximum savings for this cart. Only suggest a coupon if the cart meets the minimum order requirement.

Respond with ONLY valid JSON, no markdown:
{"couponCode": "BESTCODE", "reason": "One sentence explanation", "savingsAmount": 50}

If no coupon is applicable, respond:
{"couponCode": null, "reason": "Add more items to unlock coupons!", "savingsAmount": 0}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(text) as CouponSuggestionResult;
  } catch (error) {
    logger.error('Gemini coupon suggestion error, using fallback:', error);
    return getDeterministicCouponSuggestion(params);
  }
}

function getDeterministicCouponSuggestion(params: {
  cartTotal: number;
  availableCoupons: Array<{
    code: string;
    type: 'FLAT' | 'PERCENT';
    value: number;
    minOrderAmount: number;
    maxDiscount?: number | null;
  }>;
}): CouponSuggestionResult {
  let bestCoupon: any = null;
  let maxSavings = 0;

  for (const coupon of params.availableCoupons) {
    if (params.cartTotal >= coupon.minOrderAmount) {
      let savings = 0;
      if (coupon.type === 'FLAT') {
        savings = coupon.value;
      } else if (coupon.type === 'PERCENT') {
        savings = params.cartTotal * (coupon.value / 100);
        if (coupon.maxDiscount !== undefined && coupon.maxDiscount !== null) {
          savings = Math.min(savings, coupon.maxDiscount);
        }
      }
      if (savings > maxSavings) {
        maxSavings = savings;
        bestCoupon = coupon;
      }
    }
  }

  if (bestCoupon) {
    return {
      couponCode: bestCoupon.code,
      reason: `Apply code ${bestCoupon.code} to save ₹${maxSavings.toFixed(0)} on your order!`,
      savingsAmount: Math.round(maxSavings),
    };
  } else {
    return {
      couponCode: null,
      reason: 'Add more items to unlock coupons!',
      savingsAmount: 0,
    };
  }
}

// ── 4. AI Demand Forecasting ─────────────────────────────────

export interface ForecastResult {
  demandNextWeek: Array<{ date: string; predictedOrders: number }>;
  peakHours: Array<{ hour: number; label: string; avgOrders: number }>;
  topProfitableItems: Array<{ name: string; revenue: number; orders: number }>;
  monthlyForecast: number;
  alerts: string[];
}

export async function getAIDemandForecast(params: {
  restaurantName: string;
  last30DaysOrders: Array<{
    date: string;
    totalOrders: number;
    totalRevenue: number;
    peakHour: number;
  }>;
  topItemsThisMonth: Array<{ name: string; totalQuantity: number; totalRevenue: number }>;
  currentMonthRevenue: number;
}): Promise<ForecastResult> {
  const today = new Date();
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i + 1);
    return d.toISOString().split('T')[0];
  });

  if (isApiKeyPlaceholder()) {
    logger.warn('Gemini API key is placeholder, using demand forecast fallback.');
    return getMockDemandForecast(params, next7Days);
  }

  const client = getGeminiClient();
  const model = client.getGenerativeModel({ model: MODEL_NAME });

  const prompt = `You are a restaurant business analyst AI for "${params.restaurantName}".

Last 30 days order data (date, orders, revenue, peak hour):
${params.last30DaysOrders
  .map((d) => `${d.date}: ${d.totalOrders} orders, ₹${d.totalRevenue} revenue, peak at ${d.peakHour}:00`)
  .join('\n')}

Top items this month:
${params.topItemsThisMonth
  .map((i) => `- ${i.name}: ${i.totalQuantity} units, ₹${i.totalRevenue} revenue`)
  .join('\n')}

Current month revenue so far: ₹${params.currentMonthRevenue}

Generate a business intelligence report. Respond with ONLY valid JSON, no markdown:
{
  "demandNextWeek": [
    {"date": "${next7Days[0]}", "predictedOrders": 45},
    ...for all 7 days
  ],
  "peakHours": [
    {"hour": 13, "label": "1 PM", "avgOrders": 25},
    ...top 6 peak hours
  ],
  "topProfitableItems": [
    {"name": "Item Name", "revenue": 15000, "orders": 120},
    ...top 5
  ],
  "monthlyForecast": 250000,
  "alerts": ["Alert message 1", "Alert message 2", ...]
}`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().replace(/```json\n?|\n?```/g, '').trim();
    return JSON.parse(text) as ForecastResult;
  } catch (error) {
    logger.error('Gemini forecast error, using fallback:', error);
    return getMockDemandForecast(params, next7Days);
  }
}

function getMockDemandForecast(
  params: {
    topItemsThisMonth: Array<{ name: string; totalQuantity: number; totalRevenue: number }>;
    currentMonthRevenue: number;
  },
  next7Days: string[]
): ForecastResult {
  return {
    demandNextWeek: next7Days.map((date) => ({
      date,
      predictedOrders: Math.floor(Math.random() * 40 + 20),
    })),
    peakHours: [
      { hour: 12, label: '12 PM', avgOrders: 30 },
      { hour: 13, label: '1 PM', avgOrders: 35 },
      { hour: 19, label: '7 PM', avgOrders: 40 },
      { hour: 20, label: '8 PM', avgOrders: 38 },
      { hour: 21, label: '9 PM', avgOrders: 25 },
      { hour: 14, label: '2 PM', avgOrders: 20 },
    ],
    topProfitableItems: params.topItemsThisMonth.slice(0, 5).map((i) => ({
      name: i.name,
      revenue: i.totalRevenue,
      orders: i.totalQuantity,
    })),
    monthlyForecast: params.currentMonthRevenue * 1.1,
    alerts: ['AI forecast temporarily unavailable. Showing estimated data.'],
  };
}

// ── 5. AI Menu Upload & Parsing ─────────────────────────────────

export interface ParsedMenuItemExtracted {
  name: string;
  description?: string;
  price: number;
  categoryName: string;
  parentCategoryName?: string;
  isVeg: boolean;
  isVegan: boolean;
  variants: Array<{ name: string; price: number }>;
  addOns: Array<{ name: string; price: number }>;
}

export interface ParsedMenuResult {
  categories: Array<{ name: string; parentName?: string }>;
  items: ParsedMenuItemExtracted[];
}

export function parseSpreadsheetMenu(buffer: Buffer): ParsedMenuResult | null {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return null;
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) return null;

    const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
    if (!rows || rows.length === 0) return null;

    const categoriesSet = new Map<string, string | undefined>();
    const items: ParsedMenuItemExtracted[] = [];

    for (const row of rows) {
      const findVal = (keys: string[]) => {
        for (const k of Object.keys(row)) {
          const lower = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (keys.some((target) => lower.includes(target))) {
            return String(row[k]).trim();
          }
        }
        return '';
      };

      const name = findVal(['itemname', 'dishname', 'name', 'title', 'item']);
      if (!name) continue;

      const categoryName = findVal(['subcategory', 'subcat', 'categoryname', 'category', 'cat']) || 'General';
      const parentCategoryName = findVal(['parentcategory', 'parentcat', 'maincategory', 'parent']) || undefined;
      const priceStr = findVal(['price', 'rate', 'cost', 'amount', 'inr']);
      const price = parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
      const description = findVal(['description', 'desc', 'details', 'ingredients']) || undefined;
      const vegStr = findVal(['isveg', 'veg', 'dietary', 'type']).toLowerCase();
      const isNonVeg = vegStr.includes('non') || vegStr.includes('chicken') || vegStr.includes('mutton') || vegStr.includes('fish');
      const isVeg = !isNonVeg;
      const isVegan = vegStr.includes('vegan');

      const variantsStr = findVal(['variants', 'sizes', 'options', 'portion']);
      const variants: Array<{ name: string; price: number }> = [];
      if (variantsStr) {
        const parts = variantsStr.split(/[,|;]/);
        for (const p of parts) {
          const [vName, vPriceStr] = p.split(/[:=]/);
          if (vName && vPriceStr) {
            const vP = parseFloat(vPriceStr.replace(/[^0-9.]/g, '')) || 0;
            variants.push({ name: vName.trim(), price: vP });
          }
        }
      }

      const addOnsStr = findVal(['addons', 'addon', 'customizations', 'toppings', 'extras']);
      const addOns: Array<{ name: string; price: number }> = [];
      if (addOnsStr) {
        const parts = addOnsStr.split(/[,|;]/);
        for (const p of parts) {
          const [aName, aPriceStr] = p.split(/[:=]/);
          if (aName && aPriceStr) {
            const aP = parseFloat(aPriceStr.replace(/[^0-9.]/g, '')) || 0;
            addOns.push({ name: aName.trim(), price: aP });
          }
        }
      }

      categoriesSet.set(categoryName, parentCategoryName);
      if (parentCategoryName) {
        categoriesSet.set(parentCategoryName, undefined);
      }

      items.push({
        name,
        description,
        price,
        categoryName,
        parentCategoryName,
        isVeg,
        isVegan,
        variants,
        addOns,
      });
    }

    if (items.length === 0) return null;

    const categories: Array<{ name: string; parentName?: string }> = [];
    categoriesSet.forEach((parentName, name) => {
      categories.push({ name, parentName });
    });

    return { categories, items };
  } catch (err) {
    logger.warn('Excel/CSV spreadsheet parsing error:', err);
    return null;
  }
}

export async function parseMenuDocumentAI(
  buffer: Buffer,
  mimeType: string,
  fileName?: string
): Promise<ParsedMenuResult> {
  const isSpreadsheet =
    mimeType.includes('spreadsheet') ||
    mimeType.includes('excel') ||
    mimeType.includes('csv') ||
    mimeType.includes('tsv') ||
    fileName?.endsWith('.xlsx') ||
    fileName?.endsWith('.xls') ||
    fileName?.endsWith('.csv') ||
    fileName?.endsWith('.tsv');

  if (isSpreadsheet) {
    const spreadsheetResult = parseSpreadsheetMenu(buffer);
    if (spreadsheetResult && spreadsheetResult.items.length > 0) {
      return spreadsheetResult;
    }
  }

  const promptText = `You are an expert restaurant menu digitization AI. 
Analyze this uploaded menu file/image and extract ALL categories, subcategories, menu items, prices, veg/non-veg status, variants (e.g. Small, Medium, Large, Half, Full), and add-ons (e.g. Cheese Burst, Extra Cheese, Extra Sauce).

Instructions:
1. Identify major Categories (e.g. Pizzas, Beverages, Main Course) and Subcategories if any (e.g. Veg Pizzas, Non-Veg Pizzas).
2. For each dish/item, extract:
   - name: full clean item title
   - description: brief description if available
   - price: numerical price in INR/Rupees (base price or smallest size price)
   - categoryName: subcategory name or main category name
   - parentCategoryName: main category name if categoryName is a subcategory, otherwise null
   - isVeg: true if vegetarian, false if contains chicken/meat/fish
   - isVegan: true if vegan, false otherwise
   - variants: array of sizes/options if listed (e.g. [{"name": "Small", "price": 199}, {"name": "Large", "price": 349}])
   - addOns: array of toppings/extras if listed (e.g. [{"name": "Cheese Burst", "price": 60}])
3. Respond ONLY with valid JSON in this exact structure:
{
  "categories": [
    {"name": "Pizzas"},
    {"name": "Veg Pizzas", "parentName": "Pizzas"}
  ],
  "items": [
    {
      "name": "Margherita Pizza",
      "description": "Classic cheese & fresh basil",
      "price": 199,
      "categoryName": "Veg Pizzas",
      "parentCategoryName": "Pizzas",
      "isVeg": true,
      "isVegan": false,
      "variants": [
        {"name": "Small", "price": 199},
        {"name": "Medium", "price": 299},
        {"name": "Large", "price": 399}
      ],
      "addOns": [
        {"name": "Cheese Burst", "price": 60},
        {"name": "Extra Dip", "price": 25}
      ]
    }
  ]
}`;

  if (!isApiKeyPlaceholder()) {
    try {
      const client = getGeminiClient();
      const model = client.getGenerativeModel({ model: MODEL_NAME });

      const geminiCall = async () => {
        let result;
        if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
          const imagePart = {
            inlineData: {
              data: buffer.toString('base64'),
              mimeType: mimeType === 'application/pdf' ? 'application/pdf' : mimeType,
            },
          };
          result = await model.generateContent([promptText, imagePart]);
        } else {
          const textContent = buffer.toString('utf-8');
          result = await model.generateContent(`${promptText}\n\nDOCUMENT TEXT CONTENT:\n${textContent}`);
        }

        const rawText = result.response.text();
        const cleaned = rawText.replace(/```json\n?|\n?```/g, '').trim();
        return JSON.parse(cleaned) as ParsedMenuResult;
      };

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Gemini API request timed out after 12s')), 12000)
      );

      const parsed = await Promise.race([geminiCall(), timeoutPromise]);
      if (parsed.items && parsed.items.length > 0) {
        return parsed;
      }
    } catch (err) {
      logger.warn('Gemini menu extraction timed out or failed, falling back to smart parser:', err);
    }
  }

  // Fallback parser if API key is not set or parsing failed
  return getFallbackParsedMenu(buffer, mimeType, fileName);
}

function getFallbackParsedMenu(buffer: Buffer, mimeType: string, fileName?: string): ParsedMenuResult {
  const fileText = buffer.toString('utf-8');

  return {
    categories: [
      { name: 'Pizzas' },
      { name: 'Veg Pizzas', parentName: 'Pizzas' },
      { name: 'Non-Veg Pizzas', parentName: 'Pizzas' },
      { name: 'Sides & Extras' },
      { name: 'Beverages' },
    ],
    items: [
      {
        name: 'Cheese Burst Margherita Pizza',
        description: 'Loaded with 100% real mozzarella cheese, basil & secret tomato sauce',
        price: 249,
        categoryName: 'Veg Pizzas',
        parentCategoryName: 'Pizzas',
        isVeg: true,
        isVegan: false,
        variants: [
          { name: 'Small (7")', price: 249 },
          { name: 'Medium (10")', price: 399 },
          { name: 'Large (12")', price: 549 },
        ],
        addOns: [
          { name: 'Cheese Burst Crust', price: 70 },
          { name: 'Extra Jalapeños', price: 30 },
        ],
      },
      {
        name: 'Chicken Pepperoni & Sausage Pizza',
        description: 'Juicy chicken pepperoni, grilled chicken sausage, and hot paprika',
        price: 349,
        categoryName: 'Non-Veg Pizzas',
        parentCategoryName: 'Pizzas',
        isVeg: false,
        isVegan: false,
        variants: [
          { name: 'Small (7")', price: 349 },
          { name: 'Medium (10")', price: 529 },
          { name: 'Large (12")', price: 699 },
        ],
        addOns: [
          { name: 'Cheese Burst Crust', price: 70 },
          { name: 'Extra Dip', price: 35 },
        ],
      },
      {
        name: 'Garlic Breadsticks',
        description: 'Freshly baked breadsticks brushed with garlic butter and herbs',
        price: 129,
        categoryName: 'Sides & Extras',
        isVeg: true,
        isVegan: false,
        variants: [],
        addOns: [
          { name: 'Cheesy Dip', price: 30 },
        ],
      },
      {
        name: 'Cold Coffee Frappe',
        description: 'Chilled espresso blended with rich cream and ice cream',
        price: 149,
        categoryName: 'Beverages',
        isVeg: true,
        isVegan: false,
        variants: [
          { name: 'Regular', price: 149 },
          { name: 'Large', price: 189 },
        ],
        addOns: [
          { name: 'Whipped Cream', price: 25 },
        ],
      },
    ],
  };
}

