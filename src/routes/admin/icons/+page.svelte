<!-- src/routes/admin/icons/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import Pica from 'pica';

	const pica = new Pica();

	type IconItem = {
		filename: string;
		name: string;
		timestamp: string | Date;
		url: string;
	};

	let icons = $state<IconItem[]>([]);
	let iconName = $state('');
	let sourceMode = $state<'file' | 'url'>('file');
	let imageUrl = $state('');
	let selectedFile = $state<File | null>(null);
	let previewOriginalUrl = $state('');

	// Tùy chọn kích thước resize
	let useDefaultSize = $state(true);
	let customWidth = $state(48);
	let customHeight = $state(48);

	let isLoading = $state(true);
	let isProcessing = $state(false);
	let statusMessage = $state('');

	function absoluteUrl(path: string) {
		return new URL(path, page.url.origin).href;
	}

	// 1. Tải danh sách icon từ API
	async function fetchIcons() {
		isLoading = true;
		try {
			const res = await fetch('/api/icons');
			const data = await res.json();
			if (res.ok && data.success) {
				icons = data.icons;
			} else {
				statusMessage = data.error || 'Không thể tải danh sách icon.';
			}
		} catch (err) {
			statusMessage = 'Lỗi kết nối khi tải danh sách icon từ MinIO.';
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		fetchIcons();
	});

	// Xử lý khi người dùng chọn file từ máy
	function handleFileChange(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files && target.files[0]) {
			selectedFile = target.files[0];
			previewOriginalUrl = URL.createObjectURL(selectedFile);
		}
	}

	// Xử lý khi người dùng nhập link ảnh
	function handleUrlChange(event: Event) {
		const target = event.target as HTMLInputElement;
		imageUrl = target.value;
		if (imageUrl.trim()) {
			previewOriginalUrl = imageUrl;
		}
	}

	// 2. Quy trình Resize bằng Pica và Upload lên MinIO
	async function handleCreateIcon(event: SubmitEvent) {
		event.preventDefault();
		if (!iconName.trim()) {
			alert('Vui lòng nhập tên cho icon!');
			return;
		}
		if (sourceMode === 'file' && !selectedFile) {
			alert('Vui lòng chọn file hình ảnh từ máy!');
			return;
		}
		if (sourceMode === 'url' && !imageUrl.trim()) {
			alert('Vui lòng nhập đường dẫn URL hình ảnh!');
			return;
		}

		isProcessing = true;
		statusMessage = 'Đang tải và xử lý ảnh gốc...';

		try {
			// Bước A: Load ảnh gốc vào Image object để lấy kích thước chuẩn
			const img = new Image();
			img.crossOrigin = 'anonymous';

			const imageSource = sourceMode === 'file' ? URL.createObjectURL(selectedFile!) : imageUrl;

			await new Promise((resolve, reject) => {
				img.onload = resolve;
				img.onerror = () => reject(new Error('Không thể tải hình ảnh nguồn. Kiểm tra lại đường dẫn hoặc CORS.'));
				img.src = imageSource;
			});

			// Bước B: Vẽ ảnh gốc lên source canvas
			const srcCanvas = document.createElement('canvas');
			srcCanvas.width = img.width;
			srcCanvas.height = img.height;
			const srcCtx = srcCanvas.getContext('2d');
			if (!srcCtx) throw new Error('Không thể khởi tạo Context 2D cho canvas nguồn.');
			srcCtx.drawImage(img, 0, 0);

			// Bước C: Xác định kích thước đích (Mặc định 48x48 hoặc tùy chỉnh)
			const targetW = useDefaultSize ? 48 : Number(customWidth) || 48;
			const targetH = useDefaultSize ? 48 : Number(customHeight) || 48;

			const targetCanvas = document.createElement('canvas');
			targetCanvas.width = targetW;
			targetCanvas.height = targetH;

			// Bước D: Sử dụng Pica để resize hình ảnh chất lượng cao
			statusMessage = `Đang resize ảnh về kích thước ${targetW}x${targetH} bằng Pica...`;
			await pica.resize(srcCanvas, targetCanvas);

			// Chuyển canvas kết quả thành chuỗi Base64 (định dạng PNG)
			const resizedBase64 = targetCanvas.toDataURL('image/png', 0.9);

			statusMessage = 'Đang upload icon lên MinIO (thư mục icons/)...';

			// Bước E: Gửi lên Backend API POST /api/icons
			const res = await fetch('/api/icons', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					name: iconName.trim(),
					image: resizedBase64
				})
			});

			const result = await res.json();
			if (res.ok && result.success) {
				statusMessage = 'Tạo và upload icon thành công!';
				iconName = '';
				selectedFile = null;
				imageUrl = '';
				previewOriginalUrl = '';
				await fetchIcons();
			} else {
				statusMessage = 'Lỗi: ' + (result.error || 'Không rõ nguyên nhân');
			}
		} catch (error) {
			console.error('Lỗi xử lý icon:', error);
			statusMessage = `Lỗi: ${error instanceof Error ? error.message : String(error)}`;
		} finally {
			isProcessing = false;
			setTimeout(() => {
				if (statusMessage.includes('thành công')) statusMessage = '';
			}, 4000);
		}
	}

	// 3. Xóa icon
	async function handleDelete(filename: string) {
		if (!confirm(`Bạn có chắc chắn muốn xóa icon '${filename}' này không?`)) return;
		try {
			const res = await fetch(`/api/icons/${filename}`, { method: 'DELETE' });
			const data = await res.json();
			if (data.success) {
				icons = icons.filter((i) => i.filename !== filename);
			} else {
				alert('Xóa thất bại: ' + (data.error || 'Lỗi server'));
			}
		} catch (error) {
			alert('Lỗi kết nối khi xóa icon!');
		}
	}

	// 4. Copy URL 1 click[cite: 11]
	async function copyToClipboard(url: string) {
		try {
			await navigator.clipboard.writeText(absoluteUrl(url));
			statusMessage = 'Đã copy link icon vào clipboard!';
			setTimeout(() => (statusMessage = ''), 3000);
		} catch (error) {
			alert('Không thể truy cập clipboard.');
		}
	}
