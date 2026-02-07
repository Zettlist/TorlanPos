import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        console.error("Uncaught error:", error, errorInfo);
        this.setState({ error, errorInfo });
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{ padding: '20px', color: 'white', backgroundColor: '#1e293b', minHeight: '100vh', fontFamily: 'monospace' }}>
                    <h1 style={{ color: '#ef4444', marginBottom: '20px' }}>Algo salió mal (React Error)</h1>
                    <div style={{ backgroundColor: '#0f172a', padding: '15px', borderRadius: '8px', border: '1px solid #334155' }}>
                        <h3 style={{ margin: '0 0 10px 0', color: '#fbbf24' }}>Error Message:</h3>
                        <p style={{ margin: '0 0 20px 0', whiteSpace: 'pre-wrap' }}>{this.state.error && this.state.error.toString()}</p>

                        <h3 style={{ margin: '0 0 10px 0', color: '#94a3b8' }}>Component Stack:</h3>
                        <pre style={{ margin: '0', whiteSpace: 'pre-wrap', fontSize: '12px', color: '#cbd5e1' }}>
                            {this.state.errorInfo && this.state.errorInfo.componentStack}
                        </pre>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
