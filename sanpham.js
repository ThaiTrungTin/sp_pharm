import { 
    sb, viewStates, cache, currentUser, PLACEHOLDER_IMAGE_URL,
    showLoading, showToast, showConfirm, debounce, renderPagination, openFilterPopover 
} from './app.js';

let selectedImageFile = null;

export function buildSanPhamQuery(isExport = false) {
    const state = viewStates['view-san-pham'];
    const selectColumns = isExport 
        ? 'ma_sp, ten_sp, ton_dau, nhap, xuat, ton_cuoi, phu_trach' 
        : '*, hinh_anh_url';
    let query = sb.from('v_san_pham_chi_tiet').select(selectColumns, { count: 'exact' });

    if (currentUser && currentUser.phan_quyen === 'User') {
        query = query.eq('phu_trach', currentUser.ho_ten);
    }

    if (state.searchTerm) query = query.or(`ma_sp.ilike.%${state.searchTerm}%,ten_sp.ilike.%${state.searchTerm}%,phu_trach.ilike.%${state.searchTerm}%`);
    if (state.filters.ma_sp?.length > 0) query = query.in('ma_sp', state.filters.ma_sp);
    if (state.filters.ten_sp?.length > 0) query = query.in('ten_sp', state.filters.ten_sp);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    if (state.filters.ton_kho) {
        if(state.filters.ton_kho === 'con_hang') query = query.gt('ton_cuoi', 0);
        else query = query.eq('ton_cuoi', 0);
    }
    return query;
}

export async function fetchSanPham(page = viewStates['view-san-pham'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-san-pham'].currentPage = page;
        const state = viewStates['view-san-pham'];
        state.selected.clear();
        updateSanPhamActionButtonsState();

        const { itemsPerPage } = state;
        const isAll = itemsPerPage === 'all';
        const from = isAll ? 0 : (page - 1) * parseInt(itemsPerPage);
        let to = isAll ? -1 : from + parseInt(itemsPerPage) - 1;

        let query = buildSanPhamQuery();
        if (!isAll) query = query.range(from, to);
        query = query.order('ma_sp', { ascending: true });

        const { data, error, count } = await query;
        if (error) {
            console.error("Lỗi fetch sản phẩm:", error);
            showToast("Không thể tải dữ liệu sản phẩm.", 'error');
        } else {
            if(to === -1 || to >= count) to = count > 0 ? count - 1 : 0;
            renderSanPhamTable(data);
            renderPagination('sp', count, from, to);
        }
    } finally {
        if (showLoader) showLoading(false);
    }
}

function renderSanPhamTable(data) {
    const spTableBody = document.getElementById('sp-table-body');
    spTableBody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(sp => {
            const isSelected = viewStates['view-san-pham'].selected.has(sp.ma_sp);
            const imageUrl = sp.hinh_anh_url;
            const imageHtml = imageUrl 
                ? `<img src="${imageUrl}" alt="${sp.ten_sp}" class="w-12 h-12 object-cover rounded-md thumbnail-image" data-large-src="${imageUrl}">`
                : `<div class="w-12 h-12 bg-gray-200 rounded-md flex items-center justify-center text-gray-400">
                     <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
                   </div>`;

            spTableBody.innerHTML += `
                <tr data-id="${sp.ma_sp}" class="cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-100' : ''}">
                    <td class="px-4 py-1 border border-gray-300 text-center"><input type="checkbox" class="sp-select-row" data-id="${sp.ma_sp}" ${isSelected ? 'checked' : ''}></td>
                    <td class="px-4 py-1 border border-gray-300 flex justify-center items-center">${imageHtml}</td>
                    <td class="px-6 py-1 text-sm font-medium text-gray-900 border border-gray-300">${sp.ma_sp}</td>
                    <td class="px-6 py-1 text-sm text-gray-600 break-words border border-gray-300">${sp.ten_sp}</td>
                    <td class="px-6 py-1 text-sm font-bold text-gray-900 border border-gray-300 text-center">${sp.ton_dau}</td>
                    <td class="px-6 py-1 text-sm font-bold text-green-600 border border-gray-300 text-center">${sp.nhap}</td>
                    <td class="px-6 py-1 text-sm font-bold text-red-600 border border-gray-300 text-center">${sp.xuat}</td>
                    <td class="px-6 py-1 text-sm font-bold ${sp.ton_cuoi > 0 ? 'text-green-600' : 'text-red-600'} border border-gray-300 text-center">${sp.ton_cuoi}</td>
                    <td class="px-6 py-1 text-sm text-gray-600 border border-gray-300 text-center">${sp.phu_trach || ''}</td>
                </tr>
            `;
        });
    } else {
        spTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4">Không có dữ liệu</td></tr>';
    }
    document.getElementById('sp-select-all').checked = false;
}

