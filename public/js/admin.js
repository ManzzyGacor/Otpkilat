/* ==========================================================================
   Logika Admin Dashboard.
   Semua data diambil dari endpoint /api/admin/* yang kini sudah terdaftar.
   ========================================================================== */
App.ready(function () {
    'use strict';

    if (!App.Session.requireLogin()) return;

    var esc = App.escapeHtml;
    var state = {
        users: { page: 1, search: '', role: '', totalPages: 1 },
        deposits: { status: 'pending' },
        orders: { search: '', status: '' },
        payments: []
    };

    /* ---------------------------- Penjaga ------------------------------- */

    async function boot() {
        try {
            var profile = await App.api.get('/api/user/me');
            if (profile.data.role !== 'admin') {
                App.toast('Halaman ini khusus admin.', 'error');
                setTimeout(function () { location.href = '/dashboard'; }, 1200);
                return;
            }
        } catch (error) {
            App.toast(error.message, 'error');
            return;
        }

        document.getElementById('guard').classList.add('hidden');
        document.getElementById('adminRoot').classList.remove('hidden');

        loadStats();
        loadProviderBalance();
        loadUsers();
    }

    /* ---------------------------- Statistik ----------------------------- */

    async function loadStats() {
        try {
            var result = await App.api.get('/api/admin/stats');
            var data = result.data;
            document.getElementById('statUsers').textContent = data.totalUsers;
            document.getElementById('statUsersSub').textContent = data.newUsersToday + ' baru hari ini';
            document.getElementById('statOrders').textContent = data.totalOrders;
            document.getElementById('statOrdersSub').textContent = data.ordersToday + ' hari ini';
            document.getElementById('statBalance').textContent = App.rupiah(data.totalBalanceInSystem);
            document.getElementById('statPending').textContent = data.pendingDeposits;
        } catch (error) {
            App.toast(error.message, 'error');
        }
    }

    async function loadProviderBalance() {
        var balanceEl = document.getElementById('providerBalance');
        var nameEl = document.getElementById('providerName');
        try {
            var result = await App.api.get('/api/admin/provider-balance');
            if (!result.success) {
                balanceEl.textContent = '-';
                nameEl.textContent = result.message || 'Tidak tersedia';
                return;
            }
            balanceEl.textContent = result.data.formated || App.rupiah(result.data.balance || 0);
            nameEl.textContent = result.data.username ? '@' + result.data.username : 'Akun provider';
        } catch (error) {
            balanceEl.textContent = '-';
            nameEl.textContent = 'Gagal memuat saldo provider';
        }
    }

    document.getElementById('refreshProvider').addEventListener('click', function () {
        loadProviderBalance();
        loadStats();
    });

    /* ------------------------------ Tab --------------------------------- */

    var LOADERS = {
        users: loadUsers,
        deposits: loadDeposits,
        orders: loadOrders,
        payments: loadPayments,
        announcements: loadAnnouncements,
        settings: loadSettings
    };

    document.querySelectorAll('.tab[data-panel]').forEach(function (tab) {
        tab.addEventListener('click', function () {
            var panel = tab.getAttribute('data-panel');
            document.querySelectorAll('.tab[data-panel]').forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            document.querySelectorAll('.panel-section').forEach(function (section) {
                section.classList.toggle('active', section.id === 'panel-' + panel);
            });
            if (LOADERS[panel]) LOADERS[panel]();
        });
    });

    function tableEmpty(message) {
        return '<div class="card empty-state"><i class="ph ph-tray"></i><p class="small">' + esc(message) + '</p></div>';
    }

    /* ---------------------------- Pengguna ------------------------------ */

    async function loadUsers() {
        var container = document.getElementById('userTable');
        container.innerHTML = '<div class="card center"><span class="spinner spinner-lg"></span></div>';

        try {
            var query = '/api/admin/users?page=' + state.users.page + '&limit=15' +
                '&search=' + encodeURIComponent(state.users.search) +
                '&role=' + encodeURIComponent(state.users.role);
            var result = await App.api.get(query);
            var users = result.data || [];

            if (!users.length) {
                container.innerHTML = tableEmpty('Tidak ada pengguna yang cocok.');
                document.getElementById('userPager').classList.add('hidden');
                return;
            }

            container.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
                '<th>Pengguna</th><th>Kontak</th><th>Saldo</th><th>Role</th><th>Status</th><th>Aksi</th>' +
                '</tr></thead><tbody>' +
                users.map(function (user) {
                    return '<tr>' +
                        '<td><div class="row" style="gap:9px">' +
                        '<img class="avatar avatar-sm" src="' + esc(user.avatarUrl) + '" alt="">' +
                        '<div><div style="font-weight:700">' + esc(user.fullName) + '</div>' +
                        '<div class="tiny soft">@' + esc(user.username) + '</div></div></div></td>' +
                        '<td class="small"><div>' + esc(user.email) + '</div>' +
                        '<div class="tiny soft">' + esc(user.phoneNumber || '-') + '</div></td>' +
                        '<td class="small"><strong>' + App.rupiah(user.balance) + '</strong></td>' +
                        '<td><span class="badge ' + (user.role === 'admin' ? 'badge-warning' : 'badge-primary') + '">' +
                        (user.role === 'admin' ? 'Admin' : 'User') + '</span></td>' +
                        '<td><span class="badge ' + (user.isActive ? 'badge-success' : 'badge-danger') + '">' +
                        (user.isActive ? 'Aktif' : 'Nonaktif') + '</span></td>' +
                        '<td><div class="cell-actions">' +
                        '<button class="btn btn-secondary btn-sm" data-edit-user="' + esc(user.id) + '"><i class="ph-bold ph-pencil-simple"></i></button>' +
                        '<button class="btn btn-danger btn-sm" data-delete-user="' + esc(user.id) + '" data-username="' + esc(user.username) + '"><i class="ph-bold ph-trash"></i></button>' +
                        '</div></td>' +
                        '</tr>';
                }).join('') +
                '</tbody></table></div>';

            container.querySelectorAll('[data-edit-user]').forEach(function (button) {
                button.addEventListener('click', function () { openUserModal(button.getAttribute('data-edit-user')); });
            });
            container.querySelectorAll('[data-delete-user]').forEach(function (button) {
                button.addEventListener('click', function () {
                    deleteUser(button.getAttribute('data-delete-user'), button.getAttribute('data-username'));
                });
            });

            var pagination = result.pagination || { page: 1, totalPages: 1 };
            state.users.totalPages = pagination.totalPages;
            var pager = document.getElementById('userPager');
            pager.classList.toggle('hidden', pagination.totalPages <= 1);
            document.getElementById('userPageInfo').textContent =
                'Hal ' + pagination.page + ' / ' + pagination.totalPages + ' (' + pagination.total + ' pengguna)';
            document.getElementById('userPrev').disabled = pagination.page <= 1;
            document.getElementById('userNext').disabled = pagination.page >= pagination.totalPages;
        } catch (error) {
            container.innerHTML = tableEmpty(error.message);
        }
    }

    document.getElementById('userSearch').addEventListener('input', App.debounce(function (event) {
        state.users.search = event.target.value.trim();
        state.users.page = 1;
        loadUsers();
    }, 350));

    document.getElementById('userRoleFilter').addEventListener('change', function (event) {
        state.users.role = event.target.value;
        state.users.page = 1;
        loadUsers();
    });

    document.getElementById('userRefresh').addEventListener('click', function () { loadUsers(); loadStats(); });
    document.getElementById('userPrev').addEventListener('click', function () {
        if (state.users.page > 1) { state.users.page--; loadUsers(); }
    });
    document.getElementById('userNext').addEventListener('click', function () {
        if (state.users.page < state.users.totalPages) { state.users.page++; loadUsers(); }
    });

    async function openUserModal(userId) {
        try {
            var result = await App.api.get('/api/admin/users/' + userId);
            var user = result.data.user;

            document.getElementById('editUserId').value = user.id;
            document.getElementById('editFullName').value = user.fullName;
            document.getElementById('editUsername').value = user.username;
            document.getElementById('editEmail').value = user.email;
            document.getElementById('editPhone').value = user.phoneNumber || '';
            document.getElementById('editRole').value = user.role;
            document.getElementById('editBalance').value = user.balance;
            document.getElementById('editActive').checked = user.isActive !== false;
            document.getElementById('editNotes').value = user.notes || '';
            document.getElementById('editPassword').value = '';

            App.Modal.open('userModal');
        } catch (error) {
            App.toast(error.message, 'error');
        }
    }

    document.getElementById('userForm').addEventListener('submit', async function (event) {
        event.preventDefault();

        var userId = document.getElementById('editUserId').value;
        var payload = {
            fullName: document.getElementById('editFullName').value.trim(),
            username: document.getElementById('editUsername').value.trim().toLowerCase(),
            email: document.getElementById('editEmail').value.trim().toLowerCase(),
            phoneNumber: document.getElementById('editPhone').value.trim(),
            role: document.getElementById('editRole').value,
            balance: Number(document.getElementById('editBalance').value),
            isActive: document.getElementById('editActive').checked,
            notes: document.getElementById('editNotes').value.trim()
        };

        var newPassword = document.getElementById('editPassword').value;
        if (newPassword) payload.newPassword = newPassword;

        var restore = App.loadingButton(document.getElementById('saveUserBtn'), 'Menyimpan...');
        try {
            var result = await App.api.put('/api/admin/users/' + userId, payload);
            App.toast(result.message || 'Data user disimpan.', 'success');
            App.Modal.close('userModal');
            loadUsers();
            loadStats();
        } catch (error) {
            App.toast(error.message, 'error');
        } finally {
            restore();
        }
    });

    async function deleteUser(userId, username) {
        if (!confirm('Hapus permanen akun @' + username + '? Tindakan ini tidak bisa dibatalkan.')) return;
        try {
            var result = await App.api.del('/api/admin/users/' + userId);
            App.toast(result.message, 'success');
            loadUsers();
            loadStats();
        } catch (error) {
            App.toast(error.message, 'error');
        }
    }

    document.getElementById('balanceForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        var restore = App.loadingButton(document.getElementById('adjustBtn'), 'Memproses...');
        try {
            var result = await App.api.post('/api/admin/adjust-balance', {
                username: document.getElementById('adjUsername').value.trim().toLowerCase(),
                amount: Number(document.getElementById('adjAmount').value),
                type: document.getElementById('adjType').value,
                note: document.getElementById('adjNote').value.trim()
            });
            App.toast(result.message, 'success');
            document.getElementById('balanceForm').reset();
            loadUsers();
            loadStats();
        } catch (error) {
            App.toast(error.message, 'error');
        } finally {
            restore();
        }
    });

    /* ----------------------------- Deposit ------------------------------ */

    var DEPOSIT_BADGE = {
        success: ['badge-success', 'Berhasil'],
        pending: ['badge-warning', 'Menunggu'],
        canceled: ['badge', 'Dibatalkan'],
        rejected: ['badge-danger', 'Ditolak'],
        failed: ['badge-danger', 'Gagal']
    };

    async function loadDeposits() {
        var container = document.getElementById('depositTable');
        container.innerHTML = '<div class="card center"><span class="spinner spinner-lg"></span></div>';

        try {
            var result = await App.api.get('/api/admin/deposits?limit=30&status=' + encodeURIComponent(state.deposits.status));
            var deposits = result.data || [];

            if (!deposits.length) {
                container.innerHTML = tableEmpty('Tidak ada deposit pada filter ini.');
                return;
            }

            container.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
                '<th>Waktu</th><th>Pengguna</th><th>Metode</th><th>Saldo</th><th>Bayar</th><th>Status</th><th>Aksi</th>' +
                '</tr></thead><tbody>' +
                deposits.map(function (deposit) {
                    var badge = DEPOSIT_BADGE[deposit.status] || ['badge', deposit.status];
                    var actions = deposit.status === 'pending'
                        ? '<div class="cell-actions">' +
                          '<button class="btn btn-success btn-sm" data-approve="' + esc(deposit._id) + '">Terima</button>' +
                          '<button class="btn btn-danger btn-sm" data-reject="' + esc(deposit._id) + '">Tolak</button></div>'
                        : '<span class="tiny soft">-</span>';

                    return '<tr>' +
                        '<td class="small">' + App.formatDate(deposit.createdAt, true) +
                        '<div class="tiny mono soft">' + esc(deposit.deposit_id) + '</div></td>' +
                        '<td class="small">' + (deposit.user ? '@' + esc(deposit.user.username) : '<span class="soft">dihapus</span>') + '</td>' +
                        '<td class="small">' + esc(deposit.methodName || deposit.method) + '</td>' +
                        '<td class="small"><strong>' + App.rupiah(deposit.amount) + '</strong></td>' +
                        '<td class="small">' + App.rupiah(deposit.payAmount) +
                        (deposit.uniqueCode ? '<div class="tiny soft">kode ' + deposit.uniqueCode + '</div>' : '') + '</td>' +
                        '<td><span class="badge ' + badge[0] + '">' + badge[1] + '</span></td>' +
                        '<td>' + actions + '</td>' +
                        '</tr>';
                }).join('') +
                '</tbody></table></div>';

            container.querySelectorAll('[data-approve]').forEach(function (button) {
                button.addEventListener('click', function () { handleDeposit(button, 'approve'); });
            });
            container.querySelectorAll('[data-reject]').forEach(function (button) {
                button.addEventListener('click', function () { handleDeposit(button, 'reject'); });
            });
        } catch (error) {
            container.innerHTML = tableEmpty(error.message);
        }
    }

    async function handleDeposit(button, action) {
        var id = button.getAttribute('data-' + action);
        var label = action === 'approve' ? 'Terima deposit ini dan tambahkan saldo user?' : 'Tolak deposit ini?';
        if (!confirm(label)) return;

        var restore = App.loadingButton(button, '...');
        try {
            var result = await App.api.post('/api/admin/deposits/' + id + '/' + action, {});
            App.toast(result.message, 'success');
            loadDeposits();
            loadStats();
        } catch (error) {
            App.toast(error.message, 'error');
            restore();
        }
    }

    document.getElementById('depositStatusFilter').addEventListener('change', function (event) {
        state.deposits.status = event.target.value;
        loadDeposits();
    });
    document.getElementById('depositRefresh').addEventListener('click', loadDeposits);

    /* ----------------------------- Pesanan ------------------------------ */

    var ORDER_BADGE = {
        completed: ['badge-success', 'Selesai'],
        received: ['badge-warning', 'Berjalan'],
        pending: ['badge-warning', 'Berjalan'],
        canceled: ['badge', 'Dibatalkan'],
        expiring: ['badge', 'Kedaluwarsa']
    };

    async function loadOrders() {
        var container = document.getElementById('orderTable');
        container.innerHTML = '<div class="card center"><span class="spinner spinner-lg"></span></div>';

        try {
            var result = await App.api.get('/api/admin/orders?limit=30' +
                '&status=' + encodeURIComponent(state.orders.status) +
                '&search=' + encodeURIComponent(state.orders.search));
            var orders = result.data || [];

            if (!orders.length) {
                container.innerHTML = tableEmpty('Tidak ada pesanan pada filter ini.');
                return;
            }

            container.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
                '<th>Waktu</th><th>Pengguna</th><th>Layanan</th><th>Nomor</th><th>OTP</th><th>Harga</th><th>Status</th>' +
                '</tr></thead><tbody>' +
                orders.map(function (order) {
                    var badge = ORDER_BADGE[order.status] || ['badge', order.status];
                    return '<tr>' +
                        '<td class="small">' + App.formatDate(order.createdAt, true) +
                        '<div class="tiny mono soft">' + esc(order.orderId) + '</div></td>' +
                        '<td class="small">' + (order.user ? '@' + esc(order.user.username) : '<span class="soft">dihapus</span>') + '</td>' +
                        '<td class="small">' + esc(order.service) + '<div class="tiny soft">' + esc(order.country) + '</div></td>' +
                        '<td class="small mono">' + esc(order.phoneNumber) + '</td>' +
                        '<td class="small mono">' + (order.otpCode ? esc(order.otpCode) : '<span class="soft">-</span>') + '</td>' +
                        '<td class="small">' + App.rupiah(order.price) + '</td>' +
                        '<td><span class="badge ' + badge[0] + '">' + badge[1] + '</span></td>' +
                        '</tr>';
                }).join('') +
                '</tbody></table></div>';
        } catch (error) {
            container.innerHTML = tableEmpty(error.message);
        }
    }

    document.getElementById('orderSearch').addEventListener('input', App.debounce(function (event) {
        state.orders.search = event.target.value.trim();
        loadOrders();
    }, 350));
    document.getElementById('orderStatusFilter').addEventListener('change', function (event) {
        state.orders.status = event.target.value;
        loadOrders();
    });
    document.getElementById('orderRefresh').addEventListener('click', loadOrders);

    /* ------------------------ Metode pembayaran ------------------------- */

    async function loadPayments() {
        var container = document.getElementById('paymentList');
        container.innerHTML = '<div class="card center"><span class="spinner spinner-lg"></span></div>';

        try {
            var result = await App.api.get('/api/admin/payment-methods');
            state.payments = result.data || [];

            if (!state.payments.length) {
                container.innerHTML = tableEmpty('Belum ada metode pembayaran. Tambahkan lewat tombol di atas.');
                return;
            }

            container.innerHTML = '<div class="table-wrap"><table><thead><tr>' +
                '<th>Metode</th><th>Mode</th><th>Batas</th><th>Biaya</th><th>Status</th><th>Aksi</th>' +
                '</tr></thead><tbody>' +
                state.payments.map(function (method) {
                    var fee = [];
                    if (method.feePercent) fee.push(method.feePercent + '%');
                    if (method.feeFlat) fee.push(App.rupiah(method.feeFlat));

                    return '<tr>' +
                        '<td><div style="font-weight:700">' + esc(method.name) + '</div>' +
                        '<div class="tiny mono soft">' + esc(method.code) + '</div></td>' +
                        '<td><span class="badge ' + (method.mode === 'gateway' ? 'badge-info' : 'badge') + '">' +
                        (method.mode === 'gateway' ? 'Gateway' : 'Manual') + '</span></td>' +
                        '<td class="small">' + App.rupiah(method.minAmount) + ' - ' + App.rupiah(method.maxAmount) + '</td>' +
                        '<td class="small">' + (fee.length ? fee.join(' + ') : '<span class="soft">gratis</span>') + '</td>' +
                        '<td><span class="badge ' + (method.isActive ? 'badge-success' : 'badge') + '">' +
                        (method.isActive ? 'Aktif' : 'Nonaktif') + '</span></td>' +
                        '<td><div class="cell-actions">' +
                        '<button class="btn btn-secondary btn-sm" data-edit-payment="' + esc(method._id) + '"><i class="ph-bold ph-pencil-simple"></i></button>' +
                        '<button class="btn btn-danger btn-sm" data-delete-payment="' + esc(method._id) + '" data-name="' + esc(method.name) + '"><i class="ph-bold ph-trash"></i></button>' +
                        '</div></td>' +
                        '</tr>';
                }).join('') +
                '</tbody></table></div>';

            container.querySelectorAll('[data-edit-payment]').forEach(function (button) {
                button.addEventListener('click', function () { openPaymentModal(button.getAttribute('data-edit-payment')); });
            });
            container.querySelectorAll('[data-delete-payment]').forEach(function (button) {
                button.addEventListener('click', async function () {
                    if (!confirm('Hapus metode "' + button.getAttribute('data-name') + '"?')) return;
                    try {
                        var response = await App.api.del('/api/admin/payment-methods/' + button.getAttribute('data-delete-payment'));
                        App.toast(response.message, 'success');
                        loadPayments();
                    } catch (error) {
                        App.toast(error.message, 'error');
                    }
                });
            });
        } catch (error) {
            container.innerHTML = tableEmpty(error.message);
        }
    }

    function toggleGatewayFields() {
        var isGateway = document.getElementById('payMode').value === 'gateway';
        document.getElementById('gatewayFields').classList.toggle('hidden', !isGateway);
        document.getElementById('manualFields').classList.toggle('hidden', isGateway);
    }
    document.getElementById('payMode').addEventListener('change', toggleGatewayFields);

    function openPaymentModal(methodId) {
        var method = methodId
            ? state.payments.filter(function (m) { return m._id === methodId; })[0]
            : null;

        document.getElementById('paymentModalTitle').textContent = method ? 'Edit Metode Pembayaran' : 'Tambah Metode Pembayaran';
        document.getElementById('paymentId').value = method ? method._id : '';

        var code = document.getElementById('payCode');
        code.value = method ? method.code : '';
        code.disabled = Boolean(method); // kode dikunci agar riwayat lama tetap cocok

        document.getElementById('payName').value = method ? method.name : '';
        document.getElementById('payMode').value = method ? method.mode : 'manual';
        document.getElementById('payProviderId').value = method ? method.providerPaymentId : '';
        document.getElementById('payVersion').value = method ? method.providerVersion : 'v1';
        document.getElementById('payAccountName').value = method ? method.accountName : '';
        document.getElementById('payAccountNumber').value = method ? method.accountNumber : '';
        document.getElementById('payQr').value = method ? method.qrImageUrl : '';
        document.getElementById('payLogo').value = method ? method.logoUrl : '';
        document.getElementById('payFeePercent').value = method ? method.feePercent : 0;
        document.getElementById('payFeeFlat').value = method ? method.feeFlat : 0;
        document.getElementById('payMin').value = method ? method.minAmount : 5000;
        document.getElementById('payMax').value = method ? method.maxAmount : 1000000;
        document.getElementById('payInstructions').value = method ? method.instructions : '';
        document.getElementById('paySort').value = method ? method.sortOrder : 0;
        document.getElementById('payActive').checked = method ? method.isActive : true;
        document.getElementById('payUnique').checked = method ? method.useUniqueCode : true;

        toggleGatewayFields();
        App.Modal.open('paymentModal');
    }

    document.getElementById('addPaymentBtn').addEventListener('click', function () { openPaymentModal(null); });

    document.getElementById('paymentForm').addEventListener('submit', async function (event) {
        event.preventDefault();

        var methodId = document.getElementById('paymentId').value;
        var payload = {
            name: document.getElementById('payName').value.trim(),
            mode: document.getElementById('payMode').value,
            providerPaymentId: document.getElementById('payProviderId').value.trim(),
            providerVersion: document.getElementById('payVersion').value,
            accountName: document.getElementById('payAccountName').value.trim(),
            accountNumber: document.getElementById('payAccountNumber').value.trim(),
            qrImageUrl: document.getElementById('payQr').value.trim(),
            logoUrl: document.getElementById('payLogo').value.trim(),
            feePercent: Number(document.getElementById('payFeePercent').value) || 0,
            feeFlat: Number(document.getElementById('payFeeFlat').value) || 0,
            minAmount: Number(document.getElementById('payMin').value) || 0,
            maxAmount: Number(document.getElementById('payMax').value) || 0,
            instructions: document.getElementById('payInstructions').value.trim(),
            sortOrder: Number(document.getElementById('paySort').value) || 0,
            isActive: document.getElementById('payActive').checked,
            useUniqueCode: document.getElementById('payUnique').checked
        };
        if (!methodId) payload.code = document.getElementById('payCode').value.trim();

        if (payload.maxAmount < payload.minAmount) {
            return App.toast('Nominal maksimum harus lebih besar dari minimum.', 'error');
        }

        var restore = App.loadingButton(document.getElementById('savePaymentBtn'), 'Menyimpan...');
        try {
            var result = methodId
                ? await App.api.put('/api/admin/payment-methods/' + methodId, payload)
                : await App.api.post('/api/admin/payment-methods', payload);
            App.toast(result.message, 'success');
            App.Modal.close('paymentModal');
            loadPayments();
        } catch (error) {
            App.toast(error.message, 'error');
        } finally {
            restore();
        }
    });

    /* ---------------------------- Pengumuman ---------------------------- */

    async function loadAnnouncements() {
        var container = document.getElementById('announcementList');
        container.innerHTML = '<div class="card center"><span class="spinner"></span></div>';

        try {
            var result = await App.api.get('/api/admin/announcements');
            var items = result.data || [];

            if (!items.length) {
                container.innerHTML = tableEmpty('Belum ada pengumuman.');
                return;
            }

            container.innerHTML = items.map(function (item) {
                return '<div class="card" style="margin-bottom:11px">' +
                    '<div class="row-between" style="margin-bottom:7px">' +
                    '<strong class="small">' + esc(item.title) + '</strong>' +
                    '<span class="badge ' + (item.isActive ? 'badge-success' : 'badge') + '">' +
                    (item.isActive ? 'Tampil' : 'Disembunyikan') + '</span>' +
                    '</div>' +
                    '<p class="small muted" style="white-space:pre-wrap;margin-bottom:11px">' + esc(item.content) + '</p>' +
                    '<div class="row-between">' +
                    '<span class="tiny soft">' + App.formatDate(item.createdAt, true) + '</span>' +
                    '<div class="cell-actions">' +
                    '<button class="btn btn-secondary btn-sm" data-toggle-announcement="' + esc(item._id) + '">' +
                    (item.isActive ? 'Sembunyikan' : 'Tampilkan') + '</button>' +
                    '<button class="btn btn-danger btn-sm" data-delete-announcement="' + esc(item._id) + '">Hapus</button>' +
                    '</div></div></div>';
            }).join('');

            container.querySelectorAll('[data-toggle-announcement]').forEach(function (button) {
                button.addEventListener('click', async function () {
                    try {
                        var response = await App.api.patch('/api/announcements/' + button.getAttribute('data-toggle-announcement') + '/toggle', {});
                        App.toast(response.message, 'success');
                        loadAnnouncements();
                    } catch (error) { App.toast(error.message, 'error'); }
                });
            });

            container.querySelectorAll('[data-delete-announcement]').forEach(function (button) {
                button.addEventListener('click', async function () {
                    if (!confirm('Hapus pengumuman ini?')) return;
                    try {
                        var response = await App.api.del('/api/announcements/' + button.getAttribute('data-delete-announcement'));
                        App.toast(response.message, 'success');
                        loadAnnouncements();
                    } catch (error) { App.toast(error.message, 'error'); }
                });
            });
        } catch (error) {
            container.innerHTML = tableEmpty(error.message);
        }
    }

    document.getElementById('announcementForm').addEventListener('submit', async function (event) {
        event.preventDefault();
        var restore = App.loadingButton(document.getElementById('announceBtn'), 'Menerbitkan...');
        try {
            await App.api.post('/api/announcements/add', {
                title: document.getElementById('announceTitle').value.trim(),
                content: document.getElementById('announceContent').value.trim()
            });
            App.toast('Pengumuman diterbitkan.', 'success');
            document.getElementById('announcementForm').reset();
            loadAnnouncements();
        } catch (error) {
            App.toast(error.message, 'error');
        } finally {
            restore();
        }
    });

    /* ---------------------------- Pengaturan ---------------------------- */

    async function loadSettings() {
        try {
            var result = await App.api.get('/api/admin/settings');
            var data = result.data;

            document.getElementById('setSiteName').value = data.siteName || '';
            document.getElementById('setTagline').value = data.siteTagline || '';
            document.getElementById('setSupportUrl').value = data.supportUrl || '';
            document.getElementById('setMargin').value = data.marginProfit || 0;
            document.getElementById('setDepositMin').value = data.depositMin || 0;
            document.getElementById('setDepositMax').value = data.depositMax || 0;
            document.getElementById('setProviderUrl').value = data.providerBaseUrl || '';
            document.getElementById('setGoogleId').value = data.googleClientId || '';
            document.getElementById('setGoogleCallback').value = data.googleCallbackUrl || '';
            document.getElementById('setTelegramChat').value = data.telegramChatId || '';
            document.getElementById('setGithubOwner').value = data.githubOwner || '';
            document.getElementById('setGithubRepo').value = data.githubRepo || '';
            document.getElementById('setMaintenance').checked = Boolean(data.maintenanceMode);
            document.getElementById('setMaintenanceMessage').value = data.maintenanceMessage || '';

            // Nilai rahasia tidak pernah dikirim utuh ke browser; kolomnya
            // dibiarkan kosong dan hanya diberi keterangan status.
            secretHint('hintProviderKey', data.providerApiKeySet, data.providerApiKey);
            secretHint('hintGoogleSecret', data.googleClientSecretSet, data.googleClientSecret);
            secretHint('hintTelegramToken', data.telegramBotTokenSet, data.telegramBotToken);
            secretHint('hintGithubToken', data.githubTokenSet, data.githubToken);
        } catch (error) {
            App.toast(error.message, 'error');
        }
    }

    function secretHint(elementId, isSet, masked) {
        document.getElementById(elementId).textContent = isSet
            ? 'Tersimpan (' + masked + '). Isi hanya bila ingin mengganti.'
            : 'Belum diatur.';
    }

    document.getElementById('settingsForm').addEventListener('submit', async function (event) {
        event.preventDefault();

        var payload = {
            siteName: document.getElementById('setSiteName').value.trim(),
            siteTagline: document.getElementById('setTagline').value.trim(),
            supportUrl: document.getElementById('setSupportUrl').value.trim(),
            marginProfit: Number(document.getElementById('setMargin').value) || 0,
            depositMin: Number(document.getElementById('setDepositMin').value) || 0,
            depositMax: Number(document.getElementById('setDepositMax').value) || 0,
            providerBaseUrl: document.getElementById('setProviderUrl').value.trim(),
            googleClientId: document.getElementById('setGoogleId').value.trim(),
            googleCallbackUrl: document.getElementById('setGoogleCallback').value.trim(),
            telegramChatId: document.getElementById('setTelegramChat').value.trim(),
            githubOwner: document.getElementById('setGithubOwner').value.trim(),
            githubRepo: document.getElementById('setGithubRepo').value.trim(),
            maintenanceMode: document.getElementById('setMaintenance').checked,
            maintenanceMessage: document.getElementById('setMaintenanceMessage').value.trim()
        };

        // Rahasia hanya dikirim bila admin benar-benar mengisinya.
        var secrets = {
            providerApiKey: 'setProviderKey',
            googleClientSecret: 'setGoogleSecret',
            telegramBotToken: 'setTelegramToken',
            githubToken: 'setGithubToken'
        };
        Object.keys(secrets).forEach(function (field) {
            var value = document.getElementById(secrets[field]).value.trim();
            if (value) payload[field] = value;
        });

        var restore = App.loadingButton(document.getElementById('saveSettingsBtn'), 'Menyimpan...');
        try {
            var result = await App.api.post('/api/admin/settings', payload);
            App.toast(result.message, 'success');
            // Kosongkan kolom rahasia agar tidak tersimpan di form.
            Object.keys(secrets).forEach(function (field) { document.getElementById(secrets[field]).value = ''; });
            loadSettings();
        } catch (error) {
            App.toast(error.message, 'error');
        } finally {
            restore();
        }
    });

    boot();
});
