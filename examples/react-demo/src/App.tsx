import { useState, useEffect } from 'react'
import { initClientErrorTracker } from '@stacktrail/sdk' 
import './App.css'

function App() {
  const [status, setStatus] = useState<string>('')
  const [dsn, setDsn] = useState<string>('http://localhost:4000/api/events')
  const [projectKey, setProjectKey] = useState<string>('react-demo')
  const [ingestKey, setIngestKey] = useState<string>('')
  const [tracker, setTracker] = useState<any>(null)

  const showStatus = (message: string, type: 'success' | 'error' = 'success') => {
    setStatus(`${type === 'error' ? '❌' : '✅'} ${message}`)
    setTimeout(() => setStatus(''), 3000)
  }

  const initializeTracker = () => {
    if (!projectKey.trim()) {
      showStatus('Project key is required!', 'error')
      return
    }

    const config: any = {
      dsn: dsn.trim() || 'http://localhost:4000/api/events',
      projectKey: projectKey.trim()
    }

    if (ingestKey.trim()) {
      config.ingestKey = ingestKey.trim()
    }

    const newTracker = initClientErrorTracker(config)
    setTracker(newTracker)
    showStatus('Configuration updated!', 'success')
  }

  useEffect(() => {
    initializeTracker()
  }, []) // Initialize on mount

  const triggerUncaughtError = () => {
    showStatus('Triggering uncaught error...', 'error')
    throw new Error('This is an uncaught error from React!')
  }

  const triggerAsyncError = () => {
    showStatus('Triggering async error...', 'error')
    setTimeout(() => {
      throw new Error('Async error in React component!')
    }, 100)
  }

  const triggerPromiseRejection = () => {
    showStatus('Triggering unhandled promise rejection...', 'error')
    Promise.reject(new Error('Unhandled promise rejection in React!'))
  }

  const captureCustomError = () => {
    if (!tracker) {
      showStatus('Tracker not initialized!', 'error')
      return
    }
    showStatus('Capturing custom error...')
    tracker.captureException(new Error('Manually captured error in React component'))
  }

  const triggerComponentError = () => {
    showStatus('Triggering component error...', 'error')
    // This will cause a render error
    setTimeout(() => {
      const badState = { error: null }
      // @ts-ignore - intentionally bad code
      badState.error.crash()
    }, 100)
  }

  const triggerNetworkError = () => {
    showStatus('Triggering network error...', 'error')
    fetch('http://nonexistent-domain-that-will-fail-12345.com')
      .then(() => {
        throw new Error('This should not execute')
      })
      .catch(e => {
        throw new Error(`Network error: ${e.message}`)
      })
  }

  const triggerStateError = () => {
    showStatus('Triggering state error...', 'error')
    // This will cause an error when trying to update state
    setTimeout(() => {
      // @ts-ignore - intentionally bad code to trigger error
      setStatus(null).crash()
    }, 100)
  }

  return (
    <div className="App">
      <header className="App-header">
        <h1>⚛️ React StackTrail Demo</h1>
        <p>Click buttons to trigger different types of errors</p>
      </header>

      <main className="App-main">
        <div className="config-info">
          <h3>SDK Configuration</h3>
          <div className="config-form">
            <div className="config-field">
              <label>DSN:</label>
              <input type="text" value={dsn} onChange={(e) => setDsn(e.target.value)} placeholder="http://localhost:4000/api/events" />
            </div>
            <div className="config-field">
              <label>Project Key:</label>
              <input
                type="text"
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
                placeholder="Enter project key"
              />
            </div>
            <div className="config-field">
              <label>Ingest Key (optional):</label>
              <input
                type="text"
                value={ingestKey}
                onChange={(e) => setIngestKey(e.target.value)}
                placeholder="Leave empty for demo"
              />
            </div>
            <button onClick={initializeTracker} className="btn success">
              Update Configuration
            </button>
          </div>
          <div className="current-config">
            Current: DSN: http://localhost:4000/api/events | Project: {projectKey} | Ingest Key: {ingestKey || '(none)'}
          </div>
        </div>

        <div className="error-section">
          <h3>Uncaught Errors</h3>
          <p>These will be automatically captured by the global error handler</p>
          <div className="button-group">
            <button className="btn danger" onClick={triggerUncaughtError}>
              Throw Error
            </button>
            <button className="btn danger" onClick={triggerAsyncError}>
              Async Error
            </button>
            <button className="btn danger" onClick={triggerComponentError}>
              Component Error
            </button>
          </div>
        </div>

        <div className="error-section">
          <h3>Promise Rejections</h3>
          <p>Unhandled promise rejections are automatically captured</p>
          <div className="button-group">
            <button className="btn danger" onClick={triggerPromiseRejection}>
              Unhandled Rejection
            </button>
            <button className="btn danger" onClick={triggerNetworkError}>
              Network Error
            </button>
          </div>
        </div>

        <div className="error-section">
          <h3>Manual Error Reporting</h3>
          <p>Use the SDK's captureException method for custom errors</p>
          <div className="button-group">
            <button className="btn" onClick={captureCustomError}>
              Capture Custom Error
            </button>
            <button className="btn danger" onClick={triggerStateError}>
              State Error
            </button>
          </div>
        </div>

        <div className="error-section">
          <h3>Instructions</h3>
          <ol>
            <li>Make sure the StackTrail server is running on port 4000</li>
            <li>Configure your project key and ingest key (optional) above</li>
            <li>Create projects in the dashboard at <code>http://localhost:4000</code> if needed</li>
            <li>Click any error button above</li>
            <li>Check server logs and dashboard for captured errors</li>
            <li>Try different error types to see how they're handled</li>
          </ol>
        </div>

        {status && (
          <div className={`status ${status.includes('❌') ? 'error' : 'success'}`}>
            {status}
          </div>
        )}
      </main>
    </div>
  )
}

export default App