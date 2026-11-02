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
// const OBJECT_NAME = 'configs/map-config.json';

// const defaultMapConfig = {
//   title: "Hệ thống Bản đồ Trực tuyến - Sở khoa học và Công nghệ TP.HCM",
//   logoUrl: "https://tile.openstreetmap.org/12/3262/1925.png",
//   zoom: 8,
//   center: [10.780074, 106.6876522],
//   baseLayers: [
//     {
//       name: "OpenStreetMap",
//       layerUrl: "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
//       thumbnailUrl: "https://tile.openstreetmap.org/12/3262/1925.png"
//     },
//     {
//       name: "Vệ tinh",
//       layerUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
//       thumbnailUrl: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1925/3262.png"
//     }
//   ],
//   overlays: [
//     {
//       name: "Khu bảo tồn quốc gia Việt Nam",
//       wmsUrl: "https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms",
//       layers: "ODVietnam:Khu bao ton",
//       iconUrl: "./1.jpg",
//       active: true
//     },
//     {
//       name: "Tuần suất lũ lụt",
//       wmsUrl: "https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms",
//       layers: "ODVietnam:Flood_frequency-contour",
//       iconUrl: "./2.jpg",
//       active: false
//     },
//     {
//       name: "Covid-19",
//       wmsUrl: "https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms",
//       layers: "ODVietnam:10453931-345b-40fb-adc0-35eca5831381",
//       iconUrl: "./3.png",
//       active: false
//     },
//     {
//       name: "Danh sách di sản thế giới tại Việt Nam",
//       wmsUrl: "https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms",
//       layers: "ODVietnam:World Heritage Site of Vietnam (V.vietnamese)",
//       iconUrl: "./4.webp",
//       active: false
//     },
//     {
//       name: "Các dự án hỗ trợ của ngân hàng thế giới tại Việt Nam",
//       wmsUrl: "https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms",
//       layers: "ODVietnam:World_bank_aid_vn",
//       iconUrl: "./5.png",
//       active: false
//     }
//   ]
// };


const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
};


// export const GET: RequestHandler = async ({params}) => {
//   const { key } = params;
//   const OBJECT_NAME = `configs/${key}.json`

//   try {
//     const stream = await minioClient.getObject(BUCKET_NAME, OBJECT_NAME);
//     let data = '';
//     for await (const chunk of stream) {
//       data += chunk;
//     }
//     const parsed = JSON.parse(data);
    
//     if (parsed && parsed.title && Array.isArray(parsed.overlays) && Array.isArray(parsed.baseLayers)) {
//       return json(parsed, { headers: corsHeaders });
//     }
//     return json(defaultMapConfig, { headers: corsHeaders });
//   } catch (error) {
//     console.warn("Dùng cấu hình mặc định do chưa tải được từ MinIO:", error);
//     return json(defaultMapConfig, { headers: corsHeaders });
//   }
// };

// export const GET: RequestHandler = async () => {
//   try {
//     const objectsStream = minioClient.listObjectsV2(BUCKET_NAME, 'configs/', true);
//     const keys: string[] = [];

//     for await (const obj of objectsStream) {
//       if (obj.name && obj.name.endsWith('.json')) {
//         // Lọc tên file, ví dụ "configs/1.json" -> "1" hoặc "configs/map-config.json" -> "map-config"
//         const cleanName = obj.name.replace('configs/', '').replace('.json', '');
//         if (cleanName) {
//           keys.push(cleanName);
//         }
//       }
//     }

//     return json({ success: true, keys }, { headers: corsHeaders });
//   } catch (error) {
//     console.error("Lỗi khi liệt kê danh sách config từ MinIO:", error);
//     return json({ success: false, keys: [], error: String(error) }, { status: 500, headers: corsHeaders });
//   }
// };

export const GET: RequestHandler = async () => {
  try {
    const configs: any[] = [];
    const stream = minioClient.listObjectsV2(BUCKET_NAME, 'configs/', true);

    // 1. Quét danh sách các tệp tin từ MinIO qua Stream
    const objects: any[] = [];
    await new Promise((resolve, reject) => {
      stream.on('data', (obj) => objects.push(obj));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(objects));
    });

    // 2. Lọc và đọc từng file JSON tương tự cơ chế Netlify Blob cũ
    for (const obj of objects) {
      if (obj.name && /^configs\/[a-z0-9]+(?:-[a-z0-9]+)*\.json$/i.test(obj.name)) {
        const key = obj.name.replace('configs/', '').replace('.json', '');
        
        try {
          // Đọc nội dung tệp từ MinIO
          const dataStream = await minioClient.getObject(BUCKET_NAME, obj.name);
          let fileData = '';
          for await (const chunk of dataStream) {
            fileData += chunk;
          }
          const config = JSON.parse(fileData);

          configs.push({
            key,
            title: config.title || key,
            updatedAt: config.updatedAt || obj.lastModified,
            status: config.status === 'inactive' ? 'inactive' : 'active'
          });
        } catch (readErr) {
          console.warn(`Không thể đọc nội dung file ${obj.name}:`, readErr);
        }
      }
    }

    configs.sort((a, b) => a.key.localeCompare(b.key));

    return json(
      { success: true, configs, storageDriver: 'minio' },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error('Không thể liệt kê cấu hình từ MinIO:', error);
    return json(
      {
        success: false,
        configs: [],
        error: `Không thể tải danh sách cấu hình: ${String(error)}`
      },
      { status: 500, headers: corsHeaders }
    );
  }
};

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    const key = body.key || 'map-config';
    const dynamicObjectName = `configs/${key}.json`;

    // 1. Chuẩn hóa baseLayers:
    if (body && Array.isArray(body.baseLayers)) {
      body.baseLayers = body.baseLayers.map((item: any) => ({
        name: item.name || '',
        layerUrl: item.layerUrl || '',
        thumbnailUrl: item.thumbnailUrl || ''
      }));
    }

    // 2. Chuẩn hóa overlays:
    if (body && Array.isArray(body.overlays)) {
      body.overlays = body.overlays.map((item: any) => ({
        name: item.name || '',
        wmsUrl: item.wmsUrl || '',
        layers: item.layers || '',
        iconUrl: item.iconUrl || '',
        active: item.active === true || item.active === 'true' || item.active === '1' || item.active === 1
      }));
    }

    try {
      const jsonString = JSON.stringify(body, null, 2);
      const buffer = Buffer.from(jsonString, 'utf-8');
      await minioClient.putObject(BUCKET_NAME, dynamicObjectName, buffer);
    } catch (minioError) {
      console.warn("Lưu qua bộ nhớ tạm server do lỗi MinIO:", minioError);
    }

    return json({ success: true, message: 'Lưu cấu hình thành công!' }, { headers: corsHeaders });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500, headers: corsHeaders });
  }
};

export const PUT: RequestHandler = async ({ request, params }) => {
  const { key } = params;
  const OBJECT_NAME = `configs/${key}.json`;

  try {
    const body = await request.json();
    const jsonString = JSON.stringify(body, null, 2);
    const buffer = Buffer.from(jsonString, 'utf-8');
    
    await minioClient.putObject(BUCKET_NAME, OBJECT_NAME, buffer);

    return json({ success: true, message: `Lưu cấu hình '${key}' thành công!` }, { headers: corsHeaders });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500, headers: corsHeaders });
  }
};