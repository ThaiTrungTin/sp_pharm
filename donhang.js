import { 
    sb, viewStates, cache, currentUser, PLACEHOLDER_IMAGE_URL,
    showLoading, showToast, showConfirm, debounce, formatDate, renderPagination, openFilterPopover
} from './app.js';

let selectedYcImageFile = null;
let currentEditingOrderItems = [];
let activeProductDropdown = null;

export function buildDonHangQuery() {
    const state = viewStates['view-don-hang'];
    let query = sb.from('don_hang').select('*', { count: 'exact' });

    if (currentUser && currentUser.phan_quyen === 'User') {
        query = query.eq('yeu_cau', currentUser.ho_ten);
    }

    if (state.searchTerm) {
        const st = `%${state.searchTerm}%`;
        query = query.or(`ma_nx.ilike.${st},yeu_cau.ilike.${st},muc_dich.ilike.${st},ghi_chu.ilike.${st}`);
    }
    if (state.filters.thoi_gian_from) query = query.gte('thoi_gian', state.filters.thoi_gian_from);
    if (state.filters.thoi_gian_to) query = query.lte('thoi_gian', state.filters.thoi_gian_to);
    if (state.filters.loai_don) query = query.eq('loai_don', state.filters.loai_don);
    if (state.filters.ma_nx?.length > 0) query = query.in('ma_nx', state.filters.ma_nx);
    if (state.filters.yeu_cau?.length > 0) query = query.in('yeu_cau', state.filters.yeu_cau);
    
    return query;
}

export async function fetchDonHang(page = viewStates['view-don-hang'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        viewStates['view-don-hang'].currentPage = page;
        const state = viewStates['view-don-hang'];
        state.selected.clear();
        updateDonHangActionButtonsState();

        const { itemsPerPage } = state;
        const isAll = itemsPerPage === 'all';
        const from = isAll ? 0 : (page - 1) * parseInt(itemsPerPage);
        let to = isAll ? -1 : from + parseInt(itemsPerPage) - 1;

        let query = buildDonHangQuery();
        if (!isAll) query = query.range(from, to);
        query = query.order('thoi_gian', { ascending: false });

        const { data, error, count } = await query;
        if (error) {
            console.error("Lỗi fetch đơn hàng:", error);
            showToast("Không thể tải dữ liệu đơn hàng.", 'error');
        } else {
            if(to === -1 || to >= count) to = count > 0 ? count - 1 : 0;
            renderDonHangTable(data);
            renderPagination('dh', count, from, to);
        }
    } finally {
        if (showLoader) showLoading(false);
    }
}

function renderDonHangTable(data) {
    const dhTableBody = document.getElementById('dh-table-body');
    dhTableBody.innerHTML = '';
    if(data && data.length > 0) {
        data.forEach(dh => {
            const isSelected = viewStates['view-don-hang'].selected.has(dh.ma_nx);
            const imageYcHtml = dh.anh_yc_url
                ? `<img src="${dh.anh_yc_url}" alt="Ảnh YC" class="w-12 h-12 object-cover rounded-md thumbnail-image" data-large-src="${dh.anh_yc_url}">`
                : `<span class="text-gray-400 text-xs">Không có</span>`;
            
            const mailHtml = dh.mail_url
                ? `<a href="${dh.mail_url}" target="_blank" class="text-blue-600 hover:text-blue-800" title="Mở mail">
                     <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                   </a>`
                : '';

            dhTableBody.innerHTML += `
                <tr data-id="${dh.ma_nx}" class="cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-100' : ''}">
                    <td class="px-4 py-3"><input type="checkbox" class="dh-select-row" data-id="${dh.ma_nx}" ${isSelected ? 'checked' : ''}></td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <a href="#" class="view-order-link-dh text-blue-600 hover:text-blue-800 hover:underline" data-ma-nx="${dh.ma_nx}">${dh.ma_nx}</a>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(dh.thoi_gian)}</td>
                    <td class="px-6 py-4 whitespace-nowrap"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${dh.loai_don === 'Nhập' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${dh.loai_don}</span></td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${dh.yeu_cau}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 break-words" title="${dh.muc_dich || ''}">${dh.muc_dich || ''}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 break-words" title="${dh.ghi_chu || ''}">${dh.ghi_chu || ''}</td>
                    <td class="px-6 py-4 text-center">${imageYcHtml}</td>
                    <td class="px-6 py-4 text-center">${mailHtml}</td>
                </tr>
            `;
        });
    } else {
        dhTableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4">Không có đơn hàng nào</td></tr>';
    }
    document.getElementById('dh-select-all').checked = false;
    document.querySelectorAll('#view-don-hang .admin-only').forEach(el => {
        el.classList.toggle('hidden', currentUser.phan_quyen !== 'Admin');
    });
}

