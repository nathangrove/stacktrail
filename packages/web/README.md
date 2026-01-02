# Web app (dev)

This package is the web dashboard for the project. I added a small UI refresh using Material UI (MUI):

- Uses `@mui/material`, `@mui/icons-material` and Emotion for styling.
- Adds an AppBar + Drawer layout and a simple `Dashboard` page with summary cards.

Run locally:

```bash
cd packages/web
pnpm install
pnpm run dev
```

You can open the app at http://localhost:5173 (Vite default) and explore the new dashboard and menu.
