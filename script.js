"use strict";

/*
 * Identitas opsional sengaja dikosongkan.
 * Ubah footer di sini jika diperlukan.
 */
const TOKO = {
  nama: "RPayment",
  alamat: "",
  telepon: "",
  footer: [
    "Terima kasih atas kepercayaan Anda.",
    "Struk ini merupakan bukti",
    "transaksi yang sah.",
    "Simpan struk ini sebagai",
    "bukti pembayaran."
  ]
};

/*
 * Tipe:
 * teks  = teks biasa
 * digit = identitas angka, mempertahankan nol di depan
 * uang  = angka rupiah, ditampilkan dengan pemisah ribuan
 * total = hasil perhitungan, tidak bisa diketik
 */
const SKEMA = {
  umum: {
    judul: "STRUK TRANSAKSI",
    fields: [
      ["waktu", "Tanggal", "waktu"],
      ["produk", "Nama produk", "teks"],
      ["tujuan", "Nomor tujuan", "digit"],
      ["harga", "Harga", "uang"],
      ["serial", "Serial number", "teks"]
    ]
  },
  ewallet: {
    judul: "STRUK EWALLET",
    fields: [
      ["waktu", "Tanggal", "waktu"],
      ["ref", "No. ref", "teks"]
      ["produk", "Nama produk", "teks"],
      ["tujuan", "Nomor tujuan", "digit"],
      ["nama", "Nama konsumen", "teks"],
      ["nominal", "Nominal", "uang"],
      ["admin", "Biaya admin", "uang"],
      ["total", "Total", "total"],
      ["ref", "No. ref", "teks"]
    ]
  },
  token: {
    judul: "STRUK TOKEN LISTRIK",
    fields: [
      ["waktu", "Tanggal", "waktu"],
      ["produk", "Nama produk", "teks"],
      ["pelanggan", "ID pelanggan", "digit"],
      ["nama", "Nama", "teks"],
      ["daya", "Tarif/daya", "teks"],
      ["harga", "Harga", "uang"],
      ["token", "Token", "digit"]
    ]
  },
  tagihan: {
    judul: "STRUK TAGIHAN LISTRIK",
    fields: [
      ["waktu", "Tanggal", "waktu"],
      ["produk", "Nama produk", "teks"],
      ["tujuan", "Nomor tujuan", "digit"],
      ["pelanggan", "ID pelanggan", "digit"],
      ["nama", "Nama", "teks"],
      ["daya", "Tarif/daya", "teks"],
      ["periode", "BL/TH", "teks"],
      ["meter", "Stand meter", "teks"],
      ["tagihan", "RP TAG PLN", "uang"],
      ["admin", "Biaya admin", "uang"],
      ["total", "Total", "total"]
    ]
  }
};

const form = document.querySelector("#form");
const canvas = document.querySelector("#receipt");
const tabs = [...document.querySelectorAll("[data-tab]")];
const states = {};
let aktif = "umum";
let toastTimer;
let installPrompt = null;

function waktuLokal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function stateUntuk(key) {
  if (!states[key]) {
    states[key] = {};
    for (const [id, , type] of SKEMA[key].fields) {
      states[key][id] = type === "waktu" ? waktuLokal() : "";
    }
  }
  return states[key];
}

/* Integer berbasis BigInt menghindari kesalahan pembulatan nominal. */
function angka(value) {
  const digit = String(value).replace(/\D/g, "");
  return digit ? BigInt(digit).toString() : "";
}

