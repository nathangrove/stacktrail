import React, { useEffect, useState } from "react";
import {
  createUser,
  deleteUser,
  fetchUsers,
  updateUserPassword,
  type User
} from "./api";
import { Container, Paper, Typography, Stack, Button, TextField, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress } from '@mui/material';

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [createMode, setCreateMode] = useState(false);
  const [createUsername, setCreateUsername] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [editMode, setEditMode] = useState<string | null>(null);
  const [editPassword, setEditPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reloadUsers() {
    setError(null);
    setLoading(true);
    try {
      const data = await fetchUsers();
      setUsers(data);
    } catch (e: any) {
      const msg = e?.message ?? "Failed to load users";
      setError(msg.includes("401") ? "Unauthorized: Basic Auth required." : msg);
    } finally {
      setLoading(false);
    }
  }

  async function onCreateUser() {
    const username = createUsername.trim();
    const password = createPassword.trim();
    if (!username || !password) return;

    setError(null);
    setLoading(true);
    try {
      await createUser(username, password);
      await reloadUsers();
      setCreateMode(false);
      setCreateUsername("");
      setCreatePassword("");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create user");
    } finally {
      setLoading(false);
    }
  }

  async function onUpdatePassword(userId: string) {
    const password = editPassword.trim();
    if (!password) return;

    setError(null);
    setLoading(true);
    try {
      await updateUserPassword(userId, password);
      setEditMode(null);
      setEditPassword("");
      await reloadUsers();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update password");
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteUser(userId: string, username: string) {
    if (!confirm(`Are you sure you want to delete user "${username}"?`)) return;

    setError(null);
    setLoading(true);
    try {
      await deleteUser(userId);
      await reloadUsers();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete user");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reloadUsers();
  }, []);

  return (
    <Container maxWidth={false} disableGutters sx={{ width: '100%', mt: 3, px: 2 }}>
      <div style={{ marginBottom: 12 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
          <div>
            <Typography variant="h6">User Management</Typography>
            <Typography variant="body2" color="text.secondary">Manage system users</Typography>
          </div>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => setCreateMode((s) => !s)} variant="contained" disabled={loading}>{createMode ? 'Cancel' : 'Create User'}</Button>
          </Stack>
        </Stack>

        {error ? <Typography color="error" sx={{ mb: 2 }}>{error}</Typography> : null}

        {createMode ? (
          <Paper sx={{ p: 2, mb: 2 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mb: 0 }} alignItems="center">
              <TextField label="Username" size="small" value={createUsername} onChange={(e) => setCreateUsername(e.target.value)} disabled={loading} />
              <TextField label="Password" size="small" type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} disabled={loading} />
              <Button variant="contained" onClick={() => void onCreateUser()} disabled={loading || !createUsername.trim() || !createPassword.trim()}>Create</Button>
            </Stack>
          </Paper>
        ) : null}
      </div>

      <TableContainer component={Paper} variant="outlined">
        <Table>
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
            ) : users.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="small">No users found.</TableCell>
              </TableRow>
            ) : users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>{user.username}</TableCell>
                <TableCell>{formatTime(user.createdAt)}</TableCell>
                <TableCell>
                  {editMode === user.id ? (
                    <Stack direction="row" spacing={1} alignItems="center">
                      <TextField size="small" type="password" placeholder="New password" value={editPassword} onChange={(e) => setEditPassword(e.target.value)} disabled={loading} />
                      <Button variant="contained" onClick={() => void onUpdatePassword(user.id)} disabled={loading || !editPassword.trim()}>Save</Button>
                      <Button variant="outlined" onClick={() => { setEditMode(null); setEditPassword(''); }} disabled={loading}>Cancel</Button>
                    </Stack>
                  ) : (
                    <Stack direction="row" spacing={1}>
                      <Button variant="outlined" onClick={() => setEditMode(user.id)} disabled={loading}>Change Password</Button>
                      <Button variant="contained" color="error" onClick={() => void onDeleteUser(user.id, user.username)} disabled={loading}>Delete</Button>
                    </Stack>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}