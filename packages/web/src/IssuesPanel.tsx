import React from 'react';
import { Paper, Button, TextField } from '@mui/material';
import type { Issue } from './api';

export function IssuesPanel({
  issues,
  selectedIssueId,
  setSelectedIssueId,
  createMode,
  createProjectKey,
  setCreateProjectKey,
  createProjectName,
  setCreateProjectName,
  onCreateProject,
  reloadProjects,
  reloadIssues,
  selectedProjectKey,
  error,
  setCreateMode,
}: {
  issues: Issue[];
  selectedIssueId: string | null;
  setSelectedIssueId: (id: string | null) => void;
  createMode: boolean;
  createProjectKey: string;
  setCreateProjectKey: (s: string) => void;
  createProjectName: string;
  setCreateProjectName: (s: string) => void;
  onCreateProject: () => Promise<void>;
  reloadProjects: () => Promise<void>;
  reloadIssues: (projectKey?: string | null) => Promise<void>;
  selectedProjectKey: string | null;
  error: string | null;
  setCreateMode: (b: boolean) => void;
}) {
  return (
    <Paper className="panel" sx={{ p: 2 }}>
      <div className="header">
        <div>
          <div style={{ fontWeight: 700 }}>Issues</div>
          <div className="small">Pick a project to view issues</div>
        </div>
        <Button variant="outlined" onClick={() => { void reloadProjects(); void reloadIssues(); }} disabled={createMode} title={createMode ? "Finish creating a project first" : "Refresh"}>Refresh</Button>
      </div>

      {error ? <div className="errorBox">{error}</div> : null}

      {createMode ? (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
          <TextField label="projectKey (required)" size="small" value={createProjectKey} onChange={(e) => setCreateProjectKey(e.target.value)} sx={{ width: 180 }} />
          <TextField label="name (optional)" size="small" value={createProjectName} onChange={(e) => setCreateProjectName(e.target.value)} sx={{ width: 180 }} />
          <Button variant="contained" onClick={() => void onCreateProject()}>Create</Button>
          <Button onClick={() => setCreateMode(false)}>Cancel</Button>
        </div>
      ) : null}

      <table className="table">
        <thead>
          <tr>
            <th>Message</th>
            <th>Count</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {issues.map((i) => (
            <tr key={i.id} className={i.id === selectedIssueId ? "selectedRow" : undefined}>
              <td>
                <Button variant="text" onClick={() => setSelectedIssueId(i.id)} title={i.id} sx={{ display: 'block', textAlign: 'left', width: '100%', padding: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <div style={{ fontWeight: 600 }}>{i.title}</div>
                    {i.resolvedAt ? (
                      <div className="small" style={{ color: 'var(--muted)', marginLeft: 8 }}>Resolved</div>
                    ) : null}
                  </div>
                  <div className="small">{i.id.slice(0, 12)}…</div>
                </Button>
              </td>
              <td>{i.count}</td>
              <td>{new Date(i.lastSeen).toLocaleString()}</td>
            </tr>
          ))}
          {!issues.length ? (
            <tr>
              <td colSpan={3} className="small">
                {selectedProjectKey ? "No issues yet for this project. Trigger an error in a page using the SDK." : "Select a project to see issues."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </Paper>
  );
}