function rupiah(value) {
  const digit = angka(value) || "0";
  return "Rp " + digit.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function totalUntuk(data) {
  const dasar = aktif === "ewallet" ? data.nominal : data.tagihan;
  return (BigInt(dasar || "0") + BigInt(data.admin || "0")).toString();
}

function perbaruiTotal() {
  const data = stateUntuk(aktif);
  if (aktif === "ewallet" || aktif === "tagihan") {
    data.total = totalUntuk(data);
    const input = form.elements.namedItem("total");
    if (input) input.value = rupiah(data.total);
  }
}

function buatForm() {
  const data = stateUntuk(aktif);
  form.replaceChildren();

  for (const [id, label, type] of SKEMA[aktif].fields) {
    const wrapper = document.createElement("label");
    wrapper.className = "field";

    const caption = document.createElement("span");
    caption.textContent = label;

    const input = document.createElement("input");
    input.id = `field-${id}`;
    input.name = id;
    input.dataset.type = type;
    input.required = type !== "total";

    if (type === "waktu") {
      input.type = "datetime-local";
      input.step = "1";
      input.value = data[id];
    } else {
      input.type = "text";
      input.maxLength = type === "uang" ? 30 : 160;
      input.value = type === "uang" || type === "total"
        ? rupiah(data[id])
        : data[id];

      if (["uang", "total", "digit"].includes(type)) {
        input.inputMode = "numeric";
      }
      if (type === "total") {
        input.readOnly = true;
      }
    }

    wrapper.append(caption, input);
    form.append(wrapper);
  }

  perbaruiTotal();
  gambarStruk();
}

form.addEventListener("submit", event => event.preventDefault());

/* Tolak huruf saat mengetik; sanitasi input juga menangani tempel teks. */
form.addEventListener("beforeinput", event => {
  const type = event.target.dataset.type;
  if (!["uang", "digit"].includes(type)) return;
  if (event.inputType === "insertText" && event.data && /\D/.test(event.data)) {
    event.preventDefault();
  }
});

form.addEventListener("input", event => {
  const input = event.target;
  const type = input.dataset.type;
  if (!type || type === "total") return;

  const data = stateUntuk(aktif);

  if (type === "uang") {
    /*
     * Pertahankan posisi kursor berdasarkan jumlah digit di kanan,
     * sehingga pengeditan nominal di tengah tetap nyaman.
     */
    const posisi = input.selectionStart ?? input.value.length;
    const digitKanan = input.value.slice(posisi).replace(/\D/g, "").length;

    data[input.name] = angka(input.value).slice(0, 15);
    input.value = rupiah(data[input.name]);

    let caret = input.value.length;
    let tersisa = digitKanan;
    while (caret > 3 && tersisa > 0) {
      caret--;
      if (/\d/.test(input.value[caret])) tersisa--;
    }
    input.setSelectionRange(caret, caret);
  } else if (type === "digit") {
    data[input.name] = input.value.replace(/\D/g, "");
    input.value = data[input.name];
  } else {
    data[input.name] = input.value;
  }

  input.removeAttribute("aria-invalid");
  perbaruiTotal();
  gambarStruk();
});

function pilihTab(key, fokus = false) {
  aktif = key;
  for (const tab of tabs) {
    const selected = tab.dataset.tab === key;
    tab.setAttribute("aria-selected", String(selected));
    tab.tabIndex = selected ? 0 : -1;
    if (selected && fokus) tab.focus();
  }
  document.querySelector("#panel")
    .setAttribute("aria-labelledby", `tab-${key}`);
  buatForm();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => pilihTab(tab.dataset.tab));

  tab.addEventListener("keydown", event => {
    let next;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    if (event.key === "ArrowLeft") next = (index + tabs.length - 1) % tabs.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = tabs.length - 1;
    if (next !== undefined) {
      event.preventDefault();
      pilihTab(tabs[next].dataset.tab, true);
    }
  });
});

function formatWaktu(value) {
  if (!value) return "-";
  const [tanggal, jam = ""] = value.split("T");
  const [tahun, bulan, hari] = tanggal.split("-");
  return `${hari}/${bulan}/${tahun} ${jam.length === 5 ? jam + ":00" : jam}`;
}

/*
 * Tata letak 32 karakter per baris.
 * Canvas beresolusi 3x menghasilkan PNG selebar sekitar 658 piksel.
 * Pratinjau dan PNG memakai canvas yang sama, tanpa font/CDN eksternal.
 */