</script>

<svelte:head>
	<title>Quản lý Icon Bản đồ</title>
	<link
		rel="stylesheet"
		href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css"
	/>
</svelte:head>

<main class="container py-5" style="max-width: 900px;">
	<div class="d-flex justify-content-between align-items-center border-bottom mb-4 pb-3">
		<div>
			<h1 class="h3 fw-bold text-dark">Quản lý Icon Hệ thống Bản đồ</h1>
			<p class="text-muted small mb-0">
				Tạo mới, resize bằng thư viện Pica.
			</p>
		</div>
		<div class="d-flex gap-2">
			<a href={absoluteUrl('/admin/configs')} class="btn btn-outline-secondary btn-sm">
				← Quản lý Cấu hình
			</a>
			<a href={absoluteUrl('/admin/thumbnails')} class="btn btn-outline-secondary btn-sm">
				Quản lý Thumbnail
			</a>
		</div>
	</div>

	{#if statusMessage}
		<div class="alert alert-info shadow-sm" role="alert">
			{statusMessage}
		</div>
	{/if}

	<!-- Form Tạo mới Icon -->
	<form onsubmit={handleCreateIcon} class="card bg-light rounded-3 mb-5 border-0 p-4 shadow-sm">
		<h5 class="h5 fw-bold text-secondary mb-3">Tạo mới Icon</h5>

		<div class="row g-3">
			<div class="col-md-6">
				<label for="iconNameInput" class="form-label fw-semibold small">Tên Icon (Name):</label>
				<input
					id="iconNameInput"
					type="text"
					bind:value={iconName}
					placeholder="Ví dụ: hospital, school, marker..."
					class="form-control"
					required
				/>
			</div>

			<div class="col-md-6">
				<label class="form-label fw-semibold small">Nguồn hình ảnh:</label>
				<div class="btn-group w-100" role="group">
					<input
						type="radio"
						class="btn-check"
						name="sourceMode"
						id="modeFile"
						value="file"
						bind:group={sourceMode}
					/>
					<label class="btn btn-outline-primary btn-sm" for="modeFile">📁 Upload file từ máy</label>

					<input
						type="radio"
						class="btn-check"
						name="sourceMode"
						id="modeUrl"
						value="url"
						bind:group={sourceMode}
					/>
					<label class="btn btn-outline-primary btn-sm" for="modeUrl">🔗 Nhập link URL</label>
				</div>
			</div>

			{#if sourceMode === 'file'}
				<div class="col-md-12">
					<label for="fileInput" class="form-label small text-muted">Chọn file ảnh (PNG, JPG):</label>
					<input
						id="fileInput"
						type="file"
						accept="image/png, image/jpeg, image/jpg"
						onchange={handleFileChange}
						class="form-control"
					/>
				</div>
			{:else}
				<div class="col-md-12">
					<label for="urlInput" class="form-label small text-muted">Đường dẫn URL hình ảnh:</label>
					<input
						id="urlInput"
						type="url"
						placeholder="https://example.com/icon.png"
						oninput={handleUrlChange}
						class="form-control"
					/>
				</div>
			{/if}

			<!-- Tùy chọn kích thước Resize -->
			<div class="col-md-12 border-top pt-3 mt-3">
				<div class="form-check mb-2">
					<input
						class="form-check-input"
						type="checkbox"
						id="defaultSizeCheck"
						bind:checked={useDefaultSize}
					/>
					<label class="form-check-label fw-semibold small" for="defaultSizeCheck">
						Resize kích thước mặc định: <b>48 × 48 px</b>
					</label>
				</div>

				{#if !useDefaultSize}
					<div class="row g-2 ps-4">
						<div class="col-md-6">
							<label for="widthInput" class="form-label small text-muted">Chiều rộng (Width px):</label>
							<input
								id="widthInput"
								type="number"
								min="8"
								max="512"
								bind:value={customWidth}
								class="form-control form-control-sm"
							/>
						</div>
						<div class="col-md-6">
							<label for="heightInput" class="form-label small text-muted">Chiều cao (Height px):</label>
							<input
								id="heightInput"
								type="number"
								min="8"
								max="512"
								bind:value={customHeight}
								class="form-control form-control-sm"
							/>
						</div>
					</div>
				{/if}
			</div>

			<!-- Preview ảnh gốc -->
			{#if previewOriginalUrl}
				<div class="col-md-12 mt-3">
					<span class="form-label fw-semibold small d-block">Xem trước ảnh gốc (Preview):</span>
					<div class="p-2 bg-white border rounded d-inline-block">
						<img
							src={previewOriginalUrl}
							alt="Preview gốc"
							style="max-height: 80px; max-width: 100%; object-fit: contain;"
						/>
					</div>
				</div>
			{/if}

			<div class="col-md-12 mt-4">
				<button
					type="submit"
					disabled={isProcessing}
					class="btn btn-success fw-semibold w-100 py-2"
				>
					{isProcessing ? 'Đang xử lý Pica & Upload...' : '✨ Resize bằng Pica & Upload lên MinIO'}
				</button>
			</div>
		</div>
	</form>

	<!-- Danh sách Icon -->
	<h2 class="h5 fw-bold text-dark mb-3">Danh sách Icon đã lưu trên MinIO</h2>

	{#if isLoading}
		<p class="text-muted py-5 text-center">Đang tải danh sách icon...</p>
	{:else if icons.length === 0}
		<p class="text-muted fst-italic py-3 bg-white border rounded text-center">
			Chưa có icon nào trong thư mục <code>icons/</code>. Hãy tạo mới ở biểu mẫu phía trên!
		</p>
	{:else}
		<div class="table-responsive bg-white rounded shadow-sm border">
			<table class="table-hover table align-middle mb-0">
					<thead class="table-light">
						<tr>
							<th style="width: 80px;">Thumbnail</th>
							<th>Tên file</th>
							<th>Thời gian</th>
							<th>Link MinIO URL</th>
							<th class="text-end">Hành động</th>
						</tr>
					</thead>
					<tbody>
						{#each icons as icon (icon.filename)}
							<tr>
								<td>
									<div class="bg-light border rounded d-flex align-items-center justify-content-center" style="width: 48px; height: 48px;">
										<img
											src={absoluteUrl(icon.url)}
											alt={icon.name}
											class="object-fit-contain"
											style="max-width: 40px; max-height: 40px;"
										/>
									</div>
								</td>
								<td>
									<strong class="text-primary">{icon.name}</strong>
									<div class="text-muted small text-truncate" style="max-width: 200px;">
										{icon.filename}
									</div>
								</td>
								<td class="text-muted small">
									{new Date(icon.timestamp).toLocaleString()}
								</td>
								<td>
									<input
										type="text"
										readonly
										value={absoluteUrl(icon.url)}
										class="form-control form-control-sm text-truncate bg-white font-monospace"
										style="max-width: 220px;"
									/>
								</td>
								<td class="text-end pe-3">
									<button
										onclick={() => copyToClipboard(icon.url)}
										class="btn btn-sm btn-outline-primary me-1"
									>
										Copy Link
									</button>
									<button
										onclick={() => handleDelete(icon.filename)}
										class="btn btn-sm btn-outline-danger"
									>
										Xóa
									</button>
								</td>
							</tr>
						{/each}
					</tbody>
			</table>
		</div>
	{/if}
</main>