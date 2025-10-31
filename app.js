
// --- KHỞI TẠO & CẤU HÌNH ---
const { createClient } = supabase;
const SUPABASE_URL = 'https://qnqtkknzqewesxjoudhr.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFucXRra256cWV3ZXN4am91ZGhyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE3NTE0NzAsImV4cCI6MjA3NzMyNzQ3MH0.3FnZe-lvrI9N2rwZT7Knd5Ab_Rxi5xJ5KeIMMgKD8zQ';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// --- BIẾN TOÀN CỤC & TRẠNG THÁI ---
let currentUser = null;
let currentView = 'view-san-pham';
const viewStates = {
    'view-san-pham': { currentPage: 1, itemsPerPage: 50, filters: { ma_sp: [], ten_sp: [], phu_trach: [], ton_kho: '' }, searchTerm: '', selected: new Set() },
    'view-don-hang': { currentPage: 1, itemsPerPage: 50, filters: { thoi_gian_from: '', thoi_gian_to: '', ma_nx: [], loai_don: '', yeu_cau: [] }, searchTerm: '', selected: new Set() },
    'view-chi-tiet': { currentPage: 1, itemsPerPage: 50, filters: { thoi_gian_from: '', thoi_gian_to: '', ma_nx: [], loai_don: '', ma_sp: [], ten_sp: [], phu_trach: [] }, searchTerm: '' },
};
const cache = {
    phuTrachList: [],
    sanPhamList: [], // Now includes phu_trach
    fullSanPhamDataForFilters: [],
    fullDonHangDataForFilters: [],
    fullChiTietDataForFilters: [],
    userList: [],
};
let activeFilterPopover = null;
let activeProductDropdown = null;
let selectedImageFile = null; // Biến tạm để lưu file ảnh sản phẩm đã chọn
let selectedYcImageFile = null; // Biến tạm để lưu file ảnh yêu cầu đã chọn
let currentEditingOrderItems = []; // Lưu các item gốc khi sửa đơn hàng
let realtimeChannel = null; // Biến cho kênh realtime

const PLACEHOLDER_IMAGE_URL = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMDAiIGhlaWdodD0iMTAwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9IiNmMGYwZjAiIHN0cm9rZT0iI2NjY2NjYyIgc3Ryb2tlLXdpZHRoPSIxIiBzdHJva2UtbGluZWNhcD0icm91bmQiIHN0cm9rZS1saW5lam9pbj0icm91bmQiPjxyZWN0IHg9IjMiIHk9IjMiIHdpZHRoPSIxOCIgaGVpZ2h0PSIxOCIgcng9IjIiIHJ5PSIyIj48L3JlY3Q+PGNpcmNsZSBjeD0iOC41IiBjeT0iOC41IiByPSIxLjUiPjwvY2lyY2xlPjxwb2x5bGluZSBwb2ludHM9IjIxIDE1IDE2IDEwIDUgMTciPjwvcG9seWxpbmU+PC9zdmc+';


// --- HÀM UTILITY ---
const showLoading = (show) => document.getElementById('loading-overlay').classList.toggle('hidden', !show);
const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
};
const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => toast.classList.add('show'), 100);
    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        toast.addEventListener('transitionend', () => toast.remove());
    }, 3000);
}

function showConfirm(message, title = 'Xác nhận hành động') {
    return new Promise(resolve => {
        const modal = document.getElementById('confirm-modal');
        const titleEl = document.getElementById('confirm-title');
        const messageEl = document.getElementById('confirm-message');
        const okBtn = document.getElementById('confirm-ok-btn');
        const cancelBtn = document.getElementById('confirm-cancel-btn');

        titleEl.textContent = title;
        messageEl.textContent = message;

        const cleanup = (result) => {
            modal.classList.add('hidden');
            okBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(result);
        };

        okBtn.onclick = () => cleanup(true);
        cancelBtn.onclick = () => cleanup(false);

        modal.classList.remove('hidden');
    });
}

function getExportChoice() {
    return new Promise(resolve => {
        const modal = document.getElementById('export-modal');
        const filteredBtn = document.getElementById('export-filtered-btn');
        const allBtn = document.getElementById('export-all-btn');
        const cancelBtn = document.getElementById('export-cancel-btn');
        
        const cleanup = (result) => {
            modal.classList.add('hidden');
            filteredBtn.onclick = null;
            allBtn.onclick = null;
            cancelBtn.onclick = null;
            resolve(result);
        };

        filteredBtn.onclick = () => cleanup('filtered');
        allBtn.onclick = () => cleanup('all');
        cancelBtn.onclick = () => cleanup(null);

        modal.classList.remove('hidden');
    });
}


