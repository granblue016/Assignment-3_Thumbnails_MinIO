<!-- src/routes/admin/thumbnails/+page.svelte -->
<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import 'leaflet/dist/leaflet.css';
	import html2canvas from 'html2canvas';

	let thumbnails = $state<{ filename: string; name: string; timestamp: string | Date; url: string }[]>([]);
	let name = $state('');
	let baseLayerUrl = $state('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
	let isLoading = $state(true);
	let isCapturing = $state(false);
	let mapReady = $state(false);
	let statusMessage = $state('');
	let storageDriver = $state('minio');

	let mapContainer = $state<HTMLDivElement>();
	let leaflet: typeof import('leaflet') | null = null;
	let mapInstance = $state.raw<import('leaflet').Map | null>(null);
	let tileLayerInstance = $state.raw<import('leaflet').TileLayer | null>(null);

	// 1. Tải danh sách thumbnail từ API
	async function fetchThumbnails() {
		try {
			const res = await fetch('/api/thumbnails');
			const data = await res.json();
			if (!res.ok || !data.success) {
				throw new Error(data.error || `HTTP ${res.status}`);
			}
			thumbnails = data.thumbnails;
			storageDriver = data.storageDriver || 'minio';
		} catch (err) {
			statusMessage =
				err instanceof Error
					? err.message
					: 'Không thể tải danh sách thumbnail. Hãy kiểm tra kết nối bộ lưu trữ.';
		} finally {
			isLoading = false;
		}
	}

	// 2. Khởi tạo bản đồ Leaflet preview
	onMount(async () => {
		await fetchThumbnails();

		try {
			leaflet = await import('leaflet');

			if (mapContainer && !mapInstance) {
				mapInstance = leaflet.map(mapContainer).setView([10.7769, 106.7009], 13);
				tileLayerInstance = leaflet
					.tileLayer(baseLayerUrl, { maxZoom: 22, crossOrigin: true })
					.addTo(mapInstance);
				mapReady = true;
				requestAnimationFrame(() => mapInstance?.invalidateSize());
			}
		} catch (error) {
			console.error('Lỗi khởi tạo Leaflet:', error);
			statusMessage = 'Không thể khởi tạo bản đồ xem trước.';
		}
	});

	onDestroy(() => {
		if (mapInstance) {
			mapInstance.remove();
			mapInstance = null;
		}
	});

	// Cập nhật tile layer khi người dùng đổi URL
	function updatePreviewMap() {
		if (mapInstance && tileLayerInstance && leaflet) {
			mapInstance.removeLayer(tileLayerInstance);
			tileLayerInstance = leaflet
				.tileLayer(baseLayerUrl || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
					maxZoom: 22,
					crossOrigin: true
				})
				.addTo(mapInstance);
		}
	}

	// 3. Quy trình Tạo Thumbnail & Chụp ảnh canvas
	async function handleCreateThumbnail() {
		if (!name.trim()) {
			alert('Vui lòng nhập tên cho thumbnail!');
			return;
		}
		if (!mapContainer || !mapReady) {
			statusMessage = 'Bản đồ xem trước chưa sẵn sàng.';
			return;
		}

		isCapturing = true;
		statusMessage = 'Đang chụp ảnh bản đồ...';

		try {
			const canvas = await html2canvas(mapContainer, {
				useCORS: true,
				allowTaint: false,
				scale: Math.min(window.devicePixelRatio || 1, 2)
			});
			const imageBase64 = canvas.toDataURL('image/jpeg', 0.9);

			statusMessage = 'Đang upload thumbnail lên MinIO...';

			const res = await fetch('/api/thumbnails', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ name: name.trim(), image: imageBase64 })
			});

			const result = await res.json();
			if (res.ok && result.success) {
				statusMessage = 'Tạo và upload thumbnail thành công!';
				name = '';
				await fetchThumbnails();
			} else {
				statusMessage = 'Lỗi: ' + (result.error || `HTTP ${res.status}`);
			}
		} catch (error) {
			console.error('Không thể chụp hoặc tải thumbnail:', error);
			statusMessage =
				error instanceof DOMException && error.name === 'SecurityError'
					? 'Không thể chụp ảnh do tile server không cho phép CORS.'
					: `Lỗi trong quá trình tạo thumbnail: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			isCapturing = false;
			setTimeout(() => (statusMessage = ''), 4000);
		}
	}

	// 4. Xóa thumbnail
	async function handleDelete(filename: string) {
		if (!confirm(`Bạn có chắc muốn xóa thumbnail '${filename}' không?`)) return;
		try {
			const res = await fetch(`/api/thumbnails/${filename}`, { method: 'DELETE' });
			const data = await res.json();
			if (data.success) {
				thumbnails = thumbnails.filter((t) => t.filename !== filename);
			} else {
				alert('Xóa thất bại: ' + data.error);
			}
		} catch (error) {
			console.error('Lỗi kết nối khi xóa thumbnail:', error);
			statusMessage = 'Lỗi kết nối khi xóa thumbnail.';
		}
	}

	// 5. Copy URL
	async function copyToClipboard(url: string) {
		try {
			await navigator.clipboard.writeText(url);
			statusMessage = 'Đã copy URL vào clipboard.';
		} catch (error) {
			console.error('Không thể copy URL:', error);
			statusMessage = 'Không thể truy cập clipboard.';
		}
	}
</script>

<svelte:head>
	<title>Quản lý Thumbnail Bản đồ Nền</title>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
	/>
</svelte:head>

<main class="min-h-screen bg-slate-100 p-8 font-sans">
	<div class="mx-auto max-w-5xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
		<div class="d-flex align-items-center border-bottom mb-6 justify-between pb-4">
			<div>
				<h1 class="h3 fw-bold text-slate-800">
					Quản lý Thumbnail Bản đồ Nền (Map BaseLayer Thumbnail)
				</h1>
				<p class="text-muted small mb-0">
					Xem trước bản đồ Leaflet, chụp ảnh canvas và lưu trữ trên MinIO Cloud.
				</p>
			</div>
			<!-- svelte-ignore svelte/no-navigation-without-resolve -->
			<button onclick={() => goto('/admin/configs')} class="btn btn-outline-secondary btn-sm">
				← Quản lý Cấu hình
			</button>
		</div>

		<!-- Phần tạo thumbnail -->
		<div class="row g-4 rounded-3 mb-5 border bg-slate-50 p-4">
			<div class="col-md-5">
				<div class="mb-3">
					<label for="thumbName" class="form-label fw-semibold small">Tên Thumbnail (Name):</label>
					<input
						id="thumbName"
						type="text"
						bind:value={name}
						placeholder="Ví dụ: osm-standard, satellite..."
						class="form-control"
					/>
				</div>
				<div class="mb-3">
					<label for="layerUrlInput" class="form-label fw-semibold small">BaseLayer URL:</label>
					<input
						id="layerUrlInput"
						type="text"
						bind:value={baseLayerUrl}
						onchange={updatePreviewMap}
						class="form-control"
					/>
					<div class="form-text small">Hỗ trợ template {'{z}/{x}/{y}'}.</div>
				</div>
				<button
					onclick={handleCreateThumbnail}
					disabled={isCapturing || !mapReady}
					class="btn btn-success fw-semibold w-100 py-2"
				>
					{isCapturing ? 'Đang xử lý...' : '📷 Tạo Thumbnail & Upload'}
				</button>
				{#if statusMessage}
					<div class="alert alert-info small mt-3 mb-0 py-2">{statusMessage}</div>
				{/if}
			</div>

			<!-- Leaflet Preview Map Container -->
			<div class="col-md-7">
				<p class="form-label fw-semibold small">
					Xem trước bản đồ (Zoom/Pan tự do trước khi chụp):
				</p>
				<div
					bind:this={mapContainer}
					class="rounded-3 border shadow-inner"
					style="height: 300px; width: 100%;"
				></div>
			</div>
		</div>

		<!-- Danh sách thumbnail đã tạo -->
		<h2 class="h5 fw-bold mb-3 text-slate-700">Danh sách Thumbnail đã tạo</h2>

		{#if isLoading}
			<div class="text-muted py-5 text-center">Đang tải danh sách...</div>
		{:else if thumbnails.length === 0}
			<div class="text-muted rounded-3 bg-light border py-5 text-center">
				Chưa có thumbnail nào được tạo.
			</div>
		{:else}
			<div class="table-responsive">
				<table class="table-hover table align-middle">
					<thead class="table-light">
						<tr>
							<th>Preview</th>
							<th>Name</th>
							<th>Timestamp</th>
							<th>Link URL</th>
							<th class="text-end">Hành động</th>
						</tr>
					</thead>
					<tbody>
						{#each thumbnails as thumb (thumb.filename)}
							<tr>
								<td>
									<img
										src={thumb.url}
										alt={thumb.name}
										class="object-fit-cover rounded border"
										style="width: 60px; height: 45px;"
									/>
								</td>
								<td class="fw-bold">{thumb.name}</td>
								<td class="text-muted small">{new Date(thumb.timestamp).toLocaleString()}</td>
								<td>
									<input
										type="text"
										readonly
										value={thumb.url}
										class="form-control form-control-sm text-truncate"
										style="max-width: 250px;"
									/>
								</td>
								<td class="text-end">
									<button
										onclick={() => copyToClipboard(thumb.url)}
										class="btn btn-sm btn-outline-primary me-1">Copy URL</button
									>
									<button
										onclick={() => handleDelete(thumb.filename)}
										class="btn btn-sm btn-outline-danger">Delete</button
									>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>
</main>