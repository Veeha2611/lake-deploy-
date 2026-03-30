import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { runSSOTQuery } from '@/api/ssotQuery';
import { MapPin, Download, AlertTriangle, Loader2, Map as MapIcon, Table as TableIcon, Bug, Layers as LayersIcon, Home, Square, Triangle, Network, Radio, Wifi, Satellite, Cable } from 'lucide-react';
import { toast } from 'sonner';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Polygon as LeafletPolygon, useMap, CircleMarker } from 'react-leaflet';
import { cellToBoundary } from 'h3-js';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Custom Leaflet icons
const createCustomIcon = (color, iconType) => {
  const iconSvg = {
    sl: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="32" height="32"><path d="M12 2L2 7v10c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V7l-10-5zm0 18c-3.86 0-7-3.14-7-7s3.14-7 7-7 7 3.14 7 7-3.14 7-7 7z"/></svg>`,
    nap: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="28" height="28"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>`,
    fat: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${color}" width="28" height="28"><path d="M12 2L2 22h20L12 2z"/></svg>`
  };

  return L.divIcon({
    html: iconSvg[iconType] || iconSvg.sl,
    className: 'custom-marker-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
};

// Map invalidation component
function MapInvalidator() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 100);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// Layer definitions
const LAYER_DEFINITIONS = {
  // VETRO PINS
  service_locations: {
    name: 'Service Locations',
    type: 'point',
    icon_key: 'sl',
    color: '#2563EB',
    default_enabled: false,
    icon_component: Home,
    queryId: 'gis_service_locations'
  },
  naps: {
    name: 'NAPs',
    type: 'point',
    icon_key: 'nap',
    color: '#F97316',
    default_enabled: false,
    icon_component: Square,
    queryId: 'gis_naps'
  },
  fat: {
    name: 'FAT',
    type: 'point',
    icon_key: 'fat',
    color: '#10B981',
    default_enabled: false,
    icon_component: Triangle,
    queryId: 'gis_fat'
  },
  
  // VETRO LINES - by placement
  fiber_aerial: {
    name: 'Fiber (Aerial)',
    type: 'line',
    color: '#0EA5E9',
    default_enabled: false,
    icon_component: Network,
    queryId: 'gis_fiber_aerial'
  },
  fiber_underground: {
    name: 'Fiber (Underground)',
    type: 'line',
    color: '#8B5CF6',
    default_enabled: false,
    icon_component: Network,
    queryId: 'gis_fiber_underground'
  },
  fiber_mixed: {
    name: 'Fiber (Mixed)',
    type: 'line',
    color: '#F59E0B',
    default_enabled: false,
    icon_component: Network,
    queryId: 'gis_fiber_mixed'
  },
  fiber_unknown: {
    name: 'Fiber (Unknown)',
    type: 'line',
    color: '#6B7280',
    default_enabled: false,
    icon_component: Network,
    queryId: 'gis_fiber_unknown'
  },
  
  // VETRO LINES - by owner
  fiber_owner_gwi: {
    name: 'Fiber (GWI)',
    type: 'line',
    color: '#DC2626',
    default_enabled: false,
    icon_component: Network,
    queryId: 'gis_fiber_owner_gwi'
  },
  fiber_owner_lymefiber: {
    name: 'Fiber (LymeFiber)',
    type: 'line',
    color: '#059669',
    default_enabled: false,
    icon_component: Network,
    queryId: 'gis_fiber_owner_lymefiber'
  },
  
  // VETRO POLYGONS
  polygons: {
    name: 'Footprints',
    type: 'polygon',
    color: '#A855F7',
    default_enabled: false,
    icon_component: Square,
    queryId: 'gis_polygons'
  },
  
  // FCC FIBER H3
  fcc_fiber: {
    name: 'FCC Fiber (FTTP)',
    type: 'h3',
    color: '#22C55E',
    default_enabled: false,
    icon_component: Wifi,
    queryId: 'gis_fcc_fiber'
  },
  
  // FCC NON-FIBER by tech
  fcc_cable: {
    name: 'FCC Cable',
    type: 'h3',
    color: '#F97316',
    default_enabled: false,
    icon_component: Cable,
    queryId: 'gis_fcc_cable'
  },
  fcc_copper: {
    name: 'FCC Copper',
    type: 'h3',
    color: '#A16207',
    default_enabled: false,
    icon_component: Network,
    queryId: 'gis_fcc_copper'
  },
  fcc_fixed_wireless: {
    name: 'FCC Fixed Wireless',
    type: 'h3',
    color: '#3B82F6',
    default_enabled: false,
    icon_component: Radio,
    queryId: 'gis_fcc_fixed_wireless'
  },
  fcc_satellite: {
    name: 'FCC Satellite',
    type: 'h3',
    color: '#8B5CF6',
    default_enabled: false,
    icon_component: Satellite,
    queryId: 'gis_fcc_satellite'
  }
};

export default function NetworkMapModal({ isOpen, onClose }) {
  const [serviceLocationNetworks, setServiceLocationNetworks] = useState([]);
  const [serviceLocationNetwork, setServiceLocationNetwork] = useState('');
  const [layerStates, setLayerStates] = useState(() => {
    const initial = {};
    Object.keys(LAYER_DEFINITIONS).forEach(key => {
      initial[key] = {
        enabled: LAYER_DEFINITIONS[key].default_enabled,
        loading: false,
        data: null,
        error: null,
        counters: { rowsReturned: 0, featuresRendered: 0 }
      };
    });
    return initial;
  });

  const [mapLayer, setMapLayer] = useState('streets');

  // Load enabled layers on open
  useEffect(() => {
    if (!isOpen) return;

    // Fetch available service location networks for filtering.
    (async () => {
      try {
        const resp = await runSSOTQuery({
          queryId: 'gis_network_list',
          label: 'GIS Network List'
        });
        const cols = resp?.data?.columns || [];
        const rows = resp?.data?.data_rows || [];
        const idxNetwork = cols.findIndex((c) => String(c).toLowerCase() === 'network');
        const idxCount = cols.findIndex((c) => String(c).toLowerCase() === 'service_location_count');
        const parsed = rows
          .map((r) => (Array.isArray(r) ? r : Object.values(r)))
          .map((r) => ({
            network: idxNetwork >= 0 ? r[idxNetwork] : r[0],
            service_location_count: Number(idxCount >= 0 ? r[idxCount] : r[1] || 0)
          }))
          .filter((r) => r.network && String(r.network).trim() !== '');
        setServiceLocationNetworks(parsed);
      } catch (err) {
        // Non-blocking; the layer still works without filtering.
        console.warn('gis_network_list failed:', err?.message || err);
      }
    })();

    Object.keys(LAYER_DEFINITIONS).forEach(layerKey => {
      if (layerStates[layerKey].enabled) {
        loadLayer(layerKey);
      }
    });
  }, [isOpen]);

  const loadLayer = async (layerKey, opts = {}) => {
    setLayerStates(prev => ({
      ...prev,
      [layerKey]: { ...prev[layerKey], loading: true, error: null }
    }));

    const layerDef = LAYER_DEFINITIONS[layerKey];
    const nextNetworkFilter =
      layerKey === 'service_locations'
        ? (Object.prototype.hasOwnProperty.call(opts || {}, 'network') ? opts.network : serviceLocationNetwork)
        : '';
    const queryId =
      layerKey === 'service_locations' && nextNetworkFilter
        ? 'gis_service_locations_by_network'
        : layerDef.queryId;
    const params =
      layerKey === 'service_locations' && nextNetworkFilter
        ? { network: nextNetworkFilter }
        : undefined;

    try {
      const response = await runSSOTQuery({
        queryId,
        label: layerDef.name,
        params
      });

      const apiData = response.data;
      const rawRows = apiData?.data_rows || [];
      const columns = apiData?.columns || [];
      const athenaExecId = apiData?.athena_query_execution_id || apiData?.execution_id || apiData?.evidence?.athena_query_execution_id || null;
      const rowsReturned = apiData?.rows_returned || rawRows.length;
      const generatedSql = apiData?.generated_sql || apiData?.evidence?.generated_sql || null;

      const mapColumnsToObject = (cols, row) => {
        const obj = {};
        cols.forEach((col, idx) => {
          obj[col] = row[idx];
        });
        return obj;
      };

      const parsedRows = rawRows.map(row => mapColumnsToObject(columns, row));

      // Process based on layer type
      let features = [];
      if (layerDef.type === 'point') {
        features = parsedRows
          .map(f => ({
            ...f,
            latitude: Number(f.latitude),
            longitude: Number(f.longitude)
          }))
          .filter(f => Number.isFinite(f.latitude) && Number.isFinite(f.longitude));
      } else if (layerDef.type === 'line') {
        features = parsedRows
          .filter(f => f.geometry_geojson)
          .map(f => ({
            ...f,
            geometry: typeof f.geometry_geojson === 'string' 
              ? JSON.parse(f.geometry_geojson) 
              : f.geometry_geojson
          }));
      } else if (layerDef.type === 'polygon') {
        features = parsedRows
          .filter(f => f.geometry_geojson)
          .map(f => ({
            ...f,
            geometry: typeof f.geometry_geojson === 'string' 
              ? JSON.parse(f.geometry_geojson) 
              : f.geometry_geojson
          }));
      } else if (layerDef.type === 'h3') {
        features = parsedRows
          .filter(f => f.h3_res8_id)
          .map(f => {
            try {
              const boundary = cellToBoundary(f.h3_res8_id, true); // true = GeoJSON format [lng, lat]
              return {
                ...f,
                h3_boundary: boundary
              };
            } catch (err) {
              console.error('H3 conversion error:', err);
              return null;
            }
          })
          .filter(f => f !== null);
      }

      setLayerStates(prev => ({
        ...prev,
        [layerKey]: {
          ...prev[layerKey],
          loading: false,
          data: {
            features,
            evidence: {
              athena_query_execution_id: athenaExecId,
              rows_returned: rowsReturned,
              generated_sql: generatedSql
            },
            rawRows,
            columns,
            sql: generatedSql
          },
          counters: {
            rowsReturned: rawRows.length,
            featuresRendered: features.length
          }
        }
      }));

      if (features.length > 0) {
        toast.success(`${layerDef.name}${nextNetworkFilter ? ` (${nextNetworkFilter})` : ''}: Loaded ${features.length} features`);
      } else if (rawRows.length === 0) {
        setLayerStates(prev => ({
          ...prev,
          [layerKey]: {
            ...prev[layerKey],
            error: 'Query returned 0 rows'
          }
        }));
      }
    } catch (err) {
      console.error(`❌ ${layerKey} layer failed:`, err);
      setLayerStates(prev => ({
        ...prev,
        [layerKey]: {
          ...prev[layerKey],
          loading: false,
          error: err.message
        }
      }));
    }
  };

  const toggleLayer = (layerKey) => {
    const currentState = layerStates[layerKey];
    const newEnabled = !currentState.enabled;

    setLayerStates(prev => ({
      ...prev,
      [layerKey]: { ...prev[layerKey], enabled: newEnabled }
    }));

    if (layerKey === 'service_locations' && newEnabled && !serviceLocationNetwork) {
      toast('Tip: filter Service Locations by network for faster loads (All networks can be slow).');
    }

    if (newEnabled && !currentState.data) {
      loadLayer(layerKey);
    }
  };

  const allFeatures = Object.keys(layerStates)
    .filter(key => layerStates[key].enabled && layerStates[key].data?.features)
    .flatMap(key => layerStates[key].data.features.map(f => ({ ...f, layer_key: key })));

  // Find map center from first point or H3 hex
  const mapCenter = (() => {
    for (const key of Object.keys(layerStates)) {
      const state = layerStates[key];
      if (!state.enabled || !state.data?.features?.length) continue;
      
      const layerDef = LAYER_DEFINITIONS[key];
      const feature = state.data.features[0];
      
      if (layerDef.type === 'point') {
        return [feature.latitude, feature.longitude];
      } else if (layerDef.type === 'h3' && feature.h3_boundary?.length) {
        const [lng, lat] = feature.h3_boundary[0];
        return [lat, lng];
      }
    }
    return [44.3148, -69.7797]; // Maine default
  })();

  const totalFeaturesRendered = Object.values(layerStates).reduce((sum, s) => sum + s.counters.featuresRendered, 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-7xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="space-y-2">
            <div className="flex items-center gap-2 text-2xl">
              <MapPin className="w-6 h-6 text-[var(--mac-forest)]" />
              Network Map - Vetro + FCC Coverage
            </div>
            <div className="text-sm font-mono text-muted-foreground bg-[var(--mac-ice)] border border-[var(--mac-panel-border)] px-3 py-1.5 rounded">
              Total Features: {totalFeaturesRendered}
              {totalFeaturesRendered > 0 ? (
                <span className="ml-2 text-green-600 font-bold">✅ ACTIVE</span>
              ) : (
                <span className="ml-2 text-amber-600 font-bold">⚠️ NO LAYERS ENABLED</span>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <Tabs defaultValue="map" className="w-full">
            <TabsList>
              <TabsTrigger value="map">
                <MapIcon className="w-4 h-4 mr-2" />
                Map View
              </TabsTrigger>
              <TabsTrigger value="layers">
                <LayersIcon className="w-4 h-4 mr-2" />
                Layers Control
              </TabsTrigger>
              <TabsTrigger value="debug">
                <Bug className="w-4 h-4 mr-2" />
                Debug (Truth Mode)
              </TabsTrigger>
            </TabsList>

            <TabsContent value="map">
              <Card>
                <CardContent className="p-0">
                  <div className="relative h-[600px] rounded-lg overflow-hidden">
                    <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg border border-[var(--mac-panel-border)]">
                      <Button
                        variant={mapLayer === 'streets' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMapLayer('streets')}
                        className="rounded-r-none"
                      >
                        <MapIcon className="w-4 h-4 mr-2" />
                        Street
                      </Button>
                      <Button
                        variant={mapLayer === 'satellite' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setMapLayer('satellite')}
                        className="rounded-l-none border-l-0"
                      >
                        <LayersIcon className="w-4 h-4 mr-2" />
                        Satellite
                      </Button>
                    </div>

                    {totalFeaturesRendered === 0 ? (
                      <div className="flex items-center justify-center h-full bg-[var(--mac-ice)]">
                        <div className="text-center">
                          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                          <p className="text-muted-foreground">No layers enabled. Go to Layers Control to enable layers.</p>
                        </div>
                      </div>
                    ) : (
                      <MapContainer
                        center={mapCenter}
                        zoom={10}
                        style={{ height: '100%', width: '100%' }}
                        preferCanvas={true}
                      >
                        <MapInvalidator />
                        {mapLayer === 'streets' ? (
                          <TileLayer
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                          />
                        ) : (
                          <TileLayer
                            url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                            attribution='&copy; <a href="https://www.esri.com/">Esri</a>'
                          />
                        )}

                        {Object.keys(layerStates).map(layerKey => {
                          const state = layerStates[layerKey];
                          if (!state.enabled || !state.data?.features) return null;

                          const layerDef = LAYER_DEFINITIONS[layerKey];

                          // Render points
                          if (layerDef.type === 'point') {
                            return state.data.features.map((feature, idx) => (
                              layerKey === 'service_locations' ? (
                                <CircleMarker
                                  key={`${layerKey}-${feature.entity_id}-${idx}`}
                                  center={[feature.latitude, feature.longitude]}
                                  radius={3}
                                  pathOptions={{ color: layerDef.color, fillColor: layerDef.color, fillOpacity: 0.65, weight: 0 }}
                                >
                                  <Popup>
                                    <div className="text-xs space-y-1">
                                      <p className="font-semibold text-sm mb-2">{layerDef.name}</p>
                                      <p><strong>ID:</strong> {feature.entity_id}</p>
                                      {feature.plan_id && <p><strong>Plan ID:</strong> {feature.plan_id}</p>}
                                      {feature.network && <p><strong>Network:</strong> {feature.network}</p>}
                                      {feature.city && <p><strong>City:</strong> {feature.city}</p>}
                                      {feature.state && <p><strong>State:</strong> {feature.state}</p>}
                                      {feature.broadband_status && <p><strong>Broadband:</strong> {feature.broadband_status}</p>}
                                    </div>
                                  </Popup>
                                </CircleMarker>
                              ) : (
                                <Marker
                                  key={`${layerKey}-${feature.entity_id}`}
                                  position={[feature.latitude, feature.longitude]}
                                  icon={createCustomIcon(layerDef.color, layerDef.icon_key)}
                                >
                                  <Popup>
                                    <div className="text-xs space-y-1">
                                      <p className="font-semibold text-sm mb-2">{layerDef.name}</p>
                                      <p><strong>ID:</strong> {feature.entity_id}</p>
                                      {feature.plan_id && <p><strong>Plan ID:</strong> {feature.plan_id}</p>}
                                      {feature.network && <p><strong>Network:</strong> {feature.network}</p>}
                                      {feature.city && <p><strong>City:</strong> {feature.city}</p>}
                                      {feature.state && <p><strong>State:</strong> {feature.state}</p>}
                                      {feature.broadband_status && <p><strong>Broadband:</strong> {feature.broadband_status}</p>}
                                    </div>
                                  </Popup>
                                </Marker>
                              )
                            ));
                          }

                          // Render lines
                          if (layerDef.type === 'line') {
                            return state.data.features.map((feature, idx) => {
                              if (feature.geometry?.type === 'LineString') {
                                const positions = feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]);
                                return (
                                  <Polyline
                                    key={`${layerKey}-${idx}`}
                                    positions={positions}
                                    color={layerDef.color}
                                    weight={3}
                                    opacity={0.7}
                                  >
                                    <Popup>
                                      <div className="text-xs">
                                        <p className="font-semibold">{layerDef.name}</p>
                                        <p><strong>ID:</strong> {feature.id}</p>
                                        {feature.owner && <p><strong>Owner:</strong> {feature.owner}</p>}
                                        {feature.placement && <p><strong>Placement:</strong> {feature.placement}</p>}
                                      </div>
                                    </Popup>
                                  </Polyline>
                                );
                              }
                              return null;
                            });
                          }

                          // Render polygons
                          if (layerDef.type === 'polygon') {
                            return state.data.features.map((feature, idx) => {
                              if (feature.geometry?.type === 'Polygon') {
                                const positions = feature.geometry.coordinates[0].map(([lng, lat]) => [lat, lng]);
                                return (
                                  <LeafletPolygon
                                    key={`${layerKey}-${idx}`}
                                    positions={positions}
                                    color={layerDef.color}
                                    fillOpacity={0.2}
                                  >
                                    <Popup>
                                      <div className="text-xs">
                                        <p className="font-semibold">{layerDef.name}</p>
                                        <p><strong>ID:</strong> {feature.id}</p>
                                      </div>
                                    </Popup>
                                  </LeafletPolygon>
                                );
                              }
                              return null;
                            });
                          }

                          // Render H3 hexes
                          if (layerDef.type === 'h3') {
                            return state.data.features.map((feature, idx) => {
                              if (feature.h3_boundary) {
                                const positions = feature.h3_boundary.map(([lng, lat]) => [lat, lng]);
                                const opacity = Math.min(0.7, feature.location_count / 100);
                                return (
                                  <LeafletPolygon
                                    key={`${layerKey}-${idx}`}
                                    positions={positions}
                                    color={layerDef.color}
                                    fillColor={layerDef.color}
                                    fillOpacity={opacity}
                                    weight={1}
                                  >
                                    <Popup>
                                      <div className="text-xs">
                                        <p className="font-semibold">{layerDef.name}</p>
                                        <p><strong>H3:</strong> {feature.h3_res8_id}</p>
                                        <p><strong>Locations:</strong> {feature.location_count}</p>
                                        <p><strong>State:</strong> {feature.state_usps}</p>
                                      </div>
                                    </Popup>
                                  </LeafletPolygon>
                                );
                              }
                              return null;
                            });
                          }

                          return null;
                        })}
                      </MapContainer>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="layers">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Layer Controls</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Vetro Pins */}
                  <div>
                    <h3 className="font-semibold mb-3">Vetro Network Pins</h3>
                    <div className="space-y-2">
                      {['service_locations', 'naps', 'fat'].map(layerKey => {
                        const layerDef = LAYER_DEFINITIONS[layerKey];
                        const state = layerStates[layerKey];
                        const IconComponent = layerDef.icon_component;

                        return (
                          <div key={layerKey} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={state.enabled}
                                onCheckedChange={() => toggleLayer(layerKey)}
                                disabled={state.loading}
                              />
                              <div
                                className="w-6 h-6 rounded flex items-center justify-center"
                                style={{ backgroundColor: layerDef.color + '20' }}
                              >
                                <IconComponent className="w-4 h-4" style={{ color: layerDef.color }} />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{layerDef.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {state.loading ? 'Loading...' : state.error ? `❌ ${state.error}` : state.data ? `✅ ${state.counters.featuresRendered}` : 'Not loaded'}
                                </p>
                                {layerKey === 'service_locations' && (
                                  <div className="mt-2">
                                    <label className="block text-[10px] text-muted-foreground mb-1">
                                      Filter by network (optional; improves performance)
                                    </label>
                                    <select
                                      className="w-full text-xs border rounded px-2 py-1 bg-[var(--mac-panel-strong)] text-foreground border-[var(--mac-panel-border)]"
                                      value={serviceLocationNetwork}
                                      onChange={(e) => {
                                        const next = e.target.value;
                                        setServiceLocationNetwork(next);
                                        if (state.enabled) {
                                          // Clear cached layer data then reload with the new filter.
                                          setLayerStates((prev) => ({
                                            ...prev,
                                            service_locations: { ...prev.service_locations, data: null, error: null }
                                          }));
                                          loadLayer('service_locations', { network: next });
                                        }
                                      }}
                                    >
                                      <option value="">All networks</option>
                                      {serviceLocationNetworks.map((n) => (
                                        <option key={n.network} value={n.network}>
                                          {n.network} ({n.service_location_count})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vetro Fiber Lines */}
                  <div>
                    <h3 className="font-semibold mb-3">Vetro Fiber Lines</h3>
                    <div className="space-y-2">
                      {['fiber_aerial', 'fiber_underground', 'fiber_mixed', 'fiber_unknown', 'fiber_owner_gwi', 'fiber_owner_lymefiber'].map(layerKey => {
                        const layerDef = LAYER_DEFINITIONS[layerKey];
                        const state = layerStates[layerKey];
                        const IconComponent = layerDef.icon_component;

                        return (
                          <div key={layerKey} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={state.enabled}
                                onCheckedChange={() => toggleLayer(layerKey)}
                                disabled={state.loading}
                              />
                              <div
                                className="w-6 h-6 rounded flex items-center justify-center"
                                style={{ backgroundColor: layerDef.color + '20' }}
                              >
                                <IconComponent className="w-4 h-4" style={{ color: layerDef.color }} />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{layerDef.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {state.loading ? 'Loading...' : state.error ? `❌ ${state.error}` : state.data ? `✅ ${state.counters.featuresRendered}` : 'Not loaded'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Vetro Polygons */}
                  <div>
                    <h3 className="font-semibold mb-3">Vetro Footprints</h3>
                    <div className="space-y-2">
                      {['polygons'].map(layerKey => {
                        const layerDef = LAYER_DEFINITIONS[layerKey];
                        const state = layerStates[layerKey];
                        const IconComponent = layerDef.icon_component;

                        return (
                          <div key={layerKey} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={state.enabled}
                                onCheckedChange={() => toggleLayer(layerKey)}
                                disabled={state.loading}
                              />
                              <div
                                className="w-6 h-6 rounded flex items-center justify-center"
                                style={{ backgroundColor: layerDef.color + '20' }}
                              >
                                <IconComponent className="w-4 h-4" style={{ color: layerDef.color }} />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{layerDef.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {state.loading ? 'Loading...' : state.error ? `❌ ${state.error}` : state.data ? `✅ ${state.counters.featuresRendered}` : 'Not loaded'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* FCC Coverage Layers */}
                  <div>
                    <h3 className="font-semibold mb-3">FCC Coverage (ME + NH)</h3>
                    <div className="space-y-2">
                      {['fcc_fiber', 'fcc_cable', 'fcc_copper', 'fcc_fixed_wireless', 'fcc_satellite'].map(layerKey => {
                        const layerDef = LAYER_DEFINITIONS[layerKey];
                        const state = layerStates[layerKey];
                        const IconComponent = layerDef.icon_component;

                        return (
                          <div key={layerKey} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <Switch
                                checked={state.enabled}
                                onCheckedChange={() => toggleLayer(layerKey)}
                                disabled={state.loading}
                              />
                              <div
                                className="w-6 h-6 rounded flex items-center justify-center"
                                style={{ backgroundColor: layerDef.color + '20' }}
                              >
                                <IconComponent className="w-4 h-4" style={{ color: layerDef.color }} />
                              </div>
                              <div>
                                <p className="font-medium text-sm">{layerDef.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {state.loading ? 'Loading...' : state.error ? `❌ ${state.error}` : state.data ? `✅ ${state.counters.featuresRendered} hexes` : 'Not loaded'}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="debug">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Debug (Truth Mode) - All Layers</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.keys(LAYER_DEFINITIONS).map(layerKey => {
                    const layerDef = LAYER_DEFINITIONS[layerKey];
                    const state = layerStates[layerKey];

                    return (
                      <div key={layerKey} className="border-2 rounded-lg p-4" style={{ borderColor: layerDef.color }}>
                        <h3 className="font-bold mb-3" style={{ color: layerDef.color }}>
                          {layerDef.name} ({layerDef.type})
                        </h3>

                        {!state.enabled && (
                          <p className="text-sm text-muted-foreground">Layer not enabled</p>
                        )}

                        {state.loading && (
                          <p className="text-sm flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Loading...
                          </p>
                        )}

                        {state.error && (
                          <p className="text-sm text-red-600">❌ {state.error}</p>
                        )}

                        {state.data && (
                          <div className="space-y-3">
                            <div className="bg-[var(--mac-ice)] border border-[var(--mac-panel-border)] p-3 rounded">
                              <h4 className="font-semibold text-sm mb-2">Counters</h4>
                              <div className="text-xs font-mono space-y-1">
                                <div>rowsReturned: <strong>{state.counters.rowsReturned}</strong></div>
                                <div>featuresRendered: <strong className="text-green-600">{state.counters.featuresRendered}</strong></div>
                              </div>
                            </div>

                            <div className="bg-blue-50 border border-blue-200 p-3 rounded">
                              <h4 className="font-semibold text-sm mb-2 text-blue-900">Evidence Fields</h4>
                              <div className="text-xs font-mono space-y-1">
                                <div>
                                  <span className="text-muted-foreground">athena_query_execution_id:</span><br/>
                                  <strong className={`break-all ${state.data.evidence?.athena_query_execution_id ? 'text-green-600' : 'text-red-600'}`}>
                                    {state.data.evidence?.athena_query_execution_id || '❌ NOT FOUND'}
                                  </strong>
                                </div>
                                <div className="mt-2">
                                  <span className="text-muted-foreground">rows_returned:</span> <strong>{state.data.evidence?.rows_returned || state.counters.rowsReturned}</strong>
                                </div>
                                <div className="mt-2">
                                  <span className="text-muted-foreground">generated_sql:</span><br/>
                                  <strong className={`break-all ${state.data.evidence?.generated_sql ? 'text-green-600' : 'text-amber-600'}`}>
                                    {state.data.evidence?.generated_sql ? '✅ CAPTURED' : '⚠️ NOT CAPTURED'}
                                  </strong>
                                </div>
                              </div>
                            </div>

                            <div>
                              <h4 className="font-semibold text-sm mb-2">SQL Executed</h4>
                              <pre className="bg-[var(--mac-ice)] text-[var(--mac-ash)] border border-[var(--mac-panel-border)] p-2 rounded text-[10px] overflow-x-auto">
                                {state.data.sql}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