function updateSanPhamActionButtonsState() {
    const selectedCount = viewStates['view-san-pham'].selected.size;
    document.getElementById('sp-btn-edit').disabled = selectedCount !== 1;
    document.getElementById('sp-btn-delete').disabled = selectedCount === 0;
}

function handleSanPhamSelection(e) {
    if (e.target.closest('.thumbnail-image')) {
        const imgSrc = e.target.closest('.thumbnail-image').dataset.largeSrc;
        document.getElementById('image-viewer-img').src = imgSrc;
        document.getElementById('image-viewer-modal').classList.remove('hidden');
        return;
    }

    const row = e.target.closest('tr');
    if (!row || !row.dataset.id) return;

    const id = row.dataset.id;
    const checkbox = row.querySelector('.sp-select-row');
    const state = viewStates['view-san-pham'];

    if (e.target.type !== 'checkbox') {
        checkbox.checked = !checkbox.checked;
    }

    if (checkbox.checked) {
        state.selected.add(id);
        row.classList.add('bg-blue-100');
    } else {
        state.selected.delete(id);
        row.classList.remove('bg-blue-100');
    }
    
    updateSanPhamActionButtonsState();
}

function openSanPhamModal(sp = null) {
    const modal = document.getElementById('san-pham-modal');
    const form = document.getElementById('san-pham-form');
    form.reset();
    selectedImageFile = null;

    document.getElementById('san-pham-modal-title').textContent = sp ? 'Sửa Sản Phẩm' : 'Thêm Sản Phẩm Mới';
    document.getElementById('sp-modal-ma-sp').readOnly = !!sp;
    document.getElementById('sp-modal-ma-sp').classList.toggle('bg-gray-200', !!sp);
    document.getElementById('sp-edit-mode-ma-sp').value = sp ? sp.ma_sp : '';

    const imagePreview = document.getElementById('sp-modal-image-preview');
    const removeImageBtn = document.getElementById('sp-modal-remove-image-btn');
    const currentImageUrlInput = document.getElementById('sp-modal-hinh-anh-url-hien-tai');

    if (sp) {
        document.getElementById('sp-modal-ma-sp').value = sp.ma_sp;
        document.getElementById('sp-modal-ten-sp').value = sp.ten_sp;
        document.getElementById('sp-modal-ton-dau').value = sp.ton_dau;
        document.getElementById('sp-modal-phu-trach').value = sp.phu_trach || '';
        currentImageUrlInput.value = sp.hinh_anh_url || '';
        imagePreview.src = sp.hinh_anh_url || PLACEHOLDER_IMAGE_URL;
    } else {
        currentImageUrlInput.value = '';
        imagePreview.src = PLACEHOLDER_IMAGE_URL;
    }

    removeImageBtn.classList.toggle('hidden', !currentImageUrlInput.value && !selectedImageFile);
    
    const datalist = document.getElementById('phu-trach-list');
    datalist.innerHTML = '';
    cache.phuTrachList.forEach(name => {
        datalist.innerHTML += `<option value="${name}">`;
    });

    modal.classList.remove('hidden');
}

function sanitizeFileName(fileName) {
    const lastDot = fileName.lastIndexOf('.');
    const nameWithoutExt = fileName.slice(0, lastDot);
    const ext = fileName.slice(lastDot);

    return nameWithoutExt
        .normalize('NFD') 
        .replace(/[\u0300-\u036f]/g, '') 
        .toLowerCase() 
        .replace(/\s+/g, '-') 
        .replace(/[^a-z0-9-]/g, '') + 
        ext; 
}

