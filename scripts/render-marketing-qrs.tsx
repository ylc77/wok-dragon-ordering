import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';

const root = resolve(import.meta.dirname, '..');
const outputDir = resolve(root, 'marketing', 'assets');

const qrs = [
  {
    filename: 'qr-clothing-demo.svg',
    value: 'https://greek-clothing-store.vercel.app/',
  },
  {
    filename: 'qr-restaurant-demo.svg',
    value: 'https://wok-dragon-ordering.vercel.app/',
  },
] as const;

await mkdir(outputDir, { recursive: true });

for (const qr of qrs) {
  const svg = renderToStaticMarkup(
    <QRCodeSVG
      value={qr.value}
      size={420}
      level="M"
      marginSize={3}
      fgColor="#111111"
      bgColor="#ffffff"
    />,
  ).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
  await writeFile(resolve(outputDir, qr.filename), `<?xml version="1.0" encoding="UTF-8"?>\n${svg}\n`, 'utf8');
  console.log(`QR exported: ${qr.filename}`);
}
