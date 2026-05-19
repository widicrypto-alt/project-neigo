'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface CharacterPanelProps {
  emotion?: 'neutral' | 'blush' | 'angry' | 'sad';
  mood?: 'candlelight' | 'moonlight' | 'dawn';
  parallax?: boolean;
}

export function CharacterPanel({ emotion = 'neutral', mood = 'candlelight', parallax = true }: CharacterPanelProps) {
  const stageRef = React.useRef<HTMLDivElement>(null);
  const [tilt, setTilt] = React.useState({ x: 0, y: 0 });

  React.useEffect(() => {
    if (!parallax) { setTilt({ x: 0, y: 0 }); return; }
    const onMove = (e: MouseEvent) => {
      if (!stageRef.current) return;
      const r = stageRef.current.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / r.width;
      const dy = (e.clientY - cy) / r.height;
      setTilt({ x: Math.max(-1, Math.min(1, dx)), y: Math.max(-1, Math.min(1, dy)) });
    };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [parallax]);

  // Mood lighting
  const moodLightMap: Record<string, any> = {
    candlelight: {
      key: 'rgba(255, 178, 110, 0.55)',
      rim: 'rgba(255, 200, 130, 0.35)',
      ambient: 'radial-gradient(ellipse 75% 60% at 50% 60%, rgba(80, 40, 18, 0.4) 0%, rgba(20, 12, 8, 0.85) 60%, rgba(8, 5, 3, 1) 100%)',
      tint: 'rgba(255, 160, 80, 0.10)'
    },
    moonlight: {
      key: 'rgba(140, 170, 220, 0.45)',
      rim: 'rgba(180, 200, 240, 0.35)',
      ambient: 'radial-gradient(ellipse 75% 60% at 50% 60%, rgba(20, 30, 60, 0.45) 0%, rgba(8, 10, 18, 0.9) 60%, rgba(3, 4, 8, 1) 100%)',
      tint: 'rgba(120, 150, 220, 0.10)'
    },
    dawn: {
      key: 'rgba(255, 180, 160, 0.55)',
      rim: 'rgba(255, 200, 200, 0.35)',
      ambient: 'radial-gradient(ellipse 75% 60% at 50% 60%, rgba(90, 50, 50, 0.4) 0%, rgba(30, 18, 18, 0.9) 60%, rgba(15, 10, 10, 1) 100%)',
      tint: 'rgba(255, 160, 130, 0.10)'
    },
    daylight: {
      key: 'rgba(255, 250, 240, 0.6)',
      rim: 'rgba(255, 255, 255, 0.4)',
      ambient: 'radial-gradient(ellipse 75% 60% at 50% 60%, rgba(255, 240, 220, 0.2) 0%, rgba(200, 180, 160, 0.5) 60%, rgba(150, 130, 110, 0.8) 100%)',
      tint: 'rgba(255, 240, 200, 0.05)'
    },
    dusk: {
      key: 'rgba(255, 150, 100, 0.5)',
      rim: 'rgba(200, 100, 200, 0.3)',
      ambient: 'radial-gradient(ellipse 75% 60% at 50% 60%, rgba(120, 60, 80, 0.4) 0%, rgba(60, 30, 50, 0.8) 60%, rgba(30, 15, 25, 1) 100%)',
      tint: 'rgba(200, 100, 150, 0.1)'
    },
    night: {
      key: 'rgba(100, 120, 180, 0.3)',
      rim: 'rgba(150, 180, 255, 0.2)',
      ambient: 'radial-gradient(ellipse 75% 60% at 50% 60%, rgba(10, 15, 30, 0.6) 0%, rgba(5, 8, 15, 0.9) 60%, rgba(0, 0, 0, 1) 100%)',
      tint: 'rgba(100, 120, 200, 0.15)'
    }
  };
  const moodLight = moodLightMap[mood] || moodLightMap.candlelight;

  return (
    <div
      ref={stageRef}
      className="grain no-select"
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: '#06040a',
      }}
    >
      {/* ============ BACKGROUND LAYERS ============ */}
      {/* Far back: window / wall */}
      <div style={{
        position: 'absolute', inset: '-4%',
        transform: `translate(${tilt.x * -8}px, ${tilt.y * -6}px) scale(1.05)`,
        transition: 'transform 400ms cubic-bezier(.2,.6,.2,1)',
        animation: 'scenePan 30s ease-in-out infinite',
      }}>
        <SceneBack mood={mood} />
      </div>

      {/* Mid back: room interior elements */}
      <div style={{
        position: 'absolute', inset: '-2%',
        transform: `translate(${tilt.x * -16}px, ${tilt.y * -10}px)`,
        transition: 'transform 400ms cubic-bezier(.2,.6,.2,1)',
        filter: 'blur(4px)',
        opacity: 0.85,
      }}>
        <SceneMid mood={mood} />
      </div>

      {/* Mood ambient overlay */}
      <div style={{
        position: 'absolute', inset: 0,
        background: moodLight.ambient,
        pointerEvents: 'none',
        mixBlendMode: 'multiply',
      }} />

      {/* Color tint */}
      <div style={{
        position: 'absolute', inset: 0,
        background: moodLight.tint,
        pointerEvents: 'none',
        mixBlendMode: 'soft-light',
      }} />

      {/* ============ CHARACTER ============ */}
      <div style={{
        position: 'absolute',
        left: '50%', bottom: '-2%',
        width: '78%',
        aspectRatio: '9/16',
        transform: `translateX(-50%) translate(${tilt.x * 6}px, ${tilt.y * 4}px)`,
        transition: 'transform 400ms cubic-bezier(.2,.6,.2,1)',
        maxHeight: '102%',
      }}>
        <div style={{
          width: '100%', height: '100%',
          animation: 'breathe 5.2s ease-in-out infinite',
          transformOrigin: '50% 100%',
        }}>
          <CharacterPortrait emotion={emotion} mood={mood} />
        </div>
      </div>

      {/* Foreground: candle flicker light orbs */}
      {mood === 'candlelight' && (
        <>
          <div style={{
            position: 'absolute',
            left: '12%', bottom: '18%',
            width: 8, height: 8,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #ffd089 0%, #ff9040 50%, transparent 80%)',
            boxShadow: '0 0 30px 10px rgba(255, 160, 80, 0.4)',
            animation: 'flicker 2.4s ease-in-out infinite',
            transform: `translate(${tilt.x * 4}px, ${tilt.y * 3}px)`,
            zIndex: 8,
          }} />
          <div style={{
            position: 'absolute',
            left: '85%', bottom: '24%',
            width: 5, height: 5,
            borderRadius: '50%',
            background: 'radial-gradient(circle, #ffd089 0%, #ff9040 50%, transparent 80%)',
            boxShadow: '0 0 22px 8px rgba(255, 160, 80, 0.35)',
            animation: 'flicker 1.8s ease-in-out infinite 0.6s',
            transform: `translate(${tilt.x * 5}px, ${tilt.y * 3}px)`,
            zIndex: 8,
          }} />
        </>
      )}

      {/* Floating dust motes */}
      <DustMotes count={14} />

      {/* Soft vignette focusing on face (upper-mid) */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse 50% 40% at 50% 35%, transparent 0%, transparent 35%, rgba(0,0,0,0.55) 100%)',
        pointerEvents: 'none',
        zIndex: 20,
      }} />

      {/* Right-edge soft fade into chat panel */}
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0,
        width: '12%',
        background: 'linear-gradient(to right, transparent, rgba(8,5,3,0.8))',
        pointerEvents: 'none',
        zIndex: 21,
      }} />
    </div>
  );
};

