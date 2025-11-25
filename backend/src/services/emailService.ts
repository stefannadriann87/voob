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

async function sendEmail(options: nodemailer.SendMailOptions) {
  const info = await transporter.sendMail({
    from: options.from || process.env.EMAIL_FROM || "no-reply@larstef.app",
    ...options,
  });

  if (!process.env.SMTP_HOST) {
    console.info("[Email preview]", info.message?.toString() ?? info.envelope);
  } else {
    console.info("[Email dispatched]", info.messageId ?? "unknown-id");
  }

  return info;
}

module.exports = {
  transporter,
  sendEmail,
};

