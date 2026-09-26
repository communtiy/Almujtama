/* AlMujtama v187 browser compatibility bridge for Firebase Hosting.
   Replaces Electron preload APIs with browser-native equivalents. */
(() => {
  'use strict';

  const DB_NAME = 'almujtama-web-v187';
  const DB_VERSION = 1;
  const KV = 'kv';
  const SNAPSHOT_KEY = 'application-state';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
  }

  async function idbGet(key) {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(KV, 'readonly');
      const req = tx.objectStore(KV).get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
      tx.oncomplete = () => db.close();
    });
  }

  async function idbSet(key, value) {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(KV, 'readwrite');
      tx.objectStore(KV).put(value, key);
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onerror = () => { db.close(); reject(tx.error); };
      tx.onabort = () => { db.close(); reject(tx.error || new Error('IndexedDB write aborted')); };
    });
  }

  function bytesToBlob(payload) {
    const raw = payload?.data;
    const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw || []);
    return new Blob([bytes], { type: payload?.type || 'application/octet-stream' });
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(reader.error || new Error('تعذر قراءة الملف'));
      reader.readAsDataURL(blob);
    });
  }

  function safeName(name = 'file') {
    return String(name || 'file').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim().slice(0, 140) || 'file';
  }

  function downloadURL(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = safeName(filename);
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function normalizePhone(phone = '') {
    let p = String(phone).replace(/\D/g, '');
    if (p.startsWith('0')) p = '966' + p.slice(1);
    return p;
  }

  function whatsapp(phone, text = '') {
    const p = normalizePhone(phone);
    if (!p) throw new TypeError('رقم واتساب غير صالح');
    const url = `https://wa.me/${p}?text=${encodeURIComponent(String(text || ''))}`;
    window.open(url, '_blank', 'noopener,noreferrer');
    return { opened: true };
  }

  function reportHTML(input = '') {
    return String(input || '').replace(/\{\{FUND_LOGO_URI\}\}/g, new URL('community-logo.png', location.href).href);
  }

  function openPrintable(html) {
    const w = window.open('', '_blank');
    if (!w) throw new Error('المتصفح منع فتح نافذة التقرير. اسمح بالنوافذ المنبثقة لهذا الموقع.');
    w.document.open();
    w.document.write(reportHTML(html));
    w.document.close();
    const doPrint = () => setTimeout(() => { try { w.focus(); w.print(); } catch (_) {} }, 350);
    if (w.document.readyState === 'complete') doPrint(); else w.addEventListener('load', doPrint, { once: true });
    return w;
  }

  async function ensureHtml2Canvas() {
    if (window.html2canvas) return window.html2canvas;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('تعذر تحميل أداة إنشاء الصورة'));
      document.head.appendChild(s);
    });
    return window.html2canvas;
  }

  async function saveReportPNG(html, filename) {
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;left:-20000px;top:0;width:1200px;height:900px;border:0;opacity:0;pointer-events:none';
    document.body.appendChild(frame);
    try {
      const doc = frame.contentDocument;
      doc.open(); doc.write(reportHTML(html)); doc.close();
      await new Promise(resolve => setTimeout(resolve, 450));
      const h2c = await ensureHtml2Canvas();
      const target = doc.documentElement;
      const canvas = await h2c(target, { backgroundColor: '#ffffff', scale: 1.5, useCORS: true, allowTaint: false, logging: false, windowWidth: 1200 });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('تعذر إنشاء الصورة');
      const url = URL.createObjectURL(blob);
      try { downloadURL(url, `${safeName(filename || 'تقرير')}.png`); }
      finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
      return { saved: true, format: 'png' };
    } finally {
      frame.remove();
    }
  }

  window.realmDB = Object.freeze({
    async load() { return await idbGet(SNAPSHOT_KEY); },
    async save(snapshot) {
      if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) throw new TypeError('بيانات قاعدة البيانات غير صالحة');
      await idbSet(SNAPSHOT_KEY, snapshot);
      return { saved: true, updatedAt: new Date().toISOString(), backend: 'IndexedDB' };
    },
    async info() {
      const data = await idbGet(SNAPSHOT_KEY);
      return { backend: 'browser-indexeddb', path: DB_NAME, schemaVersion: 1, hasData: !!data };
    }
  });

  window.mediaStore = Object.freeze({
    async save(payload) {
      const blob = bytesToBlob(payload);
      const isVideo = String(payload?.type || '').toLowerCase().startsWith('video/');
      const max = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
      if (!blob.size || blob.size > max) throw new RangeError(isVideo ? 'حجم الفيديو يجب ألا يتجاوز 100 ميجابايت' : 'حجم الصورة يجب ألا يتجاوز 10 ميجابايت');
      const url = await blobToDataURL(blob);
      return { url, name: payload?.name || 'media', type: payload?.type || blob.type, size: blob.size };
    },
    async delete() { return { deleted: true }; }
  });

  window.documentStore = Object.freeze({
    async save(payload) {
      const blob = bytesToBlob(payload);
      if (!blob.size || blob.size > 150 * 1024 * 1024) throw new RangeError('حجم الوثيقة يجب ألا يتجاوز 150 ميجابايت');
      const url = await blobToDataURL(blob);
      return { url, name: payload?.name || 'document', type: payload?.type || blob.type, size: blob.size };
    },
    async delete() { return { deleted: true }; },
    async open(url) {
      if (!url) throw new Error('رابط الوثيقة غير صالح');
      const w = window.open(url, '_blank', 'noopener,noreferrer');
      if (!w && String(url).startsWith('data:')) downloadURL(url, 'وثيقة');
      return { opened: true };
    },
    async reveal(url) { return this.open(url); },
    async shareWhatsapp(payload) {
      if (payload?.url) downloadURL(payload.url, payload?.name || 'وثيقة');
      return whatsapp(payload?.phone, payload?.text || '');
    }
  });

  window.reportExport = Object.freeze({
    async save(payload) {
      const format = payload?.format === 'png' ? 'png' : 'pdf';
      if (format === 'png') return await saveReportPNG(payload?.html || '', payload?.filename || 'تقرير');
      openPrintable(payload?.html || '');
      return { saved: true, format: 'pdf', browserPrintDialog: true };
    },
    async whatsapp(phone, text) { return whatsapp(phone, text); },
    async shareWhatsapp(payload) {
      const format = payload?.format === 'png' ? 'png' : 'pdf';
      if (format === 'png') await saveReportPNG(payload?.html || '', payload?.filename || 'تقرير');
      else openPrintable(payload?.html || '');
      return whatsapp(payload?.phone, payload?.text || '');
    }
  });

  window.__ALMUJTAMA_WEB__ = Object.freeze({
    version: '187-v127-firebase',
    backend: 'IndexedDB',
    hosted: true
  });
})();
