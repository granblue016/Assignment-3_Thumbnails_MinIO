import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as Minio from 'minio';

const minioClient = new Minio.Client({
  endPoint: 'play.min.io',
  port: 443,
  useSSL: true,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});

const BUCKET_NAME = 'granblue-map-configs';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, { headers: corsHeaders });
};

// 1. GET: Lấy danh sách icon từ thư mục icons/ trên MinIO
export const GET: RequestHandler = async () => {
  try {
    const icons: any[] = [];
    const stream = minioClient.listObjectsV2(BUCKET_NAME, 'icons/', true);

    const objects: any[] = [];
    await new Promise((resolve, reject) => {
      stream.on('data', (obj) => objects.push(obj));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(objects));
    });

    for (const obj of objects) {
      if (obj.name && obj.name.startsWith('icons/') && /\.(png|jpg|jpeg)$/i.test(obj.name)) {
        const filename = obj.name.replace('icons/', '');
        if (!filename) continue;

        const url = `/api/icons/${filename}`;
        const match = /^(.*)-(\d+)\.(png|jpg|jpeg)$/i.exec(filename);

        icons.push({
          filename,
          name: match?.[1] || filename,
          timestamp: match
            ? new Date(Number(match[2])).toISOString()
            : (obj.lastModified || new Date()).toISOString(),
          url
        });
      }
    }

    icons.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return json({ success: true, icons, storageDriver: 'minio' }, { headers: corsHeaders });
  } catch (error) {
    console.error('Lỗi lấy danh sách icon từ MinIO:', error);
    return json({ success: false, icons: [], error: String(error) }, { status: 500, headers: corsHeaders });
  }
};

// 2. POST: Upload icon mới lên MinIO (thư mục icons/)
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { name, image } = await request.json();
    if (!name || !image) {
      return json({ success: false, error: 'Thiếu tên hoặc dữ liệu ảnh' }, { status: 400, headers: corsHeaders });
    }

    const sanitizedName = name
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);

    // Bắt chuỗi base64 cho cả png và jpeg
    const imageMatch = /^data:image\/(png|jpeg|jpg);base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!imageMatch) {
      return json({ success: false, error: 'Định dạng ảnh không hợp lệ (chỉ chấp nhận PNG/JPEG)' }, { status: 400, headers: corsHeaders });
    }

    const ext = imageMatch[1] === 'png' ? 'png' : 'jpg';
    const base64Data = imageMatch[2];
    const buffer = Buffer.from(base64Data, 'base64');

    const timestamp = Date.now();
    const fileName = `${sanitizedName}-${timestamp}.${ext}`;
    const objectName = `icons/${fileName}`;

    await minioClient.putObject(BUCKET_NAME, objectName, buffer, buffer.length, {
      'Content-Type': `image/${ext === 'png' ? 'png' : 'jpeg'}`
    });

    return json({
      success: true,
      message: 'Upload icon thành công!',
      url: `/api/icons/${fileName}`,
      filename: fileName
    }, { headers: corsHeaders });
  } catch (error) {
    console.error('Lỗi upload icon lên MinIO:', error);
    return json({ success: false, error: String(error) }, { status: 500, headers: corsHeaders });
  }
};