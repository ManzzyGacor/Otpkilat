/* ==========================================================================
   Utilitas bersama seluruh halaman KilatOTP.
   Menangani tema terang/gelap, pemanggilan API, notifikasi, dan format data.
   ========================================================================== */
(function (global) {
    'use strict';

    /* ----------------------------- Tema ---------------------------------- */

    var THEME_KEY = 'kilatotp-theme';

    var Theme = {
        /** Tema tersimpan: 'light', 'dark', atau null bila mengikuti sistem. */
        stored: function () {
            try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; }
        },
        systemPrefersDark: function () {
            return global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches;
        },
        current: function () {
            var stored = Theme.stored();
            if (stored === 'light' || stored === 'dark') return stored;
            return Theme.systemPrefersDark() ? 'dark' : 'light';
        },
        apply: function (theme) {
            var root = document.documentElement;
            if (theme === 'light' || theme === 'dark') {
                root.setAttribute('data-theme', theme);
            } else {
                root.removeAttribute('data-theme');
            }
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', Theme.current() === 'dark' ? '#0b0f1d' : '#f7f8fc');
        },
        set: function (theme) {
            try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* mode privat */ }
            Theme.apply(theme);
        },
        toggle: function () {
            var next = Theme.current() === 'dark' ? 'light' : 'dark';
            Theme.set(next);
            return next;
        },
        /** Pasang aksi pada semua tombol dengan atribut data-theme-toggle. */
        bindToggles: function () {
            var buttons = document.querySelectorAll('[data-theme-toggle]');
            Array.prototype.forEach.call(buttons, function (btn) {
                if (btn.dataset.themeBound === '1') return;
                btn.dataset.themeBound = '1';
                btn.setAttribute('aria-label', 'Ganti mode terang atau gelap');
                btn.addEventListener('click', function () { Theme.toggle(); });
            });
        },
        init: function () {
            Theme.apply(Theme.stored());
            // Ikuti perubahan tema sistem selama user belum memilih manual.
            if (global.matchMedia) {
                var mq = global.matchMedia('(prefers-color-scheme: dark)');
                var onChange = function () { if (!Theme.stored()) Theme.apply(null); };
                if (mq.addEventListener) mq.addEventListener('change', onChange);
                else if (mq.addListener) mq.addListener(onChange);
            }
        }
    };

    Theme.init();

    /* --------------------------- Notifikasi ------------------------------ */

    var ICONS = {
        success: 'ph-fill ph-check-circle',
        error: 'ph-fill ph-warning-circle',
        warning: 'ph-fill ph-warning',
        info: 'ph-fill ph-info'
    };

    function toastHost() {
        var host = document.getElementById('toastHost');
        if (!host) {
            host = document.createElement('div');
            host.id = 'toastHost';
            document.body.appendChild(host);
        }
        return host;
    }

    function toast(message, type, timeout) {
        if (!message) return;
        var kind = ICONS[type] ? type : 'info';
        var el = document.createElement('div');
        el.className = 'toast toast-' + kind;
        el.setAttribute('role', kind === 'error' ? 'alert' : 'status');

        var icon = document.createElement('i');
        icon.className = ICONS[kind];
        var text = document.createElement('span');
        text.textContent = message; // textContent mencegah penyisipan HTML
        el.appendChild(icon);
        el.appendChild(text);

        toastHost().appendChild(el);
        var ms = timeout || (kind === 'error' ? 5000 : 3200);
        setTimeout(function () {
            el.classList.add('closing');
            setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
        }, ms);
    }

    /* ----------------------------- Sesi ---------------------------------- */

    var Session = {
        token: function () {
            try { return localStorage.getItem('token'); } catch (e) { return null; }
        },
        user: function () {
            try { return JSON.parse(localStorage.getItem('user') || 'null'); } catch (e) { return null; }
        },
        save: function (token, user) {
            try {
                localStorage.setItem('token', token);
                localStorage.setItem('user', JSON.stringify(user || {}));
            } catch (e) { /* mode privat */ }
        },
        clear: function () {
            try {
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            } catch (e) { /* abaikan */ }
        },
        logout: function () {
            Session.clear();
            global.location.href = '/login';
        },
        /** Halaman aplikasi memanggil ini; mengembalikan false bila belum login. */
        requireLogin: function () {
            if (Session.token()) return true;
            var next = encodeURIComponent(global.location.pathname + global.location.search);
            global.location.replace('/login?next=' + next);
            return false;
        }
    };

    /* ------------------------------ API ---------------------------------- */

    function ApiError(message, status, payload) {
        this.name = 'ApiError';
        this.message = message;
        this.status = status;
        this.payload = payload;
    }
    ApiError.prototype = Object.create(Error.prototype);

    /**
     * Pemanggil API tunggal: menyisipkan token, menyeragamkan pesan error,
     * dan otomatis mengeluarkan user saat sesi kedaluwarsa.
     */
    async function api(path, options) {
        var opts = options || {};
        var headers = Object.assign({}, opts.headers || {});
        var token = Session.token();
        if (token) headers.Authorization = 'Bearer ' + token;

        var body = opts.body;
        if (body && !(body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
            body = typeof body === 'string' ? body : JSON.stringify(body);
        }

        var response;
        try {
            response = await fetch(path, { method: opts.method || 'GET', headers: headers, body: body });
        } catch (networkError) {
            throw new ApiError('Koneksi ke server gagal. Periksa jaringan Anda.', 0, null);
        }

        var payload = null;
        try { payload = await response.json(); } catch (e) { payload = null; }

        if (response.status === 401 && token) {
            Session.clear();
            toast('Sesi Anda berakhir. Silakan login kembali.', 'warning');
            setTimeout(function () { global.location.href = '/login'; }, 1200);
            throw new ApiError('Sesi berakhir.', 401, payload);
        }

        if (!response.ok || (payload && payload.success === false)) {
            var message = (payload && payload.message) || 'Permintaan gagal diproses.';
            throw new ApiError(message, response.status, payload);
        }

        return payload;
    }

    api.get = function (path) { return api(path); };
    api.post = function (path, body) { return api(path, { method: 'POST', body: body }); };
    api.put = function (path, body) { return api(path, { method: 'PUT', body: body }); };
    api.patch = function (path, body) { return api(path, { method: 'PATCH', body: body }); };
    api.del = function (path) { return api(path, { method: 'DELETE' }); };

    /* ---------------------------- Format --------------------------------- */

    function rupiah(value) {
        var number = Number(value) || 0;
        return 'Rp' + number.toLocaleString('id-ID');
    }

    function formatDate(value, withTime) {
        if (!value) return '-';
        var date = new Date(value);
        if (isNaN(date.getTime())) return '-';
        var opts = { day: 'numeric', month: 'short', year: 'numeric' };
        if (withTime) { opts.hour = '2-digit'; opts.minute = '2-digit'; }
        return date.toLocaleDateString('id-ID', opts);
    }

    function timeAgo(value) {
        var diff = Date.now() - new Date(value).getTime();
        if (isNaN(diff)) return '-';
        var mins = Math.floor(diff / 60000);
        if (mins < 1) return 'baru saja';
        if (mins < 60) return mins + ' menit lalu';
        var hours = Math.floor(mins / 60);
        if (hours < 24) return hours + ' jam lalu';
        return Math.floor(hours / 24) + ' hari lalu';
    }

    function greeting() {
        var hour = new Date().getHours();
        if (hour >= 5 && hour < 11) return 'Selamat pagi';
        if (hour >= 11 && hour < 15) return 'Selamat siang';
        if (hour >= 15 && hour < 18) return 'Selamat sore';
        return 'Selamat malam';
    }

    /** Escape HTML sebelum menyisipkan data dari server ke innerHTML. */
    function escapeHtml(value) {
        return String(value === undefined || value === null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    async function copyText(text, successMessage) {
        try {
            if (navigator.clipboard && global.isSecureContext) {
                await navigator.clipboard.writeText(text);
            } else {
                var area = document.createElement('textarea');
                area.value = text;
                area.style.position = 'fixed';
                area.style.opacity = '0';
                document.body.appendChild(area);
                area.select();
                document.execCommand('copy');
                document.body.removeChild(area);
            }
            toast(successMessage || 'Disalin ke papan klip.', 'success', 1800);
        } catch (e) {
            toast('Gagal menyalin. Salin manual ya.', 'error');
        }
    }

    function debounce(fn, wait) {
        var timer;
        return function () {
            var args = arguments, ctx = this;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(ctx, args); }, wait || 320);
        };
    }

    /** Ubah tombol menjadi status memuat dan kembalikan fungsi pemulihnya. */
    function loadingButton(button, label) {
        if (!button) return function () {};
        var original = button.innerHTML;
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> ' + (label || 'Memproses...');
        return function () {
            button.disabled = false;
            button.innerHTML = original;
        };
    }

    /* ---------------------------- Modal ---------------------------------- */

    var Modal = {
        open: function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.classList.add('open');
            document.body.style.overflow = 'hidden';
        },
        close: function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.classList.remove('open');
            document.body.style.overflow = '';
        },
        /** Tutup saat klik area gelap atau menekan Escape. */
        bind: function () {
            document.addEventListener('click', function (event) {
                if (event.target.classList && event.target.classList.contains('modal-backdrop')) {
                    event.target.classList.remove('open');
                    document.body.style.overflow = '';
                }
                var closer = event.target.closest && event.target.closest('[data-modal-close]');
                if (closer) Modal.close(closer.getAttribute('data-modal-close'));
            });
            document.addEventListener('keydown', function (event) {
                if (event.key !== 'Escape') return;
                var open = document.querySelector('.modal-backdrop.open');
                if (open) {
                    open.classList.remove('open');
                    document.body.style.overflow = '';
                }
            });
        }
    };


    /* ----------------------------- Gerak --------------------------------- */

    var Motion = {
        /** Pengguna yang meminta animasi dikurangi tidak diberi gerakan tambahan. */
        reduced: function () {
            return global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
        },

        /**
         * Tampilkan elemen saat tergulir mendekat.
         * Memakai IntersectionObserver; bila tidak tersedia, semua langsung tampil.
         */
        revealOnScroll: function (root) {
            var targets = (root || document).querySelectorAll('[data-reveal]:not(.revealed)');
            if (!targets.length) return;

            if (Motion.reduced() || !global.IntersectionObserver) {
                Array.prototype.forEach.call(targets, function (el) { el.classList.add('revealed'); });
                return;
            }

            var observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    // Jeda berjenjang supaya sekelompok kartu tidak muncul serentak.
                    var delay = Number(entry.target.getAttribute('data-reveal-delay')) || 0;
                    setTimeout(function () { entry.target.classList.add('revealed'); }, delay);
                    observer.unobserve(entry.target);
                });
            }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

            Array.prototype.forEach.call(targets, function (el) { observer.observe(el); });
        },

        /** Beri jeda berurutan pada anak-anak sebuah wadah. */
        stagger: function (container, step) {
            if (!container) return;
            var gap = step || 55;
            Array.prototype.forEach.call(container.children, function (child, index) {
                child.setAttribute('data-reveal', '');
                child.setAttribute('data-reveal-delay', String(index * gap));
            });
            Motion.revealOnScroll(container);
        },

        /** Riak kecil di titik sentuh tombol. */
        bindRipples: function () {
            document.addEventListener('pointerdown', function (event) {
                if (Motion.reduced()) return;
                var button = event.target.closest && event.target.closest('.btn');
                if (!button || button.disabled) return;

                var rect = button.getBoundingClientRect();
                var size = Math.max(rect.width, rect.height);
                var ripple = document.createElement('span');
                ripple.className = 'ripple';
                ripple.style.width = ripple.style.height = size + 'px';
                ripple.style.left = (event.clientX - rect.left - size / 2) + 'px';
                ripple.style.top = (event.clientY - rect.top - size / 2) + 'px';
                button.appendChild(ripple);
                setTimeout(function () { if (ripple.parentNode) ripple.parentNode.removeChild(ripple); }, 600);
            });
        },

        /** Hitung angka naik menuju nilai akhir, misalnya saldo. */
        countUp: function (el, to, format) {
            if (!el) return;
            var render = format || function (v) { return String(v); };
            var from = Number(el.getAttribute('data-value')) || 0;
            el.setAttribute('data-value', String(to));

            if (Motion.reduced() || from === to) {
                el.textContent = render(to);
                return;
            }

            var duration = 620;
            var start = performance.now();
            var step = function (now) {
                var progress = Math.min(1, (now - start) / duration);
                // easeOutCubic: cepat di awal, melambat di akhir
                var eased = 1 - Math.pow(1 - progress, 3);
                el.textContent = render(Math.round(from + (to - from) * eased));
                if (progress < 1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
        },

        /** Tandai perubahan nilai dengan denyut singkat. */
        flip: function (el) {
            if (!el || Motion.reduced()) return;
            el.classList.remove('value-flip');
            void el.offsetWidth; // paksa ulang animasi
            el.classList.add('value-flip');
        },

        /** Bilah tipis di atas layar saat berpindah halaman. */
        progress: function () {
            var bar = document.getElementById('pageProgress');
            if (!bar) {
                bar = document.createElement('div');
                bar.id = 'pageProgress';
                document.body.appendChild(bar);
            }
            bar.style.opacity = '1';
            bar.style.width = '70%';
            return function () {
                bar.style.width = '100%';
                setTimeout(function () { bar.style.opacity = '0'; }, 180);
            };
        },

        /** Navigasi antar halaman dengan pudar singkat, bukan kedipan putih. */
        bindPageTransitions: function () {
            if (Motion.reduced()) return;

            document.addEventListener('click', function (event) {
                var link = event.target.closest && event.target.closest('a[href]');
                if (!link) return;
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

                var href = link.getAttribute('href');
                if (!href || href.charAt(0) === '#') return;
                if (link.target === '_blank' || link.hasAttribute('download')) return;

                // Hanya tautan internal di situs yang sama
                var url;
                try { url = new URL(href, location.href); } catch (e) { return; }
                if (url.origin !== location.origin) return;
                if (url.pathname === location.pathname && url.hash) return;

                event.preventDefault();
                var done = Motion.progress();
                document.body.style.transition = 'opacity 160ms var(--ease, ease)';
                document.body.style.opacity = '0.35';
                setTimeout(function () { done(); location.href = url.href; }, 150);
            });

            // Saat kembali lewat tombol back, halaman bisa tersisa pudar.
            global.addEventListener('pageshow', function () {
                document.body.style.opacity = '';
            });
        },

        init: function () {
            Motion.bindRipples();
            Motion.bindPageTransitions();
            Motion.revealOnScroll();
        }
    };

    /* ------------------------ Konfigurasi situs --------------------------- */

    var configPromise = null;
    function siteConfig() {
        if (!configPromise) {
            configPromise = fetch('/api/config')
                .then(function (r) { return r.json(); })
                .then(function (j) { return (j && j.data) || {}; })
                .catch(function () { return {}; });
        }
        return configPromise;
    }

    function ready(fn) {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
        else fn();
    }

    /** Tampilkan pita peringatan bila admin mengaktifkan mode perbaikan. */
    function maintenanceBanner() {
        siteConfig().then(function (config) {
            if (!config.maintenanceMode) return;
            var bar = document.createElement('div');
            bar.setAttribute('role', 'status');
            bar.style.cssText = 'padding:11px 16px;text-align:center;font-size:13px;font-weight:700;' +
                'background:var(--warning-soft);color:var(--warning);border-bottom:1px solid var(--border)';
            bar.textContent = config.maintenanceMessage || 'Sistem sedang dalam perbaikan.';
            document.body.insertBefore(bar, document.body.firstChild);
        });
    }

    ready(function () {
        Theme.bindToggles();
        Modal.bind();
        maintenanceBanner();
        Motion.init();
        // Tandai menu navigasi bawah yang sesuai halaman aktif.
        var path = global.location.pathname.replace(/\/$/, '') || '/';
        Array.prototype.forEach.call(document.querySelectorAll('.bottom-nav a'), function (link) {
            var href = link.getAttribute('href').replace(/\/$/, '') || '/';
            if (href === path) link.classList.add('active');
        });
    });

    global.App = {
        Theme: Theme,
        Motion: Motion,
        Session: Session,
        Modal: Modal,
        api: api,
        ApiError: ApiError,
        toast: toast,
        rupiah: rupiah,
        formatDate: formatDate,
        timeAgo: timeAgo,
        greeting: greeting,
        escapeHtml: escapeHtml,
        copyText: copyText,
        debounce: debounce,
        loadingButton: loadingButton,
        siteConfig: siteConfig,
        ready: ready
    };
}(window));
