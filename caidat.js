import { sb, cache, currentUser, showLoading, showToast, showConfirm, DEFAULT_AVATAR_URL, updateSidebarAvatar, sanitizeFileName } from './app.js';

let selectedAvatarFile = null;

async function handleProfileUpdate(e) {
    e.preventDefault();
    const ho_ten = document.getElementById('profile-ho-ten').value;
    const old_password = document.getElementById('profile-old-password').value;
    const new_password = document.getElementById('profile-new-password').value;
    const confirm_password = document.getElementById('profile-confirm-password').value;
    let anh_dai_dien_url = document.getElementById('profile-current-avatar-url').value;
    const old_anh_dai_dien_url = currentUser.anh_dai_dien_url;


    if (currentUser.mat_khau !== old_password) {
        showToast("Mật khẩu cũ không chính xác.", 'error');
        return;
    }
    if (new_password && new_password !== confirm_password) {
        showToast("Mật khẩu mới không khớp.", 'error');
        return;
    }

    showLoading(true);

    try {
        if (selectedAvatarFile) {
            const safeFileName = sanitizeFileName(`${currentUser.gmail}-${Date.now()}-${selectedAvatarFile.name}`);
            const filePath = `public/${safeFileName}`;

            const { error: uploadError } = await sb.storage.from('anh_dai_dien').upload(filePath, selectedAvatarFile);
            if (uploadError) throw new Error(`Lỗi tải ảnh lên: ${uploadError.message}`);

            const { data: urlData } = sb.storage.from('anh_dai_dien').getPublicUrl(filePath);
            anh_dai_dien_url = urlData.publicUrl;

            if (old_anh_dai_dien_url) {
                const oldFileName = old_anh_dai_dien_url.split('/').pop();
                await sb.storage.from('anh_dai_dien').remove([`public/${oldFileName}`]);
            }
        } 
        else if (!anh_dai_dien_url && old_anh_dai_dien_url) {
             const oldFileName = old_anh_dai_dien_url.split('/').pop();
             await sb.storage.from('anh_dai_dien').remove([`public/${oldFileName}`]);
        }

        const updateData = { ho_ten, anh_dai_dien_url };
        if (new_password) {
            updateData.mat_khau = new_password;
        }

        const { data, error } = await sb.from('user').update(updateData).eq('gmail', currentUser.gmail).select().single();
        if (error) throw error;
        
        showToast("Cập nhật thông tin thành công!", 'success');
        sessionStorage.setItem('loggedInUser', JSON.stringify(data));
        
        Object.assign(currentUser, data);
        
        document.getElementById('profile-form').reset();
        document.getElementById('profile-ho-ten').value = data.ho_ten;
        updateSidebarAvatar(data.anh_dai_dien_url);
        initProfileAvatarState();

    } catch (error) {
        showToast(`Cập nhật thất bại: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

export async function fetchUsers(showLoader = true) {
    if (currentUser.phan_quyen !== 'Admin') return;
    if (showLoader) showLoading(true);
    try {
        const { data, error } = await sb.from('user').select('*').order('ho_ten');
        if (error) {
            showToast("Không thể tải danh sách nhân viên.", 'error');
        } else {
            cache.userList = data;
            renderUserList(data);
        }
    } finally {
        if (showLoader) showLoading(false);
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
                    <div class="flex-grow flex items-center gap-4">
                        <img src="${user.anh_dai_dien_url || DEFAULT_AVATAR_URL}" alt="Avatar" class="w-12 h-12 rounded-full object-cover">
                        <div>
                            <p class="font-semibold text-gray-900">${user.ho_ten}</p>
                            <p class="text-sm text-gray-600 break-all">${user.gmail}</p>
                        </div>
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
        e.target.value = originalRole;
        return;
    }

    showLoading(true);
    const { error } = await sb.from('user').update({ phan_quyen: newRole }).eq('gmail', gmail);
    showLoading(false);
    if (error) {
        showToast("Đổi quyền thất bại.", 'error');
        e.target.value = originalRole;
    } else {
        showToast("Đổi quyền thành công.", 'success');
        await fetchUsers();
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

function initProfileAvatarState() {
    selectedAvatarFile = null;
    const currentAvatarUrl = currentUser?.anh_dai_dien_url;
    const preview = document.getElementById('profile-image-preview');
    const removeBtn = document.getElementById('profile-remove-image-btn');
    const urlInput = document.getElementById('profile-current-avatar-url');
    
    preview.src = currentAvatarUrl || DEFAULT_AVATAR_URL;
    urlInput.value = currentAvatarUrl || '';
    removeBtn.classList.toggle('hidden', !currentAvatarUrl);
}

export function initCaiDatView() {
    document.getElementById('admin-panel').classList.toggle('hidden', currentUser.phan_quyen !== 'Admin');
    
    document.getElementById('profile-form').addEventListener('submit', handleProfileUpdate);
    
    if (currentUser.phan_quyen === 'Admin') {
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
    }
    
    const profileFormName = document.getElementById('profile-ho-ten');
    if (profileFormName) profileFormName.value = currentUser?.ho_ten || '';
    
    // Avatar logic
    const processAvatarFile = (file) => {
        if (file && file.type.startsWith('image/')) {
            selectedAvatarFile = file;
            const reader = new FileReader();
            reader.onload = (event) => {
                document.getElementById('profile-image-preview').src = event.target.result;
                document.getElementById('profile-remove-image-btn').classList.remove('hidden');
                document.getElementById('profile-current-avatar-url').value = 'temp-new-image'; // Mark as changed
            };
            reader.readAsDataURL(file);
        } else {
            showToast('Vui lòng chỉ chọn/dán file hình ảnh.', 'error');
        }
    };

    document.getElementById('profile-image-upload').addEventListener('change', (e) => processAvatarFile(e.target.files[0]));
    
    document.getElementById('profile-image-paste-area').addEventListener('paste', (e) => {
        e.preventDefault();
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                processAvatarFile(items[i].getAsFile());
                return;
            }
        }
        showToast('Không tìm thấy hình ảnh trong clipboard.', 'info');
    });

    document.getElementById('profile-remove-image-btn').addEventListener('click', () => {
        selectedAvatarFile = null;
        document.getElementById('profile-image-upload').value = '';
        document.getElementById('profile-image-preview').src = DEFAULT_AVATAR_URL;
        document.getElementById('profile-remove-image-btn').classList.add('hidden');
        document.getElementById('profile-current-avatar-url').value = ''; // Mark for removal
    });

    initProfileAvatarState();
}