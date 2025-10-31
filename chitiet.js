import { 
    sb, viewStates, currentUser,
    showLoading, showToast, formatDate, debounce, renderPagination, openFilterPopover, navigateToSanPham
} from './app.js';
import { openDonHangModal } from './donhang.js';

export function buildChiTietQuery(selectString = '*', countOption = null) {
    const state = viewStates['view-chi-tiet'];
    let query = sb.from('chi_tiet').select(selectString, countOption ? { count: countOption } : undefined);

    if (currentUser && currentUser.phan_quyen === 'User') {
        query = query.eq('phu_trach', currentUser.ho_ten);
    }

    if (state.searchTerm) {
        const st = `%${state.searchTerm}%`;
        query = query.or(`ma_nx.ilike.${st},ma_sp.ilike.${st},ten_sp.ilike.${st},muc_dich.ilike.${st},phu_trach.ilike.${st}`);
    }
    if (state.filters.thoi_gian_from) query = query.gte('thoi_gian', state.filters.thoi_gian_from);
    if (state.filters.thoi_gian_to) query = query.lte('thoi_gian', state.filters.thoi_gian_to);
    if (state.filters.loai_don) query = query.eq('loai', state.filters.loai_don);
    if (state.filters.ma_nx?.length > 0) query = query.in('ma_nx', state.filters.ma_nx);
    if (state.filters.ma_sp?.length > 0) query = query.in('ma_sp', state.filters.ma_sp);
    if (state.filters.ten_sp?.length > 0) query = query.in('ten_sp', state.filters.ten_sp);
    if (state.filters.phu_trach?.length > 0) query = query.in('phu_trach', state.filters.phu_trach);
    
    return query;
}

async function updateChiTietSummary() {
    const summaryEl = document.getElementById('ct-summary-info');
    summaryEl.textContent = 'Đang tính toán...';
    try {
        let query = buildChiTietQuery('loai, so_luong');
        const { data, error } = await query;
        if (error) throw error;

        let totalNhap = 0;
        let totalXuat = 0;
        
        if (data) {
            for (const item of data) {
                if (item.loai === 'Nhập') totalNhap += item.so_luong;
                else if (item.loai === 'Xuất') totalXuat += item.so_luong;
            }
        }
        
        summaryEl.innerHTML = `
            <span class="text-green-600">Tổng Nhập: <strong>${totalNhap.toLocaleString()}</strong></span>
            <span class="mx-2">|</span>
            <span class="text-red-600">Tổng Xuất: <strong>${totalXuat.toLocaleString()}</strong></span>
        `;

    } catch (error) {
        console.error("Lỗi tính toán tổng hợp:", error);
        summaryEl.textContent = 'Lỗi tính toán';
    }
}

export async function fetchChiTiet(page = viewStates['view-chi-tiet'].currentPage, showLoader = true) {
    if (showLoader) showLoading(true);
    try {
        updateChiTietSummary();
        viewStates['view-chi-tiet'].currentPage = page;
        const state = viewStates['view-chi-tiet'];

        const { itemsPerPage } = state;
        const isAll = itemsPerPage === 'all';
        const from = isAll ? 0 : (page - 1) * parseInt(itemsPerPage);
        let to = isAll ? -1 : from + parseInt(itemsPerPage) - 1;

        let query = buildChiTietQuery('*', 'exact');
        if (!isAll) query = query.range(from, to);
        query = query.order('thoi_gian', { ascending: false });
        
        const { data, error, count } = await query;
        if(error) {
            console.error("Lỗi fetch chi tiết:", error);
            showToast("Không thể tải dữ liệu chi tiết.", 'error');
        } else {
            if(to === -1 || to >= count) to = count > 0 ? count - 1 : 0;
            renderChiTietTable(data);
            renderPagination('ct', count, from, to);
        }
    } finally {
        if (showLoader) showLoading(false);
    }
}

