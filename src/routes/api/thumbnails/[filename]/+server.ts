// src/routes/api/thumbnails/image/[filename]/+server.ts
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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'public, max-age=3600'
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, { headers: corsHeaders });
};

export const GET: RequestHandler = async ({ params }) => {
  const { filename } = params;
  const objectName = `thumbnails/${filename}`;

  try {
    const stream = await minioClient.getObject(BUCKET_NAME, objectName);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);

    return new Response(buffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'image/jpeg'
      }
    });
  } catch (error) {
    console.error(`Không tìm thấy ảnh '${filename}' trên MinIO:`, error);
    return new Response('Không tìm thấy ảnh', { status: 404, headers: corsHeaders });
  }
};

export async function DELETE({ params }) {
	try {
		const { filename } = params;
		if (!filename || !/^[a-z0-9][a-z0-9-]*-\d+\.jpg$/i.test(filename)) {
			return json(
				{ success: false, error: 'Tên file thumbnail không hợp lệ.' },
				{ status: 400, headers: corsHeaders }
			);
		}

		const objectName = `thumbnails/${filename}`;
		await minioClient.removeObject(BUCKET_NAME, objectName);

		return json(
			{ success: true, message: `Đã xóa thumbnail '${filename}' thành công!` },
			{ headers: corsHeaders }
		);
	} catch (error) {
		console.error('Lỗi xóa thumbnail trên MinIO:', error);
		return json(
			{
				success: false,
				error: `Không thể xóa thumbnail: ${String(error)}`
			},
			{ status: 500, headers: corsHeaders }
		);
	}
}