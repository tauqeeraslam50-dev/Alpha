import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useAppContext } from '../context/AppContext';
import { Mountain } from 'lucide-react';

export function TerrainProfile() {
  const { links, sites } = useAppContext();
  const [selectedLinkId, setSelectedLinkId] = useState<string>(links[0]?.id || '');
  
  const activeLink = links.find(l => l.id === selectedLinkId);
  const source = sites.find(s => s.id === activeLink?.sourceSiteId);
  const target = sites.find(s => s.id === activeLink?.targetSiteId);

  // Generate mock terrain data between the two sites based on their elevations
  const generateTerrainData = () => {
    if (!source || !target || !activeLink) return [];
    
    const points = 50;
    const data = [];
    const distStep = activeLink.distanceKm / points;
    
    for (let i = 0; i <= points; i++) {
      const distance = Number((i * distStep).toFixed(2));
      // Interpolate base elevation
      let elevation = source.elevation + (target.elevation - source.elevation) * (i / points);
      
      // Add random mountainous noise if in middle
      if (i > 5 && i < 45) {
        const noise = Math.sin(i / 5) * 100 + Math.random() * 50;
        elevation += noise;
      }
      
      data.push({
        distance,
        elevation: Math.max(0, Number(elevation.toFixed(1))),
        los: source.elevation + 20 + ((target.elevation + 20) - (source.elevation + 20)) * (i / points) // Line of sight with 20m towers
      });
    }
    return data;
  };

  const data = generateTerrainData();

  return (
    <div className="p-6 h-full flex flex-col">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
        <Mountain className="w-6 h-6 mr-3 text-blue-600" />
        Terrain & Path Profile
      </h2>
      
      <div className="flex gap-4 mb-6">
        <select 
          value={selectedLinkId} 
          onChange={e => setSelectedLinkId(e.target.value)}
          className="bg-white border border-slate-300 shadow-sm text-slate-800 text-sm rounded focus:ring-blue-500 focus:border-blue-500 block p-2.5"
        >
          {links.map(l => {
            const s = sites.find(site => site.id === l.sourceSiteId)?.name;
            const t = sites.find(site => site.id === l.targetSiteId)?.name;
            return <option key={l.id} value={l.id}>{s} ↔ {t}</option>;
          })}
        </select>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-300 p-5 min-h-[400px] flex flex-col">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2">Elevation Profile (Mock Data) with Fresnel Zone clearance indication</h3>
        <div className="flex-1 bg-slate-50 rounded border border-slate-200 relative overflow-hidden p-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis 
                dataKey="distance" 
                stroke="#64748b" 
                tick={{fill: '#64748b', fontSize: 12}} 
                unit=" km"
              />
              <YAxis 
                stroke="#64748b" 
                tick={{fill: '#64748b', fontSize: 12}}
                unit=" m" 
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', color: '#1e293b' }}
                itemStyle={{ color: '#2563eb' }}
              />
              <Area 
                type="monotone" 
                dataKey="elevation" 
                stroke="#94a3b8" 
                fill="#cbd5e1" 
                name="Terrain Elevation"
              />
              <Area 
                type="monotone" 
                dataKey="los" 
                stroke="#3b82f6" 
                fill="transparent" 
                strokeDasharray="5 5"
                name="Line of Sight (20m Towers)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
