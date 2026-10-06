import { lazy, Suspense, useCallback, useLayoutEffect, useRef, useState } from 'react';
import PatchSelector from './components/PatchSelector.jsx';
import PanJoystick from './components/PanJoystick.jsx';
import { toteConfig } from './config/toteConfig.js';

const ToteScene = lazy(() => import('./components/ToteScene.jsx'));

export default function App() {
  const [selected, setSelected] = useState(['patch-1']);
  const [unavailable, setUnavailable] = useState([]);
  const [ready, setReady] = useState(false);
  const [notice, setNotice] = useState('');
  const [sceneError, setSceneError] = useState(false);
  const [command, setCommand] = useState(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const framingRef = useRef(null);
  const [frame, setFrame] = useState(null);
  useLayoutEffect(() => {
    const element = framingRef.current;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const parent = element.parentElement.getBoundingClientRect();
      const next = { left: bounds.left - parent.left, top: bounds.top - parent.top,
        width: bounds.width, height: bounds.height };
      setFrame(previous => previous && Object.keys(next).every(key => previous[key] === next[key]) ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, []);
  const onUnavailable = useCallback(id => {
    setUnavailable(ids => ids.includes(id) ? ids : [...ids, id]);
    setSelected(ids => ids.filter(value => value !== id));
  }, []);
  const onReady = useCallback(automatic => {
    setReady(true);
    if (automatic) console.info('Using the largest body mesh as the patch target. Inspect your model and update bodyMeshNames if needed.');
  }, []);
  const onModelError = useCallback(() => setNotice('Showing a sample tote. The original model is temporarily unavailable.'), []);
  const onSceneError = useCallback(() => { setReady(true); setSceneError(true); }, []);
  const control = type => setCommand({ type, time: performance.now() });
  function onKeyDown(event) {
    const keys = { ArrowLeft: 'left', ArrowRight: 'right', '+': 'in', '=': 'in', '-': 'out', Home: 'reset' };
    if (keys[event.key]) { event.preventDefault(); control(keys[event.key]); }
  }
  return <main className="tote-app" style={{ '--background-image': `url("${toteConfig.background.image}")`,
    '--background-size': toteConfig.background.size, '--background-repeat': toteConfig.background.repeat }}>
    <header className="page-header">
      <div className="edition">PROOF OF CONCEPT</div>
      <h1>Bees Tote Bag</h1>
    </header>
    <div className="scene-framing" ref={framingRef} aria-hidden="true" />
    <div className="scene" role="region" aria-label="Interactive 3D tote bag. Drag to rotate, scroll to zoom. Use left and right arrow keys to rotate, plus or minus to zoom, Home to reset."
      tabIndex={0} onKeyDown={onKeyDown}>
      <Suspense fallback={null}>
        <ToteScene command={command} pan={pan} frame={frame} selected={selected} onUnavailable={onUnavailable}
          onReady={onReady} onModelError={onModelError} onSceneError={onSceneError} />
      </Suspense>
      {!ready && <div className="scene-loading" role="status"><span />Loading…</div>}
      {sceneError && <div className="scene-error" role="alert">3D preview isn’t available in this browser.<br />Try refreshing or enabling graphics acceleration.</div>}
    </div>
    {notice && <p className="model-notice" role="status">{notice}</p>}
    <div className="navigation-controls">
      <PanJoystick onChange={setPan} />
      <div className="view-controls" role="group" aria-label="3D view controls">
      <button aria-label="Zoom out" onClick={() => control('out')}><span aria-hidden="true">−</span></button>
      <button aria-label="Reset view" onClick={() => control('reset')}><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 10a8 8 0 1 1 1.2 6M4 4v6h6" /></svg></button>
      <button aria-label="Zoom in" onClick={() => control('in')}><span aria-hidden="true">+</span></button>
      </div>
    </div>
    <p className="interaction-hint"><span className="desktop-hint">Drag to rotate · Scroll to zoom</span><span className="mobile-hint">Drag to rotate · Pinch to zoom</span></p>
    <div className="bottom-area">
      <PatchSelector selected={selected} unavailable={unavailable} onUnavailable={onUnavailable}
        onToggle={id => setSelected(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id])}
        onClear={() => setSelected([])} />
    </div>
  </main>;
}
