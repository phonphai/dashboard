// POST /api/publish?dataset=<id> — ทีมกรมแชร์ CSV ชุดใหม่ให้ผู้ชมทุกคน (id ดู api/_datasets.js, ไม่ใส่ = report)
import { put } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';
import { DATASETS, blobPrefix, datasetFrom } from './_datasets.js';

const MAX_FILES = 20;
const MAX_TOTAL_CHARS = 4_000_000; // Vercel rejects request bodies over 4.5 MB

function passwordOk(given, expected) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST' });
  const dataset = datasetFrom(req);
  if (!dataset) return res.status(400).json({ error: 'ไม่รู้จักชุดข้อมูลนี้' });
  const { headerFirstColumn } = DATASETS[dataset];
  const expected = process.env.PUBLISH_PASSWORD;
  if (expected) {
    const given = req.headers['x-publish-password'];
    if (!given) return res.status(401).json({ error: 'ต้องใส่รหัสผ่าน', needPassword: true });
    if (!passwordOk(given, expected)) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง', needPassword: true });
  }

  const files = req.body?.files;
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES)
    return res.status(400).json({ error: `ต้องมีไฟล์ 1–${MAX_FILES} ไฟล์` });
  let total = 0;
  for (const f of files) {
    if (typeof f?.name !== 'string' || typeof f?.text !== 'string' || !/\.csv$/i.test(f.name) || !f.text.trim())
      return res.status(400).json({ error: 'ทุกไฟล์ต้องเป็น .csv และมีข้อมูล' });
    if (!new RegExp(`^\\s*"?${headerFirstColumn}"?\\s*,`, 'm').test(f.text))
      return res.status(400).json({ error: `${f.name}: ไม่ใช่ไฟล์ของชุดข้อมูลนี้ (ไม่พบแถวหัวคอลัมน์ที่ขึ้นต้นด้วย ${headerFirstColumn})` });
    total += f.text.length;
  }
  if (total > MAX_TOTAL_CHARS) return res.status(413).json({ error: 'ไฟล์รวมกันใหญ่เกินไป (สูงสุดประมาณ 4 MB)' });

  const publishedAt = new Date().toISOString();
  const prefix = blobPrefix(dataset);
  const folder = `${prefix}published/${publishedAt.replace(/[:.]/g, '-')}`;
  const saved = [];
  try {
    for (const [i, f] of files.entries()) {
      const pathname = `${folder}/${i + 1}.csv`;
      await put(pathname, f.text, { access: 'private', contentType: 'text/csv; charset=utf-8' });
      saved.push({ name: f.name.slice(0, 200), pathname });
    }
    const manifest = JSON.stringify({ publishedAt, files: saved });
    await put(`${folder}/manifest.json`, manifest, { access: 'private', contentType: 'application/json' });
    await put(`${prefix}latest.json`, manifest, {
      access: 'private', contentType: 'application/json', allowOverwrite: true, cacheControlMaxAge: 60,
    });
  } catch (err) {
    console.error(err);
    const hint = process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN ? '' : ' (ไม่พบ BLOB_STORE_ID: เชื่อม Blob store กับโปรเจกต์ (ติ๊ก Production) แล้ว Redeploy)';
    return res.status(500).json({ error: `บันทึกไฟล์ลง Blob ไม่สำเร็จ${hint}: ${err.message}` });
  }
  return res.status(200).json({ publishedAt, files: saved.map(f => f.name) });
}
