import React from 'react';
import { Paper, Button } from '@mui/material';
import type { EventRow, Issue } from './api';
import * as UAParserLib from 'ua-parser-js';

export function DetailsPanel({
  selectedIssue,
  selectedIssueId,
  events,
  reloadEvents,
  copyLinkToClipboard,
  toggleResolve,
  openSourcemap,
  notice,
  selectedProjectKey,
  navigateToIssue,
  setError,
  setSelectedIssueId,
}: {
  selectedIssue: Issue | null;
  selectedIssueId: string | null;
  events: EventRow[];
  reloadEvents: (issueId: string) => Promise<void>;
  copyLinkToClipboard: () => void;
  toggleResolve: (issueId: string, willResolve: boolean) => Promise<void>;
  openSourcemap: () => void;
  notice: string | null;
  selectedProjectKey: string | null;
  navigateToIssue: (issueId: string) => Promise<void>;
  setError: (s: string | null) => void;
  setSelectedIssueId: (id: string | null) => void;
}) {
  return (
    <Paper className="panel" sx={{ p: 2 }}>
      <div className="header">
        <div>
          <div style={{ fontWeight: 700 }}>Details</div>
          <div className="small">{selectedIssue ? selectedIssue.title : 'No issue selected'}</div>
        </div>
        <div>
          {selectedIssueId ? (
            <>
              <Button variant="outlined" onClick={() => { if (selectedIssueId) void reloadEvents(selectedIssueId); }}>Refresh</Button>
              <Button variant="outlined" sx={{ ml: 1 }} onClick={() => copyLinkToClipboard()}>Copy Link</Button>
              {selectedIssue ? (
                <>
                  <Button
                    variant="contained"
                    color={selectedIssue.resolvedAt ? 'warning' : 'primary'}
                    sx={{ ml: 1 }}
                    onClick={async () => {
                      try {
                        const willResolve = !selectedIssue.resolvedAt;
                        await toggleResolve(selectedIssue.id, willResolve);
                      } catch (e: any) {
                        setError(e?.message ?? 'Failed to update issue');
                      }
                    }}
                  >
                    {selectedIssue.resolvedAt ? 'Reopen' : 'Resolve'}
                  </Button>

                  {selectedIssue.previousIssueId ? (
                    <Button
                      onClick={async () => {
                        try {
                          const prev = selectedIssue.previousIssueId!;
                          setSelectedIssueId(prev);
                          await navigateToIssue(prev);
                        } catch (e: any) {
                          setError(e?.message ?? 'Failed to load previous issue');
                        }
                      }}
                      variant="outlined"
                      sx={{ ml: 1 }}
                    >
                      View Previous
                    </Button>
                  ) : null}
                </>
              ) : null}
            </>
          ) : null}
          {notice ? <div className="small" style={{ color: 'green', marginTop: 6 }}>{notice}</div> : null}
        </div>
      </div>

      {!selectedIssueId ? (
        <div className="small">Select an issue to see events.</div>
      ) : (
        <div>
          {events.map((ev) => (
            <div key={ev.id} style={{ borderTop: '1px solid var(--borderSubtle)', paddingTop: 8, marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontWeight: 600 }}>{new Date(ev.occurredAt).toLocaleString()}</div>
                <div className="small">{ev.id.slice(0, 12)}…</div>
              </div>

              <div className="small" style={{ marginTop: 6 }}>url: {ev?.payload?.url ?? '(unknown)'}</div>

              {ev?.payload?.userAgent ? (() => {
                const ua = String(ev.payload.userAgent);
                // UAParserJS exports can be in different shapes depending on bundler/interop.
                // Be defensive: find the constructor (UAParser) and try to `new` it, otherwise call it.
                const UA = (UAParserLib as any).UAParser ?? (UAParserLib as any).default ?? (UAParserLib as any);
                let p: any;
                try {
                  p = new UA(ua);
                } catch (e) {
                  // Some builds export a function that returns the parsed result when called.
                  try {
                    p = UA(ua);
                  } catch (e) {
                    p = {};
                  }
                }
                const browser = (p && typeof p.getBrowser === 'function') ? p.getBrowser() : (p && p.browser) || {};
                const os = (p && typeof p.getOS === 'function') ? p.getOS() : (p && p.os) || {};
                const device = (p && typeof p.getDevice === 'function') ? p.getDevice() : (p && p.device) || {};

                const browserText = browser.name ? `${browser.name}${browser.version ? ' ' + browser.version : ''}` : '';
                const osText = os.name ? `${os.name}${os.version ? ' ' + os.version : ''}` : '';
                const deviceText = device.type ? `${device.type}${device.model ? ' ' + device.model : ''}` : (device.model ? device.model : 'Desktop');

                return (
                  <div style={{ marginTop: 6 }}>
                    <div className="small"><strong>Browser:</strong> {browserText}{(osText || deviceText) ? ` — ${osText}${osText && deviceText ? ' — ' : ''}${deviceText}` : ''}</div>
                    <div className="small" style={{ marginTop: 4 }}><strong>UA:</strong> {ua.slice(0, 200)}</div>
                  </div>
                );
              })() : null}

              {(ev as any)?.mappedFrames ? (
                <div style={{ marginTop: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="small" style={{ flex: 1 }}><strong>Mapped stack (original locations):</strong></div>
                    <div className="small">{((ev as any).mappedFrames as any[]).length} frames</div>
                  </div>
                  <div className="code" style={{ marginTop: 6 }}>
                    {((ev as any).mappedFrames as any[]).map((mf: any, idx: number) => (
                      <div key={idx}>
                        {mf.function ? <strong>{mf.function}</strong> : null}
                        {mf.function ? ' — ' : ''}
                        {mf.original ? (`${mf.original.source}:${mf.original.line}:${mf.original.column}`) : (`${mf.generated.file}:${mf.generated.line}:${mf.generated.column}`)}
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <Button variant="outlined" size="small" onClick={() => openSourcemap()}>Open Source Maps</Button>
                    <Button variant="outlined" size="small" onClick={() => { if (selectedIssueId) void reloadEvents(selectedIssueId); }}>Refresh Events</Button>
                  </div>
                </div>
              ) : ev?.payload?.stack ? (
                <div style={{ marginTop: 6 }}>
                  <div className="code">{String(ev.payload.stack)}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div className="small">No mapped frames found for this event.</div>
                    <Button variant="outlined" size="small" onClick={() => openSourcemap()}>Open Source Maps</Button>
                    <Button variant="outlined" size="small" onClick={() => { if (selectedIssueId) void reloadEvents(selectedIssueId); }}>Refresh Events</Button>
                  </div>
                </div>
              ) : null}
            </div>
          ))}
          {!events.length ? <div className="small">No events for this issue yet.</div> : null}
        </div>
      )}
    </Paper>
  );
}
