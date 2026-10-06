import { Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { MathUtils } from 'three';
import ToteModel, { FallbackTote } from './ToteModel.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { toteConfig } from '../config/toteConfig.js';
import { constrainPan, frameCamera, panCamera } from '../lib/camera.js';

function CameraControls({ command, pan, frame }) {
  const ref = useRef();
  const lastCommand = useRef(null);
  const { camera, size, invalidate } = useThree();
  const framingWidth = frame?.width ?? size.width;
  const framingHeight = frame?.height ?? size.height;
  const homeDistance = Math.max(toteConfig.camera.position[2],
    2.95 / (2 * Math.tan(MathUtils.degToRad(toteConfig.camera.fov / 2)) * (framingWidth / framingHeight)));
  useLayoutEffect(() => {
    if (!size.width || !size.height) return;
    frameCamera(camera, size, frame ?? { left: 0, top: 0, ...size }, toteConfig.camera.fov);
    invalidate();
  }, [camera, frame, size.width, size.height, invalidate]);
  useEffect(() => { if (pan.x || pan.y) invalidate(); }, [pan, invalidate]);
  useFrame((_, delta) => {
    if (!ref.current || (!pan.x && !pan.y)) return;
    panCamera(camera, ref.current.target, pan.x, pan.y, delta);
    ref.current.update(); invalidate();
  });
  useEffect(() => {
    camera.position.set(toteConfig.camera.position[0], toteConfig.camera.position[1], homeDistance);
    ref.current?.target.set(...toteConfig.camera.target); ref.current?.update(); invalidate();
  }, [camera, homeDistance, invalidate]);
  useEffect(() => {
    const controls = ref.current;
    if (!controls || !command || lastCommand.current === command) return;
    lastCommand.current = command;
    const offset = camera.position.clone().sub(controls.target);
    if (command.type === 'reset') {
      camera.position.set(...toteConfig.camera.position); camera.position.z = homeDistance;
      controls.target.set(...toteConfig.camera.target);
    } else if (command.type === 'left' || command.type === 'right') {
      offset.applyAxisAngle({ x: 0, y: 1, z: 0 }, command.type === 'left' ? -0.2 : 0.2);
      camera.position.copy(controls.target).add(offset);
    } else {
      const distance = MathUtils.clamp(offset.length() * (command.type === 'in' ? 0.86 : 1.16),
        toteConfig.camera.minDistance, Math.max(homeDistance + 2, toteConfig.camera.maxDistance));
      camera.position.copy(controls.target).add(offset.setLength(distance));
    }
    controls.update(); invalidate();
  }, [command, camera, homeDistance, invalidate]);
  return <OrbitControls ref={ref} makeDefault enablePan screenSpacePanning enableDamping dampingFactor={0.09}
    onChange={() => { if (ref.current) constrainPan(camera, ref.current.target); }}
    rotateSpeed={0.65} zoomSpeed={0.7} panSpeed={-1} minDistance={toteConfig.camera.minDistance}
    maxDistance={Math.max(homeDistance + 2, toteConfig.camera.maxDistance)}
    minPolarAngle={toteConfig.camera.minPolarAngle} maxPolarAngle={toteConfig.camera.maxPolarAngle}
    target={toteConfig.camera.target} />;
}

export default function ToteScene({ command, pan, frame, selected, onUnavailable, onReady, onModelError, onSceneError }) {
  const [supported] = useState(() => {
    try {
      const context = document.createElement('canvas').getContext('webgl2');
      context?.getExtension('WEBGL_lose_context')?.loseContext();
      return Boolean(context);
    } catch { return false; }
  });
  useEffect(() => { if (!supported) onSceneError(); }, [supported, onSceneError]);
  const modelProps = { selected, onUnavailable, onReady };
  if (!supported) return null;
  return <ErrorBoundary onError={onSceneError} fallback={null}>
    <Canvas frameloop="demand" dpr={[1.5, 3]} camera={toteConfig.camera}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      fallback={<p>Your browser does not support the 3D preview.</p>}
      onCreated={({ gl }) => gl.setClearColor(0x000000, 0)}>
      <ambientLight intensity={1.05} />
      <hemisphereLight args={['#fffaf0', '#b4a68e', 1.1]} />
      <directionalLight position={[4, 6, 5]} intensity={3} color="#fff8e8" />
      <directionalLight position={[-4, 2, 3]} intensity={1.2} color="#e5edff" />
      <directionalLight position={[2, 4, -4]} intensity={2.2} />
      <Suspense fallback={null}>
        <ErrorBoundary onError={onModelError} fallback={<FallbackTote {...modelProps} />}>
          <ToteModel {...modelProps} />
        </ErrorBoundary>
        <ContactShadows position={[0, -1.75, 0]} opacity={0.24} scale={8} blur={2.8} far={4} resolution={256} frames={1} />
      </Suspense>
      <CameraControls command={command} pan={pan} frame={frame} />
    </Canvas>
  </ErrorBoundary>;
}
