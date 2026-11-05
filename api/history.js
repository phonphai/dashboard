// GET /api/history?dataset=<d>          -> { items: [{ id, publishedAt, files: [names] | null }] } ใหม่ไปเก่า สูงสุด 30 รายการ
// GET /api/history?dataset=<d>&id=<id>  -> { id, publishedAt, files: [{ name, text }] } ข้อมูลของชุดนั้น ไว้ดูตัวอย่างแล้วกดแชร์ซ้ำ
// dataset ไม่ใส่ = report; id คือชื่อโฟลเดอร์ใน published/ (เวลาที่แชร์ UTC เช่น 2026-11-05T14-30-00-000Z)
import { get, list } from '@vercel/blob';
import { blobPrefix, datasetFrom } from './_datasets.js';

const MAX_ITEMS = 30;
const MAX_LEGACY_FILES = 20; // same cap as api/publish.js
const ID = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;
const idToIso = id => id.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, 'T$1:$2:$3.$4Z');

const readText = async pathname => {
  const blob = await get(pathname, { access: 'private' }); // share folders never change, the CDN copy is fine
  return blob?.stream ? new Response(blob.stream).text() : null;
};
// manifest.json is written by api/publish.js; shares made before it existed have none (names unknown)
const readManifest = async (prefix, id) => {
  const text = await readText(`${prefix}published/${id}/manifest.json`);
  return text ? JSON.parse(text) : null;
};

async function listIds(prefix) {
  // ponytail: walks every page of published/ on each call (1 Blob list operation per 1000 shares);
  // prune old share folders if history grows into the thousands.
  const ids = [];
  let cursor;
  do {
    const page = await list({ prefix: `${prefix}published/`, mode: 'folded', cursor });
    for (const folder of page.folders) {
      const id = folder.slice(`${prefix}published/`.length).replace(/\/$/, '');
      if (ID.test(id)) ids.push(id);
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return ids.sort().reverse(); // ISO-like names sort by time
}

async function readShare(prefix, id) {
  const manifest = await readManifest(prefix, id);
  if (manifest) {
    const texts = await Promise.all(manifest.files.map(f => readText(f.pathname)));
    if (texts.some(t => t == null)) return null;
    return { id, publishedAt: manifest.publishedAt, files: manifest.files.map((f, i) => ({ name: f.name, text: texts[i] })) };
  }
  const files = []; // legacy share: files are 1.csv, 2.csv, ... with no recorded names
  for (let i = 1; i <= MAX_LEGACY_FILES; i++) {
    const text = await readText(`${prefix}published/${id}/${i}.csv`);
    if (text == null) break;
    files.push({ name: `ไฟล์ที่ ${i}.csv`, text });
  }
  return files.length ? { id, publishedAt: idToIso(id), files } : null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'ใช้ได้เฉพาะ GET' });
  const dataset = datasetFrom(req);
  if (!dataset) return res.status(400).json({ error: 'ไม่รู้จักชุดข้อมูลนี้' });
  const prefix = blobPrefix(dataset);
  try {
    const id = req.query?.id ?? new URL(req.url, 'http://x').searchParams.get('id');
    if (id) {
      if (!ID.test(id)) return res.status(400).json({ error: 'รหัสชุดข้อมูลไม่ถูกต้อง' });
      const share = await readShare(prefix, id);
      if (!share) return res.status(404).json({ error: 'ไม่พบชุดข้อมูลนี้' });
      res.setHeader('Cache-Control', 'public, s-maxage=86400'); // a past share never changes
      return res.status(200).json(share);
    }
    res.setHeader('Cache-Control', 'no-store'); // a share made a moment ago must show up
    const ids = (await listIds(prefix)).slice(0, MAX_ITEMS);
    const manifests = await Promise.all(ids.map(id => readManifest(prefix, id)));
    return res.status(200).json({
      items: ids.map((id, i) => ({ id, publishedAt: manifests[i]?.publishedAt ?? idToIso(id), files: manifests[i]?.files.map(f => f.name) ?? null })),
    });
  } catch (err) {
    console.error(err);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'อ่านประวัติการแชร์ไม่ได้ (ตรวจการเชื่อม Blob store)', detail: err.message });
  }
}
