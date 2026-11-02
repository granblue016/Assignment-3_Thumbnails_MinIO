<!-- src/routes/admin/configs/[key]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import { tick } from 'svelte';
	import { goto } from '$app/navigation';
	import '../../../jedison.css';

	// Lấy key động từ URL thông qua Svelte 5 runes
	let key = $derived(page.params.key);

	let centerLat = $state(10.780074);
	let centerLng = $state(106.6876522);

	// Cấu hình mẫu tối giản trực tiếp trong file
	const fallbackConfig = {
		title: 'Hệ thống Bản đồ Trực tuyến',
		logoUrl: 'https://tile.openstreetmap.org/12/3262/1925.png',
		zoom: 8,
		status: 'active',
		center: [10.780074, 106.6876522],
		baseLayers: [
			{
				name: 'OpenStreetMap',
				layerUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
				thumbnailUrl: 'https://tile.openstreetmap.org/12/3262/1925.png'
			},
			{
				name: 'Vệ tinh',
				layerUrl:
					'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
				thumbnailUrl:
					'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/12/1925/3262.png'
			}
		],
		overlays: [
			{
				name: "Khu bảo tồn quốc gia Việt Nam",
				wmsUrl: "https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms",
				layers: "ODVietnam:Khu bao ton",
				iconUrl: "./1.jpg",
				active: true
			},
			{
				name: 'Tuần suât lũ lụt',
				wmsUrl: 'https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms',
				layers: 'ODVietnam:Flood_frequency-contour',
				iconUrl: './2.jpg',
				active: false
			},
			{
				name: 'Covid-19',
				wmsUrl: 'https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms',
				layers: 'ODVietnam:Covid-19_cases',
				iconUrl: './3.jpg',
				active: false
			},
			{
				name: 'Danh sách di sản thế giới tại Việt Nam',
				wmsUrl: 'https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms',
				layers: 'ODVietnam:World Heritage Site of Vietnam (V.vietnamese)',
				iconUrl: './4.webp',
				active: false
			},
			{
				name: 'Các dự án hộ trợ của ngân hàng thế giới tại Việt Nam',
				wmsUrl: 'https://geoserver.opendevelopmentmekong.net/geoserver/ODVietnam/wms',
				layers: 'ODVietnam:World_bank_aid_vn',
				iconUrl: './5.png',
				active: false
			}
		]
	};

	let generalSchema = {
		type: 'object',
		additionalProperties: false,
		title: 'Cấu hình chung (General Configuration)',
		properties: {
			title: { type: 'string', title: 'title' },
			logoUrl: { type: 'string', title: 'logoUrl' },
			zoom: { type: 'integer', title: 'zoom' },
			status: { type: 'string', title: 'status', enum: ['active', 'inactive'] }
		}
	};

	let layersSchema = {
		type: 'object',
		additionalProperties: false,
		properties: {
			baseLayers: {
				type: 'array',
				title: 'baseLayers',
				items: {
					type: 'object',
					additionalProperties: false,
					headerTemplate: '{{self.name}}',
					properties: {
						name: { type: 'string', title: 'name' },
						layerUrl: { type: 'string', title: 'layerUrl' },
						thumbnailUrl: { type: 'string', title: 'thumbnailUrl' }
					}
				}
			},
			overlays: {
				type: 'array',
				title: 'overlays',
				items: {
					type: 'object',
					additionalProperties: false,
					headerTemplate: '{{self.name}}',
					properties: {
						name: { type: 'string', title: 'name' },
						wmsUrl: { type: 'string', title: 'wmsUrl' },
						layers: { type: 'string', title: 'layers' },
						iconUrl: { type: 'string', title: 'iconUrl' },
						active: { type: 'boolean', title: 'active' }
					}
				}
			}
		}
	};

	let editorGeneralContainer = $state<HTMLDivElement>();
	let editorLayersContainer = $state<HTMLDivElement>();
	let statusMessage = $state('');
	let isSuccess = $state(true);
	let isLoading = $state(true);

	let editorGeneralInstance = $state.raw<any>(null);
	let editorLayersInstance = $state.raw<any>(null);

	async function loadConfigData(currentKey: string) {
		isLoading = true;
		let initialData = JSON.parse(JSON.stringify(fallbackConfig));

		try {
			const res = await fetch(`/api/config/${currentKey}`);
			if (res.ok) {
				const json = await res.json();
				if (json && json.title) {
					initialData = json;
				}
			}
		} catch (error) {
			console.error('Không thể tải cấu hình từ MinIO:', error);
		}

		if (Array.isArray(initialData.center) && initialData.center.length >= 2) {
			centerLat = initialData.center[0];
			centerLng = initialData.center[1];
		}

		const generalData = {
			title: initialData.title || '',
			logoUrl: initialData.logoUrl || '',
			zoom: initialData.zoom ?? 8,
			status: initialData.status === 'inactive' ? 'inactive' : 'active'
		};

		const layersData = {
			baseLayers: Array.isArray(initialData.baseLayers) ? initialData.baseLayers : [],
			overlays: Array.isArray(initialData.overlays) ? initialData.overlays : []
		};

		try {
			// @ts-ignore
			const jedisonModule = await import('jedison');
			const Jedison = jedisonModule.default || jedisonModule;

			await tick();

			if (editorGeneralContainer && editorLayersContainer && Jedison) {
				editorGeneralInstance = new Jedison.Create({
					container: editorGeneralContainer,
					theme: new Jedison.ThemeBootstrap5(),
					schema: generalSchema,
					data: generalData,
					disable_properties: true,
					disable_edit_json: true,
					disable_collapse: true
				});

				editorLayersInstance = new Jedison.Create({
					container: editorLayersContainer,
					theme: new Jedison.ThemeBootstrap5(),
					schema: layersSchema,
					data: layersData,
					disable_properties: true,
					disable_edit_json: true,
					disable_collapse: true
				});
			}
		} catch (e) {
			console.error('Lỗi khởi tạo Jedison:', e);
		} finally {
			isLoading = false;
		}
	}

	// Tự động load lại dữ liệu mỗi khi key trên URL thay đổi
	$effect(() => {
		if (key) {
			loadConfigData(key);
		}
	});

	async function handleSave() {
		if (!editorGeneralInstance || !editorLayersInstance) return;

		try {
			const generalVal = editorGeneralInstance.getValue();
			const layersVal = editorLayersInstance.getValue();

			const rawData = {
				title: generalVal.title,
				logoUrl: generalVal.logoUrl,
				zoom: generalVal.zoom,
				status: generalVal.status,
				center: [Number(centerLat) || 0, Number(centerLng) || 0],
				...layersVal
			};

			statusMessage = 'Đang lưu cấu hình...';
			isSuccess = true;

			const response = await fetch(`/api/config/${key}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(rawData)
			});

			const result = await response.json();
			if (result.success) {
				statusMessage = `Lưu cấu hình '${key}' thành công!`;
				isSuccess = true;
			} else {
				statusMessage = 'Lưu thất bại: ' + (result.error || 'Lỗi server');
				isSuccess = false;
			}
		} catch (err) {
			console.error(err);
			statusMessage = 'Lỗi kết nối khi lưu!';
			isSuccess = false;
		}

		setTimeout(() => (statusMessage = ''), 4000);
	}
</script>

<svelte:head>
	<title>Chỉnh sửa - {key}</title>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
	/>
</svelte:head>

<main class="container py-5" style="max-width: 900px;">
	<div class="d-flex justify-content-between align-items-center border-bottom mb-4 pb-3">
		<div>
			<h1 class="h3 fw-bold text-dark">
				Đang chỉnh sửa Key: <span class="text-primary">{key}</span>
			</h1>
			<p class="text-muted small mb-0">
				Dữ liệu được lưu tại MinIO với tệp <code>configs/{key}.json</code>
			</p>
		</div>
		<!-- svelte-ignore svelte/no-navigation-without-resolve -->
		<button onclick={() => goto('/admin/configs')} class="btn btn-outline-secondary btn-sm">
			← Quay lại danh sách
		</button>
	</div>

	{#if isLoading}
		<p class="text-muted py-5 text-center">Đang tải dữ liệu từ MinIO...</p>
	{/if}

	{#key key}
		<div
			class="card bg-light rounded-3 mb-4 border-0 p-4 shadow-sm"
			style:display={isLoading ? 'none' : 'block'}
		>
			<h5 class="h6 fw-bold text-secondary mb-3">Cấu hình chung (General Configuration)</h5>

			<div class="mb-4">
				<div bind:this={editorGeneralContainer} class="custom-jedison-wrapper"></div>
			</div>

			<div class="row g-3">
				<div class="col-12">
					<label class="form-label fw-semibold text-secondary">Tọa độ tâm bản đồ (Center)</label>
				</div>
				<div class="col-md-6">
					<label for="lat" class="form-label small text-muted">Latitude (Vĩ độ)</label>
					<input id="lat" type="number" step="any" bind:value={centerLat} class="form-control" />
				</div>
				<div class="col-md-6">
					<label for="lng" class="form-label small text-muted">Longitude (Kinh độ)</label>
					<input id="lng" type="number" step="any" bind:value={centerLng} class="form-control" />
				</div>
			</div>
		</div>

		<div
			class="card rounded-3 mb-4 border-0 bg-white p-4 shadow-sm"
			style:display={isLoading ? 'none' : 'block'}
		>
			<div bind:this={editorLayersContainer} class="custom-jedison-wrapper"></div>
		</div>
	{/key}

	<div class="d-flex justify-content-between align-items-center border-top pt-3">
		<button
			onclick={handleSave}
			disabled={isLoading || !editorGeneralInstance}
			class="btn btn-primary fw-semibold px-4"
		>
			Lưu thay đổi
		</button>

		{#if statusMessage}
			<span class={`small fw-semibold ${isSuccess ? 'text-success' : 'text-danger'}`}>
				{statusMessage}
			</span>
		{/if}
	</div>
</main>
