// =====================================================================
// KONFIGURASI SUPABASE
// =====================================================================
const SUPABASE_URL = "https://fmhbmjktgrtjgxqnwjjn.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_dM03sEJvH-41yPf-oKNP2g_8fOEnEZh";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// State Aplikasi
const state = {
  user: null,
  pengaturan: {
    nama_pemkab: "PEMERINTAH KABUPATEN BANYUWANGI",
    nama_dinas: "DINAS PENDIDIKAN",
    nama_sekolah: "SD NEGERI 3 KENDALREJO",
    alamat_sekolah: "Alamat: Jl. Raya Kendalrejo, Kec. Tegaldlimo, Kab. Banyuwangi",
    tagline_atas: "SDN 3 Kendalrejo — Tegaldlimo, Banyuwangi",
    tagline_bawah: "Sehat, Ceria, Berprestasi — Semangat Belajar & Olahraga!",
    nama_guru: "AGUS ADI WIJAYA, S.Pd.",
    nip_guru: "19860812 201903 1 006",
    mapel: "PJOK",
    kota_ttd: "Kendalrejo",
  },
  kelasList: [],
  siswaByKelas: {},
  presensiRows: [],
  nilaiRows: [],
  riwayatNilaiList: [],
};

// =====================================================================
// UTILITAS
// =====================================================================
function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

