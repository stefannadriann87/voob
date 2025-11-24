/**
 * SMS Service pentru integrarea cu SMSAdvert.ro
 * Trimite SMS-uri automate către clienți pentru rezervări
 */

interface SmsAdvertResponse {
  success: boolean;
  message?: string;
  error?: string;
  messageId?: string;
}

interface SendSmsOptions {
  phone: string;
  message: string;
  startDate?: number; // Unix timestamp pentru programare
  endDate?: number; // Unix timestamp pentru programare
  callback?: string; // URL pentru callback de livrare
}

/**
 * Validează și formatează numărul de telefon în format E.164
 * @param phone - Număr de telefon în orice format
 * @returns Număr formatat în E.164 sau null dacă invalid
 */
function formatPhoneNumber(phone: string | null | undefined): string | null {
  if (!phone) return null;

  // Elimină spații, paranteze, cratime
  let cleaned = phone.replace(/[\s()\-]/g, "");

  // Dacă începe cu 0, înlocuiește cu +40
  if (cleaned.startsWith("0")) {
    cleaned = "+40" + cleaned.substring(1);
  }
  // Dacă începe cu 40, adaugă +
  else if (cleaned.startsWith("40") && !cleaned.startsWith("+40")) {
    cleaned = "+" + cleaned;
  }
  // Dacă nu începe cu +, adaugă +40
  else if (!cleaned.startsWith("+")) {
    cleaned = "+40" + cleaned;
  }

  // Verifică dacă este format valid E.164 pentru România (+40XXXXXXXXX)
  const romaniaPhoneRegex = /^\+40[0-9]{9}$/;
  if (!romaniaPhoneRegex.test(cleaned)) {
    console.warn(`Invalid phone number format: ${phone} -> ${cleaned}`);
    return null;
  }

  return cleaned;
}

/**
 * Trimite SMS prin API-ul SMSAdvert.ro
 * @param options - Opțiuni pentru trimiterea SMS-ului
 * @returns Promise cu răspunsul de la API
 */
async function sendSms(options: SendSmsOptions): Promise<SmsAdvertResponse> {
  const { phone, message, startDate, endDate, callback } = options;

  const apiToken = process.env.SMSADVERT_API_TOKEN;
  if (!apiToken) {
    console.error("SMSADVERT_API_TOKEN nu este setat în .env");
    return {
      success: false,
      error: "SMS service nu este configurat. Token lipsă.",
    };
  }

  // Formatează numărul de telefon
  const formattedPhone = formatPhoneNumber(phone);
  if (!formattedPhone) {
    return {
      success: false,
      error: `Număr de telefon invalid: ${phone}`,
    };
  }

  // Verifică lungimea mesajului conform documentației SMSAdvert (minim 3, maxim 480 caractere)
  if (message.length < 3) {
    return {
      success: false,
      error: "Mesajul trebuie să conțină minim 3 caractere.",
    };
  }
  if (message.length > 480) {
    return {
      success: false,
      error: "Mesajul depășește limita de 480 caractere.",
    };
  }

  try {
    const requestBody: any = {
      phone: formattedPhone,
      shortTextMessage: message,
      sendAsShort: true, // Trimite prin rețeaua smsadvert.ro (conform documentației)
    };

    // Adaugă date de programare dacă sunt specificate
    if (startDate) {
      requestBody.startDate = startDate;
    }
    if (endDate) {
      requestBody.endDate = endDate;
    }
    if (callback) {
      requestBody.callback = callback;
    }

    const response = await fetch("https://www.smsadvert.ro/api/sms/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: apiToken,
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("SMSAdvert API error:", data);
      const errorMessage = data.error || data.errorMessage || data.message || "Eroare la trimiterea SMS-ului";
      console.error("SMS Error details:", {
        status: response.status,
        error: errorMessage,
        fullResponse: data,
      });
      return {
        success: false,
        error: errorMessage,
        messageId: data.messageId,
      };
    }

    return {
      success: true,
      message: "SMS trimis cu succes",
      messageId: data.messageId || data.id,
    };
  } catch (error) {
    console.error("Error sending SMS:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Eroare necunoscută la trimiterea SMS-ului",
    };
  }
}

/**
 * Trimite SMS de confirmare pentru o rezervare nouă
 */
async function sendBookingConfirmationSms(
  clientName: string,
  clientPhone: string | null | undefined,
  businessName: string,
  bookingDate: Date,
  serviceName?: string
): Promise<SmsAdvertResponse> {
  if (!clientPhone) {
    return {
      success: false,
      error: "Clientul nu are număr de telefon",
    };
  }

  const formattedDate = bookingDate.toLocaleDateString("ro-RO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = bookingDate.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const message = `Salut ${clientName}, rezervarea ta la ${businessName} a fost confirmată pentru ${formattedDate} la ${formattedTime}.${serviceName ? ` Serviciu: ${serviceName}.` : ""} Ne vedem acolo!`;

  return sendSms({
    phone: clientPhone,
    message,
  });
}

/**
 * Trimite SMS de reminder pentru o rezervare (ex: 24h înainte)
 */
async function sendBookingReminderSms(
  clientName: string,
  clientPhone: string | null | undefined,
  businessName: string,
  bookingDate: Date,
  serviceName?: string,
  reminderHours: number = 24
): Promise<SmsAdvertResponse> {
  if (!clientPhone) {
    return {
      success: false,
      error: "Clientul nu are număr de telefon",
    };
  }

  const formattedDate = bookingDate.toLocaleDateString("ro-RO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = bookingDate.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const message = `Te reamintim: ai o programare la ${businessName} pe ${formattedDate} la ${formattedTime}.${serviceName ? ` Serviciu: ${serviceName}.` : ""} Ne vedem acolo!`;

  // Calculează când să trimită SMS-ul (reminderHours înainte de booking)
  const reminderTime = new Date(bookingDate);
  reminderTime.setHours(reminderTime.getHours() - reminderHours);
  const now = new Date();

  // Dacă reminder-ul ar trebui trimis în trecut, trimite-l acum
  // Altfel, programează-l
  const smsOptions: SendSmsOptions = {
    phone: clientPhone,
    message,
  };
  
  if (reminderTime > now) {
    smsOptions.startDate = Math.floor(reminderTime.getTime() / 1000);
  }

  return sendSms(smsOptions);
}

/**
 * Trimite SMS de anulare pentru o rezervare
 */
async function sendBookingCancellationSms(
  clientName: string,
  clientPhone: string | null | undefined,
  businessName: string,
  bookingDate: Date
): Promise<SmsAdvertResponse> {
  if (!clientPhone) {
    return {
      success: false,
      error: "Clientul nu are număr de telefon",
    };
  }

  const formattedDate = bookingDate.toLocaleDateString("ro-RO", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const formattedTime = bookingDate.toLocaleTimeString("ro-RO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  const message = `Salut ${clientName}, rezervarea ta la ${businessName} pe ${formattedDate} la ${formattedTime} a fost anulată. Dacă vrei să reprogramezi, intră în aplicație.`;

  return sendSms({
    phone: clientPhone,
    message,
  });
}

// Export pentru CommonJS
module.exports = {
  formatPhoneNumber,
  sendSms,
  sendBookingConfirmationSms,
  sendBookingReminderSms,
  sendBookingCancellationSms,
};

