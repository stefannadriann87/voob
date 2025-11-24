/**
 * Script de test direct pentru trimiterea unui SMS
 */

const dotenv = require("dotenv");
dotenv.config();

const { sendBookingConfirmationSms } = require("../src/services/smsService");

async function testDirectSms() {
  console.log("🧪 Testare trimitere SMS direct...\n");

  const testDate = new Date();
  testDate.setDate(testDate.getDate() + 1); // Mâine

  console.log("📱 Trimite SMS de confirmare...");
  console.log("   Client: Mihai Client");
  console.log("   Telefon: +40748293830");
  console.log("   Business: Test Business");
  console.log("   Data: " + testDate.toLocaleString("ro-RO"));
  console.log("");

  const result = await sendBookingConfirmationSms(
    "Mihai Client",
    "0748293830",
    "Test Business",
    testDate,
    "Test Service"
  );

  if (result.success) {
    console.log("✅ SMS trimis cu succes!");
    console.log("   Message ID:", result.messageId);
  } else {
    console.error("❌ Eroare la trimiterea SMS:");
    console.error("   ", result.error);
  }

  process.exit(result.success ? 0 : 1);
}

testDirectSms().catch((error) => {
  console.error("❌ Eroare fatală:", error);
  process.exit(1);
});

