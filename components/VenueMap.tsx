'use client';

/**
 * components/VenueMap.tsx
 *
 * Renders an interactive Google Map of the venue with gate markers.
 * Falls back to a styled SVG venue diagram when the Maps API is unavailable
 * (no key, billing not enabled, or API not activated).
 */

import { useEffect, useRef, useState } from 'react';
import { Loader } from '@googlemaps/js-api-loader';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GateMarker {
  gateId: string;
  name: string;
  lat: number;
  lng: number;
  isAssigned: boolean;
  queueLength: number;
  estimatedWaitMinutes: number;
}

interface VenueMapProps {
  centerLat: number;
  centerLng: number;
  gates: GateMarker[];
  assignedGateId?: string;
}

// ─── Map styling ──────────────────────────────────────────────────────────────

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8996b0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3349' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212634' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1929' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#263044' }] },
];

// ─── SVG Fallback ─────────────────────────────────────────────────────────────

/**
 * A stadium-shaped venue diagram drawn purely in SVG.
 * Shown when the Google Maps API cannot be loaded.
 */
function VenueDiagram({ gates, assignedGateId }: Pick<VenueMapProps, 'gates' | 'assignedGateId'>) {
  // Fixed positions for up to 14 gates arranged around an oval stadium
  const positions: Record<string, { x: number; y: number }> = {
    'gate-n1': { x: 260, y: 55  },
    'gate-n2': { x: 310, y: 48  },
    'gate-n3': { x: 360, y: 55  },
    'gate-n4': { x: 410, y: 75  },
    'gate-s1': { x: 220, y: 375 },
    'gate-s2': { x: 270, y: 390 },
    'gate-s3': { x: 360, y: 390 },
    'gate-s4': { x: 430, y: 375 },
    'gate-e1': { x: 560, y: 180 },
    'gate-e2': { x: 575, y: 230 },
    'gate-e3': { x: 560, y: 280 },
    'gate-w1': { x: 80,  y: 180 },
    'gate-w2': { x: 65,  y: 230 },
    'gate-w3': { x: 80,  y: 280 },
  };

  return (
    <div className="relative h-full w-full flex flex-col items-center justify-center bg-slate-900 rounded-2xl p-4">
      {/* Label */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Venue Diagram
        </span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400 ring-1 ring-amber-500/30">
          Maps API unavailable
        </span>
      </div>

      <svg
        viewBox="0 0 640 440"
        aria-label="Venue gate layout diagram"
        className="w-full max-w-xl"
      >
        {/* Pitch / field */}
        <ellipse cx="320" cy="220" rx="220" ry="160" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
        {/* Outfield green */}
        <ellipse cx="320" cy="220" rx="150" ry="110" fill="#14532d" opacity="0.5" />
        {/* Pitch strip */}
        <rect x="305" y="165" width="30" height="110" rx="4" fill="#16a34a" opacity="0.6" />
        {/* Crease lines */}
        <line x1="300" y1="185" x2="340" y2="185" stroke="#d1fae5" strokeWidth="1.5" opacity="0.6" />
        <line x1="300" y1="255" x2="340" y2="255" stroke="#d1fae5" strokeWidth="1.5" opacity="0.6" />
        {/* Wickets */}
        <rect x="318" y="178" width="2" height="8" fill="#fbbf24" />
        <rect x="322" y="178" width="2" height="8" fill="#fbbf24" />
        <rect x="326" y="178" width="2" height="8" fill="#fbbf24" />
        <rect x="318" y="254" width="2" height="8" fill="#fbbf24" />
        <rect x="322" y="254" width="2" height="8" fill="#fbbf24" />
        <rect x="326" y="254" width="2" height="8" fill="#fbbf24" />

        {/* Stadium boundary ring */}
        <ellipse cx="320" cy="220" rx="270" ry="195" fill="none" stroke="#334155" strokeWidth="32" />

        {/* Zone labels */}
        <text x="320" y="30" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui">NORTH ZONE</text>
        <text x="320" y="420" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui">SOUTH ZONE</text>
        <text x="614" y="224" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui" transform="rotate(90,614,224)">EAST ZONE</text>
        <text x="26" y="224" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui" transform="rotate(-90,26,224)">WEST ZONE</text>

        {/* Gate markers */}
        {gates.map((gate) => {
          const pos = positions[gate.gateId] ?? { x: 320, y: 220 };
          const isAssigned = gate.gateId === assignedGateId;
          const waitLabel =
            gate.estimatedWaitMinutes < 1
              ? '<1m'
              : `${Math.round(gate.estimatedWaitMinutes)}m`;

          return (
            <g key={gate.gateId} aria-label={`${gate.name}${isAssigned ? ' (your gate)' : ''}`}>
              {/* Pulse ring for assigned gate */}
              {isAssigned && (
                <circle cx={pos.x} cy={pos.y} r="18" fill="none" stroke="#6366f1" strokeWidth="2" opacity="0.5">
                  <animate attributeName="r" values="18;24;18" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.5;0;0.5" dur="2s" repeatCount="indefinite" />
                </circle>
              )}

              {/* Gate dot */}
              <circle
                cx={pos.x}
                cy={pos.y}
                r={isAssigned ? 14 : 10}
                fill={isAssigned ? '#6366f1' : '#1e293b'}
                stroke={isAssigned ? '#a5b4fc' : '#475569'}
                strokeWidth={isAssigned ? 2.5 : 1.5}
              />

              {/* Gate label */}
              <text
                x={pos.x}
                y={pos.y + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill={isAssigned ? '#fff' : '#94a3b8'}
                fontSize={isAssigned ? '8' : '7'}
                fontWeight={isAssigned ? 'bold' : 'normal'}
                fontFamily="system-ui"
              >
                {gate.name.replace('Gate ', '')}
              </text>

              {/* Wait badge */}
              <text
                x={pos.x}
                y={pos.y + (isAssigned ? 26 : 22)}
                textAnchor="middle"
                fill={isAssigned ? '#a5b4fc' : '#64748b'}
                fontSize="8"
                fontFamily="system-ui"
              >
                {waitLabel}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-indigo-500" />
          Your gate
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-full bg-slate-700 ring-1 ring-slate-500" />
          Other gates
        </span>
        <span className="text-slate-600">Numbers show estimated wait</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VenueMap({ centerLat, centerLng, gates, assignedGateId }: VenueMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load the Maps JS API, detecting both load errors AND auth failures
  useEffect(() => {
    const apiKey = process.env['NEXT_PUBLIC_MAPS_API_KEY'];
    if (!apiKey) {
      setLoadError('no-key');
      return;
    }

    // Google Maps calls this global when authentication fails (billing, key restrictions, etc.)
    (window as unknown as Record<string, unknown>)['gm_authFailure'] = () => {
      setLoadError('auth');
    };

    const loader = new Loader({ apiKey, version: 'weekly', libraries: ['maps', 'marker'] });

    loader
      .load()
      .then(() => {
        // Only mark as loaded if auth didn't already fail
        setIsLoaded((prev) => { return prev ? prev : true; });
      })
      .catch(() => setLoadError('load'));

    return () => {
      delete (window as unknown as Record<string, unknown>)['gm_authFailure'];
    };
  }, []);

  // Initialise map after API is loaded
  useEffect(() => {
    if (!isLoaded || loadError || !mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: centerLat, lng: centerLng },
      zoom: 17,
      mapTypeId: 'roadmap',
      styles: MAP_STYLES,
      disableDefaultUI: false,
      zoomControl: true,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: true,
    });

    mapInstanceRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();
  }, [isLoaded, loadError, centerLat, centerLng]);

  // Update markers when gates change
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    for (const gate of gates) {
      const isAssigned = gate.gateId === assignedGateId;

      const marker = new google.maps.Marker({
        position: { lat: gate.lat, lng: gate.lng },
        map: mapInstanceRef.current,
        title: gate.name,
        label: {
          text: gate.name.replace('Gate ', ''),
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '12px',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isAssigned ? 16 : 12,
          fillColor: isAssigned ? '#6366f1' : '#334155',
          fillOpacity: 1,
          strokeColor: isAssigned ? '#a5b4fc' : '#64748b',
          strokeWeight: 2,
        },
        zIndex: isAssigned ? 10 : 1,
      });

      marker.addListener('click', () => {
        const waitLabel =
          gate.estimatedWaitMinutes < 1 ? '<1 min' : `~${Math.round(gate.estimatedWaitMinutes)} min`;

        infoWindowRef.current?.setContent(`
          <div style="font-family:system-ui;padding:8px;min-width:150px;color:#1e293b">
            <strong style="font-size:14px">${gate.name}</strong>
            ${isAssigned ? '<span style="background:#6366f1;color:#fff;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:6px">Your gate</span>' : ''}
            <p style="margin:6px 0 2px;font-size:12px;color:#64748b">Wait time</p>
            <p style="margin:0;font-size:16px;font-weight:bold">${waitLabel}</p>
            <p style="margin:6px 0 0;font-size:12px;color:#64748b">${gate.queueLength} in queue</p>
          </div>
        `);
        infoWindowRef.current?.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
    }
  }, [gates, assignedGateId]);

  // ── Render fallback diagram if Maps is unavailable ─────────────────────────
  if (loadError) {
    return (
      <div className="h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-xl shadow-black/20">
        <VenueDiagram gates={gates} assignedGateId={assignedGateId} />
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 shadow-xl shadow-black/20">
      {!isLoaded && (
        <div
          aria-label="Loading map"
          className="absolute inset-0 flex items-center justify-center bg-slate-900/80 z-10"
        >
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      )}
      <div
        ref={mapRef}
        role="application"
        aria-label="Venue map with gate locations"
        className="h-full w-full"
      />
    </div>
  );
}
