const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function createClient() {
  // Obține argumente din command line sau variabile de mediu
  const name = process.argv[2] || process.env.CLIENT_NAME || "Test Client";
  const email = process.argv[3] || process.env.CLIENT_EMAIL;
  const password = process.argv[4] || process.env.CLIENT_PASSWORD;
  const phone = process.argv[5] || process.env.CLIENT_PHONE || null;

  // Validare
  if (!email) {
    console.error("❌ Email-ul este obligatoriu!");
    console.error("   Folosire: node create-client.js [name] [email] [password] [phone]");
    console.error("   Sau setăm variabilele de mediu: CLIENT_NAME, CLIENT_EMAIL, CLIENT_PASSWORD, CLIENT_PHONE");
    process.exit(1);
  }

  if (!password) {
    console.error("❌ Parola este obligatorie!");
    console.error("   Folosire: node create-client.js [name] [email] [password] [phone]");
    console.error("   Sau setăm variabilele de mediu: CLIENT_NAME, CLIENT_EMAIL, CLIENT_PASSWORD, CLIENT_PHONE");
    process.exit(1);
  }

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
    console.log("\n📝 Detalii de autentificare:");
    console.log(`   Email: ${email}`);
    console.log(`   Parolă: [ascunsă din motive de securitate]`);
  } catch (error) {
    console.error("❌ Eroare la crearea utilizatorului:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createClient();