async function handleSaveSanPham(e) {
    e.preventDefault();
    const ma_sp_orig = document.getElementById('sp-edit-mode-ma-sp').value;
    const isEdit = !!ma_sp_orig;
    let hinh_anh_url = document.getElementById('sp-modal-hinh-anh-url-hien-tai').value;
    const old_hinh_anh_url = isEdit ? hinh_anh_url : null;
    
    const sanPhamData = {
        ma_sp: document.getElementById('sp-modal-ma-sp').value.trim(),
        ten_sp: document.getElementById('sp-modal-ten-sp').value.trim(),
        ton_dau: parseInt(document.getElementById('sp-modal-ton-dau').value) || 0,
        phu_trach: document.getElementById('sp-modal-phu-trach').value.trim()
    };

    if (!sanPhamData.ma_sp || !sanPhamData.ten_sp) {
        showToast("Mã sản phẩm và Tên sản phẩm là bắt buộc.", 'error');
        return;
    }

    showLoading(true);
    try {
        if (selectedImageFile) {
            const safeFileName = sanitizeFileName(selectedImageFile.name);
            const filePath = `public/${Date.now()}-${safeFileName}`;

            const { error: uploadError } = await sb.storage.from('hinh_anh_san_pham').upload(filePath, selectedImageFile);
            if (uploadError) throw new Error(`Lỗi tải ảnh lên: ${uploadError.message}`);

            const { data: urlData } = sb.storage.from('hinh_anh_san_pham').getPublicUrl(filePath);
            hinh_anh_url = urlData.publicUrl;

            if (isEdit && old_hinh_anh_url) {
                const oldFileName = old_hinh_anh_url.split('/').pop();
                await sb.storage.from('hinh_anh_san_pham').remove([`public/${oldFileName}`]);
            }
        } 
        else if (!hinh_anh_url && old_hinh_anh_url) {
             const oldFileName = old_hinh_anh_url.split('/').pop();
             await sb.storage.from('hinh_anh_san_pham').remove([`public/${oldFileName}`]);
        }

        sanPhamData.hinh_anh_url = hinh_anh_url;

        let error;
        if (isEdit) {
            const { error: updateError } = await sb.from('san_pham').update(sanPhamData).eq('ma_sp', ma_sp_orig);
            error = updateError;
        } else {
            const { error: insertError } = await sb.from('san_pham').insert(sanPhamData);
            error = insertError;
        }
        if (error) throw error;
        showToast(`Lưu sản phẩm thành công!`, 'success');
        document.getElementById('san-pham-modal').classList.add('hidden');
    } catch (error) {
        console.error("Lỗi lưu sản phẩm:", error);
        if (error.code === '23505') {
            showToast(`Mã sản phẩm "${sanPhamData.ma_sp}" đã tồn tại.`, 'error');
        } else {
            showToast(`Lỗi khi lưu sản phẩm: ${error.message}`, 'error');
        }
    } finally {
        showLoading(false);
    }
}

