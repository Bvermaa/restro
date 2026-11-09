import { prisma } from './lib/prisma';

async function testOrder() {
  try {
    console.log("Looking for user...");
    const user = await prisma.user.findFirst({
      where: { role: 'CUSTOMER' }
    });
    console.log("User found:", user?.id, user?.name);

    console.log("Looking for restaurant...");
    const restaurant = await prisma.restaurant.findFirst({
      where: { slug: 'upstates' }
    });
    console.log("Restaurant found:", restaurant?.id, restaurant?.name);

    if (!user || !restaurant) {
      console.log("Missing user or restaurant!");
      return;
    }

    console.log("Looking for menu item...");
    const menuItem = await prisma.menuItem.findFirst({
      where: { restaurantId: restaurant.id }
    });
    console.log("MenuItem found:", menuItem?.id, menuItem?.name);

    if (!menuItem) {
      console.log("No menu item found!");
      return;
    }

    // Try to run the prisma transaction as done in placeOrder
    console.log("Attempting prisma transaction...");
    const order = await prisma.$transaction(async (tx) => {
      const newOrder = await tx.order.create({
        data: {
          restaurantId: restaurant.id,
          userId: user.id,
          status: 'PENDING',
          paymentMethod: 'COD',
          paymentStatus: 'PENDING',
          subtotal: 100,
          gstAmount: 18,
          deliveryFee: 40,
          packagingFee: 15,
          discount: 0,
          total: 173,
          items: {
            create: [
              {
                menuItemId: menuItem.id,
                quantity: 1,
                unitPrice: 100,
                addOns: [],
                subtotal: 100,
              }
            ]
          }
        }
      });
      console.log("Order created:", newOrder.id);

      // Create payment
      console.log("Creating payment record...");
      await tx.payment.create({
        data: {
          orderId: newOrder.id,
          method: 'COD',
          status: 'PENDING',
          amount: 173,
        }
      });

      return newOrder;
    });

    console.log("SUCCESS! Created order:", order.id);
  } catch (error) {
    console.error("TRANSACTION FAILED:", error);
  } finally {
    await prisma.$disconnect();
  }
}

testOrder();
