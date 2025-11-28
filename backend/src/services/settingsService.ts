const prisma = require("../lib/prisma");

async function getSettingValue(key: string): Promise<string | null> {
  const setting = await prisma.platformSetting.findUnique({ where: { key } });
  return setting?.value ?? null;
}

async function getNumericSetting(key: string, fallback: number): Promise<number> {
  const raw = await getSettingValue(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function upsertSettings(
  settings: { key: string; value: string; description?: string }[]
): Promise<void> {
  for (const setting of settings) {
    await prisma.platformSetting.upsert({
      where: { key: setting.key },
      update: {
        value: setting.value,
        description: setting.description,
      },
      create: {
        key: setting.key,
        value: setting.value,
        description: setting.description,
      },
    });
  }
}

module.exports = {
  getSettingValue,
  getNumericSetting,
  upsertSettings,
};

