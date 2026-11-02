// src/routes/api/thumbnails/+server.ts
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

// 1. GET: Lấy danh sách thumbnail từ thư mục thumbnails/ trên MinIO
export const GET: RequestHandler = async () => {
  try {
    const thumbnails: any[] = [];
    const stream = minioClient.listObjectsV2(BUCKET_NAME, 'thumbnails/', true);

    const objects: any[] = [];
    await new Promise((resolve, reject) => {
      stream.on('data', (obj) => objects.push(obj));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(objects));
    });

    for (const obj of objects) {
      if (obj.name && obj.name.startsWith('thumbnails/') && obj.name.endsWith('.jpg')) {
        const filename = obj.name.replace('thumbnails/', '');
        if (!filename) continue;

        const url = `/api/thumbnails/${filename}`;
        const match = /^(.*)-(\d+)\.jpg$/i.exec(filename);

        thumbnails.push({
          filename,
          name: match?.[1] || filename,
          timestamp: match
            ? new Date(Number(match[2])).toISOString()
            : (obj.lastModified || new Date()).toISOString(),
          url
        });
      }
    }

    thumbnails.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return json(
      { success: true, thumbnails, storageDriver: 'minio' },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Lỗi lấy danh sách thumbnail từ MinIO:', error);
    return json(
      {
        success: false,
        thumbnails: [],
        error: `Không thể tải danh sách thumbnail: ${String(error)}`
      },
      { status: 500, headers: corsHeaders }
    );
  }
};

// 2. POST: Upload thumbnail mới lên MinIO
export const POST: RequestHandler = async ({ request }) => {
  try {
    const { name, image } = await request.json();
    if (typeof name !== 'string' || typeof image !== 'string' || !name.trim() || !image) {
      return json(
        { success: false, error: 'Thiếu tên hoặc dữ liệu ảnh' },
        { status: 400, headers: corsHeaders }
      );
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

    if (!sanitizedName) {
      return json(
        { success: false, error: 'Tên thumbnail phải có ít nhất một chữ cái hoặc chữ số.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const imageMatch = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(image);
    if (!imageMatch) {
      return json(
        { success: false, error: 'Ảnh phải là dữ liệu JPEG hợp lệ.' },
        { status: 400, headers: corsHeaders }
      );
    }

    const base64Data = imageMatch[1];
    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length === 0 || buffer.length > 4 * 1024 * 1024) {
      return json(
        { success: false, error: 'Ảnh rỗng hoặc vượt quá giới hạn 4 MB.' },
        { status: 413, headers: corsHeaders }
      );
    }

    const timestamp = Date.now();
    const fileName = `${sanitizedName}-${timestamp}.jpg`;
    const objectName = `thumbnails/${fileName}`;

    await minioClient.putObject(BUCKET_NAME, objectName, buffer, buffer.length, {
      'Content-Type': 'image/jpeg'
    });

    const url = `/api/thumbnails/${fileName}`;

    return json(
      {
        success: true,
        message: 'Upload thumbnail thành công!',
        url,
        filename: fileName
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Lỗi upload thumbnail lên MinIO:', error);
    return json(
      {
        success: false,
        error: `Không thể tải thumbnail lên bộ lưu trữ: ${String(error)}`
      },
      { status: 500, headers: corsHeaders }
    );
  }
};