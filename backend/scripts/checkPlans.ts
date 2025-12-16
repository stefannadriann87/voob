/**
 * Script pentru a verifica planurile de subscription
 */

const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function checkPlans() {
  try {
    const plans = await prisma.subscriptionPlan.findMany();
    console.log("\n📋 Planuri disponibile:\n");
    plans.forEach((plan: any) => {
      console.log(`ID: ${plan.id}`);
      console.log(`Name: ${plan.name}`);
      console.log(`Price: ${plan.price} ${plan.currency}`);
      console.log(`Billing Cycle: ${plan.billingCycle}`);
      console.log(`Max Employees: ${plan.maxEmployees}`);
      console.log(`SMS Included: ${plan.smsIncluded}`);
      console.log("---");
    });
  } catch (error) {
    console.error("❌ Eroare:", error);
  } finally {
    await prisma.$disconnect();
  }
}

checkPlans();
