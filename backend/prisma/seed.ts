import { PrismaClient, UserRole, ItemBadge } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed...');

  console.log('🧹 Cleaning database...');
  await prisma.chatMessage.deleteMany({});
  await prisma.aiRecommendation.deleteMany({});
  await prisma.couponUsage.deleteMany({});
  await prisma.payment.deleteMany({});
  await prisma.review.deleteMany({});
  await prisma.notification.deleteMany({});
  await prisma.orderItem.deleteMany({});
  await prisma.loyaltyTransaction.deleteMany({});
  await prisma.walletTransaction.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.favoriteItem.deleteMany({});
  await prisma.itemAddOn.deleteMany({});
  await prisma.itemVariant.deleteMany({});
  await prisma.menuItem.deleteMany({});
  await prisma.menuCategory.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.restaurantSubscription.deleteMany({});
  await prisma.subscriptionPlan.deleteMany({});
  await prisma.address.deleteMany({});
  await prisma.restaurant.deleteMany({});
  await prisma.user.deleteMany({});
  console.log('🧹 Database clean complete.');

  // ── 1. Super Admin ──────────────────────────────────────────
  const adminPasswordHash = await bcrypt.hash(
    process.env.SUPER_ADMIN_PASSWORD ?? 'Admin@123456',
    12
  );

  const admin = await prisma.user.upsert({
    where: { email: process.env.SUPER_ADMIN_EMAIL ?? 'admin@qrrestaurant.com' },
    update: {},
    create: {
      name: process.env.SUPER_ADMIN_NAME ?? 'Platform Admin',
      email: process.env.SUPER_ADMIN_EMAIL ?? 'admin@qrrestaurant.com',
      passwordHash: adminPasswordHash,
      role: UserRole.SUPER_ADMIN,
      isVerified: true,
    },
  });
  console.log(`✅ Super admin created: ${admin.email}`);

  // ── 2. Restaurant Owner ──────────────────────────────────────
  const ownerPasswordHash = await bcrypt.hash('Owner@123456', 12);

  const owner = await prisma.user.upsert({
    where: { email: 'owner@upstates.com' },
    update: {},
    create: {
      name: 'Rajan Sharma',
      email: 'owner@upstates.com',
      passwordHash: ownerPasswordHash,
      phone: '9876543210',
      role: UserRole.RESTAURANT_OWNER,
      isVerified: true,
    },
  });
  console.log(`✅ Restaurant owner created: ${owner.email}`);

  // ── 3. Sample Customer ──────────────────────────────────────
  const customerPasswordHash = await bcrypt.hash('Customer@123', 12);

  const customer = await prisma.user.upsert({
    where: { email: 'customer@example.com' },
    update: {},
    create: {
      name: 'Priya Mehta',
      email: 'customer@example.com',
      passwordHash: customerPasswordHash,
      phone: '9876543211',
      role: UserRole.CUSTOMER,
      isVerified: true,
      loyaltyPoints: 150,
      walletBalance: 200,
    },
  });
  console.log(`✅ Sample customer created: ${customer.email}`);

  const customer2 = await prisma.user.upsert({
    where: { email: 'customer2@example.com' },
    update: {},
    create: {
      name: 'Amit Patel',
      email: 'customer2@example.com',
      passwordHash: customerPasswordHash,
      phone: '9876543212',
      role: UserRole.CUSTOMER,
      isVerified: true,
      loyaltyPoints: 50,
      walletBalance: 100,
    },
  });
  console.log(`✅ Sample customer 2 created: ${customer2.email}`);

  const customer3 = await prisma.user.upsert({
    where: { email: 'customer3@example.com' },
    update: {},
    create: {
      name: 'Sneha Reddy',
      email: 'customer3@example.com',
      passwordHash: customerPasswordHash,
      phone: '9876543213',
      role: UserRole.CUSTOMER,
      isVerified: true,
      loyaltyPoints: 300,
      walletBalance: 500,
    },
  });
  console.log(`✅ Sample customer 3 created: ${customer3.email}`);

  // ── 4. Restaurant ───────────────────────────────────────────
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'upstates' },
    update: {},
    create: {
      name: 'Upstates',
      slug: 'upstates',
      description:
        'A premium dining experience featuring authentic North Indian and Mughlai cuisine in a warm, welcoming ambiance.',
      cuisineType: 'North Indian, Mughlai',
      logo: 'https://images.unsplash.com/photo-1514933651103-005eec06c04b?q=80&w=200&auto=format&fit=crop',
      banner:
        'https://images.unsplash.com/photo-1552566626-52f8b828add9?q=80&w=1200&auto=format&fit=crop',
      address: '42, Connaught Place',
      city: 'New Delhi',
      pincode: '110001',
      phone: '9876543210',
      isOpen: true,
      isApproved: true,
      minOrderValue: 200,
      deliveryRadius: 10,
      commissionRate: 5,
      themeColor: '#E85D04',
      operatingHours: {
        monday: { open: '11:00', close: '23:00', closed: false },
        tuesday: { open: '11:00', close: '23:00', closed: false },
        wednesday: { open: '11:00', close: '23:00', closed: false },
        thursday: { open: '11:00', close: '23:00', closed: false },
        friday: { open: '11:00', close: '23:30', closed: false },
        saturday: { open: '10:00', close: '23:30', closed: false },
        sunday: { open: '10:00', close: '22:30', closed: false },
      },
      ownerId: owner.id,
    },
  });
  console.log(`✅ Restaurant created: ${restaurant.name} (slug: ${restaurant.slug})`);

  // ── 5. Second Restaurant ─────────────────────────────────────
  const restaurant2 = await prisma.restaurant.upsert({
    where: { slug: 'pizza-palace' },
    update: {},
    create: {
      name: 'Pizza Palace',
      slug: 'pizza-palace',
      description: 'Authentic Italian-style pizzas with fresh ingredients and wood-fired perfection.',
      cuisineType: 'Italian, Pizza',
      address: '15, MG Road',
      city: 'Bangalore',
      pincode: '560001',
      phone: '9876543212',
      isOpen: true,
      isApproved: true,
      minOrderValue: 300,
      commissionRate: 5,
      themeColor: '#DC2626',
      operatingHours: {
        monday: { open: '12:00', close: '22:00', closed: false },
        tuesday: { open: '12:00', close: '22:00', closed: false },
        wednesday: { open: '12:00', close: '22:00', closed: false },
        thursday: { open: '12:00', close: '22:00', closed: false },
        friday: { open: '12:00', close: '23:00', closed: false },
        saturday: { open: '11:00', close: '23:00', closed: false },
        sunday: { open: '11:00', close: '22:00', closed: false },
      },
      ownerId: owner.id,
    },
  });
  console.log(`✅ Restaurant 2 created: ${restaurant2.name}`);

  // Seeding Pizza Palace Menu Categories and Items
  const pizzaCategories = await Promise.all([
    prisma.menuCategory.create({
      data: { name: 'Pizzas', restaurantId: restaurant2.id, sortOrder: 1 },
    }),
    prisma.menuCategory.create({
      data: { name: 'Sides', restaurantId: restaurant2.id, sortOrder: 2 },
    }),
    prisma.menuCategory.create({
      data: { name: 'Beverages', restaurantId: restaurant2.id, sortOrder: 3 },
    }),
  ]);

  const [pizzasCat, pizzaSidesCat, pizzaBevsCat] = pizzaCategories;
  console.log(`✅ Pizza Palace categories created`);

  await Promise.all([
    prisma.menuItem.create({
      data: {
        name: 'Margherita Pizza',
        description: 'Classic mozzarella, tomato sauce, and fresh basil on a wood-fired crust.',
        price: 280,
        categoryId: pizzasCat.id,
        restaurantId: restaurant2.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.BEST_SELLER, ItemBadge.POPULAR],
        variants: {
          create: [
            { name: 'Regular 7"', price: 180 },
            { name: 'Medium 10"', price: 280 },
            { name: 'Large 12"', price: 450 },
          ],
        },
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Peppy Paneer Pizza',
        description: 'Flavorful paneer, capsicum, red paprika, and spicy sauce.',
        price: 340,
        categoryId: pizzasCat.id,
        restaurantId: restaurant2.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.TRENDING],
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Garlic Breadsticks',
        description: 'Baked to a golden brown, garlic-buttered, and served with cheese dip.',
        price: 130,
        categoryId: pizzaSidesCat.id,
        restaurantId: restaurant2.id,
        isVeg: true,
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Coca Cola',
        description: 'Chilled soft drink (330ml).',
        price: 50,
        categoryId: pizzaBevsCat.id,
        restaurantId: restaurant2.id,
        isVeg: true,
        isAvailable: true,
      },
    }),
  ]);
  console.log(`✅ Pizza Palace menu items created`);

  // ── 5.1 Third Restaurant (Burger Bistro) ──────────────────────
  const restaurant3 = await prisma.restaurant.upsert({
    where: { slug: 'burger-bistro' },
    update: {},
    create: {
      name: 'Burger Bistro',
      slug: 'burger-bistro',
      description: 'Gourmet burgers with hand-cut fries and rich milkshakes.',
      cuisineType: 'Fast Food, Burgers',
      address: '22, Park Lane',
      city: 'Mumbai',
      pincode: '400001',
      phone: '9876543213',
      isOpen: true,
      isApproved: true,
      minOrderValue: 150,
      commissionRate: 5,
      themeColor: '#F59E0B',
      operatingHours: {
        monday: { open: '11:00', close: '23:00', closed: false },
        tuesday: { open: '11:00', close: '23:00', closed: false },
        wednesday: { open: '11:00', close: '23:00', closed: false },
        thursday: { open: '11:00', close: '23:00', closed: false },
        friday: { open: '11:00', close: '00:00', closed: false },
        saturday: { open: '11:00', close: '00:00', closed: false },
        sunday: { open: '11:00', close: '22:00', closed: false },
      },
      ownerId: owner.id,
    },
  });
  console.log(`✅ Restaurant 3 created: ${restaurant3.name}`);

  const burgerCategories = await Promise.all([
    prisma.menuCategory.create({
      data: { name: 'Gourmet Burgers', restaurantId: restaurant3.id, sortOrder: 1 },
    }),
    prisma.menuCategory.create({
      data: { name: 'Sides & Fries', restaurantId: restaurant3.id, sortOrder: 2 },
    }),
    prisma.menuCategory.create({
      data: { name: 'Shakes', restaurantId: restaurant3.id, sortOrder: 3 },
    }),
  ]);

  const [burgersCat, burgerSidesCat, shakesCat] = burgerCategories;
  console.log(`✅ Burger Bistro categories created`);

  await Promise.all([
    prisma.menuItem.create({
      data: {
        name: 'The Big Cheese Burger',
        description: 'Juicy prime beef patty, cheddar, lettuce, tomato, and secret bistro sauce.',
        price: 240,
        categoryId: burgersCat.id,
        restaurantId: restaurant3.id,
        isVeg: false,
        isAvailable: true,
        badges: [ItemBadge.BEST_SELLER, ItemBadge.POPULAR],
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Spicy Veggie Delight Burger',
        description: 'Crispy vegetable patty, jalapenos, cheese slice, and spicy chipotle mayo.',
        price: 190,
        categoryId: burgersCat.id,
        restaurantId: restaurant3.id,
        isVeg: true,
        isAvailable: true,
        badges: [ItemBadge.TRENDING],
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Loaded Cheesy Fries',
        description: 'Crispy golden fries smothered in warm cheese sauce and spring onions.',
        price: 140,
        categoryId: burgerSidesCat.id,
        restaurantId: restaurant3.id,
        isVeg: true,
        isAvailable: true,
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Double Chocolate Shake',
        description: 'Rich chocolate milkshake topped with whipped cream and chocolate fudge.',
        price: 160,
        categoryId: shakesCat.id,
        restaurantId: restaurant3.id,
        isVeg: true,
        isAvailable: true,
      },
    }),
  ]);
  console.log(`✅ Burger Bistro menu items created`);

  // ── 6. Menu Categories ──────────────────────────────────────
  const categories = await Promise.all([
    prisma.menuCategory.create({
      data: { name: 'Starters', restaurantId: restaurant.id, sortOrder: 1 },
    }),
    prisma.menuCategory.create({
      data: { name: 'Main Course', restaurantId: restaurant.id, sortOrder: 2 },
    }),
    prisma.menuCategory.create({
      data: { name: 'Breads', restaurantId: restaurant.id, sortOrder: 3 },
    }),
    prisma.menuCategory.create({
      data: { name: 'Desserts', restaurantId: restaurant.id, sortOrder: 4 },
    }),
    prisma.menuCategory.create({
      data: { name: 'Beverages', restaurantId: restaurant.id, sortOrder: 5 },
    }),
  ]);

  const [starters, mainCourse, breads, desserts, beverages] = categories;
  console.log(`✅ Created ${categories.length} menu categories`);

  // ── 7. Menu Items ─────────────────────────────────────────────
  const menuItems = await Promise.all([
    // Starters
    prisma.menuItem.create({
      data: {
        name: 'Paneer Tikka',
        description:
          'Marinated cottage cheese cubes grilled to perfection with bell peppers and onions, served with mint chutney.',
        price: 320,
        categoryId: starters.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.BEST_SELLER, ItemBadge.POPULAR],
        addOns: {
          create: [
            { name: 'Extra Mint Chutney', price: 20 },
            { name: 'Extra Cheese', price: 50 },
          ],
        },
        variants: {
          create: [
            { name: 'Half Plate (4 pieces)', price: 180 },
            { name: 'Full Plate (8 pieces)', price: 320 },
          ],
        },
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Chicken Seekh Kebab',
        description:
          'Minced chicken with aromatic spices, skewered and char-grilled. Served with onion rings and green chutney.',
        price: 380,
        categoryId: starters.id,
        restaurantId: restaurant.id,
        isVeg: false,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.TRENDING, ItemBadge.POPULAR],
        addOns: {
          create: [
            { name: 'Extra Chutney', price: 20 },
            { name: 'Extra Onion Rings', price: 30 },
          ],
        },
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Aloo Tikki Chaat',
        description:
          'Crispy potato patties topped with yogurt, tamarind chutney, and sev. A beloved street food classic.',
        price: 180,
        categoryId: starters.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.NEW],
      },
    }),

    // Main Course
    prisma.menuItem.create({
      data: {
        name: 'Butter Chicken',
        description:
          'Succulent chicken pieces simmered in a rich, creamy tomato-based sauce with aromatic spices. India\'s most loved dish.',
        price: 420,
        categoryId: mainCourse.id,
        restaurantId: restaurant.id,
        isVeg: false,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.BEST_SELLER, ItemBadge.POPULAR],
        variants: {
          create: [
            { name: 'Half (250g)', price: 240 },
            { name: 'Full (500g)', price: 420 },
          ],
        },
        addOns: {
          create: [
            { name: 'Extra Gravy', price: 60 },
            { name: 'Extra Butter', price: 30 },
          ],
        },
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Dal Makhani',
        description:
          'Slow-cooked black lentils and kidney beans in a rich buttery tomato gravy. A quintessential Punjabi classic.',
        price: 280,
        categoryId: mainCourse.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.BEST_SELLER],
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Palak Paneer',
        description:
          'Fresh cottage cheese cubes in a velvety spinach sauce, lightly spiced with ginger and garlic.',
        price: 320,
        categoryId: mainCourse.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.POPULAR],
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Veg Biryani',
        description:
          'Fragrant basmati rice layered with seasonal vegetables and whole spices. Served with raita.',
        price: 299,
        categoryId: mainCourse.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: true,
        isAvailable: true,
        badges: [ItemBadge.POPULAR],
        variants: {
          create: [
            { name: 'Single (400g)', price: 299 },
            { name: 'Double (800g)', price: 550 },
          ],
        },
      },
    }),

    // Breads
    prisma.menuItem.create({
      data: {
        name: 'Butter Naan',
        description: 'Soft leavened bread brushed with butter, baked in a tandoor oven.',
        price: 60,
        categoryId: breads.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.BEST_SELLER],
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Garlic Naan',
        description: 'Tandoor-baked naan infused with garlic and coriander, finished with butter.',
        price: 80,
        categoryId: breads.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.POPULAR],
      },
    }),

    // Desserts
    prisma.menuItem.create({
      data: {
        name: 'Gulab Jamun',
        description: 'Soft milk-solid dumplings soaked in rose-flavored sugar syrup. Served warm.',
        price: 120,
        categoryId: desserts.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.BEST_SELLER],
        variants: {
          create: [
            { name: '2 Pieces', price: 120 },
            { name: '4 Pieces', price: 220 },
          ],
        },
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Kulfi Falooda',
        description:
          'Traditional Indian ice cream on a stick with rose syrup, vermicelli, and basil seeds.',
        price: 180,
        categoryId: desserts.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.NEW, ItemBadge.TRENDING],
      },
    }),

    // Beverages
    prisma.menuItem.create({
      data: {
        name: 'Mango Lassi',
        description: 'Thick, creamy yogurt-based drink blended with Alphonso mangoes.',
        price: 120,
        categoryId: beverages.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [ItemBadge.POPULAR],
        variants: {
          create: [
            { name: 'Small (250ml)', price: 120 },
            { name: 'Large (500ml)', price: 200 },
          ],
        },
      },
    }),
    prisma.menuItem.create({
      data: {
        name: 'Masala Chai',
        description: 'Traditional Indian spiced tea with ginger, cardamom, and fresh milk.',
        price: 60,
        categoryId: beverages.id,
        restaurantId: restaurant.id,
        isVeg: true,
        isVegan: false,
        isAvailable: true,
        badges: [],
      },
    }),
  ]);
  console.log(`✅ Created ${menuItems.length} menu items`);

  // ── 8. Coupons ──────────────────────────────────────────────
  await Promise.all([
    prisma.coupon.create({
      data: {
        restaurantId: restaurant.id,
        code: 'WELCOME50',
        type: 'FLAT',
        value: 50,
        minOrderAmount: 200,
        maxUses: 1000,
        perUserLimit: 1,
        isActive: true,
        expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days
      },
    }),
    prisma.coupon.create({
      data: {
        restaurantId: restaurant.id,
        code: 'FEAST20',
        type: 'PERCENT',
        value: 20,
        minOrderAmount: 500,
        maxDiscount: 100,
        maxUses: 500,
        perUserLimit: 2,
        isActive: true,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
    }),
    prisma.coupon.create({
      data: {
        code: 'PLATFORM10',
        type: 'PERCENT',
        value: 10,
        minOrderAmount: 300,
        maxDiscount: 80,
        maxUses: 10000,
        isActive: true,
        expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // 60 days
      },
    }),
  ]);
  console.log('✅ Coupons created');

  // ── 9. Subscription Plans ────────────────────────────────────
  await Promise.all([
    prisma.subscriptionPlan.upsert({
      where: { name: 'Basic' },
      update: {},
      create: {
        name: 'Basic',
        price: 999,
        features: {
          maxMenuItems: 50,
          maxOrders: 500,
          aiEnabled: false,
          analyticsEnabled: false,
          qrCodes: 5,
        },
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: 'Pro' },
      update: {},
      create: {
        name: 'Pro',
        price: 2999,
        features: {
          maxMenuItems: 200,
          maxOrders: 2000,
          aiEnabled: true,
          analyticsEnabled: true,
          qrCodes: 20,
        },
      },
    }),
    prisma.subscriptionPlan.upsert({
      where: { name: 'Enterprise' },
      update: {},
      create: {
        name: 'Enterprise',
        price: 7999,
        features: {
          maxMenuItems: -1, // unlimited
          maxOrders: -1, // unlimited
          aiEnabled: true,
          analyticsEnabled: true,
          qrCodes: 100,
          prioritySupport: true,
          customDomain: true,
        },
      },
    }),
  ]);
  console.log('✅ Subscription plans created');

  // ── 10. Customer Address ──────────────────────────────────────
  await prisma.address.create({
    data: {
      userId: customer.id,
      label: 'Home',
      flat: 'A-204',
      street: 'Park Street',
      area: 'Connaught Place',
      city: 'New Delhi',
      pincode: '110001',
      isDefault: true,
    },
  });
  console.log('✅ Customer address created');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📋 Login Credentials:');
  console.log('─────────────────────────────────────');
  console.log(`Super Admin:     ${process.env.SUPER_ADMIN_EMAIL ?? 'admin@qrrestaurant.com'} / Admin@123456`);
  console.log('Restaurant Owner: owner@upstates.com / Owner@123456');
  console.log('Customer:        customer@example.com / Customer@123');
  console.log('─────────────────────────────────────');
  console.log(`\n🍽️  Demo Restaurant: /r/upstates`);
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
