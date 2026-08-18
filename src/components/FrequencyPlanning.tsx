import React, { useState, useMemo } from 'react';
import { useAppContext } from '../context/AppContext';
import { Activity, Radio, AlertTriangle, CheckCircle, Search, Edit2, Save, X } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceArea } from 'recharts';

export function FrequencyPlanning() {
  const { sites, links, updateLink } = useAppContext();
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editFreq, setEditFreq] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [bandFilter, setBandFilter] = useState<'all' | 'VHF' | 'UHF'>('all');

  // Helper to get site name
  const getSiteName = (id: string) => sites.find(s => s.id === id)?.name || 'Unknown Site';

  // Check for interference (simple logic)
  const getInterferenceStatus = (linkId: string, freq: number) => {
    let coChannel = 0;
    let adjacentChannel = 0;

    links.forEach(l => {
      if (l.id !== linkId) {
        if (l.frequencyMHz === freq) {
          coChannel++;
        } else if (Math.abs(l.frequencyMHz - freq) <= 0.025) {
          adjacentChannel++;
        }
      }
    });

    if (coChannel > 0) return { status: 'danger', message: `Co-Channel Conflict (${coChannel})` };
    if (adjacentChannel > 0) return { status: 'warning', message: `Adjacent Channel (${adjacentChannel})` };
    return { status: 'clear', message: 'Clear Channel' };
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    return links.map((link, index) => ({
      id: link.id,
      name: `${getSiteName(link.sourceSiteId)} ↔ ${getSiteName(link.targetSiteId)}`,
      x: link.frequencyMHz,
      y: index + 1, // Stagger vertically
      status: getInterferenceStatus(link.id, link.frequencyMHz).status
    }));
  }, [links, sites]);

  const handleSave = (id: string) => {
    const link = links.find(l => l.id === id);
    if (link) {
      updateLink({ ...link, frequencyMHz: editFreq });
    }
    setEditingLinkId(null);
  };

  const filteredLinks = links.filter(link => {
    const name = `${getSiteName(link.sourceSiteId)} ↔ ${getSiteName(link.targetSiteId)}`.toLowerCase();
    const matchesSearch = name.includes(searchTerm.toLowerCase());
    
    let matchesBand = true;
    if (bandFilter === 'VHF') matchesBand = link.frequencyMHz >= 136 && link.frequencyMHz <= 174;
    if (bandFilter === 'UHF') matchesBand = link.frequencyMHz >= 400 && link.frequencyMHz <= 470;
    
    return matchesSearch && matchesBand;
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded shadow-lg border border-slate-700 text-xs">
          <p className="font-bold mb-1">{data.name}</p>
          <p className="text-blue-400">Freq: {data.x} MHz</p>
          <p className="text-slate-400 mt-1 uppercase tracking-wider text-[10px]">
            {data.status === 'danger' ? 'Co-Channel Interference' : data.status === 'warning' ? 'Adjacent Interference' : 'Channel Clear'}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="flex justify-between items-center mb-6 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800">VHF/UHF Frequency Planning</h2>
          <p className="text-sm text-slate-500">Manage channel allocations and detect RF interference across the network.</p>
        </div>
        <div className="flex bg-white rounded-lg shadow-sm border border-slate-300 p-1">
          <button 
            onClick={() => setBandFilter('all')}
            className={`px-4 py-1.5 text-xs font-bold rounded ${bandFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            All Bands
          </button>
          <button 
            onClick={() => setBandFilter('VHF')}
            className={`px-4 py-1.5 text-xs font-bold rounded ${bandFilter === 'VHF' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            VHF (136-174)
          </button>
          <button 
            onClick={() => setBandFilter('UHF')}
            className={`px-4 py-1.5 text-xs font-bold rounded ${bandFilter === 'UHF' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            UHF (400-470)
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
        {/* Spectrum Analyzer Graph */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-300 p-4 flex flex-col h-64 flex-shrink-0">
          <div className="flex items-center mb-2">
            <Activity className="w-4 h-4 text-blue-600 mr-2" />
            <h3 className="font-bold text-slate-800 text-sm">Spectrum Utilization</h3>
          </div>
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="#e2e8f0" />
                <XAxis 
                  type="number" 
                  dataKey="x" 
                  name="Frequency" 
                  unit=" MHz" 
                  domain={bandFilter === 'VHF' ? [135, 175] : bandFilter === 'UHF' ? [390, 480] : ['auto', 'auto']}
                  tick={{ fontSize: 12, fill: '#64748b' }}
                  tickFormatter={(val) => val.toFixed(1)}
                />
                <YAxis 
                  type="number" 
                  dataKey="y" 
                  hide={true} 
                  domain={[0, links.length + 1]}
                />
                <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                
                {/* Visual bands */}
                <ReferenceArea x1={136} x2={174} y1={0} y2={links.length + 1} fill="#eff6ff" fillOpacity={0.5} />
                <ReferenceArea x1={400} x2={470} y1={0} y2={links.length + 1} fill="#eef2ff" fillOpacity={0.5} />
                
                <Scatter 
                  name="Links" 
                  data={chartData.filter(d => bandFilter === 'all' || (bandFilter === 'VHF' && d.x <= 174) || (bandFilter === 'UHF' && d.x >= 400))} 
                  fill="#3b82f6" 
                  shape={(props: any) => {
                    const { cx, cy, payload } = props;
                    let fill = '#10b981'; // Green (Clear)
                    if (payload.status === 'warning') fill = '#f59e0b'; // Amber (Adjacent)
                    if (payload.status === 'danger') fill = '#ef4444'; // Red (Co-Channel)
                    
                    return (
                      <g transform={`translate(${cx},${cy})`}>
                        <line x1={0} y1={-20} x2={0} y2={20} stroke={fill} strokeWidth={2} />
                        <polygon points="0,-24 -4,-18 4,-18" fill={fill} />
                        <circle cx={0} cy={0} r={4} fill={fill} />
                      </g>
                    );
                  }}
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-6 mt-2 text-xs font-medium text-slate-500">
            <div className="flex items-center"><div className="w-3 h-3 bg-emerald-500 rounded-sm mr-2"></div> Clear</div>
            <div className="flex items-center"><div className="w-3 h-3 bg-amber-500 rounded-sm mr-2"></div> Adjacent Channel</div>
            <div className="flex items-center"><div className="w-3 h-3 bg-rose-500 rounded-sm mr-2"></div> Co-Channel Conflict</div>
          </div>
        </div>

        {/* Links Table */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-300 flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div className="relative w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search links..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-100 sticky top-0 z-10 shadow-sm">
                <tr>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">RF Link Path</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Band</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Assigned Frequency (MHz)</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">Status</th>
                  <th className="py-3 px-4 text-xs font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredLinks.length > 0 ? (
                  filteredLinks.map(link => {
                    const status = getInterferenceStatus(link.id, link.frequencyMHz);
                    const isEditing = editingLinkId === link.id;
                    const isVHF = link.frequencyMHz >= 136 && link.frequencyMHz <= 174;
                    const isUHF = link.frequencyMHz >= 400 && link.frequencyMHz <= 470;
                    
                    return (
                      <tr key={link.id} className="hover:bg-slate-50 transition-colors group">
                        <td className="py-3 px-4">
                          <div className="flex items-center">
                            <Radio className="w-4 h-4 text-slate-400 mr-3" />
                            <div>
                              <p className="font-semibold text-slate-800 text-sm">
                                {getSiteName(link.sourceSiteId)} <span className="text-slate-400 mx-1">→</span> {getSiteName(link.targetSiteId)}
                              </p>
                              <p className="text-xs text-slate-400 font-mono">{link.distanceKm.toFixed(1)} km path</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isVHF ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            isUHF ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' :
                            'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}>
                            {isVHF ? 'VHF' : isUHF ? 'UHF' : 'Custom'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          {isEditing ? (
                            <div className="flex items-center max-w-[150px]">
                              <input 
                                type="number" 
                                step="0.0125"
                                value={editFreq}
                                onChange={(e) => setEditFreq(Number(e.target.value))}
                                className="w-full text-sm p-1 border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                                autoFocus
                              />
                            </div>
                          ) : (
                            <span className="font-mono text-sm font-bold text-slate-700">
                              {link.frequencyMHz.toFixed(4)}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className={`flex items-center text-xs font-bold ${
                            status.status === 'danger' ? 'text-rose-600' : 
                            status.status === 'warning' ? 'text-amber-600' : 
                            'text-emerald-600'
                          }`}>
                            {status.status === 'danger' && <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />}
                            {status.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5 mr-1.5" />}
                            {status.status === 'clear' && <CheckCircle className="w-3.5 h-3.5 mr-1.5" />}
                            {status.message}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-1">
                              <button 
                                onClick={() => handleSave(link.id)}
                                className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded bg-emerald-50 border border-emerald-200"
                              >
                                <Save className="w-4 h-4" />
                              </button>
                              <button 
                                onClick={() => setEditingLinkId(null)}
                                className="p-1.5 text-slate-400 hover:bg-slate-100 rounded border border-transparent"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => {
                                setEditingLinkId(link.id);
                                setEditFreq(link.frequencyMHz);
                              }}
                              className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors opacity-0 group-hover:opacity-100"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={5} className="py-12 text-center text-slate-500">
                      <Radio className="w-8 h-8 text-slate-300 mx-auto mb-3" />
                      <p className="font-medium text-slate-600">No links found in this band</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