function renderChiTietTable(data) {
    const ctTableBody = document.getElementById('ct-table-body');
    ctTableBody.innerHTML = '';
    if (data && data.length > 0) {
        data.forEach(ct => {
            ctTableBody.innerHTML += `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <a href="#" class="view-order-link text-blue-600 hover:text-blue-800 hover:underline" data-ma-nx="${ct.ma_nx}">${ct.ma_nx}</a>
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${formatDate(ct.thoi_gian)}</td>
                    <td class="px-6 py-4 whitespace-nowrap"><span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${ct.loai === 'Nhập' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}">${ct.loai}</span></td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <a href="#" class="text-blue-600 hover:text-blue-800 hover:underline" data-action="view-product" data-ma-sp="${ct.ma_sp}">${ct.ma_sp}</a>
                    </td>
                    <td class="px-6 py-4 text-sm text-gray-500 break-words">${ct.ten_sp || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-700">${ct.so_luong}</td>
                    <td class="px-6 py-4 text-sm text-gray-500 break-words">${ct.muc_dich || ''}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                         ${ct.phu_trach ? `<a href="#" class="text-blue-600 hover:text-blue-800 hover:underline" data-action="view-by-phu-trach" data-phu-trach="${ct.phu_trach}">${ct.phu_trach}</a>` : ''}
                    </td>
                </tr>
            `;
        });
    } else {
        ctTableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4">Không có dữ liệu chi tiết</td></tr>';
    }
}

async function showOrderDetailsFromLink(ma_nx) {
    if (!ma_nx) return;
    showLoading(true);
    try {
        const { data, error } = await sb.from('don_hang').select('*').eq('ma_nx', ma_nx).single();
        if (error) throw error;
        
        if (data) {
            await openDonHangModal(data, true);
        } else {
            showToast(`Không tìm thấy đơn hàng với mã: ${ma_nx}`, 'error');
        }
    } catch (error) {
        console.error('Lỗi khi hiển thị chi tiết đơn hàng:', error);
        showToast('Không thể tải chi tiết đơn hàng.', 'error');
    } finally {
        showLoading(false);
    }
}

export function initChiTietView() {
    document.getElementById('ct-search').addEventListener('input', debounce(() => {
        viewStates['view-chi-tiet'].searchTerm = document.getElementById('ct-search').value;
        fetchChiTiet(1);
    }, 500));

    document.getElementById('ct-table-body').addEventListener('click', async (e) => {
        const target = e.target.closest('a');
        if (!target) return;
        
        e.preventDefault();

        if (target.classList.contains('view-order-link')) {
            const ma_nx = target.dataset.maNx;
            if (ma_nx) {
                await showOrderDetailsFromLink(ma_nx);
            }
        } else if (target.dataset.action === 'view-product') {
            const ma_sp = target.dataset.maSp;
            navigateToSanPham({ ma_sp: [ma_sp] });
        } else if (target.dataset.action === 'view-by-phu-trach') {
             const phu_trach = target.dataset.phuTrach;
             navigateToSanPham({ phu_trach: [phu_trach] });
        }
    });

    ['ct-filter-thoi-gian-from', 'ct-filter-thoi-gian-to', 'ct-filter-loai-don'].forEach(id => {
        document.getElementById(id).addEventListener('change', e => {
            const filterKey = id.replace('ct-filter-', '').replace(/-/g, '_');
            viewStates['view-chi-tiet'].filters[filterKey] = e.target.value;
            fetchChiTiet(1);
        });
    });

    document.getElementById('ct-reset-filters').addEventListener('click', () => {
        ['ct-search', 'ct-filter-thoi-gian-from', 'ct-filter-thoi-gian-to', 'ct-filter-loai-don'].forEach(id => document.getElementById(id).value = '');
        viewStates['view-chi-tiet'].searchTerm = '';
        viewStates['view-chi-tiet'].filters = { thoi_gian_from: '', thoi_gian_to: '', ma_nx: [], loai_don: '', ma_sp: [], ten_sp: [], phu_trach: [] };
        
        document.querySelectorAll('#view-chi-tiet .filter-btn').forEach(btn => {
            const btnBaseText = btn.textContent.split('--')[1].trim().split(' ')[0];
            btn.innerHTML = `-- ${btnBaseText} --`;
        });
        
        fetchChiTiet(1);
    });
    
    document.getElementById('view-chi-tiet').addEventListener('click', e => {
        const btn = e.target.closest('.filter-btn');
        if (btn) openFilterPopover(btn, 'view-chi-tiet');
    });

    document.getElementById('ct-items-per-page').addEventListener('change', (e) => {
        viewStates['view-chi-tiet'].itemsPerPage = e.target.value;
        fetchChiTiet(1);
    });
    document.getElementById('ct-prev-page').addEventListener('click', () => fetchChiTiet(viewStates['view-chi-tiet'].currentPage - 1));
    document.getElementById('ct-next-page').addEventListener('click', () => fetchChiTiet(viewStates['view-chi-tiet'].currentPage + 1));
}