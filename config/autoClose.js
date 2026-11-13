export const AUTO_CLOSE_CONFIG = {
  AUTO_CLOSE_AFTER_DAYS: Number(process.env.AUTO_CLOSE_AFTER_DAYS) || 7,
  CRON_SCHEDULE: process.env.AUTO_CLOSE_CRON || '0 * * * *', // every hour
};