async function handleDeleteMultipleSanPham() {
    const selectedIds = [...viewStates['view-san-pham'].selected];
    if (selectedIds.length === 0) return;
    
    const confirmed = await showConfirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} sản phẩm đã chọn?`);
    if (!confirmed) return;

    showLoading(true);
    try {
        const { data: usedProducts, error: checkError } = await sb.from('chi_tiet').select('ma_sp').in('ma_sp', selectedIds);
        if (checkError) throw checkError;
        
        if (usedProducts.length > 0) {
            const usedMaSp = [...new Set(usedProducts.map(p => p.ma_sp))];
            throw new Error(`Không thể xóa vì các SP sau đã được sử dụng trong đơn hàng: ${usedMaSp.join(', ')}`);
        }
        
        const { data: productsToDelete, error: selectError } = await sb.from('san_pham').select('hinh_anh_url').in('ma_sp', selectedIds);
        if (selectError) throw selectError;
        
        const filesToRemove = productsToDelete
            .map(p => p.hinh_anh_url)
            .filter(Boolean)
            .map(url => `public/${url.split('/').pop()}`);
            
        if (filesToRemove.length > 0) {
            await sb.storage.from('hinh_anh_san_pham').remove(filesToRemove);
        }

        const { error: deleteError } = await sb.from('san_pham').delete().in('ma_sp', selectedIds);
        if (deleteError) throw deleteError;

        showToast(`Đã xóa ${selectedIds.length} sản phẩm thành công.`, 'success');
    } catch (error) {
        console.error("Lỗi xóa sản phẩm:", error);
        showToast(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

export function initSanPhamView() {
    document.getElementById('sp-search').addEventListener('input', debounce(() => {
        viewStates['view-san-pham'].searchTerm = document.getElementById('sp-search').value;
        fetchSanPham(1);
    }, 500));
    
    document.getElementById('sp-filter-ton-kho').addEventListener('change', (e) => {
        viewStates['view-san-pham'].filters.ton_kho = e.target.value;
        fetchSanPham(1);
    });

    document.getElementById('sp-reset-filters').addEventListener('click', () => {
        document.getElementById('sp-search').value = '';
        document.getElementById('sp-filter-ton-kho').value = '';
        viewStates['view-san-pham'].searchTerm = '';
        viewStates['view-san-pham'].filters = { ma_sp: [], ten_sp: [], phu_trach: [], ton_kho: '' };
        document.querySelectorAll('#view-san-pham .filter-btn').forEach(btn => {
            const btnBaseText = btn.textContent.split('--')[1].trim().split(' ')[0];
            btn.innerHTML = `-- ${btnBaseText} --`;
        });
        fetchSanPham(1);
    });

    document.getElementById('view-san-pham').addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) openFilterPopover(btn, 'view-san-pham');
    });

    document.getElementById('sp-table-body').addEventListener('click', handleSanPhamSelection);
    document.getElementById('sp-select-all').addEventListener('click', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.sp-select-row').forEach(cb => {
            if(cb.checked !== isChecked) cb.click();
        });
    });

    document.getElementById('sp-btn-add').addEventListener('click', () => openSanPhamModal());
    document.getElementById('sp-btn-edit').addEventListener('click', async () => {
        const ma_sp = [...viewStates['view-san-pham'].selected][0];
        const { data } = await sb.from('san_pham').select('*, hinh_anh_url').eq('ma_sp', ma_sp).single();
        if(data) openSanPhamModal(data);
    });
    document.getElementById('sp-btn-delete').addEventListener('click', handleDeleteMultipleSanPham);
    document.getElementById('san-pham-form').addEventListener('submit', handleSaveSanPham);
    document.getElementById('cancel-sp-btn').addEventListener('click', () => document.getElementById('san-pham-modal').classList.add('hidden'));
    
    const processSpImageFile = (file) => {
        if (file && file.type.startsWith('image/')) {
            selectedImageFile = file;
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('sp-modal-image-preview').src = event.target.result;
                document.getElementById('sp-modal-remove-image-btn').classList.remove('hidden');
                document.getElementById('sp-modal-hinh-anh-url-hien-tai').value = 'temp-new-image';
            };
            reader.readAsDataURL(file);
        } else {
            showToast('Vui lòng chỉ chọn/dán file hình ảnh.', 'error');
        }
    };

    document.getElementById('sp-modal-image-upload').addEventListener('change', (e) => processSpImageFile(e.target.files[0]));
    document.getElementById('sp-image-paste-area').addEventListener('paste', (e) => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                processSpImageFile(items[i].getAsFile());
                return;
            }
        }
        showToast('Không tìm thấy hình ảnh trong clipboard.', 'info');
    });

    document.getElementById('sp-modal-remove-image-btn').addEventListener('click', () => {
        selectedImageFile = null;
        document.getElementById('sp-modal-image-upload').value = '';
        document.getElementById('sp-modal-image-preview').src = PLACEHOLDER_IMAGE_URL;
        document.getElementById('sp-modal-remove-image-btn').classList.add('hidden');
        document.getElementById('sp-modal-hinh-anh-url-hien-tai').value = '';
    });

    document.getElementById('close-image-viewer-btn').addEventListener('click', () => {
        document.getElementById('image-viewer-modal').classList.add('hidden');
    });

    document.getElementById('sp-items-per-page').addEventListener('change', (e) => {
        viewStates['view-san-pham'].itemsPerPage = e.target.value;
        fetchSanPham(1);
    });
    document.getElementById('sp-prev-page').addEventListener('click', () => fetchSanPham(viewStates['view-san-pham'].currentPage - 1));
    document.getElementById('sp-next-page').addEventListener('click', () => fetchSanPham(viewStates['view-san-pham'].currentPage + 1));
}