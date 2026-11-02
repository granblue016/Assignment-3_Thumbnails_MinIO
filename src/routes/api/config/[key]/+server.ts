// src/routes/api/config/[key]/+server.ts
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
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, no-cache, must-revalidate'
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, { headers: corsHeaders });
};

// 1. GET: Lấy nội dung chi tiết của 1 file cấu hình theo key
export const GET: RequestHandler = async ({ params }) => {
  const { key } = params;
  const objectName = `configs/${key}.json`;

  try {
    const stream = await minioClient.getObject(BUCKET_NAME, objectName);
    let data = '';
    for await (const chunk of stream) {
      data += chunk;
    }
    const parsed = JSON.parse(data);
    return json(parsed, { headers: corsHeaders });
  } catch (error) {
    console.error(`Không tìm thấy cấu hình cho key: ${key}`, error);
    return json(
      { success: false, error: `Không tìm thấy cấu hình cho key '${key}'` },
      { status: 404, headers: corsHeaders }
    );
  }
};

// 2. PUT: Cập nhật hoặc tạo mới cấu hình cho key cụ thể
export const PUT: RequestHandler = async ({ params, request }) => {
  const { key } = params;
  const objectName = `configs/${key}.json`;

  try {
    const body = await request.json();
    const configData = body.config || body;

    const storedConfig = {
      ...configData,
      key,
      updatedAt: new Date().toISOString()
    };

    const buffer = Buffer.from(JSON.stringify(storedConfig, null, 2), 'utf8');
    await minioClient.putObject(BUCKET_NAME, objectName, buffer, buffer.length, {
      'Content-Type': 'application/json'
    });

    return json({ success: true, config: storedConfig }, { headers: corsHeaders });
  } catch (error) {
    console.error(`Lỗi ghi cấu hình cho key ${key}:`, error);
    return json(
      { success: false, error: `Không thể lưu cấu hình: ${String(error)}` },
      { status: 500, headers: corsHeaders }
    );
  }
};

// 3. DELETE: Xóa file cấu hình theo key trên MinIO
export const DELETE: RequestHandler = async ({ params }) => {
  const { key } = params;
  const objectName = `configs/${key}.json`;

  try {
    await minioClient.removeObject(BUCKET_NAME, objectName);
    return json({ success: true }, { headers: corsHeaders });
  } catch (error) {
    console.error(`Lỗi khi xóa cấu hình ${key}:`, error);
    return json(
      { success: false, error: `Không thể xóa cấu hình: ${String(error)}` },
      { status: 500, headers: corsHeaders }
    );
  }
};