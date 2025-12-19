/**
 * Script pentru a obține JWT token-ul pentru un client
 * Utilitar pentru debugging
 */

import { PrismaClient, Role } from "@prisma/client";
import * as jwt from "jsonwebtoken";
import * as dotenv from "dotenv";

dotenv.config();

const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error("❌ JWT_SECRET nu este setat în .env");
  process.exit(1);
}
// After the check above, JWT_SECRET is guaranteed to be a string
// Use non-null assertion to satisfy TypeScript
const JWT_SECRET_SAFE = JWT_SECRET as string;

async function getClientJWT() {
  try {
    const clientEmail = "client1@voob.io";
    
    const client = await prisma.user.findUnique({
      where: { email: clientEmail },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });

    if (!client) {
      console.error(`❌ Client ${clientEmail} nu există`);
      process.exit(1);
    }

    // Generează JWT token
    const token = jwt.sign(
      {
        userId: client.id,
        role: client.role,
      },
      JWT_SECRET_SAFE,
      {
        expiresIn: "7d", // 7 zile
      }
    );

    console.log("\n✅ JWT Token generat pentru client1@voob.io:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(token);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    
    console.log("\n📋 Informații client:");
    console.log("  ID:", client.id);
    console.log("  Email:", client.email);
    console.log("  Name:", client.name);
    console.log("  Role:", client.role);

    console.log("\n🧪 Test cu curl:");
    console.log(`curl 'http://localhost:4000/business/cmj2td8ih000wcbkx5wki4lw7/courts' \\`);
    console.log(`  -H 'Cookie: voob_auth=${token}' \\`);
    console.log(`  -H 'Accept: application/json'`);

    console.log("\n✅ Token generat cu succes!");
    console.log("⚠️  ATENȚIE: Acest token este pentru debugging. Nu îl partaja public!");

  } catch (error) {
    console.error("❌ Eroare:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

getClientJWT()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Eroare:", error);
    process.exit(1);
  });
