import { PrismaClient } from "@prisma/client";
import * as fs from "fs";

const prisma = new PrismaClient();

async function debugLogin() {
  const email = "sport@voob.io";
  
  const user = await prisma.user.findUnique({
    where: { email },
    include: {
      business: {
        select: {
          id: true,
          name: true,
          domain: true,
          email: true,
          businessType: true,
        },
      },
      ownedBusinesses: {
        select: {
          id: true,
          name: true,
          domain: true,
          email: true,
          businessType: true,
        },
        take: 1,
      },
    },
  });
  
  const debug = {
    timestamp: new Date().toISOString(),
    user_role: user?.role,
    user_ownedBusinesses: user?.ownedBusinesses,
    user_ownedBusinesses_0: user?.ownedBusinesses?.[0],
    user_business: user?.business,
    businessData: user?.role === "BUSINESS" && user?.ownedBusinesses?.[0] 
      ? user?.ownedBusinesses[0] 
      : user?.business,
  };
  
  fs.writeFileSync("/tmp/login-debug.json", JSON.stringify(debug, null, 2));
  console.log("Debug written to /tmp/login-debug.json");
  
  await prisma.$disconnect();
}

debugLogin();
