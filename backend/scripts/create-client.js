const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function createClient() {
  const name = "Cosmin Client";
  const email = "cosmin.client@voob.io";
  const password = "[REMOVED_SECRET]"; // Parolă simplă pentru testare
  const phone = null; // Opțional

  try {
    // Verifică dacă utilizatorul există deja
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      console.log(`❌ Utilizatorul cu email-ul ${email} există deja!`);
      console.log(`   ID: ${existingUser.id}`);
      console.log(`   Nume: ${existingUser.name}`);
      console.log(`   Rol: ${existingUser.role}`);
      return;
    }

    // Hash-uiește parola
    const hashedPassword = await bcrypt.hash(password, 10);

    // Creează utilizatorul
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        phone: phone || null,
        role: "CLIENT",
      },
    });

    console.log("✅ Utilizator creat cu succes!");
    console.log(`   ID: ${user.id}`);
    console.log(`   Nume: ${user.name}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Rol: ${user.role}`);
    console.log(`   Parolă: ${password}`);
    console.log("\n📝 Detalii de autentificare:");
    console.log(`   Email: ${email}`);
    console.log(`   Parolă: ${password}`);
  } catch (error) {
    console.error("❌ Eroare la crearea utilizatorului:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createClient();

