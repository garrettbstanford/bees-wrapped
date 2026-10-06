import { Component } from 'react';

export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) {
    console.warn('Tote preview fallback:', error.message);
    this.props.onError?.(error);
  }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
