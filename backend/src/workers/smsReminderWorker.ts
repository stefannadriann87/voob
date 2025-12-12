/**
 * SMS Reminder Worker
 * Procesează job-uri pentru SMS reminders în background
 */

const { createWorker, QUEUE_NAMES } = require("../services/queueService");
const { sendBookingReminderSmsDirect } = require("../services/smsService");
const { logger } = require("../lib/logger");

/**
 * Worker pentru procesarea SMS reminders
 */
function startSmsReminderWorker() {
  return createWorker(QUEUE_NAMES.SMS_REMINDER, async (job: {
    data: {
      clientName: string;
      clientPhone: string;
      businessName: string;
      bookingDate: string;
      serviceName?: string | null;
      businessId?: string | null;
      reminderHours: number;
    };
  }) => {
    const { clientName, clientPhone, businessName, bookingDate, serviceName, businessId, reminderHours } = job.data;

    logger.info(`Sending SMS reminder for ${clientName} (booking: ${bookingDate})`);

    try {
      await sendBookingReminderSmsDirect(
        clientName,
        clientPhone,
        businessName,
        new Date(bookingDate),
        serviceName,
        businessId,
        reminderHours
      );

      return { success: true, clientName, bookingDate };
    } catch (error: any) {
      logger.error(`Failed to send SMS reminder for ${clientName}:`, error);
      throw error; // Re-throw pentru retry
    }
  });
}

module.exports = {
  startSmsReminderWorker,
};
