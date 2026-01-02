import React, { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Grid } from '@mui/material';
import { fetchProjects, fetchIssues } from './api';

export const Dashboard: React.FC = () => {
  const [projects, setProjects] = useState<number | null>(null);
  const [issues, setIssues] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await fetchProjects();
        if (!mounted) return;
        setProjects(Array.isArray(p) ? p.length : null);
        // try to count issues across first project as a simple stat
        if (Array.isArray(p) && p[0]) {
          try {
            const iss = await fetchIssues(p[0].projectKey);
            if (!mounted) return;
            setIssues(Array.isArray(iss) ? iss.length : null);
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <div>
      <Typography variant="h4" gutterBottom>Dashboard</Typography>
      <Grid container spacing={2}>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Projects</Typography>
              <Typography variant="h5">{projects === null ? '—' : projects}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={4}>
          <Card>
            <CardContent>
              <Typography color="textSecondary" gutterBottom>Open Issues (sample)</Typography>
              <Typography variant="h5">{issues === null ? '—' : issues}</Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </div>
  );
};
