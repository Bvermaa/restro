import Groq from 'groq-sdk';
import { logger } from '../utils/logger';

let groqClient: Groq;

function getGroqClient(): Groq {
  if (!groqClient) {
    groqClient = new Groq({
      apiKey: process.env.GROQ_API_KEY,
    });
  }
  return groqClient;
}

const MODEL = process.env.GROQ_MODEL ?? 'llama3-8b-8192';

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
  const groq = getGroqClient();

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
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content ?? '[]';
    const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
    const recommendations = JSON.parse(cleaned) as RecommendationResult[];

    return recommendations.slice(0, 3);
  } catch (error) {
    logger.error('Groq recommendation error:', error);
    // Return empty array as fallback
    return [];
  }
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
  const groq = getGroqClient();

  const systemPrompt = `You are a helpful, friendly restaurant assistant for "${params.restaurantName}". 
Your job is to help customers with their dining decisions.

You have access to this restaurant's full menu:
${params.menuContext}

Guidelines:
- Answer questions about menu items, ingredients, allergens, spice levels, and combinations.
- Suggest dishes based on customer preferences, budget, or dietary requirements.
- Be warm, concise, and enthusiastic about the food.
- If asked about items not on the menu, politely say they're not available.
- If asked off-topic questions (unrelated to food/dining), politely decline and redirect.
- Keep responses under 150 words.
- Use ₹ for prices.`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...params.conversationHistory.slice(-10), // Keep last 10 messages for context
    { role: 'user', content: params.userMessage },
  ];

  try {
    const completion = await groq.chat.completions.create({
      model: MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 300,
    });

    return completion.choices[0]?.message?.content ?? 'I\'m sorry, I couldn\'t process your request right now. Please try again.';
  } catch (error) {
    logger.error('Groq chatbot error:', error);
    return 'Sorry, I\'m having trouble right now. Please try again in a moment.';
  }
}
