import React, { useState } from 'react';
import { Modal } from './Modal';
import { setAuth, clearAuth } from '../api';
import { TextField, Stack, Button } from '@mui/material';

export function AuthModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [user, setUser] = useState('');
  const [pass, setPass] = useState('');

  return (
    <Modal title="Authentication" onClose={onClose}>
      <Stack spacing={2} sx={{ pt: 1 }}>
        <TextField label="Username" value={user} onChange={(e) => setUser(e.target.value)} size="small" />
        <TextField label="Password" type="password" value={pass} onChange={(e) => setPass(e.target.value)} size="small" />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button onClick={() => { clearAuth(); onSaved(); onClose(); }}>Clear</Button>
          <Button variant="contained" onClick={() => { setAuth(user, pass); onSaved(); onClose(); }} disabled={!user || !pass}>Save</Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
