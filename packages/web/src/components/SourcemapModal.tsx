import React, { useEffect, useState } from 'react';
import { Modal } from './Modal';
import { fetchSourceMaps, uploadSourceMap, deleteSourceMap, uploadSourceMapArchive } from '../api';
import { Stack, Button, TextField, Typography, Paper, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress } from '@mui/material';

export function SourcemapModal({ projectKey, onClose, onUploaded }: { projectKey: string | null; onClose: () => void; onUploaded?: () => void }) {
  const [maps, setMaps] = useState<Array<{ id: string; fileName: string; uploadedAt: number }>>([]);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Bulk upload state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [zipEntries, setZipEntries] = useState<Array<{path: string; size: number; detectedName?: string; content?: string; selected: boolean}>>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkWarnings, setBulkWarnings] = useState<string[]>([]);
  // Server-side upload state
  const [serverUploading, setServerUploading] = useState(false);
  const [serverResult, setServerResult] = useState<{ uploaded?: Array<{ id: string; fileName: string; uploadedAt: number }>; warnings?: string[] } | null>(null);
  const [serverNotice, setServerNotice] = useState<string | null>(null);

  async function load() {
    if (!projectKey) return;
    setError(null);
    try {
      const m = await fetchSourceMaps(projectKey);
      setMaps(m);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load');
    }
  }

  useEffect(() => { void load(); }, [projectKey]);

  async function onZipSelected(f: File | null) {
    setZipFile(f);
    setZipEntries([]);
    setBulkWarnings([]);
    if (!f) return;
    try {
      // dynamic import to avoid adding big dependency at top-level if unused
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip().loadAsync(f);
      const entries: typeof zipEntries = [];
      await Promise.all(Object.keys(zip.files).map(async (p) => {
        const file = zip.files[p];
        if (!p.toLowerCase().endsWith('.map')) return;
        try {
          const content = await file.async('string');
          let detectedName: string | undefined = undefined;
          try { const parsed = JSON.parse(content); if (parsed && typeof parsed.file === 'string' && parsed.file.trim().length) detectedName = `${parsed.file}.map`; } catch (e) {}
          entries.push({ path: p, size: content.length, detectedName, content, selected: true });
        } catch (e: any) {
          setBulkWarnings((w) => [...w, `${p}: ${String(e?.message ?? e)}`]);
        }
      }));
      setZipEntries(entries);
    } catch (e: any) {
      setBulkWarnings([String(e?.message ?? e)]);
    }
  }

  async function onUploadSelectedMaps() {
    if (!projectKey) return;
    setBulkWarnings([]);
    const MAX = 10 * 1024 * 1024; // 10 MB per map
    const toUpload = zipEntries.filter(e => e.selected);
    if (!toUpload.length) { setBulkWarnings(['No maps selected']); return; }
    setBulkUploading(true);
    try {
      for (const entry of toUpload) {
        if (!entry.content) { setBulkWarnings((w) => [...w, `${entry.path}: no content`]); continue; }
        if (entry.size > MAX) { setBulkWarnings((w) => [...w, `${entry.path}: exceeds maximum size`]); continue; }
        const fname = (entry.detectedName ?? entry.path.split(/[\\/]/).pop()!) || entry.path;
        try {
          await uploadSourceMap(projectKey, fname, entry.content);
        } catch (e: any) {
          setBulkWarnings((w) => [...w, `${entry.path}: ${e?.message ?? e}`]);
        }
      }
      await load();
      if (onUploaded) onUploaded();
      setZipFile(null);
      setZipEntries([]);
    } finally { setBulkUploading(false); }
  }

  async function onUploadArchiveToServer() {
    if (!projectKey || !zipFile) return;
    setServerResult(null);
    setServerUploading(true);
    try {
      const res = await uploadSourceMapArchive(projectKey, zipFile);
      setServerResult(res);
      setServerNotice(`Uploaded ${res.uploaded?.length ?? 0} map(s)`);
      setTimeout(() => setServerNotice(null), 5000);
      // refresh maps list
      await load();
      if (onUploaded) onUploaded();
    } catch (e: any) {
      setServerResult({ warnings: [e?.message ?? String(e)] });
      setServerNotice(null);
    } finally {
      setServerUploading(false);
    }
  }

  async function onUpload() {
    if (!projectKey || !file) return;
    const MAX = 10 * 1024 * 1024; // 10 MB
    if (file.size > MAX) {
      setError('File is too large. Maximum allowed size is 10 MB.');
      return;
    }
    setLoading(true);
    try {
      const text = await file.text();
      await uploadSourceMap(projectKey, name || file.name, text);
      setFile(null);
      setName('');
      await load();      // notify parent to reload events so mapped frames can appear immediately
      if (onUploaded) onUploaded();    } catch (e: any) { setError(e?.message ?? 'Failed to upload'); }
    finally { setLoading(false); }
  }

  async function onDelete(id: string) {
    if (!projectKey) return;
    try {
      await deleteSourceMap(projectKey, id);
      await load();      // notify parent to reload events after delete as well
      if (onUploaded) onUploaded();    } catch (e: any) { setError(e?.message ?? 'Failed to delete'); }
  }

  return (
    <Modal title="Source Maps" onClose={onClose}>
      <Stack spacing={2}>
        {error ? <Typography color="error">{error}</Typography> : null}

        <Stack direction="row" spacing={1} alignItems="center">
          <input accept=".map" type="file" onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
            setName('');
            if (f) {
              // Auto-detect filename from inside the sourcemap if possible
              (async () => {
                try {
                  const text = await f.text();
                  const parsed = JSON.parse(text);
                  if (parsed && typeof parsed.file === 'string' && parsed.file.trim().length) {
                    // take basename and ensure .map extension
                    const parts = parsed.file.split('/').pop()!.split('\\').pop()!.split('?')[0];
                    const candidate = parts.endsWith('.map') ? parts : parts + '.map';
                    setName(candidate);
                  }
                } catch (err) {
                  // ignore parse errors
                }
              })();
            }
          }} />
          <TextField label="fileName (optional)" value={name} onChange={(e) => setName(e.target.value)} size="small" />
          <Button onClick={() => void onUpload()} disabled={!file || loading} variant="contained">Upload</Button>
        </Stack>
        {file && name ? <Typography variant="body2">Detected filename: <strong>{name}</strong></Typography> : null}

        <Stack direction="row" spacing={1} alignItems="center">
          <input accept=".zip,.tar,.tgz,.tar.gz" type="file" onChange={(e) => void onZipSelected(e.target.files?.[0] ?? null)} />
          <Button onClick={() => setZipFile(null)} disabled={!zipFile}>Clear</Button>
          <Button onClick={() => void onUploadSelectedMaps()} disabled={!zipEntries.length || bulkUploading}>Upload Selected Maps (client)</Button>
          <Button onClick={() => void onUploadArchiveToServer()} disabled={!zipFile || serverUploading}>Upload Archive to Server</Button>
        </Stack>

        {bulkWarnings.length ? (
          <Paper variant="outlined" sx={{ p: 1 }}>
            {bulkWarnings.map((w, i) => <div key={i}>{w}</div>)}
          </Paper>
        ) : null}

        {serverResult ? (
          <Paper variant="outlined" sx={{ p: 1 }}>
            <Typography variant="body2" sx={{ mb: 1 }}><strong>Server upload result:</strong></Typography>
            {serverNotice ? <Typography color="success.main">{serverNotice}</Typography> : null}
            {serverResult.uploaded && serverResult.uploaded.length ? (
              <ul>
                {serverResult.uploaded.map(u => (
                  <li key={u.id}>{u.fileName} <span className="small">({new Date(u.uploadedAt).toLocaleString()})</span></li>
                ))}
              </ul>
            ) : null}
            {serverResult.warnings && serverResult.warnings.length ? (
              <Paper variant="outlined" sx={{ p: 1, mt: 1 }}>{serverResult.warnings.map((w, i) => <div key={i}>{w}</div>)}</Paper>
            ) : null}
          </Paper>
        ) : null}

        {zipEntries.length ? (
          <Paper variant="outlined" sx={{ p: 1, maxHeight: 220, overflow: 'auto' }}>
            <Typography variant="body2">Detected .map files:</Typography>
            <ul>
              {zipEntries.map((e, idx) => (
                <li key={e.path} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input type="checkbox" checked={e.selected} onChange={() => setZipEntries((prev) => prev.map((p, i) => i === idx ? { ...p, selected: !p.selected } : p))} />
                    <div>
                      <div>{e.path} <span className="small">({e.size} bytes)</span></div>
                      {e.detectedName ? <div className="small">Detected filename: <strong>{e.detectedName}</strong></div> : null}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </Paper>
        ) : null}

        <div>
          {maps.length ? (
            <ul>
              {maps.map(m => (
                <li key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>{m.fileName} <span className="small">({new Date(m.uploadedAt).toLocaleString()})</span></div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <Button variant="contained" color="error" onClick={() => void onDelete(m.id)}>Delete</Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <Typography variant="body2">No source maps uploaded for this project.</Typography>
          )}
        </div>
      </Stack>
    </Modal>
  );
}
