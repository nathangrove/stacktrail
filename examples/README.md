# StackTrail - Example Applications

This directory contains example applications that demonstrate how to use the StackTrail SDK to automatically capture and report errors.

## Prerequisites

1. Make sure the StackTrail server is running:
   ```bash
   cd packages/server
   npm run dev
   ```

2. The server should be running on `http://localhost:4000`

## Using local packages (no npm publish)

Within this repo, the React demo already depends on the SDK via a local file dependency (`file:../../packages/sdk`), so a normal `npm install` is enough.

If you want to use the SDK or CLI from a different local project (outside this repo), use `npm link`:

### SDK via `npm link`

```bash
cd packages/sdk
npm install
npm run build
npm link
```

Then, in your app repo:

```bash
npm link @stacktrail/sdk
```

### CLI via `npm link`

```bash
cd packages/cli
npm link
stacktrail --help
```

## HTML Demo

A simple HTML page with buttons to trigger various error types:

```bash
cd examples/html-demo
node server.js
```

Then open `http://localhost:8080` to test error capturing.

### Features Demonstrated

- **Dynamic Configuration**: Enter custom project keys and ingest keys via input fields
- **Real-time Updates**: Change configuration without page refresh
- **Uncaught Exceptions**: Global error handler captures JavaScript errors
- **Unhandled Promise Rejections**: Captures unhandled promise rejections
- **Manual Error Reporting**: Using `tracker.captureException()`
- **Complex Scenarios**: Nested errors, event listener errors, timeout errors

## React Demo

A React application that shows how to integrate the SDK with React components.

### Running the React Demo

1. Install dependencies:
   ```bash
   cd examples/react-demo
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open `http://localhost:3000` in your browser
4. Click error buttons to trigger different error types
5. View captured errors in the dashboard

### Features Demonstrated

- **Dynamic Configuration**: Configure project keys and ingest keys via UI inputs
- **React Integration**: SDK usage in React components and hooks
- **Component Errors**: Errors within React component lifecycle
- **Async Errors**: Errors in async operations and timeouts
- **Network Errors**: Failed network requests
- **Manual Capture**: Using the SDK's capture methods in React

### Features Demonstrated

- **React Integration**: SDK initialization in React apps
- **Component Errors**: Errors within React component lifecycle
- **Async Errors**: Errors in async operations and timeouts
- **Network Errors**: Failed network requests
- **Manual Capture**: Using the SDK's capture methods in React

## SDK Configuration

Both examples allow dynamic configuration of:

- **DSN**: Fixed to `http://localhost:4000/api/events`
- **Project Keys**: Configurable via input fields (defaults: `demo` for HTML, `react-demo` for React)
- **Ingest Keys**: Optional per-project authentication keys

### Configuration Steps

1. **Create Projects**: Use the dashboard at `http://localhost:4000` to create projects
2. **Generate Keys**: Copy ingest keys from the project settings
3. **Configure Demo**: Enter project keys and ingest keys in the demo UI
4. **Test**: Trigger errors to verify they're sent to the correct projects

In production, you would:
1. Set up projects in the dashboard
2. Use the generated ingest keys
3. Configure the SDK with proper authentication

## Error Types Covered

1. **JavaScript Errors**: `throw new Error()`
2. **Reference Errors**: Accessing undefined variables
3. **Type Errors**: Calling methods on null/undefined
4. **Promise Rejections**: Unhandled promise rejections
5. **Network Errors**: Failed fetch requests
6. **Async Errors**: Errors in setTimeout/callbacks
7. **React Errors**: Component rendering errors
8. **Manual Capture**: Programmatically reporting errors

## Viewing Captured Errors

After triggering errors:

1. **Server Logs**: Check the terminal running the server for incoming error reports
2. **Web Dashboard**: Visit `http://localhost:4000` and navigate to the appropriate project
3. **API**: Use the REST API to query errors programmatically

## Next Steps

- Create your own projects in the dashboard
- Generate ingest keys for each project
- Integrate the SDK into your applications
- Set up proper error monitoring and alerting