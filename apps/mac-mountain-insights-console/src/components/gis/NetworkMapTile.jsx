import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Maximize2, Loader2 } from 'lucide-react';
import NetworkMapModal from './NetworkMapModal';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { runSSOTQuery } from '@/api/ssotQuery';

// Fix Leaflet icon URLs
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png'
});

export default function NetworkMapTile() {
  const [modalOpen, setModalOpen] = useState(false);

  // Fetch preview data (100 points)
  const { data: previewResult, isLoading } = useQuery({
    queryKey: ['network-map-preview'],
    queryFn: async () => {
      const response = await runSSOTQuery({
        queryId: 'network_map_points',
        label: 'Network Map Preview Points'
      });
      const payload = response?.data || {};
      if (payload?.evidence_pack?.status === 'unavailable') {
        return { points: [], unavailable: payload.answer_markdown || 'UNAVAILABLE' };
      }
      const rows = response?.data?.data_rows || [];
      const points = rows
        .map((row) => {
          const values = Array.isArray(row) ? row : Object.values(row);
          return {
            service_location_id: values[0],
            latitude: Number(values[1]),
            longitude: Number(values[2]),
            broadband_status: values[3] ?? null,
            build: values[4] ?? null,
            plan_id: values[5] ?? null
          };
        })
        .filter((f) => Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
      return { points, unavailable: null };
    },
    refetchInterval: 300000,
  });

  // Fetch counts
  const { data: counts } = useQuery({
    queryKey: ['network-map-counts'],
    queryFn: async () => {
      const response = await runSSOTQuery({
        queryId: 'network_map_counts',
        label: 'Network Map Counts'
      });
      const payload = response?.data || {};
      if (payload?.evidence_pack?.status === 'unavailable') {
        return { plans: 0, serviceLocationsUnique: 0, buildYesUnique: 0, buildPct: 0, unavailable: payload.answer_markdown || 'UNAVAILABLE' };
      }
      const row = response?.data?.data_rows?.[0] || [0, 0, 0];
      const values = Array.isArray(row) ? row : Object.values(row);
      const plans = Number(values[0] || 0);
      const serviceLocationsUnique = Number(values[1] || 0);
      const buildYesUnique = Number(values[2] || 0);
      return {
        plans,
        serviceLocationsUnique,
        buildYesUnique,
        buildPct: serviceLocationsUnique > 0 ? ((buildYesUnique / serviceLocationsUnique) * 100).toFixed(1) : 0,
        unavailable: null
      };
    },
    refetchInterval: 300000,
  });

  const previewData = previewResult?.points || [];
  const unavailableMessage = previewResult?.unavailable || counts?.unavailable || null;

  return (
    <>
      <Card className="h-full mac-panel">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="mac-icon-badge">
                <MapPin className="w-4 h-4" />
              </div>
              Network Map
            </div>
            <Button 
              onClick={() => setModalOpen(true)}
              size="sm"
              className="mac-button-primary"
            >
              <Maximize2 className="w-4 h-4 mr-2" />
              Expand
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Preview Map */}
            <div className="h-[200px] rounded-lg overflow-hidden border border-[var(--mac-panel-border)] relative">
              {isLoading ? (
                <div className="flex items-center justify-center h-full bg-[var(--mac-ice)]">
                  <Loader2 className="w-8 h-8 animate-spin text-[var(--mac-forest)]" />
                </div>
              ) : unavailableMessage ? (
                <div className="flex items-center justify-center h-full bg-[var(--mac-ice)] p-4">
                  <p className="text-xs text-amber-800 whitespace-pre-wrap">
                    {String(unavailableMessage).replace(/\*\*/g, '')}
                  </p>
                </div>
              ) : previewData && previewData.length > 0 ? (
                <MapContainer
                  center={[previewData[0].latitude, previewData[0].longitude]}
                  zoom={8}
                  style={{ height: '100%', width: '100%' }}
                  zoomControl={false}
                  dragging={false}
                  scrollWheelZoom={false}
                  doubleClickZoom={false}
                >
                  <TileLayer
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    attribution='&copy; OpenStreetMap'
                  />
                  {previewData.slice(0, 50).map((feature) => (
                    <Marker
                      key={feature.service_location_id}
                      position={[feature.latitude, feature.longitude]}
                    />
                  ))}
                </MapContainer>
              ) : (
                <div className="flex items-center justify-center h-full bg-[var(--mac-ice)]">
                  <p className="text-sm text-muted-foreground">No data available</p>
                </div>
              )}
              {/* Click overlay */}
              <div 
                className="absolute inset-0 bg-black/5 hover:bg-black/10 cursor-pointer transition-colors flex items-center justify-center"
                onClick={() => setModalOpen(true)}
              >
                <div className="bg-white/90 px-4 py-2 rounded-lg shadow-sm border border-[var(--mac-panel-border)]">
                  <p className="text-sm font-semibold text-foreground">Click to open interactive map</p>
                </div>
              </div>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="mac-panel p-2 rounded">
                <p className="font-semibold text-foreground">Plans (Vetro)</p>
                <p className="text-lg font-bold text-[var(--mac-forest)]">{counts?.plans || 0}</p>
              </div>
              <div className="mac-panel p-2 rounded">
                <p className="font-semibold text-foreground">Build (Vetro)</p>
                <p className="text-lg font-bold text-[var(--mac-forest)]">{counts?.buildPct || 0}%</p>
                <p className="text-[10px] text-muted-foreground">
                  {counts?.buildYesUnique || 0} / {counts?.serviceLocationsUnique || 0}
                </p>
              </div>
              <div className="mac-panel p-2 rounded">
                <p className="font-semibold text-foreground">Service Locations (Unique)</p>
                <p className="text-lg font-bold text-[var(--mac-forest)]">{counts?.serviceLocationsUnique || 0}</p>
              </div>
            </div>

          </div>
        </CardContent>
      </Card>

      <NetworkMapModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
