import React from 'react';
import AppBar from '@mui/material/AppBar';
import Box from '@mui/material/Box';
import CssBaseline from '@mui/material/CssBaseline';
import Divider from '@mui/material/Divider';
import Drawer from '@mui/material/Drawer';
import IconButton from '@mui/material/IconButton';
import List from '@mui/material/List';
import ListItem from '@mui/material/ListItem';
import ListItemIcon from '@mui/material/ListItemIcon';
import ListItemText from '@mui/material/ListItemText';
import Toolbar from '@mui/material/Toolbar';
import Typography from '@mui/material/Typography';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import HomeIcon from '@mui/icons-material/Home';
import DashboardIcon from '@mui/icons-material/Dashboard';
import BugReportIcon from '@mui/icons-material/BugReport';
import PeopleIcon from '@mui/icons-material/People';
import FolderIcon from '@mui/icons-material/Folder';
import Tooltip from '@mui/material/Tooltip';
import { Link as RouterLink } from 'react-router-dom';

const drawerWidth = 240;
const collapsedWidth = 64;

export const Layout: React.FC<{ title?: string; actions?: React.ReactNode; children?: React.ReactNode }> = ({ title = 'StackTrail', actions, children }) => {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  // Persist collapsed state in localStorage so devs don't have to reset it each reload
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem('stacktrail.drawerCollapsed');
      if (raw === '1' || raw === '0') setCollapsed(raw === '1');
    } catch {
      // ignore
    }
  }, []);

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleCollapseToggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem('stacktrail.drawerCollapsed', c ? '0' : '1');
      } catch {
        // ignore
      }
      return !c;
    });
  };

  const drawer = (
    <Box sx={{ position: 'relative', minHeight: '100%' }}>
      <Toolbar />
      <Divider />
      <List>
        <Tooltip title="Dashboard" placement="right" disableHoverListener={!collapsed}>
          <ListItem button component={RouterLink} to="/" sx={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <ListItemIcon>
              <DashboardIcon />
            </ListItemIcon>
            <ListItemText primary="Dashboard" sx={{ display: collapsed ? 'none' : 'block' }} />
          </ListItem>
        </Tooltip>
        <Tooltip title="Issues" placement="right" disableHoverListener={!collapsed}>
          <ListItem button component={RouterLink} to="/issues" reloadDocument sx={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <ListItemIcon>
              <BugReportIcon />
            </ListItemIcon>
            <ListItemText primary="Issues" sx={{ display: collapsed ? 'none' : 'block' }} />
          </ListItem>
        </Tooltip>
        <Tooltip title="Projects" placement="right" disableHoverListener={!collapsed}>
          <ListItem button component={RouterLink} to="/projects" sx={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <ListItemIcon>
              <FolderIcon />
            </ListItemIcon>
            <ListItemText primary="Projects" sx={{ display: collapsed ? 'none' : 'block' }} />
          </ListItem>
        </Tooltip>
        <Tooltip title="Users" placement="right" disableHoverListener={!collapsed}>
          <ListItem button component={RouterLink} to="/users" sx={{ justifyContent: collapsed ? 'center' : 'flex-start' }}>
            <ListItemIcon>
              <PeopleIcon />
            </ListItemIcon>
            <ListItemText primary="Users" sx={{ display: collapsed ? 'none' : 'block' }} />
          </ListItem>
        </Tooltip>
      </List>

      {/* Collapse toggle at the bottom of the drawer */}
      <Box sx={{ position: 'absolute', bottom: 8, width: '100%', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end', px: 1 }}>
        <Tooltip title={collapsed ? 'Expand menu' : 'Collapse menu'} disableHoverListener={!collapsed}>
          <IconButton onClick={handleCollapseToggle} size="small" aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}>
            {collapsed ? <ChevronRightIcon /> : <ChevronLeftIcon />}
          </IconButton>
        </Tooltip>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
        <Toolbar>
          <IconButton color="inherit" edge="start" onClick={handleDrawerToggle} sx={{ mr: 2, display: { sm: 'none' } }}>
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component={RouterLink} to="/" sx={{ flexGrow: 1, color: 'inherit', textDecoration: 'none', display: { xs: 'none', sm: 'block' } }}>
            {title}
          </Typography>
          <div>{actions}</div>
        </Toolbar>
      </AppBar>

      <Box component="nav" sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }} aria-label="mailbox folders">
        <Drawer variant="temporary" open={mobileOpen} onClose={handleDrawerToggle} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', sm: 'none' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth } }}>
          {drawer}
        </Drawer>
        <Drawer variant="permanent" sx={{ display: { xs: 'none', sm: 'block' }, '& .MuiDrawer-paper': { boxSizing: 'border-box', width: collapsed ? collapsedWidth : drawerWidth, overflowX: 'hidden', transition: (theme) => theme.transitions.create('width', { easing: theme.transitions.easing.sharp, duration: theme.transitions.duration.shortest }) } }} open>
          {drawer}
        </Drawer>
      </Box>

      <Box component="main" sx={{ flexGrow: 1, p: 3, width: { sm: `calc(100% - ${collapsed ? collapsedWidth : drawerWidth}px)` }, transition: (theme) => theme.transitions.create('width', { easing: theme.transitions.easing.sharp, duration: theme.transitions.duration.shortest }) }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
};
