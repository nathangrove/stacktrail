import React from 'react';
import Dialog from '@mui/material/Dialog';
import DialogTitle from '@mui/material/DialogTitle';
import DialogContent from '@mui/material/DialogContent';
import DialogActions from '@mui/material/DialogActions';
import Button from '@mui/material/Button';

export function Modal({ title, children, onClose }: { title?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="md">
      {title ? <DialogTitle>{title}</DialogTitle> : null}
      <DialogContent dividers>{children}</DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
