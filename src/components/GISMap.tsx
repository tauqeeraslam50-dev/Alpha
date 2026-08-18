import React, { useRef, useEffect, useState } from 'react';
import { useAppContext } from '../context/AppContext';

export function GISMap() {
  const { sites, links } = useAppContext();
  const svgRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (svgRef.current) {
      const { width, height } = svgRef.current.getBoundingClientRect();
      setDimensions({ width, height });
    }
  }, []);

  // Normalize lat/lng to SVG coordinates
  const minLat = Math.min(...sites.map(s => s.lat));
  const maxLat = Math.max(...sites.map(s => s.lat));
  const minLng = Math.min(...sites.map(s => s.lng));
  const maxLng = Math.max(...sites.map(s => s.lng));

  const padding = 50;
  
  const getX = (lng: number) => {
    if (maxLng === minLng) return dimensions.width / 2;
    return padding + ((lng - minLng) / (maxLng - minLng)) * (dimensions.width - padding * 2);
  };
  
  const getY = (lat: number) => {
    if (maxLat === minLat) return dimensions.height / 2;
    // SVG Y is inverted
    return dimensions.height - (padding + ((lat - minLat) / (maxLat - minLat)) * (dimensions.height - padding * 2));
  };

  return (
    <div className="flex flex-col h-full bg-transparent p-6 relative">
      <div className="absolute top-10 right-10 bg-white/90 backdrop-blur border border-slate-200 p-4 rounded-lg z-10 shadow-sm">
        <h3 className="text-slate-800 font-semibold mb-2 text-xs uppercase tracking-widest">GIS Topology</h3>
        <div className="flex flex-col gap-2 text-sm text-slate-600">
          <div className="flex items-center"><div className="w-3 h-3 bg-blue-600 rounded-full mr-2 shadow-sm"></div>Base Station</div>
          <div className="flex items-center"><div className="w-3 h-3 bg-indigo-500 rounded-sm mr-2 shadow-sm"></div>Repeater</div>
          <div className="flex items-center"><div className="w-3 h-0.5 bg-emerald-500 mr-2 shadow-sm"></div>Good Link</div>
        </div>
      </div>

      <div className="flex-1 bg-white rounded-xl shadow-lg border border-slate-300 overflow-hidden" style={{ minHeight: '400px' }}>
        <div className="h-10 bg-slate-50 border-b border-slate-200 flex items-center px-4 justify-between">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Interactive Topology Map</span>
          <div className="flex gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
            <div className="h-2 w-2 rounded-full bg-amber-500"></div>
            <div className="h-2 w-2 rounded-full bg-rose-500"></div>
          </div>
        </div>
        <svg ref={svgRef} className="w-full h-[calc(100%-40px)] bg-[#f8fafc]" style={{ backgroundImage: 'radial-gradient(#cbd5e1 1px, transparent 1px)', backgroundSize: '20px 20px' }}>
          {/* Draw Links */}
          {links.map(link => {
            const source = sites.find(s => s.id === link.sourceSiteId);
            const target = sites.find(s => s.id === link.targetSiteId);
            if (!source || !target) return null;
            return (
              <line
                key={link.id}
                x1={getX(source.lng)}
                y1={getY(source.lat)}
                x2={getX(target.lng)}
                y2={getY(target.lat)}
                stroke="#10b981"
                strokeWidth="2"
                strokeDasharray="4 4"
                className="animate-pulse"
              />
            );
          })}
          
          {/* Draw Sites */}
          {sites.map(site => (
            <g key={site.id} transform={`translate(${getX(site.lng)},${getY(site.lat)})`}>
              {site.type === 'repeater' ? (
                <rect x="-8" y="-8" width="16" height="16" fill="#6366f1" stroke="#ffffff" strokeWidth="2" className="drop-shadow-md" />
              ) : (
                <circle r="8" fill="#2563eb" stroke="#ffffff" strokeWidth="2" className="drop-shadow-md" />
              )}
              <rect x="12" y="-10" width={site.name.length * 7} height="18" fill="#1e293b" rx="4" />
              <text x="16" y="2" fill="#ffffff" fontSize="10" fontWeight="500" className="pointer-events-none">
                {site.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
