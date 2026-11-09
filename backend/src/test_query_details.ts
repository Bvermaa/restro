import { prisma } from './lib/prisma';

async function main() {
  try {
    console.log("Checking User details...");
    const user = await prisma.user.findFirst({
      where: { email: "owner@upstates.com" }
    });
    console.log("User owner@upstates.com:", user);

    if (!user) {
      console.log("User not found!");
      return;
    }

    console.log("Checking Restaurant owned by user...");
    const restaurants = await prisma.restaurant.findMany({
      where: { ownerId: user.id }
    });
    console.log("Owned restaurants:", restaurants);

    for (const r of restaurants) {
      const orderCount = await prisma.order.count({
        where: { restaurantId: r.id }
      });
      console.log(`Restaurant ${r.name} has ${orderCount} orders in total.`);

      const sampleOrders = await prisma.order.findMany({
        where: { restaurantId: r.id },
        take: 5
      });
      console.log("Sample orders:", sampleOrders);
    }

    const totalOrders = await prisma.order.count();
    console.log("Total orders in database:", totalOrders);
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
