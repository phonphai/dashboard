// GET /api/latest?dataset=<id> — ข้อมูลชุดล่าสุดที่ทีมกรมแชร์ ให้แท็บของชุดข้อมูลนั้นโหลดตอนเปิดหน้า (ไม่ใส่ = report)
// -> { publishedAt, files: [{ name, text }] } หรือ 404 ถ้ายังไม่เคยแชร์ (หน้าเว็บจะใช้ไฟล์ใน data/ แทน)
import { get } from '@vercel/blob';
import { blobPrefix, datasetFrom } from './_datasets.js';

const readText = async (pathname, useCache) => {
  const blob = await get(pathname, { access: 'private', useCache });
  return blob?.stream ? new Response(blob.stream).text() : null;
};

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const dataset = datasetFrom(req);
  if (!dataset) return res.status(400).json({ error: 'ไม่รู้จักชุดข้อมูลนี้' });
  try {
    const pointer = await readText(`${blobPrefix(dataset)}latest.json`, false);
    if (!pointer) return res.status(404).json({ error: 'ยังไม่มีข้อมูลที่แชร์' });
    const { publishedAt, files } = JSON.parse(pointer);
    const texts = await Promise.all(files.map(f => readText(f.pathname, true))); // published files never change
    if (texts.some(t => t == null)) return res.status(500).json({ error: 'ไฟล์ที่แชร์ไม่ครบ' });
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=60');
    return res.status(200).json({ publishedAt, files: files.map((f, i) => ({ name: f.name, text: texts[i] })) });
  } catch (err) {
    console.error(err);
    const hint = process.env.BLOB_STORE_ID || process.env.BLOB_READ_WRITE_TOKEN ? '' : ' ไม่พบ BLOB_STORE_ID: เชื่อม Blob store กับโปรเจกต์ (ติ๊ก Production) แล้ว Redeploy';
    return res.status(503).json({ error: `อ่านข้อมูลที่แชร์ไม่ได้ (ตรวจการเชื่อม Blob store)${hint}`, detail: err.message });
  }
}