// ============================================================
// CharacterPortrait: an SVG anime-style character
// ============================================================
const CharacterPortrait = ({ emotion, mood }: { emotion: string, mood: string }) => {
  const moodHueRotate = mood === 'moonlight' ? 'hue-rotate(-30deg) saturate(0.7) brightness(0.85)' :
                        mood === 'dawn' ? 'hue-rotate(10deg) saturate(1.05) brightness(1.0)' :
                        'none';

  return (
    <div className="fade-emotion" style={{
      width: '100%', height: '100%',
      filter: `drop-shadow(0 30px 40px rgba(0,0,0,0.7)) ${moodHueRotate}`,
      position: 'relative',
    }}>
      <svg viewBox="0 0 360 640" width="100%" height="100%" preserveAspectRatio="xMidYMax meet" style={{ display: 'block' }}>
        <defs>
          {/* Hair gradient */}
          <linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a8c098" />
            <stop offset="50%" stopColor="#7d9468" />
            <stop offset="100%" stopColor="#4d6442" />
          </linearGradient>
          <linearGradient id="hairShadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5a7048" />
            <stop offset="100%" stopColor="#324028" />
          </linearGradient>
          {/* Skin */}
          <linearGradient id="skin" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fde4cf" />
            <stop offset="100%" stopColor="#e9c0a0" />
          </linearGradient>
          <linearGradient id="skinShadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e6b594" />
            <stop offset="100%" stopColor="#c89678" />
          </linearGradient>
          {/* Vest */}
          <linearGradient id="vest" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6e7d4a" />
            <stop offset="100%" stopColor="#3d4a25" />
          </linearGradient>
          {/* Sleeve */}
          <linearGradient id="sleeve" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3a3242" />
            <stop offset="100%" stopColor="#1d1a25" />
          </linearGradient>
          {/* Skirt */}
          <linearGradient id="skirt" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#d49a3a" />
            <stop offset="100%" stopColor="#8a5e1a" />
          </linearGradient>
          <linearGradient id="cape" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9a3e36" />
            <stop offset="100%" stopColor="#5a2018" />
          </linearGradient>
          {/* Rim light */}
          <linearGradient id="rim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="rgba(255,180,100,0)" />
            <stop offset="92%" stopColor="rgba(255,200,140,0)" />
            <stop offset="100%" stopColor="rgba(255,210,150,0.7)" />
          </linearGradient>
        </defs>

        {/* ================= BODY (back-to-front) ================= */}
        {/* Cape behind */}
        <path d="M 110 380 Q 70 470 80 600 L 175 610 L 175 390 Z" fill="url(#cape)" opacity="0.85" />
        {/* Skirt */}
        <path d="M 130 400 Q 110 510 105 615 L 250 615 Q 245 510 230 400 Z" fill="url(#skirt)" />
        <path d="M 180 400 L 178 615 L 184 615 Z" fill="#000" opacity="0.18" />
        {/* Legs hint */}
        <rect x="155" y="595" width="18" height="40" fill="url(#skin)" rx="3" />
        <rect x="187" y="595" width="18" height="40" fill="url(#skin)" rx="3" />

        {/* Far arm (left of viewer = character's right arm, holding something) */}
        <path d="M 245 290 Q 270 340 268 400 Q 262 420 248 410 Q 240 360 232 310 Z" fill="url(#sleeve)" />
        {/* hand far */}
        <ellipse cx="252" cy="412" rx="11" ry="13" fill="url(#skin)" />

        {/* Torso (vest over shirt) */}
        <path d="M 130 250 Q 125 330 132 400 L 228 400 Q 235 330 230 250 Q 215 240 180 240 Q 145 240 130 250 Z" fill="url(#vest)" />
        {/* Shirt collar V */}
        <path d="M 165 250 L 180 295 L 195 250 Z" fill="#f5ead4" />
        {/* Shirt under vest peeking */}
        <path d="M 130 250 Q 145 244 160 246 L 165 252 L 152 256 Q 138 256 130 254 Z" fill="#f5ead4" />
        <path d="M 230 250 Q 215 244 200 246 L 195 252 L 208 256 Q 222 256 230 254 Z" fill="#f5ead4" />
        {/* Vest center seam */}
        <path d="M 180 295 L 180 398" stroke="#2a3318" strokeWidth="1.5" opacity="0.6" />
        {/* belt pouch */}
        <ellipse cx="158" cy="392" rx="22" ry="18" fill="#5e3a1e" />
        <ellipse cx="158" cy="392" rx="22" ry="18" fill="none" stroke="#3a2310" strokeWidth="1.5" />
        <rect x="151" y="378" width="14" height="6" fill="#7a5430" rx="1" />

        {/* Near arm (right side of viewer, hand to face when blush) */}
        <NearArm emotion={emotion} />

        {/* ================= HAIR BACK ================= */}
        <path d="M 100 175 Q 90 260 95 380 Q 92 480 110 600 L 145 610 Q 138 500 142 390 Q 138 280 142 200 Z" fill="url(#hairShadow)" />
        <path d="M 230 200 Q 240 290 245 400 Q 248 500 252 600 L 220 610 Q 222 500 220 400 Q 218 290 218 200 Z" fill="url(#hairShadow)" />

        {/* ================= HEAD ================= */}
        <g style={{ animation: 'none' }}>
          {/* Neck */}
          <path d="M 168 230 L 168 256 Q 180 262 192 256 L 192 230 Z" fill="url(#skinShadow)" />
          {/* Face oval */}
          <ellipse cx="180" cy="195" rx="46" ry="55" fill="url(#skin)" />
          {/* Jaw shadow */}
          <path d="M 138 198 Q 142 235 180 250 Q 218 235 222 198 Q 215 220 180 226 Q 145 220 138 198 Z" fill="url(#skinShadow)" opacity="0.4" />
          {/* Ears */}
          <ellipse cx="135" cy="200" rx="6" ry="10" fill="url(#skinShadow)" />
          <ellipse cx="225" cy="200" rx="6" ry="10" fill="url(#skinShadow)" />

          {/* Hair front (bangs) */}
          <path d="M 132 165 Q 130 130 155 115 Q 180 105 205 115 Q 230 130 228 170 Q 225 158 215 162 L 200 175 L 195 158 L 178 178 L 168 152 L 152 175 L 145 158 Q 138 165 132 175 Z" fill="url(#hair)" />
          {/* Long side locks */}
          <path d="M 132 170 Q 122 230 128 300 Q 133 240 145 200 Z" fill="url(#hair)" />
          <path d="M 228 170 Q 240 230 232 300 Q 226 240 215 200 Z" fill="url(#hair)" />
          {/* Hair shine */}
          <path d="M 156 130 Q 175 122 195 128 Q 178 134 162 138 Z" fill="#c8dab4" opacity="0.6" />

          {/* Eyes */}
          <Eyes emotion={emotion} />

          {/* Nose */}
          <path d="M 180 198 Q 178 205 180 208 Q 184 207 184 203" stroke="#c89678" strokeWidth="1" fill="none" opacity="0.6" />

          {/* Mouth */}
          <Mouth emotion={emotion} />

          {/* Blush cheeks */}
          {(emotion === 'blush' || emotion === 'angry') && (
            <>
              <ellipse cx="155" cy="212" rx="10" ry="5" fill={emotion === 'angry' ? '#e07060' : '#f29ea0'} opacity={emotion === 'angry' ? 0.6 : 0.7} />
              <ellipse cx="205" cy="212" rx="10" ry="5" fill={emotion === 'angry' ? '#e07060' : '#f29ea0'} opacity={emotion === 'angry' ? 0.6 : 0.7} />
            </>
          )}

          {/* Tear (sad) */}
          {emotion === 'sad' && (
            <>
              <ellipse cx="163" cy="208" rx="2" ry="4" fill="#a8d0e8" opacity="0.85" />
              <ellipse cx="163" cy="220" rx="1.5" ry="3" fill="#a8d0e8" opacity="0.7" />
            </>
          )}

          {/* Anger marks */}
          {emotion === 'angry' && (
            <g stroke="#c84030" strokeWidth="2" fill="none" strokeLinecap="round">
              <path d="M 145 145 L 150 150 M 150 145 L 145 150 M 152 138 L 158 142" />
            </g>
          )}
        </g>

        {/* Rim light pass on right edge */}
        <rect x="0" y="0" width="360" height="640" fill="url(#rim)" opacity="0.5" style={{ mixBlendMode: 'screen' }} />
      </svg>
    </div>
  );
};

