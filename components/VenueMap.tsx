'use client';

/**
 * components/VenueMap.tsx
 *
 * Google Map with color-coded gate markers, pulsing assigned-gate indicator,
 * and a walking-route polyline from the user's position to the assigned gate.
 * Falls back to an SVG venue diagram when the Maps API is unavailable.
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
  /** When provided, a walking-route polyline is drawn to the assigned gate. */
  userLat?: number;
  userLng?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function markerColor(wait: number): string {
  if (wait < 10) return '#10b981';  // green
  if (wait < 20) return '#f59e0b';  // amber
  return '#ef4444';                  // red
}

function markerStroke(wait: number): string {
  if (wait < 10) return '#6ee7b7';
  if (wait < 20) return '#fcd34d';
  return '#fca5a5';
}

// ─── Map styling ──────────────────────────────────────────────────────────────

const MAP_STYLES: google.maps.MapTypeStyle[] = [
  { elementType: 'geometry', stylers: [{ color: '#1a1f2e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#8996b0' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1a1f2e' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c3349' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#212634' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#3d4a6b' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#0e1929' }] },
  { featureType: 'poi', elementType: 'geometry', stylers: [{ color: '#263044' }] },
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

// ─── SVG Fallback ─────────────────────────────────────────────────────────────

function VenueDiagram({ gates, assignedGateId }: Pick<VenueMapProps, 'gates' | 'assignedGateId'>) {
  const positions: Record<string, { x: number; y: number }> = {
    'gate-n1': { x: 260, y: 55  }, 'gate-n2': { x: 310, y: 48  },
    'gate-n3': { x: 360, y: 55  }, 'gate-n4': { x: 410, y: 75  },
    'gate-s1': { x: 220, y: 375 }, 'gate-s2': { x: 270, y: 390 },
    'gate-s3': { x: 360, y: 390 }, 'gate-s4': { x: 430, y: 375 },
    'gate-e1': { x: 560, y: 180 }, 'gate-e2': { x: 575, y: 230 },
    'gate-e3': { x: 560, y: 280 }, 'gate-w1': { x: 80,  y: 180 },
    'gate-w2': { x: 65,  y: 230 }, 'gate-w3': { x: 80,  y: 280 },
  };

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center rounded-2xl bg-slate-900 p-4">
      <div className="absolute left-4 top-4 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Venue Diagram</span>
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-400 ring-1 ring-amber-500/30">
          Maps API unavailable
        </span>
      </div>

      <svg viewBox="0 0 640 440" aria-label="Venue gate layout diagram" className="w-full max-w-xl">
        <ellipse cx="320" cy="220" rx="220" ry="160" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
        <ellipse cx="320" cy="220" rx="150" ry="110" fill="#14532d" opacity="0.5" />
        <rect x="305" y="165" width="30" height="110" rx="4" fill="#16a34a" opacity="0.6" />
        <line x1="300" y1="185" x2="340" y2="185" stroke="#d1fae5" strokeWidth="1.5" opacity="0.6" />
        <line x1="300" y1="255" x2="340" y2="255" stroke="#d1fae5" strokeWidth="1.5" opacity="0.6" />
        {[318,322,326].map((x) => (
          <g key={x}>
            <rect x={x} y="178" width="2" height="8" fill="#fbbf24" />
            <rect x={x} y="254" width="2" height="8" fill="#fbbf24" />
          </g>
        ))}
        <ellipse cx="320" cy="220" rx="270" ry="195" fill="none" stroke="#334155" strokeWidth="32" />
        <text x="320" y="30" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui">NORTH ZONE</text>
        <text x="320" y="420" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui">SOUTH ZONE</text>
        <text x="614" y="224" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui" transform="rotate(90,614,224)">EAST ZONE</text>
        <text x="26" y="224" textAnchor="middle" fill="#64748b" fontSize="11" fontFamily="system-ui" transform="rotate(-90,26,224)">WEST ZONE</text>

        {gates.map((gate) => {
          const pos = positions[gate.gateId] ?? { x: 320, y: 220 };
          const isAssigned = gate.gateId === assignedGateId;
          const color = markerColor(gate.estimatedWaitMinutes);
          const waitLabel = gate.estimatedWaitMinutes < 1 ? '<1m' : `${Math.round(gate.estimatedWaitMinutes)}m`;

          return (
            <g key={gate.gateId} aria-label={`${gate.name}${isAssigned ? ' (your gate)' : ''}`}>
              {isAssigned && (
                <circle cx={pos.x} cy={pos.y} r="18" fill="none" stroke="#6366f1" strokeWidth="2" opacity="0.6">
                  <animate attributeName="r" values="18;26;18" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.6;0;0.6" dur="2s" repeatCount="indefinite" />
                </circle>
              )}
              <circle cx={pos.x} cy={pos.y} r={isAssigned ? 14 : 10}
                fill={isAssigned ? '#6366f1' : color}
                stroke={isAssigned ? '#a5b4fc' : markerStroke(gate.estimatedWaitMinutes)}
                strokeWidth={isAssigned ? 2.5 : 1.5}
              />
              <text x={pos.x} y={pos.y + 1} textAnchor="middle" dominantBaseline="middle"
                fill="#fff" fontSize={isAssigned ? '8' : '7'}
                fontWeight={isAssigned ? 'bold' : 'normal'} fontFamily="system-ui"
              >
                {gate.name.replace('Gate ', '')}
              </text>
              <text x={pos.x} y={pos.y + (isAssigned ? 26 : 22)} textAnchor="middle"
                fill={isAssigned ? '#a5b4fc' : '#64748b'} fontSize="8" fontFamily="system-ui"
              >
                {waitLabel}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-slate-500">
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-indigo-500" />Your gate</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-emerald-500" />&lt;10 min</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-amber-500" />10–20 min</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-3 w-3 rounded-full bg-red-500" />&gt;20 min</span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VenueMap({ centerLat, centerLng, gates, assignedGateId, userLat, userLng }: VenueMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const userMarkerRef = useRef<google.maps.Marker | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load Maps JS API
  useEffect(() => {
    const apiKey = process.env['NEXT_PUBLIC_MAPS_API_KEY'];
    if (!apiKey) { setLoadError('no-key'); return; }

    (window as unknown as Record<string, unknown>)['gm_authFailure'] = () => {
      setLoadError('auth');
    };

    const loader = new Loader({ apiKey, version: 'weekly', libraries: ['maps', 'marker'] });
    loader.load()
      .then(() => { setIsLoaded(true); })
      .catch(() => setLoadError('load'));

    return () => {
      delete (window as unknown as Record<string, unknown>)['gm_authFailure'];
    };
  }, []);

  // Initialise map
  useEffect(() => {
    if (!isLoaded || loadError || !mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: centerLat, lng: centerLng },
      zoom: 17,
      mapTypeId: 'roadmap',
      styles: MAP_STYLES,
      disableDefaultUI: true,
      zoomControl: true,
      fullscreenControl: true,
    });

    mapInstanceRef.current = map;
    infoWindowRef.current = new google.maps.InfoWindow();

    // DirectionsRenderer for walking route
    const renderer = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: '#818cf8',
        strokeOpacity: 0.85,
        strokeWeight: 5,
      },
    });
    renderer.setMap(map);
    directionsRendererRef.current = renderer;
  }, [isLoaded, loadError, centerLat, centerLng]);

  // Draw walking route when map + user location are available
  useEffect(() => {
    if (!mapInstanceRef.current || !directionsRendererRef.current) return;
    if (userLat === undefined || userLng === undefined) return;

    const assignedGate = gates.find((g) => g.gateId === assignedGateId);
    if (!assignedGate) return;

    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: userLat, lng: userLng },
        destination: { lat: assignedGate.lat, lng: assignedGate.lng },
        travelMode: google.maps.TravelMode.WALKING,
      },
      (result, status) => {
        if (status === 'OK' && result) {
          directionsRendererRef.current!.setDirections(result);
        }
      },
    );

    // User location dot
    if (userMarkerRef.current) userMarkerRef.current.setMap(null);
    userMarkerRef.current = new google.maps.Marker({
      position: { lat: userLat, lng: userLng },
      map: mapInstanceRef.current,
      title: 'Your location',
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#38bdf8',
        fillOpacity: 1,
        strokeColor: '#7dd3fc',
        strokeWeight: 2,
      },
    });
  }, [isLoaded, gates, assignedGateId, userLat, userLng]);

  // Update gate markers whenever gate data changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = [];

    for (const gate of gates) {
      const isAssigned = gate.gateId === assignedGateId;
      const color = isAssigned ? '#6366f1' : markerColor(gate.estimatedWaitMinutes);
      const stroke = isAssigned ? '#a5b4fc' : markerStroke(gate.estimatedWaitMinutes);

      const marker = new google.maps.Marker({
        position: { lat: gate.lat, lng: gate.lng },
        map: mapInstanceRef.current,
        title: gate.name,
        label: {
          text: gate.name.replace('Gate ', ''),
          color: '#ffffff',
          fontWeight: 'bold',
          fontSize: '11px',
        },
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: isAssigned ? 18 : 13,
          fillColor: color,
          fillOpacity: 1,
          strokeColor: stroke,
          strokeWeight: isAssigned ? 3 : 2,
        },
        animation: isAssigned ? google.maps.Animation.BOUNCE : undefined,
        zIndex: isAssigned ? 10 : 1,
      });

      // Stop bounce after 2 cycles (~1.4s each)
      if (isAssigned) {
        setTimeout(() => { marker.setAnimation(null); }, 2800);
      }

      marker.addListener('click', () => {
        const waitLabel = gate.estimatedWaitMinutes < 1 ? '<1 min' : `~${Math.round(gate.estimatedWaitMinutes)} min`;
        const statusColor = markerColor(gate.estimatedWaitMinutes);
        infoWindowRef.current?.setContent(`
          <div style="font-family:system-ui;padding:10px 12px;min-width:160px;color:#0f172a">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <strong style="font-size:14px">${gate.name}</strong>
              ${isAssigned ? '<span style="background:#6366f1;color:#fff;border-radius:4px;padding:1px 7px;font-size:11px">Your gate</span>' : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
              <span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${statusColor}"></span>
              <span style="font-size:18px;font-weight:700;color:${statusColor}">${waitLabel}</span>
            </div>
            <p style="margin:0;font-size:12px;color:#475569">${gate.queueLength} people in queue</p>
          </div>
        `);
        infoWindowRef.current?.open(mapInstanceRef.current, marker);
      });

      markersRef.current.push(marker);
    }
  }, [gates, assignedGateId, isLoaded]);

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
        <div aria-label="Loading map" className="absolute inset-0 z-10 flex items-center justify-center bg-slate-900/80">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        </div>
      )}
      <div
        ref={mapRef}
        role="application"
        aria-label="Venue map with gate locations"
        className="h-full w-full"
      />
      {/* Map legend */}
      {isLoaded && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 rounded-xl bg-slate-950/80 px-3 py-2 text-xs text-slate-300 backdrop-blur-sm">
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />&lt;10 min</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />10–20 min</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />&gt;20 min</span>
        </div>
      )}
    </div>
  );
}
