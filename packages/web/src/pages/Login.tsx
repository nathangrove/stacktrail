import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { login } from '../api';
import { Paper, TextField, Button, Typography } from '@mui/material';

export const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function onSubmit() {
    setError(null);
    try {
      await login(username, password);
      // On success, navigate to home; App will re-check session
      navigate('/');
    } catch (e: any) {
      setError(e?.message ?? 'Login failed');
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <Paper sx={{ p: 3, maxWidth: 480, margin: '0 auto' }}>
        <Typography variant="h6" sx={{ mb: 2 }}>Sign in</Typography>
        <TextField label="Username" fullWidth value={username} onChange={(e) => setUsername(e.target.value)} sx={{ mb: 2 }} />
        <TextField label="Password" fullWidth type="password" value={password} onChange={(e) => setPassword(e.target.value)} sx={{ mb: 2 }} />
        {error ? <div style={{ color: 'red', marginBottom: 8 }}>{error}</div> : null}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <Button onClick={() => navigate(-1)}>Cancel</Button>
          <Button variant="contained" onClick={() => void onSubmit()} disabled={!username || !password}>Sign in</Button>
        </div>
      </Paper>
    </div>
  );
};