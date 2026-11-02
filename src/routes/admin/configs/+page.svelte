<!-- src/routes/admin/configs/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	let configs = $state<{ key: string; title: string; updatedAt: string | Date; status: string }[]>([]);
	let newKey = $state('');
	let isLoading = $state(true);
	let errorMessage = $state('');
	let isCreating = $state(false);

	// Cấu hình mẫu tối giản trực tiếp trong file để loại bỏ hoàn toàn lỗi import ngoài
	const minimalConfig = {
		title: 'Hệ thống Bản đồ Trực tuyến Mới',
		zoom: 8,
		center: [10.780074, 106.6876522],
		baseLayers: [
			{
				name: 'OpenStreetMap',
				layerUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
				thumbnailUrl: 'https://tile.openstreetmap.org/12/3262/1925.png'
			}
		],
		overlays: []
	};

	async function fetchConfigs() {
		isLoading = true;
		errorMessage = '';
		try {
			const res = await fetch('/api/configs');
			const data = await res.json();
			if (res.ok && data.success) {
				configs = data.configs;
			} else {
				errorMessage = data.error || 'Không thể tải danh sách cấu hình.';
			}
		} catch (err) {
			errorMessage = 'Lỗi kết nối khi tải danh sách từ MinIO.';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchConfigs();
	});

	async function handleCreate(event: SubmitEvent) {
		event.preventDefault();
		const key = newKey.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-');
		if (!key) {
			alert('Vui lòng nhập tên key hợp lệ!');
			return;
		}

		isCreating = true;
		try {
			const res = await fetch('/api/configs', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ key, config: minimalConfig })
			});
			const result = await res.json();
			if (res.ok && result.success) {
				newKey = '';
				await fetchConfigs();
				// Chuyển hướng trực tiếp sang trang chỉnh sửa chi tiết của key vừa tạo
				goto(`/admin/configs/${key}` as any);
			} else {
				alert('Lỗi tạo cấu hình: ' + (result.error || 'Không rõ nguyên nhân'));
			}
		} catch (err) {
			alert('Lỗi kết nối khi gửi request tạo mới!');
		} finally {
			isCreating = false;
		}
	}

	async function handleDelete(key: string) {
		if (!confirm(`Bạn có chắc chắn muốn xóa cấu hình '${key}' này không?`)) return;
		try {
			const res = await fetch(`/api/config/${encodeURIComponent(key)}`, { method: 'DELETE' });
			const data = await res.json();
			if (data.success) {
				configs = configs.filter((c) => c.key !== key);
			} else {
				alert('Xóa thất bại: ' + data.error);
			}
		} catch {
			alert('Lỗi kết nối khi xóa!');
		}
	}
</script>

<svelte:head>
	<title>Quản lý Cấu hình Bản đồ</title>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
	/>
</svelte:head>

<main class="container py-5" style="max-width: 800px;">
	<!-- Header chính: Đã đưa nút Quản lý Thumbnail lên đây để tách rời hoàn toàn khỏi form tạo mới -->
	<div class="d-flex justify-content-between align-items-center mb-4 pb-3 border-bottom">
		<div>
			<h1 class="h3 fw-bold text-dark">Quản lý Cấu hình Bản đồ (MinIO)</h1>
			<p class="text-muted small mb-0">Danh sách các tệp JSON lưu trữ trực tiếp trên MinIO Cloud.</p>
		</div>
		<!-- svelte-ignore svelte/no-navigation-without-resolve -->
		<a href="/admin/thumbnails" class="btn btn-outline-success fw-semibold px-3">
			📷 Quản lý Thumbnail
		</a>
	</div>

	{#if errorMessage}
		<div class="alert alert-danger" role="alert">
			{errorMessage}
		</div>
	{/if}

	<!-- Form tạo mới nhanh (Đã sạch sẽ, chỉ chứa chức năng tạo cấu hình) -->
	<form onsubmit={handleCreate} class="card p-4 mb-4 border-0 shadow-sm bg-light rounded-3">
		<h5 class="h6 fw-bold mb-3 text-secondary">Tạo cấu hình bản đồ mới với Key độc lập:</h5>
		
		<div class="input-group">
			<input
				type="text"
				bind:value={newKey}
				placeholder="Ví dụ: thu-duc-map,quan-1-map..."
				class="form-control"
				required
			/>
			<button type="submit" disabled={isCreating} class="btn btn-primary fw-semibold px-4">
				{isCreating ? 'Đang tạo...' : '+ Tạo mới'}
			</button>
		</div>
	</form>

	<!-- Bảng hiển thị danh sách -->
	<h2 class="h5 fw-bold mb-3 text-dark">Danh sách cấu hình hiện có</h2>

	{#if isLoading}
		<p class="text-muted text-center py-5">Đang quét dữ liệu từ MinIO...</p>
	{:else if configs.length === 0}
		<p class="text-muted fst-italic py-3">Chưa có tệp cấu hình nào. Hãy nhập key và bấm tạo mới ở trên!</p>
	{:else}
		<ul class="list-group shadow-sm">
			{#each configs as cfg (cfg.key)}
				<li class="list-group-item d-flex justify-content-between align-items-center py-3 px-4">
					<div>
						<strong class="text-primary fs-5">{cfg.title || cfg.key}</strong>
						<div class="text-muted small mt-1">
							Key: <code class="text-dark fw-bold">{cfg.key}</code> | 
							Cập nhật: {new Date(cfg.updatedAt).toLocaleString()}
						</div>
					</div>
					<div class="d-flex gap-2">
						<a
							href={`/api/config/${cfg.key}`}
							target="_blank"
							rel="noreferrer"
							class="btn btn-sm btn-outline-secondary"
						>
							JSON API
						</a>
						<!-- svelte-ignore svelte/no-navigation-without-resolve -->
						<a
							href={`/admin/configs/${cfg.key}`}
							class="btn btn-sm btn-outline-primary px-3 fw-semibold"
						>
							Sửa
						</a>
						<button
							onclick={() => handleDelete(cfg.key)}
							class="btn btn-sm btn-outline-danger"
						>
							Xóa
						</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</main>