function gambarStruk() {
  const data = stateUntuk(aktif);
  const baris = [];
  const COLS = 32;

  function tambah(teks = "", align = "left", bold = false) {
    baris.push({ teks, align, bold });
  }

  function bungkus(teks, lebar = COLS) {
    let s = String(teks).replace(/\s+/g, " ").trim();
    if (!s) return ["-"];

    const hasil = [];
    while (s.length > lebar) {
      let potong = s.lastIndexOf(" ", lebar);
      if (potong <= 0) potong = lebar;
      hasil.push(s.slice(0, potong));
      s = s.slice(potong).trimStart();
    }
    if (s) hasil.push(s);
    return hasil;
  }

  function tengah(teks, bold = false) {
    bungkus(teks).forEach(line => tambah(line, "center", bold));
  }

  function pasangan(label, nilai, bold = false) {
    const text = String(nilai || "-");
    if (label.length + text.length + 1 <= COLS) {
      tambah(label + " ".repeat(COLS - label.length - text.length) + text,
        "left", bold);
    } else {
      tambah(label, "left", bold);
      bungkus(text).forEach(line => tambah(line, "right", bold));
    }
  }

  tengah(TOKO.nama, true);
  if (TOKO.alamat) tengah(TOKO.alamat);
  if (TOKO.telepon) tengah(TOKO.telepon);

  tambah();
  tengah(SKEMA[aktif].judul, true);
  tambah("-".repeat(COLS));

  for (const [id, label, type] of SKEMA[aktif].fields) {
    let value = data[id];
    if (type === "waktu") value = formatWaktu(value);
    if (type === "uang" || type === "total") value = rupiah(value);

    if (id === "total") tambah("-".repeat(COLS));

    if (id === "token") {
      tambah("Token", "left", true);
      const token = value ? value.replace(/(.{4})(?=.)/g, "$1 ") : "-";
      bungkus(token).forEach(line => tambah(line, "center", true));
    } else {
      pasangan(id === "waktu" ? "Tanggal" : label, value, id === "total");
  }

  tambah("-".repeat(COLS));
  TOKO.footer.forEach(line => tengah(line));
  tambah();

  const width = 58 * 96 / 25.4;
  const margin = 10;
  const fontSize = (width - margin * 2) / (COLS * 0.61);
  const lineHeight = 12;
  const height = margin * 2 + baris.length * lineHeight;
  const scale = 3;

  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);

  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width / scale, canvas.height / scale);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  baris.forEach((line, index) => {
    ctx.font = `${line.bold ? "bold " : ""}${fontSize}px monospace`;
    ctx.textAlign = line.align;
    const x = line.align === "center" ? width / 2
      : line.align === "right" ? width - margin : margin;
    ctx.fillText(line.teks, x, margin + index * lineHeight, width - margin * 2);
  });

  canvas.setAttribute("aria-label",
    `Struk RPayment. ${baris.map(line => line.teks).join(". ")}`);
}

function pesan(text) {
  const status = document.querySelector("#status");
  clearTimeout(toastTimer);
  status.textContent = text;
  status.hidden = false;
  toastTimer = setTimeout(() => { status.hidden = true; }, 6500);
}

function validasi() {
  for (const input of form.elements) {
    if (!input.required) continue;
    const value = stateUntuk(aktif)[input.name];
    if (!String(value ?? "").trim() || !input.checkValidity()) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      pesan(`Lengkapi ${input.closest("label").querySelector("span").textContent.toLowerCase()}.`);
      return false;
    }
  }
  return true;
}

function pngBlob() {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (blob) resolve(blob);
      else reject(new Error("Gambar tidak dapat dibuat."));
    }, "image/png");
  });
}

function namaFile() {
  return `RPayment-${aktif}-${stateUntuk(aktif).waktu.replace(/\D/g, "")}.png`;
}

