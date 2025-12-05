/**
 * Script de test pentru serviciul SMS
 * Testează formatarea numerelor de telefon și conectivitatea cu API-ul SMSAdvert
 * 
 * Usage: ts-node scripts/testSms.ts
 */

import dotenv = require("dotenv");
dotenv.config();

const { formatPhoneNumber, sendSms } = require("../src/services/smsService");

async function testSmsService() {
  console.log("🧪 Testare serviciu SMS...\n");

  // Test 1: Verifică dacă token-ul este setat
  console.log("1️⃣ Verificare token API...");
  const token = process.env.SMSADVERT_API_TOKEN;
  if (!token) {
    console.error("❌ SMSADVERT_API_TOKEN nu este setat în .env");
    process.exit(1);
  }
  console.log("✅ Token API găsit:", token.substring(0, 20) + "...\n");

  // Test 2: Testează formatarea numerelor de telefon
  console.log("2️⃣ Testare formatare numere telefon...");
  const testNumbers = [
    "0712345678",
    "40712345678",
    "+40712345678",
    "0721 234 567",
    "0721-234-567",
    "(0721) 234 567",
    "invalid",
    null,
    undefined,
  ];

  testNumbers.forEach((num) => {
    const formatted = formatPhoneNumber(num);
    console.log(`   "${num}" → ${formatted || "null (invalid)"}`);
  });
  console.log("");

  // Test 3: Testează trimiterea unui SMS de test (comentat pentru a nu trimite SMS-uri reale)
  console.log("3️⃣ Testare trimitere SMS...");
  console.log("   ⚠️  Pentru a testa trimiterea reală, de-comentează codul de mai jos");
  console.log("   și înlocuiește numărul de telefon cu unul valid.\n");

  /*
  // De-comentează pentru test real:
  const testPhone = "+40712345678"; // Înlocuiește cu un număr valid
  const testMessage = "Test SMS de la VOOB - " + new Date().toLocaleString("ro-RO");
  
  console.log(`   Trimite SMS la ${testPhone}...`);
  const result = await sendSms({
    phone: testPhone,
    message: testMessage,
  });
  
  if (result.success) {
    console.log("   ✅ SMS trimis cu succes!");
    console.log("   Message ID:", result.messageId);
  } else {
    console.error("   ❌ Eroare la trimiterea SMS:", result.error);
  }
  */

  console.log("✅ Teste finalizate!");
  console.log("\n💡 Pentru a testa trimiterea reală de SMS:");
  console.log("   1. De-comentează codul din testSms.ts");
  console.log("   2. Adaugă un număr de telefon valid");
  console.log("   3. Rulează: npm run test:sms");
}

testSmsService()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Eroare:", error);
    process.exit(1);
  });