function updateDonHangActionButtonsState() {
    const selectedCount = viewStates['view-don-hang'].selected.size;
    document.getElementById('dh-btn-edit').disabled = selectedCount !== 1;
    document.getElementById('dh-btn-delete').disabled = selectedCount === 0;
    document.getElementById('dh-btn-print').disabled = selectedCount !== 1;
}

async function handleDonHangSelection(e) {
    const viewLink = e.target.closest('a.view-order-link-dh');
    if (viewLink) {
        e.preventDefault();
        const ma_nx = viewLink.dataset.maNx;
        if (ma_nx) {
            showLoading(true);
            try {
                const { data, error } = await sb.from('don_hang').select('*').eq('ma_nx', ma_nx).single();
                if (error) throw error;
                if (data) openDonHangModal(data, true);
                else showToast(`Không tìm thấy đơn hàng: ${ma_nx}`, 'error');
            } catch (error) {
                showToast('Lỗi tải chi tiết đơn hàng.', 'error');
            } finally {
                showLoading(false);
            }
        }
        return;
    }

    if (e.target.closest('.thumbnail-image')) {
        const imgSrc = e.target.closest('.thumbnail-image').dataset.largeSrc;
        document.getElementById('image-viewer-img').src = imgSrc;
        document.getElementById('image-viewer-modal').classList.remove('hidden');
        return; 
    }

    const row = e.target.closest('tr');
    if (!row || !row.dataset.id || e.target.closest('a')) return;

    const id = row.dataset.id;
    const checkbox = row.querySelector('.dh-select-row');
    const state = viewStates['view-don-hang'];

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
    
    updateDonHangActionButtonsState();
}

