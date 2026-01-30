import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { MapPin, Maximize2, Loader2 } from 'lucide-react';
import NetworkMapModal from './NetworkMapModal';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

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
  const { data: previewData, isLoading } = useQuery({
    queryKey: ['network-map-preview'],
    queryFn: async () => {
      const sql = `WITH features AS (
        SELECT TRY_CAST(COALESCE(json_extract_scalar(f, '$.properties["x-vetro"].plan_id'), json_extract_scalar(f, '$.properties.x_vetro.plan_id')) AS INTEGER) AS plan_id, f
        FROM vetro_raw_db.vetro_raw_json_lines l
        CROSS JOIN UNNEST(CAST(json_parse(l.raw_line) AS array(json))) AS t(f)
      )
      SELECT
        json_extract_scalar(f, '$.properties.ID') AS service_location_id,
        TRY_CAST(json_extract_scalar(f, '$.geometry.coordinates[1]') AS DOUBLE) AS latitude,
        TRY_CAST(json_extract_scalar(f, '$.geometry.coordinates[0]') AS DOUBLE) AS longitude,
        NULLIF(json_extract_scalar(f, '$.properties["Broadband Status"]'), '') AS broadband_status
      FROM features
      WHERE json_extract_scalar(f, '$.geometry.type') = 'Point'
        AND json_extract_scalar(f, '$.properties.ID') IS NOT NULL
      LIMIT 100`;

      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql }
      });

      const features = response.data?.data_rows || [];
      // CRITICAL: Coerce string coordinates to numbers
      return features
        .map(f => ({
          ...f,
          latitude: Number(f.latitude),
          longitude: Number(f.longitude)
        }))
        .filter(f => Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
    },
    refetchInterval: 300000,
  });

  // Fetch counts
  const { data: counts } = useQuery({
    queryKey: ['network-map-counts'],
    queryFn: async () => {
      const sql = `WITH features AS (
        SELECT TRY_CAST(COALESCE(json_extract_scalar(f, '$.properties["x-vetro"].plan_id'), json_extract_scalar(f, '$.properties.x_vetro.plan_id')) AS INTEGER) AS plan_id, f
        FROM vetro_raw_db.vetro_raw_json_lines l
        CROSS JOIN UNNEST(CAST(json_parse(l.raw_line) AS array(json))) AS t(f)
      )
      SELECT
        COUNT(DISTINCT plan_id) AS plan_count,
        COUNT(*) AS total_locations,
        COUNT(CASE WHEN NULLIF(json_extract_scalar(f, '$.properties["Broadband Status"]'), '') = 'Served' THEN 1 END) AS served_count
      FROM features
      WHERE json_extract_scalar(f, '$.geometry.type') = 'Point'
        AND json_extract_scalar(f, '$.properties.ID') IS NOT NULL`;

      const response = await base44.functions.invoke('aiLayerQuery', {
        template_id: 'freeform_sql_v1',
        params: { sql }
      });

      const row = response.data?.data_rows?.[0] || [0, 0, 0];
      return {
        plans: row[0] || 0,
        total: row[1] || 0,
        served: row[2] || 0,
        servedPct: row[1] > 0 ? ((row[2] / row[1]) * 100).toFixed(1) : 0
      };
    },
    refetchInterval: 300000,
  });

  return (
    <>
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[var(--mac-forest)]" />
              Network Map
            </div>
            <Button 
              onClick={() => setModalOpen(true)}
              size="sm"
              className="bg-[var(--mac-forest)] hover:bg-[var(--mac-dark)]"
            >
              <Maximize2 className="w-4 h-4 mr-2" />
              Expand
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Preview Map */}
            <div className="h-[200px] rounded-lg overflow-hidden border-2 border-green-200 relative">
              {isLoading ? (
                <div className="flex items-center justify-center h-full bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
                  <Loader2 className="w-8 h-8 animate-spin text-green-600" />
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
                <div className="flex items-center justify-center h-full bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-950 dark:to-emerald-950">
                  <p className="text-sm text-green-800 dark:text-green-200">No data available</p>
                </div>
              )}
              {/* Click overlay */}
              <div 
                className="absolute inset-0 bg-black/5 hover:bg-black/10 cursor-pointer transition-colors flex items-center justify-center"
                onClick={() => setModalOpen(true)}
              >
                <div className="bg-white/90 dark:bg-slate-900/90 px-4 py-2 rounded-lg shadow-lg border-2 border-green-400">
                  <p className="text-sm font-semibold text-green-800 dark:text-green-200">Click to open interactive map</p>
                </div>
              </div>
            </div>
            
            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="bg-blue-50 dark:bg-blue-950 p-2 rounded border border-blue-200">
                <p className="font-semibold text-blue-900 dark:text-blue-100">Plans</p>
                <p className="text-lg font-bold text-blue-600">{counts?.plans || 0}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-950 p-2 rounded border border-green-200">
                <p className="font-semibold text-green-900 dark:text-green-100">Served</p>
                <p className="text-lg font-bold text-green-600">{counts?.servedPct || 0}%</p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-950 p-2 rounded border border-amber-200">
                <p className="font-semibold text-amber-900 dark:text-amber-100">Locations</p>
                <p className="text-lg font-bold text-amber-600">{counts?.total || 0}</p>
              </div>
            </div>

            {/* Debug Info */}
            <div className="bg-purple-50 dark:bg-purple-950 p-2 rounded border-2 border-purple-300">
              <p className="font-bold text-xs text-purple-900 dark:text-purple-100 mb-1">🐛 Preview Debug:</p>
              <div className="text-[10px] font-mono space-y-0.5">
                <div>markers_rendered: <strong>{previewData?.length || 0}</strong></div>
                {previewData?.[0] && (
                  <>
                    <div>first_lat: <strong>{previewData[0].latitude}</strong> ({typeof previewData[0].latitude})</div>
                    <div>first_lng: <strong>{previewData[0].longitude}</strong> ({typeof previewData[0].longitude})</div>
                  </>
                )}
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