function escapeHtml(str) {
  const map = {
    "&": "&",
    "<": "<",
    ">": ">",
    '"': """,
    "'": "'",
  };
  return String(str ?? "").replace(/[&<>"']/g, (m) => map[m]);
}

function formatTanggalIndo(dateStr) {
  if (!dateStr) return "-";
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  return `${parseInt(parts[2], 10)} ${bulan[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
}

function formatBulanIndo(ymStr) {
  if (!ymStr) return "-";
  const bulan = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember"
  ];
  const [y, m] = ymStr.split("-");
  return `${bulan[parseInt(m, 10) - 1]} ${y}`;
}

function getTodayISO() {
  const d = new Date();
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 10);
}

function hitungPredikat(nilai) {
  if (nilai >= 90) return "A";
  if (nilai >= 80) return "B";
  if (nilai >= 70) return "C";
  return "D";
}

function getNamaKelasById(id) {
  const found = state.kelasList.find((k) => k.id === id);
  return found ? found.nama_kelas : "-";
}

function buildKopSuratHTML() {
  const p = state.pengaturan;
  return `
    <div class="kop-surat">
      <div class="kop-1">${escapeHtml(p.nama_pemkab)}</div>
      <div class="kop-2">${escapeHtml(p.nama_dinas)}</div>
      <div class="kop-3">${escapeHtml(p.nama_sekolah)}</div>
      <div class="kop-4">${escapeHtml(p.alamat_sekolah)}</div>
    </div>
  `;
}

function buildTtdHTML(tanggalIndo) {
  const p = state.pengaturan;
  return `
    <div class="doc-ttd-wrap">
      <div class="doc-ttd-box">
        <div>${escapeHtml(p.kota_ttd)}, ${escapeHtml(tanggalIndo)}</div>
        <div>Guru Mata Pelajaran ${escapeHtml(p.mapel)}</div>
        <div style="height:64px;"></div>
        <div style="font-weight:bold; text-decoration:underline;">${escapeHtml(p.nama_guru)}</div>
        <div>NIP. ${escapeHtml(p.nip_guru || "-")}</div>
      </div>
    </div>
  `;
}

// =====================================================================
// AUTENTIKASI & INISIALISASI
// =====================================================================
async function initApp() {
  const today = getTodayISO();
  document.getElementById("pres-tanggal").value = today;
  document.getElementById("nilai-tanggal").value = today;
  document.getElementById("rekap-bulan").value = today.slice(0, 7);

  bindEvents();

  const { data: { session } } = await sb.auth.getSession();
  if (session?.user) {
    await onLoginSuccess(session.user);
  } else {
    showAuthView();
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      if (!state.user || state.user.id !== session.user.id) {
        await onLoginSuccess(session.user);
      }
    } else {
      state.user = null;
      showAuthView();
    }
  });
}

function showAuthView() {
  document.getElementById("auth-view").classList.remove("hidden");
  document.getElementById("app-view").classList.add("hidden");
}

async function onLoginSuccess(user) {
  state.user = user;
  document.getElementById("ui-user-email").textContent = user.email;
  document.getElementById("auth-view").classList.add("hidden");
  document.getElementById("app-view").classList.remove("hidden");

  await loadPengaturan();
  await loadKelas();
  await refreshAllViews();
}

async function refreshAllViews() {
  const firstKelas = state.kelasList[0]?.id || "";
  ["pres-kelas", "rekap-kelas", "nilai-kelas", "siswa-kelas-input", "filter-siswa-kelas"].forEach((id) => {
    const sel = document.getElementById(id);
    const prevVal = sel.value;
    sel.innerHTML = state.kelasList.length
      ? state.kelasList.map((k) => `<option value="${k.id}">${escapeHtml(k.nama_kelas)}</option>`).join("")
      : `<option value="">-- Belum ada kelas --</option>`;
    if (prevVal && state.kelasList.some((k) => k.id === prevVal)) {
      sel.value = prevVal;
    } else if (firstKelas) {
      sel.value = firstKelas;
    }
  });

  renderTabelKelas();
  if (firstKelas) {
    await loadSiswaForKelas(document.getElementById("filter-siswa-kelas").value);
    renderTabelSiswa();
    await loadPresensiHarian();
    await loadPenilaianView();
  } else {
    renderTabelSiswa();
    renderPresensiTable();
    renderNilaiTable();
  }
}

// =====================================================================
// PENGATURAN SEKOLAH
// =====================================================================
async function loadPengaturan() {
  const { data, error } = await sb
    .from("pengaturan_sekolah")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) {
    showToast("Gagal memuat pengaturan: " + error.message, "error");
    return;
  }
  if (data) {
    state.pengaturan = { ...state.pengaturan, ...data };
  }
  applyPengaturanToUI();
}

function applyPengaturanToUI() {
  const p = state.pengaturan;
  document.getElementById("ui-tagline-atas").textContent = p.tagline_atas;
  document.getElementById("ui-nama-sekolah").textContent = `LAPORAN PRESENSI & PENILAIAN — ${p.nama_sekolah}`;
  document.getElementById("ui-tagline-bawah").textContent = p.tagline_bawah;

  document.getElementById("set-pemkab").value = p.nama_pemkab;
  document.getElementById("set-dinas").value = p.nama_dinas;
  document.getElementById("set-sekolah").value = p.nama_sekolah;
  document.getElementById("set-alamat").value = p.alamat_sekolah;
  document.getElementById("set-tagline-atas").value = p.tagline_atas;
  document.getElementById("set-tagline-bawah").value = p.tagline_bawah;
  document.getElementById("set-guru").value = p.nama_guru;
  document.getElementById("set-nip").value = p.nip_guru;
  document.getElementById("set-mapel").value = p.mapel;
  document.getElementById("set-kota").value = p.kota_ttd;
}

async function savePengaturan(e) {
  e.preventDefault();
  const payload = {
    user_id: state.user.id,
    nama_pemkab: document.getElementById("set-pemkab").value.trim(),
    nama_dinas: document.getElementById("set-dinas").value.trim(),
    nama_sekolah: document.getElementById("set-sekolah").value.trim(),
    alamat_sekolah: document.getElementById("set-alamat").value.trim(),
    tagline_atas: document.getElementById("set-tagline-atas").value.trim(),
    tagline_bawah: document.getElementById("set-tagline-bawah").value.trim(),
    nama_guru: document.getElementById("set-guru").value.trim(),
    nip_guru: document.getElementById("set-nip").value.trim(),
    mapel: document.getElementById("set-mapel").value.trim(),
    kota_ttd: document.getElementById("set-kota").value.trim(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb
    .from("pengaturan_sekolah")
    .upsert(payload, { onConflict: "user_id" });

  if (error) {
    showToast("Gagal menyimpan pengaturan: " + error.message, "error");
    return;
  }
  state.pengaturan = { ...state.pengaturan, ...payload };
  applyPengaturanToUI();
  renderPresensiPreview();
  renderNilaiPreview();
  showToast("Pengaturan sekolah & kop surat disimpan.", "success");
}

// =====================================================================
// CRUD KELAS & SISWA
// =====================================================================
async function loadKelas() {
  const { data, error } = await sb
    .from("kelas")
    .select("*")
    .eq("user_id", state.user.id)
    .order("urutan", { ascending: true })
    .order("nama_kelas", { ascending: true });

  if (error) {
    showToast("Gagal memuat kelas: " + error.message, "error");
    return;
  }
  state.kelasList = data || [];
}

function renderTabelKelas() {
  const tbody = document.getElementById("kelas-tbody");
  if (!state.kelasList.length) {
    tbody.innerHTML = `<tr><td colspan="3" class="empty-state">Belum ada kelas. Tambahkan kelas di atas.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.kelasList.map((k) => `
    <tr>
      <td><strong>${escapeHtml(k.nama_kelas)}</strong></td>
      <td style="text-align:center;">${k.urutan}</td>
      <td style="text-align:center;">
        <button class="btn btn-danger btn-sm" onclick="hapusKelas('${k.id}', '${escapeHtml(k.nama_kelas)}')">Hapus</button>
      </td>
    </tr>
  `).join("");
}

async function tambahKelas(e) {
  e.preventDefault();
  const nama_kelas = document.getElementById("input-nama-kelas").value.trim();
  const urutan = parseInt(document.getElementById("input-urutan-kelas").value, 10) || 1;
  if (!nama_kelas) return;

  const { error } = await sb.from("kelas").insert({
    user_id: state.user.id,
    nama_kelas,
    urutan,
  });

  if (error) {
    showToast("Gagal menambah kelas: " + error.message, "error");
    return;
  }
  document.getElementById("input-nama-kelas").value = "";
  document.getElementById("input-urutan-kelas").value = urutan + 1;
  await loadKelas();
  await refreshAllViews();
  showToast(`Kelas "${nama_kelas}" berhasil ditambahkan.`, "success");
}

window.hapusKelas = async function (id, nama) {
  if (!confirm(`Hapus kelas "${nama}"? Seluruh data siswa, presensi, dan nilai di kelas ini juga akan terhapus.`)) return;
  const { error } = await sb.from("kelas").delete().eq("id", id);
  if (error) {
    showToast("Gagal menghapus kelas: " + error.message, "error");
    return;
  }
  delete state.siswaByKelas[id];
  await loadKelas();
  await refreshAllViews();
  showToast(`Kelas "${nama}" dihapus.`, "info");
};

async function loadSiswaForKelas(kelasId, force = false) {
  if (!kelasId) return [];
  if (!force && state.siswaByKelas[kelasId]) return state.siswaByKelas[kelasId];

  const { data, error } = await sb
    .from("siswa")
    .select("*")
    .eq("user_id", state.user.id)
    .eq("kelas_id", kelasId)
    .eq("aktif", true)
    .order("nama_siswa", { ascending: true });

  if (error) {
    showToast("Gagal memuat siswa: " + error.message, "error");
    return [];
  }
  state.siswaByKelas[kelasId] = data || [];
  return state.siswaByKelas[kelasId];
}

function renderTabelSiswa() {
  const kelasId = document.getElementById("filter-siswa-kelas").value;
  const keyword = document.getElementById("search-siswa").value.trim().toLowerCase();
  const tbody = document.getElementById("siswa-tbody");

  const list = (state.siswaByKelas[kelasId] || []).filter((s) =>
    s.nama_siswa.toLowerCase().includes(keyword) || (s.nisn || "").toLowerCase().includes(keyword)
  );

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Belum ada data siswa di kelas ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((s, idx) => `
    <tr>
      <td style="text-align:center;">${idx + 1}</td>
      <td>${escapeHtml(s.nisn || "-")}</td>
      <td><strong>${escapeHtml(s.nama_siswa)}</strong></td>
      <td style="text-align:center;">${escapeHtml(s.jenis_kelamin)}</td>
      <td style="text-align:center;">
        <button class="btn btn-danger btn-sm" onclick="hapusSiswa('${s.id}', '${kelasId}')">Hapus</button>
      </td>
    </tr>
  `).join("");
}

async function tambahSiswa(e) {
  e.preventDefault();
  const kelas_id = document.getElementById("siswa-kelas-input").value;
  const nama_siswa = document.getElementById("siswa-nama").value.trim();
  const jenis_kelamin = document.getElementById("siswa-jk").value;
  const nisn = document.getElementById("siswa-nisn").value.trim();

  if (!kelas_id || !nama_siswa) {
    showToast("Pilih kelas dan isi nama siswa terlebih dahulu.", "error");
    return;
  }

  const { error } = await sb.from("siswa").insert({
    user_id: state.user.id,
    kelas_id,
    nama_siswa,
    jenis_kelamin,
    nisn,
  });

  if (error) {
    showToast("Gagal menambah siswa: " + error.message, "error");
    return;
  }

  document.getElementById("siswa-nama").value = "";
  document.getElementById("siswa-nisn").value = "";
  await loadSiswaForKelas(kelas_id, true);
  document.getElementById("filter-siswa-kelas").value = kelas_id;
  renderTabelSiswa();
  if (document.getElementById("pres-kelas").value === kelas_id) await loadPresensiHarian();
  if (document.getElementById("nilai-kelas").value === kelas_id) await loadPenilaianView();
  showToast(`Siswa "${nama_siswa}" ditambahkan.`, "success");
}

async function importBulkSiswa() {
  const kelas_id = document.getElementById("siswa-kelas-input").value;
  const raw = document.getElementById("siswa-bulk").value.trim();
  if (!kelas_id) return showToast("Pilih kelas tujuan terlebih dahulu.", "error");
  if (!raw) return showToast("Tempel data siswa terlebih dahulu.", "error");

  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const records = [];

  for (const line of lines) {
    const parts = line.includes("\t") ? line.split("\t") : line.split(",");
    const nama_siswa = (parts[0] || "").trim();
    if (!nama_siswa) continue;
    const rawJk = (parts[1] || "L").trim().toUpperCase();
    const jenis_kelamin = rawJk.startsWith("P") ? "P" : "L";
    const nisn = (parts[2] || "").trim();
    records.push({
      user_id: state.user.id,
      kelas_id,
      nama_siswa,
      jenis_kelamin,
      nisn,
    });
  }

  if (!records.length) return showToast("Format data tidak terbaca.", "error");

  const { error } = await sb.from("siswa").insert(records);
  if (error) {
    showToast("Gagal import siswa: " + error.message, "error");
    return;
  }

  document.getElementById("siswa-bulk").value = "";
  await loadSiswaForKelas(kelas_id, true);
  document.getElementById("filter-siswa-kelas").value = kelas_id;
  renderTabelSiswa();
  if (document.getElementById("pres-kelas").value === kelas_id) await loadPresensiHarian();
  if (document.getElementById("nilai-kelas").value === kelas_id) await loadPenilaianView();
  showToast(`${records.length} siswa berhasil diimport.`, "success");
}

window.hapusSiswa = async function (id, kelasId) {
  if (!confirm("Hapus data siswa ini?")) return;
  const { error } = await sb.from("siswa").delete().eq("id", id);
  if (error) return showToast("Gagal menghapus siswa: " + error.message, "error");
  await loadSiswaForKelas(kelasId, true);
  renderTabelSiswa();
  if (document.getElementById("pres-kelas").value === kelasId) await loadPresensiHarian();
  if (document.getElementById("nilai-kelas").value === kelasId) await loadPenilaianView();
  showToast("Data siswa dihapus.", "info");
};

// =====================================================================
// MODUL PRESENSI HARIAN
// =====================================================================
async function loadPresensiHarian() {
  const kelasId = document.getElementById("pres-kelas").value;
  const tanggal = document.getElementById("pres-tanggal").value;
  if (!kelasId || !tanggal) {
    state.presensiRows = [];
    renderPresensiTable();
    renderPresensiPreview();
    return;
  }

  const siswaList = await loadSiswaForKelas(kelasId);
  const { data: sesi } = await sb
    .from("presensi_sesi")
    .select("*")
    .eq("user_id", state.user.id)
    .eq("kelas_id", kelasId)
    .eq("tanggal", tanggal)
    .maybeSingle();

  let detailMap = {};
  if (sesi) {
    document.getElementById("pres-waktu").value = sesi.waktu_pelajaran || "07.00 - 08.30 WIB";
    document.getElementById("pres-materi").value = sesi.materi || "";
    document.getElementById("pres-foto").value = sesi.url_dokumentasi || "";

    const { data: details } = await sb
      .from("presensi_detail")
      .select("*")
      .eq("sesi_id", sesi.id);
    (details || []).forEach((d) => { detailMap[d.siswa_id] = d; });
  } else {
    document.getElementById("pres-materi").value = "";
    document.getElementById("pres-foto").value = "";
  }

  state.presensiRows = siswaList.map((s) => ({
    siswa_id: s.id,
    nama_siswa: s.nama_siswa,
    jenis_kelamin: s.jenis_kelamin,
    status: detailMap[s.id]?.status || "Hadir",
    keterangan: detailMap[s.id]?.keterangan || "",
  }));

  renderPresensiTable();
  renderPresensiPreview();
}

function renderPresensiTable() {
  const tbody = document.getElementById("pres-tbody");
  if (!state.presensiRows.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="empty-state">Belum ada siswa di kelas ini. Tambahkan di menu Data Siswa & Kelas.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.presensiRows.map((row, i) => `
    <tr>
      <td style="text-align:center;">${i + 1}</td>
      <td><strong>${escapeHtml(row.nama_siswa)}</strong></td>
      <td style="text-align:center;">${escapeHtml(row.jenis_kelamin)}</td>
      <td>
        <select onchange="updatePresensiRow(${i}, 'status', this.value)">
          ${["Hadir", "Sakit", "Izin", "Alpha"].map((st) =>
            `<option value="${st}" ${row.status === st ? "selected" : ""}>${st}</option>`
          ).join("")}
        </select>
      </td>
      <td>
        <input type="text" value="${escapeHtml(row.keterangan)}" placeholder="Catatan..." oninput="updatePresensiRow(${i}, 'keterangan', this.value)" />
      </td>
    </tr>
  `).join("");
}

window.updatePresensiRow = function (idx, field, val) {
  if (!state.presensiRows[idx]) return;
  state.presensiRows[idx][field] = val;
  renderPresensiPreview();
};

function renderPresensiPreview() {
  const area = document.getElementById("print-area-presensi");
  const kelasId = document.getElementById("pres-kelas").value;
  const tanggal = document.getElementById("pres-tanggal").value;
  const waktu = document.getElementById("pres-waktu").value;
  const materi = document.getElementById("pres-materi").value;
  const foto = document.getElementById("pres-foto").value.trim();

  const counts = { Hadir: 0, Sakit: 0, Izin: 0, Alpha: 0 };
  state.presensiRows.forEach((r) => { if (counts[r.status] !== undefined) counts[r.status]++; });

  const rowsHTML = state.presensiRows.length
    ? state.presensiRows.map((r, i) => `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${escapeHtml(r.nama_siswa)}</td>
          <td style="text-align:center;">${escapeHtml(r.jenis_kelamin)}</td>
          <td style="text-align:center; font-weight:bold;">${escapeHtml(r.status)}</td>
          <td>${escapeHtml(r.keterangan || "-")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="5" style="text-align:center;">Belum ada data siswa</td></tr>`;

  const fotoHTML = foto
    ? `<div class="doc-foto"><p style="font-weight:bold; margin-bottom:6px;">Dokumentasi Kegiatan:</p><img src="${escapeHtml(foto)}" alt="Dokumentasi" onerror="this.style.display='none'" /></div>`
    : "";

  area.innerHTML = `
    ${buildKopSuratHTML()}
    <div class="doc-title">LAPORAN PRESENSI HARIAN SISWA</div>
    <table class="doc-meta">
      <tr><td style="width:150px;">Mata Pelajaran</td><td style="width:12px;">:</td><td>${escapeHtml(state.pengaturan.mapel)}</td></tr>
      <tr><td>Kelas</td><td>:</td><td>${escapeHtml(getNamaKelasById(kelasId))}</td></tr>
      <tr><td>Hari / Tanggal</td><td>:</td><td>${escapeHtml(formatTanggalIndo(tanggal))}</td></tr>
      <tr><td>Waktu Pelajaran</td><td>:</td><td>${escapeHtml(waktu || "-")}</td></tr>
      <tr><td>Materi / Kegiatan</td><td>:</td><td>${escapeHtml(materi || "-")}</td></tr>
    </table>

    <table class="doc-table">
      <thead>
        <tr>
          <th style="width:40px;">No</th>
          <th>Nama Siswa</th>
          <th style="width:45px;">L/P</th>
          <th style="width:90px;">Status</th>
          <th>Keterangan</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
    </table>

    <div class="doc-rekap-grid">
      <div class="doc-rekap-item"><strong>Total Siswa</strong><br>${state.presensiRows.length}</div>
      <div class="doc-rekap-item"><strong>Hadir</strong><br>${counts.Hadir}</div>
      <div class="doc-rekap-item"><strong>Sakit</strong><br>${counts.Sakit}</div>
      <div class="doc-rekap-item"><strong>Izin</strong><br>${counts.Izin}</div>
      <div class="doc-rekap-item"><strong>Alpha</strong><br>${counts.Alpha}</div>
    </div>
    ${fotoHTML}
    ${buildTtdHTML(formatTanggalIndo(tanggal))}
  `;
}

async function simpanPresensiHarian() {
  const kelas_id = document.getElementById("pres-kelas").value;
  const tanggal = document.getElementById("pres-tanggal").value;
  if (!kelas_id || !tanggal) return showToast("Pilih kelas dan tanggal terlebih dahulu.", "error");
  if (!state.presensiRows.length) return showToast("Tidak ada siswa untuk disimpan.", "error");

  const btn = document.getElementById("btn-simpan-presensi");
  btn.disabled = true;

  try {
    const { data: sesi, error: sesiErr } = await sb
      .from("presensi_sesi")
      .upsert({
        user_id: state.user.id,
        kelas_id,
        tanggal,
        bulan_tahun: tanggal.slice(0, 7),
        waktu_pelajaran: document.getElementById("pres-waktu").value.trim(),
        materi: document.getElementById("pres-materi").value.trim(),
        url_dokumentasi: document.getElementById("pres-foto").value.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id,kelas_id,tanggal" })
      .select()
      .single();

    if (sesiErr) throw sesiErr;

    const detailPayload = state.presensiRows.map((r) => ({
      user_id: state.user.id,
      sesi_id: sesi.id,
      siswa_id: r.siswa_id,
      status: r.status,
      keterangan: r.keterangan || "",
    }));

    const { error: detErr } = await sb
      .from("presensi_detail")
      .upsert(detailPayload, { onConflict: "sesi_id,siswa_id" });

    if (detErr) throw detErr;

    renderPresensiPreview();
    showToast("Presensi harian berhasil disimpan ke database.", "success");
  } catch (err) {
    showToast("Gagal menyimpan presensi: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

// =====================================================================
// MODUL REKAP BULANAN
// =====================================================================
async function loadRekapBulanan() {
  const bulan_tahun = document.getElementById("rekap-bulan").value;
  const kelas_id = document.getElementById("rekap-kelas").value;
  const area = document.getElementById("print-area-rekap");

  if (!bulan_tahun || !kelas_id) {
    return showToast("Pilih bulan dan kelas terlebih dahulu.", "error");
  }

  area.innerHTML = `<div class="empty-state">Memuat data rekap bulanan...</div>`;

  const siswaList = await loadSiswaForKelas(kelas_id);
  const { data: sesiList, error: sesiErr } = await sb
    .from("presensi_sesi")
    .select("id, tanggal")
    .eq("user_id", state.user.id)
    .eq("kelas_id", kelas_id)
    .eq("bulan_tahun", bulan_tahun);

  if (sesiErr) {
    showToast("Gagal memuat rekap: " + sesiErr.message, "error");
    return;
  }

  const sesiIds = (sesiList || []).map((s) => s.id);
  let details = [];
  if (sesiIds.length) {
    const { data: detData } = await sb
      .from("presensi_detail")
      .select("siswa_id, status")
      .in("sesi_id", sesiIds);
    details = detData || [];
  }

  const stats = {};
  siswaList.forEach((s) => {
    stats[s.id] = { H: 0, S: 0, I: 0, A: 0 };
  });
  details.forEach((d) => {
    if (!stats[d.siswa_id]) return;
    if (d.status === "Hadir") stats[d.siswa_id].H++;
    else if (d.status === "Sakit") stats[d.siswa_id].S++;
    else if (d.status === "Izin") stats[d.siswa_id].I++;
    else if (d.status === "Alpha") stats[d.siswa_id].A++;
  });

  const totalPertemuan = sesiIds.length;
  const rowsHTML = siswaList.length
    ? siswaList.map((s, idx) => {
        const st = stats[s.id];
        const total = st.H + st.S + st.I + st.A;
        const persen = total > 0 ? ((st.H / total) * 100).toFixed(1) : "0.0";
        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td>${escapeHtml(s.nama_siswa)}</td>
            <td style="text-align:center;">${escapeHtml(s.jenis_kelamin)}</td>
            <td style="text-align:center;">${st.H}</td>
            <td style="text-align:center;">${st.S}</td>
            <td style="text-align:center;">${st.I}</td>
            <td style="text-align:center;">${st.A}</td>
            <td style="text-align:center; font-weight:bold;">${persen}%</td>
          </tr>
        `;
      }).join("")
    : `<tr><td colspan="8" style="text-align:center;">Belum ada data siswa</td></tr>`;

  area.innerHTML = `
    ${buildKopSuratHTML()}
    <div class="doc-title">REKAPITULASI PRESENSI BULANAN</div>
    <table class="doc-meta">
      <tr><td style="width:150px;">Mata Pelajaran</td><td style="width:12px;">:</td><td>${escapeHtml(state.pengaturan.mapel)}</td></tr>
      <tr><td>Kelas</td><td>:</td><td>${escapeHtml(getNamaKelasById(kelas_id))}</td></tr>
      <tr><td>Bulan / Tahun</td><td>:</td><td>${escapeHtml(formatBulanIndo(bulan_tahun))}</td></tr>
      <tr><td>Jumlah Pertemuan</td><td>:</td><td>${totalPertemuan} pertemuan</td></tr>
    </table>
    <table class="doc-table">
      <thead>
        <tr>
          <th style="width:40px;">No</th>
          <th>Nama Siswa</th>
          <th style="width:45px;">L/P</th>
          <th style="width:55px;">Hadir</th>
          <th style="width:55px;">Sakit</th>
          <th style="width:55px;">Izin</th>
          <th style="width:55px;">Alpha</th>
          <th style="width:90px;">% Hadir</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    ${buildTtdHTML(formatTanggalIndo(getTodayISO()))}
  `;
}

// =====================================================================
// MODUL PENILAIAN 3 RANAH (KOGNITIF, AFEKTIF, PSIKOMOTOR)
// =====================================================================
async function loadPenilaianView() {
  const kelasId = document.getElementById("nilai-kelas").value;
  if (!kelasId) {
    state.nilaiRows = [];
    renderNilaiTable();
    renderNilaiPreview();
    return;
  }

  await loadRiwayatNilaiDropdown(kelasId);
  const siswaList = await loadSiswaForKelas(kelasId);

  state.nilaiRows = siswaList.map((s) => ({
    siswa_id: s.id,
    nama_siswa: s.nama_siswa,
    jenis_kelamin: s.jenis_kelamin,
    nilai_kognitif: 0,
    nilai_afektif: 0,
    nilai_psikomotor: 0,
    nilai_akhir: 0,
    predikat: "D",
    catatan: "",
  }));

  renderNilaiTable();
  renderNilaiPreview();
}

async function loadRiwayatNilaiDropdown(kelasId) {
  const sel = document.getElementById("nilai-riwayat");
  const { data } = await sb
    .from("penilaian")
    .select("tanggal, semester, materi_tp")
    .eq("user_id", state.user.id)
    .eq("kelas_id", kelasId)
    .order("tanggal", { ascending: false });

  const uniqueMap = new Map();
  (data || []).forEach((item) => {
    const key = `${item.tanggal}|||${item.semester}|||${item.materi_tp}`;
    if (!uniqueMap.has(key)) uniqueMap.set(key, item);
  });

  state.riwayatNilaiList = Array.from(uniqueMap.values());
  sel.innerHTML = `<option value="">-- Buat Penilaian Baru --</option>` +
    state.riwayatNilaiList.map((r, i) =>
      `<option value="${i}">${escapeHtml(r.tanggal)} | ${escapeHtml(r.semester)} — ${escapeHtml(r.materi_tp)}</option>`
    ).join("");
}

async function muatPenilaianDariRiwayat() {
  const idx = document.getElementById("nilai-riwayat").value;
  const kelasId = document.getElementById("nilai-kelas").value;
  if (idx === "" || !kelasId) {
    await loadPenilaianView();
    return;
  }

  const chosen = state.riwayatNilaiList[parseInt(idx, 10)];
  if (!chosen) return;

  document.getElementById("nilai-tanggal").value = chosen.tanggal;
  document.getElementById("nilai-semester").value = chosen.semester;
  document.getElementById("nilai-materi").value = chosen.materi_tp;

  const siswaList = await loadSiswaForKelas(kelasId);
  const { data: saved } = await sb
    .from("penilaian")
    .select("*")
    .eq("user_id", state.user.id)
    .eq("kelas_id", kelasId)
    .eq("tanggal", chosen.tanggal)
    .eq("materi_tp", chosen.materi_tp);

  const map = {};
  (saved || []).forEach((row) => { map[row.siswa_id] = row; });

  state.nilaiRows = siswaList.map((s) => {
    const r = map[s.id];
    const kog = r ? Number(r.nilai_kognitif) : 0;
    const afe = r ? Number(r.nilai_afektif) : 0;
    const psi = r ? Number(r.nilai_psikomotor) : 0;
    const akhir = Number(((kog + afe + psi) / 3).toFixed(2));
    return {
      siswa_id: s.id,
      nama_siswa: s.nama_siswa,
      jenis_kelamin: s.jenis_kelamin,
      nilai_kognitif: kog,
      nilai_afektif: afe,
      nilai_psikomotor: psi,
      nilai_akhir: akhir,
      predikat: hitungPredikat(akhir),
      catatan: r?.catatan || "",
    };
  });

  renderNilaiTable();
  renderNilaiPreview();
}

function renderNilaiTable() {
  const tbody = document.getElementById("nilai-tbody");
  if (!state.nilaiRows.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">Belum ada siswa di kelas ini.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.nilaiRows.map((r, i) => `
    <tr>
      <td style="text-align:center;">${i + 1}</td>
      <td><strong>${escapeHtml(r.nama_siswa)}</strong></td>
      <td style="text-align:center;">${escapeHtml(r.jenis_kelamin)}</td>
      <td style="text-align:center;">
        <input type="number" class="score-input" min="0" max="100" value="${r.nilai_kognitif}"
          oninput="updateNilaiRow(${i}, 'nilai_kognitif', this.value)" />
      </td>
      <td style="text-align:center;">
        <input type="number" class="score-input" min="0" max="100" value="${r.nilai_afektif}"
          oninput="updateNilaiRow(${i}, 'nilai_afektif', this.value)" />
      </td>
      <td style="text-align:center;">
        <input type="number" class="score-input" min="0" max="100" value="${r.nilai_psikomotor}"
          oninput="updateNilaiRow(${i}, 'nilai_psikomotor', this.value)" />
      </td>
      <td style="text-align:center; font-weight:700;" id="nilai-akhir-${i}">${r.nilai_akhir}</td>
      <td style="text-align:center;" id="nilai-predikat-${i}">
        <span class="badge badge-${r.predikat.toLowerCase()}">${r.predikat}</span>
      </td>
      <td>
        <input type="text" value="${escapeHtml(r.catatan)}" placeholder="Catatan..."
          oninput="updateNilaiRow(${i}, 'catatan', this.value)" />
      </td>
    </tr>
  `).join("");
}

window.updateNilaiRow = function (idx, field, val) {
  const row = state.nilaiRows[idx];
  if (!row) return;

  if (field === "catatan") {
    row.catatan = val;
  } else {
    let num = parseFloat(val);
    if (isNaN(num)) num = 0;
    if (num < 0) num = 0;
    if (num > 100) num = 100;
    row[field] = num;
    row.nilai_akhir = Number(((row.nilai_kognitif + row.nilai_afektif + row.nilai_psikomotor) / 3).toFixed(2));
    row.predikat = hitungPredikat(row.nilai_akhir);

    const elAkhir = document.getElementById(`nilai-akhir-${idx}`);
    const elPred = document.getElementById(`nilai-predikat-${idx}`);
    if (elAkhir) elAkhir.textContent = row.nilai_akhir;
    if (elPred) elPred.innerHTML = `<span class="badge badge-${row.predikat.toLowerCase()}">${row.predikat}</span>`;
  }
  renderNilaiPreview();
};

function renderNilaiPreview() {
  const area = document.getElementById("print-area-penilaian");
  const kelasId = document.getElementById("nilai-kelas").value;
  const tanggal = document.getElementById("nilai-tanggal").value;
  const semester = document.getElementById("nilai-semester").value;
  const materi = document.getElementById("nilai-materi").value.trim();

  let sumKog = 0, sumAfe = 0, sumPsi = 0, sumAkhir = 0;
  state.nilaiRows.forEach((r) => {
    sumKog += r.nilai_kognitif;
    sumAfe += r.nilai_afektif;
    sumPsi += r.nilai_psikomotor;
    sumAkhir += r.nilai_akhir;
  });
  const n = state.nilaiRows.length || 1;

  const rowsHTML = state.nilaiRows.length
    ? state.nilaiRows.map((r, i) => `
        <tr>
          <td style="text-align:center;">${i + 1}</td>
          <td>${escapeHtml(r.nama_siswa)}</td>
          <td style="text-align:center;">${escapeHtml(r.jenis_kelamin)}</td>
          <td style="text-align:center;">${r.nilai_kognitif}</td>
          <td style="text-align:center;">${r.nilai_afektif}</td>
          <td style="text-align:center;">${r.nilai_psikomotor}</td>
          <td style="text-align:center; font-weight:bold;">${r.nilai_akhir}</td>
          <td style="text-align:center; font-weight:bold;">${r.predikat}</td>
          <td>${escapeHtml(r.catatan || "-")}</td>
        </tr>
      `).join("") + `
        <tr style="font-weight:bold; background:#f8fafc;">
          <td colspan="3" style="text-align:center;">Rata-Rata Kelas</td>
          <td style="text-align:center;">${(sumKog / n).toFixed(1)}</td>
          <td style="text-align:center;">${(sumAfe / n).toFixed(1)}</td>
          <td style="text-align:center;">${(sumPsi / n).toFixed(1)}</td>
          <td style="text-align:center;">${(sumAkhir / n).toFixed(1)}</td>
          <td colspan="2"></td>
        </tr>
      `
    : `<tr><td colspan="9" style="text-align:center;">Belum ada data siswa</td></tr>`;

  area.innerHTML = `
    ${buildKopSuratHTML()}
    <div class="doc-title">DAFTAR NILAI KOGNITIF, AFEKTIF & PSIKOMOTOR</div>
    <table class="doc-meta">
      <tr><td style="width:160px;">Mata Pelajaran</td><td style="width:12px;">:</td><td>${escapeHtml(state.pengaturan.mapel)}</td></tr>
      <tr><td>Kelas / Semester</td><td>:</td><td>${escapeHtml(getNamaKelasById(kelasId))} / ${escapeHtml(semester)}</td></tr>
      <tr><td>Tanggal Penilaian</td><td>:</td><td>${escapeHtml(formatTanggalIndo(tanggal))}</td></tr>
      <tr><td>Materi / TP</td><td>:</td><td>${escapeHtml(materi || "-")}</td></tr>
    </table>
    <table class="doc-table">
      <thead>
        <tr>
          <th style="width:35px;">No</th>
          <th>Nama Siswa</th>
          <th style="width:40px;">L/P</th>
          <th style="width:70px;">Kognitif</th>
          <th style="width:70px;">Afektif</th>
          <th style="width:80px;">Psikomotor</th>
          <th style="width:75px;">Nilai Akhir</th>
          <th style="width:65px;">Predikat</th>
          <th>Catatan</th>
        </tr>
      </thead>
      <tbody>${rowsHTML}</tbody>
    </table>
    <div style="font-size:10pt; margin-top:6px;">
      <em>Keterangan Predikat: A (90–100 Sangat Baik), B (80–89 Baik), C (70–79 Cukup), D (<70 Perlu Bimbingan).</em>
    </div>
    ${buildTtdHTML(formatTanggalIndo(tanggal))}
  `;
}

async function simpanPenilaian() {
  const kelas_id = document.getElementById("nilai-kelas").value;
  const tanggal = document.getElementById("nilai-tanggal").value;
  const semester = document.getElementById("nilai-semester").value;
  const materi_tp = document.getElementById("nilai-materi").value.trim();

  if (!kelas_id || !tanggal) return showToast("Pilih kelas dan tanggal penilaian.", "error");
  if (!materi_tp) return showToast("Isi Materi / Tujuan Pembelajaran (TP) terlebih dahulu.", "error");
  if (!state.nilaiRows.length) return showToast("Tidak ada data siswa untuk dinilai.", "error");

  const btn = document.getElementById("btn-simpan-nilai");
  btn.disabled = true;

  try {
    const payload = state.nilaiRows.map((r) => ({
      user_id: state.user.id,
      kelas_id,
      siswa_id: r.siswa_id,
      tanggal,
      semester,
      materi_tp,
      nilai_kognitif: r.nilai_kognitif,
      nilai_afektif: r.nilai_afektif,
      nilai_psikomotor: r.nilai_psikomotor,
      nilai_akhir: r.nilai_akhir,
      predikat: r.predikat,
      catatan: r.catatan || "",
      updated_at: new Date().toISOString(),
    }));

    const { error } = await sb
      .from("penilaian")
      .upsert(payload, { onConflict: "user_id,kelas_id,siswa_id,tanggal,materi_tp" });

    if (error) throw error;

    await loadRiwayatNilaiDropdown(kelas_id);
    renderNilaiPreview();
    showToast("Penilaian 3 ranah berhasil disimpan.", "success");
  } catch (err) {
    showToast("Gagal menyimpan penilaian: " + err.message, "error");
  } finally {
    btn.disabled = false;
  }
}

// =====================================================================
// CETAK PDF & EXPORT WORD (.DOC)
// =====================================================================
window.cetakPDF = function (sectionId) {
  document.querySelectorAll(".tab-section").forEach((s) => s.classList.remove("printing-active"));
  document.getElementById(sectionId).classList.add("printing-active");
  window.print();
};

window.exportWord = function (elementId, filenamePrefix) {
  const content = document.getElementById(elementId).innerHTML;
  const html = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office'
          xmlns:w='urn:schemas-microsoft-com:office:word'
          xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <style>
        @page { size: A4; margin: 1.5cm; }
        body { font-family: 'Times New Roman', serif; font-size: 12pt; color: #000; }
        .kop-surat { text-align: center; border-bottom: 3px double #000; padding-bottom: 8px; margin-bottom: 14px; }
        .kop-1 { font-size: 13pt; font-weight: bold; }
        .kop-2 { font-size: 14pt; font-weight: bold; }
        .kop-3 { font-size: 16pt; font-weight: bold; }
        .kop-4 { font-size: 10pt; font-style: italic; }
        .doc-title { text-align: center; font-size: 13pt; font-weight: bold; text-decoration: underline; margin-bottom: 12px; }
        .doc-meta { width: 100%; margin-bottom: 10px; font-size: 11pt; }
        .doc-table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11pt; }
        .doc-table th, .doc-table td { border: 1px solid #000; padding: 5px 6px; }
        .doc-table th { background-color: #f1f5f9; text-align: center; }
        .doc-rekap-grid { margin: 10px 0; }
        .doc-rekap-item { display: inline-block; border: 1px solid #000; padding: 5px 10px; margin-right: 6px; text-align: center; }
        .doc-ttd-wrap { margin-top: 24px; text-align: right; }
        .doc-ttd-box { display: inline-block; text-align: left; width: 240px; }
      </style>
    </head>
    <body>${content}</body>
    </html>
  `;

  const blob = new Blob(["\ufeff", html], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}_${getTodayISO()}.doc`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// =====================================================================
// EVENT LISTENERS
// =====================================================================
function bindEvents() {
  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = document.getElementById("btn-login");
    btn.disabled = true;
    btn.textContent = "Memproses...";
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    const { error } = await sb.auth.signInWithPassword({ email, password });
    btn.disabled = false;
    btn.textContent = "Masuk Aplikasi";

    if (error) showToast("Login gagal: " + error.message, "error");
    else showToast("Berhasil masuk.", "success");
  });

  document.getElementById("btn-logout").addEventListener("click", async () => {
    await sb.auth.signOut();
    showToast("Anda telah keluar.", "info");
  });

  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-section").forEach((s) => s.classList.add("hidden"));
      btn.classList.add("active");
      document.getElementById(btn.dataset.tab).classList.remove("hidden");
    });
  });

  document.getElementById("pres-tanggal").addEventListener("change", loadPresensiHarian);
  document.getElementById("pres-kelas").addEventListener("change", loadPresensiHarian);
  ["pres-waktu", "pres-materi", "pres-foto"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderPresensiPreview);
  });
  document.getElementById("btn-semua-hadir").addEventListener("click", () => {
    state.presensiRows.forEach((r) => { r.status = "Hadir"; });
    renderPresensiTable();
    renderPresensiPreview();
  });
  document.getElementById("btn-simpan-presensi").addEventListener("click", simpanPresensiHarian);

  document.getElementById("btn-muat-rekap").addEventListener("click", loadRekapBulanan);

  document.getElementById("nilai-kelas").addEventListener("change", loadPenilaianView);
  document.getElementById("nilai-riwayat").addEventListener("change", muatPenilaianDariRiwayat);
  ["nilai-tanggal", "nilai-semester", "nilai-materi"].forEach((id) => {
    document.getElementById(id).addEventListener("input", renderNilaiPreview);
  });
  document.getElementById("btn-simpan-nilai").addEventListener("click", simpanPenilaian);

  document.getElementById("form-kelas").addEventListener("submit", tambahKelas);
  document.getElementById("form-siswa").addEventListener("submit", tambahSiswa);
  document.getElementById("btn-import-siswa").addEventListener("click", importBulkSiswa);
  document.getElementById("filter-siswa-kelas").addEventListener("change", async (e) => {
    await loadSiswaForKelas(e.target.value);
    renderTabelSiswa();
  });
  document.getElementById("search-siswa").addEventListener("input", renderTabelSiswa);

  document.getElementById("form-pengaturan").addEventListener("submit", savePengaturan);
}

document.addEventListener("DOMContentLoaded", initApp);