const NearArm = ({ emotion }: { emotion: string }) => {
  // Hand to cheek when blush
  if (emotion === 'blush' || emotion === 'sad') {
    return (
      <>
        <path d="M 130 270 Q 100 260 95 230 Q 100 215 115 215 Q 125 230 135 260 Z" fill="url(#sleeve)" />
        <ellipse cx="113" cy="218" rx="13" ry="14" fill="url(#skin)" />
      </>
    );
  }
  return (
    <>
      <path d="M 128 280 Q 105 340 108 405 Q 118 420 132 410 Q 130 360 138 305 Z" fill="url(#sleeve)" />
      <ellipse cx="118" cy="412" rx="11" ry="13" fill="url(#skin)" />
    </>
  );
};

const Eyes = ({ emotion }: { emotion: string }) => {
  const browStyle = ({
    angry: { l: 'M 142 154 L 168 162', r: 'M 218 154 L 192 162' },
    sad: { l: 'M 145 158 Q 158 152 168 156', r: 'M 215 158 Q 202 152 192 156' },
    blush: { l: 'M 145 156 Q 158 152 168 156', r: 'M 215 156 Q 202 152 192 156' },
    neutral: { l: 'M 146 158 Q 158 154 168 158', r: 'M 214 158 Q 202 154 192 158' },
  } as any)[emotion] || { l: 'M 146 158 Q 158 154 168 158', r: 'M 214 158 Q 202 154 192 158' };

  // Closed-eye shape for sad (gentle close) - keep open but downturned
  const eyeOpenL = (
    <g style={{ transformOrigin: '157px 178px', animation: 'blinkEye 5.5s infinite' }}>
      <ellipse cx="157" cy="178" rx="9" ry={emotion === 'angry' ? 6 : 11} fill="#fff" />
      <ellipse cx="157" cy={emotion === 'sad' ? 181 : 178} rx="7" ry={emotion === 'angry' ? 5 : 9} fill="#7a4a2a" />
      <ellipse cx="157" cy={emotion === 'sad' ? 181 : 178} rx="4" ry={emotion === 'angry' ? 4 : 6} fill="#3a1f10" />
      <ellipse cx="159" cy={emotion === 'sad' ? 178 : 175} rx="2" ry="3" fill="#fff" />
      <ellipse cx="155" cy="182" rx="0.8" ry="1.2" fill="#fff" opacity="0.9" />
    </g>
  );
  const eyeOpenR = (
    <g style={{ transformOrigin: '203px 178px', animation: 'blinkEye 5.5s infinite' }}>
      <ellipse cx="203" cy="178" rx="9" ry={emotion === 'angry' ? 6 : 11} fill="#fff" />
      <ellipse cx="203" cy={emotion === 'sad' ? 181 : 178} rx="7" ry={emotion === 'angry' ? 5 : 9} fill="#7a4a2a" />
      <ellipse cx="203" cy={emotion === 'sad' ? 181 : 178} rx="4" ry={emotion === 'angry' ? 4 : 6} fill="#3a1f10" />
      <ellipse cx="205" cy={emotion === 'sad' ? 178 : 175} rx="2" ry="3" fill="#fff" />
      <ellipse cx="201" cy="182" rx="0.8" ry="1.2" fill="#fff" opacity="0.9" />
    </g>
  );

  return (
    <g>
      {/* Brows */}
      <path d={browStyle.l} stroke="#3d4828" strokeWidth="3" fill="none" strokeLinecap="round" />
      <path d={browStyle.r} stroke="#3d4828" strokeWidth="3" fill="none" strokeLinecap="round" />
      {/* Eye lashes line */}
      <path d="M 148 170 Q 157 167 167 170" stroke="#2a1810" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 193 170 Q 203 167 213 170" stroke="#2a1810" strokeWidth="2" fill="none" strokeLinecap="round" />
      {eyeOpenL}
      {eyeOpenR}
    </g>
  );
};

