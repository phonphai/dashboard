// POST /api/publish — ทีมกรมเผยแพร่ CSV ชุดใหม่ให้ผู้ชมทุกคน
// ต้องตั้งใน Vercel: PUBLISH_PASSWORD (รหัสผ่านสำหรับเผยแพร่) และเชื่อม Blob store (สร้าง BLOB_READ_WRITE_TOKEN ให้เอง)
// body: { files: [{ name, text }] }  header: x-publish-password
import { put } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';

const MAX_FILES = 20;
const MAX_TOTAL_CHARS = 4_000_000; // Vercel rejects request bodies over 4.5 MB

function passwordOk(given) {
  const expected = process.env.PUBLISH_PASSWORD;
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST' });
  if (!process.env.PUBLISH_PASSWORD) return res.status(500).json({ error: 'ยังไม่ได้ตั้ง PUBLISH_PASSWORD ใน Vercel' });
  if (!passwordOk(req.headers['x-publish-password'])) return res.status(401).json({ error: 'รหัสผ่านไม่ถูกต้อง' });

  const files = req.body?.files;
  if (!Array.isArray(files) || !files.length || files.length > MAX_FILES)
    return res.status(400).json({ error: `ต้องมีไฟล์ 1–${MAX_FILES} ไฟล์` });
  let total = 0;
  for (const f of files) {
    if (typeof f?.name !== 'string' || typeof f?.text !== 'string' || !/\.csv$/i.test(f.name) || !f.text.trim())
      return res.status(400).json({ error: 'ทุกไฟล์ต้องเป็น .csv และมีข้อมูล' });
    total += f.text.length;
  }
  if (total > MAX_TOTAL_CHARS) return res.status(413).json({ error: 'ไฟล์รวมกันใหญ่เกินไป (สูงสุดประมาณ 4 MB)' });

  // Each publish gets its own folder (kept as history); latest.json points at the newest one.
  // Files are written first and the pointer last, so viewers never see a half-written publish.
  const publishedAt = new Date().toISOString();
  const folder = `published/${publishedAt.replace(/[:.]/g, '-')}`;
  const saved = [];
  for (const [i, f] of files.entries()) {
    const pathname = `${folder}/${i + 1}.csv`; // original names (often Thai) live in the pointer, not the path
    await put(pathname, f.text, { access: 'private', contentType: 'text/csv; charset=utf-8' });
    saved.push({ name: f.name.slice(0, 200), pathname });
  }
  await put('latest.json', JSON.stringify({ publishedAt, files: saved }), {
    access: 'private', contentType: 'application/json', allowOverwrite: true, cacheControlMaxAge: 60,
  });
  return res.status(200).json({ publishedAt, files: saved.map(f => f.name) });
}
