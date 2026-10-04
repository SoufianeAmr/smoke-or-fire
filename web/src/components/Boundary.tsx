// A part of a screen that can fail on its own (the map): if it throws while it is drawn, what is given in its place.
// The rest of the screen is untouched.
import { Component, type ReactNode } from "react";

interface Props {
  fallback: ReactNode;
  /** Told once, when the part fails. */
  onError?: () => void;
  children: ReactNode;
}

export class Boundary extends Component<Props, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError?.();
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
