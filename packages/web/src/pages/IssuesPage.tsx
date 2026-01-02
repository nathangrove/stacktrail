import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  createProject,
  fetchIssueEvents,
  fetchIssues,
  fetchIssue,
  fetchProjectIngestKey,
  fetchProjects,
  resolveIssue,
  type EventRow,
  type Issue,
  type Project
} from '../api';
import { AuthModal } from '../components/AuthModal';
import { SourcemapModal } from '../components/SourcemapModal';
import { TextField, Paper, Container, Typography } from '@mui/material';
import Button from '@mui/material/Button';
import { IssuesPanel } from '../IssuesPanel';
import { DetailsPanel } from '../DetailsPanel';

export const IssuesPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string | null>(null);
  const [createMode, setCreateMode] = useState(false);
  const [createProjectKey, setCreateProjectKey] = useState('');
  const [createProjectName, setCreateProjectName] = useState('');

  const [issues, setIssues] = useState<Issue[]>([]);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const selectedIssueRef = useRef<string | null>(null);
  const initialIssueFromUrlRef = useRef<string | null>(null);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Modal visibility state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showSourcemapModal, setShowSourcemapModal] = useState(false);

  const selectedIssue = useMemo(
    () => issues.find((i) => i.id === selectedIssueId) ?? null,
    [issues, selectedIssueId]
  );

  const navigate = useNavigate();

  // Keep a mutable ref of the current selected issue so poll callbacks see the latest value
  useEffect(() => {
    selectedIssueRef.current = selectedIssueId;
  }, [selectedIssueId]);



  // Parse project/issue from URL on initial mount (prefer path segments)
  useEffect(() => {
    try {
      const m = location.pathname.match(/^\/projects\/([^\/]+)(?:\/issues\/([^\/]+))?/);
      if (m) {
        const [, urlProject, urlIssue] = m;
        if (urlProject) setSelectedProjectKey(decodeURIComponent(urlProject));
        if (urlIssue) initialIssueFromUrlRef.current = decodeURIComponent(urlIssue);
        return;
      }
    } catch {
      // ignore
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function reloadProjects() {
    setError(null);
    try {
      const data = await fetchProjects();
      setProjects(data);

      if (!selectedProjectKey && data.length) {
        setSelectedProjectKey(data[0].projectKey);
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load projects');
    }
  }

  async function onCreateProject() {
    const key = createProjectKey.trim();
    if (!key) return;
    setError(null);
    try {
      const created = await createProject(
        key,
        createProjectName.trim() ? createProjectName.trim() : undefined
      );
      await reloadProjects();
      setSelectedProjectKey(key);
      setCreateMode(false);
      setCreateProjectKey('');
      setCreateProjectName('');
      await reloadIssues(key);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create project');
    }
  }

  async function reloadIssues(projectKey: string | null = selectedProjectKey) {
    if (!projectKey) {
      setIssues([]);
      setSelectedIssueId(null);
      setEvents([]);
      return;
    }
    setError(null);
    try {
      const data = await fetchIssues(projectKey);
      setIssues(data);

      const preferred = initialIssueFromUrlRef.current;
      if (preferred) {
        const found = data.some((issue) => issue.id === preferred);
        if (found) {
          setSelectedIssueId(preferred);
        } else {
          try {
            const issue = await fetchIssue(preferred, projectKey);
            if (issue) {
              setSelectedIssueId(preferred);
            } else {
              setSelectedIssueId(null);
            }
          } catch {
            setSelectedIssueId(null);
          }
        }
        initialIssueFromUrlRef.current = null;
        return;
      }

      const currentSelected = selectedIssueRef.current;
      const selectedIssueStillExists = currentSelected && data.some(issue => issue.id === currentSelected);

      if (data.length && !currentSelected) {
        setSelectedIssueId(data[0].id);
      }

      if (currentSelected && !selectedIssueStillExists) {
        try {
          await fetchIssue(currentSelected, projectKey);
        } catch {
          setSelectedIssueId(null);
          setEvents([]);
        }
      }

      if (!data.length) {
        setSelectedIssueId(null);
        setEvents([]);
      }
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to load issues';
      setError(msg.includes('401') ? 'Unauthorized: Basic Auth required.' : msg);
    }
  }

  async function reloadEvents(issueId: string) {
    if (!selectedProjectKey) return;
    setError(null);
    try {
      const data = await fetchIssueEvents(selectedProjectKey, issueId);
      setEvents(data);
    } catch (e: any) {
      const msg = e?.message ?? 'Failed to load events';
      setError(msg.includes('401') ? 'Unauthorized: Basic Auth required.' : msg);
    }
  }

  function copyLinkToClipboard() {
    if (!selectedProjectKey || !selectedIssueId) return;
    const url = `${window.location.origin}/projects/${encodeURIComponent(selectedProjectKey)}/issues/${encodeURIComponent(selectedIssueId)}`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(
        () => {
          setNotice('Link copied to clipboard');
          setTimeout(() => setNotice(null), 3000);
        },
        () => {
          setNotice('Failed to copy link');
          setTimeout(() => setNotice(null), 3000);
        }
      );
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = url;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        setNotice('Link copied to clipboard');
        setTimeout(() => setNotice(null), 3000);
      } catch {
        setNotice('Failed to copy link');
        setTimeout(() => setNotice(null), 3000);
      }
    }
  }

  useEffect(() => {
    void reloadProjects();
    void reloadIssues();
    const timer = window.setInterval(() => void reloadIssues(), 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectKey]);


  useEffect(() => {
    if (!selectedIssueId) return;
    void reloadEvents(selectedIssueId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIssueId, selectedProjectKey]);

  return (
    <Container maxWidth={false} disableGutters sx={{ width: '100%', mt: 3, px: 2 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <Typography variant="h6">Issues</Typography>
            <Typography variant="body2" color="text.secondary">Pick a project and view issues</Typography>
          </div>
        </div>
      </div>

      <Paper sx={{ p: 2, mb: 2 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          
          <select
            className="input"
            value={createMode ? "__create__" : selectedProjectKey ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__create__") {
                setCreateMode(true);
                setCreateProjectKey("");
                setCreateProjectName("");
                return;
              }
              setCreateMode(false);
              setSelectedProjectKey(v || null);
              setSelectedIssueId(null);
            }}
            aria-label="Select project"
          >
            <option value="" disabled>
              Select a project…
            </option>
            {Array.isArray(projects) ? projects.map((p) => (
              <option key={p.projectKey} value={p.projectKey}>
                {p.name}
              </option>
            )) : (
              <></>
            )}
            <option value="__create__">Create new project…</option>
          </select>

          {createMode ? (
            <>
              <TextField label="projectKey (required)" size="small" value={createProjectKey} onChange={(e) => setCreateProjectKey(e.target.value)} sx={{ width: 180 }} />
              <TextField label="name (optional)" size="small" value={createProjectName} onChange={(e) => setCreateProjectName(e.target.value)} sx={{ width: 180 }} />
              <Button variant="contained" onClick={() => void onCreateProject()}>
                Create
              </Button>
              <Button
                onClick={() => {
                  setCreateMode(false);
                  setCreateProjectKey("");
                  setCreateProjectName("");
                }}
              >
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      </Paper>

      <div className="container">
        <IssuesPanel
          issues={issues}
          selectedIssueId={selectedIssueId}
          setSelectedIssueId={setSelectedIssueId}
          createMode={createMode}
          createProjectKey={createProjectKey}
          setCreateProjectKey={setCreateProjectKey}
          createProjectName={createProjectName}
          setCreateProjectName={setCreateProjectName}
          onCreateProject={onCreateProject}
          reloadProjects={reloadProjects}
          reloadIssues={reloadIssues}
          selectedProjectKey={selectedProjectKey}
          error={error}
          setCreateMode={setCreateMode}
        />

        <DetailsPanel
          selectedIssue={selectedIssue}
          selectedIssueId={selectedIssueId}
          events={events}
          reloadEvents={reloadEvents}
          copyLinkToClipboard={copyLinkToClipboard}
          toggleResolve={async (issueId, willResolve) => { await resolveIssue(issueId, willResolve); await reloadIssues(selectedProjectKey); }}
          openSourcemap={() => setShowSourcemapModal(true)}
          notice={notice}
          selectedProjectKey={selectedProjectKey}
          navigateToIssue={async (issueId) => {
            const pk = (selectedProjectKey ?? selectedIssue?.projectKey ?? "");
            const path = `/projects/${encodeURIComponent(pk)}/issues/${encodeURIComponent(issueId)}`;
            navigate(path, { replace: true });
            await reloadEvents(issueId);
          }}
          setError={setError}
          setSelectedIssueId={setSelectedIssueId}
        />

        {notice ? <div className="small" style={{ color: 'green', marginTop: 6 }}>{notice}</div> : null}
        {showAuthModal ? <AuthModal onClose={() => setShowAuthModal(false)} onSaved={() => { void reloadProjects(); void reloadIssues(); }} /> : null}
        {showSourcemapModal ? <SourcemapModal projectKey={selectedProjectKey} onClose={() => setShowSourcemapModal(false)} onUploaded={() => { if (selectedIssueId) void reloadEvents(selectedIssueId); }} /> : null}
      </div>
    </Container>
  );
};