function unduh(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/*
 * Siapkan file sejak pratinjau berubah agar Web Share dipanggil langsung
 * saat tombol ditekan, menjaga user activation pada browser seluler.
 */
let fileSiap = null;
let generasi = 0;

function siapkanFile() {
  const nomor = ++generasi;
  fileSiap = null;
  const filename = namaFile();
  pngBlob().then(blob => {
    if (nomor === generasi) {
      fileSiap = new File([blob], filename, { type: "image/png" });
    }
  }).catch(() => {});
}

const gambarAsli = gambarStruk;
gambarStruk = function () {
  gambarAsli();
  siapkanFile();
};

document.querySelector("#download").addEventListener("click", async () => {
  if (!validasi()) return;
  try {
    const blob = fileSiap || await pngBlob();
    unduh(blob, namaFile());
    pesan("Struk PNG siap diunduh.");
  } catch (error) {
    pesan(error.message);
  }
});

document.querySelector("#share").addEventListener("click", async () => {
  if (!validasi()) return;

  const file = fileSiap;
  if (!file) {
    pesan("Gambar sedang disiapkan. Tekan Bagikan sekali lagi.");
    return;
  }

  if (navigator.share && navigator.canShare &&
      navigator.canShare({ files: [file] })) {
    try {
      /*
       * Sistem menampilkan pemilih aplikasi; situs tidak dapat memaksa
       * WhatsApp menjadi tujuan. Pengguna memilih WhatsApp sendiri.
       */
      await navigator.share({
        files: [file],
        title: "Struk RPayment"
      });
    } catch (error) {
      if (error.name !== "AbortError") {
        unduh(file, file.name);
        pesan("Berbagi gagal. PNG diunduh; lampirkan manual di WhatsApp.");
      }
    }
    return;
  }

  /*
   * Tautan WhatsApp tidak bisa menyisipkan file lokal otomatis.
   * Cadangan: unduh PNG, buka WhatsApp, lalu pengguna melampirkan
   * gambar dari folder Unduhan/Foto secara manual.
   */
  unduh(file, file.name);
  const text = encodeURIComponent("Berikut struk transaksi RPayment.");
  const link = document.createElement("a");
  link.href = `https://wa.me/?text=${text}`;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  document.body.append(link);
  link.click();
  link.remove();
  pesan("PNG diunduh. Lampirkan gambar secara manual di WhatsApp.");
});

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  installPrompt = event;
});

window.addEventListener("appinstalled", () => {
  installPrompt = null;
  pesan("RPayment berhasil dipasang.");
});

document.querySelector("#install").addEventListener("click", async () => {
  if (installPrompt) {
    const prompt = installPrompt;
    installPrompt = null;
    await prompt.prompt();
    await prompt.userChoice;
    return;
  }

  const standalone = window.matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone;

  document.querySelector("#install-instructions").textContent = standalone
    ? "RPayment sudah dibuka sebagai aplikasi."
    : /iPad|iPhone|iPod/.test(navigator.userAgent)
      ? "Buka halaman ini di Safari. Tekan Bagikan, pilih Tambahkan ke Layar Utama, lalu Tambah."
      : "Di Chrome Android, buka menu ⋮ lalu pilih Instal aplikasi atau Tambahkan ke layar utama. Jika belum tersedia, muat ulang setelah halaman selesai dimuat.";

  document.querySelector("#install-dialog").showModal();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      pesan("Mode offline belum aktif. Buka melalui HTTPS lalu muat ulang.");
    });
  });

  let reloadStarted = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    /*
     * Tidak memuat ulang otomatis agar formulir yang sedang diisi
     * tidak hilang. Versi baru dipakai pada pembukaan berikutnya.
     */
    if (!reloadStarted) {
      reloadStarted = true;
      pesan("Mode offline siap. Pembaruan tersedia pada pembukaan berikutnya.");
    }
  });
}

buatForm();
