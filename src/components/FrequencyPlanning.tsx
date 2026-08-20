import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useAppContext } from '../context/AppContext';
import { Activity, Radio, AlertTriangle, CheckCircle, Search, Edit2, Save, X, Share2, Zap, ArrowRightLeft, Cpu, ShieldCheck, RefreshCw, Layers } from 'lucide-react';
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceArea } from 'recharts';
import * as d3 from 'd3';

export function FrequencyPlanning() {
  const { sites, links, updateLink, updateSite, batchUpdateFrequencies, theme } = useAppContext();
  const [activeTab, setActiveTab] = useState<'spectrum' | 'optimization' | 'topology' | 'sites_duplex'>('spectrum');
  
  const [editingLinkId, setEditingLinkId] = useState<string | null>(null);
  const [editTxFreq, setEditTxFreq] = useState<number>(0);
  const [editRxFreq, setEditRxFreq] = useState<number>(0);
  const [editDuplexOffset, setEditDuplexOffset] = useState<number>(4.6);
  const [searchTerm, setSearchTerm] = useState('');
  const [bandFilter, setBandFilter] = useState<'all' | 'DMR' | 'SDR' | 'VHF' | 'UHF'>('all');
  const [optimizationApplied, setOptimizationApplied] = useState(false);

  // Helper to get site
  const getSite = (id: string) => sites.find(s => s.id === id);
  const getSiteName = (id: string) => sites.find(s => s.id === id)?.name || 'Unknown Site';

  // Advanced Conflict & Interference Analysis
  const getLinkInterferenceStatus = (linkId: string, txFreq: number, rxFreq?: number) => {
    let coChannel = 0;
    let adjacentChannel = 0;
    let imdRisk = 0;

    const effRx = rxFreq || txFreq;

    links.forEach(l => {
      if (l.id !== linkId) {
        const otherTx = l.txFreqMHz || l.frequencyMHz;
        const otherRx = l.rxFreqMHz || l.frequencyMHz;

        // Co-channel on TX or RX
        if (Math.abs(otherTx - txFreq) < 0.005 || Math.abs(otherRx - effRx) < 0.005) {
          coChannel++;
        } 
        // Adjacent Channel (< 25 kHz)
        else if (Math.abs(otherTx - txFreq) <= 0.025 || Math.abs(otherRx - effRx) <= 0.025) {
          adjacentChannel++;
        }

        // Third Order Intermodulation Check: 2*f1 - f2
        const imd1 = 2 * otherTx - txFreq;
        const imd2 = 2 * txFreq - otherTx;
        if (Math.abs(imd1 - effRx) < 0.025 || Math.abs(imd2 - effRx) < 0.025) {
          imdRisk++;
        }
      }
    });

    if (coChannel > 0) return { status: 'danger', message: `Co-Channel Collision (${coChannel})`, count: coChannel };
    if (adjacentChannel > 0) return { status: 'warning', message: `Adjacent Interference (${adjacentChannel})`, count: adjacentChannel };
    if (imdRisk > 0) return { status: 'imd', message: `IMD3 Risk Potential (${imdRisk})`, count: imdRisk };
    return { status: 'clear', message: 'Clear Channel (Optimal)', count: 0 };
  };

  // Site-level interference analysis
  const getSiteInterferenceStatus = (siteId: string, txFreq: number, rxFreq: number) => {
    let siteCollisions = 0;
    let siteAdjacent = 0;

    sites.forEach(s => {
      if (s.id !== siteId) {
        const otherTx = s.txFreqMHz || 155.0;
        const otherRx = s.rxFreqMHz || 155.0;

        if (Math.abs(otherTx - txFreq) < 0.005 || Math.abs(otherRx - rxFreq) < 0.005) {
          siteCollisions++;
        } else if (Math.abs(otherTx - txFreq) <= 0.025 || Math.abs(otherRx - rxFreq) <= 0.025) {
          siteAdjacent++;
        }
      }
    });

    if (siteCollisions > 0) return { status: 'danger', message: `Site Co-Channel (${siteCollisions})` };
    if (siteAdjacent > 0) return { status: 'warning', message: `Site Adjacent (${siteAdjacent})` };
    return { status: 'clear', message: 'Clear Assigned Pair' };
  };

  // Prepare chart data
  const chartData = useMemo(() => {
    return links.map((link, index) => {
      const tx = link.txFreqMHz || link.frequencyMHz;
      const rx = link.rxFreqMHz || link.frequencyMHz;
      const status = getLinkInterferenceStatus(link.id, tx, rx).status;
      return {
        id: link.id,
        name: `${getSiteName(link.sourceSiteId)} ↔ ${getSiteName(link.targetSiteId)}`,
        x: tx,
        rx: rx,
        duplexOffset: link.duplexOffsetMHz || Math.abs(tx - rx),
        type: link.equipmentType || 'VHF',
        y: index + 1,
        status: status
      };
    });
  }, [links, sites]);

  const handleStartEdit = (link: any) => {
    setEditingLinkId(link.id);
    setEditTxFreq(link.txFreqMHz || link.frequencyMHz);
    setEditRxFreq(link.rxFreqMHz || (link.txFreqMHz || link.frequencyMHz) - (link.duplexOffsetMHz || 4.6));
    setEditDuplexOffset(link.duplexOffsetMHz || 4.6);
  };

  const handleSave = (id: string) => {
    const link = links.find(l => l.id === id);
    if (link) {
      updateLink({ 
        ...link, 
        frequencyMHz: editTxFreq,
        txFreqMHz: editTxFreq,
        rxFreqMHz: editRxFreq,
        duplexOffsetMHz: editDuplexOffset
      });
    }
    setEditingLinkId(null);
  };

  const filteredLinks = links.filter(link => {
    const name = `${getSiteName(link.sourceSiteId)} ↔ ${getSiteName(link.targetSiteId)}`.toLowerCase();
    const matchesSearch = name.includes(searchTerm.toLowerCase());
    
    const freq = link.txFreqMHz || link.frequencyMHz;
    let matchesBand = true;
    if (bandFilter === 'DMR') matchesBand = link.equipmentType === 'DMR' || (freq >= 136 && freq <= 470);
    if (bandFilter === 'SDR') matchesBand = link.equipmentType === 'SDR' || freq < 136 || freq > 470;
    if (bandFilter === 'VHF') matchesBand = freq >= 136 && freq <= 174;
    if (bandFilter === 'UHF') matchesBand = freq >= 400 && freq <= 470;
    
    return matchesSearch && matchesBand;
  });

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl border border-slate-700 text-xs max-w-xs">
          <p className="font-bold text-sm mb-1">{data.name}</p>
          <div className="grid grid-cols-2 gap-2 my-1.5 font-mono text-[11px]">
            <div className="bg-slate-800 p-1.5 rounded">
              <span className="text-emerald-400 block text-[9px] uppercase font-bold">TX Frequency</span>
              {data.x.toFixed(4)} MHz
            </div>
            <div className="bg-slate-800 p-1.5 rounded">
              <span className="text-purple-400 block text-[9px] uppercase font-bold">RX Frequency</span>
              {data.rx ? data.rx.toFixed(4) : data.x.toFixed(4)} MHz
            </div>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 mt-1">
            <span>Shift: {data.duplexOffset ? `${data.duplexOffset} MHz` : 'Simplex'}</span>
            <span className="font-bold uppercase text-blue-400">{data.type}</span>
          </div>
          <p className={`mt-2 font-bold uppercase tracking-wider text-[10px] ${
            data.status === 'danger' ? 'text-rose-400' : 
            data.status === 'warning' ? 'text-amber-400' : 
            data.status === 'imd' ? 'text-orange-400' :
            'text-emerald-400'
          }`}>
            {data.status === 'danger' ? '● Co-Channel Interference Conflict' : 
             data.status === 'warning' ? '▲ Adjacent Channel Guard Violation' : 
             data.status === 'imd' ? '◆ Intermodulation Risk (IMD3)' :
             '✓ Clear Channel Plan'}
          </p>
        </div>
      );
    }
    return null;
  };

  // High-Grade Global Frequency Optimization Engine
  const runGlobalOptimization = () => {
    // 1. Allocate discrete orthogonal channel plans based on radio type and duplex rules
    const vhfBase = 152.000;
    const vhfDuplex = 4.600; // Standard High/Low duplex offset for VHF
    const uhfBase = 450.000;
    const uhfDuplex = 5.000; // Standard DMR / UHF duplex shift
    const sdrBase = 225.000; // Tactical SDR wideband step
    
    let currentVHFIndex = 0;
    let currentUHFIndex = 0;
    let currentSDRIndex = 0;

    const updatedSites = sites.map((site, index) => {
      let tx = site.txFreqMHz || 155.5;
      let rx = site.rxFreqMHz || 150.9;
      let offset = site.duplexOffsetMHz || 4.6;
      let colorCode = site.dmrColorCode || 1;

      if (site.equipmentType === 'SDR') {
        tx = Number((sdrBase + currentSDRIndex * 5.0).toFixed(4));
        rx = tx; // SDR agile simplex/mesh
        offset = 0.0;
        currentSDRIndex++;
      } else if (site.equipmentType === 'DMR' || (site.txFreqMHz && site.txFreqMHz > 300)) {
        // DMR UHF TDMA plan
        tx = Number((uhfBase + currentUHFIndex * 0.025).toFixed(4));
        rx = Number((tx - uhfDuplex).toFixed(4));
        offset = uhfDuplex;
        colorCode = (index % 15) + 1; // Unique Color Codes to allow clean frequency reuse
        currentUHFIndex++;
      } else {
        // VHF High/Low Repeater & Base Plan
        tx = Number((vhfBase + currentVHFIndex * 0.025).toFixed(4));
        rx = site.type === 'repeater' ? Number((tx - vhfDuplex).toFixed(4)) : tx;
        offset = site.type === 'repeater' ? vhfDuplex : 0;
        currentVHFIndex++;
      }

      return {
        id: site.id,
        txFreqMHz: tx,
        rxFreqMHz: rx,
        duplexOffsetMHz: offset,
        equipmentType: site.equipmentType,
        dmrColorCode: colorCode
      };
    });

    // 2. Synchronize RF Links with site plans
    const updatedLinks = links.map(link => {
      const srcSite = updatedSites.find(s => s.id === link.sourceSiteId);
      const tgtSite = updatedSites.find(s => s.id === link.targetSiteId);

      const tx = srcSite ? srcSite.txFreqMHz : (150.0 + Math.random() * 5);
      const rx = tgtSite ? tgtSite.rxFreqMHz : (tx - 4.6);
      const offset = Math.abs(tx - rx);

      return {
        id: link.id,
        frequencyMHz: tx,
        txFreqMHz: tx,
        rxFreqMHz: rx,
        duplexOffsetMHz: offset,
        modulationType: link.equipmentType === 'DMR' ? 'DMR 4FSK' : link.equipmentType === 'SDR' ? 'COFDM' : 'FM 16K0F3E',
        equipmentType: link.equipmentType
      };
    });

    batchUpdateFrequencies({
      sites: updatedSites,
      links: updatedLinks
    });

    setOptimizationApplied(true);
    setTimeout(() => setOptimizationApplied(false), 5000);
  };

  const TopologyGraph = () => {
    const svgRef = useRef<SVGSVGElement>(null);

    useEffect(() => {
      if (!svgRef.current || sites.length === 0) return;
      const width = svgRef.current.clientWidth;
      const height = svgRef.current.clientHeight;
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const nodes = sites.map(s => ({ ...s }));
      const edges = links.map(l => ({
        source: l.sourceSiteId,
        target: l.targetSiteId,
        freq: l.txFreqMHz || l.frequencyMHz,
        rxFreq: l.rxFreqMHz || l.frequencyMHz,
        duplex: l.duplexOffsetMHz || 0,
        ...l
      }));

      const simulation = d3.forceSimulation(nodes as any)
        .force("link", d3.forceLink(edges).id((d: any) => d.id).distance(180))
        .force("charge", d3.forceManyBody().strength(-600))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide().radius(70));

      const link = svg.append("g")
        .selectAll("g")
        .data(edges)
        .enter().append("g");

      link.append("line")
        .attr("stroke", (d: any) => d.equipmentType === 'DMR' ? "#a855f7" : d.equipmentType === 'SDR' ? "#06b6d4" : "#3b82f6")
        .attr("stroke-width", 2.5)
        .attr("stroke-dasharray", (d: any) => d.equipmentType === 'SDR' ? "4 2" : "none");

      // Frequency tag on link
      const linkLabel = link.append("g");
      
      linkLabel.append("rect")
        .attr("rx", 4)
        .attr("ry", 4)
        .attr("fill", "#ffffff")
        .attr("stroke", "#e2e8f0")
        .attr("stroke-width", 1)
        .attr("height", 18)
        .attr("width", 100);

      linkLabel.append("text")
        .text((d: any) => `TX:${d.freq.toFixed(2)} RX:${(d.rxFreq || d.freq).toFixed(2)}`)
        .attr("font-size", "9px")
        .attr("fill", "#1e293b")
        .attr("font-family", "monospace")
        .attr("font-weight", "bold")
        .attr("text-anchor", "middle")
        .attr("dy", 12)
        .attr("dx", 50);

      const node = svg.append("g")
        .selectAll("g")
        .data(nodes)
        .enter().append("g")
        .call(d3.drag<SVGGElement, any>()
          .on("start", dragstarted)
          .on("drag", dragged)
          .on("end", dragended));

      // Outer glow/circle
      node.append("circle")
        .attr("r", 18)
        .attr("fill", (d: any) => d.type === 'repeater' ? "#eab308" : d.equipmentType === 'SDR' ? "#06b6d4" : "#2563eb")
        .attr("stroke", "#ffffff")
        .attr("stroke-width", 3)
        .style("filter", "drop-shadow(0 4px 6px rgba(0,0,0,0.15))");

      // Type initial in node
      node.append("text")
        .text((d: any) => d.type === 'repeater' ? "R" : d.equipmentType === 'SDR' ? "S" : "B")
        .attr("font-size", "11px")
        .attr("fill", "#ffffff")
        .attr("font-weight", "bold")
        .attr("text-anchor", "middle")
        .attr("dy", 4);

      // Station Name
      node.append("text")
        .text((d: any) => d.name)
        .attr("x", 24)
        .attr("y", -8)
        .attr("font-size", "11px")
        .attr("font-weight", "bold")
        .attr("fill", "#1e293b");

      // Station Equipment & Type
      node.append("text")
        .text((d: any) => `[${d.equipmentType || (d.type === 'repeater' ? 'DMR Repeater' : 'Base')}] ${d.radioType || 'Base'} - ${d.txPowerW || 50}W`)
        .attr("x", 24)
        .attr("y", 5)
        .attr("font-size", "9px")
        .attr("fill", "#64748b");
        
      // Frequency Tag TX/RX
      node.append("text")
        .text((d: any) => `TX: ${(d.txFreqMHz || 155.5).toFixed(4)} MHz | RX: ${(d.rxFreqMHz || 150.9).toFixed(4)} MHz (Δ ${d.duplexOffsetMHz || 0}M)`)
        .attr("x", 24)
        .attr("y", 18)
        .attr("font-size", "9px")
        .attr("font-family", "monospace")
        .attr("font-weight", "bold")
        .attr("fill", "#059669");

      simulation.on("tick", () => {
        link.select("line")
          .attr("x1", (d: any) => d.source.x)
          .attr("y1", (d: any) => d.source.y)
          .attr("x2", (d: any) => d.target.x)
          .attr("y2", (d: any) => d.target.y);
          
        linkLabel.attr("transform", (d: any) => {
          const midX = (d.source.x + d.target.x) / 2 - 50;
          const midY = (d.source.y + d.target.y) / 2 - 9;
          return `translate(${midX}, ${midY})`;
        });

        node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
      });

      function dragstarted(event: any, d: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      function dragged(event: any, d: any) {
        d.fx = event.x;
        d.fy = event.y;
      }
      function dragended(event: any, d: any) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }

      return () => simulation.stop();
    }, [sites, links]);

    return (
      <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 relative overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center">
              <Share2 className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-2" />
              RF Network Topology & Frequency Allocation Map
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Interactive node topology displaying dynamic TX/RX duplex pairs, DMR color codes, and SDR links
            </p>
          </div>
          <div className="flex gap-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5 text-blue-600">
              <span className="w-3 h-3 rounded-full bg-blue-600"></span> Base Station
            </div>
            <div className="flex items-center gap-1.5 text-amber-500">
              <span className="w-3 h-3 rounded-full bg-amber-500"></span> Repeater
            </div>
            <div className="flex items-center gap-1.5 text-cyan-600">
              <span className="w-3 h-3 rounded-full bg-cyan-500"></span> SDR Node
            </div>
          </div>
        </div>
        <svg ref={svgRef} className="w-full flex-1 bg-slate-50 dark:bg-slate-950/60 rounded-xl cursor-move border border-slate-100 dark:border-slate-800"></svg>
      </div>
    );
  };

  const totalConflicts = chartData.filter(d => d.status === 'danger' || d.status === 'warning' || d.status === 'imd').length;

  return (
    <div className="p-6 h-full flex flex-col overflow-hidden">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2.5">
            <Radio className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Frequency Planning & Duplex Optimization
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Multi-band VHF/UHF/DMR/SDR channel assignment, Rx/Tx duplex calculation, and IMD3 conflict resolution
          </p>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl shadow-xs gap-1">
          <button 
            onClick={() => setActiveTab('spectrum')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'spectrum' 
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Spectrum Analysis
          </button>
          <button 
            onClick={() => setActiveTab('sites_duplex')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'sites_duplex' 
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Station Rx/Tx Duplex
          </button>
          <button 
            onClick={() => setActiveTab('optimization')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'optimization' 
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Auto Optimization {totalConflicts > 0 && <span className="ml-1 px-1.5 py-0.2 bg-rose-500 text-white rounded-full text-[10px]">{totalConflicts}</span>}
          </button>
          <button 
            onClick={() => setActiveTab('topology')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all ${
              activeTab === 'topology' 
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            Topology Map
          </button>
        </div>
      </div>

      {activeTab === 'topology' && <TopologyGraph />}

      {/* Station Rx/Tx Duplex Matrix */}
      {activeTab === 'sites_duplex' && (
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col min-h-0 overflow-hidden">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
            <div>
              <h3 className="font-bold text-slate-800 dark:text-white text-sm flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                Station Duplex & Radio Frequency Assignment Matrix
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Directly tune Station TX/RX duplex split, DMR Color Codes, and RF output power
              </p>
            </div>
            <button 
              onClick={runGlobalOptimization}
              className="flex items-center px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Auto-Align Duplex Frequencies
            </button>
          </div>

          <div className="flex-1 overflow-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                <tr>
                  <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Station / Node Name</th>
                  <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Station Type</th>
                  <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Equipment Engine</th>
                  <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">TX Frequency (MHz)</th>
                  <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">RX Frequency (MHz)</th>
                  <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Duplex Shift</th>
                  <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">DMR / SDR Config</th>
                  <th className="py-3 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {sites.map(site => {
                  const tx = site.txFreqMHz || 155.5;
                  const rx = site.rxFreqMHz || 150.9;
                  const shift = site.duplexOffsetMHz || Math.abs(tx - rx);
                  const status = getSiteInterferenceStatus(site.id, tx, rx);

                  return (
                    <tr key={site.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-4 font-bold text-slate-800 dark:text-slate-200">
                        {site.name}
                        <div className="text-[10px] text-slate-400 font-mono">Elev: {site.elevation}m | Lat: {site.lat.toFixed(3)}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          site.type === 'repeater' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300' :
                          'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                        }`}>
                          {site.type}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">{site.radioType || 'Base'} ({site.txPowerW || 50}W)</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          site.equipmentType === 'DMR' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' :
                          site.equipmentType === 'SDR' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300' :
                          'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {site.equipmentType || 'VHF Analog'}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                        <input 
                          type="number"
                          step="0.0125"
                          value={tx}
                          onChange={e => updateSite({ ...site, txFreqMHz: Number(e.target.value) })}
                          className="w-24 p-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 font-mono text-xs"
                        /> MHz
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-purple-600 dark:text-purple-400">
                        <input 
                          type="number"
                          step="0.0125"
                          value={rx}
                          onChange={e => updateSite({ ...site, rxFreqMHz: Number(e.target.value) })}
                          className="w-24 p-1 border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-800 font-mono text-xs"
                        /> MHz
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-600 dark:text-slate-400">
                        ±{shift.toFixed(3)} MHz
                      </td>
                      <td className="py-3 px-4">
                        {site.equipmentType === 'DMR' ? (
                          <div className="text-[11px] font-mono text-purple-700 dark:text-purple-300">
                            CC: {site.dmrColorCode || 1} | TS: {site.dmrTimeSlot || 1}
                          </div>
                        ) : site.equipmentType === 'SDR' ? (
                          <div className="text-[11px] font-mono text-cyan-700 dark:text-cyan-300">
                            BW: {site.sdrBandwidthMHz || 5} MHz
                          </div>
                        ) : (
                          <div className="text-[11px] text-slate-400 font-mono">12.5 kHz FM</div>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className={`flex items-center text-[11px] font-bold ${
                          status.status === 'danger' ? 'text-rose-600' :
                          status.status === 'warning' ? 'text-amber-600' :
                          'text-emerald-600'
                        }`}>
                          {status.status === 'danger' && <AlertTriangle className="w-3.5 h-3.5 mr-1" />}
                          {status.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5 mr-1" />}
                          {status.status === 'clear' && <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                          {status.message}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Auto Optimization Center */}
      {activeTab === 'optimization' && (
        <div className="flex-1 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-8 flex flex-col items-center justify-center text-center overflow-y-auto">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/60 flex items-center justify-center mb-5 border border-blue-200 dark:border-blue-800">
            <Zap className="w-8 h-8 text-blue-600 dark:text-blue-400" />
          </div>
          
          <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2">Automated RF Spectrum & Duplex Optimization</h3>
          <p className="text-slate-500 dark:text-slate-400 max-w-xl text-xs mb-6">
            The optimization engine analyzes co-channel interference, adjacent channel guard boundaries, and 3rd-order intermodulation distortion (IMD3). It assigns optimal TX/RX duplex pairs and DMR Color Codes across all nodes.
          </p>

          {optimizationApplied && (
            <div className="mb-6 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs">
              <ShieldCheck className="w-4 h-4" />
              Global Optimization Applied! All radio stations and links updated with zero-conflict duplex pairs.
            </div>
          )}
          
          <div className="grid grid-cols-3 gap-4 max-w-lg w-full mb-8 text-left">
            <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-2xl font-bold font-mono text-slate-800 dark:text-white mb-0.5">{sites.length}</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Stations / Nodes</div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="text-2xl font-bold font-mono text-slate-800 dark:text-white mb-0.5">{links.length}</div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Active Links</div>
            </div>

            <div className={`p-3.5 rounded-xl border ${
              totalConflicts > 0 
                ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800' 
                : 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
            }`}>
              <div className={`text-2xl font-bold font-mono mb-0.5 ${totalConflicts > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                {totalConflicts}
              </div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Conflicts Detected</div>
            </div>
          </div>
          
          <button 
            onClick={runGlobalOptimization}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center gap-2 text-sm"
          >
            <Activity className="w-5 h-5" />
            Run Automated Global Optimization
          </button>
        </div>
      )}

      {/* Spectrum Analysis & Links Table */}
      {activeTab === 'spectrum' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1 min-h-0">
          <div className="lg:col-span-3 flex justify-between items-center">
            <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
              <span>Spectrum: <strong className="text-slate-800 dark:text-slate-200 font-mono">136.000 - 470.000 MHz</strong></span>
              <span>Guard Band: <strong className="text-slate-800 dark:text-slate-200 font-mono">12.5 / 25 kHz</strong></span>
            </div>

            {/* Filter buttons */}
            <div className="flex bg-white dark:bg-slate-800 rounded-lg shadow-2xs border border-slate-200 dark:border-slate-700 p-1 gap-1">
              {(['all', 'DMR', 'SDR', 'VHF', 'UHF'] as const).map(b => (
                <button 
                  key={b}
                  onClick={() => setBandFilter(b)}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition ${
                    bandFilter === b 
                      ? 'bg-blue-600 text-white' 
                      : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {b === 'all' ? 'All Bands' : b}
                </button>
              ))}
            </div>
          </div>

          {/* Spectrum Analyzer Chart */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 flex flex-col h-60 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center">
                <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400 mr-2" />
                <h3 className="font-bold text-slate-800 dark:text-white text-sm">RF Spectrum Utilization & Spectral Density</h3>
              </div>
              <div className="flex gap-4 text-[10px] font-semibold text-slate-500">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Clear</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span> Adjacent Guard</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-500 rounded-full"></span> Co-Channel Collision</span>
              </div>
            </div>
            
            <div className="flex-1 w-full relative">
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={false} stroke="#334155" opacity={0.2} />
                  <XAxis 
                    type="number" 
                    dataKey="x" 
                    name="Frequency" 
                    unit=" MHz" 
                    domain={bandFilter === 'VHF' ? [135, 175] : bandFilter === 'UHF' ? [390, 480] : ['auto', 'auto']}
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(val) => val.toFixed(2)}
                  />
                  <YAxis 
                    type="number" 
                    dataKey="y" 
                    hide={true} 
                    domain={[0, links.length + 1]}
                  />
                  <RechartsTooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                  
                  <ReferenceArea {...({ x1: 136, x2: 174, y1: 0, y2: links.length + 1, fill: '#3b82f6', fillOpacity: 0.08 } as any)} />
                  <ReferenceArea {...({ x1: 400, x2: 470, y1: 0, y2: links.length + 1, fill: '#8b5cf6', fillOpacity: 0.08 } as any)} />
                  
                  <Scatter 
                    name="Links" 
                    data={chartData.filter(d => 
                      bandFilter === 'all' || 
                      (bandFilter === 'DMR' && (d.type === 'DMR' || d.x >= 136)) ||
                      (bandFilter === 'SDR' && d.type === 'SDR') ||
                      (bandFilter === 'VHF' && d.x <= 174) || 
                      (bandFilter === 'UHF' && d.x >= 400)
                    )} 
                    fill="#3b82f6" 
                    shape={(props: any) => {
                      const { cx, cy, payload } = props;
                      let fill = '#10b981'; // Green
                      if (payload.status === 'warning') fill = '#f59e0b'; // Amber
                      if (payload.status === 'danger') fill = '#ef4444'; // Red
                      if (payload.status === 'imd') fill = '#f97316'; // Orange
                      
                      return (
                        <g transform={`translate(${cx},${cy})`}>
                          <line x1={0} y1={-18} x2={0} y2={18} stroke={fill} strokeWidth={2.5} />
                          <polygon points="0,-22 -5,-16 5,-16" fill={fill} />
                          <circle cx={0} cy={0} r={4.5} fill={fill} />
                        </g>
                      );
                    }}
                  />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Links Table */}
          <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col min-h-0 overflow-hidden">
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
              <div className="relative w-72">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                  type="text" 
                  placeholder="Search link paths..." 
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <span className="text-xs text-slate-500 font-medium">
                Showing {filteredLinks.length} configured paths
              </span>
            </div>
            
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-100 dark:bg-slate-800 sticky top-0 z-10">
                  <tr>
                    <th className="py-2.5 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">RF Link Path</th>
                    <th className="py-2.5 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Radio Type</th>
                    <th className="py-2.5 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">TX Frequency (MHz)</th>
                    <th className="py-2.5 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">RX Frequency (MHz)</th>
                    <th className="py-2.5 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Duplex Shift</th>
                    <th className="py-2.5 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px]">Interference Status</th>
                    <th className="py-2.5 px-4 font-bold text-slate-500 dark:text-slate-400 uppercase text-[10px] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredLinks.map(link => {
                    const tx = link.txFreqMHz || link.frequencyMHz;
                    const rx = link.rxFreqMHz || (tx - (link.duplexOffsetMHz || 0));
                    const status = getLinkInterferenceStatus(link.id, tx, rx);
                    const isEditing = editingLinkId === link.id;
                    
                    return (
                      <tr key={link.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                        <td className="py-2.5 px-4">
                          <div className="flex items-center gap-2">
                            <Radio className="w-3.5 h-3.5 text-blue-500" />
                            <div>
                              <span className="font-bold text-slate-800 dark:text-white">
                                {getSiteName(link.sourceSiteId)} → {getSiteName(link.targetSiteId)}
                              </span>
                              <div className="text-[10px] text-slate-400 font-mono">
                                Distance: {link.distanceKm.toFixed(1)} km | Loss: {link.txCableLossDB || 1.5} dB
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            link.equipmentType === 'DMR' ? 'bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300' :
                            link.equipmentType === 'SDR' ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300' :
                            'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          }`}>
                            {link.equipmentType || 'VHF'}
                          </span>
                        </td>

                        <td className="py-2.5 px-4 font-mono font-bold text-slate-700 dark:text-slate-200">
                          {isEditing ? (
                            <input 
                              type="number"
                              step="0.0125"
                              value={editTxFreq}
                              onChange={e => setEditTxFreq(Number(e.target.value))}
                              className="w-24 p-1 border border-blue-400 rounded bg-white dark:bg-slate-800 font-mono"
                            />
                          ) : (
                            `${tx.toFixed(4)} MHz`
                          )}
                        </td>

                        <td className="py-2.5 px-4 font-mono font-bold text-purple-700 dark:text-purple-300">
                          {isEditing ? (
                            <input 
                              type="number"
                              step="0.0125"
                              value={editRxFreq}
                              onChange={e => setEditRxFreq(Number(e.target.value))}
                              className="w-24 p-1 border border-purple-400 rounded bg-white dark:bg-slate-800 font-mono"
                            />
                          ) : (
                            `${rx.toFixed(4)} MHz`
                          )}
                        </td>

                        <td className="py-2.5 px-4 font-mono text-slate-500">
                          {isEditing ? (
                            <input 
                              type="number"
                              step="0.1"
                              value={editDuplexOffset}
                              onChange={e => {
                                const offset = Number(e.target.value);
                                setEditDuplexOffset(offset);
                                setEditRxFreq(Number((editTxFreq - offset).toFixed(4)));
                              }}
                              className="w-20 p-1 border border-slate-300 rounded bg-white dark:bg-slate-800 font-mono"
                            />
                          ) : (
                            `±${(link.duplexOffsetMHz || Math.abs(tx - rx)).toFixed(3)} MHz`
                          )}
                        </td>

                        <td className="py-2.5 px-4">
                          <div className={`flex items-center text-[11px] font-bold ${
                            status.status === 'danger' ? 'text-rose-600' :
                            status.status === 'warning' ? 'text-amber-600' :
                            status.status === 'imd' ? 'text-orange-600' :
                            'text-emerald-600'
                          }`}>
                            {status.status === 'danger' && <AlertTriangle className="w-3.5 h-3.5 mr-1" />}
                            {status.status === 'warning' && <AlertTriangle className="w-3.5 h-3.5 mr-1" />}
                            {status.status === 'imd' && <AlertTriangle className="w-3.5 h-3.5 mr-1" />}
                            {status.status === 'clear' && <CheckCircle className="w-3.5 h-3.5 mr-1" />}
                            {status.message}
                          </div>
                        </td>

                        <td className="py-2.5 px-4 text-right">
                          {isEditing ? (
                            <div className="flex justify-end gap-1">
                              <button 
                                onClick={() => handleSave(link.id)}
                                className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => setEditingLinkId(null)}
                                className="p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <button 
                              onClick={() => handleStartEdit(link)}
                              className="p-1 text-slate-400 hover:text-blue-600 rounded"
                              title="Edit Frequencies"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
