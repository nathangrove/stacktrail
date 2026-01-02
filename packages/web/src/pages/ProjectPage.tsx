import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchProjectIngestKey, fetchSourceMaps, deleteSourceMap, fetchIssues } from '../api';
import { Container, Typography, Paper, Button, Table, TableBody, TableCell, TableHead, TableRow } from '@mui/material';
import { SourcemapModal } from '../components/SourcemapModal';

export const ProjectPage: React.FC = () => {
  const { projectKey } = useParams<{ projectKey: string }>();
  const [ingestKey, setIngestKey] = useState<string | null>(null);
  const [sourcemaps, setSourcemaps] = useState<Array<{ id: string; fileName: string; uploadedAt: number }>>([]);
  const [issuesCount, setIssuesCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000';
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  function fallbackCopy(text: string, successMsg: string) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopyNotice(successMsg);
      setTimeout(() => setCopyNotice(null), 3000);
    } catch {
      setCopyNotice('Failed to copy');
      setTimeout(() => setCopyNotice(null), 3000);
    }
  }



  async function reloadIngestKey() {
    if (!projectKey) return;
    try {
      const data = await fetchProjectIngestKey(projectKey);
      setIngestKey(data.ingestKey);
    } catch (e: any) {
      setIngestKey(null);
      setError(e?.message ?? 'Failed to load ingest key');
    }
  }

  async function reloadSourcemaps() {
    if (!projectKey) return;
    setError(null);
    try {
      const sm = await fetchSourceMaps(projectKey);
      setSourcemaps(sm);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load sourcemaps');
    }
  }

  async function reloadIssues() {
    if (!projectKey) return;
    setError(null);
    try {
      const iss = await fetchIssues(projectKey);
      setIssuesCount(Array.isArray(iss) ? iss.length : null);
    } catch (e: any) {
      setIssuesCount(null);
      setError(e?.message ?? 'Failed to load issues');
    }
  }

  async function onDeleteSourceMap(id: string) {
    if (!projectKey) return;
    if (!confirm(`Delete source map ${id}?`)) return;
    try {
      await deleteSourceMap(projectKey, id);
      await reloadSourcemaps();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete sourcemap');
    }
  }

  useEffect(() => {
    void reloadIngestKey();
    void reloadSourcemaps();
    void reloadIssues();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectKey]);

  return (
    <Container maxWidth={false} disableGutters sx={{ width: '100%', mt: 3, px: 2 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <Typography variant="h6">Project: {projectKey}</Typography>
            <Typography variant="body2" color="text.secondary">View source maps and issue counts</Typography>
          </div>
          <div>
            <Button variant="outlined" onClick={() => { void reloadSourcemaps(); void reloadIssues(); }}>Refresh</Button>
            <Button variant="contained" sx={{ ml: 1 }} onClick={() => setShowUpload(true)}>Upload sourcemap</Button>
          </div>
        </div>
      </div>

      <Paper sx={{ p: 2, mb: 2 }}>
        <div style={{ marginBottom: 8 }}>
          <Typography variant="subtitle2">Ingest Key</Typography>
          <div className="code">{ingestKey ?? '(not available)'}</div>

          {issuesCount === 0 ? (
            <div className="small" style={{ marginTop: 8 }}>
              <div style={{ marginBottom: 6 }}><strong>Getting started</strong> — send errors to this project using the ingest key:</div>

              {/* cURL snippet + copy */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8 }}>
                <div className="code" style={{ flex: 1 }}>{`
curl -X POST "${origin}/api/events" \
  -H "Content-Type: application/json" \
  -H "X-STACKTRAIL-Ingest-Key: ${ingestKey ?? '<key>'}" \
  -d '{"projectKey":"${projectKey ?? '<project>'}","message":"Test error","level":"error"}'
`}</div>
                <div>
                  <Button size="small" onClick={() => {
                    const text = `curl -X POST "${origin}/api/events" \
-H "Content-Type: application/json" \
-H "X-STACKTRAIL-Ingest-Key: ${ingestKey ?? '<key>'}" \
-d '{"projectKey":"${projectKey ?? '<project>'}","message":"Test error","level":"error"}'`;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(text).then(() => { setCopyNotice('Copied cURL to clipboard'); setTimeout(() => setCopyNotice(null), 3000); }, () => fallbackCopy(text, 'Copied cURL to clipboard'));
                    } else {
                      fallbackCopy(text, 'Copied cURL to clipboard');
                    }
                  }}>Copy</Button>
                </div>
              </div>

              <div className="small" style={{ marginBottom: 6 }}>Or use the SDK (example):</div>

              {/* SDK snippet + copy */}
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <div className="code" style={{ flex: 1 }}>{`import { initStackTrail } from '@stacktrail/sdk';

initStackTrail({ dsn: '${origin}/api/events', projectKey: '${projectKey ?? '<project>'}', ingestKey: '${ingestKey ?? ''}' });`}</div>
                <div>
                  <Button size="small" onClick={() => {
                    const sdk = `import { initStackTrail } from '@stacktrail/sdk';\n\ninitStackTrail({ dsn: '${origin}/api/events', projectKey: '${projectKey ?? '<project>'}', ingestKey: '${ingestKey ?? ''}' });`;
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                      navigator.clipboard.writeText(sdk).then(() => { setCopyNotice('Copied SDK snippet'); setTimeout(() => setCopyNotice(null), 3000); }, () => fallbackCopy(sdk, 'Copied SDK snippet'));
                    } else {
                      fallbackCopy(sdk, 'Copied SDK snippet');
                    }
                  }}>Copy</Button>
                </div>
              </div>

              {copyNotice ? <div className="small" style={{ color: 'green', marginTop: 6 }}>{copyNotice}</div> : null}

            </div>
          ) : null}

        </div>
      </Paper>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Active Issues</Typography>
        <div className="small">{issuesCount === null ? '—' : `${issuesCount} active issue(s)`}</div>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Source Maps</Typography>
        {error ? <div style={{ color: 'red', marginBottom: 8 }}>{error}</div> : null}
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>File</TableCell>
              <TableCell>Uploaded</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {sourcemaps.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.fileName}</TableCell>
                <TableCell>{new Date(s.uploadedAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Button variant="outlined" size="small" href={`/api/projects/${encodeURIComponent(projectKey ?? '')}/sourcemaps/${encodeURIComponent(s.id)}`}>Download</Button>
                  <Button variant="outlined" size="small" color="error" sx={{ ml: 1 }} onClick={() => void onDeleteSourceMap(s.id)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
            {!sourcemaps.length ? (
              <TableRow>
                <TableCell colSpan={3} className="small">No source maps uploaded.</TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </Paper>

      {showUpload ? <SourcemapModal projectKey={projectKey ?? ''} onClose={() => { setShowUpload(false); void reloadSourcemaps(); }} onUploaded={() => { setShowUpload(false); void reloadSourcemaps(); }} /> : null}
    </Container>
  );
};