async function handleDeleteMultipleDonHang() {
    const selectedIds = [...viewStates['view-don-hang'].selected];
    if (selectedIds.length === 0) return;

    const confirmed = await showConfirm(`Bạn có chắc chắn muốn xóa ${selectedIds.length} đơn hàng đã chọn? Thao tác này sẽ xóa toàn bộ chi tiết liên quan.`);
    if (!confirmed) return;
    
    showLoading(true);
    try {
        const { data: ordersToDelete, error: selectError } = await sb.from('don_hang').select('anh_yc_url').in('ma_nx', selectedIds);
        if (selectError) throw selectError;
        
        const filesToRemove = ordersToDelete
            .map(p => p.anh_yc_url)
            .filter(Boolean)
            .map(url => `public/${url.split('/').pop()}`);
            
        if (filesToRemove.length > 0) {
            await sb.storage.from('anh_yeu_cau').remove(filesToRemove);
        }

        const { error: deleteChiTietError } = await sb.from('chi_tiet').delete().in('ma_nx', selectedIds);
        if (deleteChiTietError) throw deleteChiTietError;
        
        const { error: deleteDonHangError } = await sb.from('don_hang').delete().in('ma_nx', selectedIds);
        if (deleteDonHangError) throw deleteDonHangError;

        showToast(`Đã xóa ${selectedIds.length} đơn hàng.`, 'success');
    } catch (error) {
        showToast(`Lỗi khi xóa đơn hàng: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
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

function updateAllProductSelectsInModal() {
    const requester = document.getElementById('dh-yeu-cau').value;
    const productRows = document.querySelectorAll('.dh-item-row');
    
    const filteredProducts = requester 
        ? cache.sanPhamList.filter(sp => sp.phu_trach === requester)
        : cache.sanPhamList;
    
    productRows.forEach(row => {
        const hiddenInput = row.querySelector('.dh-item-ma-sp');
        const currentVal = hiddenInput.value;

        if (currentVal && !filteredProducts.some(p => p.ma_sp === currentVal)) {
            hiddenInput.value = '';
            row.querySelector('.dh-item-sp-search').value = '';
            row.querySelector('.dh-item-ten-sp').value = '';
            updateDonHangItemInfo(row);
        }
    });
}

function updateDonHangItemInfo(row) {
    const maSp = row.querySelector('.dh-item-ma-sp').value;
    const soLuongInput = row.querySelector('.dh-item-so-luong');
    const soLuong = parseInt(soLuongInput.value) || 0;
    const infoDiv = row.querySelector('.dh-item-info');
    const loaiDon = document.getElementById('dh-loai-don-modal').value;
    const isEdit = !!document.getElementById('don-hang-edit-mode-ma-nx').value;

    const sp = cache.sanPhamList.find(p => p.ma_sp === maSp);
    if (!sp) {
        infoDiv.textContent = 'Tồn kho: --';
        return;
    }

    let tonKhoHienTai = sp.ton_cuoi;
    
    if (isEdit) {
        const originalItem = currentEditingOrderItems.find(item => item.ma_sp === maSp);
        if (originalItem) {
            if (loaiDon === 'Nhập') {
                tonKhoHienTai -= originalItem.so_luong;
            } else {
                tonKhoHienTai += originalItem.so_luong;
            }
        }
    }
    
    let infoText = `Tồn kho: ${tonKhoHienTai}`;
    if (soLuong > 0) {
        if (loaiDon === 'Nhập') {
            infoText += ` | Sau nhập: ${tonKhoHienTai + soLuong}`;
        } else {
            const conLai = tonKhoHienTai - soLuong;
            infoText += ` | Sau xuất: <span class="${conLai < 0 ? 'text-red-600 font-bold' : ''}">${conLai}</span>`;
        }
    }
    infoDiv.innerHTML = infoText;
}

function closeActiveProductDropdown() {
    if(activeProductDropdown) {
        activeProductDropdown.classList.add('hidden');
        activeProductDropdown = null;
    }
}

export async function openDonHangModal(dh = null, readOnly = false) {
    const modal = document.getElementById('don-hang-modal');
    const form = document.getElementById('don-hang-form');
    form.reset();
    document.getElementById('dh-item-list').innerHTML = '';
    selectedYcImageFile = null; 
    currentEditingOrderItems = [];

    const isEdit = !!dh;
    const title = readOnly 
        ? `Chi Tiết Đơn Hàng: ${dh.ma_nx}` 
        : (isEdit ? `Sửa Đơn Hàng: ${dh.ma_nx}` : 'Tạo Đơn Hàng Mới');
    document.getElementById('don-hang-modal-title').textContent = title;
    document.getElementById('don-hang-edit-mode-ma-nx').value = isEdit ? dh.ma_nx : '';
    document.getElementById('add-dh-item-btn').classList.toggle('hidden', readOnly);
    document.getElementById('save-dh-btn').classList.toggle('hidden', readOnly);

    const yeuCauSelect = document.getElementById('dh-yeu-cau');
    yeuCauSelect.innerHTML = '';
    cache.phuTrachList.forEach(name => yeuCauSelect.add(new Option(name, name)));

    const loaiDonSelect = document.getElementById('dh-loai-don-modal');
    const maNxInput = document.getElementById('dh-ma-nx');
    
    const imagePreview = document.getElementById('dh-modal-image-preview');
    const removeImageBtn = document.getElementById('dh-modal-remove-image-btn');
    const currentImageUrlInput = document.getElementById('dh-modal-anh-yc-url-hien-tai');
    
    if (isEdit) {
        document.getElementById('dh-thoi-gian').value = new Date(dh.thoi_gian).toISOString().split('T')[0];
        loaiDonSelect.value = dh.loai_don;
        yeuCauSelect.value = dh.yeu_cau;
        maNxInput.value = dh.ma_nx;
        document.getElementById('dh-muc-dich').value = dh.muc_dich || '';
        document.getElementById('dh-ghi-chu').value = dh.ghi_chu || '';
        document.getElementById('dh-mail-url').value = dh.mail_url || '';
        currentImageUrlInput.value = dh.anh_yc_url || '';
        imagePreview.src = dh.anh_yc_url || PLACEHOLDER_IMAGE_URL;

        showLoading(true);
        const { data: items, error } = await sb.from('chi_tiet').select('*').eq('ma_nx', dh.ma_nx);
        showLoading(false);
        if (error) {
            showToast("Không thể tải chi tiết đơn hàng.", 'error');
            return;
        }
        
        currentEditingOrderItems = items;
        
        if (items.length > 0) {
            items.forEach(item => addDonHangItemRow(item));
        } else {
             addDonHangItemRow();
        }

    } else {
        document.getElementById('dh-thoi-gian').valueAsDate = new Date();
        const generateMaNX = () => {
            const prefix = loaiDonSelect.value === 'Nhập' ? 'IN' : 'OUT';
            maNxInput.value = `${prefix}.JNJ.${Math.floor(100000 + Math.random() * 900000)}`;
        };
        generateMaNX();
        loaiDonSelect.onchange = generateMaNX;
        addDonHangItemRow();
        currentImageUrlInput.value = '';
        imagePreview.src = PLACEHOLDER_IMAGE_URL;
    }

    removeImageBtn.classList.toggle('hidden', !currentImageUrlInput.value && !selectedYcImageFile);
    
    const formElements = form.querySelectorAll('input, select, textarea, button');
    formElements.forEach(el => {
        if (el.id !== 'cancel-dh-btn') {
            el.disabled = readOnly;
        }
    });
    
    modal.classList.remove('hidden');
}

function addDonHangItemRow(item = null) {
    const itemList = document.getElementById('dh-item-list');
    const row = document.createElement('div');
    row.className = 'grid grid-cols-10 gap-4 items-start dh-item-row';
    row.innerHTML = `
        <div class="col-span-3 relative">
            <input type="text" class="dh-item-sp-search w-full border rounded-md p-2" placeholder="Tìm Mã SP...">
            <input type="hidden" class="dh-item-ma-sp" required>
            <div class="dh-item-sp-dropdown absolute z-20 w-full bg-white border rounded-md mt-1 max-h-48 overflow-y-auto hidden shadow-lg"></div>
        </div>
        <div class="col-span-5">
            <input type="text" class="dh-item-ten-sp w-full border rounded-md p-2 bg-gray-100" readonly placeholder="Tên SP">
        </div>
        <div class="col-span-1">
            <input type="number" min="0" class="dh-item-so-luong w-full border rounded-md p-2" required placeholder="SL">
        </div>
        <div class="col-span-1 text-right">
            <button type="button" class="remove-dh-item-btn text-red-500 hover:text-red-700">Xóa</button>
        </div>
        <div class="col-span-10 text-xs text-gray-600 mt-1 dh-item-info">Tồn kho: --</div>
    `;
    itemList.appendChild(row);
    
    if (item) {
        const spData = cache.sanPhamList.find(sp => sp.ma_sp === item.ma_sp);
        row.querySelector('.dh-item-sp-search').value = item.ma_sp;
        row.querySelector('.dh-item-ma-sp').value = item.ma_sp;
        row.querySelector('.dh-item-ten-sp').value = spData ? spData.ten_sp : 'Không rõ';
        row.querySelector('.dh-item-so-luong').value = item.so_luong;
    }
    
    updateDonHangItemInfo(row);
}

async function handleSaveDonHang(e) {
    e.preventDefault();
    const ma_nx_orig = document.getElementById('don-hang-edit-mode-ma-nx').value;
    const isEdit = !!ma_nx_orig;
    let anh_yc_url = document.getElementById('dh-modal-anh-yc-url-hien-tai').value;
    const old_anh_yc_url = isEdit ? anh_yc_url : null;

    const donHangData = {
        thoi_gian: document.getElementById('dh-thoi-gian').value,
        loai_don: document.getElementById('dh-loai-don-modal').value,
        yeu_cau: document.getElementById('dh-yeu-cau').value,
        ma_nx: document.getElementById('dh-ma-nx').value,
        muc_dich: document.getElementById('dh-muc-dich').value,
        ghi_chu: document.getElementById('dh-ghi-chu').value,
        mail_url: document.getElementById('dh-mail-url').value.trim(),
    };

    const chiTietDataList = [];
    const itemRows = document.querySelectorAll('.dh-item-row');
    if (itemRows.length === 0) {
        showToast("Vui lòng thêm ít nhất một sản phẩm.", 'error');
        return;
    }

    for (const row of itemRows) {
        const ma_sp = row.querySelector('.dh-item-ma-sp').value;
        const so_luong_val = parseInt(row.querySelector('.dh-item-so-luong').value);

        if (!ma_sp || isNaN(so_luong_val) || so_luong_val < 0) {
            showToast("Vui lòng điền đầy đủ Mã SP và Số lượng hợp lệ (>= 0) cho tất cả sản phẩm.", 'error');
            return;
        }
        
        const sp = cache.sanPhamList.find(p => p.ma_sp === ma_sp);
        if (!sp) {
            showToast(`Sản phẩm với mã "${ma_sp}" không hợp lệ.`, 'error');
            return;
        }

        let tonKhoTruocGiaoDich = sp.ton_cuoi;
        if (isEdit) {
             const originalItem = currentEditingOrderItems.find(item => item.ma_sp === ma_sp);
             if (originalItem) {
                tonKhoTruocGiaoDich += (donHangData.loai_don === 'Nhập' ? -originalItem.so_luong : originalItem.so_luong);
             }
        }

        if (donHangData.loai_don === 'Xuất' && so_luong_val > tonKhoTruocGiaoDich) {
            showToast(`Số lượng xuất của SP "${ma_sp}" vượt quá tồn kho (${tonKhoTruocGiaoDich}).`, 'error');
            return;
        }

        chiTietDataList.push({
            id: crypto.randomUUID(),
            ma_nx: donHangData.ma_nx,
            thoi_gian: donHangData.thoi_gian,
            loai: donHangData.loai_don,
            ma_sp,
            ten_sp: sp.ten_sp,
            so_luong: so_luong_val,
            muc_dich: donHangData.muc_dich,
            phu_trach: sp.phu_trach,
        });
    }

    showLoading(true);
    try {
        if (selectedYcImageFile) {
            const safeFileName = sanitizeFileName(selectedYcImageFile.name);
            const filePath = `public/${Date.now()}-${safeFileName}`;

            const { error: uploadError } = await sb.storage.from('anh_yeu_cau').upload(filePath, selectedYcImageFile);
            if (uploadError) throw new Error(`Lỗi tải ảnh YC: ${uploadError.message}`);

            const { data: urlData } = sb.storage.from('anh_yeu_cau').getPublicUrl(filePath);
            anh_yc_url = urlData.publicUrl;

            if (isEdit && old_anh_yc_url) {
                const oldFileName = old_anh_yc_url.split('/').pop();
                await sb.storage.from('anh_yeu_cau').remove([`public/${oldFileName}`]);
            }
        } else if (!anh_yc_url && old_anh_yc_url) {
            const oldFileName = old_anh_yc_url.split('/').pop();
            await sb.storage.from('anh_yeu_cau').remove([`public/${oldFileName}`]);
        }
        donHangData.anh_yc_url = anh_yc_url;

        if (isEdit) {
            const { error: dhError } = await sb.from('don_hang').update(donHangData).eq('ma_nx', ma_nx_orig);
            if (dhError) throw dhError;
            
            const { error: deleteError } = await sb.from('chi_tiet').delete().eq('ma_nx', ma_nx_orig);
            if (deleteError) throw deleteError;

            const { error: insertError } = await sb.from('chi_tiet').insert(chiTietDataList);
            if (insertError) throw insertError;

        } else {
            const { error: dhError } = await sb.from('don_hang').insert(donHangData);
            if (dhError) throw dhError;
            
            const { error: ctError } = await sb.from('chi_tiet').insert(chiTietDataList);
            if (ctError) {
                await sb.from('don_hang').delete().eq('ma_nx', donHangData.ma_nx);
                throw ctError;
            }
        }

        showToast("Lưu đơn hàng thành công!", 'success');
        document.getElementById('don-hang-modal').classList.add('hidden');
    } catch (error) {
        showToast(`Lỗi lưu đơn hàng: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

export function initDonHangView() {
    document.getElementById('dh-search').addEventListener('input', debounce(() => {
        viewStates['view-don-hang'].searchTerm = document.getElementById('dh-search').value;
        fetchDonHang(1);
    }, 500));

    ['dh-filter-thoi-gian-from', 'dh-filter-thoi-gian-to', 'dh-filter-loai-don'].forEach(id => {
        document.getElementById(id).addEventListener('change', e => {
            const filterKey = id.replace('dh-filter-', '').replace(/-/g, '_');
            viewStates['view-don-hang'].filters[filterKey] = e.target.value;
            fetchDonHang(1);
        });
    });

    document.getElementById('dh-reset-filters').addEventListener('click', () => {
        ['dh-search', 'dh-filter-thoi-gian-from', 'dh-filter-thoi-gian-to', 'dh-filter-loai-don'].forEach(id => document.getElementById(id).value = '');
        viewStates['view-don-hang'].searchTerm = '';
        viewStates['view-don-hang'].filters = { thoi_gian_from: '', thoi_gian_to: '', ma_nx: [], loai_don: '', yeu_cau: [] };
        document.querySelectorAll('#view-don-hang .filter-btn').forEach(btn => {
            const btnBaseText = btn.textContent.split('--')[1].trim().split(' ')[0];
            btn.innerHTML = `-- ${btnBaseText} --`;
        });
        fetchDonHang(1);
    });

    document.getElementById('view-don-hang').addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) openFilterPopover(btn, 'view-don-hang');
    });

    document.getElementById('dh-table-body').addEventListener('click', handleDonHangSelection);
    document.getElementById('dh-select-all').addEventListener('click', (e) => {
        const isChecked = e.target.checked;
        document.querySelectorAll('.dh-select-row').forEach(cb => {
            if(cb.checked !== isChecked) cb.click();
        });
    });

    document.getElementById('dh-btn-add').addEventListener('click', () => openDonHangModal(null, false));
    document.getElementById('dh-btn-edit').addEventListener('click', async () => {
        const ma_nx = [...viewStates['view-don-hang'].selected][0];
        const { data } = await sb.from('don_hang').select('*').eq('ma_nx', ma_nx).single();
        if(data) openDonHangModal(data, false);
    });
    document.getElementById('dh-btn-delete').addEventListener('click', handleDeleteMultipleDonHang);

    document.getElementById('dh-btn-print').addEventListener('click', () => {
        const selectedIds = [...viewStates['view-don-hang'].selected];
        if (selectedIds.length === 1) {
            const printUrl = `print.html?ma_nx=${encodeURIComponent(selectedIds[0])}`;
            window.open(printUrl, '_blank');
        }
    });

    document.getElementById('don-hang-form').addEventListener('submit', handleSaveDonHang);
    document.getElementById('cancel-dh-btn').addEventListener('click', () => document.getElementById('don-hang-modal').classList.add('hidden'));
    document.getElementById('add-dh-item-btn').addEventListener('click', () => addDonHangItemRow());
    
    const processYcImageFile = (file) => {
        if (file && file.type.startsWith('image/')) {
            selectedYcImageFile = file;
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('dh-modal-image-preview').src = event.target.result;
                document.getElementById('dh-modal-remove-image-btn').classList.remove('hidden');
                document.getElementById('dh-modal-anh-yc-url-hien-tai').value = 'temp-new-image';
            };
            reader.readAsDataURL(file);
        } else {
            showToast('Vui lòng chỉ chọn/dán file hình ảnh.', 'error');
        }
    };

    document.getElementById('dh-modal-image-upload').addEventListener('change', (e) => processYcImageFile(e.target.files[0]));
    document.getElementById('dh-image-paste-area').addEventListener('paste', (e) => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                processYcImageFile(items[i].getAsFile());
                return;
            }
        }
        showToast('Không tìm thấy hình ảnh trong clipboard.', 'info');
    });

    document.getElementById('dh-modal-remove-image-btn').addEventListener('click', () => {
        selectedYcImageFile = null;
        document.getElementById('dh-modal-image-upload').value = '';
        document.getElementById('dh-modal-image-preview').src = PLACEHOLDER_IMAGE_URL;
        document.getElementById('dh-modal-remove-image-btn').classList.add('hidden');
        document.getElementById('dh-modal-anh-yc-url-hien-tai').value = '';
    });

    document.getElementById('dh-yeu-cau').addEventListener('change', updateAllProductSelectsInModal);
    document.getElementById('dh-loai-don-modal').addEventListener('change', () => {
        document.querySelectorAll('.dh-item-row').forEach(row => updateDonHangItemInfo(row));
    });

    const itemList = document.getElementById('dh-item-list');
    
    itemList.addEventListener('click', e => {
        if (e.target.classList.contains('remove-dh-item-btn')) {
            if (document.querySelectorAll('.dh-item-row').length > 1) {
                e.target.closest('.dh-item-row').remove();
            } else {
                showToast("Phải có ít nhất một sản phẩm.", 'info');
            }
        }
        
        if (e.target.closest('.sp-dropdown-item')) {
            const itemDiv = e.target.closest('.sp-dropdown-item');
            const row = itemDiv.closest('.dh-item-row');
            const sp = JSON.parse(itemDiv.dataset.sp);
            
            row.querySelector('.dh-item-sp-search').value = sp.ma_sp;
            row.querySelector('.dh-item-ma-sp').value = sp.ma_sp;
            row.querySelector('.dh-item-ten-sp').value = sp.ten_sp;
            
            closeActiveProductDropdown();
            updateDonHangItemInfo(row);
        }
    });

    itemList.addEventListener('input', e => {
        const target = e.target;
        if (target.classList.contains('dh-item-so-luong')) {
            updateDonHangItemInfo(target.closest('.dh-item-row'));
        } else if (target.classList.contains('dh-item-sp-search')) {
            const row = target.closest('.dh-item-row');
            const dropdown = row.querySelector('.dh-item-sp-dropdown');
            const searchTerm = target.value.toLowerCase();
            const requester = document.getElementById('dh-yeu-cau').value;

            const filteredProducts = cache.sanPhamList.filter(sp => {
                const matchesRequester = requester ? sp.phu_trach === requester : true;
                const matchesSearch = sp.ma_sp.toLowerCase().includes(searchTerm);
                return matchesRequester && matchesSearch;
            });
            
            dropdown.innerHTML = '';
            if (filteredProducts.length > 0) {
                filteredProducts.forEach(sp => {
                    const itemDiv = document.createElement('div');
                    itemDiv.className = 'p-2 hover:bg-blue-100 cursor-pointer sp-dropdown-item';
                    itemDiv.textContent = sp.ma_sp;
                    itemDiv.dataset.sp = JSON.stringify(sp);
                    dropdown.appendChild(itemDiv);
                });
                dropdown.classList.remove('hidden');
                activeProductDropdown = dropdown;
            } else {
                dropdown.classList.add('hidden');
            }
            
            if (!cache.sanPhamList.some(sp => sp.ma_sp === target.value)) {
                row.querySelector('.dh-item-ma-sp').value = '';
                row.querySelector('.dh-item-ten-sp').value = '';
                updateDonHangItemInfo(row);
            }
        }
    });

    document.getElementById('dh-items-per-page').addEventListener('change', (e) => {
        viewStates['view-don-hang'].itemsPerPage = e.target.value;
        fetchDonHang(1);
    });
    document.getElementById('dh-prev-page').addEventListener('click', () => fetchDonHang(viewStates['view-don-hang'].currentPage - 1));
    document.getElementById('dh-next-page').addEventListener('click', () => fetchDonHang(viewStates['view-don-hang'].currentPage + 1));

    document.body.addEventListener('click', e => {
        if (activeProductDropdown && !activeProductDropdown.closest('.relative').contains(e.target)) {
            closeActiveProductDropdown();
        }
    });
}