const Mouth = ({ emotion }: { emotion: string }) => {
  if (emotion === 'angry') {
    return <path d="M 170 222 Q 180 218 190 222" stroke="#8a3220" strokeWidth="2" fill="#5a1810" strokeLinecap="round" />;
  }
  if (emotion === 'sad') {
    return <path d="M 170 224 Q 180 230 190 224" stroke="#8a3220" strokeWidth="1.8" fill="none" strokeLinecap="round" />;
  }
  if (emotion === 'blush') {
    return (
      <g>
        <path d="M 172 222 Q 180 228 188 222 Q 184 224 180 224 Q 176 224 172 222 Z" fill="#8a3220" />
        <path d="M 172 222 Q 180 228 188 222" stroke="#6a2410" strokeWidth="1.2" fill="none" />
      </g>
    );
  }
  // neutral
  return <path d="M 174 222 Q 180 224 186 222" stroke="#8a3220" strokeWidth="1.5" fill="none" strokeLinecap="round" />;
};

// ============================================================
// SceneBack — far background (window, wall texture)
// ============================================================
const SceneBack = ({ mood }: { mood: string }) => {
  return (
    <svg viewBox="0 0 600 900" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="wallGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2a1d12" />
          <stop offset="60%" stopColor="#1a1108" />
          <stop offset="100%" stopColor="#0d0805" />
        </linearGradient>
        <pattern id="planks" x="0" y="0" width="80" height="600" patternUnits="userSpaceOnUse">
          <rect width="80" height="600" fill="#3a2818" />
          <rect x="78" width="2" height="600" fill="#1a1008" />
          <path d="M 0 100 Q 40 105 80 100" stroke="#2a1810" strokeWidth="1" fill="none" opacity="0.6" />
          <path d="M 0 350 Q 40 355 80 350" stroke="#2a1810" strokeWidth="1" fill="none" opacity="0.5" />
        </pattern>
      </defs>
      {/* Wall */}
      <rect width="600" height="900" fill="url(#wallGrad)" />
      {/* Wood plank wall pattern (filtered/blurred via parent) */}
      <rect width="600" height="600" fill="url(#planks)" opacity="0.5" />
      {/* Window with shutters */}
      <rect x="80" y="120" width="180" height="220" fill="#1a1408" stroke="#5a3818" strokeWidth="6" />
      <rect x="80" y="120" width="180" height="220" fill={mood === 'moonlight' ? '#3050a0' : mood === 'dawn' ? '#a06848' : '#1a1408'} opacity={mood === 'candlelight' ? 0.3 : 0.7} />
      <line x1="170" y1="120" x2="170" y2="340" stroke="#5a3818" strokeWidth="4" />
      <line x1="80" y1="230" x2="260" y2="230" stroke="#5a3818" strokeWidth="4" />
      {mood === 'moonlight' && (
        <circle cx="200" cy="180" r="22" fill="#e8e8d8" opacity="0.7" />
      )}
      {/* Hanging shelf */}
      <rect x="320" y="140" width="240" height="14" fill="#3a2818" />
      {/* Bottles */}
      <rect x="350" y="100" width="14" height="40" fill="#2a4030" rx="2" />
      <rect x="380" y="90" width="16" height="50" fill="#1a3030" rx="2" />
      <rect x="410" y="105" width="12" height="35" fill="#3a3020" rx="2" />
      <circle cx="450" cy="120" r="14" fill="#2a2018" />
      {/* Floor planks bottom */}
      <rect x="0" y="600" width="600" height="300" fill="#1a1108" />
      <line x1="0" y1="600" x2="600" y2="630" stroke="#0a0604" strokeWidth="2" />
    </svg>
  );
};

