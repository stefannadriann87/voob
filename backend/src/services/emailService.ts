import nodemailer = require("nodemailer");

const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: process.env.SMTP_SECURE === "true",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      })
    : nodemailer.createTransport({
        streamTransport: true,
        newline: "unix",
        buffer: true,
      });

interface EmailOptions extends nodemailer.SendMailOptions {
  icalEvent?: {
    method: string;
    content: string;
  };
}

async function sendEmail(options: EmailOptions) {
  const { icalEvent, attachments: existingAttachments, ...nodemailerOptions } = options;

  // Convert icalEvent to attachment if provided
  const attachments = existingAttachments ? [...existingAttachments] : [];
  if (icalEvent) {
    attachments.push({
      filename: "event.ics",
      content: icalEvent.content,
      contentType: "text/calendar; method=" + icalEvent.method,
      contentDisposition: "attachment",
    });
  }

  const info = await transporter.sendMail({
    from: options.from || process.env.EMAIL_FROM || "no-reply@larstef.app",
    ...nodemailerOptions,
    attachments: attachments.length > 0 ? attachments : undefined,
  });

  if (!process.env.SMTP_HOST) {
    console.info("=".repeat(80));
    console.info("📧 EMAIL PREVIEW (SMTP nu este configurat - emailul NU a fost trimis!)");
    console.info("=".repeat(80));
    console.info("To:", options.to);
    console.info("From:", options.from || process.env.EMAIL_FROM || "no-reply@larstef.app");
    console.info("Subject:", options.subject);
    console.info("Text:", options.text);
    if (options.html) {
      console.info("HTML:", options.html);
    }
    if (icalEvent) {
      console.info("📅 Calendar attachment: event.ics");
    }
    if (attachments.length > 0) {
      console.info(`📎 Attachments: ${attachments.length} file(s)`);
    }
    console.info("=".repeat(80));
    console.info("⚠️  Pentru a trimite emailuri reale, configurează SMTP_HOST, SMTP_USER, SMTP_PASS în .env");
    console.info("=".repeat(80));
  } else {
    console.info("[Email dispatched]", info.messageId ?? "unknown-id");
    if (icalEvent) {
      console.info("[Calendar attachment]", "ICS file attached");
    }
  }

  return info;
}

module.exports = {
  transporter,
  sendEmail,
};

