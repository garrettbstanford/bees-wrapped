import { useCallback, useEffect, useRef, useState } from 'react';

export default function PanJoystick({ onChange }) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const activePointer = useRef(null);
  const update = useCallback((x, y) => {
    const length = Math.max(1, Math.hypot(x, y));
    const next = { x: x / length, y: y / length };
    setPosition(next); onChange(next);
  }, [onChange]);
  const stop = useCallback(() => { activePointer.current = null; update(0, 0); }, [update]);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) stop(); };
    window.addEventListener('blur', stop);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', stop);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [stop]);
  function move(event) {
    if (activePointer.current !== event.pointerId) return;
    const box = event.currentTarget.getBoundingClientRect();
    update((event.clientX - box.left - box.width / 2) / 25,
      -(event.clientY - box.top - box.height / 2) / 25);
  }
  const directions = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
  return <div className="pan-control">
    <button className="pan-joystick" aria-label="Pan view. Drag the joystick or use arrow keys."
      onPointerDown={event => {
        if (event.button !== 0 || activePointer.current !== null) return;
        activePointer.current = event.pointerId;
        event.currentTarget.setPointerCapture(event.pointerId); move(event);
      }}
      onPointerMove={move} onPointerUp={stop} onPointerCancel={stop} onLostPointerCapture={stop}
      onBlur={stop} onKeyDown={event => {
        if (directions[event.key]) { event.preventDefault(); update(...directions[event.key]); }
      }} onKeyUp={event => { if (directions[event.key]) { event.preventDefault(); stop(); } }}>
      <svg className="pan-arrows" viewBox="0 0 88 88" fill="none" aria-hidden="true">
        <path d="m39 13 5-5 5 5m26 26 5 5-5 5M49 75l-5 5-5-5M13 49l-5-5 5-5" />
      </svg>
      <span className="pan-thumb" style={{ transform: `translate(${position.x * 22}px, ${-position.y * 22}px)` }} aria-hidden="true" />
    </button>
    <span className="pan-label">Pan</span>
  </div>;
}
