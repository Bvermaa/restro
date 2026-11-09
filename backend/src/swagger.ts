import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'EZ- Restaurant SaaS API',
      version: '1.0.0',
      description: `
## Multi-Restaurant QR-Based Ordering & Management SaaS Platform API

### Features
- Customer ordering via QR code (guest + authenticated)
- Restaurant owner panel (menu, orders, analytics)
- Super admin panel (restaurant/user management)
- Real-time order tracking via Socket.io
- AI-powered recommendations (Groq) and demand forecasting (Gemini)
- Razorpay payment integration with COD support

### Authentication
Use Bearer token authentication. Get a token via **POST /auth/login**.
Include it in the \`Authorization\` header: \`Bearer <token>\`

### Rate Limiting
- General API: 100 req/15min
- Auth routes: 10 req/15min
- AI routes: 10 req/min
      `,
      contact: {
        name: 'EZ- Restaurant Support',
        email: 'support@qrrestaurant.com',
      },
      license: { name: 'MIT' },
    },
    servers: [
      { url: 'http://localhost:4000/api/v1', description: 'Development server' },
      { url: 'https://api.qrrestaurant.com/api/v1', description: 'Production server' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
        },
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            id: { type: 'string', example: 'clz1abc123' },
            name: { type: 'string', example: 'Priya Mehta' },
            email: { type: 'string', example: 'priya@example.com' },
            phone: { type: 'string', example: '9876543210' },
            role: { type: 'string', enum: ['CUSTOMER', 'RESTAURANT_OWNER', 'SUPER_ADMIN'] },
            isVerified: { type: 'boolean' },
            loyaltyPoints: { type: 'number', example: 150 },
            walletBalance: { type: 'number', example: 200 },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        Restaurant: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Upstates' },
            slug: { type: 'string', example: 'upstates' },
            description: { type: 'string' },
            cuisineType: { type: 'string', example: 'North Indian' },
            logo: { type: 'string', format: 'uri' },
            banner: { type: 'string', format: 'uri' },
            isOpen: { type: 'boolean' },
            isApproved: { type: 'boolean' },
            minOrderValue: { type: 'number', example: 200 },
            themeColor: { type: 'string', example: '#E85D04' },
          },
        },
        MenuItem: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string', example: 'Butter Chicken' },
            price: { type: 'number', example: 420 },
            isVeg: { type: 'boolean' },
            isVegan: { type: 'boolean' },
            isAvailable: { type: 'boolean' },
            badges: { type: 'array', items: { type: 'string', enum: ['POPULAR', 'TRENDING', 'BEST_SELLER', 'NEW'] } },
            image: { type: 'string', format: 'uri' },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            status: { type: 'string', enum: ['PENDING', 'CONFIRMED', 'PREPARING', 'BAKING', 'READY', 'ON_THE_WAY', 'DELIVERED', 'CANCELLED'] },
            total: { type: 'number' },
            paymentMethod: { type: 'string', enum: ['RAZORPAY', 'COD', 'WALLET'] },
            paymentStatus: { type: 'string', enum: ['PENDING', 'PAID', 'FAILED', 'REFUNDED'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        ApiError: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            error: { type: 'string', example: 'Error description' },
            code: { type: 'string', example: 'ERROR_CODE' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Authentication endpoints' },
      { name: 'Menu', description: 'Public menu browsing' },
      { name: 'Cart', description: 'Shopping cart management' },
      { name: 'Orders', description: 'Order placement and tracking' },
      { name: 'Profile', description: 'Customer profile management' },
      { name: 'AI', description: 'AI-powered features' },
      { name: 'Owner', description: 'Restaurant owner dashboard' },
      { name: 'Admin', description: 'Super admin management' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/controllers/*.ts'],
};

export const swaggerSpec = swaggerJsdoc(options);