// --- HÀM CHÍNH ---
document.addEventListener('DOMContentLoaded', async () => {
    // --- SIDEBAR TOGGLE LOGIC ---
    const sidebar = document.getElementById('sidebar');
    const mainContent = document.getElementById('main-content-area');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const iconOpen = document.getElementById('sidebar-toggle-icon-open');
    const iconClose = document.getElementById('sidebar-toggle-icon-close');
    const navTexts = document.querySelectorAll('.nav-text');
    const userDetails = document.getElementById('user-details');
    const sidebarFooter = document.getElementById('sidebar-footer');
    const sidebarLogo = document.getElementById('sidebar-logo');

    const setSidebarState = (isCollapsed) => {
        if (isCollapsed) {
            sidebar.classList.remove('w-64');
            sidebar.classList.add('w-20');
            mainContent.classList.remove('ml-64');
            mainContent.classList.add('ml-20');
            iconOpen.classList.remove('hidden');
            iconClose.classList.add('hidden');
            navTexts.forEach(text => text.classList.add('opacity-0', 'hidden'));
            userDetails.classList.add('opacity-0', 'hidden');
            sidebarFooter.classList.add('opacity-0', 'hidden');
            sidebarLogo.classList.remove('mr-3');
        } else {
            sidebar.classList.add('w-64');
            sidebar.classList.remove('w-20');
            mainContent.classList.add('ml-64');
            mainContent.classList.remove('ml-20');
            iconOpen.classList.add('hidden');
            iconClose.classList.remove('hidden');
            navTexts.forEach(text => text.classList.remove('opacity-0', 'hidden'));
            userDetails.classList.remove('opacity-0', 'hidden');
            sidebarFooter.classList.remove('opacity-0', 'hidden');
            sidebarLogo.classList.add('mr-3');
        }
    };
    
    sidebarToggleBtn.addEventListener('click', () => {
        const isCollapsed = sidebar.classList.contains('w-20');
        setSidebarState(!isCollapsed);
        localStorage.setItem('sidebarCollapsed', !isCollapsed);
    });
    
    // Initialize sidebar state from localStorage
    if (localStorage.getItem('sidebarCollapsed') === 'true') {
        setSidebarState(true);
    }


    // --- XÁC THỰC & KHỞI TẠO APP ---
    async function checkSession() {
        try {
            const userJson = sessionStorage.getItem('loggedInUser');
            if (userJson) {
                const user = JSON.parse(userJson);
                await initializeApp(user);
            } else {
                window.location.href = 'login.html';
            }
        } catch (error) {
            console.error("Lỗi session:", error);
            sessionStorage.clear();
            window.location.href = 'login.html';
        }
    }

    async function initializeApp(user) {
        currentUser = user;
        document.getElementById('user-ho-ten').textContent = user.ho_ten || 'User';
        document.getElementById('user-gmail').textContent = user.gmail;
        document.getElementById('profile-ho-ten').value = user.ho_ten || '';

        applyPermissions(user);
        await loadInitialData();
        setupRealtimeSubscriptions(); // NÂNG CẤP: Kích hoạt Realtime
        
        document.getElementById('app-loading').classList.add('hidden');
        document.getElementById('main-app').classList.remove('hidden');
        
        await showView(currentView);
    }
    
    async function loadInitialData() {
        showLoading(true);
        try {
            // Base queries
            let sanPhamFilterQuery = sb.from('v_san_pham_chi_tiet').select('ma_sp, ten_sp, phu_trach');
            let donHangFilterQuery = sb.from('don_hang').select('ma_nx, yeu_cau');
            let chiTietFilterQuery = sb.from('chi_tiet').select('ma_nx, ma_sp, ten_sp, phu_trach');

            // Apply role-based filtering if user is not an Admin
            if (currentUser && currentUser.phan_quyen === 'User') {
                sanPhamFilterQuery = sanPhamFilterQuery.eq('phu_trach', currentUser.ho_ten);
                donHangFilterQuery = donHangFilterQuery.eq('yeu_cau', currentUser.ho_ten);
                chiTietFilterQuery = chiTietFilterQuery.eq('phu_trach', currentUser.ho_ten);
            }
            
            // Unconditional queries
            const phuTrachQuery = sb.from('v_san_pham_chi_tiet').select('phu_trach');
            const sanPhamQuery = sb.from('v_san_pham_chi_tiet').select('ma_sp, ten_sp, ton_cuoi, phu_trach');
            const usersQuery = sb.from('user').select('ho_ten');

            // Execute all queries in parallel
            const [
                phuTrachRes, 
                sanPhamRes, 
                usersRes, 
                fullSpRes, 
                donHangRes, 
                chiTietRes
            ] = await Promise.all([
                phuTrachQuery,
                sanPhamQuery,
                usersQuery,
                sanPhamFilterQuery,
                donHangFilterQuery,
                chiTietFilterQuery,
            ]);

            // Consolidate error checking
            const allErrors = [phuTrachRes.error, sanPhamRes.error, usersRes.error, fullSpRes.error, donHangRes.error, chiTietRes.error].filter(Boolean);
            if (allErrors.length > 0) {
                 throw new Error(`Lỗi khi tải dữ liệu ban đầu: ${allErrors.map(e => e.message).join(', ')}`);
            }

            // Populate cache safely, ensuring arrays are always arrays
            const existingPhuTrach = [...new Set((phuTrachRes.data || []).map(item => item.phu_trach).filter(Boolean))];
            const userNames = [...new Set((usersRes.data || []).map(item => item.ho_ten).filter(Boolean))];
            cache.phuTrachList = [...new Set([...existingPhuTrach, ...userNames])].sort();
            
            cache.sanPhamList = sanPhamRes.data || [];
            cache.fullSanPhamDataForFilters = fullSpRes.data || [];
            cache.fullDonHangDataForFilters = donHangRes.data || [];
            cache.fullChiTietDataForFilters = chiTietRes.data || [];

        } catch (error) {
            console.error(error);
            showToast("Không thể tải dữ liệu cần thiết cho ứng dụng.", 'error');
        } finally {
            showLoading(false);
        }
    }


    // --- NÂNG CẤP: LOGIC REALTIME ---
    function setupRealtimeSubscriptions() {
        // Hủy đăng ký kênh cũ nếu có
        if (realtimeChannel) {
            sb.removeChannel(realtimeChannel);
        }

        // Hàm xử lý chung khi có thay đổi
        const handleRealtimeUpdate = async (message) => {
            console.log('Realtime update received:', message);
            showToast(message, 'info');
            // Tải lại dữ liệu cho bộ lọc và cache
            await loadInitialData();
            // Tải lại dữ liệu cho view hiện tại
            await loadDataForCurrentView();
        };

        realtimeChannel = sb.channel('public-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'san_pham' }, 
                (payload) => {
                    let msg = 'Bảng sản phẩm vừa được cập nhật.';
                    if (payload.eventType === 'INSERT') msg = `Sản phẩm mới: ${payload.new.ma_sp}`;
                    if (payload.eventType === 'DELETE') msg = `Sản phẩm ${payload.old.ma_sp} đã bị xóa.`;
                    handleRealtimeUpdate(msg);
                }
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'don_hang' },
                (payload) => handleRealtimeUpdate('Danh sách đơn hàng vừa được cập nhật.')
            )
            .on('postgres_changes', { event: '*', schema: 'public', table: 'chi_tiet' },
                // Thay đổi chi tiết sẽ ảnh hưởng đến tồn kho, nên cần cập nhật
                (payload) => handleRealtimeUpdate('Dữ liệu kho vừa được cập nhật.')
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log('Đã kết nối Realtime thành công!');
                }
                 if (status === 'CHANNEL_ERROR') {
                    console.error('Lỗi kết nối Realtime, đang thử lại...');
                }
            });
    }

    function applyPermissions(user) {
        const isAdmin = user.phan_quyen === 'Admin';
        document.getElementById('admin-panel').classList.toggle('hidden', !isAdmin);
        document.querySelectorAll('.admin-only').forEach(el => {
            el.classList.toggle('hidden', !isAdmin);
        });
        if (isAdmin) {
            fetchUsers();
        }
    }

    function handleLogout() {
        if(realtimeChannel) {
            sb.removeChannel(realtimeChannel); // Hủy đăng ký khi logout
        }
        sessionStorage.clear();
        window.location.href = 'login.html';
    }

    // --- ĐIỀU HƯỚNG VIEW ---
    async function showView(viewId) {
        document.querySelectorAll('.app-view').forEach(view => view.classList.add('hidden'));
        document.getElementById(viewId).classList.remove('hidden');
        
        document.querySelectorAll('.nav-button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.view === viewId);
        });
        
        currentView = viewId;
        await loadDataForCurrentView();
    }

    async function showOrderDetailsFromLink(ma_nx) {
        if (!ma_nx) return;

        showLoading(true);
        try {
            await showView('view-don-hang');

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
    
    async function filterSanPhamFromChiTiet(filterKey, filterValue) {
        // 1. Reset San Pham filters state and UI
        const spState = viewStates['view-san-pham'];
        spState.searchTerm = '';
        spState.filters = { ma_sp: [], ten_sp: [], phu_trach: [], ton_kho: '' };
        
        document.getElementById('sp-search').value = '';
        document.getElementById('sp-filter-ton-kho').value = '';
        document.querySelectorAll('#view-san-pham .filter-btn').forEach(btn => {
            const btnBaseText = btn.textContent.split('--')[1].trim().split(' ')[0];
            btn.innerHTML = `-- ${btnBaseText} --`;
        });

        // 2. Apply the new filter from Chi Tiet view
        if (filterKey === 'ma_sp') {
            spState.filters.ma_sp = [filterValue];
            const btn = document.getElementById('sp-filter-ma-sp-btn');
            btn.innerHTML = `-- Mã SP -- <span class="ml-1 font-bold">(1)</span>`;
        } else if (filterKey === 'phu_trach') {
            spState.filters.phu_trach = [filterValue];
            const btn = document.getElementById('sp-filter-phu-trach-btn');
            btn.innerHTML = `-- Phụ Trách -- <span class="ml-1 font-bold">(1)</span>`;
        }

        // 3. Switch view which will trigger data reload with the new filter
        await showView('view-san-pham');
    }

    async function loadDataForCurrentView() {
        switch (currentView) {
            case 'view-san-pham': await fetchSanPham(1); break;
            case 'view-don-hang': await fetchDonHang(1); break;
            case 'view-chi-tiet': await fetchChiTiet(1); break;
        }
    }
    
    // --- LOGIC PHÂN TRANG & RENDER ---
    function renderPagination(viewPrefix, totalItems, from, to) {
        const state = viewStates[`view-${viewPrefix}`];
        if (!state) return;
        
        const infoEl = document.getElementById(`${viewPrefix}-pagination-info`);
        const prevBtn = document.getElementById(`${viewPrefix}-prev-page`);
        const nextBtn = document.getElementById(`${viewPrefix}-next-page`);

        if (!infoEl || !prevBtn || !nextBtn) return;
        
        const isAll = state.itemsPerPage === 'all';
        if (totalItems > 0 && !isAll) {
             infoEl.textContent = `Hiển thị ${from + 1} - ${to + 1} trên tổng số ${totalItems} mục`;
        } else if (totalItems > 0 && isAll) {
             infoEl.textContent = `Hiển thị toàn bộ ${totalItems} mục`;
        } else {
             infoEl.textContent = 'Không có dữ liệu';
        }

        prevBtn.disabled = state.currentPage <= 1 || isAll;
        const totalPages = isAll ? 1 : Math.ceil(totalItems / parseInt(state.itemsPerPage));
        nextBtn.disabled = state.currentPage >= totalPages || isAll;
    }
    
    // --- QUẢN LÝ SẢN PHẨM (VIEW 1) ---
    function buildSanPhamQuery(isExport = false) {
        const state = viewStates['view-san-pham'];
        const selectColumns = isExport 
            ? 'ma_sp, ten_sp, ton_dau, nhap, xuat, ton_cuoi, phu_trach' 
            : '*, hinh_anh_url';
        let query = sb.from('v_san_pham_chi_tiet').select(selectColumns, { count: 'exact' });

        // ** PHÂN QUYỀN **
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

    async function fetchSanPham(page = viewStates['view-san-pham'].currentPage) {
        showLoading(true);
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
        showLoading(false);
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
                        <td class="px-4 py-3"><input type="checkbox" class="sp-select-row" data-id="${sp.ma_sp}" ${isSelected ? 'checked' : ''}></td>
                        <td class="px-4 py-3">${imageHtml}</td>
                        <td class="px-6 py-3 text-sm font-medium text-gray-900">${sp.ma_sp}</td>
                        <td class="px-6 py-3 text-sm text-gray-600 break-words">${sp.ten_sp}</td>
                        <td class="px-6 py-3 text-sm text-gray-600">${sp.ton_dau}</td>
                        <td class="px-6 py-3 text-sm text-gray-600">${sp.nhap}</td>
                        <td class="px-6 py-3 text-sm text-gray-600">${sp.xuat}</td>
                        <td class="px-6 py-3 text-sm font-semibold ${sp.ton_cuoi > 0 ? 'text-green-600' : 'text-red-600'}">${sp.ton_cuoi}</td>
                        <td class="px-6 py-3 text-sm text-gray-600">${sp.phu_trach || ''}</td>
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
            return; // Ngăn không cho chọn dòng khi click vào ảnh
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
    
    // LOGIC BỘ LỌC NÂNG CAO & PHỤ THUỘC
    function closeActiveFilterPopover() {
        if (activeFilterPopover) {
            activeFilterPopover.remove();
            activeFilterPopover = null;
        }
    }

    function openFilterPopover(btnElement, viewName) {
        closeActiveFilterPopover();
        
        const filterKey = btnElement.dataset.filterKey;
        const viewState = viewStates[viewName]; 
        if (!viewState) {
            console.error(`Không tìm thấy state cho view: ${viewName}`);
            return;
        }
        
        let cacheData;
        if (viewName === 'view-san-pham') cacheData = cache.fullSanPhamDataForFilters;
        else if (viewName === 'view-don-hang') cacheData = cache.fullDonHangDataForFilters;
        else cacheData = cache.fullChiTietDataForFilters;
        
        if (!Array.isArray(cacheData)) {
            console.error("Dữ liệu bộ lọc không hợp lệ:", cacheData);
            return;
        }

        const currentSelected = new Set(viewState.filters[filterKey]);

        let relevantData = [...cacheData];
        for (const key in viewState.filters) {
            if (key !== filterKey && viewState.filters[key] && Array.isArray(viewState.filters[key]) && viewState.filters[key].length > 0) {
                relevantData = relevantData.filter(item => viewState.filters[key].includes(item[key]));
            }
        }
        
        const allOptions = [...new Set(relevantData.map(item => item[filterKey]).filter(Boolean))].sort();

        const popoverTemplate = document.getElementById('filter-popover-template');
        activeFilterPopover = popoverTemplate.cloneNode(true);
        activeFilterPopover.id = '';
        activeFilterPopover.classList.remove('hidden');
        
        const searchInput = activeFilterPopover.querySelector('.filter-search-input');
        const optionsList = activeFilterPopover.querySelector('.filter-options-list');
        const applyBtn = activeFilterPopover.querySelector('.filter-apply-btn');

        function renderOptions(filterText = '') {
            optionsList.innerHTML = '';
            allOptions
                .filter(opt => opt.toLowerCase().includes(filterText.toLowerCase()))
                .forEach(option => {
                    const optionId = `filter-opt-${filterKey}-${option.replace(/\s/g, '-')}`;
                    const isChecked = currentSelected.has(option);
                    optionsList.insertAdjacentHTML('beforeend', `
                        <label for="${optionId}" class="flex items-center space-x-2 cursor-pointer p-1 rounded hover:bg-gray-100">
                            <input type="checkbox" id="${optionId}" data-value="${option}" class="form-checkbox h-4 w-4 text-blue-600" ${isChecked ? 'checked' : ''}>
                            <span class="text-sm text-gray-700">${option}</span>
                        </label>
                    `);
                });
        }
        renderOptions();

        btnElement.parentElement.appendChild(activeFilterPopover);
        searchInput.addEventListener('input', () => renderOptions(searchInput.value));
        applyBtn.addEventListener('click', () => {
            const selectedValues = Array.from(optionsList.querySelectorAll('input:checked')).map(cb => cb.dataset.value);
            viewState.filters[filterKey] = selectedValues;
            
            const btnBaseText = btnElement.textContent.split('--')[1].trim().split(' ')[0];
            const countText = selectedValues.length > 0 ? `(${selectedValues.length})` : '';
            btnElement.innerHTML = `-- ${btnBaseText} -- <span class="ml-1 font-bold">${countText}</span>`;
            
            closeActiveFilterPopover();
            if (viewName === 'view-san-pham') fetchSanPham(1);
            else if (viewName === 'view-don-hang') fetchDonHang(1);
            else fetchChiTiet(1);
        });
    }


    // MODAL & ACTIONS SẢN PHẨM
    function openSanPhamModal(sp = null) {
        const modal = document.getElementById('san-pham-modal');
        const form = document.getElementById('san-pham-form');
        form.reset();
        selectedImageFile = null; // Reset file đã chọn

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
            // Xử lý upload ảnh nếu có file mới
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
            // No need to fetch data here, realtime will handle it
        } catch (error) {
            console.error("Lỗi lưu sản phẩm:", error);
            if (error.code === '23505') { // Unique constraint violation
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
            // No need to fetch, realtime will handle it
            showLoading(false);
        }
    }
    
    // --- QUẢN LÝ ĐƠN HÀNG (VIEW 2) ---
    function buildDonHangQuery() {
        const state = viewStates['view-don-hang'];
        let query = sb.from('don_hang').select('*', { count: 'exact' });

        // ** PHÂN QUYỀN **
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

    async function fetchDonHang(page = viewStates['view-don-hang'].currentPage) {
        showLoading(true);
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
        showLoading(false);
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
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${dh.ma_nx}</td>
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
        applyPermissions(currentUser);
    }

    function updateDonHangActionButtonsState() {
        const selectedCount = viewStates['view-don-hang'].selected.size;
        document.getElementById('dh-btn-view').disabled = selectedCount !== 1;
        document.getElementById('dh-btn-edit').disabled = selectedCount !== 1;
        document.getElementById('dh-btn-delete').disabled = selectedCount === 0;
        document.getElementById('dh-btn-print').disabled = selectedCount !== 1; // Cập nhật trạng thái nút In
    }
    
    function handleDonHangSelection(e) {
        if (e.target.closest('.thumbnail-image')) {
            const imgSrc = e.target.closest('.thumbnail-image').dataset.largeSrc;
            document.getElementById('image-viewer-img').src = imgSrc;
            document.getElementById('image-viewer-modal').classList.remove('hidden');
            return; 
        }

        const row = e.target.closest('tr');
        if (!row || !row.dataset.id) return;

        const id = row.dataset.id;
        const checkbox = row.querySelector('.dh-select-row');
        const state = viewStates['view-don-hang'];

        if (e.target.type !== 'checkbox' && !e.target.closest('a')) { // Don't select row if clicking a link
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
            // Lấy URL ảnh YC để xóa khỏi storage
            const { data: ordersToDelete, error: selectError } = await sb.from('don_hang').select('anh_yc_url').in('ma_nx', selectedIds);
            if (selectError) throw selectError;
            
            const filesToRemove = ordersToDelete
                .map(p => p.anh_yc_url)
                .filter(Boolean)
                .map(url => `public/${url.split('/').pop()}`);
                
            if (filesToRemove.length > 0) {
                await sb.storage.from('anh_yeu_cau').remove(filesToRemove);
            }

            // Xóa chi tiết trước
            const { error: deleteChiTietError } = await sb.from('chi_tiet').delete().in('ma_nx', selectedIds);
            if (deleteChiTietError) throw deleteChiTietError;
            
            // Xóa đơn hàng sau
            const { error: deleteDonHangError } = await sb.from('don_hang').delete().in('ma_nx', selectedIds);
            if (deleteDonHangError) throw deleteDonHangError;

            showToast(`Đã xóa ${selectedIds.length} đơn hàng.`, 'success');
        } catch (error) {
            showToast(`Lỗi khi xóa đơn hàng: ${error.message}`, 'error');
        } finally {
            showLoading(false);
        }
    }
    
    // --- QUẢN LÝ CHI TIẾT (VIEW 3) ---
    function buildChiTietQuery(selectString = '*', countOption = null) {
        const state = viewStates['view-chi-tiet'];
        let query = sb.from('chi_tiet').select(selectString, countOption ? { count: countOption } : undefined);

        // ** PHÂN QUYỀN **
        if (currentUser && currentUser.phan_quyen === 'User') {
            query = query.eq('phu_trach', currentUser.ho_ten);
        }

        if (state.searchTerm) {
            const st = `%${state.searchTerm}%`;
            query = query.or(`ma_nx.ilike.${st},ma_sp.ilike.${st},ten_sp.ilike.${st},muc_dich.ilike.${st},phu_trach.ilike.${st}`);
        }
        if (state.filters.thoi_gian_from) query = query.gte('thoi_gian', state.filters.thoi_gian_from);
        if (state.filters.thoi_gian_to) query = query.lte('thoi_gian', state.filters.thoi_gian_to);
        if (state.filters.loai_don) query = query.eq('loai', state.filters.loai_don); // DB column is 'loai'
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
                    if (item.loai === 'Nhập') {
                        totalNhap += item.so_luong;
                    } else if (item.loai === 'Xuất') {
                        totalXuat += item.so_luong;
                    }
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

    async function fetchChiTiet(page = viewStates['view-chi-tiet'].currentPage) {
        showLoading(true);
        updateChiTietSummary(); // Fire and forget calculation
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
        showLoading(false);
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


    // --- LOGIC MODAL ĐƠN HÀNG ---
    
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
        
        // ** SỬA LỖI TỒN KHO KHI EDIT **
        // Nếu đang sửa đơn hàng, phải "hoàn trả" số lượng của sản phẩm này trong đơn hàng cũ
        // để có được tồn kho chính xác *trước khi* thực hiện đơn hàng này.
        if (isEdit) {
            const originalItem = currentEditingOrderItems.find(item => item.ma_sp === maSp);
            if (originalItem) {
                if (loaiDon === 'Nhập') {
                    tonKhoHienTai -= originalItem.so_luong; // Trừ đi số đã nhập để về trạng thái cũ
                } else { // Xuất
                    tonKhoHienTai += originalItem.so_luong; // Cộng lại số đã xuất để về trạng thái cũ
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

    async function openDonHangModal(dh = null, readOnly = false) {
        const modal = document.getElementById('don-hang-modal');
        const form = document.getElementById('don-hang-form');
        form.reset();
        document.getElementById('dh-item-list').innerHTML = '';
        selectedYcImageFile = null; 
        currentEditingOrderItems = []; // Reset item gốc

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
            
            currentEditingOrderItems = items; // Lưu lại item gốc để tính toán tồn kho
            
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
        row.className = 'grid grid-cols-10 gap-4 items-start dh-item-row'; // Use items-start
        row.innerHTML = `
            <div class="col-span-3 relative">
                <input type="text" class="dh-item-sp-search w-full border rounded-md p-2" placeholder="Tìm Mã SP...">
                <input type="hidden" class="dh-item-ma-sp" required>
                <div class="dh-item-sp-dropdown absolute z-20 w-full bg-white border rounded-md mt-1 max-h-48 overflow-y-auto hidden shadow-lg">
                    <!-- Dropdown options will be injected here -->
                </div>
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

            // ** SỬA LỖI VALIDATION SỐ LƯỢNG **
            if (!ma_sp || isNaN(so_luong_val) || so_luong_val < 0) {
                showToast("Vui lòng điền đầy đủ Mã SP và Số lượng hợp lệ (>= 0) cho tất cả sản phẩm.", 'error');
                return;
            }
            
            const sp = cache.sanPhamList.find(p => p.ma_sp === ma_sp);
            if (!sp) {
                showToast(`Sản phẩm với mã "${ma_sp}" không hợp lệ.`, 'error');
                return;
            }

            // Tính toán lại tồn kho để kiểm tra
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
            // Handle YC image upload
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
                    await sb.from('don_hang').delete().eq('ma_nx', donHangData.ma_nx); // Rollback
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


    // --- EXPORT FUNCTIONS ---
    async function exportToExcel(view) {
        const choice = await getExportChoice();
        if (!choice) return;

        showLoading(true);
        try {
            const isFiltered = choice === 'filtered';
            let query;
            let headers, keys;
            let filename;

            if (view === 'sp') {
                query = isFiltered ? buildSanPhamQuery(true) : sb.from('v_san_pham_chi_tiet').select('ma_sp, ten_sp, ton_dau, nhap, xuat, ton_cuoi, phu_trach');
                 if (currentUser && currentUser.phan_quyen === 'User' && !isFiltered) {
                    query = query.eq('phu_trach', currentUser.ho_ten);
                }
                headers = ["Mã SP", "Tên SP", "Tồn Đầu", "Nhập", "Xuất", "Tồn Cuối", "Phụ Trách"];
                keys = ["ma_sp", "ten_sp", "ton_dau", "nhap", "xuat", "ton_cuoi", "phu_trach"];
                filename = "DanhSachSanPham.xlsx";
            } else { // ct
                let query = isFiltered ? buildChiTietQuery('ma_nx, thoi_gian, loai, ma_sp, ten_sp, so_luong, muc_dich, phu_trach') : sb.from('chi_tiet').select('ma_nx, thoi_gian, loai, ma_sp, ten_sp, so_luong, muc_dich, phu_trach');
                if (currentUser && currentUser.phan_quyen === 'User' && !isFiltered) {
                    query = query.eq('phu_trach', currentUser.ho_ten);
                }
                headers = ["Mã NX", "Thời Gian", "Loại", "Mã SP", "Tên SP", "Số Lượng", "Mục Đích", "Phụ Trách"];
                keys = ["ma_nx", "thoi_gian", "loai", "ma_sp", "ten_sp", "so_luong", "muc_dich", "phu_trach"];
                filename = "ChiTietNhapXuat.xlsx";
            }

            const { data, error } = await query.order(view === 'sp' ? 'ma_sp' : 'thoi_gian', { ascending: view === 'sp' });
            if (error) throw error;
            
            const dataForSheet = data.map(row => {
                return keys.map(key => {
                    if (key === 'thoi_gian') return formatDate(row[key]);
                    return row[key] !== null && row[key] !== undefined ? row[key] : '';
                });
            });

            const ws = XLSX.utils.aoa_to_sheet([headers, ...dataForSheet]);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Data");
            XLSX.writeFile(wb, filename);

            showToast('Xuất Excel thành công!', 'success');
        } catch (error) {
            console.error('Lỗi xuất Excel:', error);
            showToast('Xuất Excel thất bại.', 'error');
        } finally {
            showLoading(false);
        }
    }
    
    async function exportToPdf(view) {
        const choice = await getExportChoice();
        if (!choice) return;

        showLoading(true);
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'landscape' });

            const fontUrl = 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.7/fonts/Roboto/Roboto-Regular.ttf';
            const fontResponse = await fetch(fontUrl);
            if (!fontResponse.ok) throw new Error('Không thể tải file font.');
            const fontBlob = await fontResponse.blob();
            
            const roboto_regular_base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(fontBlob);
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = (error) => reject(error);
            });

            doc.addFileToVFS('Roboto-Regular.ttf', roboto_regular_base64);
            doc.addFont('Roboto-Regular.ttf', 'Roboto', 'normal');
            doc.setFont('Roboto');

            const isFiltered = choice === 'filtered';
            let query;
            let head, bodyKeys, title, columnStyles;

            if (view === 'sp') {
                query = isFiltered ? buildSanPhamQuery(true) : sb.from('v_san_pham_chi_tiet').select('ma_sp, ten_sp, ton_dau, nhap, xuat, ton_cuoi, phu_trach');
                 if (currentUser && currentUser.phan_quyen === 'User' && !isFiltered) {
                    query = query.eq('phu_trach', currentUser.ho_ten);
                }
                head = [["Mã SP", "Tên SP", "Tồn Đầu", "Nhập", "Xuất", "Tồn Cuối", "Phụ Trách"]];
                bodyKeys = ["ma_sp", "ten_sp", "ton_dau", "nhap", "xuat", "ton_cuoi", "phu_trach"];
                title = "Báo Cáo Tồn Kho Sản Phẩm";
                columnStyles = {
                    0: { cellWidth: 35 },
                    1: { cellWidth: 65 },
                    2: { cellWidth: 25 },
                    3: { cellWidth: 25 },
                    4: { cellWidth: 25 },
                    5: { cellWidth: 25 },
                    6: { cellWidth: 'auto' },
                };
            } else { // ct
                let query = isFiltered ? buildChiTietQuery('ma_nx, thoi_gian, loai, ma_sp, ten_sp, so_luong, muc_dich, phu_trach') : sb.from('chi_tiet').select('ma_nx, thoi_gian, loai, ma_sp, ten_sp, so_luong, muc_dich, phu_trach');
                 if (currentUser && currentUser.phan_quyen === 'User' && !isFiltered) {
                    query = query.eq('phu_trach', currentUser.ho_ten);
                }
                head = [["Mã NX", "Thời Gian", "Loại", "Mã SP", "Tên SP", "SL", "Mục Đích", "Phụ Trách"]];
                bodyKeys = ["ma_nx", "thoi_gian", "loai", "ma_sp", "ten_sp", "so_luong", "muc_dich", "phu_trach"];
                title = "Báo Cáo Chi Tiết Nhập Xuất";
                 columnStyles = {
                    0: { cellWidth: 25 },
                    1: { cellWidth: 25 },
                    2: { cellWidth: 15 },
                    3: { cellWidth: 30 },
                    4: { cellWidth: 45 },
                    5: { cellWidth: 15 },
                    6: { cellWidth: 70 },
                    7: { cellWidth: 'auto' },
                };
            }
            
            const { data, error } = await query.order(view === 'sp' ? 'ma_sp' : 'thoi_gian', { ascending: view === 'sp' });
            if (error) throw error;
            
            const body = data.map(row => bodyKeys.map(key => {
                if (key === 'thoi_gian') return formatDate(row[key]);
                return row[key] !== null && row[key] !== undefined ? String(row[key]) : '';
            }));

            doc.setFont('Roboto', 'normal');
            doc.setFontSize(18);
            doc.text(title, 14, 16);

            doc.autoTable({
                head: head,
                body: body,
                startY: 22,
                styles: {
                    font: 'Roboto',
                    fontStyle: 'normal',
                    fontSize: 7,
                },
                headStyles: {
                    fillColor: [34, 119, 170],
                    textColor: 255,
                    fontStyle: 'bold',
                },
                columnStyles: columnStyles,
                didDrawPage: function (data) {
                    if (data.pageNumber === doc.internal.getNumberOfPages()) {
                        const pageHeight = doc.internal.pageSize.getHeight();
                        const pageWidth = doc.internal.pageSize.getWidth();
                        let finalY = data.cursor.y + 15;

                        // Nếu không đủ chỗ, không cần tạo trang mới, chỉ cần đảm bảo nó không vẽ ra ngoài
                        if (finalY > pageHeight - 20) {
                           finalY = pageHeight - 20;
                        }
                        
                        doc.setFontSize(11);
                        doc.setFont('Roboto', 'normal');
                        
                        doc.text('Người Phụ Trách', 40, finalY);
                        doc.text('(Ký, ghi rõ họ tên)', 40, finalY + 7);
                        
                        doc.text('Thủ Kho', pageWidth - 80, finalY);
                        doc.text('(Ký, ghi rõ họ tên)', pageWidth - 80, finalY + 7);
                    }
                }
            });

            doc.save(`${title.replace(/\s/g, '_')}.pdf`);
            showToast('Xuất PDF thành công!', 'success');

        } catch(error) {
            console.error('Lỗi xuất PDF:', error);
            showToast('Xuất PDF thất bại. Đã có lỗi xảy ra.', 'error');
        } finally {
            showLoading(false);
        }
    }


    // --- LOGIC VIEW CÀI ĐẶT ---
    async function handleProfileUpdate(e) {
        e.preventDefault();
        const ho_ten = document.getElementById('profile-ho-ten').value;
        const old_password = document.getElementById('profile-old-password').value;
        const new_password = document.getElementById('profile-new-password').value;
        const confirm_password = document.getElementById('profile-confirm-password').value;

        if (currentUser.mat_khau !== old_password) {
            showToast("Mật khẩu cũ không chính xác.", 'error');
            return;
        }
        if (new_password && new_password !== confirm_password) {
            showToast("Mật khẩu mới không khớp.", 'error');
            return;
        }

        const updateData = { ho_ten };
        if (new_password) {
            updateData.mat_khau = new_password;
        }

        showLoading(true);
        const { data, error } = await sb.from('user').update(updateData).eq('gmail', currentUser.gmail).select().single();
        showLoading(false);

        if (error) {
            showToast(`Cập nhật thất bại: ${error.message}`, 'error');
        } else {
            showToast("Cập nhật thông tin thành công!", 'success');
            sessionStorage.setItem('loggedInUser', JSON.stringify(data));
            currentUser = data;
            document.getElementById('profile-form').reset();
            document.getElementById('profile-ho-ten').value = data.ho_ten;
        }
    }

    async function fetchUsers() {
        const { data, error } = await sb.from('user').select('*').order('ho_ten');
        if (error) {
            showToast("Không thể tải danh sách nhân viên.", 'error');
        } else {
            cache.userList = data;
            renderUserList(data);
        }
    }

    function renderUserList(users) {
        const userListContainer = document.getElementById('user-list-body');
        userListContainer.innerHTML = '';
        if (!users || users.length === 0) {
            userListContainer.innerHTML = `<p class="text-center text-gray-500">Không có người dùng nào.</p>`;
            return;
        }
        users.forEach(user => {
            const isCurrentUser = user.gmail === currentUser.gmail;
            userListContainer.innerHTML += `
                <div class="border rounded-lg p-4 bg-gray-50/50 shadow-sm">
                    <div class="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
                        <div class="flex-grow">
                            <p class="font-semibold text-gray-900">${user.ho_ten}</p>
                            <p class="text-sm text-gray-600 break-all">${user.gmail}</p>
                        </div>
                        <div class="flex flex-col sm:flex-row sm:items-center gap-4 w-full sm:w-auto flex-shrink-0">
                            <select data-gmail="${user.gmail}" class="user-role-select border rounded p-2 text-sm w-full sm:w-28" ${isCurrentUser ? 'disabled' : ''}>
                                <option value="Admin" ${user.phan_quyen === 'Admin' ? 'selected' : ''}>Admin</option>
                                <option value="User" ${user.phan_quyen === 'User' ? 'selected' : ''}>User</option>
                            </select>
                            <button data-gmail="${user.gmail}" class="reset-password-btn text-sm text-indigo-600 hover:text-indigo-900 font-medium px-3 py-2 rounded-md hover:bg-indigo-50 w-full sm:w-auto text-center" ${isCurrentUser ? 'disabled' : ''}>
                                Đặt lại MK
                            </button>
                        </div>
                    </div>
                </div>
            `;
        });
    }

    async function handleRoleChange(e) {
        const gmail = e.target.dataset.gmail;
        const newRole = e.target.value;
        const originalRole = cache.userList.find(u => u.gmail === gmail)?.phan_quyen;
        
        if (!originalRole) return;

        const confirmed = await showConfirm(`Bạn có muốn đổi quyền của ${gmail} thành ${newRole}?`);
        if (!confirmed) {
            e.target.value = originalRole; // Revert
            return;
        }

        showLoading(true);
        const { error } = await sb.from('user').update({ phan_quyen: newRole }).eq('gmail', gmail);
        showLoading(false);
        if (error) {
            showToast("Đổi quyền thất bại.", 'error');
            e.target.value = originalRole; // Revert on failure
        } else {
            showToast("Đổi quyền thành công.", 'success');
            await fetchUsers(); // Refresh the list to update the cache
        }
    }
    
    function openPasswordResetModal(gmail) {
        document.getElementById('reset-user-gmail').value = gmail;
        document.getElementById('reset-user-gmail-display').textContent = gmail;
        document.getElementById('password-reset-modal').classList.remove('hidden');
    }

    async function handlePasswordReset(e) {
        e.preventDefault();
        const gmail = document.getElementById('reset-user-gmail').value;
        const new_password = document.getElementById('reset-new-password').value;
        
        showLoading(true);
        const { error } = await sb.from('user').update({ mat_khau: new_password }).eq('gmail', gmail);
        showLoading(false);
        
        if (error) {
            showToast("Đặt lại mật khẩu thất bại.", 'error');
        } else {
            showToast("Đặt lại mật khẩu thành công.", 'success');
            document.getElementById('password-reset-modal').classList.add('hidden');
            document.getElementById('password-reset-form').reset();
        }
    }
    
    // --- GẮN EVENT LISTENERS ---
    // Điều hướng
    document.querySelectorAll('.nav-button').forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));
    document.getElementById('logout-btn').addEventListener('click', handleLogout);

    // Body click for closing popovers
    document.body.addEventListener('click', e => {
        if (activeFilterPopover && !activeFilterPopover.contains(e.target) && !e.target.closest('.filter-btn')) {
            closeActiveFilterPopover();
        }
        if (activeProductDropdown && !activeProductDropdown.closest('.relative').contains(e.target)) {
            closeActiveProductDropdown();
        }
    });
    
    // Global ESC key listener
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (activeFilterPopover) {
                closeActiveFilterPopover();
            } else if (activeProductDropdown) {
                closeActiveProductDropdown();
            } else if (!document.getElementById('image-viewer-modal').classList.contains('hidden')) {
                document.getElementById('image-viewer-modal').classList.add('hidden');
            } else if (!document.getElementById('confirm-modal').classList.contains('hidden')) {
                document.getElementById('confirm-cancel-btn').click();
            } else if (!document.getElementById('export-modal').classList.contains('hidden')) {
                document.getElementById('export-cancel-btn').click();
            } else if (!document.getElementById('don-hang-modal').classList.contains('hidden')) {
                document.getElementById('don-hang-modal').classList.add('hidden');
            } else if (!document.getElementById('san-pham-modal').classList.contains('hidden')) {
                document.getElementById('san-pham-modal').classList.add('hidden');
            } else if (!document.getElementById('password-reset-modal').classList.contains('hidden')) {
                document.getElementById('password-reset-modal').classList.add('hidden');
            }
        }
    });

    // View Sản Phẩm
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
            if(cb.checked !== isChecked) {
                cb.click();
            }
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

    document.getElementById('sp-modal-image-upload').addEventListener('change', (e) => {
        processSpImageFile(e.target.files[0]);
    });

    document.getElementById('sp-image-paste-area').addEventListener('paste', (e) => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                processSpImageFile(file);
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

    // View Đơn Hàng
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
        const formIds = ['dh-search', 'dh-filter-thoi-gian-from', 'dh-filter-thoi-gian-to', 'dh-filter-loai-don'];
        formIds.forEach(id => document.getElementById(id).value = '');
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
            if(cb.checked !== isChecked) {
                cb.click();
            }
        });
    });
    document.getElementById('dh-btn-add').addEventListener('click', () => openDonHangModal(null, false));
    document.getElementById('dh-btn-view').addEventListener('click', async () => {
        const ma_nx = [...viewStates['view-don-hang'].selected][0];
        const { data } = await sb.from('don_hang').select('*').eq('ma_nx', ma_nx).single();
        if(data) openDonHangModal(data, true);
    });
    document.getElementById('dh-btn-edit').addEventListener('click', async () => {
        const ma_nx = [...viewStates['view-don-hang'].selected][0];
        const { data } = await sb.from('don_hang').select('*').eq('ma_nx', ma_nx).single();
        if(data) openDonHangModal(data, false);
    });
    document.getElementById('dh-btn-delete').addEventListener('click', handleDeleteMultipleDonHang);

    // Thêm event listener cho nút In
    document.getElementById('dh-btn-print').addEventListener('click', () => {
        const selectedIds = [...viewStates['view-don-hang'].selected];
        if (selectedIds.length === 1) {
            const ma_nx = selectedIds[0];
            const printUrl = `print.html?ma_nx=${encodeURIComponent(ma_nx)}`;
            window.open(printUrl, '_blank');
        }
    });

    document.getElementById('don-hang-form').addEventListener('submit', handleSaveDonHang);
    document.getElementById('cancel-dh-btn').addEventListener('click', () => document.getElementById('don-hang-modal').classList.add('hidden'));
    document.getElementById('add-dh-item-btn').addEventListener('click', () => addDonHangItemRow());
    
    // Listeners cho Image Yêu Cầu trong modal đơn hàng
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

    document.getElementById('dh-modal-image-upload').addEventListener('change', (e) => {
        processYcImageFile(e.target.files[0]);
    });

    document.getElementById('dh-image-paste-area').addEventListener('paste', (e) => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                processYcImageFile(file);
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
            const row = target.closest('.dh-item-row');
            updateDonHangItemInfo(row);
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
    
    // View Chi Tiết
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
            if (ma_sp) {
                await filterSanPhamFromChiTiet('ma_sp', ma_sp);
            }
        } else if (target.dataset.action === 'view-by-phu-trach') {
            const phu_trach = target.dataset.phuTrach;
            if (phu_trach) {
                await filterSanPhamFromChiTiet('phu_trach', phu_trach);
            }
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
        const formIds = ['ct-search', 'ct-filter-thoi-gian-from', 'ct-filter-thoi-gian-to', 'ct-filter-loai-don'];
        formIds.forEach(id => document.getElementById(id).value = '');
        
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


    // View Cài Đặt
    document.getElementById('profile-form').addEventListener('submit', handleProfileUpdate);
    document.getElementById('user-list-body').addEventListener('change', e => {
        if(e.target.classList.contains('user-role-select')) handleRoleChange(e);
    });
    document.getElementById('user-list-body').addEventListener('click', e => {
        const btn = e.target.closest('.reset-password-btn');
        if(btn) openPasswordResetModal(btn.dataset.gmail);
    });
    document.getElementById('password-reset-form').addEventListener('submit', handlePasswordReset);
    document.getElementById('cancel-reset-btn').addEventListener('click', () => {
        document.getElementById('password-reset-modal').classList.add('hidden');
        document.getElementById('password-reset-form').reset();
    });

    // Export buttons
    document.getElementById('sp-btn-excel').addEventListener('click', () => exportToExcel('sp'));
    document.getElementById('sp-btn-pdf').addEventListener('click', () => exportToPdf('sp'));
    document.getElementById('ct-btn-excel').addEventListener('click', () => exportToExcel('ct'));
    document.getElementById('ct-btn-pdf').addEventListener('click', () => exportToPdf('ct'));

    // Khởi tạo app
    checkSession();
});
