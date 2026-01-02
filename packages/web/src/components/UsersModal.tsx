import React, { useEffect, useState } from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';
import { fetchUsers, createUser, deleteUser, updateUserPassword, type User } from '../api';
import { TextField, Stack, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, Paper, Typography, CircularProgress } from '@mui/material';

export function UsersModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<User[]>([]);
  const [createMode, setCreateMode] = useState(false);
  const [createUsername, setCreateUsername] = useState('');
  const [createPassword, setCreatePassword] = useState('');
  const [editMode, setEditMode] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) { setError(e?.message ?? 'Failed to load users'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void reload(); }, []);

  async function onCreate() {
    if (!createUsername.trim() || !createPassword.trim()) return;
    setLoading(true);
    try {
      await createUser(createUsername.trim(), createPassword.trim());
      setCreateMode(false);
      setCreateUsername(''); setCreatePassword('');
      await reload();
    } catch (e: any) { setError(e?.message ?? 'Failed to create'); }
    finally { setLoading(false); }
  }

  async function onUpdate(id: string) {
    if (!editPassword.trim()) return;
    setLoading(true);
    try {
      await updateUserPassword(id, editPassword.trim());
      setEditMode(null); setEditPassword('');
      await reload();
    } catch (e: any) { setError(e?.message ?? 'Failed to update'); }
    finally { setLoading(false); }
  }

  async function onDelete(id: string, username: string) {
    if (!confirm(`Delete user ${username}?`)) return;
    setLoading(true);
    try {
      await deleteUser(id);
      await reload();
    } catch (e: any) { setError(e?.message ?? 'Failed to delete'); }
    finally { setLoading(false); }
  }

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      <DialogTitle>Users</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          {error ? <Typography color="error">{error}</Typography> : null}
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="subtitle1">Users</Typography>
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setCreateMode((v) => !v)}>{createMode ? 'Cancel' : 'Create User'}</Button>
              <Button onClick={() => void reload()}>Refresh</Button>
            </Stack>
          </Stack>

          {createMode ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField size="small" label="Username" value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} />
              <TextField size="small" label="Password" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} />
              <Button variant="contained" onClick={() => void onCreate()}>Create</Button>
            </Stack>
          ) : null}

          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Username</TableCell>
                  <TableCell>Created</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={3} align="center"><CircularProgress size={20} /></TableCell>
                  </TableRow>
                ) : users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>{u.username}</TableCell>
                    <TableCell className="small">{new Date(u.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {editMode === u.id ? (
                        <Stack direction="row" spacing={1} alignItems="center">
                          <TextField size="small" type="password" placeholder="New password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} />
                          <Button variant="contained" onClick={() => void onUpdate(u.id)}>Save</Button>
                          <Button onClick={() => { setEditMode(null); setEditPassword(''); }}>Cancel</Button>
                        </Stack>
                      ) : (
                        <Stack direction="row" spacing={1}>
                          <Button onClick={() => setEditMode(u.id)}>Change Password</Button>
                          <Button variant="contained" color="error" onClick={() => void onDelete(u.id, u.username)}>Delete</Button>
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}