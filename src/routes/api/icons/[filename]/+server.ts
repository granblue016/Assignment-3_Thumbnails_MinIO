import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
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
  'Access-Control-Allow-Methods': 'GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=3600'
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, { headers: corsHeaders });
};

// 1. GET: Phục vụ hiển thị file ảnh icon từ MinIO
export const GET: RequestHandler = async ({ params }) => {
  const { filename } = params;
  const objectName = `icons/${filename}`;

  try {
    const stream = await minioClient.getObject(BUCKET_NAME, objectName);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const contentType = filename.endsWith('.png') ? 'image/png' : 'image/jpeg';

    return new Response(buffer, {
      headers: { ...corsHeaders, 'Content-Type': contentType }
    });
  } catch (error) {
    return new Response('Không tìm thấy icon', { status: 404, headers: corsHeaders });
  }
};

// 2. DELETE: Xóa icon trên MinIO
export const DELETE: RequestHandler = async ({ params }) => {
  try {
    const { filename } = params;
    if (!filename) {
      return json({ success: false, error: 'Tên file không hợp lệ' }, { status: 400, headers: corsHeaders });
    }

    await minioClient.removeObject(BUCKET_NAME, `icons/${filename}`);
    return json({ success: true, message: `Đã xóa icon '${filename}' thành công!` }, { headers: corsHeaders });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500, headers: corsHeaders });
  }
};