// ============================================================
// SceneMid — mid layer (desk silhouette, candles)
// ============================================================
const SceneMid = ({ mood }: { mood: string }) => {
  return (
    <svg viewBox="0 0 600 900" width="100%" height="100%" preserveAspectRatio="xMidYMid slice">
      {/* Desk silhouette */}
      <rect x="0" y="630" width="600" height="20" fill="#1a0e06" />
      <rect x="20" y="650" width="40" height="200" fill="#1a0e06" />
      {/* Candle */}
      <rect x="80" y="600" width="10" height="30" fill="#c8b890" />
      <rect x="79" y="595" width="12" height="6" fill="#000" opacity="0.4" />
      {mood === 'candlelight' && (
        <ellipse cx="85" cy="592" rx="3" ry="6" fill="#ffb060" opacity="0.9" />
      )}
      {/* Books */}
      <rect x="120" y="580" width="60" height="50" fill="#3a2010" />
      <rect x="125" y="585" width="50" height="6" fill="#5a3018" />
      {/* Pot */}
      <ellipse cx="500" cy="640" rx="40" ry="10" fill="#2a1810" />
      <path d="M 460 640 Q 470 600 530 600 Q 540 640 540 640 Z" fill="#3a2418" opacity="0.7" />
    </svg>
  );
};

// ============================================================
// DustMotes
// ============================================================
const DustMotes = ({ count = 12 }: { count?: number }) => {
  const motes = React.useMemo(() => {
    return Array.from({ length: count }).map((_, i) => ({
      left: Math.random() * 100,
      size: 1 + Math.random() * 2.5,
      duration: 18 + Math.random() * 22,
      delay: -Math.random() * 30,
      opacity: 0.3 + Math.random() * 0.4,
    }));
  }, [count]);
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 12, overflow: 'hidden' }}>
      {motes.map((m, i) => (
        <div key={i} style={{
          position: 'absolute',
          left: m.left + '%',
          top: 0,
          width: m.size, height: m.size,
          borderRadius: '50%',
          background: 'radial-gradient(circle, #ffd9a0 0%, transparent 70%)',
          animation: `dustDrift ${m.duration}s linear infinite`,
          animationDelay: m.delay + 's',
          opacity: m.opacity,
        }} />
      ))}
    </div>
  );
};
