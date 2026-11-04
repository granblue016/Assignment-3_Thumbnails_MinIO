import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

export const OPTIONS: RequestHandler = async () => {
  return new Response(null, { headers: corsHeaders });
};

// Hàm chuyên dụng để sửa lỗi font chữ bị lệch bảng mã từ GeoServer
function decodeMojibake(str: string): string {
  try {
    // Chuyển chuỗi bị đọc nhầm thành dạng byte latin1, sau đó decode lại chuẩn utf8
    return Buffer.from(str, 'latin1').toString('utf8');
  } catch {
    return str;
  }
}

// Hàm đệ quy quét qua toàn bộ object/array trong GeoJSON để sửa font cho tất cả properties
function deepFixEncoding(obj: any): any {
  if (typeof obj === 'string') {
    return decodeMojibake(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(deepFixEncoding);
  } else if (obj !== null && typeof obj === 'object') {
    const fixed: any = {};
    for (const key of Object.keys(obj)) {
      fixed[key] = deepFixEncoding(obj[key]);
    }
    return fixed;
  }
  return obj;
}

export const GET: RequestHandler = async ({ url }) => {
  const targetUrl = url.searchParams.get('url');
  if (!targetUrl) {
    return json({ error: 'Thiếu tham số url' }, { status: 400, headers: corsHeaders });
  }

  try {
    const response = await fetch(targetUrl);
    const contentType = response.headers.get('content-type') || '';

    // Đọc text thô từ response
    const rawText = await response.text();

    if (contentType.includes('application/json') || contentType.includes('geojson') || rawText.trim().startsWith('{')) {
      const parsed = JSON.parse(rawText);
      const fixedData = deepFixEncoding(parsed); // Tự động sửa lỗi font toàn bộ thuộc tính bên trong GeoJSON

      return json(fixedData, { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json; charset=utf-8' 
        } 
      });
    } else {
      const fixedHtml = decodeMojibake(rawText);
      return new Response(fixedHtml, { 
        status: response.status, 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'text/html; charset=utf-8' 
        } 
      });
    }
  } catch (err) {
    return json({ error: `Lỗi proxy: ${String(err)}` }, { status: 500, headers: corsHeaders });
  }
};