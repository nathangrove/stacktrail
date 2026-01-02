import React, { useEffect, useState } from 'react';
import { fetchProjects, createProject, deleteProject } from '../api';
import { Paper, Button, TextField, Table, TableBody, TableCell, TableHead, TableRow, Typography, Container } from '@mui/material';

export const ProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const p = await fetchProjects();
      setProjects(p);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load projects');
    } finally {
      setLoading(false);
    }
  }

  async function onCreate() {
    if (!key.trim()) return setError('Project key required');
    setError(null);
    try {
      await createProject(key.trim(), name.trim() || undefined);
      setKey('');
      setName('');
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create project');
    }
  }

  async function onDelete(k: string) {
    if (!confirm(`Delete project ${k}? This will remove issues, events and sourcemaps for this project.`)) return;
    setError(null);
    try {
      await deleteProject(k);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete project');
    }
  }

  // Load projects on mount
  useEffect(() => {
    void reload();
  }, []);

  return (
    <Container maxWidth={false} disableGutters sx={{ width: '100%', mt: 3, px: 2 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div>
            <Typography variant="h6">Projects</Typography>
            <Typography variant="body2" color="text.secondary">Create, view and delete projects</Typography>
          </div>
        </div>
      </div>

      <Paper sx={{ p: 2, mb: 2 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <TextField label="project key" size="small" value={key} onChange={(e) => setKey(e.target.value)} />
          <TextField label="name" size="small" value={name} onChange={(e) => setName(e.target.value)} />
          <Button variant="contained" onClick={() => void onCreate()}>Create</Button>
        </div>
        {error ? <div style={{ color: 'red', marginTop: 8 }}>{error}</div> : null}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Project Key</TableCell>
              <TableCell>Name</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {projects.map((p) => (
              <TableRow key={p.projectKey}>
                <TableCell>{p.projectKey}</TableCell>
                <TableCell>{p.name}</TableCell>
                <TableCell>{new Date(p.createdAt).toLocaleString()}</TableCell>
                <TableCell>
                  <Button variant="outlined" size="small" href={`/projects/${encodeURIComponent(p.projectKey)}`}>Open</Button>
                  <Button variant="outlined" size="small" color="error" sx={{ ml: 1 }} onClick={() => void onDelete(p.projectKey)}>Delete</Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Container>
  );
};
