// POST /api/publish — ทีมกรมแชร์ CSV ชุดใหม่ให้ผู้ชมทุกคน
// ต้องเชื่อม Blob store ใน Vercel: Vercel ตั้ง BLOB_STORE_ID ให้ และ @vercel/blob ขอ OIDC token จาก Vercel เองตอนรัน
// (โปรเจกต์ที่เชื่อมแบบเก่าจะได้ BLOB_READ_WRITE_TOKEN แทน ใช้ได้เหมือนกัน)
// รหัสผ่าน (ไม่บังคับ): ถ้าตั้ง PUBLISH_PASSWORD ไว้ ต้องส่ง header x-publish-password ให้ตรง ถ้าไม่ตั้ง ใครเปิดเว็บก็แชร์ได้
// body: { files: [{ name, text }] }
import { put } from '@vercel/blob';
import { timingSafeEqual } from 'node:crypto';

const MAX_FILES = 20;
const MAX_TOTAL_CHARS = 4_000_000; // Vercel rejects request bodies over 4.5 MB

function passwordOk(given, expected) {
  if (typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'ใช้ได้เฉพาะ POST' });
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
    // Every tab reads the same report format; reject anything without its header row so a stray file cannot blank the dashboards
    if (!/^\s*"?province"?\s*,/m.test(f.text))
      return res.status(400).json({ error: `${f.name}: ไม่ใช่ไฟล์รายงานจำนวนคำร้องและความเสียหาย (ไม่พบแถวหัวคอลัมน์ province)` });
    total += f.text.length;
  }
  if (total > MAX_TOTAL_CHARS) return res.status(413).json({ error: 'ไฟล์รวมกันใหญ่เกินไป (สูงสุดประมาณ 4 MB)' });

  // Each publish gets its own folder (kept as history); latest.json points at the newest one.
  // Files are written first and the pointer last, so viewers never see a half-written publish.
  const publishedAt = new Date().toISOString();
  const folder = `published/${publishedAt.replace(/[:.]/g, '-')}`;
  const saved = [];
  try {
    for (const [i, f] of files.entries()) {
      const pathname = `${folder}/${i + 1}.csv`; // original names (often Thai) live in the pointer, not the path
      await put(pathname, f.text, { access: 'private', contentType: 'text/csv; charset=utf-8' });
      saved.push({ name: f.name.slice(0, 200), pathname });
    }
    await put('latest.json', JSON.stringify({ publishedAt, files: saved }), {
      access: 'private', contentType: 'application/json', allowOverwrite: true, cacheControlMaxAge: 60,
    });
  } catch (err) {
    // Usually setup: no Blob store connected / not redeployed since (no BLOB_STORE_ID or BLOB_READ_WRITE_TOKEN), or a public store.
    // The SDK message names the cause and holds no secret, so pass it on for the person sharing to report.
    console.error(err);
    const hint = process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN ? '' : ' (ไม่พบ BLOB_STORE_ID: เชื่อม Blob store กับโปรเจกต์ (ติ๊ก Production) แล้ว Redeploy)';
    return res.status(500).json({ error: `บันทึกไฟล์ลง Blob ไม่สำเร็จ${hint}: ${err.message}` });
  }
  return res.status(200).json({ publishedAt, files: saved.map(f => f.name) });
}
