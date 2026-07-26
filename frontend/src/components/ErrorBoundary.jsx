/**
 * Error boundary — chunk-load failures get a reload prompt; other errors show details.
 */

import { Component } from 'react'

function isChunkLoadError(error) {
  if (!error) return false
  const msg = String(error.message || error)
  const name = String(error.name || '')
  return (
    name === 'ChunkLoadError'
    || /Loading chunk [\d]+ failed/i.test(msg)
    || /Failed to fetch dynamically imported module/i.test(msg)
    || /Importing a module script failed/i.test(msg)
    || /error loading dynamically imported module/i.test(msg)
  )
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, chunk: false }
  }

  static getDerivedStateFromError(error) {
    return {
      error,
      chunk: isChunkLoadError(error),
    }
  }

  componentDidCatch(error, info) {
    console.error('ClearLine ErrorBoundary', error, info)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleCopy = async () => {
    const { error } = this.state
    const text = [
      error?.name,
      error?.message,
      error?.stack,
    ].filter(Boolean).join('\n\n')
    try {
      await navigator.clipboard.writeText(text || 'Unknown error')
    } catch (err) {
      console.error(err)
      window.prompt('Copy error details:', text)
    }
  }

  render() {
    const { error, chunk } = this.state
    if (!error) return this.props.children

    if (chunk) {
      return (
        <div className="error-boundary" role="alert">
          <div className="error-boundary-card">
            <div className="survey-kicker">Update required</div>
            <h1>A new version was deployed — reload to continue</h1>
            <p>This screen usually appears after an app update while an old tab is still open.</p>
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              Reload
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-card">
          <div className="survey-kicker">Something went wrong</div>
          <h1>ClearLine hit an error</h1>
          <p className="error-boundary-message">{error.message || String(error)}</p>
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={this.handleReload}>
              Reload
            </button>
            <button type="button" className="btn btn-secondary" onClick={this.handleCopy}>
              Copy details
            </button>
          </div>
        </div>
      </div>
    )
  }
}
