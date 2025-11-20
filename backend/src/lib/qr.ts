import QRCode = require("qrcode");

const FRONTEND_BASE =
  (process.env.FRONTEND_URL || "http://localhost:3001").replace(/\/$/, "");
const QR_JOIN_PATH = process.env.QR_JOIN_PATH || "/qr/join";

const buildBusinessQrPayload = (businessId: string) => {
  return `${FRONTEND_BASE}${QR_JOIN_PATH}?businessId=${businessId}`;
};

const generateBusinessQrDataUrl = async (businessId: string) => {
  const payload = buildBusinessQrPayload(businessId);
  const dataUrl = await QRCode.toDataURL(payload, {
    margin: 1,
    scale: 8,
  });
  return { dataUrl, payload };
};

const generateBusinessQrBuffer = async (businessId: string) => {
  const payload = buildBusinessQrPayload(businessId);
  const buffer = await QRCode.toBuffer(payload, {
    margin: 1,
    scale: 8,
    type: "png",
  });
  return { buffer, payload };
};

const generateBusinessQrSvg = async (businessId: string) => {
  const payload = buildBusinessQrPayload(businessId);
  const svg = await QRCode.toString(payload, {
    type: "svg",
    margin: 1,
  });
  return { svg, payload };
};

module.exports = {
  buildBusinessQrPayload,
  generateBusinessQrDataUrl,
  generateBusinessQrBuffer,
  generateBusinessQrSvg,
};


